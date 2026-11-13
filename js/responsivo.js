/**
 * Ajustes del panel para celulares y tablets.
 *  1. Menú lateral como cajón deslizable (botón ☰, fondo oscuro, Esc, deslizar a la izquierda).
 *  2. Tablas como tarjetas en el celular: cada celda recibe data-label con el título de su
 *     columna (el CSS lo muestra a la izquierda del valor). Se aplica solo a las tablas que
 *     se pintan después, sin tocar el código de cada módulo.
 */
(function () {
    const MOVIL = window.matchMedia("(max-width: 1023px)");

    // ---------- 1. Menú lateral ----------
    const cuerpo = document.body;
    const menu = document.getElementById("menu-lateral");
    const fondo = document.getElementById("menu-fondo");
    const botonAbrir = document.getElementById("btn-menu");
    const botonCerrar = document.getElementById("btn-cerrar-menu");

    function abrirMenu() {
        fondo.hidden = false;
        // Un cuadro después, para que la transición de entrada se vea
        requestAnimationFrame(() => cuerpo.classList.add("menu-abierto"));
        botonAbrir.setAttribute("aria-expanded", "true");
        menu.querySelector("a.active, a")?.focus({ preventScroll: true });
    }

    function cerrarMenu({ devolverFoco = false } = {}) {
        if (!cuerpo.classList.contains("menu-abierto")) return;
        cuerpo.classList.remove("menu-abierto");
        botonAbrir.setAttribute("aria-expanded", "false");
        setTimeout(() => { if (!cuerpo.classList.contains("menu-abierto")) fondo.hidden = true; }, 250);
        if (devolverFoco) botonAbrir.focus({ preventScroll: true });
    }

    if (menu && fondo && botonAbrir) {
        botonAbrir.addEventListener("click", abrirMenu);
        botonCerrar?.addEventListener("click", () => cerrarMenu({ devolverFoco: true }));
        fondo.addEventListener("click", () => cerrarMenu());
        menu.addEventListener("click", e => { if (e.target.closest("a[href]")) cerrarMenu(); });
        window.addEventListener("hashchange", () => cerrarMenu());
        document.addEventListener("keydown", e => { if (e.key === "Escape") cerrarMenu({ devolverFoco: true }); });
        // Al pasar a pantalla ancha (girar la tablet) el menú vuelve a ser fijo
        MOVIL.addEventListener?.("change", e => { if (!e.matches) cerrarMenu(); });

        // Deslizar el cajón hacia la izquierda lo cierra
        let inicioX = null, inicioY = 0;
        menu.addEventListener("touchstart", e => { inicioX = e.touches[0].clientX; inicioY = e.touches[0].clientY; }, { passive: true });
        menu.addEventListener("touchend", e => {
            if (inicioX === null) return;
            const dx = e.changedTouches[0].clientX - inicioX;
            const dy = Math.abs(e.changedTouches[0].clientY - inicioY);
            if (dx < -60 && dy < 50) cerrarMenu();
            inicioX = null;
        }, { passive: true });
    }

    // Alto de la barra superior fija: lo usan otras barras pegajosas (editor de rutas) para no quedar tapadas
    const barra = document.querySelector(".top-bar");
    function medirBarra() {
        const fija = barra && getComputedStyle(barra).position === "sticky";
        document.documentElement.style.setProperty("--alto-topbar", fija ? `${barra.offsetHeight}px` : "0px");
    }
    if (barra && typeof ResizeObserver === "function") new ResizeObserver(medirBarra).observe(barra);
    window.addEventListener("resize", medirBarra);
    medirBarra();

    // ---------- 2. Tablas como tarjetas ----------
    function etiquetarTablas() {
        document.querySelectorAll("table.tabla-lista:not(.tabla-editable, .tabla-scroll)").forEach(tabla => {
            const titulos = [...tabla.querySelectorAll("thead th")].map(th => th.textContent.trim());
            if (!titulos.length) return;
            tabla.querySelectorAll("tbody tr").forEach(tr => {
                let col = 0;
                for (const td of tr.cells) {
                    if (!td.hasAttribute("data-label") && td.colSpan === 1) td.setAttribute("data-label", titulos[col] || "");
                    col += td.colSpan;
                }
            });
        });
    }

    let pendiente = false;
    new MutationObserver(() => {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(() => { pendiente = false; etiquetarTablas(); });
    }).observe(document.body, { childList: true, subtree: true });
    etiquetarTablas();
})();
