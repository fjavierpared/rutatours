async function inicializarVehiculos() {
    const crud = crearCrud({
        prefijo: "vehiculo",
        endpoint: "/vehiculos",
        idCampo: "id_vehiculo",
        campos: ["placa", "tipo", "marca", "modelo", "capacidad", "costo_transporte_dia_usd", "costo_combustible_dia_usd", "activo", "disponible"],
        porDefecto: { costo_transporte_dia_usd: "0", costo_combustible_dia_usd: "0", activo: 1, disponible: 1 },
        singular: "vehículo", plural: "vehículos",
        textoNuevo: "Nuevo vehículo", textoEditar: "Editar vehículo",
        busqueda: v => `${v.placa} ${v.tipo} ${v.marca || ""} ${v.modelo || ""}`,
        vacio: { icono: "bus", texto: "No hay vehículos registrados aún" },
        confirmarEliminar: v => `¿Eliminar el vehículo ${v.placa}?${v.rutas_asignadas ? ` Quedará sin vehículo en ${v.rutas_asignadas} ruta(s).` : ""}`,
        fila: (v, i) => `
            <tr class="${Number(v.activo) ? "" : "fila-inactiva"}">
                <td class="col-num">${i + 1}</td>
                <td><div class="celda-item-texto"><span><code>${esc(v.placa)}</code> ${esc(v.tipo)}</span><small class="celda-subtexto">${esc([v.marca, v.modelo].filter(Boolean).join(" ") || "—")}</small></div></td>
                <td class="num">${v.capacidad}</td>
                <td class="num">${formatoUsd(v.costo_transporte_dia_usd)}</td>
                <td class="num">${formatoUsd(v.costo_combustible_dia_usd)}</td>
                <td class="num">${v.rutas_asignadas}</td>
                <td>${badgesEstado(v)}</td>
                <td class="col-acciones">${botonesFila(v.id_vehiculo)}</td>
            </tr>`
    });
    await crud.cargar();
}
