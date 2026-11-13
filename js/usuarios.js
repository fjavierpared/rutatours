let usuariosActuales = [];

async function inicializarUsuarios() {
    document.getElementById("form-usuario").addEventListener("submit", guardarUsuario);
    document.getElementById("usuario-cancelar").addEventListener("click", limpiarFormUsuario);
    document.querySelector("#tabla-usuarios tbody").addEventListener("click", accionUsuario);

    const inputFiltro = document.getElementById("filtro-usuario");
    if (inputFiltro) {
        inputFiltro.addEventListener("input", renderizarTablaUsuarios);
    }

    limpiarFormUsuario();
    await cargarUsuarios();
}

async function cargarUsuarios() {
    const tbody = document.querySelector("#tabla-usuarios tbody");
    try {
        usuariosActuales = await api("/usuarios");
        renderizarTablaUsuarios();
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="vacio error-texto">Error al cargar usuarios: ${esc(error.message)}</td></tr>`;
        actualizarContadorUsuarios(0);
    }
}

function renderizarTablaUsuarios() {
    const tbody = document.querySelector("#tabla-usuarios tbody");
    const filtro = (document.getElementById("filtro-usuario")?.value || "").toLowerCase().trim();

    const filtrados = usuariosActuales.filter(u =>
        u.nombre.toLowerCase().includes(filtro) ||
        u.usuario.toLowerCase().includes(filtro) ||
        (u.email || "").toLowerCase().includes(filtro)
    );

    actualizarContadorUsuarios(filtrados.length, usuariosActuales.length);

    if (!filtrados.length) {
        tbody.innerHTML = usuariosActuales.length
            ? `<tr><td colspan="6" class="vacio">${icono("search", "icon-vacio")}<span>No hay usuarios que coincidan con "${esc(filtro)}"</span></td></tr>`
            : `<tr><td colspan="6" class="vacio">${icono("users", "icon-vacio")}<span>No hay usuarios registrados aún</span></td></tr>`;
        return;
    }

    const sesionActual = window.usuarioSesion || {};

    tbody.innerHTML = filtrados.map((u, i) => {
        const esAdmin = u.rol === "admin";
        const badgeRol = esAdmin
            ? `<span class="badge badge-rol-admin">${icono("shield")} Administrador</span>`
            : `<span class="badge badge-rol-operador">${icono("users")} Operador</span>`;

        const badgeEstado = u.activo
            ? `<span class="badge badge-ok">${icono("circle-check")} Activo</span>`
            : `<span class="badge badge-off">${icono("circle-alert")} Inactivo</span>`;

        const esPropio = sesionActual.id_usuario === u.id_usuario;

        return `
            <tr class="${u.activo ? "" : "fila-inactiva"}">
                <td class="col-num">${i + 1}</td>
                <td>
                    <div class="celda-item">
                        ${icono(esAdmin ? "shield" : "user-check")}
                        <div class="celda-item-texto">
                            <span>${esc(u.nombre)} ${esPropio ? '<small style="color:var(--secondary);font-weight:bold;">(Tú)</small>' : ""}</span>
                        </div>
                    </div>
                </td>
                <td><div class="celda-item-texto"><code>@${esc(u.usuario)}</code><small class="celda-subtexto">${u.email ? esc(u.email) : '<span class="error-texto">Sin correo: edítelo para que pueda ingresar con él</span>'}</small></div></td>
                <td>${badgeRol}</td>
                <td>${badgeEstado}</td>
                <td class="col-acciones">
                    <button class="btn-icono" data-accion="editar" data-id="${u.id_usuario}" title="Editar usuario">${icono("pencil")}</button>
                    ${!esPropio ? `
                        <button class="btn-icono ${u.activo ? "peligro" : "exito"}" data-accion="estado" data-id="${u.id_usuario}" title="${u.activo ? "Desactivar" : "Activar"}">${icono(u.activo ? "ban" : "circle-check")}</button>
                        ${esAdmin ? "" : `<button class="btn-icono peligro" data-accion="eliminar" data-id="${u.id_usuario}" title="Eliminar usuario">${icono("trash-2")}</button>`}
                    ` : ""}
                </td>
            </tr>`;
    }).join("");
}

function actualizarContadorUsuarios(visibles, total = visibles) {
    const contador = document.getElementById("usuario-contador");
    if (!contador) return;
    if (total === visibles) {
        contador.innerHTML = `Total: <strong>${total}</strong> usuario${total === 1 ? "" : "s"}`;
    } else {
        contador.innerHTML = `Mostrando: <strong>${visibles}</strong> de ${total}`;
    }
}

async function guardarUsuario(e) {
    e.preventDefault();
    const id = document.getElementById("usuario-id").value;
    const nombre = document.getElementById("usuario-nombre").value;
    const usuario = document.getElementById("usuario-login").value;
    const email = document.getElementById("usuario-email").value.trim();
    const rol = document.getElementById("usuario-rol").value;
    const password = document.getElementById("usuario-password").value;
    const activo = Number(document.getElementById("usuario-activo").value);
    const btnSubmit = document.getElementById("usuario-submit");

    if (!id && (!password || password.length < 4)) {
        return aviso("La contraseña es obligatoria y debe tener al menos 4 caracteres", "error");
    }

    try {
        btnSubmit.disabled = true;
        const payload = { nombre, usuario, email, rol, activo };
        if (password) payload.password = password;

        const r = await api(id ? `/usuarios/${id}` : "/usuarios", {
            method: id ? "PUT" : "POST",
            body: payload
        });

        aviso(r.message);
        limpiarFormUsuario();
        await cargarUsuarios();

        // Si el usuario editó su propio nombre o rol, refrescar sesión
        if (id && window.usuarioSesion && window.usuarioSesion.id_usuario === Number(id)) {
            window.usuarioSesion.nombre = nombre;
            window.usuarioSesion.rol = rol;
            localStorage.setItem(CLAVE_USUARIO, JSON.stringify(window.usuarioSesion));
            if (typeof actualizarInterfazSesion === "function") actualizarInterfazSesion();
        }
    } catch (error) {
        aviso(error.message, "error");
    } finally {
        btnSubmit.disabled = false;
    }
}

async function accionUsuario(e) {
    const boton = e.target.closest("button[data-accion]");
    if (!boton) return;
    const usuario = usuariosActuales.find(u => u.id_usuario === Number(boton.dataset.id));
    if (!usuario) return;

    if (boton.dataset.accion === "editar") {
        document.getElementById("usuario-id").value = usuario.id_usuario;
        document.getElementById("usuario-nombre").value = usuario.nombre;
        document.getElementById("usuario-login").value = usuario.usuario;
        document.getElementById("usuario-email").value = usuario.email || "";
        document.getElementById("usuario-rol").value = usuario.rol;
        document.getElementById("usuario-activo").value = usuario.activo ? "1" : "0";
        document.getElementById("usuario-password").value = "";
        document.getElementById("usuario-password-ayuda").textContent = "Opcional: déjala en blanco si deseas mantener la actual.";
        document.querySelector("#usuario-form-titulo span").textContent = "Editar usuario";
        document.getElementById("usuario-submit").innerHTML = `${icono("save")}Actualizar usuario`;
        document.getElementById("usuario-cancelar").classList.remove("oculto");
        document.getElementById("usuario-nombre").focus();
    } else if (boton.dataset.accion === "estado") {
        const desactivar = !!usuario.activo;
        if (desactivar && !(await confirmar(`${usuario.nombre} (@${usuario.usuario}) no podrá ingresar al panel y su sesión abierta se cerrará. Puede reactivarlo cuando quiera.`,
            { titulo: "Desactivar usuario", aceptar: "Desactivar", peligro: true }))) return;
        try {
            aviso((await api(`/usuarios/${usuario.id_usuario}/estado`, { method: "PATCH", body: { activo: desactivar ? 0 : 1 } })).message);
            await cargarUsuarios();
        } catch (error) {
            aviso(error.message, "error");
        }
    } else if (boton.dataset.accion === "eliminar" && usuario.rol !== "admin" && await confirmar(`¿Eliminar al usuario "${usuario.nombre}" (@${usuario.usuario})?`, { titulo: "Eliminar usuario", aceptar: "Eliminar", peligro: true })) {
        try {
            aviso((await api(`/usuarios/${usuario.id_usuario}`, { method: "DELETE" })).message);
            await cargarUsuarios();
        } catch (error) {
            aviso(error.message, "error");
        }
    }
}

function limpiarFormUsuario() {
    document.getElementById("form-usuario").reset();
    document.getElementById("usuario-id").value = "";
    document.getElementById("usuario-rol").value = "operador";
    document.getElementById("usuario-activo").value = "1";
    document.getElementById("usuario-password-ayuda").textContent = "Obligatoria al crear usuario nuevo.";
    document.querySelector("#usuario-form-titulo span").textContent = "Nuevo usuario";
    document.getElementById("usuario-submit").innerHTML = `${icono("save")}Guardar usuario`;
    document.getElementById("usuario-cancelar").classList.add("oculto");
}

