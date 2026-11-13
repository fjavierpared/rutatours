// Portal de CLIENTES: registro e inicio de sesión. Independiente de los usuarios del sistema.
const router = require('express').Router();
const db = require('../db');
const { httpError, textoRequerido, textoOpcional, emailValido, duplicado } = require('../utils');
const { hashPassword, verificarPassword, requiereCliente } = require('../auth_helper');
const { sesionCliente, asegurarCorreoLibre, controlIngreso } = require('../services/cuentas');

/** Datos de un cliente nuevo (registro desde el portal o desde el panel). */
async function datosClienteNuevo(b) {
    const datos = {
        nombre: textoRequerido(b.nombre, 'El nombre', 100),
        documento: textoRequerido(b.documento, 'La cédula o pasaporte', 20).toUpperCase(),
        email: emailValido(b.email, 'El correo', { requerido: true }),
        telefono: textoOpcional(b.telefono, 'El teléfono', 30)
    };
    const password = String(b.password || '');
    if (password.length < 6) throw httpError(422, 'La contraseña debe tener al menos 6 caracteres');
    await asegurarCorreoLibre(datos.email);
    return { ...datos, password: hashPassword(password) };
}

async function insertarCliente(datos) {
    const [r] = await db.query('INSERT INTO cliente SET ?', [datos])
        .catch(err => duplicado(err, 'Ya existe una cuenta con ese correo o documento'));
    return r.insertId;
}

router.post('/register', async (req, res) => {
    const datos = await datosClienteNuevo(req.body);
    const id = await insertarCliente(datos);
    res.status(201).json({ message: 'Cuenta creada', ...sesionCliente({ id_cliente: id, ...datos }) });
});

// Se conserva por compatibilidad; el portal usa POST /api/acceso (ingreso unificado)
router.post('/login', async (req, res) => {
    const email = emailValido(req.body.email, 'El correo', { requerido: true });
    // Una página vieja (en caché) puede enviar aquí el correo de un usuario del equipo: se le orienta
    // sin contarlo como intento fallido.
    const [[delEquipo]] = await db.query('SELECT 1 AS si FROM usuario WHERE email = ?', [email]);
    if (delEquipo) {
        throw httpError(409, 'Ese correo es de un usuario del equipo. Recargue la página (Ctrl + Shift + R) e ingrese de nuevo, o entre por /admin');
    }
    const control = controlIngreso(req, email);
    const [[c]] = await db.query('SELECT id_cliente, nombre, email, password, activo FROM cliente WHERE email = ?', [email]);
    if (!c || !verificarPassword(String(req.body.password || ''), c.password)) { control.fallo(); throw httpError(401, 'Correo o contraseña incorrectos'); }
    if (!c.activo) throw httpError(403, 'Su cuenta está inactiva. Contáctenos');
    control.exito();
    res.json({ message: 'Bienvenido(a)', ...sesionCliente(c) });
});

// El cliente cambia su clave (Ej.: la temporal que le dio la agencia)
router.post('/cambiar-clave', requiereCliente, async (req, res) => {
    const actual = String(req.body.password_actual || '');
    const nueva = String(req.body.password_nueva || '');
    if (!actual || !nueva) throw httpError(422, 'Indique la contraseña actual y la nueva');
    if (nueva.length < 6) throw httpError(422, 'La nueva contraseña debe tener al menos 6 caracteres');
    const [[c]] = await db.query('SELECT password FROM cliente WHERE id_cliente = ?', [req.cliente.id_cliente]);
    if (!c || !verificarPassword(actual, c.password)) throw httpError(400, 'La contraseña actual no es correcta');
    await db.query('UPDATE cliente SET password = ? WHERE id_cliente = ?', [hashPassword(nueva), req.cliente.id_cliente]);
    res.json({ message: 'Contraseña actualizada' });
});

router.get('/perfil', requiereCliente, async (req, res) => {
    const [[c]] = await db.query(
        'SELECT id_cliente, nombre, documento, email, telefono, activo FROM cliente WHERE id_cliente = ?', [req.cliente.id_cliente]);
    if (!c || !c.activo) throw httpError(401, 'Cuenta no encontrada o inactiva');
    res.json({ cliente: c });
});

module.exports = router;
module.exports.datosClienteNuevo = datosClienteNuevo;
module.exports.insertarCliente = insertarCliente;
