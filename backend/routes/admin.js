// Administración de clientes, agendas, pagos y métodos de pago. Montado con requiereSesion.
const router = require('express').Router();
const db = require('../db');
const {
    httpError, idValido, bool, opcion, textoRequerido, textoOpcional, hoy
} = require('../utils');
const { resumenPagos, actualizarEstadoAgenda } = require('../services/pagos');
const { tasaVigente } = require('../services/tasa');
const { hashPassword, requiereAdmin } = require('../auth_helper');
const { datosClienteNuevo, insertarCliente } = require('./clientes');

// ---------- Resumen (módulo Inicio) ----------
router.get('/resumen', async (req, res) => {
    const [[conteos]] = await db.query(`
        SELECT (SELECT COUNT(*) FROM ruta WHERE activa = 1) AS rutas_activas,
               (SELECT COUNT(*) FROM cliente) AS clientes,
               (SELECT COUNT(*) FROM agenda WHERE estado IN ('pendiente_abono','reservada','pagada') AND fecha_salida >= ?) AS proximas_total,
               (SELECT COUNT(*) FROM pago WHERE estado = 'pendiente') AS pagos_por_verificar`, [hoy()]);
    const [proximas] = await db.query(`
        SELECT a.id_agenda, r.nombre AS ruta, c.nombre AS cliente, a.fecha_salida, a.personas, a.estado
        FROM agenda a JOIN ruta r ON r.id_ruta = a.id_ruta JOIN cliente c ON c.id_cliente = a.id_cliente
        WHERE a.estado IN ('pendiente_abono','reservada','pagada') AND a.fecha_salida >= ?
        ORDER BY a.fecha_salida LIMIT 8`, [hoy()]);
    res.json({ ...conteos, proximas, tasa: await tasaVigente() });
});

// ---------- Clientes ----------
router.get('/clientes', async (req, res) => {
    const [rows] = await db.query(`
        SELECT c.id_cliente, c.nombre, c.documento, c.email, c.telefono, c.activo, c.creado_en,
               COUNT(a.id_agenda) AS reservas
        FROM cliente c LEFT JOIN agenda a ON a.id_cliente = c.id_cliente
        GROUP BY c.id_cliente ORDER BY c.creado_en DESC`);
    res.json(rows);
});

// El personal registra a un cliente (reservas por teléfono u oficina) con una clave temporal
router.post('/clientes', async (req, res) => {
    const id = await insertarCliente(await datosClienteNuevo(req.body));
    res.status(201).json({ id_cliente: id, message: 'Cliente registrado. Entréguele su correo y la clave temporal' });
});

router.patch('/clientes/:id/clave', async (req, res) => {
    const id = idValido(req.params.id, 'El cliente');
    const password = String(req.body.password || '');
    if (password.length < 6) throw httpError(422, 'La clave temporal debe tener al menos 6 caracteres');
    const [r] = await db.query('UPDATE cliente SET password = ? WHERE id_cliente = ?', [hashPassword(password), id]);
    if (!r.affectedRows) throw httpError(404, 'El cliente no existe');
    res.json({ message: 'Clave restablecida. Entréguesela al cliente para que la cambie al ingresar' });
});

// Los clientes no se eliminan (conservan su historial de reservas y pagos): solo un administrador los desactiva
router.patch('/clientes/:id', requiereAdmin, async (req, res) => {
    const id = idValido(req.params.id, 'El cliente');
    const [r] = await db.query('UPDATE cliente SET activo = ? WHERE id_cliente = ?', [bool(req.body.activo), id]);
    if (!r.affectedRows) throw httpError(404, 'El cliente no existe');
    res.json({ message: bool(req.body.activo) ? 'Cliente activado' : 'Cliente desactivado' });
});

// ---------- Agendas ----------
router.get('/agendas', async (req, res) => {
    const filtros = [];
    const valores = [];
    if (req.query.estado) { filtros.push('a.estado = ?'); valores.push(req.query.estado); }
    if (req.query.desde) { filtros.push('a.fecha_salida >= ?'); valores.push(req.query.desde); }
    if (req.query.hasta) { filtros.push('a.fecha_salida <= ?'); valores.push(req.query.hasta); }
    const [rows] = await db.query(`
        SELECT a.id_agenda, a.fecha_salida, a.fecha_regreso, a.personas, a.precio_persona_usd, a.total_usd,
               a.abono_minimo_usd, a.estado, a.creado_en, r.nombre AS ruta, c.nombre AS cliente, c.telefono,
               g.nombre AS guia, v.placa
        FROM agenda a
        JOIN ruta r ON r.id_ruta = a.id_ruta
        JOIN cliente c ON c.id_cliente = a.id_cliente
        LEFT JOIN guia g ON g.id_guia = a.id_guia
        LEFT JOIN vehiculo v ON v.id_vehiculo = a.id_vehiculo
        ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
        ORDER BY a.fecha_salida DESC, a.id_agenda DESC LIMIT 500`, valores);
    for (const a of rows) Object.assign(a, await resumenPagos(a.id_agenda, a.total_usd));
    res.json(rows);
});

router.get('/agendas/:id', async (req, res) => {
    const id = idValido(req.params.id, 'La reserva');
    const [[a]] = await db.query(`
        SELECT a.*, r.nombre AS ruta, c.nombre AS cliente, c.documento, c.email, c.telefono, g.nombre AS guia, v.placa
        FROM agenda a JOIN ruta r ON r.id_ruta = a.id_ruta JOIN cliente c ON c.id_cliente = a.id_cliente
        LEFT JOIN guia g ON g.id_guia = a.id_guia LEFT JOIN vehiculo v ON v.id_vehiculo = a.id_vehiculo
        WHERE a.id_agenda = ?`, [id]);
    if (!a) throw httpError(404, 'La reserva no existe');
    if (typeof a.cotizacion === 'string') a.cotizacion = JSON.parse(a.cotizacion);
    const [pagos] = await db.query(`
        SELECT p.*, m.nombre AS metodo FROM pago p JOIN metodo_pago m ON m.id_metodo = p.id_metodo
        WHERE p.id_agenda = ? ORDER BY p.creado_en`, [id]);
    res.json({ ...a, ...(await resumenPagos(id, a.total_usd)), pagos });
});

