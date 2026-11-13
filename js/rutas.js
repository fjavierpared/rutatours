// Módulo Rutas: listado y editor completo (recorrido, costos, cargos, ficha, imágenes y cotizador)
//
// El editor trabaja sobre el objeto `rutaEd`. Los campos se enlazan con atributos:
//   data-g="campo"                         -> campo general de la ruta (rutaEd[campo])
//   data-l="lista" data-i="n" data-c="c"   -> rutaEd[lista][n][c]   (paradas, costos, cargos, detalles)
//   data-l="actividades" data-p="n"        -> rutaEd.paradas[n].actividades
//   data-op="agregar|quitar|subir|bajar"   -> operaciones sobre las listas

const TIPOS_PARADA = [["salida", "Salida"], ["embarque", "Embarque"], ["visita", "Visita"], ["comida", "Comida"],
    ["alojamiento", "Alojamiento"], ["retorno", "Retorno"], ["llegada", "Llegada"]];
const TIPOS_COSTO = [["grupo", "Grupo"], ["persona", "Por persona"], ["unidad", "Unidad (cupo)"]];
const TIPOS_DETALLE = [["incluye", "Incluye"], ["no_incluye", "No incluye"], ["recomendacion", "Recomendaciones"]];
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MAX_IMAGEN = 2 * 1024 * 1024;

let rutasLista = [];
let rutaEd = null;
let rutaRecursos = { guias: [], vehiculos: [] };
let rutaSucio = false;
let rutaTimerDiagrama;

async function inicializarRutas() {
    document.getElementById("rutas-filtro").addEventListener("input", pintarListaRutas);
    document.getElementById("rutas-nueva").addEventListener("click", () => abrirEditorRuta(null));
    document.querySelector("#rutas-tabla tbody").addEventListener("click", accionListaRuta);

    const editor = document.getElementById("rutas-vista-editor");
    editor.addEventListener("input", editarCampoRuta);
    editor.addEventListener("change", editarCampoRuta);
    editor.addEventListener("click", operarListaRuta);
    document.getElementById("ruta-volver").addEventListener("click", cerrarEditorRuta);
    document.getElementById("ruta-guardar").addEventListener("click", guardarRuta);
    document.getElementById("ruta-costos-recursos").addEventListener("click", agregarCostosRecursos);
    document.getElementById("ruta-imagen-archivo").addEventListener("change", subirImagenesRuta);
    document.getElementById("ruta-imagenes").addEventListener("click", borrarImagenRuta);
    document.getElementById("ruta-cotizar").addEventListener("click", cotizarRuta);
    document.getElementById("ruta-tabla-precios").addEventListener("click", tablaPreciosRuta);

    await cargarRutas();
}

// ==========================================
// LISTADO
// ==========================================

async function cargarRutas() {
    const tbody = document.querySelector("#rutas-tabla tbody");
    try {
        rutasLista = await api("/rutas");
        pintarListaRutas();
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="9" class="vacio error-texto">Error al cargar las rutas: ${esc(error.message)}</td></tr>`;
    }
}

function pintarListaRutas() {
    const tbody = document.querySelector("#rutas-tabla tbody");
    const filtro = document.getElementById("rutas-filtro").value.toLowerCase().trim();
    const lista = rutasLista.filter(r => !filtro || `${r.nombre} ${r.zona || ""}`.toLowerCase().includes(filtro));
    document.getElementById("rutas-contador").innerHTML = lista.length === rutasLista.length
        ? `Total: <strong>${rutasLista.length}</strong> ruta${rutasLista.length === 1 ? "" : "s"}`
        : `Mostrando: <strong>${lista.length}</strong> de ${rutasLista.length}`;

    if (!lista.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="vacio">${icono(rutasLista.length ? "search" : "route", "icon-vacio")}<span>${rutasLista.length ? "No hay rutas que coincidan" : "Aún no hay rutas: cree la primera con «Nueva ruta»"}</span></td></tr>`;
        return;
    }
    tbody.innerHTML = lista.map((r, i) => `
        <tr class="${r.activa ? "" : "fila-inactiva"}">
            <td class="col-num">${i + 1}</td>
            <td><div class="celda-item-texto"><span>${esc(r.nombre)}</span><small class="celda-subtexto">${esc(r.zona || "")}</small></div></td>
            <td>${r.dias}D / ${r.noches}N</td>
            <td>${r.min_personas} a ${r.max_personas}</td>
            <td><div class="celda-item-texto"><span>${esc(r.guia || "Sin guía")}</span><small class="celda-subtexto">${r.placa ? `${esc(r.placa)} · ${r.capacidad} pax` : "Sin vehículo"}</small></div></td>
            <td class="num">${r.paradas}</td>
            <td class="num">${r.reservas}</td>
            <td><div class="badges">
                ${r.activa ? `<span class="badge badge-ok">Activa</span>` : `<span class="badge badge-off">Borrador</span>`}
                ${r.disponible ? "" : `<span class="badge badge-aviso">Reservas pausadas</span>`}
            </div></td>
            <td class="col-acciones">
                <button class="btn-icono" data-accion="editar" data-id="${r.id_ruta}" title="Editar">${icono("pencil")}</button>
                <button class="btn-icono ${r.activa ? "peligro" : "exito"}" data-accion="estado" data-id="${r.id_ruta}" title="${r.activa ? "Desactivar" : "Activar"}">${icono(r.activa ? "ban" : "circle-check")}</button>
                <button class="btn-icono peligro" data-accion="eliminar" data-id="${r.id_ruta}" title="Eliminar">${icono("trash-2")}</button>
            </td>
        </tr>`).join("");
}

