async function inicializarTasa() {
    document.getElementById("tasa-actualizar").addEventListener("click", actualizarTasaBcv);
    document.getElementById("tasa-form").addEventListener("submit", registrarTasaManual);
    await Promise.all([cargarTasaVigente(), cargarHistorialTasa()]);
}

async function cargarTasaVigente() {
    const caja = document.getElementById("tasa-vigente");
    try {
        const { tasa, desactualizada } = await api("/tasa-bcv");
        if (!tasa) {
            caja.innerHTML = `<div class="alerta alerta-aviso">${icono("triangle-alert")}<div>No hay ninguna tasa registrada. Los precios en bolívares no se mostrarán hasta cargar una.</div></div>`;
            return;
        }
        caja.innerHTML = `
            <div class="tasa-valor">${numeroEs(tasa.valor, 4)} <span>Bs/$</span></div>
            <div class="tasa-meta">
                ${tasa.fecha_valor ? `Fecha valor: <strong>${fechaConDia(tasa.fecha_valor)}</strong> · ` : ""}
                Registrada: ${fechaHora(tasa.registrado_en)} · ${tasa.fuente === "scraping" ? "lectura automática" : "carga manual"}
            </div>
            ${desactualizada ? `<div class="alerta alerta-aviso">${icono("triangle-alert")}<div>La tasa no corresponde a hoy. Actualícela antes de recibir pagos.</div></div>` : ""}`;
    } catch (error) {
        caja.innerHTML = `<p class="error-texto">${esc(error.message)}</p>`;
    }
}

async function cargarHistorialTasa() {
    const tbody = document.querySelector("#tasa-tabla tbody");
    try {
        const filas = await api("/tasa-bcv/historial");
        document.getElementById("tasa-contador").innerHTML = `<strong>${filas.length}</strong> registro${filas.length === 1 ? "" : "s"}`;
        if (!filas.length) {
            tbody.innerHTML = `<tr><td colspan="6" class="vacio">${icono("landmark", "icon-vacio")}<span>Sin registros</span></td></tr>`;
            return;
        }
        tbody.innerHTML = filas.map((t, i) => {
            const anterior = filas[i + 1];
            const variacion = anterior ? (Number(t.valor) / Number(anterior.valor) - 1) * 100 : null;
            const clase = variacion > 0 ? "texto-aviso" : variacion < 0 ? "texto-ok" : "";
            return `
            <tr>
                <td>${fechaHora(t.registrado_en)}</td>
                <td class="num"><strong>${numeroEs(t.valor, 4)}</strong></td>
                <td class="num ${clase}">${variacion == null ? "—" : `${variacion > 0 ? "+" : ""}${numeroEs(variacion, 2)}%`}</td>
                <td>${t.fecha_valor ? formatoFecha(t.fecha_valor) : "—"}</td>
                <td>${t.fuente === "scraping" ? `<span class="badge badge-info">BCV</span>` : `<span class="badge badge-neutro">Manual</span>`}</td>
                <td>${esc(t.usuario || "—")}</td>
            </tr>`;
        }).join("");
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="vacio error-texto">${esc(error.message)}</td></tr>`;
    }
}

// Envía y, si el servidor pide confirmación por una variación grande (409), pregunta y reintenta
async function enviarTasa(ruta, cuerpo) {
    try {
        return await api(ruta, { method: "POST", body: cuerpo });
    } catch (error) {
        if (error.status === 409 && await confirmar(`${error.message}.`, { titulo: "Variación grande de la tasa", aceptar: "Guardar de todas formas", detalle: "Revise que el valor sea correcto antes de continuar.", peligro: true })) {
            return api(ruta, { method: "POST", body: { ...cuerpo, confirmar: true } });
        }
        throw error;
    }
}

async function actualizarTasaBcv() {
    const boton = document.getElementById("tasa-actualizar");
    const original = boton.innerHTML;
    try {
        boton.disabled = true;
        boton.innerHTML = `${icono("refresh-cw")}Consultando el BCV...`;
        const r = await enviarTasa("/tasa-bcv/actualizar", {});
        aviso(r.sslVerificado === false ? `${r.message} (sin verificar el certificado SSL del BCV)` : r.message);
        await Promise.all([cargarTasaVigente(), cargarHistorialTasa()]);
    } catch (error) {
        aviso(error.message, "error");
    } finally {
        boton.disabled = false;
        boton.innerHTML = original;
    }
}

async function registrarTasaManual(e) {
    e.preventDefault();
    // Acepta "236,4581", "236.4581" y "1.236,45"
    let texto = document.getElementById("tasa-valor").value.trim().replace(/\s/g, "");
    if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".");
    const valor = Number(texto);
    if (!(valor > 0)) return aviso("Ingrese una tasa válida", "error");
    try {
        const r = await enviarTasa("/tasa-bcv/manual", { valor, fecha_valor: document.getElementById("tasa-fecha").value || null });
        aviso(r.message);
        document.getElementById("tasa-form").reset();
        await Promise.all([cargarTasaVigente(), cargarHistorialTasa()]);
    } catch (error) {
        aviso(error.message, "error");
    }
}
