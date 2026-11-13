const router = require('express').Router();
const db = require('../db');
const {
    httpError, textoRequerido, textoOpcional, idValido, numeroValido, enteroValido, bool, duplicado
} = require('../utils');

// Montado con requiereSesion (admin y operador)

router.get('/', async (req, res) => {
    const [rows] = await db.query(`
        SELECT v.*, (SELECT COUNT(*) FROM ruta r WHERE r.id_vehiculo = v.id_vehiculo) AS rutas_asignadas
        FROM vehiculo v ORDER BY v.placa`);
    res.json(rows);
});

function datosVehiculo(b) {
    return {
        placa: textoRequerido(b.placa, 'La placa', 15).toUpperCase().replace(/\s/g, ''),
        tipo: textoRequerido(b.tipo, 'El tipo', 40),
        marca: textoOpcional(b.marca, 'La marca', 50),
        modelo: textoOpcional(b.modelo, 'El modelo', 50),
        capacidad: enteroValido(b.capacidad, 'La capacidad', { min: 1, max: 500 }),
        costo_transporte_dia_usd: numeroValido(b.costo_transporte_dia_usd, 'El costo de transporte por día'),
        costo_combustible_dia_usd: numeroValido(b.costo_combustible_dia_usd, 'El costo de combustible por día'),
        activo: bool(b.activo),
        disponible: bool(b.disponible)
    };
}

router.post('/', async (req, res) => {
    const datos = datosVehiculo(req.body);
    const [r] = await db.query('INSERT INTO vehiculo SET ?', [datos])
        .catch(err => duplicado(err, `Ya existe un vehículo con la placa ${datos.placa}`));
    res.status(201).json({ id_vehiculo: r.insertId, message: 'Vehículo registrado' });
});

router.put('/:id', async (req, res) => {
    const id = idValido(req.params.id, 'El vehículo');
    const datos = datosVehiculo(req.body);
    // La capacidad no puede quedar por debajo del máximo de personas de sus rutas
    const [[mayor]] = await db.query(
        'SELECT nombre, max_personas FROM ruta WHERE id_vehiculo = ? AND max_personas > ? ORDER BY max_personas DESC LIMIT 1',
        [id, datos.capacidad]);
    if (mayor) {
        throw httpError(422, `La ruta "${mayor.nombre}" admite ${mayor.max_personas} personas; ajuste la ruta antes de reducir la capacidad`);
    }
    const [r] = await db.query('UPDATE vehiculo SET ? WHERE id_vehiculo = ?', [datos, id])
        .catch(err => duplicado(err, `Ya existe un vehículo con la placa ${datos.placa}`));
    if (!r.affectedRows) throw httpError(404, 'El vehículo no existe');
    res.json({ message: 'Vehículo actualizado' });
});

router.delete('/:id', async (req, res) => {
    const id = idValido(req.params.id, 'El vehículo');
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM agenda WHERE id_vehiculo = ?', [id]);
    if (n) throw httpError(409, 'El vehículo tiene reservas registradas: márquelo como inactivo en lugar de eliminarlo');
    const [r] = await db.query('DELETE FROM vehiculo WHERE id_vehiculo = ?', [id]);
    if (!r.affectedRows) throw httpError(404, 'El vehículo no existe');
    res.json({ message: 'Vehículo eliminado' });
});

module.exports = router;
