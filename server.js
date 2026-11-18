require("dotenv").config();
const mongoose = require("mongoose");
const app = require("./app");
const { Paciente, Cita } = require("./models");
const { crearAdminInicial } = require("./auth");

const datosIniciales = [
  { nombre: "Ana Torres Gómez", documento: "CC 48.293.104", documentoNum: "48293104", edad: 34, telefono: "300 123 4567", historia: "HC-00142" },
  { nombre: "Carlos Mendoza", documento: "CC 79.104.882", documentoNum: "79104882", edad: 52, telefono: "310 842 1170", historia: "HC-00143" },
  { nombre: "Elena Vargas Díaz", documento: "CC 52.806.291", documentoNum: "52806291", edad: 41, telefono: "315 720 0931", historia: "HC-00144" },
];

async function iniciar() {
  if (!process.env.MONGODB_URI) {
    console.error("Falta la variable de entorno MONGODB_URI");
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    console.error("Falta la variable de entorno JWT_SECRET");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Conectado a MongoDB");

  // Si la colección está vacía, carga datos de ejemplo
  if ((await Paciente.countDocuments()) === 0) {
    await Paciente.insertMany(datosIniciales);
    console.log("Datos de ejemplo insertados");
  }
  await Cita.init(); // construye los índices únicos que impiden cruces de horario
  await crearAdminInicial();

  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Servidor activo en puerto ${port}`));
}

iniciar().catch((err) => {
  console.error("Error de conexión:", err.message);
  process.exit(1);
});
