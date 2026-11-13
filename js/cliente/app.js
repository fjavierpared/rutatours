// Portal del cliente: navegación por hash, cabecera de sesión y acceso (ingresar / crear cuenta)
//   #catalogo          lista de planes (inicio)
//   #ruta/<id>         ficha del plan, calculadora y reserva
//   #reservas          mis reservas (requiere sesión)
//   #reserva/<id>      detalle de una reserva y reporte de pago (requiere sesión)
//   #ayuda             ¿Cómo funciona?

const VISTAS = {
    catalogo: { pintar: vistaCatalogo, titulo: "Planes" },
    ruta: { pintar: vistaRuta, titulo: "Plan" },
    reservas: { pintar: vistaReservas, titulo: "Mis reservas", sesion: true, nav: "reservas" },
    reserva: { pintar: vistaReserva, titulo: "Reserva", sesion: true, nav: "reservas" },
    ayuda: { pintar: vistaAyuda, titulo: "¿Cómo funciona?" }
};

let nombreSistema = "RutaTours";
let tasaPortal = null;          // tasa BCV vigente (la consultan varias vistas)
let accionTrasAcceso = null;    // se ejecuta después de ingresar (Ej.: completar la reserva)

function rutaActual() {
    const [nombre, id] = location.hash.slice(1).split("/");
    return VISTAS[nombre] ? { nombre, id } : { nombre: "catalogo" };
}

async function navegar() {
    const { nombre, id } = rutaActual();
    const vista = VISTAS[nombre];
    const main = document.getElementById("vista");
    document.querySelectorAll(".nav a").forEach(a => a.classList.toggle("activa", a.dataset.vista === (vista.nav || nombre)));
    document.title = `${vista.titulo} · ${nombreSistema}`;
    window.scrollTo(0, 0);

    if (vista.sesion && !window.clienteSesion) {
        main.innerHTML = `
            <section class="vacio-grande">
                ${icono("lock", "icon-grande")}
                <h1>Ingrese para ver sus reservas</h1>
                <p>Con su cuenta puede seguir sus reservas, reportar pagos y ver su estado.</p>
                <button type="button" class="btn btn-primario" data-abrir-acceso>Ingresar o crear cuenta</button>
            </section>`;
        return;
    }
    main.innerHTML = `<div class="cargando">Cargando...</div>`;
    try {
        await vista.pintar(main, id);
    } catch (error) {
        main.innerHTML = `
            <section class="vacio-grande">
                ${icono("circle-alert", "icon-grande")}
                <h1>No pudimos cargar esta página</h1>
                <p>${esc(error.message)}</p>
                <a class="btn btn-secundario" href="#catalogo">Ver los planes</a>
            </section>`;
    }
}

// ---------- Cabecera ----------

function pintarCabecera() {
    const c = window.clienteSesion;
    document.getElementById("sesion").innerHTML = c
        ? `<button type="button" class="sesion-nombre" id="btn-cuenta" title="Mi cuenta · ${esc(c.email)}">${icono("user-round")}<span>${esc(c.nombre.split(" ")[0])}</span></button>
           <button type="button" class="btn btn-fantasma btn-chico" id="btn-salir">Salir</button>`
        : `<button type="button" class="btn btn-primario btn-chico" data-abrir-acceso>Ingresar</button>`;
}

async function cargarSistema() {
    try {
        const [config, t] = await Promise.all([api("/configuracion"), api("/tasa-bcv")]);
        aplicarTema(config);
        nombreSistema = config.nombre_sistema || nombreSistema;
        document.getElementById("nombre-sistema").textContent = nombreSistema;
        document.getElementById("pie-nombre").textContent = nombreSistema;
        tasaPortal = t.tasa;
        document.getElementById("pie-tasa").innerHTML = tasaPortal
            ? `Tasa BCV: <strong>${formatoTasa(tasaPortal.valor)}</strong>${tasaPortal.fecha_valor ? ` · ${formatoFecha(tasaPortal.fecha_valor)}` : ""}`
            : "";
    } catch { /* el portal funciona con los valores por defecto */ }
}

// ---------- Acceso ----------

function abrirAcceso({ mensaje = "", pestana = "ingresar", despues = null } = {}) {
    accionTrasAcceso = despues;
    const msj = document.getElementById("acceso-mensaje");
    msj.textContent = mensaje;
    msj.classList.toggle("oculto", !mensaje);
    cambiarPestana(pestana);
    const d = document.getElementById("acceso");
    if (!d.open) d.showModal();
}

function cambiarPestana(pestana) {
    document.querySelectorAll("#acceso .pestana").forEach(b => b.classList.toggle("activa", b.dataset.pestana === pestana));
    document.getElementById("form-ingresar").classList.toggle("oculto", pestana !== "ingresar");
    document.getElementById("form-registro").classList.toggle("oculto", pestana !== "registro");
    document.querySelector(`#form-${pestana} input`)?.focus();
}

