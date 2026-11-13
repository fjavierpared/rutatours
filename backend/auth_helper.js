const crypto = require('crypto');
const { httpError } = require('./utils');
// Carga diferida: así las pruebas que solo usan hash/token no abren la conexión a MySQL
const db = () => require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'plantilla_secreto_cambiar_en_env';
if (!process.env.JWT_SECRET) console.warn('⚠️  JWT_SECRET no definido en .env: se usa un secreto por defecto');

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verificarPassword(password, stored) {
    if (!stored || !stored.includes(':')) return false;
    const [salt, key] = stored.split(':');
    const keyBuffer = Buffer.from(key, 'hex');
    const matchBuffer = crypto.scryptSync(String(password), salt, 64);
    if (keyBuffer.length !== matchBuffer.length) return false;
    return crypto.timingSafeEqual(keyBuffer, matchBuffer);
}

function generarToken(payload) {
    const data = {
        ...payload,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 días de validez
    };
    const body = Buffer.from(JSON.stringify(data)).toString('base64url');
    const firma = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
    return `${body}.${firma}`;
}

function verificarToken(token) {
    if (!token || typeof token !== 'string') return null;
    const partes = token.split('.');
    if (partes.length !== 2) return null;
    const [body, firma] = partes;
    const firmaEsperada = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
    const a = Buffer.from(firma);
    const b = Buffer.from(firmaEsperada);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (payload.exp && Date.now() > payload.exp) return null;
        return payload;
    } catch {
        return null;
    }
}

// --- MIDDLEWARES ---

// Los tokens llevan "tipo": 'usuario' (panel) o 'cliente' (portal). Un token de cliente
// NUNCA sirve para el panel y viceversa, aunque ambos estén firmados con el mismo secreto.
function tokenDeLaPeticion(req) {
    const auth = req.headers.authorization || '';
    return verificarToken(auth.startsWith('Bearer ') ? auth.slice(7) : null);
}

// El token no basta: se confirma en la base que la cuenta siga existiendo y activa, para que
// desactivar a alguien corte su sesión al instante (y no a los 7 días, cuando vence el token).

// Exige token válido de USUARIO del sistema; deja los datos de la sesión en req.usuario
async function requiereSesion(req, res, next) {
    const payload = tokenDeLaPeticion(req);
    if (!payload || payload.tipo !== 'usuario') return next(httpError(401, 'Sesión inválida o expirada'));
    const [[u]] = await db().query('SELECT rol, activo FROM usuario WHERE id_usuario = ?', [payload.id_usuario]);
    if (!u || !u.activo) return next(httpError(401, 'Su usuario está inactivo o ya no existe'));
    req.usuario = { ...payload, rol: u.rol }; // el rol vigente, por si un admin lo cambió
    next();
}

// Exige token válido de CLIENTE; deja los datos en req.cliente
async function requiereCliente(req, res, next) {
    const payload = tokenDeLaPeticion(req);
    if (!payload || payload.tipo !== 'cliente') return next(httpError(401, 'Inicie sesión como cliente para continuar'));
    const [[c]] = await db().query('SELECT activo FROM cliente WHERE id_cliente = ?', [payload.id_cliente]);
    if (!c || !c.activo) return next(httpError(401, 'Su cuenta está inactiva. Contáctenos'));
    req.cliente = payload;
    next();
}

// Usar después de requiereSesion
function requiereAdmin(req, res, next) {
    if (req.usuario?.rol !== 'admin') return next(httpError(403, 'Acción permitida solo a administradores'));
    next();
}

module.exports = {
    hashPassword,
    verificarPassword,
    generarToken,
    verificarToken,
    requiereSesion,
    requiereCliente,
    requiereAdmin
};