// Cancelar o marcar como completada (las demás transiciones dependen de los pagos)
router.patch('/agendas/:id', async (req, res) => {
    const id = idValido(req.params.id, 'La reserva');
    const estado = opcion(req.body.estado, 'El estado', ['cancelada', 'completada']);
    const [[a]] = await db.query('SELECT estado FROM agenda WHERE id_agenda = ?', [id]);
    if (!a) throw httpError(404, 'La reserva no existe');
    if (['cancelada', 'completada'].includes(a.estado)) throw httpError(409, `La reserva ya está ${a.estado}`);
    await db.query('UPDATE agenda SET estado = ? WHERE id_agenda = ?', [estado, id]);
    if (estado === 'cancelada') {
        await db.query("UPDATE pago SET estado = 'rechazado', observacion = 'Reserva cancelada' WHERE id_agenda = ? AND estado = 'pendiente'", [id]);
    }
    res.json({ message: estado === 'cancelada' ? 'Reserva cancelada' : 'Reserva marcada como completada' });
});

// ---------- Pagos ----------
router.get('/pagos', async (req, res) => {
    const valores = [];
    let where = '';
    if (req.query.estado) { where = 'WHERE p.estado = ?'; valores.push(req.query.estado); }
    const [rows] = await db.query(`
        SELECT p.id_pago, p.id_agenda, p.referencia, p.comprobante, p.monto_usd, p.igtf_usd, p.total_usd,
               p.tasa_bcv, p.monto_ves, p.estado, p.observacion, p.creado_en, p.verificado_en,
               m.nombre AS metodo, m.moneda, c.nombre AS cliente, r.nombre AS ruta, a.fecha_salida
        FROM pago p
        JOIN metodo_pago m ON m.id_metodo = p.id_metodo
        JOIN agenda a ON a.id_agenda = p.id_agenda
        JOIN cliente c ON c.id_cliente = a.id_cliente
        JOIN ruta r ON r.id_ruta = a.id_ruta
        ${where}
        ORDER BY p.estado = 'pendiente' DESC, p.creado_en DESC LIMIT 500`, valores);
    res.json(rows);
});

// Verificar o rechazar un pago; recalcula el estado de la reserva
router.patch('/pagos/:id', async (req, res) => {
    const id = idValido(req.params.id, 'El pago');
    const estado = opcion(req.body.estado, 'El estado', ['verificado', 'rechazado']);
    const observacion = textoOpcional(req.body.observacion, 'La observación', 255);
    if (estado === 'rechazado' && !observacion) throw httpError(422, 'Indique el motivo del rechazo');

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const [[p]] = await conn.query('SELECT id_agenda, estado FROM pago WHERE id_pago = ? FOR UPDATE', [id]);
        if (!p) throw httpError(404, 'El pago no existe');
        if (p.estado !== 'pendiente') throw httpError(409, `El pago ya fue ${p.estado}`);
        await conn.query(
            'UPDATE pago SET estado = ?, observacion = ?, id_usuario_verifica = ?, verificado_en = NOW() WHERE id_pago = ?',
            [estado, observacion, req.usuario.id_usuario, id]);
        const estadoAgenda = await actualizarEstadoAgenda(p.id_agenda, conn);
        await conn.commit();
        res.json({ message: `Pago ${estado}`, estado_agenda: estadoAgenda });
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
});

// ---------- Métodos de pago ----------
router.get('/metodos-pago', async (req, res) => {
    const [rows] = await db.query('SELECT * FROM metodo_pago ORDER BY nombre');
    res.json(rows);
});

function datosMetodo(b) {
    return {
        nombre: textoRequerido(b.nombre, 'El nombre', 60),
        moneda: opcion(b.moneda, 'La moneda', ['USD', 'VES']),
        aplica_igtf: bool(b.aplica_igtf),
        datos: textoOpcional(b.datos, 'Los datos de pago', 500),
        activo: bool(b.activo)
    };
}

router.post('/metodos-pago', async (req, res) => {
    const [r] = await db.query('INSERT INTO metodo_pago SET ?', [datosMetodo(req.body)]);
    res.status(201).json({ id_metodo: r.insertId, message: 'Método de pago creado' });
});

router.put('/metodos-pago/:id', async (req, res) => {
    const id = idValido(req.params.id, 'El método');
    const [r] = await db.query('UPDATE metodo_pago SET ? WHERE id_metodo = ?', [datosMetodo(req.body), id]);
    if (!r.affectedRows) throw httpError(404, 'El método no existe');
    res.json({ message: 'Método de pago actualizado' });
});

router.delete('/metodos-pago/:id', async (req, res) => {
    const id = idValido(req.params.id, 'El método');
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM pago WHERE id_metodo = ?', [id]);
    if (n) throw httpError(409, 'El método tiene pagos registrados: desactívelo en lugar de eliminarlo');
    const [r] = await db.query('DELETE FROM metodo_pago WHERE id_metodo = ?', [id]);
    if (!r.affectedRows) throw httpError(404, 'El método no existe');
    res.json({ message: 'Método de pago eliminado' });
});

module.exports = router;
