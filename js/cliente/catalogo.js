// Vista: catálogo de planes disponibles con precio "desde"

async function vistaCatalogo(main) {
    const { rutas, tasa } = await api("/rutas/disponibles");
    if (tasa) tasaPortal = tasa;

    main.innerHTML = `
        <section class="hero">
            <h1>Elija su próximo viaje</h1>
            <p>Planes en <strong>grupo privado</strong>: el guía y el transporte son solo para usted y sus acompañantes.
               Calcule el precio según cuántos viajan y reserve con un abono.</p>
            <div class="hero-datos">
                ${tasa ? `<span class="chip">${icono("landmark")}Tasa BCV ${formatoTasa(tasa.valor)}</span>` : ""}
                <a class="chip chip-enlace" href="#ayuda">${icono("help-circle")}¿Cómo funciona?</a>
            </div>
        </section>
        ${rutas.length ? `<section class="tarjetas">${rutas.map(tarjetaRuta).join("")}</section>` : `
            <section class="vacio-grande">
                ${icono("route", "icon-grande")}
                <h1>Pronto tendremos nuevos planes</h1>
                <p>En este momento no hay planes disponibles para reservar.</p>
            </section>`}`;
}

function tarjetaRuta(r) {
    const portada = r.imagenes[0];
    const desde = r.desde;
    return `
        <a class="tarjeta" href="#ruta/${r.id_ruta}">
            <div class="tarjeta-imagen" ${portada ? "" : `data-sin-imagen`}>
                ${portada ? `<img src="${esc(portada)}" alt="" loading="lazy">` : icono("map")}
                <span class="tarjeta-duracion">${icono("clock")}${duracion(r.dias, r.noches)}</span>
            </div>
            <div class="tarjeta-cuerpo">
                <h2>${esc(r.nombre)}</h2>
                ${r.zona ? `<p class="tarjeta-zona">${icono("map-pin")}${esc(r.zona)}</p>` : ""}
                <p class="tarjeta-grupo">${icono("users")}Grupos de ${r.min_personas} a ${r.max_personas} personas</p>
                <div class="tarjeta-pie">
                    ${desde ? `
                        <div class="tarjeta-precio">
                            <small>Desde</small>
                            <strong>${formatoUsd(desde.precioPersona.usd)}</strong>
                            <small>por persona en grupo de ${desde.personas}${desde.precioPersona.ves != null ? ` · ${formatoVes(desde.precioPersona.ves)}` : ""}</small>
                        </div>` : `<div class="tarjeta-precio"><small>Consulte el precio</small></div>`}
                    <span class="btn btn-primario btn-chico">Ver plan ${icono("arrow-right")}</span>
                </div>
            </div>
        </a>`;
}
