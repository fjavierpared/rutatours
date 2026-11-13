// Error con código HTTP; el manejador de server.js responde con su mensaje
function httpError(status, message) {
    const err = new Error(message);
    err.status = status;
    return err;
}

// Texto obligatorio: recorta espacios y valida largo máximo
function textoRequerido(valor, campo, max) {
    const texto = String(valor ?? '').trim().replace(/\s+/g, ' ');
    if (!texto) throw httpError(422, `${campo} es obligatorio`);
    if (texto.length > max) throw httpError(422, `${campo} admite máximo ${max} caracteres`);
    return texto;
}

function idValido(valor, campo) {
    const id = Number(valor);
    if (!Number.isInteger(id) || id <= 0) throw httpError(422, `${campo} es obligatorio`);
    return id;
}

// Fecha AAAA-MM-DD válida (sin depender de la zona horaria)
function fechaValida(valor, campo) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor ?? ''));
    const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (!d || d.getUTCMonth() !== +m[2] - 1) throw httpError(422, `${campo} no es una fecha válida`);
    return d;
}

// Fecha de hoy en hora local del servidor, AAAA-MM-DD
function hoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Texto opcional: null si viene vacío
function textoOpcional(valor, campo, max) {
    const texto = String(valor ?? '').trim().replace(/\s+/g, ' ');
    if (!texto) return null;
    if (texto.length > max) throw httpError(422, `${campo} admite máximo ${max} caracteres`);
    return texto;
}

// Texto largo opcional (conserva saltos de línea)
function textoLargo(valor, campo, max) {
    const texto = String(valor ?? '').trim();
    if (!texto) return null;
    if (texto.length > max) throw httpError(422, `${campo} admite máximo ${max} caracteres`);
    return texto;
}

// Número decimal >= min (montos USD, porcentajes, tasas)
function numeroValido(valor, campo, { min = 0, max = 1e9, decimales = 2 } = {}) {
    const n = Number(String(valor ?? '').replace(',', '.'));
    if (valor === '' || valor == null || !Number.isFinite(n)) throw httpError(422, `${campo} debe ser un número`);
    if (n < min) throw httpError(422, `${campo} no puede ser menor que ${min}`);
    if (n > max) throw httpError(422, `${campo} no puede ser mayor que ${max}`);
    return Math.round(n * 10 ** decimales) / 10 ** decimales;
}

function enteroValido(valor, campo, { min = 0, max = 65535 } = {}) {
    const n = Number(valor);
    if (!Number.isInteger(n)) throw httpError(422, `${campo} debe ser un número entero`);
    if (n < min || n > max) throw httpError(422, `${campo} debe estar entre ${min} y ${max}`);
    return n;
}

// 1/0 a partir de true/false/"1"/"0"
function bool(valor) {
    return valor === true || valor === 1 || valor === '1' || valor === 'true' ? 1 : 0;
}

function emailValido(valor, campo, { requerido = false } = {}) {
    const email = String(valor ?? '').trim().toLowerCase();
    if (!email) {
        if (requerido) throw httpError(422, `${campo} es obligatorio`);
        return null;
    }
    if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(422, `${campo} no es válido`);
    return email;
}

// Uno de los valores permitidos
function opcion(valor, campo, permitidas) {
    if (!permitidas.includes(valor)) throw httpError(422, `${campo} no es válido`);
    return valor;
}

function horaValida(valor, campo) {
    const t = String(valor ?? '').trim();
    if (!t) return null;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.slice(0, 5))) throw httpError(422, `${campo}: hora no válida (HH:MM)`);
    return t.slice(0, 5);
}

// Fecha AAAA-MM-DD validada, devuelta como texto (o null si viene vacía y es opcional)
function fechaTexto(valor, campo, { requerida = true } = {}) {
    if (!valor && !requerida) return null;
    fechaValida(valor, campo);
    return String(valor);
}

// Error de clave única de MySQL -> 409 con mensaje legible
function duplicado(err, mensaje) {
    if (err && err.code === 'ER_DUP_ENTRY') throw httpError(409, mensaje);
    throw err;
}

module.exports = {
    httpError, textoRequerido, idValido, fechaValida, hoy,
    textoOpcional, textoLargo, numeroValido, enteroValido, bool, emailValido, opcion, horaValida, fechaTexto, duplicado
};
