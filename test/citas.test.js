// Pruebas del Sprint 2 que no necesitan base de datos: lógica de franjas, cruces, rangos y permisos
process.env.JWT_SECRET = "secreto-de-prueba";
const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const t = require("../tiempo");
const app = require("../app");

test("franjas: un horario 08:00-10:00 genera 4 franjas de 30 min", () => {
  const medico = { horario: [{ dia: "Lunes", inicio: "08:00", fin: "10:00" }] };
  assert.deepEqual(t.slotsDelDia(medico, "2030-01-07"), ["08:00", "08:30", "09:00", "09:30"]); // 7 ene 2030 = lunes
});
test("franjas: un día sin horario no tiene disponibilidad", () => {
  const medico = { horario: [{ dia: "Lunes", inicio: "08:00", fin: "10:00" }] };
  assert.deepEqual(t.slotsDelDia(medico, "2030-01-08"), []); // martes
});
test("cruces: citas a menos de 30 min se cruzan, a 30 min no", () => {
  assert.equal(t.seCruzan("09:00", "09:15"), true);
  assert.equal(t.seCruzan("09:00", "09:30"), false);
});
test("fechas: valida formato y calendario real", () => {
  assert.equal(t.fechaValida("2026-11-11"), true);
  assert.equal(t.fechaValida("2026-02-30"), false);
  assert.equal(t.fechaValida("11/11/2026"), false);
});
test("fechas pasadas no son agendables y las futuras sí", () => {
  assert.equal(t.esFuturo("2000-01-01", "08:00"), false);
  assert.equal(t.esFuturo("2999-01-01", "08:00"), true);
});
test("rango: rechaza invertido y demasiado largo", () => {
  assert.ok(t.validarRango("2026-11-10", "2026-11-01", 42));
  assert.ok(t.validarRango("2026-01-01", "2026-12-31", 42));
  assert.equal(t.validarRango("2026-11-01", "2026-11-30", 42), null);
});

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
const call = (path, { method = "GET", rol, body } = {}) =>
  fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(rol ? { Authorization: "Bearer " + jwt.sign({ id: "64b000000000000000000001", rol }, process.env.JWT_SECRET) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const ID = "64b000000000000000000002";

test("franjas: sin rango o sin médico/especialidad se rechaza (400)", async () => {
  assert.equal((await call("/api/franjas", { rol: "paciente" })).status, 400);
  assert.equal((await call("/api/franjas?desde=2030-01-01&hasta=2030-01-31", { rol: "paciente" })).status, 400);
});
test("agendar: datos inválidos se rechazan antes de tocar la base (400)", async () => {
  const r = await call("/api/citas", { method: "POST", rol: "paciente", body: { medico: ID, fecha: "2030-02-31", hora: "09:00" } });
  assert.equal(r.status, 400);
});
test("permisos: sin sesión 401; médico no agenda; paciente no marca atendida ni ve agenda", async () => {
  assert.equal((await call("/api/citas/mias")).status, 401);
  assert.equal((await call("/api/citas", { method: "POST", rol: "medico", body: {} })).status, 403);
  assert.equal((await call(`/api/citas/${ID}/estado`, { method: "PATCH", rol: "paciente", body: { estado: "atendida" } })).status, 403);
  assert.equal((await call("/api/agenda?desde=2030-01-01&hasta=2030-01-07", { rol: "paciente" })).status, 403);
});
test("estado: solo atendida o inasistencia (400)", async () => {
  assert.equal((await call(`/api/citas/${ID}/estado`, { method: "PATCH", rol: "medico", body: { estado: "cancelada" } })).status, 400);
});
test("agenda: el rango máximo es de 31 días (400)", async () => {
  assert.equal((await call("/api/agenda?desde=2030-01-01&hasta=2030-06-01", { rol: "medico" })).status, 400);
});
