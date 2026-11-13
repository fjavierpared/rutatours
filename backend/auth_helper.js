const crypto = require('crypto');
const { httpError } = require('./utils');

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

// Exige token válido de USUARIO del sistema; deja los datos de la sesión en req.usuario
function requiereSesion(req, res, next) {
    const payload = tokenDeLaPeticion(req);
    if (!payload || payload.tipo !== 'usuario') return next(httpError(401, 'Sesión inválida o expirada'));
    req.usuario = payload;
    next();
}

// Exige token válido de CLIENTE; deja los datos en req.cliente
function requiereCliente(req, res, next) {
    const payload = tokenDeLaPeticion(req);
    if (!payload || payload.tipo !== 'cliente') return next(httpError(401, 'Inicie sesión como cliente para continuar'));
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
