// Vista: ficha de un plan (galería, recorrido, itinerario, qué incluye), calculadora y reserva

const TIPO_PARADA_TEXTO = {
    salida: "Salida", embarque: "Embarque", visita: "Visita", comida: "Comida",
    alojamiento: "Alojamiento", retorno: "Retorno", llegada: "Llegada"
};

let rutaVista = null;
let temporizadorCalculo;

async function vistaRuta(main, id) {
    const { ruta, tasa } = await api(`/rutas/disponibles/${Number(id)}`);
    if (tasa) tasaPortal = tasa;
    rutaVista = ruta;
    document.title = `${ruta.nombre} · ${nombreSistema}`;

    const personas = Array.from({ length: ruta.max_personas - ruta.min_personas + 1 }, (_, i) => ruta.min_personas + i);
    const fechas = limitesFecha(ruta);

    main.innerHTML = `
        <a class="volver" href="#catalogo">${icono("arrow-left")}Todos los planes</a>
        <header class="ficha-cabecera">
            <h1>${esc(ruta.nombre)}</h1>
            <div class="ficha-datos">
                <span>${icono("clock")}${duracion(ruta.dias, ruta.noches)}</span>
                ${ruta.zona ? `<span>${icono("map-pin")}${esc(ruta.zona)}</span>` : ""}
                <span>${icono("users")}${ruta.min_personas} a ${ruta.max_personas} personas</span>
                ${ruta.guia ? `<span>${icono("user-round")}Guía${ruta.guia.idiomas ? ` en ${esc(ruta.guia.idiomas)}` : ""}</span>` : ""}
                ${ruta.vehiculo ? `<span>${icono("bus")}${esc(ruta.vehiculo.tipo)} privado</span>` : ""}
            </div>
        </header>

        <div class="ficha">
            <div class="ficha-principal">
                ${galeria(ruta.imagenes)}
                ${ruta.descripcion ? `<p class="ficha-descripcion">${esc(ruta.descripcion)}</p>` : ""}

                <section class="bloque">
                    <h2>${icono("route")}Recorrido</h2>
                    <div id="ficha-diagrama"></div>
                    <p class="nota-suave">${icono("info")}Esquema del recorrido, no es un mapa a escala. <a href="#ayuda">¿Cómo leerlo?</a></p>
                </section>

                <section class="bloque">
                    <h2>${icono("calendar-days")}Itinerario</h2>
                    ${itinerario(ruta)}
                </section>

                ${fichaDetalles(ruta.detalles)}
            </div>

            <aside class="ficha-lateral">
                <section class="panel-reserva" id="panel-reserva">
                    <h2>Calcule y reserve</h2>
                    <label class="campo">¿Cuántas personas viajan?
                        <select id="calc-personas">${personas.map(n => `<option value="${n}">${n} persona${n === 1 ? "" : "s"}</option>`).join("")}</select>
                    </label>
                    <div id="calc-resultado" class="calc-resultado"></div>

                    <form id="form-reserva" class="form">
                        <label class="campo">Fecha de salida
                            <input type="date" id="reserva-fecha" required min="${fechas.min}" ${fechas.max ? `max="${fechas.max}"` : ""}>
                            <small id="reserva-fecha-ayuda">${esc(textoFechas(ruta, fechas))}</small>
                        </label>
                        <label class="campo">Notas para el guía (opcional)
                            <textarea id="reserva-notas" rows="2" maxlength="500" placeholder="Alergias, punto de encuentro, edades de niños..."></textarea>
                        </label>
                        <button type="submit" class="btn btn-primario btn-bloque" id="reserva-boton">${icono("calendar-check")}Reservar</button>
                        <p class="nota-suave">Su reserva se confirma al verificar el abono del ${formatoPct(ruta.abono_pct)}. El precio queda fijo en dólares desde que reserva.</p>
                    </form>
                </section>
            </aside>
        </div>
        <button type="button" class="ir-reservar" id="ir-reservar">${icono("calculator")}Calcular y reservar</button>`;

    dibujarRecorrido(document.getElementById("ficha-diagrama"), ruta.paradas, { dias: ruta.dias });
    main.querySelector(".galeria")?.addEventListener("click", cambiarImagen);
    document.getElementById("calc-personas").addEventListener("change", programarCalculo);
    document.getElementById("reserva-fecha").addEventListener("change", validarFechaElegida);
    document.getElementById("form-reserva").addEventListener("submit", enviarReserva);
    document.getElementById("reserva-fecha").value = primeraFechaValida(ruta, fechas) || "";

    // En el celular la calculadora queda al final: un botón flotante lleva a ella y se oculta al verla
    const panel = document.getElementById("panel-reserva");
    const ir = document.getElementById("ir-reservar");
    ir.addEventListener("click", () => panel.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (typeof IntersectionObserver === "function") {
        new IntersectionObserver(([e]) => ir.classList.toggle("oculto-suave", e.isIntersecting), { threshold: 0.05 }).observe(panel);
    }
    await calcularPrecio();
}

// ---------- Galería ----------

function galeria(imagenes) {
    if (!imagenes.length) return "";
    return `
        <div class="galeria">
            <img class="galeria-principal" id="galeria-principal" src="${esc(imagenes[0])}" alt="Foto del plan">
            ${imagenes.length > 1 ? `<div class="galeria-miniaturas">${imagenes.map((src, i) => `
                <button type="button" class="${i === 0 ? "activa" : ""}" data-src="${esc(src)}" aria-label="Ver foto ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
        </div>`;
}

function cambiarImagen(e) {
    const b = e.target.closest("button[data-src]");
    if (!b) return;
    document.getElementById("galeria-principal").src = b.dataset.src;
    b.parentElement.querySelectorAll("button").forEach(x => x.classList.toggle("activa", x === b));
}

// ---------- Itinerario ----------

// Agrupa paradas y actividades por día. Una actividad puede indicar otro día
// (Ej.: el desayuno del día 2 en el hotel donde se llegó el día 1).
function itinerario(ruta) {
    const dias = new Map();
    const agregar = (dia, item) => { if (!dias.has(dia)) dias.set(dia, []); dias.get(dia).push(item); };
    let secuencia = 0;
    for (const p of ruta.paradas) {
        agregar(p.dia, { hora: p.hora, titulo: p.nombre, tipo: p.tipo, texto: p.descripcion, n: secuencia++ });
        for (const a of p.actividades) {
            agregar(a.dia || p.dia, { hora: a.hora, titulo: a.descripcion, lugar: p.nombre, n: secuencia++ });
        }
    }
    const colores = window.COLORES_DIA_RECORRIDO;
    return [...dias.keys()].sort((a, b) => a - b).map(dia => {
        // Orden por hora; los elementos sin hora conservan su lugar después del anterior
        let ultima = "";
        const items = dias.get(dia).map(it => { if (it.hora) ultima = it.hora; return { ...it, orden: it.hora || ultima }; })
            .sort((a, b) => a.orden.localeCompare(b.orden) || a.n - b.n);
        return `
            <div class="itinerario-dia" style="--color-dia:${colores[(dia - 1) % colores.length]}">
                <h3>Día ${dia}</h3>
                <ol class="itinerario">
                    ${items.map(it => `
                        <li class="${it.tipo ? "es-parada" : "es-actividad"}">
                            <span class="itinerario-hora">${it.hora ? hora12(it.hora) : ""}</span>
                            <div>
                                <strong>${esc(it.titulo)}</strong>
                                ${it.tipo ? `<span class="etiqueta">${TIPO_PARADA_TEXTO[it.tipo] || ""}</span>` : ""}
                                ${it.lugar ? `<small>${esc(it.lugar)}</small>` : ""}
                                ${it.texto ? `<p>${esc(it.texto)}</p>` : ""}
                            </div>
                        </li>`).join("")}
                </ol>
            </div>`;
    }).join("");
}

function hora12(h) {
    const [hh, mm] = h.split(":").map(Number);
    return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "a. m." : "p. m."}`;
}

function fichaDetalles(detalles) {
    const grupo = (tipo, titulo, ic) => {
        const items = detalles.filter(d => d.tipo === tipo);
        return items.length ? `
            <div class="detalle detalle-${tipo}">
                <h3>${icono(ic)}${titulo}</h3>
                <ul>${items.map(d => `<li>${esc(d.texto)}</li>`).join("")}</ul>
            </div>` : "";
    };
    const html = grupo("incluye", "Incluye", "check") + grupo("no_incluye", "No incluye", "x") + grupo("recomendacion", "Recomendaciones", "info");
    return html ? `<section class="bloque"><h2>${icono("file-text")}Qué incluye</h2><div class="detalles">${html}</div></section>` : "";
}

// ---------- Calculadora ----------

function programarCalculo() {
    clearTimeout(temporizadorCalculo);
    temporizadorCalculo = setTimeout(calcularPrecio, 150);
}

async function calcularPrecio() {
    const destino = document.getElementById("calc-resultado");
    const personas = Number(document.getElementById("calc-personas").value);
    try {
        const c = await api(`/rutas/${rutaVista.id_ruta}/calcular`, { method: "POST", body: { personas } });
        if (Number(document.getElementById("calc-personas")?.value) !== personas) return; // llegó una respuesta vieja
        destino.innerHTML = tablaPrecio(c);
    } catch (error) {
        destino.innerHTML = `<p class="error">${icono("circle-alert")}${esc(error.message)}</p>`;
    }
}

function tablaPrecio(c) {
    const n = c.personas;
    const igtf = c.cargosPago.map(x => `${esc(x.nombre)} ${formatoPct(x.porcentaje)}`).join(", ");
    return `
        <div class="precio-destacado">
            <span>Precio por persona</span>
            <strong>${formatoUsd(c.precioPersona.usd)}</strong>
            ${c.precioPersona.ves != null ? `<small>${formatoVes(c.precioPersona.ves)}</small>` : ""}
        </div>
        <table class="tabla-precio">
            <thead><tr><th>Concepto</th><th>Por persona</th><th>Grupo de ${n}</th></tr></thead>
            <tbody>
                ${c.lineas.map(l => `<tr><td>${esc(l.concepto)}</td><td>${montoDoble(l.persona)}</td><td>${montoDoble(l.grupo)}</td></tr>`).join("")}
                <tr class="fila-total"><td>Total</td><td>${montoDoble(c.precioPersona, { fuerte: true })}</td><td>${montoDoble(c.totalGrupo, { fuerte: true })}</td></tr>
                <tr class="fila-abono"><td>Abono para reservar (${formatoPct(c.abonoPct)})</td><td></td><td>${montoDoble(c.abonoMinimo, { fuerte: true })}</td></tr>
            </tbody>
        </table>
        <details class="desglose">
            <summary>¿Cómo se calcula este precio?</summary>
            <ul>
                <li><strong>Servicio</strong> reúne todo lo que incluye el plan: transporte, guía, alojamiento, comidas y entradas indicadas en la ficha.</li>
                ${c.lineas.slice(1).map(l => `<li><strong>${esc(l.concepto)}</strong>: impuesto de ley incluido en el precio.</li>`).join("")}
                <li>El <strong>total del grupo</strong> es el precio por persona × ${n}. Como el grupo es privado, mientras más personas viajen, menor es el precio por persona.</li>
                <li>Para reservar se paga un <strong>abono del ${formatoPct(c.abonoPct)}</strong> (${formatoUsd(c.abonoMinimo.usd)}); el resto puede pagarlo después, antes de la salida.</li>
                ${c.divisas ? `<li>Si paga en <strong>divisas</strong> (Zelle, efectivo, USDT...) se suma ${igtf} sobre el monto pagado: el grupo completo quedaría en ${formatoUsd(c.divisas.grupo.usd)} (${formatoUsd(c.divisas.persona.usd)} por persona). Pagando en bolívares no aplica.</li>` : ""}
                <li>${c.tasa ? `Los montos en bolívares usan la <strong>tasa oficial del BCV</strong> de hoy (${formatoTasa(c.tasa.valor)}). Al pagar en Bs se usa la tasa vigente ese día.` : `Hoy no hay tasa BCV registrada: los montos en bolívares se mostrarán cuando esté disponible.`}</li>
            </ul>
        </details>
        ${c.divisas ? `<p class="nota-suave">${icono("wallet")}Pagando en divisas: ${formatoUsd(c.divisas.persona.usd)} por persona (incluye ${igtf}).</p>` : ""}`;
}

// ---------- Fechas ----------

function limitesFecha(ruta) {
    let min = sumarDiasIso(fechaLocal(), Number(ruta.anticipacion_dias) || 0);
    if (ruta.fecha_desde && ruta.fecha_desde > min) min = ruta.fecha_desde.slice(0, 10);
    const max = ruta.fecha_hasta ? sumarDiasIso(ruta.fecha_hasta.slice(0, 10), -(ruta.dias - 1)) : null;
    return { min, max };
}

function diasPermitidos(ruta) {
    return ruta.dias_semana ? String(ruta.dias_semana).split(",").map(Number) : null;
}

function textoFechas(ruta, { min, max }) {
    const partes = [];
    const dias = diasPermitidos(ruta);
    if (dias) partes.push(`Sale los ${dias.map(d => NOMBRES_DIA[d]).join(", ")}`);
    if (Number(ruta.anticipacion_dias)) partes.push(`reserve con ${ruta.anticipacion_dias} día(s) de anticipación`);
    if (max) partes.push(`disponible hasta el ${formatoFecha(ruta.fecha_hasta)}`);
    if (min > max && max) return "No quedan fechas disponibles para este plan.";
    return partes.length ? `${partes.join(" · ")}.` : `Primera fecha disponible: ${formatoFecha(min)}.`;
}

function primeraFechaValida(ruta, { min, max }) {
    const dias = diasPermitidos(ruta);
    for (let i = 0, f = min; i < 14; i++, f = sumarDiasIso(f, 1)) {
        if (max && f > max) return null;
        if (!dias || dias.includes(diaSemanaIso(f))) return f;
    }
    return min;
}

// Devuelve el problema de la fecha elegida o "" si es válida
function problemaFecha(fecha) {
    const ruta = rutaVista;
    const { min, max } = limitesFecha(ruta);
    if (!fecha) return "Elija la fecha de salida";
    if (fecha < min) return `La primera fecha disponible es el ${formatoFecha(min)}`;
    if (max && fecha > max) return `La última salida posible es el ${formatoFecha(max)}`;
    const dias = diasPermitidos(ruta);
    if (dias && !dias.includes(diaSemanaIso(fecha))) return `Este plan solo sale los ${dias.map(d => NOMBRES_DIA[d]).join(", ")}`;
    return "";
}

function validarFechaElegida() {
    const input = document.getElementById("reserva-fecha");
    const ayuda = document.getElementById("reserva-fecha-ayuda");
    const problema = problemaFecha(input.value);
    ayuda.textContent = problema || (input.value
        ? `Regreso: ${fechaLarga(sumarDiasIso(input.value, rutaVista.dias - 1))}`
        : textoFechas(rutaVista, limitesFecha(rutaVista)));
    ayuda.classList.toggle("error", !!problema);
    return !problema;
}

// ---------- Reserva ----------

async function enviarReserva(e) {
    e.preventDefault();
    if (!validarFechaElegida()) return aviso(problemaFecha(document.getElementById("reserva-fecha").value), "error");
    if (!window.clienteSesion) {
        abrirAcceso({ mensaje: "Ingrese o cree su cuenta para completar la reserva. No perderá lo que eligió.", pestana: "registro", despues: reservar });
        return;
    }
    await reservar();
}

async function reservar() {
    const boton = document.getElementById("reserva-boton");
    const personas = Number(document.getElementById("calc-personas").value);
    const fecha = document.getElementById("reserva-fecha").value;
    if (!(await confirmar(`${rutaVista.nombre}`, { titulo: "Confirmar reserva", aceptar: "Reservar", detalle: `${personas} persona(s) · salida el ${fechaLarga(fecha)}` }))) return;
    try {
        if (boton) boton.disabled = true;
        const r = await api("/agendas", {
            method: "POST",
            body: { id_ruta: rutaVista.id_ruta, fecha, personas, notas: document.getElementById("reserva-notas").value }
        });
        aviso("¡Reserva registrada! Ahora reporte su abono para confirmarla.");
        location.hash = `#reserva/${r.id_agenda}`;
    } catch (error) {
        aviso(error.message, "error");
    } finally {
        if (boton) boton.disabled = false;
    }
}
