// Vistas: mis reservas, detalle de una reserva y reporte de pago

const MAX_COMPROBANTE = 2 * 1024 * 1024;
let reservaVista = null;
let metodosPago = [];
let temporizadorPrevia;

// Qué debe hacer el cliente según el estado de su reserva
function siguientePaso(a) {
    const porVerificar = Number(a.por_verificar_usd) > 0;
    switch (a.estado) {
        case "pendiente_abono":
            return porVerificar
                ? "Recibimos su pago: lo estamos verificando para confirmar la reserva."
                : `Reporte un abono de al menos ${formatoUsd(a.abono_minimo_usd)} para confirmar su reserva.`;
        case "reservada":
            return porVerificar ? "Estamos verificando su último pago." : `Reserva confirmada. Saldo pendiente: ${formatoUsd(a.saldo_usd)}.`;
        case "pagada": return "¡Todo listo! Su viaje está pagado por completo.";
        case "completada": return "Viaje realizado. ¡Gracias por viajar con nosotros!";
        case "cancelada": return "Esta reserva fue cancelada.";
    }
    return "";
}

const admitePagos = a => ["pendiente_abono", "reservada"].includes(a.estado) && Number(a.saldo_usd) > 0;

// ---------- Listado ----------

async function vistaReservas(main) {
    const reservas = await api("/agendas/mias");
    main.innerHTML = `
        <header class="titulo-vista">
            <h1>Mis reservas</h1>
            <a class="btn btn-secundario btn-chico" href="#catalogo">${icono("plus")}Nueva reserva</a>
        </header>
        ${reservas.length ? `<div class="lista-reservas">${reservas.map(tarjetaReserva).join("")}</div>` : `
            <section class="vacio-grande">
                ${icono("calendar-check", "icon-grande")}
                <h1>Aún no tiene reservas</h1>
                <p>Elija un plan, calcule el precio para su grupo y reserve en minutos.</p>
                <a class="btn btn-primario" href="#catalogo">Ver los planes</a>
            </section>`}`;
}

function tarjetaReserva(a) {
    const pagado = Number(a.pagado_usd);
    const pct = Math.min(100, Math.round((pagado / Number(a.total_usd)) * 100)) || 0;
    return `
        <a class="reserva ${a.estado === "cancelada" ? "reserva-inactiva" : ""}" href="#reserva/${a.id_agenda}">
            <div class="reserva-cabecera">
                <span class="reserva-numero">Reserva #${a.id_agenda}</span>
                ${badgeAgenda(a.estado)}
            </div>
            <h2>${esc(a.ruta)}</h2>
            <p class="reserva-datos">${icono("calendar-days")}${fechaConDia(a.fecha_salida)}${a.fecha_regreso !== a.fecha_salida ? ` al ${formatoFecha(a.fecha_regreso)}` : ""}
                <span>${icono("users")}${a.personas} persona${a.personas === 1 ? "" : "s"}</span></p>
            <div class="barra-pago" role="img" aria-label="Pagado ${pct}%"><span style="width:${pct}%"></span></div>
            <p class="reserva-montos">Pagado <strong>${formatoUsd(pagado)}</strong> de ${formatoUsd(a.total_usd)}</p>
            <p class="reserva-paso">${esc(siguientePaso(a))}</p>
        </a>`;
}

// ---------- Detalle ----------

