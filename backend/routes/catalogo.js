// Catálogo PÚBLICO de rutas (clientes y visitantes). Nunca expone costos internos.
const router = require('express').Router();
const db = require('../db');
const { httpError, idValido } = require('../utils');
const servicio = require('../services/rutas');
const { tasaVigente, configuracionPrecios } = require('../services/tasa');

async function opcionesPrecio() {
    const tasa = await tasaVigente();
    return { tasa: tasa?.valor ?? null, redondeo: await configuracionPrecios(), tasaInfo: tasa };
}

async function rutaPublicable(id) {
    const ruta = await servicio.cargarRutaCompleta(id);
    if (!ruta || !ruta.activa) throw httpError(404, 'La ruta no existe o no está activa');
    return ruta;
}

// GET /api/rutas/disponibles  -> rutas activas y disponibles con precio "desde"
router.get('/disponibles', async (req, res) => {
    const opciones = await opcionesPrecio();
    const [ids] = await db.query('SELECT id_ruta FROM ruta WHERE activa = 1 AND disponible = 1 ORDER BY nombre');
    const rutas = [];
    for (const { id_ruta } of ids) {
        rutas.push(servicio.vistaPublica(await servicio.cargarRutaCompleta(id_ruta), opciones));
    }
    res.json({ tasa: opciones.tasaInfo, rutas });
});

router.get('/disponibles/:id', async (req, res) => {
    const opciones = await opcionesPrecio();
    const ruta = await rutaPublicable(idValido(req.params.id, 'La ruta'));
    res.json({ tasa: opciones.tasaInfo, ruta: servicio.vistaPublica(ruta, opciones) });
});

// POST /api/rutas/:id/calcular  { personas }  -> tabla de precios para el cliente
router.post('/:id/calcular', async (req, res) => {
    const opciones = await opcionesPrecio();
    const ruta = await rutaPublicable(idValido(req.params.id, 'La ruta'));
    const cot = servicio.cotizar(ruta, Number(req.body.personas), opciones);
    res.json({ personas: cot.personas, tasa: opciones.tasaInfo, ...cot.cliente });
});

module.exports = router;