async function accionListaRuta(e) {
    const boton = e.target.closest("button[data-accion]");
    if (!boton) return;
    const ruta = rutasLista.find(r => r.id_ruta === Number(boton.dataset.id));
    if (!ruta) return;
    try {
        if (boton.dataset.accion === "editar") {
            await abrirEditorRuta(ruta.id_ruta);
        } else if (boton.dataset.accion === "estado") {
            aviso((await api(`/rutas/${ruta.id_ruta}/estado`, { method: "PATCH", body: { activa: ruta.activa ? 0 : 1 } })).message);
            await cargarRutas();
        } else if (boton.dataset.accion === "eliminar" && await confirmar(`¿Eliminar la ruta "${ruta.nombre}" con todo su recorrido, costos e imágenes?`, { titulo: "Eliminar ruta", aceptar: "Eliminar", peligro: true })) {
            aviso((await api(`/rutas/${ruta.id_ruta}`, { method: "DELETE" })).message);
            await cargarRutas();
        }
    } catch (error) {
        aviso(error.message, "error");
    }
}

// ==========================================
// EDITOR: apertura, carga y guardado
// ==========================================

function rutaNueva() {
    return {
        id_ruta: null, nombre: "", zona: "", descripcion: "", dias: 1, noches: 0, id_guia: "", id_vehiculo: "",
        min_personas: 1, max_personas: 10, abono_pct: 50, fecha_desde: "", fecha_hasta: "", dias_semana: [],
        anticipacion_dias: 1, disponible: 1, activa: 0,
        paradas: [
            { dia: 1, hora: "07:00", nombre: "", descripcion: "", tipo: "salida", actividades: [] },
            { dia: 1, hora: "", nombre: "", descripcion: "", tipo: "llegada", actividades: [] }
        ],
        costos: [],
        cargos: [
            { nombre: "Ganancia", tipo: "ganancia", porcentaje: 25, base: "costo", aplica: "siempre" },
            { nombre: "IVA", tipo: "impuesto", porcentaje: 16, base: "acumulado", aplica: "siempre" },
            { nombre: "IGTF", tipo: "impuesto", porcentaje: 3, base: "acumulado", aplica: "pago_divisas" }
        ],
        detalles: [],
        imagenes: [],
        problemas: null
    };
}

// Convierte la ruta del servidor al formato del editor (null -> "" en los campos de formulario)
function rutaParaEditor(r) {
    const v = x => (x == null ? "" : x);
    return {
        ...r,
        zona: v(r.zona), descripcion: v(r.descripcion), id_guia: v(r.id_guia), id_vehiculo: v(r.id_vehiculo),
        fecha_desde: v(r.fecha_desde), fecha_hasta: v(r.fecha_hasta), abono_pct: Number(r.abono_pct),
        dias_semana: r.dias_semana ? String(r.dias_semana).split(",") : [],
        paradas: r.paradas.map(p => ({
            dia: p.dia, hora: v(p.hora), nombre: p.nombre, descripcion: v(p.descripcion), tipo: p.tipo,
            actividades: p.actividades.map(a => ({ dia: v(a.dia), hora: v(a.hora), descripcion: a.descripcion }))
        })),
        costos: r.costos.map(c => ({
            tipo: c.tipo, categoria: c.categoria, concepto: c.concepto, monto_usd: Number(c.monto_usd),
            capacidad_unidad: v(c.capacidad_unidad), cantidad_disponible: v(c.cantidad_disponible)
        })),
        cargos: r.cargos.map(c => ({ nombre: c.nombre, tipo: c.tipo, porcentaje: Number(c.porcentaje), base: c.base, aplica: c.aplica })),
        detalles: r.detalles.map(d => ({ tipo: d.tipo, texto: d.texto }))
    };
}

