const PALETAS = [
    { nombre: "Azul institucional", color_primario: "#003366", color_secundario: "#00509e", color_acento: "#f2b705" },
    { nombre: "Vinotinto", color_primario: "#5c1526", color_secundario: "#8a2a3d", color_acento: "#d9a441" },
    { nombre: "Verde bosque", color_primario: "#173f30", color_secundario: "#2a6a50", color_acento: "#e0b341" },
    { nombre: "Azul petróleo", color_primario: "#0d3b47", color_secundario: "#17697a", color_acento: "#f28f3b" },
    { nombre: "Grafito", color_primario: "#23272e", color_secundario: "#3d4450", color_acento: "#3fa7d6" },
    { nombre: "Índigo", color_primario: "#2a2463", color_secundario: "#4b44a0", color_acento: "#f2c94c" }
];
const CAMPOS_COLOR = ["color_primario", "color_secundario", "color_acento"];

async function inicializarConfiguracion() {
    document.getElementById("form-config").addEventListener("submit", guardarConfiguracionCompleta);

    document.getElementById("config-paletas").innerHTML = PALETAS.map((p, i) => `
        <button type="button" class="paleta" data-paleta="${i}">
            <span class="paleta-muestras">${CAMPOS_COLOR.map(c => `<span style="background:${p[c]}"></span>`).join("")}</span>
            <span class="paleta-nombre">${esc(p.nombre)}</span>
        </button>`).join("");
    document.getElementById("config-paletas").addEventListener("click", e => {
        const boton = e.target.closest("[data-paleta]");
        if (boton) ponerColores(PALETAS[boton.dataset.paleta]);
    });
    CAMPOS_COLOR.forEach(c => document.getElementById(idColor(c)).addEventListener("input", previsualizarColores));
    document.getElementById("config-restaurar").addEventListener("click", () => ponerColores(TEMA_POR_DEFECTO));

    for (const id of ["config-redondeo-modo", "config-redondeo-paso"]) {
        document.getElementById(id).addEventListener("change", ejemploRedondeo);
    }

    try {
        const config = await api("/configuracion");
        document.getElementById("config-nombre").value = config.nombre_sistema || "";
        document.getElementById("config-redondeo-modo").value = config.redondeo_modo || "arriba";
        ponerPasoRedondeo(Number(config.redondeo_paso) || 0.1);
        ejemploRedondeo();
        ponerColores(config);
    } catch (error) {
        aviso(error.message, "error");
        ponerColores(TEMA_POR_DEFECTO);
    }
}

function idColor(campo) {
    return `config-${campo.replace("_", "-")}`;
}

function ponerColores(tema) {
    CAMPOS_COLOR.forEach(c => { document.getElementById(idColor(c)).value = tema[c] || TEMA_POR_DEFECTO[c]; });
    previsualizarColores();
}

function leerColores() {
    return Object.fromEntries(CAMPOS_COLOR.map(c => [c, document.getElementById(idColor(c)).value]));
}

// Aplica los colores en vivo; si no se guardan, app.js restaura el tema guardado al salir del módulo
function previsualizarColores() {
    const colores = leerColores();
    CAMPOS_COLOR.forEach(c => {
        document.getElementById(idColor(c)).closest(".color-input").querySelector("code").textContent = colores[c].toUpperCase();
    });
    document.querySelectorAll("#config-paletas .paleta").forEach((b, i) =>
        b.classList.toggle("activa", CAMPOS_COLOR.every(c => PALETAS[i][c] === colores[c])));
    aplicarTema(colores);
}

async function guardarConfiguracionCompleta(e) {
    e.preventDefault();
    const datos = {
        nombre_sistema: document.getElementById("config-nombre").value,
        ...leerColores(),
        redondeo_modo: document.getElementById("config-redondeo-modo").value,
        redondeo_paso: Number(document.getElementById("config-redondeo-paso").value)
    };
    try {
        aviso((await api("/configuracion", { method: "PUT", body: datos })).message);
        await cargarNombreSistema();
    } catch (error) {
        aviso(error.message, "error");
    }
}

// Si el paso guardado no está en la lista (Ej.: 0,25), se agrega como opción
function ponerPasoRedondeo(paso) {
    const select = document.getElementById("config-redondeo-paso");
    const valor = paso.toFixed(2);
    if (![...select.options].some(o => o.value === valor)) {
        select.add(new Option(`${valor.replace(".", ",")} $`, valor));
    }
    select.value = valor;
}

// Muestra cómo quedaría 89,175 $ (ejemplo de la ruta Eje Panamericano) con el redondeo elegido
function ejemploRedondeo() {
    const modo = document.getElementById("config-redondeo-modo").value;
    const paso = Number(document.getElementById("config-redondeo-paso").value);
    document.getElementById("config-redondeo-paso").disabled = modo === "ninguno";
    const base = 89.175;
    const centavos = Math.round(paso * 100);
    const exacto = base * 100;
    let r;
    if (modo === "ninguno") r = Math.round(exacto);
    else if (modo === "arriba") r = Math.ceil(exacto / centavos - 1e-9) * centavos;
    else r = Math.round(exacto / centavos) * centavos;
    document.getElementById("config-redondeo-ejemplo").innerHTML =
        `${numeroEs(base, 3)} $ → <strong>${formatoUsd(r / 100)}</strong> por persona`;
}
