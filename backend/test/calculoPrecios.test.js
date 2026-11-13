// Pruebas de la lógica de negocio. Ejecutar: cd backend && npm test
const test = require('node:test');
const assert = require('node:assert/strict');

const { calcularCotizacion, calcularCargosPago, precioDesde, elegirUnidades } = require('../utils/calculoPrecios');
const { usdAVes, usdAVesSeguro, redondearPrecio, formatoUsd, formatoVes } = require('../utils/moneda');
const { extraerTasa } = require('../utils/bcv');
const reglas = require('../utils/reglasAgenda');

// ---------- Ruta de ejemplo: Eje Panamericano 2D/1N (igual que los datos de ejemplo de database/rutatours.sql) ----------
const COSTOS = [
    { tipo: 'grupo', categoria: 'Transporte', concepto: 'Transporte', monto_usd: '200.00' },
    { tipo: 'grupo', categoria: 'Guía', concepto: 'Guía', monto_usd: '60.00' },
    { tipo: 'grupo', categoria: 'Salud', concepto: 'Botiquín', monto_usd: '10.00' },
    { tipo: 'unidad', categoria: 'Alojamiento', concepto: 'Cuádruple', monto_usd: '60.00', capacidad_unidad: 4, cantidad_disponible: 2 },
    { tipo: 'unidad', categoria: 'Alojamiento', concepto: 'Doble', monto_usd: '45.00', capacidad_unidad: 2, cantidad_disponible: 1 },
    { tipo: 'persona', categoria: 'Entradas', concepto: 'Cuevas', monto_usd: '1.00' },
    { tipo: 'persona', categoria: 'Alimentación', concepto: 'Desayuno', monto_usd: '3.00' },
    { tipo: 'persona', categoria: 'Alimentación', concepto: 'Almuerzos', monto_usd: '13.00' },
    { tipo: 'persona', categoria: 'Fotografía', concepto: 'Fotos', monto_usd: '1.00' }
];
const CARGOS = [
    { orden: 1, nombre: 'Ganancia', tipo: 'ganancia', porcentaje: '25.00', base: 'costo', aplica: 'siempre' },
    { orden: 2, nombre: 'IVA', tipo: 'impuesto', porcentaje: '16.00', base: 'acumulado', aplica: 'siempre' },
    { orden: 3, nombre: 'IGTF', tipo: 'impuesto', porcentaje: '3.00', base: 'acumulado', aplica: 'pago_divisas' }
];
const BASE = { minPersonas: 4, maxPersonas: 10, costos: COSTOS, cargos: CARGOS, abonoPct: 50 };
const SIN_REDONDEO = { modo: 'ninguno', paso: 0.01 };

test('Ejemplo N=10: reproduce la hoja con IVA sobre costo + ganancia', () => {
    const c = calcularCotizacion({ ...BASE, personas: 10, redondeo: SIN_REDONDEO });
    assert.equal(c.interno.costoGrupo, 615);        // 61,50 p/p
    assert.equal(c.interno.costoPersona, 61.5);
    assert.deepEqual(c.interno.cargos.map(x => x.monto), [153.75, 123]); // ganancia, IVA
    assert.equal(c.interno.totalSinRedondeo, 891.75);
    assert.equal(c.precioPersonaUsd, 89.18);
    assert.equal(c.totalUsd, 891.8);
    assert.equal(c.abonoMinimoUsd, 445.9);
    // Habitaciones: 2 cuádruples + 1 doble
    assert.deepEqual(c.interno.unidades.map(u => [u.concepto, u.cantidad]), [['Cuádruple', 2], ['Doble', 1]]);
});

test('Ejemplo N=10 con redondeo hacia arriba a 0,10 y vista del cliente', () => {
    const c = calcularCotizacion({ ...BASE, personas: 10, redondeo: { modo: 'arriba', paso: 0.10 } });
    assert.equal(c.precioPersonaUsd, 89.2);
    assert.equal(c.totalUsd, 892);
    assert.equal(c.interno.ajusteRedondeo, 0.25);
    // El cliente ve Servicio (sin ganancia aparte) + IVA, y suman el precio exacto
    const [servicio, iva] = c.cliente.lineas;
    assert.equal(servicio.concepto, 'Servicio');
    assert.equal(iva.concepto, 'IVA (16%)');
    assert.equal(iva.persona.usd, 12.3);
    assert.equal(servicio.persona.usd, 76.9);
    assert.equal(servicio.persona.usd + iva.persona.usd, c.precioPersonaUsd);
    assert.ok(!c.cliente.lineas.some(l => /ganancia/i.test(l.concepto)));
    // IGTF fuera de la cotización, como referencia de pago en divisas
    assert.deepEqual(c.cliente.cargosPago, [{ nombre: 'IGTF', porcentaje: 3 }]);
    assert.equal(c.cliente.divisas.persona.usd, 91.88);
    assert.equal(c.cliente.divisas.grupo.usd, 918.76);
});

