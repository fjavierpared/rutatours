const test = require('node:test');
const assert = require('node:assert');
const { crearLimitador } = require('../utils/limiteIntentos');

function reloj(inicio = 0) {
    let t = inicio;
    return { ahora: () => t, avanzar: ms => { t += ms; } };
}
const MIN = 60 * 1000;

test('bloquea al llegar al máximo de fallos y avisa los minutos de espera', () => {
    const r = reloj();
    const lim = crearLimitador({ maxFallos: 3, ventanaMs: 15 * MIN, bloqueoMs: 15 * MIN, ahora: r.ahora });
    lim.fallo('a'); lim.fallo('a');
    assert.doesNotThrow(() => lim.verificar('a'));
    lim.fallo('a');
    assert.throws(() => lim.verificar('a'), e => e.status === 429 && /15 minutos/.test(e.message));
});

test('el bloqueo vence pasado el tiempo de espera', () => {
    const r = reloj();
    const lim = crearLimitador({ maxFallos: 2, bloqueoMs: 10 * MIN, ahora: r.ahora });
    lim.fallo('a'); lim.fallo('a');
    r.avanzar(9 * MIN);
    assert.throws(() => lim.verificar('a'), /1 minuto\b/);
    r.avanzar(MIN + 1);
    assert.doesNotThrow(() => lim.verificar('a'));
});

test('los fallos fuera de la ventana no se acumulan', () => {
    const r = reloj();
    const lim = crearLimitador({ maxFallos: 3, ventanaMs: 5 * MIN, ahora: r.ahora });
    lim.fallo('a'); lim.fallo('a');
    r.avanzar(6 * MIN);
    lim.fallo('a');
    assert.doesNotThrow(() => lim.verificar('a'));
});

test('un ingreso correcto limpia el contador y las claves son independientes', () => {
    const r = reloj();
    const lim = crearLimitador({ maxFallos: 2, ahora: r.ahora });
    lim.fallo('a'); lim.exito('a'); lim.fallo('a');
    assert.doesNotThrow(() => lim.verificar('a'));
    lim.fallo('b'); lim.fallo('b');
    assert.throws(() => lim.verificar('b'));
    assert.doesNotThrow(() => lim.verificar('a'));
});