async function enviarAcceso(e, ruta) {
    e.preventDefault();
    const form = e.target;
    const boton = form.querySelector("button[type=submit]");
    const datos = Object.fromEntries(new FormData(form));
    try {
        boton.disabled = true;
        const r = await api(ruta, { method: "POST", body: datos });
        form.reset();
        // Correo del equipo: se abre el panel con su sesión (mismas claves que usa el panel)
        if (r.tipo === "usuario") {
            localStorage.setItem("token_sesion", r.token);
            localStorage.setItem("usuario_sesion", JSON.stringify(r.usuario));
            aviso(`Bienvenido(a), ${r.usuario.nombre}. Abriendo el panel...`);
            setTimeout(() => { location.href = "/admin"; }, 600);
            return;
        }
        guardarSesion(r);
        document.getElementById("acceso").close();
        aviso(ruta.includes("register") ? `¡Cuenta creada! Bienvenido(a), ${r.cliente.nombre}` : `Bienvenido(a), ${r.cliente.nombre}`);
        const accion = accionTrasAcceso;
        accionTrasAcceso = null;
        if (accion) await accion();
        else if (VISTAS[rutaActual().nombre].sesion) navegar();
    } catch (error) {
        aviso(error.message, "error");
    } finally {
        boton.disabled = false;
    }
}

// Valida en segundo plano que el token guardado siga vigente
async function verificarSesionGuardada() {
    if (!localStorage.getItem(CLAVE_TOKEN_CLIENTE)) {
        if (window.clienteSesion) guardarSesion(null);
        return;
    }
    try {
        const { cliente } = await api("/clientes/perfil");
        window.clienteSesion = { id_cliente: cliente.id_cliente, nombre: cliente.nombre, email: cliente.email };
        pintarCabecera();
    } catch { /* api() ya cerró la sesión si el token venció */ }
}

// ---------- Mi cuenta: cambiar clave ----------

function abrirCuenta() {
    const c = window.clienteSesion;
    if (!c) return;
    document.getElementById("cuenta-datos").textContent = `${c.nombre} · ${c.email}`;
    document.getElementById("form-cuenta").reset();
    document.getElementById("cuenta").showModal();
}

async function cambiarClaveCliente(e) {
    e.preventDefault();
    const f = e.target;
    if (f.password_nueva.value !== f.confirmar.value) return aviso("La nueva clave y su confirmación no coinciden", "error");
    const boton = f.querySelector("button[type=submit]");
    try {
        boton.disabled = true;
        const r = await api("/clientes/cambiar-clave", { method: "POST", body: { password_actual: f.password_actual.value, password_nueva: f.password_nueva.value } });
        aviso(r.message);
        document.getElementById("cuenta").close();
    } catch (error) {
        aviso(error.message, "error");
    } finally {
        boton.disabled = false;
    }
}

// ---------- Inicio ----------

window.addEventListener("hashchange", navegar);

document.addEventListener("click", async e => {
    if (e.target.closest("[data-abrir-acceso]")) abrirAcceso({ pestana: e.target.closest("[data-abrir-acceso]").dataset.abrirAcceso || "ingresar" });
    if (e.target.closest("#btn-cuenta")) abrirCuenta();
    if (e.target.closest("#btn-salir") && await confirmar("¿Desea cerrar su sesión?", { titulo: "Cerrar sesión", aceptar: "Cerrar sesión" })) {
        guardarSesion(null);
        aviso("Sesión cerrada");
        if (VISTAS[rutaActual().nombre].sesion) navegar();
    }
});

window.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("pie-anio").textContent = new Date().getFullYear();
    const dialogo = document.getElementById("acceso");
    dialogo.addEventListener("click", e => {
        if (e.target === dialogo || e.target.closest("[data-cerrar]")) dialogo.close();
        const p = e.target.closest("[data-pestana]");
        if (p) cambiarPestana(p.dataset.pestana);
    });
    dialogo.addEventListener("close", () => { accionTrasAcceso = null; });
    document.getElementById("form-ingresar").addEventListener("submit", e => enviarAcceso(e, "/acceso"));
    document.getElementById("form-registro").addEventListener("submit", e => enviarAcceso(e, "/clientes/register"));
    const cuenta = document.getElementById("cuenta");
    cuenta.addEventListener("click", e => { if (e.target === cuenta || e.target.closest("[data-cerrar]")) cuenta.close(); });
    document.getElementById("form-cuenta").addEventListener("submit", cambiarClaveCliente);

    pintarCabecera();
    await cargarSistema();
    verificarSesionGuardada();
    await navegar();
});
