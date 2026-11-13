// Módulo Ayuda: manual de usuario con índice que sigue la lectura e impresión a PDF
let observadorManual = null;

async function inicializarAyuda() {
    const contenedor = document.getElementById("contenedor-modulos");
    const nombre = document.getElementById("nombre-sistema")?.textContent || "RutaTours";
    document.querySelectorAll("[data-nombre-sistema]").forEach(el => { el.textContent = nombre; });

    // Los enlaces del índice desplazan dentro del manual (el hash de la URL es del módulo)
    document.getElementById("manual-indice").addEventListener("click", e => {
        const a = e.target.closest('a[href^="#m-"]');
        if (!a) return;
        e.preventDefault();
        document.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.getElementById("manual-imprimir").addEventListener("click", () => window.print());
    // Al imprimir, las preguntas frecuentes van abiertas
    window.addEventListener("beforeprint", () => document.querySelectorAll("#manual-cuerpo details").forEach(d => { d.open = true; }));

    // Resalta en el índice la sección que se está leyendo
    observadorManual?.disconnect();
    const enlaces = new Map([...document.querySelectorAll("#manual-indice a")].map(a => [a.getAttribute("href").slice(1), a]));
    observadorManual = new IntersectionObserver(entradas => {
        for (const e of entradas) {
            if (!e.isIntersecting) continue;
            enlaces.forEach(a => a.classList.remove("activo"));
            enlaces.get(e.target.id)?.classList.add("activo");
        }
    }, { root: window.innerWidth > 860 ? contenedor : null, rootMargin: "0px 0px -70% 0px" });
    document.querySelectorAll("#manual-cuerpo section[id], #manual-cuerpo h3[id]").forEach(s => observadorManual.observe(s));
}
