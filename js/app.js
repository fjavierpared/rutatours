// Registro de módulos: la clave es el hash (#inicio) y el archivo modulos/<clave>.html
// soloAdmin: oculta el menú y bloquea la navegación a operadores
const MODULOS = {
    inicio: {
        titulo: "Inicio",
        subtitulo: "Resumen general del sistema",
        iniciar: () => inicializarInicio()
    },
    agendas: {
        titulo: "Reservas",
        subtitulo: "Salidas agendadas por los clientes, pagos y estado",
        iniciar: () => inicializarAgendas()
    },
    pagos: {
        titulo: "Pagos",
        subtitulo: "Verifique o rechace los pagos reportados por los clientes",
        iniciar: () => inicializarPagos()
    },
    clientes: {
        titulo: "Clientes",
        subtitulo: "Cuentas registradas en el portal de clientes",
        iniciar: () => inicializarClientes()
    },
    rutas: {
        titulo: "Rutas",
        subtitulo: "Planes turísticos: recorrido, costos, precios y ficha para el cliente",
        iniciar: () => inicializarRutas()
    },
    guias: {
        titulo: "Guías",
        subtitulo: "Guías turísticos, costos por día y disponibilidad",
        iniciar: () => inicializarGuias()
    },
    vehiculos: {
        titulo: "Vehículos",
        subtitulo: "Flota, capacidad y costos por día",
        iniciar: () => inicializarVehiculos()
    },
    tasa: {
        titulo: "Tasa BCV",
        subtitulo: "Tasa oficial del dólar usada para los montos en bolívares",
        iniciar: () => inicializarTasa()
    },
    metodos: {
        titulo: "Métodos de pago",
        subtitulo: "Formas de pago que ve el cliente y si aplican IGTF",
        iniciar: () => inicializarMetodos()
    },
    usuarios: {
        titulo: "Gestión de Usuarios",
        subtitulo: "Cuentas con acceso al sistema, roles y permisos",
        soloAdmin: true,
        iniciar: () => inicializarUsuarios()
    },
    configuracion: {
        titulo: "Configuración",
        subtitulo: "Nombre, colores y redondeo de precios",
        soloAdmin: true,
        iniciar: () => inicializarConfiguracion()
    },
    ayuda: {
        titulo: "Ayuda",
        subtitulo: "Manual de usuario del sistema",
        iniciar: () => inicializarAyuda()
    }
};
const MODULO_INICIAL = "inicio";

let temaGuardado = null;
window.usuarioSesion = null;

// ==========================================
// CONTROL DE SESIÓN Y LOGIN
// ==========================================

function mostrarLogin(mensajeAlerta = "") {
    const pantalla = document.getElementById("pantalla-login");
    const app = document.getElementById("app-root");
    const alerta = document.getElementById("login-alerta");
    const alertaTexto = document.getElementById("login-alerta-texto");

    if (pantalla) pantalla.classList.remove("oculto");
    if (app) app.style.display = "none";

    if (mensajeAlerta && alerta && alertaTexto) {
        alertaTexto.textContent = mensajeAlerta;
        alerta.classList.remove("oculto");
    } else if (alerta) {
        alerta.classList.add("oculto");
    }

    const inputUser = document.getElementById("login-usuario");
    if (inputUser) {
        setTimeout(() => inputUser.focus(), 100);
    }
}

function ocultarLogin() {
    const pantalla = document.getElementById("pantalla-login");
    const app = document.getElementById("app-root");
    if (pantalla) pantalla.classList.add("oculto");
    if (app) app.style.display = "flex";
}

function actualizarInterfazSesion() {
    const u = window.usuarioSesion;
    if (!u) return;

    const nombreElem = document.getElementById("usuario-nombre-topbar");
    const rolElem = document.getElementById("usuario-rol-topbar");
    const avatarElem = document.getElementById("usuario-avatar");
    if (nombreElem) nombreElem.textContent = u.nombre || u.usuario;
    if (rolElem) rolElem.textContent = u.rol === "admin" ? "Administrador" : "Operador";
    if (avatarElem) avatarElem.textContent = (u.nombre || u.usuario || "U").charAt(0).toUpperCase();

    // Restricciones de rol: los módulos soloAdmin se ocultan del menú a los operadores
    const esAdmin = u.rol === "admin";
    document.querySelectorAll(".sidebar-menu a[data-modulo]").forEach(a => {
        const soloAdmin = MODULOS[a.dataset.modulo]?.soloAdmin;
        a.closest("li").classList.toggle("oculto", !!soloAdmin && !esAdmin);
    });

    if (!esAdmin && MODULOS[location.hash.slice(1)]?.soloAdmin) {
        location.hash = `#${MODULO_INICIAL}`;
    }
}

async function verificarSesion() {
    const token = localStorage.getItem(CLAVE_TOKEN);
    if (!token) {
        mostrarLogin();
        return false;
    }

    try {
        const datos = await api("/auth/perfil");
        window.usuarioSesion = datos.usuario;
        localStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos.usuario));
        ocultarLogin();
        actualizarInterfazSesion();
        return true;
    } catch {
        localStorage.removeItem(CLAVE_TOKEN);
        localStorage.removeItem(CLAVE_USUARIO);
        mostrarLogin("Tu sesión ha expirado. Ingresa tus credenciales.");
        return false;
    }
}

