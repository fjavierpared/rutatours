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

module.exports = db;