async function abrirEditorRuta(id) {
    try {
        const [guias, vehiculos, ruta] = await Promise.all([
            api("/guias"), api("/vehiculos"), id ? api(`/rutas/${id}`) : null
        ]);
        rutaRecursos = { guias, vehiculos };
        rutaEd = ruta ? rutaParaEditor(ruta) : rutaNueva();
    } catch (error) {
        return aviso(error.message, "error");
    }
    document.getElementById("rutas-vista-lista").classList.add("oculto");
    document.getElementById("rutas-vista-editor").classList.remove("oculto");
    document.getElementById("ruta-cotizacion").innerHTML = "";
    pintarEditorRuta();
    marcarSucio(false);
    document.getElementById("contenedor-modulos").scrollTop = 0;
    window.scrollTo(0, 0);
}

async function cerrarEditorRuta() {
    if (rutaSucio && !(await confirmar("Hay cambios sin guardar. ¿Salir del editor y descartarlos?", { titulo: "Cambios sin guardar", aceptar: "Descartar cambios", cancelar: "Seguir editando", peligro: true }))) return;
    rutaEd = null;
    document.getElementById("rutas-vista-editor").classList.add("oculto");
    document.getElementById("rutas-vista-lista").classList.remove("oculto");
    await cargarRutas();
}

function marcarSucio(valor = true) {
    rutaSucio = valor;
    document.getElementById("ruta-sucio").classList.toggle("oculto", !valor);
}

async function guardarRuta() {
    const boton = document.getElementById("ruta-guardar");
    const { imagenes, problemas, guia, vehiculo, id_ruta, ...datos } = rutaEd;
    try {
        boton.disabled = true;
        const r = await api(id_ruta ? `/rutas/${id_ruta}` : "/rutas", { method: id_ruta ? "PUT" : "POST", body: datos });
        aviso(r.message);
        const recargada = rutaParaEditor(await api(`/rutas/${r.id_ruta}`));
        rutaEd = recargada;
        pintarEditorRuta();
        marcarSucio(false);
    } catch (error) {
        aviso(error.message, "error");
    } finally {
        boton.disabled = false;
    }
}

// ==========================================
// EDITOR: pintado
// ==========================================

function pintarEditorRuta() {
    const r = rutaEd;
    document.getElementById("ruta-editor-titulo").textContent = r.id_ruta ? `Editar: ${r.nombre}` : "Nueva ruta";

    const g = rutaRecursos.guias;
    document.getElementById("ruta-id_guia").innerHTML = `<option value="">Sin asignar</option>` + g.map(x =>
        `<option value="${x.id_guia}">${esc(x.nombre)}${x.activo ? "" : " (inactivo)"}${x.disponible ? "" : " (no disponible)"} · ${formatoUsd(x.costo_dia_usd)}/día</option>`).join("");
    const v = rutaRecursos.vehiculos;
    document.getElementById("ruta-id_vehiculo").innerHTML = `<option value="">Sin asignar</option>` + v.map(x =>
        `<option value="${x.id_vehiculo}">${esc(x.placa)} · ${esc(x.tipo)} · ${x.capacidad} pax${x.activo ? "" : " (inactivo)"}${x.disponible ? "" : " (no disponible)"}</option>`).join("");

    document.querySelectorAll("#rutas-vista-editor [data-g]").forEach(el => { el.value = r[el.dataset.g] ?? ""; });
    document.getElementById("ruta-dias-semana").innerHTML = DIAS_CORTOS.map((d, i) => `
        <label class="chip-check"><input type="checkbox" data-dia="${i}" ${r.dias_semana.includes(String(i)) ? "checked" : ""}><span>${d}</span></label>`).join("");

    const guardada = !!r.id_ruta;
    document.getElementById("ruta-imagen-boton").classList.toggle("oculto", !guardada);
    document.getElementById("ruta-imagenes-aviso").classList.toggle("oculto", guardada);
    document.getElementById("ruta-card-cotizador").classList.toggle("oculto", !guardada);
    document.getElementById("ruta-cotizar-personas").value = r.min_personas;

    ayudaMaximo();
    pintarProblemas();
    pintarParadas();
    pintarCostos();
    pintarCargos();
    pintarDetalles();
    pintarImagenes();
    dibujarDiagramaRuta();
}

function ayudaMaximo() {
    const v = rutaRecursos.vehiculos.find(x => String(x.id_vehiculo) === String(rutaEd.id_vehiculo));
    const ayuda = document.getElementById("ruta-max-ayuda");
    const excede = v && Number(rutaEd.max_personas) > v.capacidad;
    ayuda.textContent = v ? `Capacidad del vehículo: ${v.capacidad} pasajeros${excede ? " (el máximo la supera)" : ""}` : "";
    ayuda.classList.toggle("error-texto", !!excede);
}

function pintarProblemas() {
    const ul = document.getElementById("ruta-problemas");
    const p = rutaEd.problemas;
    if (p == null) {
        ul.innerHTML = `<li class="requisito-falta">${icono("info")}<span>Guarde la ruta para verificar si cumple los requisitos para activarse.</span></li>`;
    } else if (!p.length) {
        ul.innerHTML = `<li class="requisito-ok">${icono("circle-check")}<span>La ruta cumple los requisitos para activarse.</span></li>`;
    } else {
        ul.innerHTML = p.map(t => `<li class="requisito-falta">${icono("circle-alert")}<span>${esc(t)}</span></li>`).join("");
    }
}

