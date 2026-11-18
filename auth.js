const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { Paciente, siguienteHistoria, buscarPacientePorDocumento } = require("./models");
const { normDoc, docValido, correoValido, textoValido, telefonoValido } = require("./util");

const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      nombre: String,
      documento: { type: String, unique: true, sparse: true },
      correo: { type: String, unique: true, lowercase: true, trim: true },
      telefono: String,
      password: String,
      rol: { type: String, enum: ["paciente", "medico", "recepcionista", "admin"], default: "paciente" },
      activo: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);

// Devuelve { campo: "mensaje" } con cada error (HU-09: explica qué está mal)
function validarCuenta(b, { documento = true, telefono = false } = {}) {
  const e = {};
  if (!textoValido(b.nombre)) e.nombre = "El nombre debe tener al menos 3 letras.";
  if (documento && !docValido(normDoc(b.documento))) e.documento = "El documento debe tener entre 6 y 12 números, sin letras.";
  if (!correoValido(b.correo)) e.correo = "El correo no tiene un formato válido (ej. nombre@correo.com).";
  if (!b.password || b.password.length < 8) e.password = "La contraseña debe tener al menos 8 caracteres.";
  if (telefono && !telefonoValido(b.telefono)) e.telefono = "El teléfono no es válido.";
  return e;
}

// ---------- Middlewares de acceso (HU-05) ----------
function verificarToken(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ ok: false, mensaje: "Debes iniciar sesión para continuar." });
  }
}
const soloRoles =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.rol) ? next() : res.status(403).json({ ok: false, mensaje: "No tienes permiso para acceder a esta sección." });

// ---------- HU-09: el paciente crea su cuenta ----------
router.post("/register", async (req, res) => {
  const b = req.body || {};
  const errores = validarCuenta(b);
  if (Object.keys(errores).length) return res.status(400).json({ ok: false, errores, mensaje: "Revisa los campos marcados." });
  const documento = normDoc(b.documento);
  const correo = b.correo.trim().toLowerCase();
  try {
    if (await User.findOne({ documento }))
      return res.status(409).json({ ok: false, errores: { documento: "Ya existe una cuenta con ese documento." }, mensaje: "Ya tienes una cuenta." });
    if (await User.findOne({ correo }))
      return res.status(409).json({ ok: false, errores: { correo: "Ya existe una cuenta con ese correo." }, mensaje: "Ese correo ya está en uso." });
    await User.create({ nombre: b.nombre.trim(), documento, correo, telefono: b.telefono || "", password: await bcrypt.hash(b.password, 10), rol: "paciente" });
    // Si la recepción aún no lo había registrado, se crea su ficha de paciente
    if (!(await buscarPacientePorDocumento(documento))) {
      await Paciente.create({
        nombre: b.nombre.trim(),
        documento,
        documentoNum: documento,
        telefono: b.telefono || "",
        correo,
        historia: await siguienteHistoria(),
      });
    }
    res.status(201).json({ ok: true, mensaje: "Cuenta creada. Ya puedes iniciar sesión." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: "Error del servidor. Inténtalo de nuevo." });
  }
});

// ---------- HU-04: inicio de sesión ----------
router.post("/login", async (req, res) => {
  try {
    const { correo, password } = req.body || {};
    const user = await User.findOne({
      correo: String(correo || "")
        .trim()
        .toLowerCase(),
    });
    if (!user || !(await bcrypt.compare(String(password || ""), user.password)))
      return res.status(401).json({ ok: false, mensaje: "Correo o contraseña incorrectos." });
    if (!user.activo) return res.status(403).json({ ok: false, mensaje: "Tu cuenta está desactivada. Contacta al administrador." });
    const token = jwt.sign({ id: user._id, rol: user.rol, nombre: user.nombre }, process.env.JWT_SECRET, { expiresIn: "8h" });
    res.json({ ok: true, token, usuario: { nombre: user.nombre, rol: user.rol } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, mensaje: "Error del servidor. Inténtalo de nuevo." });
  }
});

// ---------- HU-11: consultar y actualizar mi perfil ----------
router.get("/me", verificarToken, async (req, res) => {
  const u = await User.findById(req.user.id).select("-password");
  if (!u) return res.status(401).json({ ok: false, mensaje: "Debes iniciar sesión para continuar." });
  res.json({ ok: true, perfil: u });
});

router.put("/me", verificarToken, async (req, res) => {
  const { nombre, telefono } = req.body || {};
  const errores = {};
  if (!textoValido(nombre)) errores.nombre = "El nombre debe tener al menos 3 letras.";
  if (!telefonoValido(telefono)) errores.telefono = "El teléfono no es válido.";
  if (Object.keys(errores).length) return res.status(400).json({ ok: false, errores, mensaje: "Revisa los campos marcados." });
  const u = await User.findByIdAndUpdate(req.user.id, { nombre: nombre.trim(), telefono }, { new: true }).select("-password");
  if (u.rol === "paciente" && u.documento) await Paciente.updateOne({ documentoNum: u.documento }, { nombre: u.nombre, telefono });
  res.json({ ok: true, mensaje: "Perfil actualizado correctamente.", perfil: u });
});

// Crea un administrador inicial para poder registrar médicos y personal
async function crearAdminInicial() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  if (await User.findOne({ correo: ADMIN_EMAIL.toLowerCase() })) return;
  await User.create({ nombre: "Administrador", correo: ADMIN_EMAIL, password: await bcrypt.hash(ADMIN_PASSWORD, 10), rol: "admin" });
  console.log("Administrador inicial creado");
}

module.exports = { router, User, verificarToken, soloRoles, validarCuenta, crearAdminInicial };
