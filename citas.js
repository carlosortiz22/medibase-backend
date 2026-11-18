const router = require("express").Router();
const mongoose = require("mongoose");
const { Paciente, Medico, Cita, buscarPacientePorDocumento } = require("./models");
const { User, verificarToken, soloRoles } = require("./auth");
const { fechaValida, seCruzan, sumarDias, slotsDelDia, esFuturo, validarRango, ahoraBogota } = require("./tiempo");
const { horaValida } = require("./util");

const LUGAR = process.env.LUGAR_CLINICA || "Sede principal MediBase";
const error = (res, status, mensaje) => res.status(status).json({ ok: false, mensaje });
const errorServidor = (res, err) => {
  console.error(err);
  error(res, 500, "Error del servidor. Inténtalo de nuevo.");
};
const esId = (x) => mongoose.isValidObjectId(x);
const idValido = (req, res, next) => (esId(req.params.id) ? next() : error(res, 400, "Identificador no válido."));

const formato = (c) => ({
  _id: c._id,
  fecha: c.fecha,
  hora: c.hora,
  estado: c.estado,
  lugar: LUGAR,
  medico: c.medico && c.medico._id ? { _id: c.medico._id, nombre: c.medico.nombre, especialidad: c.medico.especialidad } : c.medico,
  paciente:
    c.paciente && c.paciente._id
      ? { _id: c.paciente._id, nombre: c.paciente.nombre, documento: c.paciente.documento, telefono: c.paciente.telefono }
      : c.paciente,
});
const poblar = (q) => q.populate("medico", "nombre especialidad").populate("paciente", "nombre documento telefono");

async function pacienteDeUsuario(userId) {
  const u = await User.findById(userId);
  return u && u.documento ? buscarPacientePorDocumento(u.documento) : null;
}
// ¿Puede esta persona gestionar esta cita? El paciente solo las suyas; recepción y admin todas.
async function puedeGestionar(req, cita) {
  if (["recepcionista", "admin"].includes(req.user.rol)) return true;
  const p = req.user.rol === "paciente" ? await pacienteDeUsuario(req.user.id) : null;
  return !!p && String(p._id) === String(cita.paciente);
}
// Reglas de la franja: el médico existe y está activo, la hora pertenece a su horario y no ha pasado
function validarFranja(medico, fecha, hora) {
  if (!fechaValida(fecha) || !horaValida(hora)) return "Elige una fecha y una hora válidas.";
  if (!medico || !medico.activo) return "El médico no está disponible.";
  if (!esFuturo(fecha, hora)) return "No puedes agendar en una fecha u hora que ya pasó.";
  if (!slotsDelDia(medico, fecha).includes(hora)) return "Esa hora no hace parte del horario de atención del médico.";
  return null;
}
async function cruzaConOtraCita(pacienteId, fecha, hora, excluirId) {
  const filtro = { paciente: pacienteId, fecha, activa: true };
  if (excluirId) filtro._id = { $ne: excluirId };
  return (await Cita.find(filtro, "hora")).some((c) => seCruzan(c.hora, hora));
}
function errorDeDuplicado(res, e) {
  if (e.code !== 11000) return false;
  const esPaciente = e.keyPattern && e.keyPattern.paciente;
  error(res, 409, esPaciente ? "Ya tienes otra cita a esa hora." : "Esa franja acaba de ser tomada por otra persona. Elige otro horario.");
  return true;
}

// ---------- Calendario: franjas libres por médico o por especialidad (carga por rango de fechas) ----------
router.get("/franjas", verificarToken, async (req, res) => {
  const { desde, hasta, medico, especialidad } = req.query;
  const rango = validarRango(desde, hasta, 42);
  if (rango) return error(res, 400, rango);
  if (!medico && !especialidad) return error(res, 400, "Elige un médico o una especialidad.");
  if (medico && !esId(medico)) return error(res, 400, "Identificador no válido.");
  try {
    const filtro = { activo: true, ...(medico ? { _id: medico } : { especialidad }) };
    const medicos = await Medico.find(filtro);
    const ocupadas = new Set(
      (await Cita.find({ medico: { $in: medicos.map((m) => m._id) }, fecha: { $gte: desde, $lte: hasta }, activa: true }, "medico fecha hora")).map(
        (c) => `${c.medico}|${c.fecha}|${c.hora}`,
      ),
    );
    const dias = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
      const franjas = [];
      for (const m of medicos)
        for (const hora of slotsDelDia(m, f))
          if (esFuturo(f, hora) && !ocupadas.has(`${m._id}|${f}|${hora}`))
            franjas.push({ hora, medico: m._id, medicoNombre: m.nombre, especialidad: m.especialidad });
      franjas.sort((a, b) => a.hora.localeCompare(b.hora));
      dias.push({ fecha: f, franjas });
    }
    res.json({ ok: true, dias });
  } catch (err) {
    errorServidor(res, err);
  }
});

