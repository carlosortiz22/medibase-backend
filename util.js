// Funciones de validación reutilizables
const normDoc = (d) => String(d || "").replace(/[.\s]/g, "");
const docValido = (d) => /^\d{6,12}$/.test(d);
const correoValido = (c) => /^\S+@\S+\.\S+$/.test(c || "");
const textoValido = (t, min = 3) => typeof t === "string" && t.trim().length >= min;
const telefonoValido = (t) => /^[\d\s+()-]{7,18}$/.test(t || "");
const horaValida = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h || "");
module.exports = { normDoc, docValido, correoValido, textoValido, telefonoValido, horaValida };