async function vistaReserva(main, id) {
    const [a, metodos] = await Promise.all([api(`/agendas/mias/${Number(id)}`), api("/pagos/metodos")]);
    reservaVista = a;
    metodosPago = metodos;
    const cl = a.cotizacion.cliente;
    const abierta = admitePagos(a);

    main.innerHTML = `
        <a class="volver" href="#reservas">${icono("arrow-left")}Mis reservas</a>
        <header class="titulo-vista">
            <div>
                <span class="reserva-numero">Reserva #${a.id_agenda}</span>
                <h1>${esc(a.ruta)}</h1>
            </div>
            ${badgeAgenda(a.estado)}
        </header>
        <div class="aviso-paso estado-${a.estado}">${icono(a.estado === "pagada" || a.estado === "reservada" ? "circle-check" : "info")}<span>${esc(siguientePaso(a))}</span></div>

        <div class="ficha">
            <div class="ficha-principal">
                <section class="bloque">
                    <h2>${icono("calendar-days")}Su viaje</h2>
                    <dl class="datos">
                        <div><dt>Salida</dt><dd>${fechaLarga(a.fecha_salida)}</dd></div>
                        <div><dt>Regreso</dt><dd>${fechaLarga(a.fecha_regreso)}</dd></div>
                        <div><dt>Personas</dt><dd>${a.personas}</dd></div>
                        <div><dt>Reservada el</dt><dd>${fechaHora(a.creado_en)}</dd></div>
                    </dl>
                    ${a.notas ? `<p class="nota-suave">${icono("file-text")}Sus notas: ${esc(a.notas)}</p>` : ""}
                    <p><a href="#ruta/${a.id_ruta}">Ver la ficha del plan ${icono("arrow-right")}</a></p>
                </section>

                <section class="bloque">
                    <h2>${icono("receipt")}Precio acordado</h2>
                    <p class="nota-suave">El precio en dólares quedó fijo al reservar. Los montos en Bs se calculan con la tasa BCV del día en que paga.</p>
                    <table class="tabla-precio">
                        <thead><tr><th>Concepto</th><th>Por persona</th><th>Grupo de ${a.personas}</th></tr></thead>
                        <tbody>
                            ${cl.lineas.map(l => `<tr><td>${esc(l.concepto)}</td><td>${formatoUsd(l.persona.usd)}</td><td>${formatoUsd(l.grupo.usd)}</td></tr>`).join("")}
                            <tr class="fila-total"><td>Total</td><td><strong>${formatoUsd(cl.precioPersona.usd)}</strong></td><td><strong>${formatoUsd(cl.totalGrupo.usd)}</strong></td></tr>
                            <tr class="fila-abono"><td>Abono mínimo (${formatoPct(cl.abonoPct)})</td><td></td><td>${formatoUsd(cl.abonoMinimo.usd)}</td></tr>
                        </tbody>
                    </table>
                </section>

                <section class="bloque">
                    <h2>${icono("wallet")}Pagos</h2>
                    <div class="resumen-pagos">
                        <div><small>Total</small><strong>${formatoUsd(a.total_usd)}</strong></div>
                        <div><small>Pagado</small><strong class="ok">${formatoUsd(a.pagado_usd)}</strong></div>
                        <div><small>En verificación</small><strong class="aviso">${formatoUsd(a.por_verificar_usd)}</strong></div>
                        <div><small>Saldo</small><strong>${formatoUsd(a.saldo_usd)}</strong></div>
                    </div>
                    ${a.pagos.length ? `<ul class="lista-pagos">${a.pagos.map(filaPago).join("")}</ul>` : `<p class="nota-suave">Aún no ha reportado pagos.</p>`}
                </section>

                ${a.estado === "pendiente_abono" ? `
                    <p class="cancelar"><button type="button" class="btn btn-fantasma btn-peligro" id="btn-cancelar">${icono("ban")}Cancelar esta reserva</button></p>` : ""}
            </div>

            <aside class="ficha-lateral">
                ${abierta ? formularioPago(a) : `
                    <section class="panel-reserva">
                        <h2>${icono("wallet")}Reportar pago</h2>
                        <p class="nota-suave">${Number(a.por_verificar_usd) > 0 && Number(a.saldo_usd) === 0
                            ? "Sus pagos cubren el total. Le avisaremos cuando estén verificados."
                            : "Esta reserva no admite más pagos."}</p>
                    </section>`}
            </aside>
        </div>`;

    document.getElementById("btn-cancelar")?.addEventListener("click", cancelarReserva);
    if (abierta) prepararFormularioPago(a);
}

