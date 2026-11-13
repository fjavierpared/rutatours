/**
 * Cálculo de precios de una ruta (USD) y su conversión a VES.
 *
 * Funciones puras: no tocan la base de datos ni la interfaz. Se usan en el
 * backend (cotizar, agendar, pagar) y se prueban en test/calculoPrecios.test.js.
 *
 * ------------------------------------------------------------------------
 * FÓRMULA
 * ------------------------------------------------------------------------
 *   costo_grupo = Σ costos 'grupo'                       (transporte, guía, permisos...)
 *               + Σ unidades elegidas para N personas    (habitaciones: combinación más barata)
 *               + Σ costos 'persona' × N                 (entradas, comidas, seguro...)
 *
 *   acumulado = costo_grupo
 *   por cada cargo % con aplica = 'siempre', en orden:
 *       base   = (cargo.base === 'costo') ? costo_grupo : acumulado
 *       monto  = base × porcentaje
 *       acumulado += monto
 *
 *   precio_por_persona = redondeo(acumulado / N)        (redondeo comercial configurable)
 *   total_grupo        = precio_por_persona × N
 *   abono_minimo       = total_grupo × abono_pct
 *
 *   Los cargos con aplica = 'pago_divisas' (IGTF) NO entran en la cotización:
 *   se calculan al pagar, sobre el monto pagado, solo si el método de pago lo aplica.
 *
 *   VES = USD × tasa BCV vigente.
 *
 * Ejemplo (ruta Eje Panamericano, N = 10, ganancia 25% sobre costo, IVA 16% acumulado):
 *   costo 615,00 -> ganancia 153,75 -> IVA 123,00 -> 891,75 / 10 = 89,175 -> redondeo 0,10 arriba = 89,20 $ p/p
 * ------------------------------------------------------------------------
 */

const { httpError } = require('../utils');
const {
    aCentavos, deCentavos, porcentajeCentavos, redondearPrecio, usdAVesSeguro
} = require('./moneda');

// ------------------------------------------------------------------------
// Unidades (habitaciones u otros cupos que se compran por unidad)
// ------------------------------------------------------------------------

/**
 * Elige la combinación más barata de unidades que alcance para N personas.
 * Empate de costo -> la que use menos unidades.
 * @param {Array<{concepto, monto_usd, capacidad_unidad, cantidad_disponible}>} items  alternativas de UNA categoría
 * @param {number} personas
 * @returns {{costo: number, seleccion: Array<{concepto, cantidad, capacidad, unitario, monto}>} | null}
 *          costo en centavos; null si no alcanzan las unidades disponibles
 */
function elegirUnidades(items, personas) {
    // Cada unidad disponible es una "copia" para una mochila 0/1 de cobertura
    const copias = [];
    items.forEach((it, idx) => {
        const cap = Number(it.capacidad_unidad);
        if (!(cap > 0)) return;
        const maximo = it.cantidad_disponible == null ? Math.ceil(personas / cap) : Number(it.cantidad_disponible);
        for (let k = 0; k < maximo; k++) copias.push({ idx, cap, costo: aCentavos(it.monto_usd) });
    });

    // dp[p] = mejor forma de cubrir p personas (p se topa en N)
    let dp = Array(personas + 1).fill(null);
    dp[0] = { costo: 0, unidades: 0, conteo: {} };
    for (const c of copias) {
        const sig = dp.slice();
        for (let p = 0; p <= personas; p++) {
            const actual = dp[p];
            if (!actual) continue;
            const q = Math.min(personas, p + c.cap);
            const cand = {
                costo: actual.costo + c.costo,
                unidades: actual.unidades + 1,
                conteo: { ...actual.conteo, [c.idx]: (actual.conteo[c.idx] || 0) + 1 }
            };
            const prev = sig[q];
            if (!prev || cand.costo < prev.costo || (cand.costo === prev.costo && cand.unidades < prev.unidades)) {
                sig[q] = cand;
            }
        }
        dp = sig;
    }

    const mejor = dp[personas];
    if (!mejor) return null;
    const seleccion = Object.entries(mejor.conteo).map(([idx, cantidad]) => {
        const it = items[idx];
        const unitario = aCentavos(it.monto_usd);
        return { concepto: it.concepto, cantidad, capacidad: Number(it.capacidad_unidad), unitario, monto: unitario * cantidad };
    });
    return { costo: mejor.costo, seleccion };
}

