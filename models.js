const mongoose = require("mongoose");
const { Schema } = mongoose;

const Paciente = mongoose.model(
  "Paciente",
  new Schema({
    nombre: String,
    documento: String,
    documentoNum: String, // solo dígitos, para detectar duplicados
    edad: Number,
    fechaNacimiento: Date,
    telefono: String,
    correo: String,
    historia: String,
  }),
);

const Medico = mongoose.model(
  "Medico",
  new Schema(
    {
      nombre: String,
      especialidad: String,
      user: { type: Schema.Types.ObjectId, ref: "User" },
      activo: { type: Boolean, default: true },
      horario: [{ _id: false, dia: String, inicio: String, fin: String }],
    },
    { timestamps: true },
  ),
);

// Una franja ocupada = cita con activa:true. Los índices únicos parciales garantizan, en la base de datos,
// que un médico (o un paciente) nunca tenga dos citas activas a la misma hora, aunque lleguen dos solicitudes a la vez.
const citaSchema = new Schema(
  {
    paciente: { type: Schema.Types.ObjectId, ref: "Paciente" },
    medico: { type: Schema.Types.ObjectId, ref: "Medico" },
    fecha: String, // YYYY-MM-DD
    hora: String, // HH:MM
    estado: { type: String, enum: ["confirmada", "cancelada", "atendida", "inasistencia"], default: "confirmada" },
    activa: { type: Boolean, default: true },
    creadaPor: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
citaSchema.index({ medico: 1, fecha: 1, hora: 1 }, { unique: true, partialFilterExpression: { activa: true } });
citaSchema.index({ paciente: 1, fecha: 1, hora: 1 }, { unique: true, partialFilterExpression: { activa: true } });
const Cita = mongoose.model("Cita", citaSchema);

async function siguienteHistoria() {
  const ultimo = await Paciente.findOne().sort({ historia: -1 });
  const n = ultimo ? parseInt(String(ultimo.historia).replace(/\D/g, ""), 10) || 0 : 0;
  return "HC-" + String(n + 1).padStart(5, "0");
}

// Busca por documentoNum y, para datos antiguos sin ese campo, compara solo los dígitos
async function buscarPacientePorDocumento(num) {
  const p = await Paciente.findOne({ documentoNum: num });
  if (p) return p;
  const viejos = await Paciente.find({ documentoNum: { $exists: false } });
  return viejos.find((v) => String(v.documento || "").replace(/\D/g, "") === num) || null;
}

module.exports = { Paciente, Medico, Cita, siguienteHistoria, buscarPacientePorDocumento };
