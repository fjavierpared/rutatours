const router = require('express').Router();
const db = require('../db');
const { httpError, textoRequerido } = require('../utils');
const { verificarPassword, generarToken, hashPassword, requiereSesion } = require('../auth_helper');

router.post('/login', async (req, res) => {
    const usuario = textoRequerido(req.body.usuario, 'El usuario', 50).toLowerCase();
    const password = String(req.body.password || '');
    if (!password) throw httpError(422, 'La contraseña es obligatoria');

    const [[u]] = await db.query(
        'SELECT id_usuario, nombre, usuario, password, rol, activo FROM usuario WHERE usuario = ?',
        [usuario]
    );

    if (!u || !verificarPassword(password, u.password)) throw httpError(401, 'Usuario o contraseña incorrectos');
    if (!u.activo) throw httpError(403, 'El usuario se encuentra inactivo. Consulte al administrador');

    const infoUsuario = { id_usuario: u.id_usuario, nombre: u.nombre, usuario: u.usuario, rol: u.rol };
    res.json({ message: 'Inicio de sesión exitoso', token: generarToken({ ...infoUsuario, tipo: 'usuario' }), usuario: infoUsuario });
});

router.get('/perfil', requiereSesion, async (req, res) => {
    const [[u]] = await db.query(
        'SELECT id_usuario, nombre, usuario, rol, activo FROM usuario WHERE id_usuario = ?',
        [req.usuario.id_usuario]
    );
    if (!u || !u.activo) throw httpError(401, 'Usuario no encontrado o inactivo');
    res.json({ usuario: u });
});

router.post('/cambiar-clave', requiereSesion, async (req, res) => {
    const passwordActual = String(req.body.password_actual || '');
    const passwordNueva = String(req.body.password_nueva || '');
    if (!passwordActual || !passwordNueva) throw httpError(422, 'Indique la contraseña actual y la nueva');
    if (passwordNueva.length < 4) throw httpError(422, 'La nueva contraseña debe tener al menos 4 caracteres');

    const [[u]] = await db.query('SELECT password FROM usuario WHERE id_usuario = ?', [req.usuario.id_usuario]);
    if (!u || !verificarPassword(passwordActual, u.password)) {
        throw httpError(400, 'La contraseña actual no es correcta');
    }

    await db.query('UPDATE usuario SET password = ? WHERE id_usuario = ?', [hashPassword(passwordNueva), req.usuario.id_usuario]);
    res.json({ message: 'Contraseña actualizada correctamente' });
});

module.exports = router;
