/**
 * Obtención de la tasa oficial USD del BCV por scraping de https://www.bcv.org.ve
 *
 * El BCV NO ofrece una API REST oficial. Se descarga la página de inicio y se lee
 * el bloque <div id="dolar"> ... <strong> 36,1234 </strong>, más la "Fecha Valor".
 *
 * RIESGOS (ver también README):
 *  1. Si el BCV cambia el HTML, el selector deja de funcionar -> se usa la carga manual.
 *  2. El sitio suele publicar una cadena de certificados SSL incompleta: Node rechaza la
 *     conexión ("unable to get local issuer certificate"). Opciones, de más a menos segura:
 *       a) BCV_CA_EXTRA=/ruta/certificado-intermedio.pem  (se agrega solo para esta petición)
 *       b) BCV_SSL_INSEGURO=1  (desactiva la verificación SOLO para esta petición; un atacante
 *          en la red podría falsear la tasa, por eso el admin ve y confirma el valor)
 *  3. El sitio puede estar caído, lento o bloquear IPs fuera de Venezuela -> timeout y error claro.
 *  4. La "Fecha Valor" puede ser de un día futuro (el BCV publica la tasa del siguiente día hábil).
 */

const https = require('https');
const fs = require('fs');
const tls = require('tls');
const cheerio = require('cheerio');

const URL_BCV = 'https://www.bcv.org.ve/';
const TIEMPO_MAXIMO_MS = 15000;
const ERRORES_CERTIFICADO = new Set([
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'CERT_HAS_EXPIRED'
]);

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8,
    septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

/** "36,12340000" | "1.234,56" -> 36.1234 | 1234.56 */
function numeroVenezolano(texto) {
    const limpio = String(texto).replace(/[^\d.,]/g, '');
    if (!limpio) return NaN;
    return Number(limpio.replace(/\./g, '').replace(',', '.'));
}

/**
 * Extrae la tasa y la fecha valor del HTML del BCV.
 * @param {string} html
 * @returns {{valor: number, fechaValor: string|null}}  fechaValor AAAA-MM-DD
 * @throws Error si no encuentra un valor válido
 */
function extraerTasa(html) {
    const $ = cheerio.load(html);
    let valor = numeroVenezolano($('#dolar strong').first().text());

    // Respaldo: buscar "USD" seguido de un número en el bloque de tipo de cambio
    if (!(valor > 0)) {
        const m = /USD[\s\S]{0,300}?<strong>\s*([\d.,]+)\s*<\/strong>/i.exec(html);
        if (m) valor = numeroVenezolano(m[1]);
    }
    if (!(valor > 0)) throw new Error('No se encontró la tasa del dólar en la página del BCV (el formato pudo cambiar)');

    // Fecha valor: atributo content="2026-11-13T00:00:00-04:00" o texto "Viernes, 13 Noviembre 2026"
    let fechaValor = null;
    const nodoFecha = $('.date-display-single').first();
    const content = nodoFecha.attr('content');
    if (content && /^\d{4}-\d{2}-\d{2}/.test(content)) {
        fechaValor = content.slice(0, 10);
    } else {
        const m = /(\d{1,2})\s+([a-záéíóú]+)\s+(\d{4})/i.exec(nodoFecha.text() || '');
        const mes = m && MESES[m[2].toLowerCase()];
        if (mes) fechaValor = `${m[3]}-${String(mes).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }

    return { valor: Math.round(valor * 10000) / 10000, fechaValor };
}

function descargar(url, opcionesTls = {}) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            timeout: TIEMPO_MAXIMO_MS,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RutaTours/1.0)', 'Accept': 'text/html' },
            ...opcionesTls
        }, res => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`El BCV respondió con código ${res.statusCode}`));
            }
            res.setEncoding('utf8');
            let html = '';
            res.on('data', d => { html += d; if (html.length > 5e6) req.destroy(new Error('Respuesta demasiado grande')); });
            res.on('end', () => resolve(html));
        });
        req.on('timeout', () => req.destroy(new Error('El BCV no respondió a tiempo')));
        req.on('error', reject);
    });
}

/**
 * Descarga y lee la tasa del día.
 * @returns {Promise<{valor: number, fechaValor: string|null, sslVerificado: boolean}>}
 */
async function obtenerTasaBcv() {
    const opciones = {};
    if (process.env.BCV_CA_EXTRA) {
        opciones.ca = [...tls.rootCertificates, fs.readFileSync(process.env.BCV_CA_EXTRA, 'utf8')];
    }

    let html;
    let sslVerificado = true;
    try {
        html = await descargar(URL_BCV, opciones);
    } catch (err) {
        if (ERRORES_CERTIFICADO.has(err.code) && process.env.BCV_SSL_INSEGURO === '1') {
            sslVerificado = false;
            html = await descargar(URL_BCV, { rejectUnauthorized: false });
        } else if (ERRORES_CERTIFICADO.has(err.code)) {
            throw new Error('El certificado SSL del BCV no se pudo verificar. Configure BCV_CA_EXTRA o BCV_SSL_INSEGURO=1 en .env, o cargue la tasa manualmente');
        } else {
            throw new Error(`No se pudo consultar el BCV: ${err.message}`);
        }
    }
    return { ...extraerTasa(html), sslVerificado };
}

module.exports = { obtenerTasaBcv, extraerTasa, numeroVenezolano };
