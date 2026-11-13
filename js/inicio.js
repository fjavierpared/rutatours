async function inicializarInicio() {
    try {
        const r = await api("/admin/resumen");
        document.querySelectorAll("#inicio-kpis [data-kpi]").forEach(el => { el.textContent = r[el.dataset.kpi] ?? 0; });
        document.getElementById("inicio-tasa").textContent = r.tasa ? `${numeroEs(r.tasa.valor, 2)} Bs/$` : "Sin tasa";

        const alertas = [];
        const hoy = fechaLocal();
        if (!r.tasa) {
            alertas.push(["triangle-alert", "No hay tasa BCV registrada: los clientes no verán precios en bolívares ni podrán pagar en Bs.", "#tasa", "Cargar tasa"]);
        } else if ((r.tasa.fecha_valor || r.tasa.registrado_en).slice(0, 10) < hoy) {
            alertas.push(["triangle-alert", `La tasa BCV vigente es del ${formatoFecha(r.tasa.fecha_valor || r.tasa.registrado_en)}.`, "#tasa", "Actualizar"]);
        }
        if (r.pagos_por_verificar) {
            alertas.push(["receipt", `Hay ${r.pagos_por_verificar} pago(s) reportado(s) esperando verificación.`, "#pagos", "Revisar pagos"]);
        }
        document.getElementById("inicio-alertas").innerHTML = alertas.map(([ic, texto, enlace, accion]) => `
            <div class="alerta alerta-aviso">${icono(ic)}<div>${esc(texto)} <a href="${enlace}">${accion}</a></div></div>`).join("");

        const tbody = document.querySelector("#inicio-proximas tbody");
        tbody.innerHTML = r.proximas.length ? r.proximas.map(a => `
            <tr>
                <td class="col-num">#${a.id_agenda}</td>
                <td>${fechaConDia(a.fecha_salida)}</td>
                <td>${esc(a.ruta)}</td>
                <td>${esc(a.cliente)}</td>
                <td class="num">${a.personas}</td>
                <td>${badgeAgenda(a.estado)}</td>
            </tr>`).join("")
            : `<tr><td colspan="6" class="vacio">${icono("calendar-check", "icon-vacio")}<span>No hay salidas próximas</span></td></tr>`;
    } catch (error) {
        document.getElementById("inicio-alertas").innerHTML =
            `<div class="alerta alerta-error">${icono("circle-alert")}<div>${esc(error.message)}</div></div>`;
    }
}
