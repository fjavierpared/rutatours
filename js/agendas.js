let agendasLista = [];

async function inicializarAgendas() {
    document.getElementById("agendas-filtro").addEventListener("input", pintarAgendas);
    for (const id of ["agendas-estado", "agendas-desde", "agendas-hasta"]) {
        document.getElementById(id).addEventListener("change", cargarAgendas);
    }
    document.querySelector("#agendas-tabla tbody").addEventListener("click", e => {
        const boton = e.target.closest("button[data-id]");
        if (boton) abrirAgenda(Number(boton.dataset.id));
    });
    document.getElementById("agenda-dialogo").addEventListener("click", accionDialogoAgenda);
    await cargarAgendas();
}

async function cargarAgendas() {
    const params = new URLSearchParams();
    for (const [id, clave] of [["agendas-estado", "estado"], ["agendas-desde", "desde"], ["agendas-hasta", "hasta"]]) {
        const v = document.getElementById(id).value;
        if (v) params.set(clave, v);
    }
    try {
        agendasLista = await api(`/admin/agendas${params.size ? `?${params}` : ""}`);
        pintarAgendas();
    } catch (error) {
        document.querySelector("#agendas-tabla tbody").innerHTML =
            `<tr><td colspan="10" class="vacio error-texto">Error al cargar reservas: ${esc(error.message)}</td></tr>`;
    }
}

