const router = require('express').Router();
const db = require('../db');
const { httpError, textoRequerido, opcion, numeroValido } = require('../utils');
const { requiereSesion, requiereAdmin } = require('../auth_helper');

function validarColor(valor, campo) {
    if (!/^#[0-9a-f]{6}$/i.test(String(valor ?? ''))) throw httpError(422, `${campo}: color no válido`);
    return valor.toLowerCase();
}

// Público: el login muestra el nombre y los colores antes de iniciar sesión
router.get('/', async (req, res) => {
    const [[config]] = await db.query(
        'SELECT nombre_sistema, color_primario, color_secundario, color_acento, redondeo_modo, redondeo_paso FROM configuracion WHERE id = 1');
    res.json(config || {});
});

router.put('/', requiereSesion, requiereAdmin, async (req, res) => {
    const datos = {
        nombre_sistema: textoRequerido(req.body.nombre_sistema, 'El nombre del sistema', 60),
        color_primario: validarColor(req.body.color_primario, 'Color primario'),
        color_secundario: validarColor(req.body.color_secundario, 'Color secundario'),
        color_acento: validarColor(req.body.color_acento, 'Color de acento')
    };
    // Redondeo del precio por persona (opcional en el formulario de colores)
    if (req.body.redondeo_modo !== undefined) {
        datos.redondeo_modo = opcion(req.body.redondeo_modo, 'El modo de redondeo', ['ninguno', 'arriba', 'cercano']);
        datos.redondeo_paso = numeroValido(req.body.redondeo_paso, 'El paso de redondeo', { min: 0.01, max: 100 });
    }
    await db.query('UPDATE configuracion SET ? WHERE id = 1', [datos]);
    res.json({ message: 'Configuración guardada' });
});

module.exports = router;
