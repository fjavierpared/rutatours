const API_URL = "/api";

// Claves de localStorage (cámbielas por sistema si comparten dominio)
const CLAVE_TOKEN = "token_sesion";
const CLAVE_USUARIO = "usuario_sesion";

// Petición JSON al backend; incluye token de sesión si existe y maneja expiración
async function api(ruta, { method = "GET", body } = {}) {
    const token = localStorage.getItem(CLAVE_TOKEN);
    const headers = {};
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_URL}${ruta}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 401 && !ruta.includes("/auth/login")) {
            localStorage.removeItem(CLAVE_TOKEN);
            localStorage.removeItem(CLAVE_USUARIO);
            if (typeof mostrarLogin === "function") {
                mostrarLogin("Tu sesión ha expirado. Por favor, inicia sesión nuevamente.");
            }
        }
        const error = new Error(datos.error || `Error HTTP ${res.status}`);
        error.status = res.status;
        throw error;
    }
    return datos;
}

// --- UTILIDADES DE INTERFAZ ---

// Escapa texto antes de insertarlo con innerHTML
function esc(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Icono del sprite local img/icons.svg (Lucide)
function icono(nombre, clase = "") {
    return `<svg class="icon ${clase}" aria-hidden="true"><use href="img/icons.svg#i-${nombre}"></use></svg>`;
}

// --- TEMA (paleta de colores) ---

const TEMA_POR_DEFECTO = { color_primario: "#003366", color_secundario: "#00509e", color_acento: "#f2b705" };

// Texto blanco u oscuro según la luminosidad del fondo
function textoSobre(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#1f2933" : "#ffffff";
}

function aplicarTema(tema) {
    const t = { ...TEMA_POR_DEFECTO, ...Object.fromEntries(Object.entries(tema || {}).filter(([, v]) => v)) };
    const raiz = document.documentElement.style;
    raiz.setProperty("--primary", t.color_primario);
    raiz.setProperty("--secondary", t.color_secundario);
    raiz.setProperty("--acento", t.color_acento);
    raiz.setProperty("--sobre-primary", textoSobre(t.color_primario));
    raiz.setProperty("--sobre-secondary", textoSobre(t.color_secundario));
    raiz.setProperty("--sobre-acento", textoSobre(t.color_acento));
    // Color de la barra del navegador en el celular
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.color_primario);
    // Copia local para pintar el tema antes de que responda el servidor
    try { localStorage.setItem("tema", JSON.stringify(t)); } catch { /* sin almacenamiento local */ }
}

try { aplicarTema(JSON.parse(localStorage.getItem("tema"))); } catch { aplicarTema(); }

let toastTimer;
function aviso(mensaje, tipo = "ok") {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerHTML = `${icono(tipo === "ok" ? "circle-check" : "circle-alert")}<span>${esc(mensaje)}</span>`;
    toast.className = `toast visible ${tipo}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3500);
}

// Fecha local AAAA-MM-DD (toISOString usaría UTC y cambiaría de día en la noche)
function fechaLocal(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatoFecha(iso) {
    if (!iso) return "";
    const [a, m, d] = iso.slice(0, 10).split("-");
    return `${d}-${m}-${a}`;
}

function opcionesSelect(items, valor, texto, placeholder) {
    return `<option value="">${esc(placeholder)}</option>` +
        items.map(i => `<option value="${i[valor]}">${esc(texto(i))}</option>`).join("");
}
