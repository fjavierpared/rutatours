async function inicializarGuias() {
    const crud = crearCrud({
        prefijo: "guia",
        endpoint: "/guias",
        idCampo: "id_guia",
        campos: ["nombre", "documento", "telefono", "email", "idiomas", "licencia", "costo_dia_usd", "activo", "disponible"],
        porDefecto: { costo_dia_usd: "0", activo: 1, disponible: 1 },
        singular: "guía", plural: "guías",
        textoNuevo: "Nuevo guía", textoEditar: "Editar guía",
        busqueda: g => `${g.nombre} ${g.documento} ${g.idiomas || ""}`,
        vacio: { icono: "user-round", texto: "No hay guías registrados aún" },
        confirmarEliminar: g => `¿Eliminar al guía "${g.nombre}"?${g.rutas_asignadas ? ` Quedará sin guía en ${g.rutas_asignadas} ruta(s).` : ""}`,
        fila: (g, i) => `
            <tr class="${Number(g.activo) ? "" : "fila-inactiva"}">
                <td class="col-num">${i + 1}</td>
                <td><div class="celda-item-texto"><span>${esc(g.nombre)}</span><small class="celda-subtexto">${esc(g.documento)}${g.licencia ? ` · ${esc(g.licencia)}` : ""}</small></div></td>
                <td><div class="celda-item-texto"><span>${esc(g.telefono || "—")}</span><small class="celda-subtexto">${esc(g.email || "")}</small></div></td>
                <td>${esc(g.idiomas || "—")}</td>
                <td class="num">${formatoUsd(g.costo_dia_usd)}</td>
                <td class="num">${g.rutas_asignadas}</td>
                <td>${badgesEstado(g)}</td>
                <td class="col-acciones">${botonesFila(g.id_guia)}</td>
            </tr>`
    });
    await crud.cargar();
}