const opcionesRuta = (lista, valor) => lista.map(([v, t]) => `<option value="${v}" ${String(valor) === v ? "selected" : ""}>${t}</option>`).join("");

function botonesOrden(l, i, total, p) {
    const dp = p != null ? ` data-p="${p}"` : "";
    return `
        <button type="button" class="btn-icono" data-op="subir" data-l="${l}" data-i="${i}"${dp} title="Subir" ${i === 0 ? "disabled" : ""}>${icono("chevron-up")}</button>
        <button type="button" class="btn-icono" data-op="bajar" data-l="${l}" data-i="${i}"${dp} title="Bajar" ${i === total - 1 ? "disabled" : ""}>${icono("chevron-down")}</button>
        <button type="button" class="btn-icono peligro" data-op="quitar" data-l="${l}" data-i="${i}"${dp} title="Quitar">${icono("trash-2")}</button>`;
}

function pintarParadas() {
    const dias = Math.max(1, Number(rutaEd.dias) || 1);
    const colores = window.COLORES_DIA_RECORRIDO || ["#1b7a8c"];
    const ps = rutaEd.paradas;
    document.getElementById("ruta-paradas").innerHTML = ps.length ? ps.map((p, i) => {
        const campo = (c, extra = "") => `data-l="paradas" data-i="${i}" data-c="${c}" ${extra}`;
        const color = colores[(Math.max(1, Number(p.dia) || 1) - 1) % colores.length];
        return `
        <div class="item-parada" style="--color-dia:${color}">
            <div class="item-fila">
                <span class="item-num">${i + 1}</span>
                <input type="text" class="crece" ${campo("nombre")} value="${esc(p.nombre)}" maxlength="120" placeholder="Lugar (Ej.: Mérida)" aria-label="Nombre de la parada ${i + 1}">
                <select ${campo("tipo")} aria-label="Tipo de parada">${opcionesRuta(TIPOS_PARADA, p.tipo)}</select>
                <label class="campo-corto">Día <input type="number" ${campo("dia")} value="${esc(p.dia)}" min="1" max="${dias}" step="1"></label>
                <label class="campo-corto">Hora <input type="time" ${campo("hora")} value="${esc(p.hora)}"></label>
                <span class="item-acciones">${botonesOrden("paradas", i, ps.length)}</span>
            </div>
            <textarea ${campo("descripcion")} rows="2" maxlength="2000" placeholder="Descripción para el cliente (opcional)" aria-label="Descripción de la parada ${i + 1}">${esc(p.descripcion)}</textarea>
            <div class="actividades">
                ${p.actividades.map((a, j) => {
                    const ca = c => `data-l="actividades" data-p="${i}" data-i="${j}" data-c="${c}"`;
                    return `
                    <div class="item-fila actividad">
                        <select ${ca("dia")} aria-label="Día de la actividad" title="Día de la actividad">
                            <option value="">Mismo día</option>
                            ${Array.from({ length: dias }, (_, k) => `<option value="${k + 1}" ${String(a.dia) === String(k + 1) ? "selected" : ""}>Día ${k + 1}</option>`).join("")}
                        </select>
                        <input type="time" ${ca("hora")} value="${esc(a.hora)}" aria-label="Hora de la actividad">
                        <input type="text" class="crece" ${ca("descripcion")} value="${esc(a.descripcion)}" maxlength="255" placeholder="Actividad (Ej.: Almuerzo incluido)" aria-label="Descripción de la actividad">
                        <span class="item-acciones">${botonesOrden("actividades", j, p.actividades.length, i)}</span>
                    </div>`;
                }).join("")}
                <button type="button" class="btn-enlace" data-op="agregar" data-l="actividades" data-p="${i}">${icono("plus")}Agregar actividad</button>
            </div>
        </div>`;
    }).join("") : `<p class="ayuda">Sin paradas.</p>`;
}

