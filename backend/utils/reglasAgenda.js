/**
 * Reglas de negocio de rutas, reservas y pagos. Funciones puras (sin BD ni UI).
 * Las fechas se manejan como texto AAAA-MM-DD, sin depender de la zona horaria.
 */

const { httpError } = require('../utils');
const { capacidadUnidades, categoriasDeUnidades } = require('./calculoPrecios');

const ESTADOS_QUE_OCUPAN = ['pendiente_abono', 'reservada', 'pagada'];

function aUTC(iso) {
    const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d));
}

/** "2026-11-30" + 2 -> "2026-12-02" */
function sumarDias(iso, dias) {
    const d = aUTC(iso);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
}

/** Último día del viaje: una ruta de 2 días que sale el 14 regresa el 15. */
function fechaRegreso(salida, dias) {
    return sumarDias(salida, Math.max(1, Number(dias) || 1) - 1);
}

function diasEntre(desde, hasta) {
    return Math.round((aUTC(hasta) - aUTC(desde)) / 86400000);
}

/** ¿Se cruzan los rangos [a1, a2] y [b1, b2]? (inclusive) */
function seSolapan(a1, a2, b1, b2) {
    return a1 <= b2 && b1 <= a2;
}

/**
 * Problemas que impiden ACTIVAR una ruta (lista vacía = puede activarse).
 * @param {object} ruta     fila de ruta
 * @param {object} extra    { paradas, costos, guia, vehiculo }
 */
function problemasParaActivar(ruta, { paradas = [], costos = [], guia = null, vehiculo = null }) {
    const p = [];
    if (paradas.length < 2) p.push('El recorrido debe tener al menos 2 paradas (salida y destino)');
    if (!costos.length) p.push('La ruta no tiene costos configurados');
    if (!guia) p.push('No tiene guía asignado');
    if (!vehiculo) p.push('No tiene vehículo asignado');
    if (Number(ruta.min_personas) > Number(ruta.max_personas)) p.push('El mínimo de personas supera al máximo');
    if (vehiculo && Number(ruta.max_personas) > Number(vehiculo.capacidad)) {
        p.push(`El máximo de personas (${ruta.max_personas}) supera la capacidad del vehículo (${vehiculo.capacidad})`);
    }
    for (const [categoria, items] of categoriasDeUnidades(costos)) {
        const cap = capacidadUnidades(items);
        if (Number(ruta.max_personas) > cap) {
            p.push(`El máximo de personas (${ruta.max_personas}) supera el cupo de "${categoria}" (${cap})`);
        }
    }
    return p;
}

/**
 * Valida que la fecha de salida cumpla la configuración de la ruta.
 * @throws httpError 422
 */
function validarFechaSalida(ruta, fecha, hoy) {
    const anticipacion = Number(ruta.anticipacion_dias) || 0;
    if (diasEntre(hoy, fecha) < anticipacion) {
        throw httpError(422, anticipacion
            ? `Debe reservar con al menos ${anticipacion} día(s) de anticipación`
            : 'La fecha de salida no puede ser anterior a hoy');
    }
    if (ruta.fecha_desde && fecha < ruta.fecha_desde.slice(0, 10)) {
        throw httpError(422, `La ruta está disponible a partir del ${formato(ruta.fecha_desde)}`);
    }
    const regreso = fechaRegreso(fecha, ruta.dias);
    if (ruta.fecha_hasta && regreso > ruta.fecha_hasta.slice(0, 10)) {
        throw httpError(422, `La ruta está disponible hasta el ${formato(ruta.fecha_hasta)}`);
    }
    if (ruta.dias_semana) {
        const permitidos = String(ruta.dias_semana).split(',').map(Number);
        if (!permitidos.includes(aUTC(fecha).getUTCDay())) {
            const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
            throw httpError(422, `Esta ruta solo sale los días: ${permitidos.map(d => nombres[d]).join(', ')}`);
        }
    }
}

/**
 * Valida que una ruta pueda agendarse para N personas en una fecha.
 * @param {object} p
 * @param {object} p.ruta, p.guia, p.vehiculo
 * @param {number} p.personas
 * @param {string} p.fecha        salida AAAA-MM-DD
 * @param {string} p.hoy
 * @param {Array}  p.paradas
 * @param {Array<{fecha_salida, fecha_regreso, id_guia, id_vehiculo}>} p.agendasCruzadas
 *        reservas activas (no canceladas) que usan el mismo guía o vehículo
 * @throws httpError con el primer problema encontrado
 */
function validarReserva({ ruta, guia, vehiculo, personas, fecha, hoy, paradas = [], agendasCruzadas = [] }) {
    if (!ruta || !ruta.activa) throw httpError(422, 'La ruta no está activa');
    if (!ruta.disponible) throw httpError(422, 'La ruta no está disponible para reservas en este momento');
    if (paradas.length < 2) throw httpError(422, 'La ruta aún no tiene el recorrido definido');

    const N = Number(personas);
    if (!Number.isInteger(N) || N < 1) throw httpError(422, 'Indique una cantidad válida de personas');
    if (N < ruta.min_personas) throw httpError(422, `Esta ruta requiere un mínimo de ${ruta.min_personas} personas`);
    if (N > ruta.max_personas) throw httpError(422, `Sobrecupo: esta ruta admite un máximo de ${ruta.max_personas} personas`);

    if (!vehiculo || !vehiculo.activo || !vehiculo.disponible) throw httpError(422, 'El vehículo de esta ruta no está disponible');
    if (N > vehiculo.capacidad) throw httpError(422, `Sobrecupo: el vehículo admite ${vehiculo.capacidad} pasajeros`);
    if (!guia || !guia.activo || !guia.disponible) throw httpError(422, 'El guía de esta ruta no está disponible');

    validarFechaSalida(ruta, fecha, hoy);

    const regreso = fechaRegreso(fecha, ruta.dias);
    for (const a of agendasCruzadas) {
        if (!seSolapan(fecha, regreso, a.fecha_salida.slice(0, 10), a.fecha_regreso.slice(0, 10))) continue;
        if (a.id_vehiculo === vehiculo.id_vehiculo) throw httpError(409, 'El vehículo ya está reservado en esas fechas. Elija otra fecha');
        if (a.id_guia === guia.id_guia) throw httpError(409, 'El guía ya está reservado en esas fechas. Elija otra fecha');
    }
    return { fechaRegreso: regreso };
}

/**
 * Estado de la reserva según lo pagado y VERIFICADO (USD, sin IGTF).
 * Una reserva cancelada o completada no cambia por pagos.
 */
function estadoSegunPagos(agenda, pagadoUsd) {
    if (['cancelada', 'completada'].includes(agenda.estado)) return agenda.estado;
    const pagado = Math.round(Number(pagadoUsd) * 100);
    if (pagado >= Math.round(Number(agenda.total_usd) * 100)) return 'pagada';
    if (pagado >= Math.round(Number(agenda.abono_minimo_usd) * 100)) return 'reservada';
    return 'pendiente_abono';
}

function formato(iso) {
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}-${m}-${a}`;
}

module.exports = {
    ESTADOS_QUE_OCUPAN,
    sumarDias,
    fechaRegreso,
    diasEntre,
    seSolapan,
    problemasParaActivar,
    validarFechaSalida,
    validarReserva,
    estadoSegunPagos
};