async function iniciarSesion(e) {
    e.preventDefault();
    const usuario = document.getElementById("login-usuario").value.trim();
    const password = document.getElementById("login-password").value;
    const alerta = document.getElementById("login-alerta");
    const alertaTexto = document.getElementById("login-alerta-texto");
    const btnSubmit = document.getElementById("btn-login-submit");

    if (!usuario || !password) {
        alertaTexto.textContent = "Ingresa tu usuario y contraseña";
        alerta.classList.remove("oculto");
        return;
    }

    try {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = `<span>Ingresando...</span> ${icono("rotate-ccw")}`;

        const r = await api("/auth/login", {
            method: "POST",
            body: { usuario, password }
        });

        localStorage.setItem(CLAVE_TOKEN, r.token);
        localStorage.setItem(CLAVE_USUARIO, JSON.stringify(r.usuario));
        window.usuarioSesion = r.usuario;

        document.getElementById("form-login").reset();
        alerta.classList.add("oculto");
        ocultarLogin();
        actualizarInterfazSesion();
        await cargarModulo();
        aviso(`¡Bienvenido(a), ${r.usuario.nombre}!`);
    } catch (error) {
        alertaTexto.textContent = error.message;
        alerta.classList.remove("oculto");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<span>Iniciar sesión</span> ${icono("arrow-right")}`;
    }
}

async function cerrarSesion() {
    if (await confirmar("¿Deseas cerrar tu sesión?", { titulo: "Cerrar sesión", aceptar: "Cerrar sesión" })) {
        localStorage.removeItem(CLAVE_TOKEN);
        localStorage.removeItem(CLAVE_USUARIO);
        window.usuarioSesion = null;
        mostrarLogin("Has cerrado sesión exitosamente.");
    }
}

// ==========================================
// CARGA Y NAVEGACIÓN DE MÓDULOS
// ==========================================

async function cargarModulo() {
    // Si no hay sesión válida, mostrar login y no continuar
    if (!window.usuarioSesion) {
        const autenticado = await verificarSesion();
        if (!autenticado) return;
    }

    let nombre = MODULOS[location.hash.slice(1)] ? location.hash.slice(1) : MODULO_INICIAL;

    // Operador intentando entrar a un módulo solo para administradores
    if (window.usuarioSesion?.rol !== "admin" && MODULOS[nombre].soloAdmin) {
        nombre = MODULO_INICIAL;
        location.hash = `#${MODULO_INICIAL}`;
    }

    const modulo = MODULOS[nombre];
    if (temaGuardado) aplicarTema(temaGuardado);

    document.querySelectorAll(".sidebar-menu a").forEach(a =>
        a.classList.toggle("active", a.dataset.modulo === nombre)
    );
    document.getElementById("titulo-modulo").textContent = modulo.titulo;
    document.getElementById("subtitulo-modulo").textContent = modulo.subtitulo;
    const contenedor = document.getElementById("contenedor-modulos");

    try {
        const respuesta = await fetch(`modulos/${nombre}.html`);
        if (!respuesta.ok) throw new Error(`Error HTTP: ${respuesta.status}`);
        contenedor.innerHTML = await respuesta.text();
        await modulo.iniciar();
    } catch (error) {
        console.error("Error al cargar el módulo:", error);
        contenedor.innerHTML = `
            <div class="alerta alerta-error">
                ${icono("circle-alert")}
                <div>Error al cargar el módulo: ${esc(error.message)}</div>
            </div>`;
    }
}

async function cargarNombreSistema() {
    try {
        const config = await api("/configuracion");
        temaGuardado = {
            color_primario: config.color_primario,
            color_secundario: config.color_secundario,
            color_acento: config.color_acento
        };
        aplicarTema(temaGuardado);
        if (config.nombre_sistema) {
            for (const id of ["nombre-sistema", "login-nombre-sistema", "login-pie-nombre", "pie-nombre"]) {
                const el = document.getElementById(id);
                if (el) el.textContent = config.nombre_sistema;
            }
            document.title = config.nombre_sistema;
        }
    } catch (error) {
        console.error("Error al cargar configuración:", error);
    }
}

function pintarFechaHoy() {
    const texto = new Date().toLocaleDateString("es-VE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
    document.getElementById("fecha-hoy").textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
    document.getElementById("pie-anio").textContent = new Date().getFullYear();
}

// ==========================================
// INICIALIZACIÓN
// ==========================================

window.addEventListener("hashchange", () => {
    if (window.usuarioSesion) cargarModulo();
});

window.addEventListener("DOMContentLoaded", async () => {
    pintarFechaHoy();
    await cargarNombreSistema();

    // Eventos de login y logout
    document.getElementById("form-login").addEventListener("submit", iniciarSesion);
    document.getElementById("btn-logout").addEventListener("click", cerrarSesion);

    // Verificar si hay sesión activa
    const autenticado = await verificarSesion();
    if (autenticado) {
        await cargarModulo();
    }
});
