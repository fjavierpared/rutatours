/**
 * Límite de intentos fallidos (en memoria). Función pura salvo el reloj, que se puede inyectar
 * para las pruebas. Tras `maxFallos` fallos dentro de `ventanaMs`, la clave queda bloqueada
 * `bloqueoMs`. Un ingreso correcto limpia el contador.
 */
const { httpError } = require('../utils');

function crearLimitador({ maxFallos = 5, ventanaMs = 15 * 60 * 1000, bloqueoMs = 15 * 60 * 1000, ahora = Date.now } = {}) {
    const registros = new Map(); // clave -> { fallos, desde, bloqueadoHasta }

    function limpiarVencidos() {
        const t = ahora();
        for (const [k, r] of registros) {
            if ((r.bloqueadoHasta || 0) <= t && t - r.desde > ventanaMs) registros.delete(k);
        }
    }

    return {
        /** Lanza 429 si la clave está bloqueada. */
        verificar(clave) {
            const r = registros.get(clave);
            const t = ahora();
            if (r?.bloqueadoHasta > t) {
                const minutos = Math.ceil((r.bloqueadoHasta - t) / 60000);
                throw httpError(429, `Demasiados intentos fallidos. Intente de nuevo en ${minutos} minuto${minutos === 1 ? '' : 's'}`);
            }
        },
        fallo(clave) {
            const t = ahora();
            let r = registros.get(clave);
            if (!r || t - r.desde > ventanaMs) r = { fallos: 0, desde: t, bloqueadoHasta: 0 };
            r.fallos++;
            if (r.fallos >= maxFallos) r.bloqueadoHasta = t + bloqueoMs;
            registros.set(clave, r);
            if (registros.size > 5000) limpiarVencidos();
        },
        exito(clave) {
            registros.delete(clave);
        },
        get tamano() { return registros.size; }
    };
}

module.exports = { crearLimitador };