function filaPago(p) {
    const extra = Number(p.igtf_usd) ? ` + IGTF ${formatoUsd(p.igtf_usd)}` : "";
    return `
        <li class="pago pago-${p.estado}">
            <div>
                <strong>${esc(p.metodo)}</strong> · ref. <code>${esc(p.referencia)}</code>
                <small>${fechaHora(p.creado_en)}${p.monto_ves != null ? ` · ${formatoVes(p.monto_ves)} a ${formatoTasa(p.tasa_bcv)}` : ""}</small>
                ${p.estado === "rechazado" && p.observacion ? `<small class="error">Motivo: ${esc(p.observacion)}</small>` : ""}
            </div>
            <div class="pago-monto">${formatoUsd(p.monto_usd)}<small>${extra}</small>${badgePago(p.estado)}</div>
        </li>`;
}

// ---------- Reportar pago ----------

// Monto sugerido: lo que falta del abono mínimo (si aún no está confirmada) o el saldo
function montosSugeridos(a) {
    const saldo = Number(a.saldo_usd);
    const faltaAbono = Math.max(0, Math.round((Number(a.abono_minimo_usd) - Number(a.pagado_usd) - Number(a.por_verificar_usd)) * 100) / 100);
    return { saldo, abono: a.estado === "pendiente_abono" && faltaAbono > 0 && faltaAbono < saldo ? faltaAbono : null };
}

function formularioPago(a) {
    const { saldo, abono } = montosSugeridos(a);
    return `
        <section class="panel-reserva">
            <h2>${icono("wallet")}Reportar pago</h2>
            <form id="form-pago" class="form">
                <label class="campo">Método de pago
                    <select id="pago-metodo" required>
                        <option value="">Elija cómo va a pagar</option>
                        ${metodosPago.map(m => `<option value="${m.id_metodo}">${esc(m.nombre)} (${m.moneda === "VES" ? "Bs" : "$"})</option>`).join("")}
                    </select>
                </label>
                <div id="pago-datos" class="datos-pago oculto"></div>
                <div class="campo">
                    <label for="pago-monto">Monto a abonar a la reserva (USD)</label>
                    <input type="number" id="pago-monto" min="0.01" max="${saldo}" step="0.01" required value="${(abono ?? saldo).toFixed(2)}">
                    <div class="atajos">
                        ${abono != null ? `<button type="button" class="chip" data-monto="${abono}">Abono mínimo ${formatoUsd(abono)}</button>` : ""}
                        <button type="button" class="chip" data-monto="${saldo}">Saldo total ${formatoUsd(saldo)}</button>
                    </div>
                </div>
                <div id="pago-previa" class="pago-previa"></div>
                <label class="campo">Número de referencia
                    <input type="text" id="pago-referencia" required maxlength="60" placeholder="Ej.: 00123456">
                </label>
                <label class="campo">Comprobante (opcional)
                    <input type="file" id="pago-comprobante" accept="image/jpeg,image/png,image/webp">
                    <small>Captura o foto JPG, PNG o WEBP de hasta 2 MB.</small>
                </label>
                <button type="submit" class="btn btn-primario btn-bloque" id="pago-boton">${icono("check")}Reportar pago</button>
                <p class="nota-suave">Verificaremos el pago en su cuenta bancaria y actualizaremos el estado de la reserva.</p>
            </form>
        </section>`;
}

function prepararFormularioPago() {
    const form = document.getElementById("form-pago");
    document.getElementById("pago-metodo").addEventListener("change", () => { mostrarDatosMetodo(); programarPrevia(); });
    document.getElementById("pago-monto").addEventListener("input", programarPrevia);
    form.addEventListener("click", e => {
        const chip = e.target.closest("[data-monto]");
        if (chip) { document.getElementById("pago-monto").value = Number(chip.dataset.monto).toFixed(2); programarPrevia(); }
        const copiar = e.target.closest("[data-copiar]");
        if (copiar) navigator.clipboard?.writeText(copiar.dataset.copiar).then(() => aviso("Monto copiado"), () => {});
    });
    form.addEventListener("submit", enviarPago);
    document.getElementById("pago-previa").innerHTML = `<p class="nota-suave">Elija el método para ver cuánto debe pagar.</p>`;
}

