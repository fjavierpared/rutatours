const router = require('express').Router();
const db = require('../db');
const {
    httpError, textoRequerido, textoOpcional, idValido, numeroValido, bool, emailValido, duplicado
} = require('../utils');

// Montado con requiereSesion (admin y operador)

router.get('/', async (req, res) => {
    const [rows] = await db.query(`
        SELECT g.*, (SELECT COUNT(*) FROM ruta r WHERE r.id_guia = g.id_guia) AS rutas_asignadas
        FROM guia g ORDER BY g.nombre`);
    res.json(rows);
});

function datosGuia(b) {
    return {
        nombre: textoRequerido(b.nombre, 'El nombre', 100),
        documento: textoRequerido(b.documento, 'El documento', 20).toUpperCase(),
        telefono: textoOpcional(b.telefono, 'El teléfono', 30),
        email: emailValido(b.email, 'El correo'),
        idiomas: textoOpcional(b.idiomas, 'Los idiomas', 150),
        licencia: textoOpcional(b.licencia, 'La licencia', 60),
        costo_dia_usd: numeroValido(b.costo_dia_usd, 'El costo por día'),
        activo: bool(b.activo),
        disponible: bool(b.disponible)
    };
}

router.post('/', async (req, res) => {
    const datos = datosGuia(req.body);
    const [r] = await db.query('INSERT INTO guia SET ?', [datos])
        .catch(err => duplicado(err, `Ya existe un guía con el documento ${datos.documento}`));
    res.status(201).json({ id_guia: r.insertId, message: 'Guía registrado' });
});

router.put('/:id', async (req, res) => {
    const id = idValido(req.params.id, 'El guía');
    const datos = datosGuia(req.body);
    const [r] = await db.query('UPDATE guia SET ? WHERE id_guia = ?', [datos, id])
        .catch(err => duplicado(err, `Ya existe un guía con el documento ${datos.documento}`));
    if (!r.affectedRows) throw httpError(404, 'El guía no existe');
    res.json({ message: 'Guía actualizado' });
});

router.delete('/:id', async (req, res) => {
    const id = idValido(req.params.id, 'El guía');
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM agenda WHERE id_guia = ?', [id]);
    if (n) throw httpError(409, 'El guía tiene reservas registradas: márquelo como inactivo en lugar de eliminarlo');
    const [r] = await db.query('DELETE FROM guia WHERE id_guia = ?', [id]);
    if (!r.affectedRows) throw httpError(404, 'El guía no existe');
    res.json({ message: 'Guía eliminado' });
});

module.exports = router;
