// Rutas / planes: administración (montado con requiereSesion)
const router = require('express').Router();
const db = require('../db');
const { httpError, idValido, bool, enteroValido } = require('../utils');
const servicio = require('../services/rutas');
const { tasaVigente, configuracionPrecios } = require('../services/tasa');
const { guardarImagen, borrarArchivo } = require('../services/archivos');
const { problemasParaActivar } = require('../utils/reglasAgenda');

router.get('/', async (req, res) => {
    const [rows] = await db.query(`
        SELECT r.id_ruta, r.nombre, r.zona, r.dias, r.noches, r.min_personas, r.max_personas,
               r.disponible, r.activa, g.nombre AS guia, v.placa, v.capacidad,
               (SELECT COUNT(*) FROM ruta_parada p WHERE p.id_ruta = r.id_ruta) AS paradas,
               (SELECT COUNT(*) FROM agenda a WHERE a.id_ruta = r.id_ruta AND a.estado <> 'cancelada') AS reservas
        FROM ruta r
        LEFT JOIN guia g ON g.id_guia = r.id_guia
        LEFT JOIN vehiculo v ON v.id_vehiculo = r.id_vehiculo
        ORDER BY r.activa DESC, r.nombre`);
    res.json(rows);
});

router.get('/:id', async (req, res) => {
    const ruta = await servicio.cargarRutaCompleta(idValido(req.params.id, 'La ruta'));
    if (!ruta) throw httpError(404, 'La ruta no existe');
    ruta.problemas = problemasParaActivar(ruta, ruta);
    res.json(ruta);
});

router.post('/', async (req, res) => {
    const id = await servicio.guardarRuta(null, servicio.validarDatosRuta(req.body));
    res.status(201).json({ id_ruta: id, message: 'Ruta creada' });
});

router.put('/:id', async (req, res) => {
    const id = idValido(req.params.id, 'La ruta');
    await servicio.guardarRuta(id, servicio.validarDatosRuta(req.body));
    res.json({ id_ruta: id, message: 'Ruta actualizada' });
});

// Activar / desactivar o cambiar disponibilidad sin reenviar todo el formulario
router.patch('/:id/estado', async (req, res) => {
    const id = idValido(req.params.id, 'La ruta');
    const ruta = await servicio.cargarRutaCompleta(id);
    if (!ruta) throw httpError(404, 'La ruta no existe');
    const cambios = {};
    if ('activa' in req.body) cambios.activa = bool(req.body.activa);
    if ('disponible' in req.body) cambios.disponible = bool(req.body.disponible);
    if (cambios.activa) {
        const problemas = problemasParaActivar(ruta, ruta);
        if (problemas.length) throw httpError(422, `No se puede activar la ruta: ${problemas.join('; ')}`);
    }
    if (Object.keys(cambios).length) await db.query('UPDATE ruta SET ? WHERE id_ruta = ?', [cambios, id]);
    res.json({ message: 'Estado de la ruta actualizado' });
});

router.delete('/:id', async (req, res) => {
    const id = idValido(req.params.id, 'La ruta');
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM agenda WHERE id_ruta = ?', [id]);
    if (n) throw httpError(409, 'La ruta tiene reservas registradas: desactívela en lugar de eliminarla');
    const [imagenes] = await db.query('SELECT archivo FROM ruta_imagen WHERE id_ruta = ?', [id]);
    const [r] = await db.query('DELETE FROM ruta WHERE id_ruta = ?', [id]);
    if (!r.affectedRows) throw httpError(404, 'La ruta no existe');
    await Promise.all(imagenes.map(i => borrarArchivo(i.archivo)));
    res.json({ message: 'Ruta eliminada' });
});

// Vista previa del cálculo con desglose interno (costos, ganancia, redondeo)
router.post('/:id/cotizar', async (req, res) => {
    const ruta = await servicio.cargarRutaCompleta(idValido(req.params.id, 'La ruta'));
    if (!ruta) throw httpError(404, 'La ruta no existe');
    const tasa = await tasaVigente();
    const cot = servicio.cotizar(ruta, Number(req.body.personas), { redondeo: await configuracionPrecios(), tasa: tasa?.valor });
    res.json({ ...cot, tasaInfo: tasa });
});

// ---------- Imágenes ----------
router.post('/:id/imagenes', async (req, res) => {
    const id = idValido(req.params.id, 'La ruta');
    const [[existe]] = await db.query('SELECT id_ruta FROM ruta WHERE id_ruta = ?', [id]);
    if (!existe) throw httpError(404, 'La ruta no existe');
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM ruta_imagen WHERE id_ruta = ?', [id]);
    if (n >= 10) throw httpError(422, 'Cada ruta admite máximo 10 imágenes');
    const archivo = await guardarImagen(req.body.imagen, `ruta${id}`);
    const orden = req.body.orden != null ? enteroValido(req.body.orden, 'El orden') : n + 1;
    const [r] = await db.query('INSERT INTO ruta_imagen (id_ruta, archivo, orden) VALUES (?, ?, ?)', [id, archivo, orden]);
    res.status(201).json({ id_imagen: r.insertId, archivo, message: 'Imagen agregada' });
});

router.delete('/:id/imagenes/:idImagen', async (req, res) => {
    const id = idValido(req.params.id, 'La ruta');
    const idImagen = idValido(req.params.idImagen, 'La imagen');
    const [[img]] = await db.query('SELECT archivo FROM ruta_imagen WHERE id_imagen = ? AND id_ruta = ?', [idImagen, id]);
    if (!img) throw httpError(404, 'La imagen no existe');
    await db.query('DELETE FROM ruta_imagen WHERE id_imagen = ?', [idImagen]);
    await borrarArchivo(img.archivo);
    res.json({ message: 'Imagen eliminada' });
});

module.exports = router;