// ---------- Agendar ----------
router.post("/citas", verificarToken, soloRoles("paciente", "recepcionista", "admin"), async (req, res) => {
  const { medico: medicoId, fecha, hora, paciente: pacienteBody } = req.body || {};
  if (!esId(medicoId) || !fechaValida(fecha) || !horaValida(hora)) return error(res, 400, "Elige un médico, una fecha y una hora válidos.");
  try {
    let paciente;
    if (req.user.rol === "paciente") {
      paciente = await pacienteDeUsuario(req.user.id);
      if (!paciente) return error(res, 400, "No encontramos tu ficha de paciente. Contacta a la recepción.");
    } else {
      if (!esId(pacienteBody)) return error(res, 400, "Selecciona el paciente para quien se agenda la cita.");
      paciente = await Paciente.findById(pacienteBody);
      if (!paciente) return error(res, 404, "No encontramos al paciente.");
    }
    const medico = await Medico.findById(medicoId);
    const problema = validarFranja(medico, fecha, hora);
    if (problema) return error(res, 400, problema);
    if (await cruzaConOtraCita(paciente._id, fecha, hora)) return error(res, 409, "El paciente ya tiene una cita que se cruza con ese horario.");
    const cita = await Cita.create({ paciente: paciente._id, medico: medico._id, fecha, hora, creadaPor: req.user.id });
    res.status(201).json({ ok: true, mensaje: "Cita confirmada.", cita: formato(await poblar(Cita.findById(cita._id))) });
  } catch (e) {
    if (!errorDeDuplicado(res, e)) errorServidor(res, e);
  }
});

// ---------- Consultar citas (próximas e historial) ----------
router.get("/citas/mias", verificarToken, soloRoles("paciente"), async (req, res) => {
  try {
    const p = await pacienteDeUsuario(req.user.id);
    if (!p) return res.json({ ok: true, citas: [] });
    res.json({ ok: true, citas: (await poblar(Cita.find({ paciente: p._id }).sort({ fecha: 1, hora: 1 }).limit(300))).map(formato) });
  } catch (err) {
    errorServidor(res, err);
  }
});
router.get("/citas", verificarToken, soloRoles("recepcionista", "admin"), async (req, res) => {
  if (!esId(req.query.paciente)) return error(res, 400, "Selecciona un paciente.");
  try {
    res.json({ ok: true, citas: (await poblar(Cita.find({ paciente: req.query.paciente }).sort({ fecha: 1, hora: 1 }).limit(300))).map(formato) });
  } catch (err) {
    errorServidor(res, err);
  }
});

