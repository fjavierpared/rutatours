/**
 * Utilidades de moneda (USD como referencia, VES con tasa BCV).
 *
 * Regla general: TODO cálculo se hace en CENTAVOS ENTEROS para evitar errores de
 * coma flotante (0.1 + 0.2 !== 0.3). Solo se convierte a decimales para guardar
 * en la base de datos (DECIMAL) o para mostrar.
 */

const ERROR_TASA = 'No hay tasa BCV registrada. El administrador debe actualizarla o cargarla manualmente';

/** USD (número o texto "12.50") -> centavos enteros. */
function aCentavos(monto) {
    const n = Number(monto);
    if (!Number.isFinite(n)) throw new TypeError(`Monto inválido: ${monto}`);
    return Math.round(n * 100);
}

/** centavos enteros -> número con 2 decimales (para la BD o JSON). */
function deCentavos(centavos) {
    return Math.round(centavos) / 100;
}

/**
 * Porcentaje de un monto en centavos, redondeado al centavo (mitad hacia arriba).
 * pct en escala 0-100 (16 = 16%).
 */
function porcentajeCentavos(centavos, pct) {
    // toFixed evita que 7687.5 * 16 / 100 = 1229.9999... redondee hacia abajo
    return Math.round(Number((centavos * Number(pct) / 100).toFixed(6)));
}

/**
 * Redondeo comercial del precio publicado.
 *  modo 'ninguno' -> al centavo
 *  modo 'arriba'  -> hacia arriba al múltiplo de "paso" (Ej.: 89,18 con paso 0,10 -> 89,20)
 *  modo 'cercano' -> al múltiplo más cercano de "paso"
 * @param {number} centavos  puede traer fracción (Ej.: 8917.5)
 * @param {string} modo
 * @param {number} pasoUsd   Ej.: 0.10, 0.50, 1
 */
function redondearPrecio(centavos, modo = 'ninguno', pasoUsd = 0.01) {
    const paso = Math.max(1, aCentavos(pasoUsd || 0.01));
    const exacto = Number(centavos.toFixed(6));
    if (modo === 'arriba') return Math.ceil(exacto / paso) * paso;
    if (modo === 'cercano') return Math.round(exacto / paso) * paso;
    return Math.round(exacto);
}

/** Valida y normaliza una tasa BCV (Bs por 1 USD). Devuelve número o lanza error. */
function tasaValida(tasa) {
    const n = Number(tasa);
    if (!Number.isFinite(n) || n <= 0) throw new Error(ERROR_TASA);
    return n;
}

/**
 * Convierte USD -> VES con la tasa BCV.
 * Ej.: usdAVes(20, 1000) === 20000
 * @param {number} usd   monto en dólares
 * @param {number} tasa  Bs por 1 USD
 * @returns {number} bolívares con 2 decimales
 */
function usdAVes(usd, tasa) {
    const t = tasaValida(tasa);
    return deCentavos(Math.round(Number((aCentavos(usd) * t).toFixed(4))));
}

/** Igual que usdAVes pero devuelve null si no hay tasa (para mostrar "Bs no disponible"). */
function usdAVesSeguro(usd, tasa) {
    try { return usdAVes(usd, tasa); } catch { return null; }
}

const fmt = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 20 -> "20,00 $" */
function formatoUsd(usd) { return `${fmt.format(Number(usd) || 0)} $`; }

/** 20000 -> "20.000,00 Bs" */
function formatoVes(ves) { return ves == null ? 'Bs no disponible' : `${fmt.format(Number(ves))} Bs`; }

module.exports = {
    ERROR_TASA,
    aCentavos,
    deCentavos,
    porcentajeCentavos,
    redondearPrecio,
    tasaValida,
    usdAVes,
    usdAVesSeguro,
    formatoUsd,
    formatoVes
};
