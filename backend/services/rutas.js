// Acceso a datos de rutas: carga completa, guardado transaccional y vista pública
const db = require('../db');
const {
    httpError, textoRequerido, textoOpcional, textoLargo, numeroValido, enteroValido,
    bool, opcion, horaValida, fechaTexto
} = require('../utils');
const { calcularCotizacion, precioDesde } = require('../utils/calculoPrecios');
const { problemasParaActivar } = require('../utils/reglasAgenda');

const TIPOS_PARADA = ['salida', 'embarque', 'visita', 'comida', 'alojamiento', 'retorno', 'llegada'];
const TIPOS_COSTO = ['grupo', 'persona', 'unidad'];
const TIPOS_DETALLE = ['incluye', 'no_incluye', 'recomendacion'];

// ------------------------------------------------------------------------
// Lectura
// ------------------------------------------------------------------------

async function cargarRutaCompleta(id, conn = db) {
    const [[ruta]] = await conn.query('SELECT * FROM ruta WHERE id_ruta = ?', [id]);
    if (!ruta) return null;

    const [[guia]] = ruta.id_guia
        ? await conn.query('SELECT * FROM guia WHERE id_guia = ?', [ruta.id_guia]) : [[null]];
    const [[vehiculo]] = ruta.id_vehiculo
        ? await conn.query('SELECT * FROM vehiculo WHERE id_vehiculo = ?', [ruta.id_vehiculo]) : [[null]];

    const [paradas] = await conn.query(
        `SELECT id_parada, orden, dia, TIME_FORMAT(hora, '%H:%i') AS hora, nombre, descripcion, tipo
         FROM ruta_parada WHERE id_ruta = ? ORDER BY orden`, [id]);
    const [actividades] = paradas.length ? await conn.query(
        `SELECT id_parada, orden, dia, TIME_FORMAT(hora, '%H:%i') AS hora, descripcion FROM ruta_actividad
         WHERE id_parada IN (?) ORDER BY orden`, [paradas.map(p => p.id_parada)]) : [[]];
    paradas.forEach(p => { p.actividades = actividades.filter(a => a.id_parada === p.id_parada); });

    const [costos] = await conn.query('SELECT * FROM ruta_costo WHERE id_ruta = ? ORDER BY orden', [id]);
    const [cargos] = await conn.query('SELECT * FROM ruta_cargo WHERE id_ruta = ? ORDER BY orden', [id]);
    const [detalles] = await conn.query('SELECT tipo, orden, texto FROM ruta_detalle WHERE id_ruta = ? ORDER BY tipo, orden', [id]);
    const [imagenes] = await conn.query('SELECT id_imagen, archivo, orden FROM ruta_imagen WHERE id_ruta = ? ORDER BY orden, id_imagen', [id]);

    return { ...ruta, guia: guia || null, vehiculo: vehiculo || null, paradas, costos, cargos, detalles, imagenes };
}

/** Parámetros para calcularCotizacion a partir de una ruta completa. */
function parametrosPrecio(ruta, { redondeo, tasa }) {
    return {
        minPersonas: ruta.min_personas,
        maxPersonas: ruta.max_personas,
        costos: ruta.costos,
        cargos: ruta.cargos,
        abonoPct: Number(ruta.abono_pct),
        redondeo,
        tasa
    };
}

function cotizar(ruta, personas, opciones) {
    return calcularCotizacion({ ...parametrosPrecio(ruta, opciones), personas });
}

/** Datos que puede ver un cliente: sin costos internos, ganancia ni datos personales del guía. */
function vistaPublica(ruta, opciones) {
    return {
        id_ruta: ruta.id_ruta,
        nombre: ruta.nombre,
        zona: ruta.zona,
        descripcion: ruta.descripcion,
        dias: ruta.dias,
        noches: ruta.noches,
        min_personas: ruta.min_personas,
        max_personas: ruta.max_personas,
        abono_pct: Number(ruta.abono_pct),
        fecha_desde: ruta.fecha_desde,
        fecha_hasta: ruta.fecha_hasta,
        dias_semana: ruta.dias_semana,
        anticipacion_dias: ruta.anticipacion_dias,
        guia: ruta.guia ? { nombre: ruta.guia.nombre, idiomas: ruta.guia.idiomas } : null,
        vehiculo: ruta.vehiculo ? { tipo: ruta.vehiculo.tipo } : null,
        paradas: ruta.paradas.map(({ id_parada, ...p }) => ({
            ...p, actividades: p.actividades.map(({ id_parada: _, ...a }) => a)
        })),
        detalles: ruta.detalles,
        imagenes: ruta.imagenes.map(i => `uploads/${i.archivo}`),
        desde: precioDesde(parametrosPrecio(ruta, opciones))
    };
}

