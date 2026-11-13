// Pagos reportados por el CLIENTE. Montado con requiereCliente.
// El cliente reporta (método + referencia + monto); el administrador verifica o rechaza.
const router = require('express').Router();
const db = require('../db');
const { httpError, idValido, numeroValido, textoRequerido } = require('../utils');
const { aCentavos, deCentavos, usdAVes, formatoUsd } = require('../utils/moneda');
const { calcularCargosPago } = require('../utils/calculoPrecios');
const { tasaVigente } = require('../services/tasa');
const { resumenPagos } = require('../services/pagos');
const { guardarImagen } = require('../services/archivos');

router.get('/metodos', async (req, res) => {
    const [rows] = await db.query('SELECT id_metodo, nombre, moneda, aplica_igtf, datos FROM metodo_pago WHERE activo = 1 ORDER BY nombre');
    res.json(rows);
});

/**
 * Calcula los montos de un pago (sin guardar). Lo usan la vista previa y el registro.
 * @returns {{monto_usd, igtf_usd, total_usd, tasa_bcv, monto_ves, id_tasa, lineasRecargo}}
 */
async function calcularPago({ agenda, metodo, montoUsd }) {
    const tasa = await tasaVigente();
    if (!tasa) throw httpError(422, 'No hay tasa BCV registrada hoy. Intente más tarde o contáctenos');

    const cot = typeof agenda.cotizacion === 'string' ? JSON.parse(agenda.cotizacion) : agenda.cotizacion;
    const cargosPago = metodo.aplica_igtf ? (cot.cliente?.cargosPago || []) : [];
    const { recargo, lineas } = calcularCargosPago(aCentavos(montoUsd), cargosPago);
    const totalCent = aCentavos(montoUsd) + recargo;
    return {
        monto_usd: montoUsd,
        igtf_usd: deCentavos(recargo),
        total_usd: deCentavos(totalCent),
        id_tasa: tasa.id_tasa,
        tasa_bcv: tasa.valor,
        monto_ves: usdAVes(deCentavos(totalCent), tasa.valor),
        lineasRecargo: lineas.map(l => ({ ...l, monto: deCentavos(l.monto) }))
    };
}

async function validarSolicitud(req) {
    const idAgenda = idValido(req.body.id_agenda, 'La reserva');
    const idMetodo = idValido(req.body.id_metodo, 'El método de pago');
    const montoUsd = numeroValido(req.body.monto_usd, 'El monto', { min: 0.01 });

    const [[agenda]] = await db.query('SELECT * FROM agenda WHERE id_agenda = ? AND id_cliente = ?', [idAgenda, req.cliente.id_cliente]);
    if (!agenda) throw httpError(404, 'La reserva no existe');
    if (['cancelada', 'completada', 'pagada'].includes(agenda.estado)) {
        throw httpError(409, `La reserva está ${agenda.estado.replace('_', ' ')}: no admite pagos`);
    }
    const [[metodo]] = await db.query('SELECT * FROM metodo_pago WHERE id_metodo = ? AND activo = 1', [idMetodo]);
    if (!metodo) throw httpError(422, 'El método de pago no está disponible');

    const { pagado_usd, por_verificar_usd, saldo_usd } = await resumenPagos(idAgenda, agenda.total_usd);
    if (aCentavos(montoUsd) > aCentavos(saldo_usd)) {
        throw httpError(422, saldo_usd > 0
            ? `El monto supera el saldo pendiente (${formatoUsd(saldo_usd)})`
            : 'No hay saldo pendiente: sus pagos ya cubren el total (algunos pueden estar por verificar)');
    }
    // Mientras no esté reservada, lo reportado debe alcanzar al menos el abono mínimo
    const faltaAbono = aCentavos(agenda.abono_minimo_usd) - aCentavos(pagado_usd) - aCentavos(por_verificar_usd);
    if (agenda.estado === 'pendiente_abono' && faltaAbono > 0 && aCentavos(montoUsd) < faltaAbono) {
        throw httpError(422, `El abono mínimo para confirmar la reserva es ${formatoUsd(deCentavos(faltaAbono))}`);
    }
    return { agenda, metodo, montoUsd };
}

// POST /api/pagos/previsualizar  -> montos (USD, IGTF, Bs) antes de reportar
router.post('/previsualizar', async (req, res) => {
    res.json(await calcularPago(await validarSolicitud(req)));
});

// POST /api/pagos  { id_agenda, id_metodo, monto_usd, referencia, comprobante? (data URL) }
router.post('/', async (req, res) => {
    const solicitud = await validarSolicitud(req);
    const referencia = textoRequerido(req.body.referencia, 'La referencia', 60);
    const montos = await calcularPago(solicitud);
    const comprobante = req.body.comprobante ? await guardarImagen(req.body.comprobante, `pago${solicitud.agenda.id_agenda}`) : null;

    const { lineasRecargo, ...fila } = montos;
    const [r] = await db.query('INSERT INTO pago SET ?', [{
        ...fila, id_agenda: solicitud.agenda.id_agenda, id_metodo: solicitud.metodo.id_metodo, referencia, comprobante
    }]);
    res.status(201).json({ id_pago: r.insertId, ...montos, message: 'Pago reportado. Lo verificaremos a la brevedad' });
});

module.exports = router;
