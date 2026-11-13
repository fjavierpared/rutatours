// Agendas (reservas) del CLIENTE. Montado con requiereCliente: req.cliente es el cliente en sesión.
const router = require('express').Router();
const db = require('../db');
const { httpError, idValido, enteroValido, fechaTexto, textoOpcional, hoy } = require('../utils');
const servicio = require('../services/rutas');
const { tasaVigente, configuracionPrecios } = require('../services/tasa');
const { validarReserva, fechaRegreso, ESTADOS_QUE_OCUPAN } = require('../utils/reglasAgenda');
const { resumenPagos } = require('../services/pagos');
const { formatoUsd } = require('../utils/moneda');

// POST /api/agendas  { id_ruta, fecha, personas, notas? }
router.post('/', async (req, res) => {
    const idRuta = idValido(req.body.id_ruta, 'La ruta');
    const fecha = fechaTexto(req.body.fecha, 'La fecha de salida');
    const personas = enteroValido(req.body.personas, 'La cantidad de personas', { min: 1, max: 1000 });
    const notas = textoOpcional(req.body.notas, 'Las notas', 500);

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const ruta = await servicio.cargarRutaCompleta(idRuta, conn);
        if (!ruta) throw httpError(404, 'La ruta no existe');

        // Bloquea guía y vehículo hasta terminar: evita dos reservas simultáneas del mismo recurso
        const [[vehiculo]] = ruta.id_vehiculo
            ? await conn.query('SELECT * FROM vehiculo WHERE id_vehiculo = ? FOR UPDATE', [ruta.id_vehiculo]) : [[null]];
        const [[guia]] = ruta.id_guia
            ? await conn.query('SELECT * FROM guia WHERE id_guia = ? FOR UPDATE', [ruta.id_guia]) : [[null]];

        const regreso = fechaRegreso(fecha, ruta.dias);
        const [agendasCruzadas] = await conn.query(`
            SELECT fecha_salida, fecha_regreso, id_guia, id_vehiculo FROM agenda
            WHERE estado IN (?) AND (id_guia = ? OR id_vehiculo = ?)
              AND fecha_salida <= ? AND fecha_regreso >= ?`,
            [ESTADOS_QUE_OCUPAN, guia?.id_guia ?? 0, vehiculo?.id_vehiculo ?? 0, regreso, fecha]);

        validarReserva({ ruta, guia, vehiculo, personas, fecha, hoy: hoy(), paradas: ruta.paradas, agendasCruzadas });

        const tasa = await tasaVigente(conn);
        const cot = servicio.cotizar(ruta, personas, { redondeo: await configuracionPrecios(conn), tasa: tasa?.valor ?? null });

        const [r] = await conn.query('INSERT INTO agenda SET ?', [{
            id_cliente: req.cliente.id_cliente,
            id_ruta: ruta.id_ruta,
            id_guia: guia.id_guia,
            id_vehiculo: vehiculo.id_vehiculo,
            fecha_salida: fecha,
            fecha_regreso: regreso,
            personas,
            precio_persona_usd: cot.precioPersonaUsd,
            total_usd: cot.totalUsd,
            abono_minimo_usd: cot.abonoMinimoUsd,
            cotizacion: JSON.stringify({ ruta: ruta.nombre, cliente: cot.cliente, interno: cot.interno }),
            notas
        }]);
        await conn.commit();
        res.status(201).json({
            id_agenda: r.insertId,
            message: `Reserva registrada. Para confirmarla, abone al menos ${formatoUsd(cot.abonoMinimoUsd)}`,
            cotizacion: cot.cliente
        });
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
});

// GET /api/agendas/mias  -> reservas del cliente con su estado de pago
router.get('/mias', async (req, res) => {
    const [rows] = await db.query(`
        SELECT a.id_agenda, a.id_ruta, r.nombre AS ruta, a.fecha_salida, a.fecha_regreso, a.personas,
               a.precio_persona_usd, a.total_usd, a.abono_minimo_usd, a.estado, a.creado_en
        FROM agenda a JOIN ruta r ON r.id_ruta = a.id_ruta
        WHERE a.id_cliente = ? ORDER BY a.fecha_salida DESC, a.id_agenda DESC`, [req.cliente.id_cliente]);
    for (const a of rows) Object.assign(a, await resumenPagos(a.id_agenda, a.total_usd));
    res.json(rows);
});

router.get('/mias/:id', async (req, res) => {
    const id = idValido(req.params.id, 'La reserva');
    const [[a]] = await db.query(`
        SELECT a.*, r.nombre AS ruta FROM agenda a JOIN ruta r ON r.id_ruta = a.id_ruta
        WHERE a.id_agenda = ? AND a.id_cliente = ?`, [id, req.cliente.id_cliente]);
    if (!a) throw httpError(404, 'La reserva no existe');
    const cot = typeof a.cotizacion === 'string' ? JSON.parse(a.cotizacion) : a.cotizacion;
    a.cotizacion = { cliente: cot.cliente }; // el desglose interno no se envía al cliente
    const [pagos] = await db.query(`
        SELECT p.id_pago, m.nombre AS metodo, p.referencia, p.monto_usd, p.igtf_usd, p.total_usd,
               p.tasa_bcv, p.monto_ves, p.estado, p.observacion, p.creado_en
        FROM pago p JOIN metodo_pago m ON m.id_metodo = p.id_metodo
        WHERE p.id_agenda = ? ORDER BY p.creado_en`, [id]);
    res.json({ ...a, ...(await resumenPagos(id, a.total_usd)), pagos });
});

// El cliente puede cancelar mientras no haya pagos verificados
router.post('/mias/:id/cancelar', async (req, res) => {
    const id = idValido(req.params.id, 'La reserva');
    const [[a]] = await db.query('SELECT estado FROM agenda WHERE id_agenda = ? AND id_cliente = ?', [id, req.cliente.id_cliente]);
    if (!a) throw httpError(404, 'La reserva no existe');
    if (a.estado !== 'pendiente_abono') throw httpError(409, 'Esta reserva ya tiene pagos verificados. Contáctenos para cancelarla');
    await db.query("UPDATE agenda SET estado = 'cancelada' WHERE id_agenda = ?", [id]);
    await db.query("UPDATE pago SET estado = 'rechazado', observacion = 'Reserva cancelada por el cliente' WHERE id_agenda = ? AND estado = 'pendiente'", [id]);
    res.json({ message: 'Reserva cancelada' });
});

module.exports = router;