function pintarCostos() {
    const tbody = document.querySelector("#ruta-costos tbody");
    const cs = rutaEd.costos;
    if (!cs.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="vacio"><span>Sin costos. Agregue al menos uno para poder activar la ruta.</span></td></tr>`;
        return;
    }
    tbody.innerHTML = cs.map((c, i) => {
        const campo = k => `data-l="costos" data-i="${i}" data-c="${k}"`;
        const unidad = c.tipo === "unidad";
        return `
        <tr>
            <td><select ${campo("tipo")} aria-label="Tipo de costo">${opcionesRuta(TIPOS_COSTO, c.tipo)}</select></td>
            <td><input type="text" ${campo("categoria")} value="${esc(c.categoria)}" maxlength="60" placeholder="Ej.: Alojamiento" list="ruta-categorias" aria-label="Categoría"></td>
            <td><input type="text" ${campo("concepto")} value="${esc(c.concepto)}" maxlength="120" placeholder="Ej.: Habitación cuádruple" aria-label="Concepto"></td>
            <td class="num"><input type="number" ${campo("monto_usd")} value="${esc(c.monto_usd)}" min="0" step="0.01" aria-label="Monto en USD"></td>
            <td class="num">${unidad ? `<input type="number" ${campo("capacidad_unidad")} value="${esc(c.capacidad_unidad)}" min="1" step="1" aria-label="Personas por unidad">` : "—"}</td>
            <td class="num">${unidad ? `<input type="number" ${campo("cantidad_disponible")} value="${esc(c.cantidad_disponible)}" min="0" step="1" placeholder="Sin límite" aria-label="Unidades disponibles">` : "—"}</td>
            <td class="col-acciones">${botonesOrden("costos", i, cs.length)}</td>
        </tr>`;
    }).join("") + `<datalist id="ruta-categorias">${["Transporte", "Guía", "Alojamiento", "Alimentación", "Entradas", "Permisos", "Seguro", "Actividades"]
        .map(c => `<option value="${c}">`).join("")}</datalist>`;
}

function pintarCargos() {
    const tbody = document.querySelector("#ruta-cargos tbody");
    const cs = rutaEd.cargos;
    if (!cs.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="vacio"><span>Sin cargos: el precio será el costo exacto.</span></td></tr>`;
        return;
    }
    tbody.innerHTML = cs.map((c, i) => {
        const campo = k => `data-l="cargos" data-i="${i}" data-c="${k}"`;
        return `
        <tr>
            <td><input type="text" ${campo("nombre")} value="${esc(c.nombre)}" maxlength="60" aria-label="Nombre del cargo"></td>
            <td><select ${campo("tipo")} aria-label="Tipo">${opcionesRuta([["ganancia", "Ganancia (oculta)"], ["impuesto", "Impuesto (visible)"]], c.tipo)}</select></td>
            <td class="num"><input type="number" ${campo("porcentaje")} value="${esc(c.porcentaje)}" min="0" max="1000" step="0.01" aria-label="Porcentaje"></td>
            <td><select ${campo("base")} aria-label="Base">${opcionesRuta([["costo", "Sobre el costo"], ["acumulado", "Sobre el acumulado"]], c.base)}</select></td>
            <td><select ${campo("aplica")} aria-label="Aplica">${opcionesRuta([["siempre", "Siempre"], ["pago_divisas", "Solo pago en divisas"]], c.aplica)}</select></td>
            <td class="col-acciones">${botonesOrden("cargos", i, cs.length)}</td>
        </tr>`;
    }).join("");
}

function pintarDetalles() {
    document.getElementById("ruta-detalles").innerHTML = TIPOS_DETALLE.map(([tipo, titulo]) => {
        const items = rutaEd.detalles.map((d, i) => ({ ...d, i })).filter(d => d.tipo === tipo);
        return `
        <div class="detalles-col">
            <h4>${titulo}</h4>
            ${items.map(d => `
                <div class="item-fila">
                    <input type="text" class="crece" data-l="detalles" data-i="${d.i}" data-c="texto" value="${esc(d.texto)}" maxlength="500" aria-label="${titulo}">
                    <button type="button" class="btn-icono peligro" data-op="quitar" data-l="detalles" data-i="${d.i}" title="Quitar">${icono("trash-2")}</button>
                </div>`).join("")}
            <button type="button" class="btn-enlace" data-op="agregar" data-l="detalles" data-t="${tipo}">${icono("plus")}Agregar</button>
        </div>`;
    }).join("");
}

function pintarImagenes() {
    const imgs = rutaEd.imagenes || [];
    document.getElementById("ruta-imagenes").innerHTML = imgs.length ? imgs.map((img, i) => `
        <figure class="galeria-item">
            <img src="uploads/${encodeURIComponent(img.archivo)}" alt="Imagen ${i + 1} de la ruta" loading="lazy">
            ${i === 0 ? `<span class="galeria-portada">Portada</span>` : ""}
            <button type="button" class="btn-icono peligro" data-imagen="${img.id_imagen}" title="Eliminar imagen">${icono("trash-2")}</button>
        </figure>`).join("") : (rutaEd.id_ruta ? `<p class="ayuda">Sin imágenes.</p>` : "");
}

function dibujarDiagramaRuta() {
    // El temporizador puede dispararse después de cerrar el editor o cambiar de módulo
    if (rutaEd && typeof dibujarRecorrido === "function" && document.getElementById("ruta-diagrama")) {
        dibujarRecorrido(document.getElementById("ruta-diagrama"), rutaEd.paradas, { dias: rutaEd.dias });
    }
}