test('El precio por persona baja cuando el grupo crece (N=4, N=6)', () => {
    const n4 = calcularCotizacion({ ...BASE, personas: 4, redondeo: SIN_REDONDEO });
    const n6 = calcularCotizacion({ ...BASE, personas: 6, redondeo: SIN_REDONDEO });
    assert.equal(n4.precioPersonaUsd, 145.73);
    assert.equal(n6.precioPersonaUsd, 116.73);
    assert.deepEqual(n6.interno.unidades.map(u => [u.concepto, u.cantidad]), [['Cuádruple', 1], ['Doble', 1]]);
});

test('Casos borde: mínimo, máximo (sobrecupo) y N inválido', () => {
    assert.throws(() => calcularCotizacion({ ...BASE, personas: 3 }), /mínimo de 4/);
    assert.throws(() => calcularCotizacion({ ...BASE, personas: 11 }), /máximo de 10/);
    assert.throws(() => calcularCotizacion({ ...BASE, personas: 0 }), /entero mayor que cero/);
    assert.throws(() => calcularCotizacion({ ...BASE, personas: 2.5 }), /entero/);
    assert.doesNotThrow(() => calcularCotizacion({ ...BASE, personas: 10 })); // N = máx
});

test('N=1 en una ruta que lo permite: paga todos los costos de grupo', () => {
    const c = calcularCotizacion({
        personas: 1, minPersonas: 1, maxPersonas: 5, redondeo: SIN_REDONDEO,
        costos: [{ tipo: 'grupo', categoria: 'T', concepto: 'Transporte', monto_usd: 100 }],
        cargos: []
    });
    assert.equal(c.precioPersonaUsd, 100);
    assert.deepEqual(c.cliente.lineas.map(l => l.concepto), ['Servicio']);
    assert.equal(c.cliente.divisas, null);
});

test('Ruta sin costos por persona, sin permisos ni unidades', () => {
    const c = calcularCotizacion({
        personas: 3, minPersonas: 1, maxPersonas: 20, redondeo: SIN_REDONDEO,
        costos: [{ tipo: 'grupo', categoria: 'T', concepto: 'Bus', monto_usd: 90 }],
        cargos: [{ orden: 1, nombre: 'IVA', tipo: 'impuesto', porcentaje: 16, base: 'acumulado', aplica: 'siempre' }]
    });
    assert.equal(c.precioPersonaUsd, 34.8); // 90 * 1,16 / 3
    assert.deepEqual(c.interno.porPersona, []);
});

test('Grupo grande (>10 personas) sin límite de unidades', () => {
    const c = calcularCotizacion({
        personas: 25, minPersonas: 1, maxPersonas: 40, redondeo: SIN_REDONDEO,
        costos: [{ tipo: 'unidad', categoria: 'Hab', concepto: 'Triple', monto_usd: 30, capacidad_unidad: 3, cantidad_disponible: null }],
        cargos: []
    });
    assert.equal(c.interno.unidades[0].cantidad, 9); // ceil(25/3)
    assert.equal(c.totalUsd, 270);
});

test('Unidades insuficientes => error claro', () => {
    assert.throws(() => calcularCotizacion({ ...BASE, maxPersonas: 12, personas: 11 }), /suficientes unidades de "Alojamiento"/);
});

test('elegirUnidades: combinación más barata', () => {
    const items = COSTOS.filter(c => c.tipo === 'unidad');
    assert.equal(elegirUnidades(items, 5).costo, 10500);  // cuádruple + doble (105) < 2 cuádruples (120)
    assert.equal(elegirUnidades(items, 2).costo, 4500);   // doble
    assert.equal(elegirUnidades(items, 11), null);
});

