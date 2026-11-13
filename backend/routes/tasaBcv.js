// Tasa BCV: GET público (vigente); actualizar, cargar manual e historial requieren sesión de usuario
const router = require('express').Router();
const db = require('../db');
const { httpError, numeroValido, fechaTexto, hoy } = require('../utils');
const { requiereSesion } = require('../auth_helper');
const { tasaVigente } = require('../services/tasa');
const { obtenerTasaBcv } = require('../utils/bcv');

const VARIACION_MAXIMA = 0.30; // ±30% respecto a la vigente exige confirmación

// GET /api/tasa-bcv  -> tasa vigente (o null). Público: el catálogo la necesita.
router.get('/', async (req, res) => {
    const tasa = await tasaVigente();
    res.json({ tasa, hoy: hoy(), desactualizada: !tasa || (tasa.fecha_valor || tasa.registrado_en).slice(0, 10) < hoy() });
});

router.get('/historial', requiereSesion, async (req, res) => {
    const [rows] = await db.query(`
        SELECT t.id_tasa, t.valor, t.fuente, t.fecha_valor, t.registrado_en, u.nombre AS usuario
        FROM tasa_bcv t LEFT JOIN usuario u ON u.id_usuario = t.id_usuario
        ORDER BY t.registrado_en DESC, t.id_tasa DESC LIMIT 200`);
    res.json(rows);
});

async function registrar({ valor, fuente, fechaValor, idUsuario, confirmar }) {
    const vigente = await tasaVigente();
    if (vigente && vigente.valor === valor && (vigente.fecha_valor || null) === (fechaValor || null)) {
        return { tasa: vigente, nueva: false };
    }
    if (vigente && !confirmar && Math.abs(valor - vigente.valor) / vigente.valor > VARIACION_MAXIMA) {
        throw httpError(409, `La tasa ${valor} varía más de ${VARIACION_MAXIMA * 100}% respecto a la vigente (${vigente.valor}). Confirme para guardarla`);
    }
    await db.query('INSERT INTO tasa_bcv (valor, fuente, fecha_valor, id_usuario) VALUES (?, ?, ?, ?)',
        [valor, fuente, fechaValor, idUsuario]);
    return { tasa: await tasaVigente(), nueva: true };
}

// POST /api/tasa-bcv/actualizar  -> scraping de bcv.org.ve
router.post('/actualizar', requiereSesion, async (req, res) => {
    let leida;
    try {
        leida = await obtenerTasaBcv();
    } catch (err) {
        throw httpError(502, `${err.message}. Puede cargar la tasa manualmente`);
    }
    const r = await registrar({
        valor: leida.valor, fuente: 'scraping', fechaValor: leida.fechaValor,
        idUsuario: req.usuario.id_usuario, confirmar: req.body?.confirmar === true
    });
    res.json({
        ...r,
        sslVerificado: leida.sslVerificado,
        message: r.nueva ? `Tasa BCV actualizada: ${leida.valor} Bs/USD` : 'La tasa ya estaba al día'
    });
});

// POST /api/tasa-bcv/manual  { valor, fecha_valor?, confirmar? }  -> respaldo si el scraping falla
router.post('/manual', requiereSesion, async (req, res) => {
    const valor = numeroValido(req.body.valor, 'La tasa', { min: 0.0001, max: 1e9, decimales: 4 });
    const r = await registrar({
        valor, fuente: 'manual', fechaValor: fechaTexto(req.body.fecha_valor, 'La fecha valor', { requerida: false }),
        idUsuario: req.usuario.id_usuario, confirmar: req.body.confirmar === true
    });
    res.status(r.nueva ? 201 : 200).json({ ...r, message: r.nueva ? 'Tasa registrada manualmente' : 'La tasa ya estaba registrada' });
});

module.exports = router;
