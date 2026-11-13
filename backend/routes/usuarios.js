const router = require('express').Router();
const db = require('../db');
const { httpError, textoRequerido, idValido, emailValido } = require('../utils');
const { hashPassword } = require('../auth_helper');
const { asegurarCorreoLibre } = require('../services/cuentas');

// Montado en server.js con requiereSesion + requiereAdmin: req.usuario es el admin en sesión

router.get('/', async (req, res) => {
    const [rows] = await db.query(`
        SELECT id_usuario, nombre, usuario, email, rol, activo, creado_en, actualizado_en
        FROM usuario
        ORDER BY nombre
    `);
    res.json(rows);
});

async function validarUsername(usuario, idExcluir = 0) {
    const [rows] = await db.query('SELECT id_usuario FROM usuario WHERE usuario = ? AND id_usuario <> ?', [usuario, idExcluir]);
    if (rows.length) throw httpError(409, `El nombre de usuario "${usuario}" ya está en uso`);
}

router.post('/', async (req, res) => {
    const nombre = textoRequerido(req.body.nombre, 'El nombre', 100);
    const usuario = textoRequerido(req.body.usuario, 'El nombre de usuario', 50).toLowerCase();
    const password = String(req.body.password || '');
    if (!password || password.length < 4) throw httpError(422, 'La contraseña debe tener al menos 4 caracteres');
    const rol = req.body.rol === 'operador' ? 'operador' : 'admin';
    const activo = req.body.activo === 0 || req.body.activo === false ? 0 : 1;

    const email = emailValido(req.body.email, 'El correo', { requerido: true });
    await validarUsername(usuario);
    await asegurarCorreoLibre(email);
    const hash = hashPassword(password);
    const [result] = await db.query(
        'INSERT INTO usuario (nombre, usuario, email, password, rol, activo) VALUES (?, ?, ?, ?, ?, ?)',
        [nombre, usuario, email, hash, rol, activo]
    );
    res.status(201).json({ id_usuario: result.insertId, message: 'Usuario creado exitosamente' });
});

router.put('/:id', async (req, res) => {
    const id = idValido(req.params.id, 'El usuario');
    const nombre = textoRequerido(req.body.nombre, 'El nombre', 100);
    const usuario = textoRequerido(req.body.usuario, 'El nombre de usuario', 50).toLowerCase();
    const rol = req.body.rol === 'operador' ? 'operador' : 'admin';
    const activo = req.body.activo === 0 || req.body.activo === false ? 0 : 1;

    const email = emailValido(req.body.email, 'El correo', { requerido: true });
    await validarUsername(usuario, id);
    await asegurarCorreoLibre(email, { idUsuario: id });

    const sesion = req.usuario;
    if (sesion.id_usuario === id && !activo) {
        throw httpError(400, 'No puedes desactivar tu propio usuario en sesión');
    }

    // No dejar el sistema sin administradores activos
    if (rol !== 'admin' || !activo) {
        const [[{ otros }]] = await db.query("SELECT COUNT(*) AS otros FROM usuario WHERE rol = 'admin' AND activo = 1 AND id_usuario <> ?", [id]);
        if (otros === 0) throw httpError(400, 'Debe existir al menos un administrador activo en el sistema');
    }

    const password = req.body.password ? String(req.body.password).trim() : '';
    if (password && password.length < 4) {
        throw httpError(422, 'La contraseña debe tener al menos 4 caracteres');
    }

    if (password) {
        const hash = hashPassword(password);
        await db.query(
            'UPDATE usuario SET nombre = ?, usuario = ?, email = ?, password = ?, rol = ?, activo = ? WHERE id_usuario = ?',
            [nombre, usuario, email, hash, rol, activo, id]
        );
    } else {
        await db.query(
            'UPDATE usuario SET nombre = ?, usuario = ?, email = ?, rol = ?, activo = ? WHERE id_usuario = ?',
            [nombre, usuario, email, rol, activo, id]
        );
    }

    res.json({ message: 'Usuario actualizado exitosamente' });
});

// Activar o desactivar (solo admins, montado con requiereAdmin). Es la única forma de dar de baja a un administrador.
router.patch('/:id/estado', async (req, res) => {
    const id = idValido(req.params.id, 'El usuario');
    const activo = req.body.activo === 0 || req.body.activo === false ? 0 : 1;
    if (req.usuario.id_usuario === id && !activo) throw httpError(400, 'No puedes desactivar tu propio usuario: debe hacerlo otro administrador');

    const [[target]] = await db.query('SELECT rol FROM usuario WHERE id_usuario = ?', [id]);
    if (!target) throw httpError(404, 'El usuario no existe');
    if (target.rol === 'admin' && !activo) {
        const [[{ otros }]] = await db.query("SELECT COUNT(*) AS otros FROM usuario WHERE rol = 'admin' AND activo = 1 AND id_usuario <> ?", [id]);
        if (otros === 0) throw httpError(400, 'Debe existir al menos un administrador activo en el sistema');
    }
    await db.query('UPDATE usuario SET activo = ? WHERE id_usuario = ?', [activo, id]);
    res.json({ message: activo ? 'Usuario activado' : 'Usuario desactivado: ya no puede ingresar al panel' });
});

// Solo se eliminan operadores. Los administradores no se borran: otro administrador los desactiva.
router.delete('/:id', async (req, res) => {
    const id = idValido(req.params.id, 'El usuario');
    if (req.usuario.id_usuario === id) {
        throw httpError(400, 'No puedes eliminar tu propio usuario en sesión');
    }

    const [[target]] = await db.query('SELECT rol FROM usuario WHERE id_usuario = ?', [id]);
    if (!target) throw httpError(404, 'El usuario no existe');
    if (target.rol === 'admin') {
        throw httpError(403, 'Los administradores no se pueden eliminar. Si ya no debe tener acceso, desactívelo');
    }

    await db.query('DELETE FROM usuario WHERE id_usuario = ?', [id]);
    res.json({ message: 'Usuario eliminado exitosamente' });
});

module.exports = router;

