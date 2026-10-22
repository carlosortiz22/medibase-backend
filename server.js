require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.use(cors());
app.use(express.json());

const pacienteSchema = new mongoose.Schema({
  nombre: String,
  documento: String,
  edad: Number,
  telefono: String,
  historia: String,
});
const Paciente = mongoose.model("Paciente", pacienteSchema);

const datosIniciales = [
  { nombre: "Ana Torres Gómez", documento: "CC 48.293.104", edad: 34, telefono: "300 123 4567", historia: "HC-00142" },
  { nombre: "Carlos Mendoza", documento: "CC 79.104.882", edad: 52, telefono: "310 842 1170", historia: "HC-00143" },
  { nombre: "Elena Vargas Díaz", documento: "CC 52.806.291", edad: 41, telefono: "315 720 0931", historia: "HC-00144" },
];

app.get("/", (req, res) => res.send("API MediBase funcionando"));

app.get("/api/pacientes", async (req, res) => {
  try {
    const pacientes = await Paciente.find().sort({ historia: 1 });
    res.json(pacientes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al consultar la base de datos" });
  }
});

async function iniciar() {
  if (!process.env.MONGODB_URI) {
    console.error("Falta la variable de entorno MONGODB_URI");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Conectado a MongoDB");

  // Si la colección está vacía, carga datos de ejemplo
  if ((await Paciente.countDocuments()) === 0) {
    await Paciente.insertMany(datosIniciales);
    console.log("Datos de ejemplo insertados");
  }

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Servidor activo en puerto ${port}`));
}

iniciar().catch(err => {
  console.error("Error de conexión:", err.message);
  process.exit(1);
});
