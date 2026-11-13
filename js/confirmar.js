// Diálogo de confirmación propio del sistema (reemplaza confirm() del navegador, que muestra
// "localhost:3000 dice..."). Lo usan el panel y el portal del cliente.
//
//   if (await confirmar("¿Eliminar la ruta?", { titulo: "Eliminar ruta", aceptar: "Eliminar", peligro: true })) { ... }
//
// Devuelve una promesa: true si se acepta; false si se cancela, se pulsa Escape o se hace clic fuera.

function confirmar(mensaje, { titulo = "Confirmar", aceptar = "Aceptar", cancelar = "Cancelar", peligro = false, detalle = "" } = {}) {
    let dialogo = document.getElementById("dialogo-confirmar");
    if (!dialogo) {
        dialogo = document.createElement("dialog");
        dialogo.id = "dialogo-confirmar";
        dialogo.className = "dialogo confirmar-dialogo";
        dialogo.setAttribute("aria-labelledby", "confirmar-titulo");
        dialogo.innerHTML = `
            <div class="confirmar-cabecera">
                <span class="confirmar-icono" id="confirmar-icono"></span>
                <h3 id="confirmar-titulo"></h3>
            </div>
            <p class="confirmar-mensaje" id="confirmar-mensaje"></p>
            <p class="confirmar-detalle" id="confirmar-detalle"></p>
            <div class="confirmar-acciones">
                <button type="button" class="btn confirmar-cancelar" value="no"></button>
                <button type="button" class="btn confirmar-aceptar" value="si"></button>
            </div>`;
        document.body.appendChild(dialogo);
    }

    // Si quedó uno abierto (doble clic), se cierra como cancelado antes de abrir el nuevo
    if (dialogo.open) dialogo.close("no");

    const nombreIcono = peligro ? "triangle-alert" : "circle-alert";
    dialogo.classList.toggle("peligro", peligro);
    dialogo.querySelector("#confirmar-icono").innerHTML =
        `<svg class="icon" aria-hidden="true"><use href="img/icons.svg#i-${nombreIcono}"></use></svg>`;
    dialogo.querySelector("#confirmar-titulo").textContent = titulo;
    dialogo.querySelector("#confirmar-mensaje").textContent = mensaje;
    const det = dialogo.querySelector("#confirmar-detalle");
    det.textContent = detalle;
    det.hidden = !detalle;
    dialogo.querySelector(".confirmar-aceptar").textContent = aceptar;
    dialogo.querySelector(".confirmar-cancelar").textContent = cancelar;

    return new Promise(resolve => {
        const alHacerClic = e => {
            if (e.target === dialogo) return dialogo.close("no"); // clic en el fondo
            const b = e.target.closest("button[value]");
            if (b) dialogo.close(b.value);
        };
        const alCerrar = () => {
            dialogo.removeEventListener("click", alHacerClic);
            resolve(dialogo.returnValue === "si");
        };
        dialogo.returnValue = "no"; // Escape cierra con este valor
        dialogo.addEventListener("click", alHacerClic);
        dialogo.addEventListener("close", alCerrar, { once: true });
        dialogo.showModal();
        // Foco en la opción segura cuando la acción es peligrosa
        dialogo.querySelector(peligro ? ".confirmar-cancelar" : ".confirmar-aceptar").focus();
    });
}
