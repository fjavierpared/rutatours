// Ingreso unificado por correo (botón "Ingresar" del catálogo).
// El correo decide a dónde va la persona: usuario del equipo -> panel; cliente -> portal.
const router = require('express').Router();
const db = require('../db');
const { httpError, emailValido } = require('../utils');
const { verificarPassword } = require('../auth_helper');
const { sesionUsuario, sesionCliente, controlIngreso } = require('../services/cuentas');

// POST /api/acceso  { correo, password }  ->  { tipo: 'usuario' | 'cliente', token, usuario | cliente }
router.post('/', async (req, res) => {
    const correo = emailValido(req.body.correo ?? req.body.email, 'El correo', { requerido: true });
    const password = String(req.body.password || '');
    if (!password) throw httpError(422, 'La contraseña es obligatoria');
    const control = controlIngreso(req, correo);

    const [[u]] = await db.query(
        'SELECT id_usuario, nombre, usuario, email, password, rol, activo FROM usuario WHERE email = ?', [correo]);
    if (u) {
        if (!verificarPassword(password, u.password)) { control.fallo(); throw httpError(401, 'Correo o contraseña incorrectos'); }
        if (!u.activo) throw httpError(403, 'Su usuario está inactivo. Consulte al administrador');
        control.exito();
        return res.json({ tipo: 'usuario', message: `Bienvenido(a), ${u.nombre}`, ...sesionUsuario(u) });
    }

    const [[c]] = await db.query('SELECT id_cliente, nombre, email, password, activo FROM cliente WHERE email = ?', [correo]);
    if (!c || !verificarPassword(password, c.password)) { control.fallo(); throw httpError(401, 'Correo o contraseña incorrectos'); }
    if (!c.activo) throw httpError(403, 'Su cuenta está inactiva. Contáctenos');
    control.exito();
    res.json({ tipo: 'cliente', message: `Bienvenido(a), ${c.nombre}`, ...sesionCliente(c) });
});

module.exports = router;
