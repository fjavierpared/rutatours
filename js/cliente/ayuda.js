// Vista: ¿Cómo funciona? (pasos, tasa BCV, cómo leer el diagrama y estados de la reserva)

const EJEMPLO_RECORRIDO = [
    { nombre: "Ciudad", dia: 1, hora: "07:00", tipo: "salida" },
    { nombre: "Mirador", dia: 1, hora: "09:30", tipo: "visita" },
    { nombre: "Restaurante", dia: 1, hora: "12:30", tipo: "comida" },
    { nombre: "Posada", dia: 1, hora: "16:00", tipo: "alojamiento" },
    { nombre: "Cascada", dia: 2, hora: "09:00", tipo: "visita" },
    { nombre: "Ciudad", dia: 2, hora: "18:00", tipo: "llegada" }
];

async function vistaAyuda(main) {
    const t = tasaPortal;
    main.innerHTML = `
        <header class="titulo-vista"><h1>¿Cómo funciona?</h1></header>

        <section class="bloque">
            <h2>${icono("route")}Reservar en 4 pasos</h2>
            <ol class="pasos">
                <li><strong>Elija un plan</strong><span>Revise el recorrido, el itinerario y qué incluye.</span></li>
                <li><strong>Calcule el precio</strong><span>Indique cuántas personas viajan: el grupo es privado, así que el precio por persona baja mientras más sean.</span></li>
                <li><strong>Reserve y abone</strong><span>Elija la fecha, cree su cuenta y reporte el abono indicado en el plan.</span></li>
                <li><strong>Confirmamos</strong><span>Verificamos el pago y su reserva pasa a <em>Reservada</em>. Pague el saldo cuando quiera antes de salir.</span></li>
            </ol>
        </section>

        <section class="bloque">
            <h2>${icono("landmark")}Precios, bolívares y tasa BCV</h2>
            <ul class="lista-ayuda">
                <li>Los precios se fijan en <strong>dólares</strong>. Al reservar, el precio en dólares queda congelado aunque luego cambien los costos.</li>
                <li>Los montos en <strong>bolívares</strong> se calculan con la <strong>tasa oficial del Banco Central de Venezuela (BCV)</strong> vigente el día del pago.
                    ${t ? `Hoy: <strong>${formatoTasa(t.valor)}</strong>${t.fecha_valor ? ` (fecha valor ${formatoFecha(t.fecha_valor)})` : ""}.` : ""}</li>
                <li>Por eso el monto en Bs de su reserva puede variar de un día a otro: al reportar un pago le mostramos el monto exacto a transferir con la tasa de ese momento, y queda registrado.</li>
                <li>Si paga en <strong>divisas</strong> (Zelle, efectivo en dólares, USDT...) se suma el <strong>IGTF del 3%</strong> sobre el monto pagado, como indica la ley. Pagando en bolívares no aplica.</li>
                <li>El precio que ve incluye el <strong>IVA</strong>. En "Servicio" está todo lo que incluye el plan: transporte, guía, alojamiento, comidas y entradas.</li>
            </ul>
        </section>

        <section class="bloque">
            <h2>${icono("map")}Cómo leer el diagrama del recorrido</h2>
            <p>Es un esquema del orden de las paradas, <strong>no un mapa a escala</strong>. Ejemplo:</p>
            <div id="ayuda-diagrama"></div>
            <ul class="lista-ayuda simbolos">
                <li><span class="simbolo simbolo-extremo"></span>Punto de salida o llegada.</li>
                <li><span class="simbolo"></span>Parada: visita, embarque o comida.</li>
                <li><span class="simbolo simbolo-alojamiento"></span>Alojamiento: donde se pasa la noche.</li>
                <li><span class="linea-color"></span>Cada <strong>color es un día</strong> del viaje (vea la leyenda). Debajo de cada parada está la hora aproximada.</li>
                <li><span class="linea-discontinua"></span>La línea punteada indica que el viaje <strong>regresa al punto de salida</strong>.</li>
                <li>En el celular el diagrama se muestra de arriba hacia abajo.</li>
            </ul>
        </section>

        <section class="bloque">
            <h2>${icono("calendar-check")}Estados de su reserva</h2>
            <dl class="estados">
                <div><dt>${badgeAgenda("pendiente_abono")}</dt><dd>Reservó, pero falta reportar o verificar el abono. Puede cancelarla usted mismo.</dd></div>
                <div><dt>${badgeAgenda("reservada")}</dt><dd>Verificamos el abono: su fecha, guía y transporte están apartados.</dd></div>
                <div><dt>${badgeAgenda("pagada")}</dt><dd>El total está pagado y verificado.</dd></div>
                <div><dt>${badgeAgenda("completada")}</dt><dd>El viaje ya se realizó.</dd></div>
                <div><dt>${badgeAgenda("cancelada")}</dt><dd>La reserva se anuló. Si ya había pagos verificados, contáctenos para gestionarlo.</dd></div>
            </dl>
        </section>

        <p class="centrado"><a class="btn btn-primario" href="#catalogo">Ver los planes ${icono("arrow-right")}</a></p>`;

    dibujarRecorrido(document.getElementById("ayuda-diagrama"), EJEMPLO_RECORRIDO, { dias: 2 });
}
