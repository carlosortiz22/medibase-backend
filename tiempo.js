// Fechas y franjas. La clínica trabaja en hora de Colombia (el servidor puede estar en UTC).
const SLOT_MIN = 30;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function ahoraBogota(d = new Date()) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const g = (t) => partes.find((p) => p.type === t).value;
  return { fecha: `${g("year")}-${g("month")}-${g("day")}`, hora: `${g("hour")}:${g("minute")}` };
}
const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || "") && new Date(f + "T00:00:00Z").toISOString().slice(0, 10) === f;
const nombreDia = (f) => DIAS[new Date(f + "T00:00:00Z").getUTCDay()];
const aMin = (h) => {
  const [a, b] = h.split(":").map(Number);
  return a * 60 + b;
};
const aHora = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const seCruzan = (h1, h2) => Math.abs(aMin(h1) - aMin(h2)) < SLOT_MIN;
const sumarDias = (f, n) => {
  const d = new Date(f + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Franjas de un médico en una fecha, según su horario semanal
function slotsDelDia(medico, fecha) {
  const bloque = (medico.horario || []).find((h) => h.dia === nombreDia(fecha));
  if (!bloque) return [];
  const out = [];
  for (let m = aMin(bloque.inicio); m + SLOT_MIN <= aMin(bloque.fin); m += SLOT_MIN) out.push(aHora(m));
  return out;
}
function esFuturo(fecha, hora) {
  const n = ahoraBogota();
  return fecha > n.fecha || (fecha === n.fecha && hora > n.hora);
}
// Valida un rango de fechas (para que la agenda cargue por rangos y no colapse)
function validarRango(desde, hasta, maxDias) {
  if (!fechaValida(desde) || !fechaValida(hasta)) return "Indica un rango de fechas válido (desde y hasta, formato AAAA-MM-DD).";
  if (hasta < desde) return "La fecha final no puede ser anterior a la inicial.";
  if (sumarDias(desde, maxDias) < hasta) return `El rango no puede superar ${maxDias} días.`;
  return null;
}
module.exports = { SLOT_MIN, ahoraBogota, fechaValida, nombreDia, aMin, aHora, seCruzan, sumarDias, slotsDelDia, esFuturo, validarRango };
