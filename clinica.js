const router = require("express").Router();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { Paciente, Medico, Cita, siguienteHistoria, buscarPacientePorDocumento } = require("./models");
const { User, verificarToken, soloRoles, validarCuenta } = require("./auth");
const { normDoc, docValido, correoValido, textoValido, telefonoValido, horaValida } = require("./util");

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const errorServidor = (res, err) => {
  console.error(err);
  res.status(500).json({ ok: false, mensaje: "Error del servidor. Inténtalo de nuevo." });
};
const idValido = (req, res, next) =>
  mongoose.isValidObjectId(req.params.id) ? next() : res.status(400).json({ ok: false, mensaje: "Identificador no válido." });

// ================= PACIENTES (HU-01 y HU-02) =================
router.get("/pacientes", verificarToken, soloRoles("recepcionista", "medico", "admin"), async (req, res) => {
  try {
    const q = String(req.query.q || "")
      .trim()
      .toLowerCase();
    let lista = await Paciente.find().sort({ historia: 1 });
    if (q)
      lista = lista.filter(
        (p) =>
          `${p.nombre} ${p.documento}`.toLowerCase().includes(q) ||
          String(p.documento)
            .replace(/\D/g, "")
            .includes(q.replace(/\D/g, "") || "\u0000"),
      );
    res.json(lista);
  } catch (err) {
    errorServidor(res, err);
  }
});

router.post("/pacientes", verificarToken, soloRoles("recepcionista", "admin"), async (req, res) => {
  const b = req.body || {};
  const e = {};
  const doc = normDoc(b.documento);
  if (!textoValido(b.nombre)) e.nombre = "Ingresa el nombre completo.";
  if (!docValido(doc)) e.documento = "El documento debe tener entre 6 y 12 números, sin letras.";
  const nacimiento = new Date(b.fechaNacimiento);
  if (!b.fechaNacimiento || isNaN(nacimiento) || nacimiento > new Date() || nacimiento.getFullYear() < 1900)
    e.fechaNacimiento = "Ingresa una fecha de nacimiento válida.";
  if (!telefonoValido(b.telefono)) e.telefono = "Ingresa un teléfono de contacto válido.";
  if (b.correo && !correoValido(b.correo)) e.correo = "El correo no tiene un formato válido.";
  if (Object.keys(e).length) return res.status(400).json({ ok: false, errores: e, mensaje: "Faltan datos obligatorios o son incorrectos." });
  try {
    const existente = await buscarPacientePorDocumento(doc);
    if (existente)
      return res
        .status(409)
        .json({ ok: false, errores: { documento: "Este documento ya está registrado." }, mensaje: `El documento pertenece a ${existente.nombre}.` });
    const edad = Math.floor((Date.now() - nacimiento) / (365.25 * 24 * 3600 * 1000));
    const paciente = await Paciente.create({
      nombre: b.nombre.trim(),
      documento: `${b.tipoDocumento === "Pasaporte" ? "PA" : "CC"} ${doc}`,
      documentoNum: doc,
      fechaNacimiento: nacimiento,
      edad,
      telefono: b.telefono,
      correo: b.correo || "",
      historia: await siguienteHistoria(),
    });
    res.status(201).json({ ok: true, mensaje: "Paciente guardado correctamente.", paciente });
  } catch (err) {
    errorServidor(res, err);
  }
});

// ================= MÉDICOS (HU-12, HU-13, HU-14) =================
router.get("/medicos", verificarToken, async (req, res) => {
  try {
    const q = Medico.find().sort({ nombre: 1 });
    if (req.user.rol === "admin") q.populate("user", "correo"); // los correos solo los ve el administrador
    res.json(await q);
  } catch (err) {
    errorServidor(res, err);
  }
});

router.post("/medicos", verificarToken, soloRoles("admin"), async (req, res) => {
  const b = req.body || {};
  const e = validarCuenta(b, { documento: false });
  if (!textoValido(b.especialidad)) e.especialidad = "Indica la especialidad del médico.";
  if (Object.keys(e).length) return res.status(400).json({ ok: false, errores: e, mensaje: "Revisa los campos marcados." });
  const correo = b.correo.trim().toLowerCase();
  try {
    if (await User.findOne({ correo }))
      return res.status(409).json({ ok: false, errores: { correo: "Ya existe una cuenta con ese correo." }, mensaje: "Ese correo ya está en uso." });
    const user = await User.create({ nombre: b.nombre.trim(), correo, password: await bcrypt.hash(b.password, 10), rol: "medico" });
    const medico = await Medico.create({ nombre: user.nombre, especialidad: b.especialidad.trim(), user: user._id });
    res.status(201).json({ ok: true, mensaje: "Médico registrado correctamente. Ahora configura su horario.", medico });
  } catch (err) {
    errorServidor(res, err);
  }
});

