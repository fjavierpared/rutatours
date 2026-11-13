// Tasa BCV vigente (último registro) y configuración de redondeo
const db = require('../db');

/** Último registro de tasa o null si nunca se ha cargado. */
async function tasaVigente(conn = db) {
    const [[t]] = await conn.query(
        `SELECT id_tasa, valor, fuente, fecha_valor, registrado_en
         FROM tasa_bcv ORDER BY registrado_en DESC, id_tasa DESC LIMIT 1`);
    return t ? { ...t, valor: Number(t.valor) } : null;
}

async function configuracionPrecios(conn = db) {
    const [[c]] = await conn.query('SELECT redondeo_modo, redondeo_paso FROM configuracion WHERE id = 1');
    return { modo: c?.redondeo_modo || 'ninguno', paso: Number(c?.redondeo_paso) || 0.01 };
}

module.exports = { tasaVigente, configuracionPrecios };