/** Personas máximas que caben en las unidades de una categoría (Infinity si alguna no tiene límite). */
function capacidadUnidades(items) {
    let total = 0;
    for (const it of items) {
        if (it.cantidad_disponible == null) return Infinity;
        total += Number(it.capacidad_unidad) * Number(it.cantidad_disponible);
    }
    return total;
}

/** Agrupa los costos tipo 'unidad' por categoría. */
function categoriasDeUnidades(costos) {
    const mapa = new Map();
    for (const c of costos.filter(c => c.tipo === 'unidad')) {
        if (!mapa.has(c.categoria)) mapa.set(c.categoria, []);
        mapa.get(c.categoria).push(c);
    }
    return mapa;
}

// ------------------------------------------------------------------------
// Cotización
// ------------------------------------------------------------------------

/**
 * Calcula la cotización completa de una ruta para N personas.
 *
 * @param {object} p
 * @param {number} p.personas          N
 * @param {number} p.minPersonas
 * @param {number} p.maxPersonas
 * @param {Array}  p.costos            filas de ruta_costo
 * @param {Array}  p.cargos            filas de ruta_cargo (se respetan en el orden recibido / campo orden)
 * @param {{modo: string, paso: number}} [p.redondeo]
 * @param {number} [p.abonoPct]        0-100
 * @param {number|null} [p.tasa]       tasa BCV vigente (Bs/USD); null => sin montos VES
 * @returns {object} cotización (montos en USD con 2 decimales; ver estructura al final)
 */
