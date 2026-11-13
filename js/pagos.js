let pagosLista = [];
let pagosEstado = "pendiente";
let pagoARechazar = null;

async function inicializarPagos() {
    document.getElementById("pagos-tabs").addEventListener("click", e => {
        const tab = e.target.closest(".tab");
        if (!tab) return;
        pagosEstado = tab.dataset.estado;
        document.querySelectorAll("#pagos-tabs .tab").forEach(t => t.classList.toggle("activa", t === tab));
        cargarPagos();
    });
    document.getElementById("pagos-filtro").addEventListener("input", pintarPagos);
    document.querySelector("#pagos-tabla tbody").addEventListener("click", accionPago);

    const dialogo = document.getElementById("pago-dialogo-rechazo");
    document.getElementById("pago-rechazo-cancelar").addEventListener("click", () => dialogo.close());
    document.getElementById("pago-form-rechazo").addEventListener("submit", e => {
        e.preventDefault();
        const motivo = document.getElementById("pago-rechazo-motivo").value.trim();
        if (!motivo) return;
        dialogo.close();
        resolverPago(pagoARechazar, "rechazado", motivo);
    });

    await cargarPagos();
}

async function cargarPagos() {
    try {
        pagosLista = await api(`/admin/pagos${pagosEstado ? `?estado=${pagosEstado}` : ""}`);
        pintarPagos();
    } catch (error) {
        document.querySelector("#pagos-tabla tbody").innerHTML =
            `<tr><td colspan="9" class="vacio error-texto">Error al cargar pagos: ${esc(error.message)}</td></tr>`;
    }
}

function pintarPagos() {
    const tbody = document.querySelector("#pagos-tabla tbody");
    const filtro = document.getElementById("pagos-filtro").value.toLowerCase().trim();
    const lista = pagosLista.filter(p => !filtro ||
        `${p.cliente} ${p.ruta} ${p.referencia} ${p.metodo} #${p.id_agenda}`.toLowerCase().includes(filtro));
    document.getElementById("pagos-contador").innerHTML = `Mostrando: <strong>${lista.length}</strong> pago${lista.length === 1 ? "" : "s"}`;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="vacio">${icono("receipt", "icon-vacio")}<span>${pagosEstado === "pendiente" ? "No hay pagos por verificar" : "No hay pagos con este filtro"}</span></td></tr>`;
        return;
    }
    tbody.innerHTML = lista.map(p => {
        // Lo que el administrador debe ver en su cuenta: Bs si el método es en bolívares, USD si es en divisas
        const recibir = p.moneda === "VES"
            ? `<strong>${formatoVes(p.monto_ves)}</strong><small class="celda-subtexto">${formatoUsd(p.total_usd)} × ${formatoTasa(p.tasa_bcv)}</small>`
            : `<strong>${formatoUsd(p.total_usd)}</strong>${p.monto_ves != null ? `<small class="celda-subtexto">≈ ${formatoVes(p.monto_ves)}</small>` : ""}`;
        return `
        <tr>
            <td>${fechaHora(p.creado_en)}</td>
            <td><div class="celda-item-texto"><span>#${p.id_agenda} ${esc(p.ruta)}</span><small class="celda-subtexto">Salida ${formatoFecha(p.fecha_salida)}</small></div></td>
            <td>${esc(p.cliente)}</td>
            <td><div class="celda-item-texto"><span>${esc(p.metodo)}</span><small class="celda-subtexto"><code>${esc(p.referencia)}</code>
                ${p.comprobante ? ` · <a href="uploads/${encodeURIComponent(p.comprobante)}" target="_blank" rel="noopener">ver comprobante</a>` : ""}</small></div></td>
            <td class="num">${formatoUsd(p.monto_usd)}</td>
            <td class="num">${Number(p.igtf_usd) ? formatoUsd(p.igtf_usd) : "—"}</td>
            <td class="num"><div class="celda-item-texto">${recibir}</div></td>
            <td>${badgePago(p.estado)}${p.observacion ? `<small class="celda-subtexto">${esc(p.observacion)}</small>` : ""}</td>
            <td class="col-acciones">${p.estado === "pendiente" ? `
                <button class="btn-icono exito" data-accion="verificar" data-id="${p.id_pago}" title="Verificar (el dinero llegó)">${icono("check")}</button>
                <button class="btn-icono peligro" data-accion="rechazar" data-id="${p.id_pago}" title="Rechazar">${icono("x")}</button>` : ""}
            </td>
        </tr>`;
    }).join("");
}

async function accionPago(e) {
    const boton = e.target.closest("button[data-accion]");
    if (!boton) return;
    const p = pagosLista.find(x => x.id_pago === Number(boton.dataset.id));
    if (!p) return;
    const resumen = `${p.metodo} · ref. ${p.referencia} · ${p.moneda === "VES" ? formatoVes(p.monto_ves) : formatoUsd(p.total_usd)} de ${p.cliente}`;
    if (boton.dataset.accion === "verificar") {
        if (await confirmar("¿Confirmas que este pago llegó a tu cuenta?", { titulo: "Verificar pago", aceptar: "Sí, verificar", detalle: resumen })) resolverPago(p, "verificado");
    } else {
        pagoARechazar = p;
        document.getElementById("pago-rechazo-resumen").textContent = resumen;
        document.getElementById("pago-rechazo-motivo").value = "";
        document.getElementById("pago-dialogo-rechazo").showModal();
    }
}

async function resolverPago(p, estado, observacion) {
    try {
        const r = await api(`/admin/pagos/${p.id_pago}`, { method: "PATCH", body: { estado, observacion } });
        const textoAgenda = ESTADOS_AGENDA[r.estado_agenda]?.texto;
        aviso(`${r.message}${textoAgenda ? ` · reserva #${p.id_agenda}: ${textoAgenda}` : ""}`);
        await cargarPagos();
    } catch (error) {
        aviso(error.message, "error");
    }
}