router.put("/medicos/:id/horario", verificarToken, soloRoles("admin"), idValido, async (req, res) => {
  const horario = req.body && req.body.horario;
  if (!Array.isArray(horario)) return res.status(400).json({ ok: false, mensaje: "Envía el horario como una lista de días." });
  const vistos = new Set();
  for (const h of horario) {
    if (!DIAS.includes(h.dia)) return res.status(400).json({ ok: false, mensaje: `El día "${h.dia}" no es válido.` });
    if (vistos.has(h.dia)) return res.status(400).json({ ok: false, mensaje: `El día ${h.dia} está repetido.` });
    vistos.add(h.dia);
    if (!horaValida(h.inicio) || !horaValida(h.fin))
      return res.status(400).json({ ok: false, mensaje: `Las horas del ${h.dia} no son válidas (formato HH:MM).` });
    if (h.inicio >= h.fin) return res.status(400).json({ ok: false, mensaje: `El ${h.dia}: la hora de inicio debe ser menor que la de fin.` });
  }
  try {
    const m = await Medico.findByIdAndUpdate(req.params.id, { horario }, { new: true });
    if (!m) return res.status(404).json({ ok: false, mensaje: "No encontramos al médico." });
    res.json({ ok: true, mensaje: "Horario guardado correctamente.", medico: m });
  } catch (err) {
    errorServidor(res, err);
  }
});

// HU-14: un médico con citas pendientes no se elimina ni se desactiva sin reasignarlas
async function citasPendientes(medicoId) {
  return Cita.countDocuments({ medico: medicoId, estado: "confirmada" });
}
const bloqueoPorCitas = (n) => ({ ok: false, mensaje: `Este médico tiene ${n} cita(s) pendientes. Reasígnalas antes de continuar.` });

router.patch("/medicos/:id/activo", verificarToken, soloRoles("admin"), idValido, async (req, res) => {
  try {
    const activo = !!(req.body && req.body.activo);
    if (!activo) {
      const n = await citasPendientes(req.params.id);
      if (n > 0) return res.status(409).json(bloqueoPorCitas(n));
    }
    const m = await Medico.findByIdAndUpdate(req.params.id, { activo }, { new: true });
    if (!m) return res.status(404).json({ ok: false, mensaje: "No encontramos al médico." });
    await User.updateOne({ _id: m.user }, { activo });
    res.json({ ok: true, mensaje: activo ? "Médico activado." : "Médico desactivado.", medico: m });
  } catch (err) {
    errorServidor(res, err);
  }
});

router.delete("/medicos/:id", verificarToken, soloRoles("admin"), idValido, async (req, res) => {
  try {
    const n = await citasPendientes(req.params.id);
    if (n > 0) return res.status(409).json(bloqueoPorCitas(n));
    const m = await Medico.findByIdAndDelete(req.params.id);
    if (!m) return res.status(404).json({ ok: false, mensaje: "No encontramos al médico." });
    await User.deleteOne({ _id: m.user });
    res.json({ ok: true, mensaje: "Médico eliminado." });
  } catch (err) {
    errorServidor(res, err);
  }
});

// ================= USUARIOS DEL SISTEMA (panel de accesos) =================
router.get("/usuarios", verificarToken, soloRoles("admin"), async (req, res) => {
  try {
    res.json(await User.find().select("-password").sort({ createdAt: 1 }));
  } catch (err) {
    errorServidor(res, err);
  }
});

router.post("/usuarios", verificarToken, soloRoles("admin"), async (req, res) => {
  const b = req.body || {};
  const e = validarCuenta(b, { documento: false });
  if (!["recepcionista", "admin"].includes(b.rol)) e.rol = "El rol debe ser recepcionista o administrador.";
  if (Object.keys(e).length) return res.status(400).json({ ok: false, errores: e, mensaje: "Revisa los campos marcados." });
  const correo = b.correo.trim().toLowerCase();
  try {
    if (await User.findOne({ correo }))
      return res.status(409).json({ ok: false, errores: { correo: "Ya existe una cuenta con ese correo." }, mensaje: "Ese correo ya está en uso." });
    await User.create({ nombre: b.nombre.trim(), correo, password: await bcrypt.hash(b.password, 10), rol: b.rol });
    res.status(201).json({ ok: true, mensaje: "Usuario creado correctamente." });
  } catch (err) {
    errorServidor(res, err);
  }
});

module.exports = { router };
