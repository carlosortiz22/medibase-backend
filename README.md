# MediBase - Backend

API REST con Express + MongoDB Atlas.

## Endpoints
- `GET /` -> estado de la API
- `POST /api/auth/register` -> el paciente crea su cuenta (valida cada campo)
- `POST /api/auth/login` -> inicia sesión y devuelve un token JWT con el rol
- `GET/PUT /api/auth/me` -> consultar y actualizar mi perfil
- `GET/POST /api/pacientes` -> consultar (`?q=`) y registrar pacientes (recepción, médico, admin)
- `GET/POST /api/medicos`, `PUT /api/medicos/:id/horario`, `PATCH /api/medicos/:id/activo`, `DELETE /api/medicos/:id` -> médicos y horarios (admin). Un médico con citas pendientes no se puede eliminar ni desactivar.
- `GET/POST /api/usuarios` -> usuarios del sistema (admin)

Roles: `paciente`, `medico`, `recepcionista`, `admin`. Las rutas protegidas exigen `Authorization: Bearer <token>`.

## Uso local
```
npm install
cp .env.example .env   # y pon tu cadena real de MongoDB Atlas
npm start
npm test    # pruebas de validación y control de acceso
```
Abre http://localhost:3000/api/pacientes

## Despliegue en Render
- Build command: `npm install`
- Start command: `npm start`
- Variables de entorno: `MONGODB_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (el admin inicial se crea al arrancar)