// ---------- Cancelar y reprogramar (la franja liberada vuelve a quedar disponible) ----------
async function cargarGestionable(req, res) {
  const cita = await Cita.findById(req.params.id);
  if (!cita) {
    error(res, 404, "No encontramos la cita.");
    return null;
  }
  if (!(await puedeGestionar(req, cita))) {
    error(res, 403, "No tienes permiso sobre esta cita.");
    return null;
  }
  if (cita.estado !== "confirmada") {
    error(res, 409, "Esta cita ya no se puede modificar.");
    return null;
  }
  if (!esFuturo(cita.fecha, cita.hora)) {
    error(res, 409, "Esta cita ya pasó y no se puede modificar.");
    return null;
  }
  return cita;
}
router.patch("/citas/:id/cancelar", verificarToken, soloRoles("paciente", "recepcionista", "admin"), idValido, async (req, res) => {
  try {
    const cita = await cargarGestionable(req, res);
    if (!cita) return;
    cita.estado = "cancelada";
    cita.activa = false;
    await cita.save();
    res.json({ ok: true, mensaje: "Cita cancelada. La franja quedó disponible de nuevo.", cita: formato(await poblar(Cita.findById(cita._id))) });
  } catch (err) {
    errorServidor(res, err);
  }
});
router.patch("/citas/:id/reprogramar", verificarToken, soloRoles("paciente", "recepcionista", "admin"), idValido, async (req, res) => {
  const { fecha, hora, medico: medicoBody } = req.body || {};
  if (!fechaValida(fecha) || !horaValida(hora) || (medicoBody && !esId(medicoBody))) return error(res, 400, "Elige una fecha y una hora válidas.");
  try {
    const cita = await cargarGestionable(req, res);
    if (!cita) return;
    const medicoId = medicoBody || String(cita.medico);
    if (medicoId === String(cita.medico) && fecha === cita.fecha && hora === cita.hora) return error(res, 400, "Elige un horario distinto al actual.");
    const problema = validarFranja(await Medico.findById(medicoId), fecha, hora);
    if (problema) return error(res, 400, problema);
    if (await cruzaConOtraCita(cita.paciente, fecha, hora, cita._id)) return error(res, 409, "Ya tienes otra cita que se cruza con ese horario.");
    // Un solo update: si la franja nueva se ocupa en ese instante, el índice único lo rechaza y la cita original queda intacta
    const nueva = await Cita.findOneAndUpdate({ _id: cita._id, estado: "confirmada", activa: true }, { fecha, hora, medico: medicoId }, { new: true });
    res.json({ ok: true, mensaje: "Cita reprogramada correctamente.", cita: formato(await poblar(Cita.findById(nueva._id))) });
  } catch (e) {
    if (!errorDeDuplicado(res, e)) errorServidor(res, e);
  }
});

// ---------- Vista del médico ----------
router.get("/agenda", verificarToken, soloRoles("medico", "recepcionista", "admin"), async (req, res) => {
  const { desde, hasta } = req.query;
  const rango = validarRango(desde, hasta, 31);
  if (rango) return error(res, 400, rango);
  try {
    let medicoId = req.query.medico;
    if (req.user.rol === "medico") {
      const m = await Medico.findOne({ user: req.user.id });
      if (!m) return error(res, 404, "Tu cuenta no tiene un perfil de médico asociado.");
      medicoId = m._id;
    }
    if (!esId(String(medicoId || ""))) return error(res, 400, "Selecciona un médico.");
    const citas = await poblar(Cita.find({ medico: medicoId, fecha: { $gte: desde, $lte: hasta }, estado: { $ne: "cancelada" } }).sort({ fecha: 1, hora: 1 }));
    res.json({ ok: true, citas: citas.map(formato) });
  } catch (err) {
    errorServidor(res, err);
  }
});
router.patch("/citas/:id/estado", verificarToken, soloRoles("medico", "admin"), idValido, async (req, res) => {
  const estado = req.body && req.body.estado;
  if (!["atendida", "inasistencia"].includes(estado)) return error(res, 400, "El estado debe ser atendida o inasistencia.");
  try {
    const cita = await Cita.findById(req.params.id);
    if (!cita) return error(res, 404, "No encontramos la cita.");
    if (req.user.rol === "medico") {
      const m = await Medico.findOne({ user: req.user.id });
      if (!m || String(m._id) !== String(cita.medico)) return error(res, 403, "Solo puedes marcar tus propias citas.");
    }
    if (cita.estado !== "confirmada") return error(res, 409, "Esta cita ya fue marcada o cancelada.");
    if (cita.fecha > ahoraBogota().fecha) return error(res, 409, "Solo puedes marcar citas de hoy o de días anteriores.");
    cita.estado = estado;
    await cita.save();
    res.json({
      ok: true,
      mensaje: estado === "atendida" ? "Cita marcada como atendida." : "Cita marcada como inasistencia.",
      cita: formato(await poblar(Cita.findById(cita._id))),
    });
  } catch (err) {
    errorServidor(res, err);
  }
});

module.exports = { router };