function pintarAgendas() {
    const tbody = document.querySelector("#agendas-tabla tbody");
    const filtro = document.getElementById("agendas-filtro").value.toLowerCase().trim();
    const lista = agendasLista.filter(a => !filtro ||
        `${a.cliente} ${a.ruta} ${a.guia || ""} ${a.placa || ""} #${a.id_agenda}`.toLowerCase().includes(filtro));
    document.getElementById("agendas-contador").innerHTML = `Mostrando: <strong>${lista.length}</strong> reserva${lista.length === 1 ? "" : "s"}`;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="vacio">${icono("calendar-check", "icon-vacio")}<span>No hay reservas con estos filtros</span></td></tr>`;
        return;
    }
    tbody.innerHTML = lista.map(a => `
        <tr class="${a.estado === "cancelada" ? "fila-inactiva" : ""}">
            <td class="col-num">#${a.id_agenda}</td>
            <td><div class="celda-item-texto"><span>${fechaConDia(a.fecha_salida)}</span>${a.fecha_regreso !== a.fecha_salida ? `<small class="celda-subtexto">al ${formatoFecha(a.fecha_regreso)}</small>` : ""}</div></td>
            <td><div class="celda-item-texto"><span>${esc(a.ruta)}</span><small class="celda-subtexto">${esc(a.guia || "Sin guía")} · ${esc(a.placa || "sin vehículo")}</small></div></td>
            <td><div class="celda-item-texto"><span>${esc(a.cliente)}</span><small class="celda-subtexto">${esc(a.telefono || "")}</small></div></td>
            <td class="num">${a.personas}</td>
            <td class="num">${formatoUsd(a.total_usd)}</td>
            <td class="num">${formatoUsd(a.pagado_usd)}${Number(a.por_verificar_usd) ? `<small class="celda-subtexto texto-aviso">+${formatoUsd(a.por_verificar_usd)} por verificar</small>` : ""}</td>
            <td class="num">${formatoUsd(a.saldo_usd)}</td>
            <td>${badgeAgenda(a.estado)}</td>
            <td class="col-acciones"><button class="btn-icono" data-id="${a.id_agenda}" title="Ver detalle">${icono("eye")}</button></td>
        </tr>`).join("");
}

async function abrirAgenda(id) {
    const dialogo = document.getElementById("agenda-dialogo");
    try {
        const a = await api(`/admin/agendas/${id}`);
        document.getElementById("agenda-detalle").innerHTML = htmlDetalleAgenda(a);
        dialogo.dataset.id = id;
        if (!dialogo.open) dialogo.showModal();
    } catch (error) {
        aviso(error.message, "error");
    }
}

function htmlDetalleAgenda(a) {
    const cot = a.cotizacion || {};
    const cl = cot.cliente;
    const abierta = !["cancelada", "completada"].includes(a.estado);
    const lineas = cl ? `
        <table class="tabla-cotizacion">
            <thead><tr><th>Concepto</th><th class="num">Por persona</th><th class="num">Grupo</th></tr></thead>
            <tbody>
                ${cl.lineas.map(l => `<tr><td>${esc(l.concepto)}</td><td class="num">${formatoUsd(l.persona.usd)}</td><td class="num">${formatoUsd(l.grupo.usd)}</td></tr>`).join("")}
                <tr class="fila-total"><td>Total</td><td class="num">${formatoUsd(cl.precioPersona.usd)}</td><td class="num">${formatoUsd(cl.totalGrupo.usd)}</td></tr>
                <tr><td>Abono mínimo (${formatoPct(cl.abonoPct)})</td><td></td><td class="num">${formatoUsd(cl.abonoMinimo.usd)}</td></tr>
            </tbody>
        </table>` : "";
    const ganancia = cot.interno ? cot.interno.cargos.filter(c => c.tipo === "ganancia").reduce((t, c) => t + Number(c.monto), 0) : null;

    return `
        <div class="dialogo-cabecera">
            <h3>${icono("calendar-check")}Reserva #${a.id_agenda}</h3>
            ${badgeAgenda(a.estado)}
            <button type="button" class="btn-icono" data-cerrar title="Cerrar">${icono("x")}</button>
        </div>
        <div class="datos-grid">
            <div><small>Ruta</small><strong>${esc(a.ruta)}</strong></div>
            <div><small>Fechas</small><strong>${fechaConDia(a.fecha_salida)}${a.fecha_regreso !== a.fecha_salida ? ` al ${formatoFecha(a.fecha_regreso)}` : ""}</strong></div>
            <div><small>Personas</small><strong>${a.personas}</strong></div>
            <div><small>Cliente</small><strong>${esc(a.cliente)}</strong><span>${esc(a.documento)} · ${esc(a.email)}${a.telefono ? ` · ${esc(a.telefono)}` : ""}</span></div>
            <div><small>Guía</small><strong>${esc(a.guia || "—")}</strong></div>
            <div><small>Vehículo</small><strong>${esc(a.placa || "—")}</strong></div>
        </div>
        ${a.notas ? `<p class="nota"><strong>Notas del cliente:</strong> ${esc(a.notas)}</p>` : ""}

        <div class="resumen-pagos">
            <div><small>Total</small><strong>${formatoUsd(a.total_usd)}</strong></div>
            <div><small>Pagado (verificado)</small><strong class="texto-ok">${formatoUsd(a.pagado_usd)}</strong></div>
            <div><small>Por verificar</small><strong class="texto-aviso">${formatoUsd(a.por_verificar_usd)}</strong></div>
            <div><small>Saldo</small><strong>${formatoUsd(a.saldo_usd)}</strong></div>
        </div>

        <h4>Cotización congelada al reservar</h4>
        ${lineas}
        ${ganancia != null ? `<p class="ayuda">Ganancia incluida: <strong>${formatoUsd(ganancia)}</strong> · costo del grupo ${formatoUsd(cot.interno.costoGrupo)}</p>` : ""}

        <h4>Pagos</h4>
        ${a.pagos.length ? `
            <div class="tabla-contenedor"><table class="tabla-lista">
                <thead><tr><th>Fecha</th><th>Método</th><th>Referencia</th><th class="num">Monto</th><th class="num">IGTF</th><th class="num">Bs</th><th>Estado</th></tr></thead>
                <tbody>${a.pagos.map(p => `
                    <tr>
                        <td>${fechaHora(p.creado_en)}</td>
                        <td>${esc(p.metodo)}</td>
                        <td><code>${esc(p.referencia)}</code>${p.comprobante ? ` <a href="uploads/${encodeURIComponent(p.comprobante)}" target="_blank" rel="noopener" title="Ver comprobante">${icono("image")}</a>` : ""}</td>
                        <td class="num">${formatoUsd(p.monto_usd)}</td>
                        <td class="num">${Number(p.igtf_usd) ? formatoUsd(p.igtf_usd) : "—"}</td>
                        <td class="num">${p.monto_ves != null ? formatoVes(p.monto_ves) : "—"}</td>
                        <td>${badgePago(p.estado)}${p.observacion ? `<small class="celda-subtexto">${esc(p.observacion)}</small>` : ""}</td>
                    </tr>`).join("")}</tbody>
            </table></div>
            <p class="ayuda">Los pagos se verifican o rechazan en el módulo <a href="#pagos">Pagos</a>.</p>` : `<p class="ayuda">Sin pagos reportados.</p>`}

        <div class="form-acciones">
            ${abierta ? `
                <button type="button" class="btn btn-success" data-estado="completada">${icono("circle-check")}Marcar como completada</button>
                <button type="button" class="btn btn-peligro" data-estado="cancelada">${icono("ban")}Cancelar reserva</button>` : ""}
            <button type="button" class="btn btn-secundario" data-cerrar>Cerrar</button>
        </div>`;
}

async function accionDialogoAgenda(e) {
    const dialogo = document.getElementById("agenda-dialogo");
    if (e.target === dialogo || e.target.closest("[data-cerrar]")) {
        dialogo.close();
        return;
    }
    const boton = e.target.closest("button[data-estado]");
    if (!boton) return;
    const estado = boton.dataset.estado;
    const cancelar = estado === "cancelada";
    const ok = await confirmar(cancelar
        ? "Se liberan el guía y el vehículo, y los pagos pendientes se marcan como rechazados. Los reembolsos se gestionan aparte."
        : "¿Marcar la reserva como completada?", cancelar
        ? { titulo: "Cancelar reserva", aceptar: "Cancelar reserva", cancelar: "Volver", peligro: true }
        : { titulo: "Completar reserva", aceptar: "Marcar como completada" });
    if (!ok) return;
    try {
        aviso((await api(`/admin/agendas/${dialogo.dataset.id}`, { method: "PATCH", body: { estado } })).message);
        await abrirAgenda(Number(dialogo.dataset.id));
        await cargarAgendas();
    } catch (error) {
        aviso(error.message, "error");
    }
}