function programarDiagrama() {
    clearTimeout(rutaTimerDiagrama);
    rutaTimerDiagrama = setTimeout(dibujarDiagramaRuta, 250);
}

// ==========================================
// EDITOR: edición
// ==========================================

function listaRuta(l, p) {
    return l === "actividades" ? rutaEd.paradas[Number(p)].actividades : rutaEd[l];
}

function editarCampoRuta(e) {
    const el = e.target;
    if (!rutaEd || el.closest("#ruta-card-cotizador") || el.type === "file") return;
    const esCambio = e.type === "change";

    if (el.dataset.g) {
        rutaEd[el.dataset.g] = el.value;
        if (el.dataset.g === "dias" && esCambio) { pintarParadas(); dibujarDiagramaRuta(); }
        if (["id_vehiculo", "max_personas"].includes(el.dataset.g)) ayudaMaximo();
    } else if (el.dataset.dia !== undefined) {
        rutaEd.dias_semana = [...document.querySelectorAll("#ruta-dias-semana input:checked")].map(x => x.dataset.dia);
    } else if (el.dataset.l && el.dataset.c) {
        const item = listaRuta(el.dataset.l, el.dataset.p)[Number(el.dataset.i)];
        if (!item) return;
        item[el.dataset.c] = el.value;
        if (el.dataset.l === "costos" && el.dataset.c === "tipo" && esCambio) pintarCostos();
        if (el.dataset.l === "paradas" && el.dataset.c === "dia" && esCambio) pintarParadas();
        if (el.dataset.l === "paradas" || el.dataset.l === "actividades") programarDiagrama();
    } else {
        return;
    }
    marcarSucio();
}

function itemNuevo(l, boton) {
    switch (l) {
        case "paradas": {
            const ultima = rutaEd.paradas[rutaEd.paradas.length - 1];
            return { dia: ultima ? ultima.dia : 1, hora: "", nombre: "", descripcion: "", tipo: "visita", actividades: [] };
        }
        case "actividades": return { dia: "", hora: "", descripcion: "" };
        case "costos": return { tipo: "persona", categoria: "", concepto: "", monto_usd: "", capacidad_unidad: "", cantidad_disponible: "" };
        case "cargos": return { nombre: "", tipo: "impuesto", porcentaje: "", base: "acumulado", aplica: "siempre" };
        case "detalles": return { tipo: boton.dataset.t, texto: "" };
    }
    return null;
}

const PINTORES_LISTA = {
    paradas: () => { pintarParadas(); dibujarDiagramaRuta(); },
    actividades: () => { pintarParadas(); dibujarDiagramaRuta(); },
    costos: pintarCostos,
    cargos: pintarCargos,
    detalles: pintarDetalles
};

function operarListaRuta(e) {
    const boton = e.target.closest("button[data-op]");
    if (!boton || !rutaEd) return;
    const { op, l, p } = boton.dataset;
    const lista = listaRuta(l, p);
    const i = Number(boton.dataset.i);
    let foco = null;

    if (op === "agregar") {
        lista.push(itemNuevo(l, boton));
        foco = lista.length - 1;
    } else if (op === "quitar") {
        lista.splice(i, 1);
    } else if (op === "subir" && i > 0) {
        [lista[i - 1], lista[i]] = [lista[i], lista[i - 1]];
    } else if (op === "bajar" && i < lista.length - 1) {
        [lista[i + 1], lista[i]] = [lista[i], lista[i + 1]];
    } else {
        return;
    }
    PINTORES_LISTA[l]();
    marcarSucio();
    if (foco != null) {
        const sel = `[data-l="${l}"][data-i="${foco}"]${p != null ? `[data-p="${p}"]` : ""}:is(input[type=text], select)`;
        document.querySelector(sel)?.focus();
    }
}

// Agrega como costos de grupo: guía × días, transporte × días y combustible × días
function agregarCostosRecursos() {
    const dias = Math.max(1, Number(rutaEd.dias) || 1);
    const g = rutaRecursos.guias.find(x => String(x.id_guia) === String(rutaEd.id_guia));
    const v = rutaRecursos.vehiculos.find(x => String(x.id_vehiculo) === String(rutaEd.id_vehiculo));
    if (!g && !v) return aviso("Seleccione primero el guía y/o el vehículo de la ruta", "error");

    const nd = `${dias} día${dias === 1 ? "" : "s"}`;
    const monto = valor => Math.round(Number(valor) * dias * 100) / 100;
    const nuevos = [];
    if (g && Number(g.costo_dia_usd) > 0) nuevos.push({ categoria: "Guía", concepto: `Guía ${g.nombre} (${nd})`, monto_usd: monto(g.costo_dia_usd) });
    if (v && Number(v.costo_transporte_dia_usd) > 0) nuevos.push({ categoria: "Transporte", concepto: `${v.tipo} ${v.placa} (${nd})`, monto_usd: monto(v.costo_transporte_dia_usd) });
    if (v && Number(v.costo_combustible_dia_usd) > 0) nuevos.push({ categoria: "Transporte", concepto: `Combustible ${v.placa} (${nd})`, monto_usd: monto(v.costo_combustible_dia_usd) });
    if (!nuevos.length) return aviso("El guía y el vehículo seleccionados no tienen costos por día", "error");

    nuevos.forEach(c => rutaEd.costos.push({ tipo: "grupo", capacidad_unidad: "", cantidad_disponible: "", ...c }));
    pintarCostos();
    marcarSucio();
    aviso(`Se agregaron ${nuevos.length} costo(s) de grupo. Revise que no estén duplicados.`);
}

