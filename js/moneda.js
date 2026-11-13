// Formato de montos compartido por el panel y el portal del cliente.
// USD: "1.234,50 $"   VES: "20.000,00 Bs"   (punto de miles, coma decimal)

function numeroEs(valor, decimales = 2) {
    const n = Number(valor) || 0;
    const [entero, dec] = Math.abs(n).toFixed(decimales).split(".");
    const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${n < 0 ? "-" : ""}${conMiles}${decimales ? `,${dec}` : ""}`;
}

function formatoUsd(usd) {
    return `${numeroEs(usd)} $`;
}

function formatoVes(ves) {
    return ves == null ? "—" : `${numeroEs(ves)} Bs`;
}

// Tasa BCV con 4 decimales: "36,5420 Bs/$"
function formatoTasa(tasa) {
    return tasa == null ? "—" : `${numeroEs(tasa, 4)} Bs/$`;
}

// Porcentaje sin ceros de sobra: 16 -> "16%", 2.5 -> "2,5%"
function formatoPct(pct) {
    return `${String(Number(pct)).replace(".", ",")}%`;
}
