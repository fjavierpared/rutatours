let clientesLista = [];
let clienteClave = null; // cliente al que se le restablece la clave

async function inicializarClientes() {
    document.getElementById("clientes-filtro").addEventListener("input", pintarClientes);
    document.querySelector("#clientes-tabla tbody").addEventListener("click", accionCliente);
    document.getElementById("clientes-nuevo").addEventListener("click", abrirNuevoCliente);
    document.getElementById("cliente-form").addEventListener("submit", registrarCliente);
    document.getElementById("clave-form").addEventListener("submit", restablecerClave);
    document.getElementById("cliente-copiar").addEventListener("click", copiarCredenciales);

    for (const id of ["cliente-dialogo", "clave-dialogo"]) {
        const d = document.getElementById(id);
        d.addEventListener("click", e => {
            if (e.target === d || e.target.closest("[data-cerrar]")) d.close();
            const gen = e.target.closest("[data-generar]");
            if (gen) document.getElementById(gen.dataset.generar).value = claveTemporal();
        });
    }
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
                <button class="btn-icono" data-accion="clave" data-id="${c.id_cliente}" title="Restablecer clave">${icono("key")}</button>
                ${window.usuarioSesion?.rol === "admin" ? `<button class="btn-icono ${c.activo ? "peligro" : "exito"}" data-accion="estado" data-id="${c.id_cliente}" title="${c.activo ? "Desactivar" : "Activar"}">${icono(c.activo ? "ban" : "circle-check")}</button>` : ""}
            </td>
        </tr>`).join("");
}

async function accionCliente(e) {
    const boton = e.target.closest("button[data-accion]");
    if (!boton) return;
    const c = clientesLista.find(x => x.id_cliente === Number(boton.dataset.id));
    if (!c) return;

    if (boton.dataset.accion === "clave") {
        clienteClave = c;
        document.getElementById("clave-cliente").textContent = `${c.nombre} · ${c.email}. Entréguele la nueva clave; podrá cambiarla en «Mi cuenta».`;
        document.getElementById("clave-nueva").value = claveTemporal();
        document.getElementById("clave-dialogo").showModal();
        return;
    }
    if (c.activo && !(await confirmar(`${c.nombre} no podrá iniciar sesión en el portal. Sus reservas se conservan.`, { titulo: "Desactivar cliente", aceptar: "Desactivar", peligro: true }))) return;
    try {
        aviso((await api(`/admin/clientes/${c.id_cliente}`, { method: "PATCH", body: { activo: c.activo ? 0 : 1 } })).message);
        await cargarClientes();
    } catch (error) {
        aviso(error.message, "error");
    }
}

// Clave temporal legible: sin caracteres que se confundan (0/O, 1/l/I)
function claveTemporal(largo = 8) {
    const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const azar = crypto.getRandomValues(new Uint32Array(largo));
    return Array.from(azar, n => letras[n % letras.length]).join("");
}

function abrirNuevoCliente() {
    const form = document.getElementById("cliente-form");
    form.reset();
    form.classList.remove("oculto");
    document.getElementById("cliente-resultado").classList.add("oculto");
    document.getElementById("cliente-clave").value = claveTemporal();
    document.getElementById("cliente-dialogo").showModal();
    document.getElementById("cliente-nombre").focus();
}

async function registrarCliente(e) {
    e.preventDefault();
    const form = e.target;
    const boton = form.querySelector("button[type=submit]");
    const datos = Object.fromEntries(new FormData(form));
    try {
        boton.disabled = true;
        const r = await api("/admin/clientes", { method: "POST", body: datos });
        aviso(r.message);
        mostrarCredenciales("Cliente registrado", datos.nombre, datos.email, datos.password);
        await cargarClientes();
    } catch (error) {
        aviso(error.message, "error");
    } finally {
        boton.disabled = false;
    }
}

async function restablecerClave(e) {
    e.preventDefault();
    const password = document.getElementById("clave-nueva").value.trim();
    try {
        const r = await api(`/admin/clientes/${clienteClave.id_cliente}/clave`, { method: "PATCH", body: { password } });
        aviso(r.message);
        document.getElementById("clave-dialogo").close();
        // Se muestran los datos para entregar en el mismo formato que al registrar
        document.getElementById("cliente-form").classList.add("oculto");
        mostrarCredenciales("Clave restablecida", clienteClave.nombre, clienteClave.email, password);
        document.getElementById("cliente-dialogo").showModal();
    } catch (error) {
        aviso(error.message, "error");
    }
}

function mostrarCredenciales(titulo, nombre, email, clave) {
    document.getElementById("cliente-form").classList.add("oculto");
    document.getElementById("cliente-resultado").classList.remove("oculto");
    document.getElementById("cliente-resultado-titulo").textContent = titulo;
    document.getElementById("cliente-credenciales").textContent =
        `${nombre}\nIngreso: ${location.origin}/\nCorreo: ${email}\nClave temporal: ${clave}\n\nPuede cambiar la clave en «Mi cuenta» al ingresar.`;
}

async function copiarCredenciales() {
    try {
        await navigator.clipboard.writeText(document.getElementById("cliente-credenciales").textContent);
        aviso("Datos copiados");
    } catch {
        aviso("No se pudo copiar: selecciónelos y cópielos a mano", "error");
    }
}