// ==========================================
// IMÁGENES
// ==========================================

function leerComoDataUrl(archivo) {
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(lector.result);
        lector.onerror = () => reject(new Error("No se pudo leer el archivo"));
        lector.readAsDataURL(archivo);
    });
}

async function recargarImagenesRuta() {
    const r = await api(`/rutas/${rutaEd.id_ruta}`);
    rutaEd.imagenes = r.imagenes;
    pintarImagenes();
}

async function subirImagenesRuta(e) {
    const archivos = [...e.target.files];
    e.target.value = "";
    if (!archivos.length || !rutaEd?.id_ruta) return;
    let subidas = 0;
    for (const archivo of archivos) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) {
            aviso(`"${archivo.name}": solo se permiten JPG, PNG o WEBP`, "error");
            continue;
        }
        if (archivo.size > MAX_IMAGEN) {
            aviso(`"${archivo.name}" supera los 2 MB`, "error");
            continue;
        }
        try {
            await api(`/rutas/${rutaEd.id_ruta}/imagenes`, { method: "POST", body: { imagen: await leerComoDataUrl(archivo) } });
            subidas++;
        } catch (error) {
            aviso(`"${archivo.name}": ${error.message}`, "error");
            break;
        }
    }
    if (subidas) {
        aviso(`${subidas} imagen(es) agregada(s)`);
        await recargarImagenesRuta();
    }
}

async function borrarImagenRuta(e) {
    const boton = e.target.closest("button[data-imagen]");
    if (!boton || !(await confirmar("La imagen se borrará del servidor.", { titulo: "Eliminar imagen", aceptar: "Eliminar", peligro: true }))) return;
    try {
        aviso((await api(`/rutas/${rutaEd.id_ruta}/imagenes/${boton.dataset.imagen}`, { method: "DELETE" })).message);
        await recargarImagenesRuta();
    } catch (error) {
        aviso(error.message, "error");
    }
}

// ==========================================
// COTIZADOR INTERNO
// ==========================================

function avisoVersionGuardada() {
    if (rutaSucio) aviso("Hay cambios sin guardar: el cálculo usa la versión guardada de la ruta", "error");
}

async function cotizarRuta() {
    avisoVersionGuardada();
    const personas = Number(document.getElementById("ruta-cotizar-personas").value);
    const destino = document.getElementById("ruta-cotizacion");
    try {
        const c = await api(`/rutas/${rutaEd.id_ruta}/cotizar`, { method: "POST", body: { personas } });
        destino.innerHTML = htmlCotizacionInterna(c);
    } catch (error) {
        destino.innerHTML = `<div class="alerta alerta-error">${icono("circle-alert")}<div>${esc(error.message)}</div></div>`;
    }
}

