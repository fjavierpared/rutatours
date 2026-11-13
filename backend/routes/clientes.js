// Portal de CLIENTES: registro e inicio de sesión. Independiente de los usuarios del sistema.
const router = require('express').Router();
const db = require('../db');
const { httpError, textoRequerido, textoOpcional, emailValido, duplicado } = require('../utils');
const { hashPassword, verificarPassword, generarToken, requiereCliente } = require('../auth_helper');

function sesionCliente(c) {
    const info = { id_cliente: c.id_cliente, nombre: c.nombre, email: c.email };
    return { token: generarToken({ ...info, tipo: 'cliente' }), cliente: info };
}

router.post('/register', async (req, res) => {
    const datos = {
        nombre: textoRequerido(req.body.nombre, 'El nombre', 100),
        documento: textoRequerido(req.body.documento, 'La cédula o pasaporte', 20).toUpperCase(),
        email: emailValido(req.body.email, 'El correo', { requerido: true }),
        telefono: textoOpcional(req.body.telefono, 'El teléfono', 30)
    };
    const password = String(req.body.password || '');
    if (password.length < 6) throw httpError(422, 'La contraseña debe tener al menos 6 caracteres');

    const [r] = await db.query('INSERT INTO cliente SET ?', [{ ...datos, password: hashPassword(password) }])
        .catch(err => duplicado(err, 'Ya existe una cuenta con ese correo o documento. Inicie sesión'));
    res.status(201).json({ message: 'Cuenta creada', ...sesionCliente({ id_cliente: r.insertId, ...datos }) });
});

router.post('/login', async (req, res) => {
    const email = emailValido(req.body.email, 'El correo', { requerido: true });
    const [[c]] = await db.query('SELECT id_cliente, nombre, email, password, activo FROM cliente WHERE email = ?', [email]);
    if (!c || !verificarPassword(String(req.body.password || ''), c.password)) throw httpError(401, 'Correo o contraseña incorrectos');
    if (!c.activo) throw httpError(403, 'Su cuenta está inactiva. Contáctenos');
    res.json({ message: 'Bienvenido(a)', ...sesionCliente(c) });
});

router.get('/perfil', requiereCliente, async (req, res) => {
    const [[c]] = await db.query(
        'SELECT id_cliente, nombre, documento, email, telefono, activo FROM cliente WHERE id_cliente = ?', [req.cliente.id_cliente]);
    if (!c || !c.activo) throw httpError(401, 'Cuenta no encontrada o inactiva');
    res.json({ cliente: c });
});

module.exports = router;
