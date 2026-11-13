const mysql = require('mysql2/promise');

// Credenciales en backend/.env (ver .env.example)
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'plantilla',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    charset: 'utf8mb4'
});

// Misma zona horaria en MySQL que en Node (TZ, Ej.: America/Caracas): así NOW(), CURRENT_TIMESTAMP
// y las fechas de registro coinciden con la hora local aunque el servidor de MySQL esté en UTC.
function desfaseLocal() {
    const min = -new Date().getTimezoneOffset();
    const abs = Math.abs(min);
    return `${min < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
db.pool.on('connection', conn => {
    conn.query(`SET time_zone = '${desfaseLocal()}'`);
});

module.exports = db;
