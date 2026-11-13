async function inicializarMetodos() {
    const crud = crearCrud({
        prefijo: "metodo",
        endpoint: "/admin/metodos-pago",
        idCampo: "id_metodo",
        campos: ["nombre", "moneda", "aplica_igtf", "datos", "activo"],
        porDefecto: { moneda: "VES", aplica_igtf: 0, activo: 1 },
        singular: "método", plural: "métodos",
        textoNuevo: "Nuevo método de pago", textoEditar: "Editar método de pago",
        busqueda: m => `${m.nombre} ${m.moneda} ${m.datos || ""}`,
        vacio: { icono: "credit-card", texto: "No hay métodos de pago registrados" },
        confirmarEliminar: m => `¿Eliminar el método "${m.nombre}"?`,
        fila: (m, i) => `
            <tr class="${Number(m.activo) ? "" : "fila-inactiva"}">
                <td class="col-num">${i + 1}</td>
                <td><strong>${esc(m.nombre)}</strong></td>
                <td>${m.moneda === "USD" ? "Dólares" : "Bolívares"}</td>
                <td>${Number(m.aplica_igtf) ? `<span class="badge badge-aviso">Aplica</span>` : "—"}</td>
                <td class="celda-texto-largo">${esc(m.datos || "—")}</td>
                <td>${badgesEstado(m)}</td>
                <td class="col-acciones">${botonesFila(m.id_metodo)}</td>
            </tr>`
    });
    await crud.cargar();
}