test('IVA sobre costo (como la hoja original) también es configurable', () => {
    const cargos = CARGOS.map(c => c.nombre === 'IVA' ? { ...c, base: 'costo' } : c);
    const c = calcularCotizacion({ ...BASE, cargos, personas: 10, redondeo: SIN_REDONDEO });
    assert.equal(c.interno.cargos[1].monto, 98.4); // 9,84 p/p
});

test('Cargos de pago (IGTF) sobre el monto pagado', () => {
    assert.deepEqual(calcularCargosPago(44600, [{ nombre: 'IGTF', porcentaje: 3 }]),
        { recargo: 1338, lineas: [{ nombre: 'IGTF', porcentaje: 3, monto: 1338 }] });
    assert.equal(calcularCargosPago(44600, []).recargo, 0);
});

test('precioDesde: menor precio por persona dentro del rango', () => {
    const d = precioDesde({ ...BASE, redondeo: SIN_REDONDEO });
    assert.equal(d.personas, 10);
    assert.equal(d.precioPersona.usd, 89.18);
});

test('Conversión USD -> VES con tasa BCV', () => {
    assert.equal(usdAVes(20, 1000), 20000);
    assert.equal(usdAVes(89.2, 36.5432), 3259.65);
    assert.throws(() => usdAVes(20, null), /tasa BCV/);
    assert.throws(() => usdAVes(20, 0), /tasa BCV/);
    assert.equal(usdAVesSeguro(20, null), null);
    const c = calcularCotizacion({ ...BASE, personas: 10, redondeo: SIN_REDONDEO, tasa: 1000 });
    assert.equal(c.cliente.precioPersona.ves, 89180);
    const sinTasa = calcularCotizacion({ ...BASE, personas: 10, redondeo: SIN_REDONDEO, tasa: null });
    assert.equal(sinTasa.cliente.precioPersona.ves, null);
});

test('Formatos y redondeo comercial', () => {
    assert.equal(formatoUsd(20), '20,00 $');
    assert.equal(formatoVes(20000), '20.000,00 Bs');
    assert.equal(formatoVes(null), 'Bs no disponible');
    assert.equal(redondearPrecio(8917.5, 'arriba', 1), 9000);
    assert.equal(redondearPrecio(8917.5, 'cercano', 0.5), 8900);
    assert.equal(redondearPrecio(8917.5, 'ninguno'), 8918);
});

test('BCV: extrae tasa y fecha valor del HTML', () => {
    const html = `
        <div id="euro"><strong> 40,11110000 </strong></div>
        <div id="dolar" class="col-sm-12 col-xs-12">
          <div class="field-content"><div class="row recuadrotsmc">
            <div class="col-sm-6 col-xs-6"><img src="usd.png"><span> USD</span></div>
            <div class="col-sm-6 col-xs-6 centrado"><strong> 36,54320000 </strong></div>
          </div></div>
        </div>
        <div class="pull-right dinpro center">Fecha Valor:
          <span class="date-display-single" property="dc:date" content="2026-11-13T00:00:00-04:00">Viernes, 13 Noviembre  2026</span>
        </div>`;
    assert.deepEqual(extraerTasa(html), { valor: 36.5432, fechaValor: '2026-11-13' });
    assert.deepEqual(extraerTasa('<div id="dolar"><strong>1.234,5</strong></div><span class="date-display-single">Lunes, 2 Marzo 2026</span>'),
        { valor: 1234.5, fechaValor: '2026-03-02' });
    assert.throws(() => extraerTasa('<html>mantenimiento</html>'), /No se encontró la tasa/);
});

// ---------- Reglas de agenda ----------
const RUTA = { activa: 1, disponible: 1, dias: 2, min_personas: 4, max_personas: 10, anticipacion_dias: 3,
    fecha_desde: null, fecha_hasta: null, dias_semana: null };
const GUIA = { id_guia: 1, activo: 1, disponible: 1 };
const VEH = { id_vehiculo: 1, activo: 1, disponible: 1, capacidad: 15 };
const PARADAS = [{}, {}];
const ok = { ruta: RUTA, guia: GUIA, vehiculo: VEH, personas: 6, fecha: '2026-11-20', hoy: '2026-11-12', paradas: PARADAS };

test('Reserva válida calcula fecha de regreso', () => {
    assert.deepEqual(reglas.validarReserva(ok), { fechaRegreso: '2026-11-21' });
    assert.equal(reglas.fechaRegreso('2026-12-31', 2), '2027-01-01');
});