// ------------------------------------------------------------------------
// Validación y guardado
// ------------------------------------------------------------------------

/** Normaliza y valida el cuerpo enviado por el editor de rutas. */
function validarDatosRuta(b) {
    const ruta = {
        nombre: textoRequerido(b.nombre, 'El nombre', 120),
        zona: textoOpcional(b.zona, 'La zona', 200),
        descripcion: textoLargo(b.descripcion, 'La descripción', 5000),
        dias: enteroValido(b.dias, 'Los días', { min: 1, max: 60 }),
        noches: enteroValido(b.noches ?? 0, 'Las noches', { min: 0, max: 60 }),
        id_guia: b.id_guia ? enteroValido(b.id_guia, 'El guía', { min: 1, max: 2 ** 31 }) : null,
        id_vehiculo: b.id_vehiculo ? enteroValido(b.id_vehiculo, 'El vehículo', { min: 1, max: 2 ** 31 }) : null,
        min_personas: enteroValido(b.min_personas, 'El mínimo de personas', { min: 1 }),
        max_personas: enteroValido(b.max_personas, 'El máximo de personas', { min: 1 }),
        abono_pct: numeroValido(b.abono_pct, 'El % de abono', { min: 0, max: 100 }),
        fecha_desde: fechaTexto(b.fecha_desde, 'Disponible desde', { requerida: false }),
        fecha_hasta: fechaTexto(b.fecha_hasta, 'Disponible hasta', { requerida: false }),
        dias_semana: diasSemana(b.dias_semana),
        anticipacion_dias: enteroValido(b.anticipacion_dias ?? 0, 'Los días de anticipación', { min: 0, max: 365 }),
        disponible: bool(b.disponible),
        activa: bool(b.activa)
    };
    if (ruta.min_personas > ruta.max_personas) throw httpError(422, 'El mínimo de personas no puede superar al máximo');
    if (ruta.noches > ruta.dias) throw httpError(422, 'Las noches no pueden superar a los días');
    if (ruta.fecha_desde && ruta.fecha_hasta && ruta.fecha_desde > ruta.fecha_hasta) {
        throw httpError(422, 'La fecha "desde" no puede ser posterior a la fecha "hasta"');
    }

    const lista = (v, campo) => {
        if (v == null) return [];
        if (!Array.isArray(v)) throw httpError(422, `${campo}: formato inválido`);
        if (v.length > 100) throw httpError(422, `${campo}: máximo 100 elementos`);
        return v;
    };

    const paradas = lista(b.paradas, 'Paradas').map((p, i) => ({
        orden: i + 1,
        dia: enteroValido(p.dia ?? 1, `Parada ${i + 1}: día`, { min: 1, max: ruta.dias }),
        hora: horaValida(p.hora, `Parada ${i + 1}`),
        nombre: textoRequerido(p.nombre, `Parada ${i + 1}: nombre`, 120),
        descripcion: textoLargo(p.descripcion, `Parada ${i + 1}: descripción`, 2000),
        tipo: opcion(p.tipo || 'visita', `Parada ${i + 1}: tipo`, TIPOS_PARADA),
        actividades: lista(p.actividades, `Parada ${i + 1}: actividades`).map((a, j) => ({
            orden: j + 1,
            dia: a.dia ? enteroValido(a.dia, `Actividad ${j + 1} de la parada ${i + 1}: día`, { min: 1, max: ruta.dias }) : null,
            hora: horaValida(a.hora, `Actividad ${j + 1} de la parada ${i + 1}`),
            descripcion: textoRequerido(a.descripcion, `Actividad ${j + 1} de la parada ${i + 1}`, 255)
        }))
    }));

    const costos = lista(b.costos, 'Costos').map((c, i) => {
        const tipo = opcion(c.tipo, `Costo ${i + 1}: tipo`, TIPOS_COSTO);
        return {
            orden: i + 1,
            tipo,
            categoria: textoRequerido(c.categoria, `Costo ${i + 1}: categoría`, 60),
            concepto: textoRequerido(c.concepto, `Costo ${i + 1}: concepto`, 120),
            monto_usd: numeroValido(c.monto_usd, `Costo ${i + 1}: monto`),
            capacidad_unidad: tipo === 'unidad' ? enteroValido(c.capacidad_unidad, `Costo ${i + 1}: personas por unidad`, { min: 1 }) : null,
            cantidad_disponible: tipo === 'unidad' && c.cantidad_disponible !== '' && c.cantidad_disponible != null
                ? enteroValido(c.cantidad_disponible, `Costo ${i + 1}: unidades disponibles`, { min: 0 }) : null
        };
    });

    const cargos = lista(b.cargos, 'Cargos').map((c, i) => ({
        orden: i + 1,
        nombre: textoRequerido(c.nombre, `Cargo ${i + 1}: nombre`, 60),
        tipo: opcion(c.tipo, `Cargo ${i + 1}: tipo`, ['ganancia', 'impuesto']),
        porcentaje: numeroValido(c.porcentaje, `Cargo ${i + 1}: porcentaje`, { min: 0, max: 1000 }),
        base: opcion(c.base || 'acumulado', `Cargo ${i + 1}: base`, ['costo', 'acumulado']),
        aplica: opcion(c.aplica || 'siempre', `Cargo ${i + 1}: aplica`, ['siempre', 'pago_divisas'])
    }));

    const detalles = lista(b.detalles, 'Detalles').map((d, i) => ({
        tipo: opcion(d.tipo, `Detalle ${i + 1}: tipo`, TIPOS_DETALLE),
        texto: textoRequerido(d.texto, `Detalle ${i + 1}`, 500)
    }));

    return { ruta, paradas, costos, cargos, detalles };
}

