require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const path = require('path');
const db = require('./db');
const { hashPassword, requiereSesion, requiereAdmin, requiereCliente } = require('./auth_helper');

const app = express();
// Detrás de Cloudflare + nginx (red interna de Docker): req.ip es la IP real del visitante
app.set('trust proxy', 'loopback, uniquelocal');
// 5 MB: las imágenes (máx. 2 MB) llegan como base64 dentro del JSON
app.use(express.json({ limit: '5mb' }));

// El código del backend (rutas, schema, .env) nunca se sirve como archivo estático
app.use('/backend', (req, res) => res.status(404).end());

// Frontend desde la raíz del proyecto:
//   /        -> portal del cliente (catálogo): lo primero que ve cualquier visitante
//   /admin   -> panel de administración (login del personal)
const RAIZ = path.join(__dirname, '..');
app.get('/', (req, res) => res.sendFile(path.join(RAIZ, 'cliente.html')));
app.get('/admin', (req, res) => {
    // Con barra final ("/admin/") las rutas relativas del panel (css/, js/) apuntarían a /admin/css: se corrige
    if (req.originalUrl.split('?')[0].endsWith('/')) return res.redirect(302, '/admin');
    res.sendFile(path.join(RAIZ, 'index.html'));
});
// Direcciones anteriores: siguen funcionando
app.get('/index.html', (req, res) => res.redirect(302, '/admin'));
app.get('/cliente.html', (req, res) => res.redirect(302, '/'));
app.use(express.static(RAIZ, { index: false }));

// ==========================================
// RUTAS DE LA API
// ==========================================
// Públicas / con control propio
app.use('/api/auth', require('./routes/auth'));
app.use('/api/configuracion', require('./routes/configuracion')); // GET público (nombre y colores del login)

// Solo administradores
app.use('/api/usuarios', requiereSesion, requiereAdmin, require('./routes/usuarios'));

// --- Públicas (catálogo y portal de clientes) ---
app.use('/api/tasa-bcv', require('./routes/tasaBcv'));          // GET público; actualizar/manual/historial con sesión
app.use('/api/rutas', require('./routes/catalogo'));            // /disponibles y /:id/calcular (antes del CRUD)
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/acceso', require('./routes/acceso'));                  // ingreso unificado por correo         // register, login, perfil

// --- Solo CLIENTES (token tipo 'cliente') ---
app.use('/api/agendas', requiereCliente, require('./routes/agendas'));
app.use('/api/pagos', requiereCliente, require('./routes/pagos'));

// --- Usuarios del sistema: admin y operador tienen el mismo acceso ---
app.use('/api/guias', requiereSesion, require('./routes/guias'));
app.use('/api/vehiculos', requiereSesion, require('./routes/vehiculos'));
app.use('/api/rutas', requiereSesion, require('./routes/rutas'));
app.use('/api/admin', requiereSesion, require('./routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Errores no controlados: respuesta JSON uniforme
app.use((err, req, res, next) => {
    if (!err.status) console.error('⚠️', err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Error interno del servidor' });
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;

// Correo del administrador inicial (se puede cambiar luego desde Usuarios)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin1234@gmail.com').toLowerCase();

// Cambios de estructura en bases ya instaladas (se aplican solos al iniciar)
async function migraciones() {
    const [[{ n }]] = await db.query(`SELECT COUNT(*) AS n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'usuario' AND column_name = 'email'`);
    if (!n) {
        await db.query('ALTER TABLE usuario ADD COLUMN email VARCHAR(120) NULL AFTER usuario, ADD UNIQUE KEY uq_usuario_email (email)');
        console.log('🛠️  Migración: columna usuario.email agregada');
    }
}

// Si no existe ningún usuario, crea admin / admin123 para el primer ingreso.
// Si el usuario "admin" no tiene correo, se le asigna ADMIN_EMAIL (si nadie más lo usa).
async function crearAdminInicial() {
    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM usuario');
    if (total === 0) {
        await db.query(
            "INSERT INTO usuario (nombre, usuario, email, password, rol, activo) VALUES ('Administrador', 'admin', ?, ?, 'admin', 1)",
            [ADMIN_EMAIL, hashPassword('admin123')]
        );
        console.log(`👤 Usuario inicial creado: ${ADMIN_EMAIL} (o "admin") / admin123 (cámbiela al ingresar)`);
        return;
    }
    const [[enUso]] = await db.query(
        'SELECT (SELECT COUNT(*) FROM usuario WHERE email = ?) + (SELECT COUNT(*) FROM cliente WHERE email = ?) AS n', [ADMIN_EMAIL, ADMIN_EMAIL]);
    if (!enUso.n) {
        const [r] = await db.query("UPDATE usuario SET email = ? WHERE usuario = 'admin' AND email IS NULL", [ADMIN_EMAIL]);
        if (r.affectedRows) console.log(`👤 Correo del usuario admin: ${ADMIN_EMAIL}`);
    }
}

db.query('SELECT 1')
    .then(() => console.log('✅ Conectado a MySQL - Base de datos:', process.env.DB_NAME))
    .then(migraciones)
    .then(crearAdminInicial)
    .catch(err => console.error('❌ Error de base de datos:', err.message));

// HOST=127.0.0.1 en producción: solo Nginx llega al puerto; 0.0.0.0 permite entrar desde la red local
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}/`);
});