function metodoElegido() {
    return metodosPago.find(m => String(m.id_metodo) === document.getElementById("pago-metodo").value);
}

function mostrarDatosMetodo() {
    const m = metodoElegido();
    const caja = document.getElementById("pago-datos");
    caja.classList.toggle("oculto", !m?.datos);
    caja.innerHTML = m?.datos ? `<strong>Datos para pagar</strong><p>${esc(m.datos)}</p>` : "";
}

function programarPrevia() {
    clearTimeout(temporizadorPrevia);
    temporizadorPrevia = setTimeout(previsualizarPago, 300);
}

async function previsualizarPago() {
    const destino = document.getElementById("pago-previa");
    const m = metodoElegido();
    const monto = Number(document.getElementById("pago-monto").value);
    if (!m || !(monto > 0)) {
        destino.innerHTML = `<p class="nota-suave">Elija el método e indique el monto para ver cuánto debe pagar.</p>`;
        return;
    }
    try {
        const p = await api("/pagos/previsualizar", { method: "POST", body: { id_agenda: reservaVista.id_agenda, id_metodo: m.id_metodo, monto_usd: monto } });
        const enBs = m.moneda === "VES";
        const aPagar = enBs ? formatoVes(p.monto_ves) : formatoUsd(p.total_usd);
        destino.innerHTML = `
            <div class="previa">
                <div class="previa-fila"><span>Abona a su reserva</span><span>${formatoUsd(p.monto_usd)}</span></div>
                ${p.lineasRecargo.map(l => `<div class="previa-fila"><span>${esc(l.nombre)} (${formatoPct(l.porcentaje)}) por pago en divisas</span><span>${formatoUsd(l.monto)}</span></div>`).join("")}
                <div class="previa-total">
                    <span>Debe ${enBs ? "transferir" : "pagar"}</span>
                    <strong>${aPagar}</strong>
                    <button type="button" class="btn-icono" data-copiar="${enBs ? p.monto_ves.toFixed(2).replace(".", ",") : p.total_usd.toFixed(2)}" title="Copiar monto">${icono("copy")}</button>
                </div>
                <small>${enBs ? `${formatoUsd(p.total_usd)} × tasa BCV ${formatoTasa(p.tasa_bcv)}. Si paga otro día, el monto en Bs cambia con la tasa.` : `Equivale a ${formatoVes(p.monto_ves)} a la tasa BCV de hoy.`}</small>
            </div>`;
    } catch (error) {
        destino.innerHTML = `<p class="error">${icono("circle-alert")}${esc(error.message)}</p>`;
    }
}

async function enviarPago(e) {
    e.preventDefault();
    const m = metodoElegido();
    if (!m) return aviso("Elija el método de pago", "error");
    const archivo = document.getElementById("pago-comprobante").files[0];
    if (archivo && !["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) return aviso("El comprobante debe ser JPG, PNG o WEBP", "error");
    if (archivo && archivo.size > MAX_COMPROBANTE) return aviso("El comprobante supera los 2 MB", "error");

    const boton = document.getElementById("pago-boton");
    try {
        boton.disabled = true;
        const r = await api("/pagos", {
            method: "POST",
            body: {
                id_agenda: reservaVista.id_agenda,
                id_metodo: m.id_metodo,
                monto_usd: Number(document.getElementById("pago-monto").value),
                referencia: document.getElementById("pago-referencia").value,
                comprobante: archivo ? await leerComoDataUrl(archivo) : undefined
            }
        });
        aviso(r.message);
        await navegar();
    } catch (error) {
        aviso(error.message, "error");
        boton.disabled = false;
    }
}

async function cancelarReserva() {
    if (!(await confirmar("Esta acción no se puede deshacer.", { titulo: "Cancelar reserva", aceptar: "Cancelar reserva", cancelar: "Volver", peligro: true }))) return;
    try {
        aviso((await api(`/agendas/mias/${reservaVista.id_agenda}/cancelar`, { method: "POST" })).message);
        await navegar();
    } catch (error) {
        aviso(error.message, "error");
    }
}
