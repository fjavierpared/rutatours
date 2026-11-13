# RutaTours

Sistema web para agencias de turismo: se diseña cada ruta con su recorrido y sus costos,
el sistema calcula el precio, el cliente reserva desde internet, reporta sus pagos y el
equipo los verifica.

- **Catálogo para clientes** (`/`): planes con precio en dólares y bolívares, calculadora
  según cuántos viajan, reserva en línea, reporte de pagos y seguimiento de reservas.
- **Panel del personal** (`/admin`): rutas (recorrido, costos, ganancia, impuestos, imágenes,
  cotizador interno), guías, vehículos, reservas, verificación de pagos, clientes, tasa BCV,
  métodos de pago, usuarios, configuración y manual de ayuda.

## Reglas principales

- **Grupo privado:** cada reserva ocupa la ruta, el guía y el vehículo todos los días del viaje;
  no se permiten reservas cruzadas.
- **Precio:** costos de grupo + habitaciones (combinación más barata) + costos por persona,
  luego ganancia e impuestos en orden y redondeo configurable. Todo en centavos enteros.
- **Abono obligatorio** (% por ruta). Estados: pendiente de abono → reservada → pagada → completada / cancelada.
- **Bolívares:** se calculan con la tasa oficial del BCV (lectura automática con respaldo manual);
  cada pago guarda la tasa usada. El IGTF (3%) se suma solo al pagar en divisas.

## Tecnologías

Node.js 22 · Express 5 · MySQL 8 · HTML, CSS y JavaScript sin frameworks.

## Ejecutar en local

```bash
mysql -u root -p < backend/database/rutatours.sql     # base completa + ruta de ejemplo
cp backend/.env.example backend/.env                   # complete usuario y clave de MySQL
cd backend && npm install && npm start
```

- Catálogo: http://localhost:3000/
- Panel: http://localhost:3000/admin — usuario **admin**, clave **admin123** (se crea al primer
  inicio si no hay usuarios; cámbiela al ingresar).

`npm test` ejecuta las pruebas del cálculo de precios y las reglas de reserva.
`npm run dev` reinicia el servidor al guardar cambios.

## Despliegue

- **Con Docker** (VPS con nginx y MySQL en contenedores): `docker compose up -d --build` — guía en
  [deploy/docker/README.md](deploy/docker/README.md).
- **Sin Docker** (Nginx, systemd y respaldo diario en el sistema): [deploy/DESPLIEGUE.md](deploy/DESPLIEGUE.md).

## Estructura

```
├── cliente.html, css/cliente.css, js/cliente/   → catálogo y portal del cliente
├── index.html, js/*.js, modulos/*.html          → panel de administración (un módulo por archivo)
├── js/diagramaRecorrido.js, js/moneda.js, ...   → componentes compartidos
├── img/icons.svg, img/manual/                   → iconos (Lucide) y capturas del manual
├── deploy/                                      → systemd, Nginx y guía de despliegue
└── backend/
    ├── server.js, db.js, auth_helper.js, utils.js
    ├── routes/        → API (/api/...)
    ├── services/      → acceso a datos de rutas, pagos, tasa y archivos
    ├── utils/         → cálculo de precios, moneda, reglas de agenda, lectura del BCV
    ├── test/          → pruebas (node --test)
    └── database/rutatours.sql
```

## Riesgo conocido: tasa BCV

La tasa se lee del sitio `bcv.org.ve`, que publica una cadena de certificados SSL incompleta.
Con `BCV_SSL_INSEGURO=1` la conexión **solo a ese sitio** se hace sin verificar el certificado;
como alternativa segura, `BCV_CA_EXTRA` puede apuntar al certificado intermedio del BCV.
Si el sitio cambia su formato la lectura falla y la tasa se carga manualmente desde el panel.
