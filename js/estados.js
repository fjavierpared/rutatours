// Etiquetas de estados de reservas y pagos (compartidas por el panel y el portal del cliente)

const ESTADOS_AGENDA = {
    pendiente_abono: { texto: "Pendiente de abono", clase: "badge-aviso" },
    reservada: { texto: "Reservada", clase: "badge-info" },
    pagada: { texto: "Pagada", clase: "badge-ok" },
    completada: { texto: "Completada", clase: "badge-neutro" },
    cancelada: { texto: "Cancelada", clase: "badge-off" }
};

const ESTADOS_PAGO = {
    pendiente: { texto: "Por verificar", clase: "badge-aviso" },
    verificado: { texto: "Verificado", clase: "badge-ok" },
    rechazado: { texto: "Rechazado", clase: "badge-off" }
};

function badgeEstado(mapa, estado) {
    const e = mapa[estado] || { texto: estado, clase: "badge-neutro" };
    return `<span class="badge ${e.clase}">${e.texto}</span>`;
}

const badgeAgenda = estado => badgeEstado(ESTADOS_AGENDA, estado);
const badgePago = estado => badgeEstado(ESTADOS_PAGO, estado);

// "2026-11-14" -> "sáb 14-11-2026"
function fechaConDia(iso) {
    if (!iso) return "";
    const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
    const dia = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][new Date(a, m - 1, d).getDay()];
    return `${dia} ${formatoFecha(iso)}`;
}

// "2026-11-12 14:05:33" -> "12-11-2026 14:05"
function fechaHora(texto) {
    if (!texto) return "";
    return `${formatoFecha(texto)} ${String(texto).slice(11, 16)}`.trim();
}