function htmlCotizacionInterna(c) {
    const n = c.personas;
    const i = c.interno;
    const cl = c.cliente;
    const fila = (concepto, monto, clase = "") => `<tr class="${clase}"><td>${concepto}</td><td class="num">${formatoUsd(monto)}</td></tr>`;
    const seccion = titulo => `<tr class="fila-seccion"><td colspan="2">${titulo}</td></tr>`;
    const textoBase = b => (b === "costo" ? "sobre el costo" : "sobre el acumulado");

    let interno = "";
    if (i.grupo.length) interno += seccion("Costos de grupo") + i.grupo.map(x => fila(`${esc(x.concepto)} <small>${esc(x.categoria)}</small>`, x.monto)).join("");
    if (i.unidades.length) interno += seccion("Unidades elegidas") + i.unidades.map(x =>
        fila(`${esc(x.concepto)} <small>${x.cantidad} × ${formatoUsd(x.unitario)} (${x.capacidad} pers. c/u)</small>`, x.monto)).join("");
    if (i.porPersona.length) interno += seccion("Costos por persona") + i.porPersona.map(x =>
        fila(`${esc(x.concepto)} <small>${formatoUsd(x.unitario)} × ${n}</small>`, x.monto)).join("");
    interno += fila(`<strong>Costo del grupo</strong> <small>${formatoUsd(i.costoPersona)} por persona</small>`, i.costoGrupo, "fila-total");
    interno += i.cargos.map(x => fila(`${esc(x.nombre)} <small>${formatoPct(x.porcentaje)} ${textoBase(x.base)}${x.tipo === "ganancia" ? " · oculta al cliente" : ""}</small>`, x.monto)).join("");
    interno += fila("Total sin redondeo", i.totalSinRedondeo);
    interno += fila("Ajuste por redondeo", i.ajusteRedondeo);
    interno += fila("<strong>Total del grupo</strong>", cl.totalGrupo.usd, "fila-total");

    const ves = v => (v.ves == null ? "" : `<small>${formatoVes(v.ves)}</small>`);
    const cliente = `
        <table class="tabla-cotizacion">
            <thead><tr><th>Concepto</th><th class="num">Por persona</th><th class="num">Grupo (${n})</th></tr></thead>
            <tbody>
                ${cl.lineas.map(l => `<tr><td>${esc(l.concepto)}</td><td class="num">${formatoUsd(l.persona.usd)}</td><td class="num">${formatoUsd(l.grupo.usd)}</td></tr>`).join("")}
                <tr class="fila-total"><td>Total</td><td class="num">${formatoUsd(cl.precioPersona.usd)} ${ves(cl.precioPersona)}</td><td class="num">${formatoUsd(cl.totalGrupo.usd)} ${ves(cl.totalGrupo)}</td></tr>
                <tr><td>Abono para reservar (${formatoPct(cl.abonoPct)})</td><td></td><td class="num">${formatoUsd(cl.abonoMinimo.usd)} ${ves(cl.abonoMinimo)}</td></tr>
                ${cl.divisas ? `<tr><td>Pagando en divisas <small>(+ ${cl.cargosPago.map(x => `${esc(x.nombre)} ${formatoPct(x.porcentaje)}`).join(", ")})</small></td>
                    <td class="num">${formatoUsd(cl.divisas.persona.usd)}</td><td class="num">${formatoUsd(cl.divisas.grupo.usd)}</td></tr>` : ""}
            </tbody>
        </table>`;

    const tasa = c.tasaInfo
        ? `Tasa BCV usada: <strong>${formatoTasa(c.tasaInfo.valor)}</strong> (${c.tasaInfo.fecha_valor ? `fecha valor ${formatoFecha(c.tasaInfo.fecha_valor)}` : `registrada el ${formatoFecha(c.tasaInfo.registrado_en)}`})`
        : `No hay tasa BCV registrada: los montos en bolívares no están disponibles.`;

    return `
        <div class="cotizacion-grid">
            <div>
                <h4>Desglose interno · ${n} persona${n === 1 ? "" : "s"}</h4>
                <table class="tabla-cotizacion"><tbody>${interno}</tbody></table>
            </div>
            <div>
                <h4>Lo que ve el cliente</h4>
                ${cliente}
                <p class="ayuda">${tasa}</p>
            </div>
        </div>`;
}

async function tablaPreciosRuta() {
    avisoVersionGuardada();
    const destino = document.getElementById("ruta-cotizacion");
    const min = Number(rutaEd.min_personas) || 1;
    const max = Math.min(Number(rutaEd.max_personas) || min, min + 39);
    const ns = Array.from({ length: Math.max(0, max - min + 1) }, (_, k) => min + k);
    destino.innerHTML = `<p class="ayuda">Calculando...</p>`;
    const resultados = await Promise.all(ns.map(n =>
        api(`/rutas/${rutaEd.id_ruta}/cotizar`, { method: "POST", body: { personas: n } })
            .then(c => ({ n, c })).catch(error => ({ n, error }))));
    destino.innerHTML = `
        <div class="tabla-contenedor">
            <table class="tabla-lista tabla-scroll">
                <thead><tr><th class="num">Personas</th><th class="num">Costo p/p</th><th class="num">Precio p/p</th><th class="num">Total grupo</th><th class="num">Abono</th><th class="num">P/p en divisas</th></tr></thead>
                <tbody>${resultados.map(({ n, c, error }) => error
                    ? `<tr><td class="num">${n}</td><td colspan="5" class="error-texto">${esc(error.message)}</td></tr>`
                    : `<tr>
                        <td class="num">${n}</td>
                        <td class="num">${formatoUsd(c.interno.costoPersona)}</td>
                        <td class="num"><strong>${formatoUsd(c.cliente.precioPersona.usd)}</strong></td>
                        <td class="num">${formatoUsd(c.cliente.totalGrupo.usd)}</td>
                        <td class="num">${formatoUsd(c.cliente.abonoMinimo.usd)}</td>
                        <td class="num">${c.cliente.divisas ? formatoUsd(c.cliente.divisas.persona.usd) : "—"}</td>
                    </tr>`).join("")}</tbody>
            </table>
        </div>`;
}
