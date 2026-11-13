// Cuentas del sistema: sesiones, correos únicos entre equipo y clientes, y límite de intentos de ingreso
const db = require('../db');
const { httpError } = require('../utils');
const { generarToken } = require('../auth_helper');
const { crearLimitador } = require('../utils/limiteIntentos');

// ---------- Sesiones ----------

function sesionUsuario(u) {
    const info = { id_usuario: u.id_usuario, nombre: u.nombre, usuario: u.usuario, email: u.email || null, rol: u.rol };
    return { token: generarToken({ ...info, tipo: 'usuario' }), usuario: info };
}

function sesionCliente(c) {
    const info = { id_cliente: c.id_cliente, nombre: c.nombre, email: c.email };
    return { token: generarToken({ ...info, tipo: 'cliente' }), cliente: info };
}

// ---------- Correos únicos ----------

/**
 * Un correo identifica a UNA persona: o es del equipo (usuario) o es de un cliente, nunca de ambos.
 * Así el ingreso unificado sabe si llevarla al panel o al portal.
 * @param {string} email
 * @param {{ idUsuario?: number, idCliente?: number }} excluir  la propia cuenta al editar
 */
async function asegurarCorreoLibre(email, { idUsuario = 0, idCliente = 0 } = {}, conn = db) {
    if (!email) return;
    const [[u]] = await conn.query('SELECT id_usuario FROM usuario WHERE email = ? AND id_usuario <> ?', [email, idUsuario]);
    if (u) throw httpError(409, `El correo ${email} ya pertenece a un usuario del equipo. Use un correo distinto`);
    const [[c]] = await conn.query('SELECT id_cliente FROM cliente WHERE email = ? AND id_cliente <> ?', [email, idCliente]);
    if (c) throw httpError(409, `El correo ${email} ya pertenece a un cliente. Use un correo distinto`);
}

// ---------- Límite de intentos ----------
// Por cuenta (correo o usuario + IP): 5 fallos en 15 min bloquean 15 min.
// Por IP: 20 fallos en 15 min bloquean 15 min (frena a quien prueba muchas cuentas).
const porCuenta = crearLimitador({ maxFallos: 5 });
const porIp = crearLimitador({ maxFallos: 20 });

/** Verifica el límite antes de comprobar la clave. Devuelve funciones para registrar el resultado. */
function controlIngreso(req, identificador) {
    const ip = req.ip || 'sin-ip';
    const claveCuenta = `${String(identificador).toLowerCase()}|${ip}`;
    porIp.verificar(ip);
    porCuenta.verificar(claveCuenta);
    return {
        fallo() { porCuenta.fallo(claveCuenta); porIp.fallo(ip); },
        exito() { porCuenta.exito(claveCuenta); }
    };
}

module.exports = { sesionUsuario, sesionCliente, asegurarCorreoLibre, controlIngreso };
