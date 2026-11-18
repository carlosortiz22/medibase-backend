// Pruebas que no necesitan base de datos: validaciones y control de acceso por rol
process.env.JWT_SECRET = "secreto-de-prueba";
const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const app = require("../app");

let server, base;
test.before(
  () =>
    new Promise((r) => {
      server = app.listen(0, () => {
        base = `http://localhost:${server.address().port}`;
        r();
      });
    }),
);
test.after(() => server.close());

const token = (rol) => jwt.sign({ id: "64b000000000000000000001", rol, nombre: "Prueba" }, process.env.JWT_SECRET);
const call = (path, { method = "GET", rol, body } = {}) =>
  fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(rol ? { Authorization: `Bearer ${token(rol)}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test("registro: dato incorrecto devuelve el error por campo", async () => {
  const r = await call("/api/auth/register", { method: "POST", body: { nombre: "Ana", documento: "12a", correo: "mal", password: "123" } });
  const d = await r.json();
  assert.equal(r.status, 400);
  assert.ok(d.errores.documento && d.errores.correo && d.errores.password);
});
test("sin token no se accede a pacientes (401)", async () => assert.equal((await call("/api/pacientes")).status, 401));
test("paciente no entra a secciones administrativas (403)", async () => {
  assert.equal((await call("/api/usuarios", { rol: "paciente" })).status, 403);
  assert.equal((await call("/api/pacientes", { rol: "paciente" })).status, 403);
  assert.equal((await call("/api/medicos", { method: "POST", rol: "recepcionista", body: {} })).status, 403);
});
test("admin: crear médico valida los campos (400)", async () => {
  const r = await call("/api/medicos", { method: "POST", rol: "admin", body: { nombre: "", correo: "x", password: "1" } });
  assert.equal(r.status, 400);
});
test("horario: hora de inicio mayor que la de fin se rechaza (400)", async () => {
  const r = await call("/api/medicos/64b000000000000000000002/horario", {
    method: "PUT",
    rol: "admin",
    body: { horario: [{ dia: "Lunes", inicio: "12:00", fin: "08:00" }] },
  });
  assert.equal(r.status, 400);
});
test("recepción: registrar paciente con datos incompletos (400)", async () => {
  const r = await call("/api/pacientes", { method: "POST", rol: "recepcionista", body: { nombre: "" } });
  const d = await r.json();
  assert.equal(r.status, 400);
  assert.ok(d.errores.nombre && d.errores.documento);
});
