// Guardado de imágenes enviadas como data URL (base64) dentro del JSON.
// Evita agregar dependencias (multer). Se valida el tipo real por los primeros bytes.
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { httpError } = require('../utils');

const CARPETA = path.join(__dirname, '..', '..', 'uploads');
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB por imagen

const FIRMAS = [
    { ext: 'jpg', ok: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { ext: 'png', ok: b => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { ext: 'webp', ok: b => b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' }
];

/**
 * Guarda una imagen "data:image/...;base64,...." en /uploads.
 * @returns {Promise<string>} nombre del archivo guardado
 */
async function guardarImagen(dataUrl, prefijo) {
    const m = /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw httpError(422, 'La imagen no tiene un formato válido');
    const buffer = Buffer.from(m[1], 'base64');
    if (buffer.length > MAX_BYTES) throw httpError(422, 'La imagen supera el máximo de 2 MB');
    const tipo = FIRMAS.find(f => f.ok(buffer));
    if (!tipo) throw httpError(422, 'Solo se permiten imágenes JPG, PNG o WEBP');

    await fs.mkdir(CARPETA, { recursive: true });
    const nombre = `${prefijo}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${tipo.ext}`;
    await fs.writeFile(path.join(CARPETA, nombre), buffer);
    return nombre;
}

async function borrarArchivo(nombre) {
    if (!nombre || nombre.includes('/') || nombre.includes('\\')) return;
    await fs.unlink(path.join(CARPETA, nombre)).catch(() => {});
}

module.exports = { guardarImagen, borrarArchivo, CARPETA };
