// Portal del cliente: petición al backend, sesión del cliente y utilidades de interfaz.
// Independiente de js/api.js (panel): usa otra clave de token para no mezclar sesiones.

const API_URL = "/api";
const CLAVE_TOKEN_CLIENTE = "token_cliente";
const CLAVE_CLIENTE = "cliente_sesion";

window.clienteSesion = (() => {
    try { return JSON.parse(localStorage.getItem(CLAVE_CLIENTE)); } catch { return null; }
})();

async function api(ruta, { method = "GET", body } = {}) {
    const token = localStorage.getItem(CLAVE_TOKEN_CLIENTE);
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}${ruta}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
        // Sesión vencida o inválida: se cierra localmente y se pide ingresar de nuevo
        if (res.status === 401 && token && !ruta.startsWith("/clientes/login") && !ruta.startsWith("/acceso") && !ruta.startsWith("/clientes/cambiar-clave")) {
            guardarSesion(null);
            if (typeof abrirAcceso === "function") abrirAcceso({ mensaje: "Su sesión expiró. Ingrese de nuevo." });
        }
        const error = new Error(datos.error || `Error HTTP ${res.status}`);
        error.status = res.status;
        throw error;
    }
    return datos;
}

function guardarSesion(r) {
    if (r) {
        localStorage.setItem(CLAVE_TOKEN_CLIENTE, r.token);
        localStorage.setItem(CLAVE_CLIENTE, JSON.stringify(r.cliente));
        window.clienteSesion = r.cliente;
    } else {
        localStorage.removeItem(CLAVE_TOKEN_CLIENTE);
        localStorage.removeItem(CLAVE_CLIENTE);
        window.clienteSesion = null;
    }
    if (typeof pintarCabecera === "function") pintarCabecera();
}

// ---------- Utilidades ----------

function esc(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function icono(nombre, clase = "") {
    return `<svg class="icon ${clase}" aria-hidden="true"><use href="img/icons.svg#i-${nombre}"></use></svg>`;
}

function fechaLocal(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatoFecha(iso) {
    if (!iso) return "";
    const [a, m, d] = String(iso).slice(0, 10).split("-");
    return `${d}-${m}-${a}`;
}

// Fechas AAAA-MM-DD sin zona horaria
function sumarDiasIso(iso, dias) {
    const [a, m, d] = iso.split("-").map(Number);
    return fechaLocal(new Date(a, m - 1, d + dias));
}

function diaSemanaIso(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    return new Date(a, m - 1, d).getDay();
}

const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function fechaLarga(iso) {
    if (!iso) return "";
    const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
    return new Date(a, m - 1, d).toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function duracion(dias, noches) {
    return `${dias} día${dias === 1 ? "" : "s"}${noches ? ` / ${noches} noche${noches === 1 ? "" : "s"}` : ""}`;
}

// Monto en USD con su equivalente en Bs debajo
function montoDoble(v, { fuerte = false } = {}) {
    const usd = fuerte ? `<strong>${formatoUsd(v.usd)}</strong>` : formatoUsd(v.usd);
    return `<span class="monto">${usd}${v.ves != null ? `<small>${formatoVes(v.ves)}</small>` : ""}</span>`;
}

let temporizadorAviso;
function aviso(mensaje, tipo = "ok") {
    const toast = document.getElementById("toast");
    toast.innerHTML = `${icono(tipo === "ok" ? "circle-check" : "circle-alert")}<span>${esc(mensaje)}</span>`;
    toast.className = `toast visible ${tipo}`;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => toast.classList.remove("visible"), 4000);
}

function leerComoDataUrl(archivo) {
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result);
        lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
        lector.readAsDataURL(archivo);
    });
}

// ---------- Tema (mismos colores que el panel) ----------

function textoSobre(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#1f2933" : "#ffffff";
}

function aplicarTema(t) {
    if (!t?.color_primario) return;
    const raiz = document.documentElement.style;
    raiz.setProperty("--primary", t.color_primario);
    raiz.setProperty("--secondary", t.color_secundario);
    raiz.setProperty("--acento", t.color_acento);
    raiz.setProperty("--sobre-primary", textoSobre(t.color_primario));
    raiz.setProperty("--sobre-secondary", textoSobre(t.color_secundario));
    raiz.setProperty("--sobre-acento", textoSobre(t.color_acento));
    // Color de la barra del navegador en el celular
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.color_primario);
    try { localStorage.setItem("tema_cliente", JSON.stringify(t)); } catch { /* sin almacenamiento */ }
}

try { aplicarTema(JSON.parse(localStorage.getItem("tema_cliente"))); } catch { /* tema por defecto del CSS */ }