test('Reserva: ruta inactiva, no disponible o sin paradas', () => {
    assert.throws(() => reglas.validarReserva({ ...ok, ruta: { ...RUTA, activa: 0 } }), /no está activa/);
    assert.throws(() => reglas.validarReserva({ ...ok, ruta: { ...RUTA, disponible: 0 } }), /no está disponible/);
    assert.throws(() => reglas.validarReserva({ ...ok, paradas: [] }), /recorrido/);
});

test('Reserva: sobrecupo y mínimo', () => {
    assert.throws(() => reglas.validarReserva({ ...ok, personas: 11 }), /Sobrecupo/);
    assert.throws(() => reglas.validarReserva({ ...ok, personas: 16, ruta: { ...RUTA, max_personas: 20 } }), /vehículo admite 15/);
    assert.throws(() => reglas.validarReserva({ ...ok, personas: 2 }), /mínimo de 4/);
});

test('Reserva: guía o vehículo no disponible', () => {
    assert.throws(() => reglas.validarReserva({ ...ok, guia: { ...GUIA, disponible: 0 } }), /guía/);
    assert.throws(() => reglas.validarReserva({ ...ok, guia: null }), /guía/);
    assert.throws(() => reglas.validarReserva({ ...ok, vehiculo: { ...VEH, activo: 0 } }), /vehículo/);
});

test('Reserva: guía o vehículo ocupado en fechas que se cruzan', () => {
    const otra = { fecha_salida: '2026-11-21', fecha_regreso: '2026-11-22', id_guia: 9, id_vehiculo: 1 };
    assert.throws(() => reglas.validarReserva({ ...ok, agendasCruzadas: [otra] }), /vehículo ya está reservado/);
    const guiaOcupado = { ...otra, id_vehiculo: 9, id_guia: 1 };
    assert.throws(() => reglas.validarReserva({ ...ok, agendasCruzadas: [guiaOcupado] }), /guía ya está reservado/);
    const sinCruce = { ...otra, fecha_salida: '2026-11-22', fecha_regreso: '2026-11-23' };
    assert.doesNotThrow(() => reglas.validarReserva({ ...ok, agendasCruzadas: [sinCruce] }));
});

test('Reserva: anticipación, vigencia y días de la semana', () => {
    assert.throws(() => reglas.validarReserva({ ...ok, fecha: '2026-11-13' }), /anticipación/);
    assert.throws(() => reglas.validarReserva({ ...ok, ruta: { ...RUTA, fecha_hasta: '2026-11-20' } }), /hasta el 20-11-2026/);
    // 2026-11-20 es viernes (5); solo sábados (6)
    assert.throws(() => reglas.validarReserva({ ...ok, ruta: { ...RUTA, dias_semana: '6' } }), /sábado/);
    assert.doesNotThrow(() => reglas.validarReserva({ ...ok, fecha: '2026-11-21', ruta: { ...RUTA, dias_semana: '6' } }));
});

test('Activar ruta: detecta configuración incompleta', () => {
    const p = reglas.problemasParaActivar({ min_personas: 4, max_personas: 12 }, {
        paradas: [{}], costos: COSTOS, guia: null, vehiculo: { capacidad: 10 }
    });
    assert.equal(p.length, 4);
    assert.match(p.join('|'), /al menos 2 paradas/);
    assert.match(p.join('|'), /guía/);
    assert.match(p.join('|'), /capacidad del vehículo \(10\)/);
    assert.match(p.join('|'), /cupo de "Alojamiento" \(10\)/);
    assert.deepEqual(reglas.problemasParaActivar({ min_personas: 4, max_personas: 10 },
        { paradas: PARADAS, costos: COSTOS, guia: GUIA, vehiculo: VEH }), []);
});

test('Estado de la reserva según pagos verificados', () => {
    const a = { estado: 'pendiente_abono', total_usd: '892.00', abono_minimo_usd: '446.00' };
    assert.equal(reglas.estadoSegunPagos(a, 0), 'pendiente_abono');
    assert.equal(reglas.estadoSegunPagos(a, 445.99), 'pendiente_abono');
    assert.equal(reglas.estadoSegunPagos(a, 446), 'reservada');
    assert.equal(reglas.estadoSegunPagos(a, 892), 'pagada');
    assert.equal(reglas.estadoSegunPagos({ ...a, estado: 'cancelada' }, 892), 'cancelada');
});
