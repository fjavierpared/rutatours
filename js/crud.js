/**
 * CRUD simple con formulario a la izquierda y tabla a la derecha (como el módulo Usuarios).
 * Lo usan Guías, Vehículos y Métodos de pago.
 *
 * Convención de ids en el HTML (prefijo = cfg.prefijo):
 *   <prefijo>-form, <prefijo>-id, <prefijo>-<campo>, <prefijo>-tabla, <prefijo>-filtro,
 *   <prefijo>-contador, <prefijo>-form-titulo (con <span>), <prefijo>-submit, <prefijo>-cancelar
 *
 * cfg = {
 *   prefijo, endpoint, idCampo, campos: [...],
 *   porDefecto: { campo: valor },          valores al limpiar el formulario
 *   singular, plural,                      para el contador ("guía", "guías")
 *   textoNuevo, textoEditar,               títulos del formulario
 *   busqueda: item => "texto buscable",
 *   fila: (item, i) => "<tr>...</tr>",     botones con data-accion="editar|eliminar" data-id
 *   vacio: { icono, texto },
 *   confirmarEliminar: item => "¿Eliminar ...?"
 * }
 */
function crearCrud(cfg) {
    const $ = sufijo => document.getElementById(`${cfg.prefijo}-${sufijo}`);
    const tbody = document.querySelector(`#${cfg.prefijo}-tabla tbody`);
    const columnas = document.querySelectorAll(`#${cfg.prefijo}-tabla thead th`).length;
    let items = [];

    async function cargar() {
        try {
            items = await api(cfg.endpoint);
            pintar();
        } catch (error) {
            tbody.innerHTML = `<tr><td colspan="${columnas}" class="vacio error-texto">Error al cargar: ${esc(error.message)}</td></tr>`;
        }
    }

    function pintar() {
        const filtro = ($("filtro")?.value || "").toLowerCase().trim();
        const lista = items.filter(it => !filtro || cfg.busqueda(it).toLowerCase().includes(filtro));
        const contador = $("contador");
        if (contador) {
            contador.innerHTML = lista.length === items.length
                ? `Total: <strong>${items.length}</strong> ${items.length === 1 ? cfg.singular : cfg.plural}`
                : `Mostrando: <strong>${lista.length}</strong> de ${items.length}`;
        }
        if (!lista.length) {
            tbody.innerHTML = items.length
                ? `<tr><td colspan="${columnas}" class="vacio">${icono("search", "icon-vacio")}<span>No hay resultados para "${esc(filtro)}"</span></td></tr>`
                : `<tr><td colspan="${columnas}" class="vacio">${icono(cfg.vacio.icono, "icon-vacio")}<span>${esc(cfg.vacio.texto)}</span></td></tr>`;
            return;
        }
        tbody.innerHTML = lista.map(cfg.fila).join("");
    }

    function leer() {
        return Object.fromEntries(cfg.campos.map(c => [c, $(c).value.trim()]));
    }

    function poner(item) {
        cfg.campos.forEach(c => { $(c).value = item[c] == null ? "" : String(item[c]); });
    }

    function limpiar() {
        $("form").reset();
        $("id").value = "";
        poner(cfg.porDefecto || {});
        $("form-titulo").querySelector("span").textContent = cfg.textoNuevo;
        $("submit").innerHTML = `${icono("save")}Guardar`;
        $("cancelar").classList.add("oculto");
    }

    async function guardar(e) {
        e.preventDefault();
        const id = $("id").value;
        const boton = $("submit");
        try {
            boton.disabled = true;
            const r = await api(id ? `${cfg.endpoint}/${id}` : cfg.endpoint, { method: id ? "PUT" : "POST", body: leer() });
            aviso(r.message);
            limpiar();
            await cargar();
        } catch (error) {
            aviso(error.message, "error");
        } finally {
            boton.disabled = false;
        }
    }

    async function accion(e) {
        const boton = e.target.closest("button[data-accion]");
        if (!boton) return;
        const item = items.find(it => String(it[cfg.idCampo]) === boton.dataset.id);
        if (!item) return;
        if (boton.dataset.accion === "editar") {
            poner(item);
            $("id").value = item[cfg.idCampo];
            $("form-titulo").querySelector("span").textContent = cfg.textoEditar;
            $("submit").innerHTML = `${icono("save")}Actualizar`;
            $("cancelar").classList.remove("oculto");
            $(cfg.campos[0]).focus();
        } else if (boton.dataset.accion === "eliminar" && await confirmar(cfg.confirmarEliminar(item), { titulo: "Eliminar", aceptar: "Eliminar", peligro: true })) {
            try {
                aviso((await api(`${cfg.endpoint}/${item[cfg.idCampo]}`, { method: "DELETE" })).message);
                await cargar();
            } catch (error) {
                aviso(error.message, "error");
            }
        }
    }

    $("form").addEventListener("submit", guardar);
    $("cancelar").addEventListener("click", limpiar);
    $("filtro")?.addEventListener("input", pintar);
    tbody.addEventListener("click", accion);
    limpiar();
    return { cargar };
}

// Insignias de estado comunes (activo / disponible)
function badgesEstado(item) {
    const activo = Number(item.activo)
        ? `<span class="badge badge-ok">Activo</span>`
        : `<span class="badge badge-off">Inactivo</span>`;
    const disp = "disponible" in item
        ? (Number(item.disponible) ? `<span class="badge badge-info">Disponible</span>` : `<span class="badge badge-aviso">No disponible</span>`)
        : "";
    return `<div class="badges">${activo}${disp}</div>`;
}

function botonesFila(id) {
    return `<button class="btn-icono" data-accion="editar" data-id="${id}" title="Editar">${icono("pencil")}</button>
            <button class="btn-icono peligro" data-accion="eliminar" data-id="${id}" title="Eliminar">${icono("trash-2")}</button>`;
}
