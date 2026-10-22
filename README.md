# MediBase - Backend

API REST con Express + MongoDB Atlas.

## Endpoints
- `GET /` -> estado de la API
- `GET /api/pacientes` -> lista de pacientes (se cargan datos de ejemplo la primera vez)

## Uso local
```
npm install
cp .env.example .env   # y pon tu cadena real de MongoDB Atlas
npm start
```
Abre http://localhost:3000/api/pacientes

## Despliegue en Render
- Build command: `npm install`
- Start command: `npm start`
- Variable de entorno: `MONGODB_URI`
