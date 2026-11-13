/**
 * Diagrama esquemático del recorrido de una ruta (SVG en JS puro).
 * Compartido por el panel (vista previa del editor) y el portal del cliente.
 *
 * Uso:  dibujarRecorrido(contenedor, paradas, { dias })
 *   paradas: [{ nombre, dia, hora, tipo, actividades? }] en orden
 *
 * - Un color por día (leyenda abajo); cada tramo toma el color del día de la parada a la que llega.
 * - Hora debajo de cada parada.
 * - Si la primera y la última parada son el mismo lugar, se dibuja como circuito:
 *   la última parada no se repite y una línea de retorno vuelve al punto de salida.
 * - Horizontal en pantallas anchas; vertical cuando el contenedor mide menos de 560 px.
 * - No usa api.js: se puede cargar sola en cualquier página.
 */
(function () {
    const COLORES_DIA = ["#1b7a8c", "#d9731a", "#7b4bb7", "#2e8b57", "#c0392b", "#3366cc", "#a0522d", "#b8336a"];
    const ANCHO_VERTICAL = 560;
    const PASO_H = 132;     // separación horizontal entre paradas
    const PASO_V = 74;      // separación vertical entre paradas
    const TIPOS = {
        salida: "Salida", embarque: "Embarque", visita: "Visita", comida: "Comida",
        alojamiento: "Alojamiento", retorno: "Retorno", llegada: "Llegada"
    };

    const escapar = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const normalizar = t => String(t || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const colorDia = d => COLORES_DIA[(Math.max(1, Number(d) || 1) - 1) % COLORES_DIA.length];

    // Corta un texto en líneas de hasta `max` caracteres (máx. 3 líneas)
    function lineas(texto, max) {
        const palabras = String(texto || "").split(/\s+/).filter(Boolean);
        const res = [];
        let actual = "";
        for (const p of palabras) {
            if ((actual + " " + p).trim().length > max && actual) { res.push(actual); actual = p; } else actual = (actual + " " + p).trim();
        }
        if (actual) res.push(actual);
        if (res.length > 3) { res.length = 3; res[2] = res[2].slice(0, max - 1) + "…"; }
        return res;
    }

    function hora12(h) {
        if (!h) return "";
        const [hh, mm] = h.split(":").map(Number);
        return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "a. m." : "p. m."}`;
    }

    // Marca de la parada según su tipo: salida/llegada más grande, alojamiento cuadrado
    function marca(x, y, p, color) {
        const t = p.tipo;
        if (t === "alojamiento") {
            return `<rect x="${x - 9}" y="${y - 9}" width="18" height="18" rx="4" fill="#fff" stroke="${color}" stroke-width="3"/>
                    <path d="M${x - 4} ${y + 3}v-4l4-3 4 3v4z" fill="${color}"/>`;
        }
        if (t === "salida" || t === "llegada" || t === "retorno") {
            return `<circle cx="${x}" cy="${y}" r="11" fill="${color}"/><circle cx="${x}" cy="${y}" r="4.5" fill="#fff"/>`;
        }
        if (t === "comida") {
            return `<circle cx="${x}" cy="${y}" r="8" fill="#fff" stroke="${color}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="2.5" fill="${color}"/>`;
        }
        return `<circle cx="${x}" cy="${y}" r="8" fill="#fff" stroke="${color}" stroke-width="3"/>`;
    }

    function texto(x, y, contenido, { ancla = "middle", tam = 12, peso = 400, color = "currentColor", opacidad = 1 } = {}) {
        return `<text x="${x}" y="${y}" text-anchor="${ancla}" font-size="${tam}" font-weight="${peso}" fill="${color}" fill-opacity="${opacidad}">${escapar(contenido)}</text>`;
    }

    function leyenda(dias, total) {
        const items = [];
        for (let d = 1; d <= total; d++) {
            if (!dias.has(d)) continue;
            items.push(`<span class="diagrama-dia"><i style="background:${colorDia(d)}"></i>Día ${d}</span>`);
        }
        return items.join("");
    }

    // ---------- Horizontal ----------
    function svgHorizontal(nodos, circuito, ancho) {
        const n = nodos.length;
        const margen = 70;
        const util = Math.max(ancho, margen * 2 + (n - 1) * PASO_H);
        const paso = n > 1 ? (util - margen * 2) / (n - 1) : 0;
        const yLinea = 78;
        const alto = circuito ? 196 : 168;
        const xs = nodos.map((_, i) => margen + i * paso);
        let s = "";

        // Tramos
        for (let i = 1; i < n; i++) {
            s += `<line x1="${xs[i - 1]}" y1="${yLinea}" x2="${xs[i]}" y2="${yLinea}" stroke="${colorDia(nodos[i].dia)}" stroke-width="4" stroke-linecap="round"/>`;
        }
        if (circuito) {
            const fin = circuito;
            const yRet = yLinea + 92;
            const c = colorDia(fin.dia);
            // Baja desde la última parada, vuelve por debajo y entra por la izquierda al punto de salida
            s += `<path d="M${xs[n - 1]} ${yLinea} C${xs[n - 1] + 42} ${yLinea}, ${xs[n - 1] + 42} ${yRet}, ${xs[n - 1]} ${yRet} L${xs[0]} ${yRet} C${xs[0] - 56} ${yRet}, ${xs[0] - 56} ${yLinea}, ${xs[0] - 20} ${yLinea}"
                    fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/>`;
            s += `<path d="M${xs[0] - 22} ${yLinea - 5} l9 5 -9 5z" fill="${c}"/>`;
            s += texto((xs[0] + xs[n - 1]) / 2, yRet - 8,
                `Retorno a ${fin.nombre}${fin.hora ? ` · ${hora12(fin.hora)}` : ""} (día ${fin.dia})`, { tam: 11.5, color: c, peso: 600 });
        }

        // Paradas
        nodos.forEach((p, i) => {
            const x = xs[i];
            const color = colorDia(p.dia);
            const nombre = lineas(p.nombre, 17);
            nombre.forEach((l, k) => { s += texto(x, yLinea - 22 - (nombre.length - 1 - k) * 14, l, { peso: 600, tam: 12.5 }); });
            s += marca(x, yLinea, p, color);
            if (p.hora) s += texto(x, yLinea + 28, hora12(p.hora), { tam: 11.5, color, peso: 700 });
            s += texto(x, yLinea + (p.hora ? 43 : 28), TIPOS[p.tipo] || "", { tam: 10.5, opacidad: .6 });
        });

        return `<svg viewBox="0 0 ${util} ${alto}" width="${util}" height="${alto}" role="img" aria-label="Diagrama del recorrido" font-family="inherit">${s}</svg>`;
    }

    // ---------- Vertical (celular) ----------
    function svgVertical(nodos, circuito, ancho) {
        const n = nodos.length;
        const x = 34;
        const top = 24;
        const ys = nodos.map((_, i) => top + i * PASO_V);
        const alto = top + (n - 1) * PASO_V + (circuito ? 70 : 34);
        const maxCar = Math.max(16, Math.floor((ancho - x - 30) / 7.2));
        let s = "";

        for (let i = 1; i < n; i++) {
            s += `<line x1="${x}" y1="${ys[i - 1]}" x2="${x}" y2="${ys[i]}" stroke="${colorDia(nodos[i].dia)}" stroke-width="4" stroke-linecap="round"/>`;
        }
        if (circuito) {
            const c = colorDia(circuito.dia);
            const yFin = ys[n - 1] + 44;
            s += `<path d="M${x} ${ys[n - 1]} L${x} ${yFin - 10} Q${x} ${yFin} ${x - 10} ${yFin} L${x - 18} ${yFin} Q${x - 26} ${yFin} ${x - 26} ${yFin - 10} L${x - 26} ${ys[0] + 6} Q${x - 26} ${ys[0]} ${x - 18} ${ys[0]} L${x - 13} ${ys[0]}"
                    fill="none" stroke="${c}" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/>`;
            s += `<path d="M${x - 12} ${ys[0] - 5} l7 5 -7 5z" fill="${c}"/>`;
            s += texto(x + 22, yFin + 4, `Retorno a ${circuito.nombre}${circuito.hora ? ` · ${hora12(circuito.hora)}` : ""}`, { ancla: "start", tam: 12, color: c, peso: 600 });
        }

        nodos.forEach((p, i) => {
            const y = ys[i];
            const color = colorDia(p.dia);
            s += marca(x, y, p, color);
            const nombre = lineas(p.nombre, maxCar).slice(0, 2);
            nombre.forEach((l, k) => { s += texto(x + 22, y + 4 + k * 15, l, { ancla: "start", peso: 600, tam: 13 }); });
            const detalle = [p.hora ? hora12(p.hora) : "", `Día ${p.dia}`, TIPOS[p.tipo] || ""].filter(Boolean).join(" · ");
            s += texto(x + 22, y + 4 + nombre.length * 15 + 2, detalle, { ancla: "start", tam: 11.5, color, peso: 600 });
        });

        return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" height="${alto}" role="img" aria-label="Diagrama del recorrido" font-family="inherit">${s}</svg>`;
    }

    function pintar(contenedor, paradas, opciones) {
        const lista = (paradas || []).filter(p => String(p.nombre || "").trim());
        if (lista.length < 2) {
            contenedor.innerHTML = `<div class="diagrama-vacio">Agregue al menos dos paradas para ver el diagrama del recorrido.</div>`;
            return;
        }
        const nodos = lista.map(p => ({ ...p, dia: Number(p.dia) || 1 }));
        // Circuito: sale y vuelve al mismo lugar -> la última parada se dibuja como retorno
        let circuito = null;
        if (nodos.length >= 3 && normalizar(nodos[0].nombre) === normalizar(nodos[nodos.length - 1].nombre)) {
            circuito = nodos.pop();
        }
        const anchoContenedor = contenedor.clientWidth || 800;
        const vertical = anchoContenedor < ANCHO_VERTICAL;
        const ancho = Math.max(260, anchoContenedor - 16); // descuenta el padding y el borde del lienzo
        const dias = new Set(lista.map(p => Number(p.dia) || 1));
        const totalDias = Math.max(Number(opciones.dias) || 1, ...dias);

        contenedor.innerHTML = `
            <div class="diagrama-lienzo ${vertical ? "vertical" : "horizontal"}">
                ${vertical ? svgVertical(nodos, circuito, ancho) : svgHorizontal(nodos, circuito, ancho)}
            </div>
            <div class="diagrama-leyenda">
                ${leyenda(dias, totalDias)}
                ${circuito ? `<span class="diagrama-dia"><i class="discontinua"></i>Retorno al punto de salida</span>` : ""}
            </div>`;
        contenedor.dataset.orientacion = vertical ? "vertical" : "horizontal";
    }

    // Redibuja al cambiar el ancho del contenedor (pasar de horizontal a vertical y viceversa)
    const observados = new WeakMap();
    const observador = typeof ResizeObserver === "function" ? new ResizeObserver(entradas => {
        for (const e of entradas) {
            const datos = observados.get(e.target);
            if (!datos) continue;
            const ancho = Math.round(e.contentRect.width);
            if (Math.abs(ancho - datos.ancho) < 8) continue;
            datos.ancho = ancho;
            pintar(e.target, datos.paradas, datos.opciones);
        }
    }) : null;

    window.dibujarRecorrido = function (contenedor, paradas, opciones = {}) {
        if (!contenedor) return;
        contenedor.classList.add("diagrama-recorrido");
        pintar(contenedor, paradas, opciones);
        observados.set(contenedor, { paradas, opciones, ancho: contenedor.clientWidth });
        if (observador) observador.observe(contenedor);
    };
    window.COLORES_DIA_RECORRIDO = COLORES_DIA;
})();