function diasSemana(v) {
    const arr = Array.isArray(v) ? v : String(v ?? '').split(',').filter(x => x !== '');
    const dias = [...new Set(arr.map(Number))].filter(d => Number.isInteger(d) && d >= 0 && d <= 6).sort();
    return dias.length && dias.length < 7 ? dias.join(',') : null;
}

/**
 * Crea o actualiza una ruta con todas sus listas, en una transacción.
 * Si se pide activa=1 y la ruta está incompleta, responde 422 con los problemas.
 * @returns {Promise<number>} id_ruta
 */
async function guardarRuta(id, datos) {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // Validar guía y vehículo, y que la ruta pueda activarse
        const [[guia]] = datos.ruta.id_guia ? await conn.query('SELECT * FROM guia WHERE id_guia = ?', [datos.ruta.id_guia]) : [[null]];
        const [[vehiculo]] = datos.ruta.id_vehiculo ? await conn.query('SELECT * FROM vehiculo WHERE id_vehiculo = ?', [datos.ruta.id_vehiculo]) : [[null]];
        if (datos.ruta.id_guia && !guia) throw httpError(422, 'El guía seleccionado no existe');
        if (datos.ruta.id_vehiculo && !vehiculo) throw httpError(422, 'El vehículo seleccionado no existe');
        if (vehiculo && datos.ruta.max_personas > vehiculo.capacidad) {
            throw httpError(422, `El máximo de personas (${datos.ruta.max_personas}) supera la capacidad del vehículo (${vehiculo.capacidad})`);
        }
        if (datos.ruta.activa) {
            const problemas = problemasParaActivar(datos.ruta, { ...datos, guia, vehiculo });
            if (problemas.length) throw httpError(422, `No se puede activar la ruta: ${problemas.join('; ')}`);
        }

        if (id) {
            const [r] = await conn.query('UPDATE ruta SET ? WHERE id_ruta = ?', [datos.ruta, id]);
            if (!r.affectedRows) throw httpError(404, 'La ruta no existe');
            for (const t of ['ruta_parada', 'ruta_costo', 'ruta_cargo', 'ruta_detalle']) {
                await conn.query(`DELETE FROM ${t} WHERE id_ruta = ?`, [id]); // actividades caen en cascada
            }
        } else {
            const [r] = await conn.query('INSERT INTO ruta SET ?', [datos.ruta]);
            id = r.insertId;
        }

        for (const { actividades, ...p } of datos.paradas) {
            const [r] = await conn.query('INSERT INTO ruta_parada SET ?', [{ ...p, id_ruta: id }]);
            for (const a of actividades) await conn.query('INSERT INTO ruta_actividad SET ?', [{ ...a, id_parada: r.insertId }]);
        }
        for (const c of datos.costos) await conn.query('INSERT INTO ruta_costo SET ?', [{ ...c, id_ruta: id }]);
        for (const c of datos.cargos) await conn.query('INSERT INTO ruta_cargo SET ?', [{ ...c, id_ruta: id }]);
        const orden = {};
        for (const d of datos.detalles) {
            orden[d.tipo] = (orden[d.tipo] || 0) + 1;
            await conn.query('INSERT INTO ruta_detalle SET ?', [{ ...d, orden: orden[d.tipo], id_ruta: id }]);
        }

        await conn.commit();
        return id;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = {
    cargarRutaCompleta, parametrosPrecio, cotizar, vistaPublica, validarDatosRuta, guardarRuta
};
