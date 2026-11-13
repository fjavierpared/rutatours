// Totales de pagos de una reserva y recálculo de su estado
const db = require('../db');
const { deCentavos, aCentavos } = require('../utils/moneda');
const { estadoSegunPagos } = require('../utils/reglasAgenda');

/** Pagado verificado, reportado pendiente y saldo (USD, sin IGTF). */
async function resumenPagos(idAgenda, totalUsd, conn = db) {
    const [[s]] = await conn.query(`
        SELECT COALESCE(SUM(CASE WHEN estado = 'verificado' THEN monto_usd END), 0) AS verificado,
               COALESCE(SUM(CASE WHEN estado = 'pendiente'  THEN monto_usd END), 0) AS pendiente
        FROM pago WHERE id_agenda = ?`, [idAgenda]);
    const verificado = Number(s.verificado);
    const pendiente = Number(s.pendiente);
    return {
        pagado_usd: verificado,
        por_verificar_usd: pendiente,
        saldo_usd: deCentavos(Math.max(0, aCentavos(totalUsd) - aCentavos(verificado) - aCentavos(pendiente)))
    };
}

/** Recalcula y guarda el estado de la reserva según los pagos verificados. */
async function actualizarEstadoAgenda(idAgenda, conn = db) {
    const [[a]] = await conn.query('SELECT estado, total_usd, abono_minimo_usd FROM agenda WHERE id_agenda = ?', [idAgenda]);
    if (!a) return null;
    const { pagado_usd } = await resumenPagos(idAgenda, a.total_usd, conn);
    const estado = estadoSegunPagos(a, pagado_usd);
    if (estado !== a.estado) await conn.query('UPDATE agenda SET estado = ? WHERE id_agenda = ?', [estado, idAgenda]);
    return estado;
}

module.exports = { resumenPagos, actualizarEstadoAgenda };