function calcularCotizacion({
    personas, minPersonas = 1, maxPersonas, costos = [], cargos = [],
    redondeo = { modo: 'ninguno', paso: 0.01 }, abonoPct = 100, tasa = null
}) {
    const N = Number(personas);
    if (!Number.isInteger(N) || N < 1) throw httpError(422, 'La cantidad de personas debe ser un número entero mayor que cero');
    if (N < minPersonas) throw httpError(422, `Esta ruta requiere un mínimo de ${minPersonas} personas`);
    if (maxPersonas != null && N > maxPersonas) throw httpError(422, `Esta ruta admite un máximo de ${maxPersonas} personas`);

    // 1) Costos de grupo
    const grupo = costos.filter(c => c.tipo === 'grupo').map(c => ({
        categoria: c.categoria, concepto: c.concepto, monto: aCentavos(c.monto_usd)
    }));

    // 2) Unidades (combinación más barata por categoría)
    const unidades = [];
    for (const [categoria, items] of categoriasDeUnidades(costos)) {
        const eleccion = elegirUnidades(items, N);
        if (!eleccion) throw httpError(422, `No hay suficientes unidades de "${categoria}" para ${N} personas`);
        eleccion.seleccion.forEach(s => unidades.push({ categoria, ...s }));
    }

    // 3) Costos por persona
    const porPersona = costos.filter(c => c.tipo === 'persona').map(c => {
        const unitario = aCentavos(c.monto_usd);
        return { categoria: c.categoria, concepto: c.concepto, unitario, monto: unitario * N };
    });

    const suma = arr => arr.reduce((t, x) => t + x.monto, 0);
    const costoGrupo = suma(grupo) + suma(unidades) + suma(porPersona);

    // 4) Cargos porcentuales en orden
    const ordenados = [...cargos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    let acumulado = costoGrupo;
    const cargosAplicados = [];
    for (const c of ordenados.filter(c => c.aplica !== 'pago_divisas')) {
        const base = c.base === 'costo' ? costoGrupo : acumulado;
        const monto = porcentajeCentavos(base, c.porcentaje);
        acumulado += monto;
        cargosAplicados.push({ nombre: c.nombre, tipo: c.tipo, porcentaje: Number(c.porcentaje), base: c.base, monto });
    }
    const cargosPago = ordenados.filter(c => c.aplica === 'pago_divisas')
        .map(c => ({ nombre: c.nombre, porcentaje: Number(c.porcentaje) }));

    // 5) Precio por persona con redondeo comercial; el total del grupo se deriva de él
    const precioPersona = redondearPrecio(acumulado / N, redondeo?.modo, redondeo?.paso);
    const totalGrupo = precioPersona * N;
    const ajusteRedondeo = totalGrupo - acumulado;

    // 6) Vista del cliente: "Servicio" (costo + ganancia + redondeo) e impuestos aparte.
    //    Los impuestos por persona se redondean al centavo y el servicio absorbe la diferencia,
    //    así Σ líneas por persona = precio por persona exacto.
    const impuestos = cargosAplicados.filter(c => c.tipo === 'impuesto').map(c => ({
        concepto: `${c.nombre} (${formatoPct(c.porcentaje)})`,
        persona: Math.round(c.monto / N)
    }));
    const servicioPersona = precioPersona - impuestos.reduce((t, x) => t + x.persona, 0);
    const lineasCliente = [{ concepto: 'Servicio', persona: servicioPersona }, ...impuestos]
        .map(l => ({ concepto: l.concepto, persona: l.persona, grupo: l.persona * N }));

    // 7) Abono mínimo y precio pagando en divisas (referencial; el IGTF real se calcula al pagar)
    const abonoMinimo = Math.min(totalGrupo, porcentajeCentavos(totalGrupo, abonoPct));
    const divisasPersona = precioPersona + calcularCargosPago(precioPersona, cargosPago).recargo;
    const divisasGrupo = totalGrupo + calcularCargosPago(totalGrupo, cargosPago).recargo;

    // ---------- Salida (USD con 2 decimales) ----------
    const usd = deCentavos;
    const ves = cent => usdAVesSeguro(usd(cent), tasa);
    const conVes = cent => ({ usd: usd(cent), ves: ves(cent) });

    return {
        personas: N,
        tasa: tasa ? Number(tasa) : null,

        // Lo que ve el cliente
        cliente: {
            lineas: lineasCliente.map(l => ({ concepto: l.concepto, persona: conVes(l.persona), grupo: conVes(l.grupo) })),
            precioPersona: conVes(precioPersona),
            totalGrupo: conVes(totalGrupo),
            abonoPct: Number(abonoPct),
            abonoMinimo: conVes(abonoMinimo),
            cargosPago,
            divisas: cargosPago.length ? { persona: conVes(divisasPersona), grupo: conVes(divisasGrupo) } : null
        },

        // Desglose interno (solo administración)
        interno: {
            grupo: grupo.map(x => ({ ...x, monto: usd(x.monto) })),
            unidades: unidades.map(x => ({ ...x, unitario: usd(x.unitario), monto: usd(x.monto) })),
            porPersona: porPersona.map(x => ({ ...x, unitario: usd(x.unitario), monto: usd(x.monto) })),
            costoGrupo: usd(costoGrupo),
            costoPersona: usd(Math.round(costoGrupo / N)),
            cargos: cargosAplicados.map(c => ({ ...c, monto: usd(c.monto) })),
            totalSinRedondeo: usd(acumulado),
            ajusteRedondeo: usd(ajusteRedondeo)
        },

        // Valores planos para guardar en agenda
        precioPersonaUsd: usd(precioPersona),
        totalUsd: usd(totalGrupo),
        abonoMinimoUsd: usd(abonoMinimo)
    };
}

/**
 * Recargos que dependen del método de pago (IGTF), sobre el monto pagado.
 * Se aplican en orden y de forma acumulada.
 * @param {number} montoCentavos
 * @param {Array<{nombre, porcentaje}>} cargosPago
 * @returns {{recargo: number, lineas: Array<{nombre, porcentaje, monto}>}} centavos
 */
function calcularCargosPago(montoCentavos, cargosPago = []) {
    let acumulado = montoCentavos;
    const lineas = cargosPago.map(c => {
        const monto = porcentajeCentavos(acumulado, c.porcentaje);
        acumulado += monto;
        return { nombre: c.nombre, porcentaje: Number(c.porcentaje), monto };
    });
    return { recargo: acumulado - montoCentavos, lineas };
}

/**
 * Precio "desde": el menor precio por persona entre min y max personas.
 * Devuelve null si ninguna cantidad es válida (ruta mal configurada).
 */
function precioDesde(params) {
    let mejor = null;
    const min = Math.max(1, Number(params.minPersonas) || 1);
    const max = Number(params.maxPersonas) || min;
    for (let n = min; n <= max; n++) {
        try {
            const c = calcularCotizacion({ ...params, personas: n });
            if (!mejor || c.cliente.precioPersona.usd < mejor.precioPersona.usd) {
                mejor = { personas: n, precioPersona: c.cliente.precioPersona };
            }
        } catch { /* cantidad no válida para esta ruta */ }
    }
    return mejor;
}

function formatoPct(n) {
    return `${String(Number(n)).replace('.', ',')}%`;
}

module.exports = {
    calcularCotizacion,
    calcularCargosPago,
    precioDesde,
    elegirUnidades,
    capacidadUnidades,
    categoriasDeUnidades
};
