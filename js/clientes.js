let clientesLista = [];

async function inicializarClientes() {
    document.getElementById("clientes-filtro").addEventListener("input", pintarClientes);
    document.querySelector("#clientes-tabla tbody").addEventListener("click", accionCliente);
    await cargarClientes();
}

async function cargarClientes() {
    try {
        clientesLista = await api("/admin/clientes");
        pintarClientes();
    } catch (error) {
        document.querySelector("#clientes-tabla tbody").innerHTML =
            `<tr><td colspan="7" class="vacio error-texto">Error al cargar clientes: ${esc(error.message)}</td></tr>`;
    }
}

function pintarClientes() {
    const tbody = document.querySelector("#clientes-tabla tbody");
    const filtro = document.getElementById("clientes-filtro").value.toLowerCase().trim();
    const lista = clientesLista.filter(c => !filtro ||
        `${c.nombre} ${c.documento} ${c.email} ${c.telefono || ""}`.toLowerCase().includes(filtro));
    document.getElementById("clientes-contador").innerHTML = lista.length === clientesLista.length
        ? `Total: <strong>${clientesLista.length}</strong> cliente${clientesLista.length === 1 ? "" : "s"}`
        : `Mostrando: <strong>${lista.length}</strong> de ${clientesLista.length}`;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="vacio">${icono("users", "icon-vacio")}<span>${clientesLista.length ? "No hay clientes que coincidan" : "Aún no hay clientes registrados"}</span></td></tr>`;
        return;
    }
    tbody.innerHTML = lista.map((c, i) => `
        <tr class="${c.activo ? "" : "fila-inactiva"}">
            <td class="col-num">${i + 1}</td>
            <td><div class="celda-item-texto"><span>${esc(c.nombre)}</span><small class="celda-subtexto">${esc(c.documento)}</small></div></td>
            <td><div class="celda-item-texto"><span>${esc(c.email)}</span><small class="celda-subtexto">${esc(c.telefono || "")}</small></div></td>
            <td class="num">${c.reservas}</td>
            <td>${formatoFecha(c.creado_en)}</td>
            <td>${c.activo ? `<span class="badge badge-ok">Activo</span>` : `<span class="badge badge-off">Inactivo</span>`}</td>
            <td class="col-acciones">
                <button class="btn-icono ${c.activo ? "peligro" : "exito"}" data-id="${c.id_cliente}" title="${c.activo ? "Desactivar" : "Activar"}">${icono(c.activo ? "ban" : "circle-check")}</button>
            </td>
        </tr>`).join("");
}

async function accionCliente(e) {
    const boton = e.target.closest("button[data-id]");
    if (!boton) return;
    const c = clientesLista.find(x => x.id_cliente === Number(boton.dataset.id));
    if (!c) return;
    if (c.activo && !(await confirmar(`${c.nombre} no podrá iniciar sesión en el portal. Sus reservas se conservan.`, { titulo: "Desactivar cliente", aceptar: "Desactivar", peligro: true }))) return;
    try {
        aviso((await api(`/admin/clientes/${c.id_cliente}`, { method: "PATCH", body: { activo: c.activo ? 0 : 1 } })).message);
        await cargarClientes();
    } catch (error) {
        aviso(error.message, "error");
    }
}
