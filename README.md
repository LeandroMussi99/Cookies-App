# 🍪 Cookies App — E-commerce artesanal

**Cookies App** es una aplicación web de comercio electrónico desarrollada para un pequeño emprendimiento de venta de cookies caseras.  
Cuenta con un **frontend estático** en Vanilla JS y un **backend sin servidor (serverless)** desplegado en **Cloudflare Workers**, con integración a **Mercado Pago** y base de datos **PostgreSQL (Neon)**.

> 🌐 **Sitio activo:** [https://cookiesapp.pages.dev](https://cookiesapp.pages.dev)  
> 🧾 *Los pagos están en modo prueba (sandbox de Mercado Pago) y no generan cobros reales.*

---

## 🖼️ Vista general

### 🛍️ Tienda pública

<img width="1129" height="770" alt="Cookies" src="https://github.com/user-attachments/assets/fd02eeb6-e89e-4381-9429-7940bf22c74f" />

<img width="1349" height="736" alt="Cookies modal" src="https://github.com/user-attachments/assets/20b33d50-5763-4d0d-9328-3a06eff3110f" />

### 🧁 Panel de administración

<img width="1209" height="596" alt="Cookies Administracion Productos" src="https://github.com/user-attachments/assets/78c7faf0-f57b-4746-aa02-22b1479db43f" />

<img width="1070" height="674" alt="Cookies Administracion productos modal" src="https://github.com/user-attachments/assets/46844353-23f2-4ebb-a367-a99aafdca8bf" />

<img width="1133" height="622" alt="Cookies Administracion pedidos" src="https://github.com/user-attachments/assets/519959f3-b9cd-4aee-8366-e39c21079041" />

<img width="1292" height="771" alt="Cookies Administracion pedidos modal" src="https://github.com/user-attachments/assets/46ca582c-4be5-4c1f-bb2e-73c5035568f7" />

---

## 🧱 Estructura del proyecto

| Carpeta | Descripción |
|----------|-------------|
| `cookies-frontend/` | Sitio público y panel de administración construidos con HTML, CSS y JavaScript sin framework. Incluye carrito, checkout y vistas admin. |
| `cookies-backend/` | Worker de Cloudflare implementado con **Hono** que expone la API REST, maneja los pedidos, se comunica con **Neon DB** y **Mercado Pago**. |

---

## ⚙️ Backend (`cookies-backend/`)

### 🚀 Tecnologías principales
- **Cloudflare Workers** + **Wrangler** para despliegue.
- **Hono** como micro-framework HTTP.
- **@neondatabase/serverless** para conexión a PostgreSQL.
- **Mercado Pago API** (preferencias, webhooks y sincronización de estados).

### 🔐 Variables de entorno

| Variable | Requerida | Descripción |
|-----------|------------|-------------|
| `NEON_DATABASE_URL` | ✅ | Cadena de conexión a Neon/PostgreSQL. |
| `MP_ACCESS_TOKEN` | ✅ | Token privado de Mercado Pago. |
| `ORIGEN_FRONTEND` | Opcional | Dominios permitidos para CORS. |
| `ADMIN_USER` / `ADMIN_PASS` | Opcional | Credenciales Basic Auth para el panel admin. |


## 🔗 API principal

| Método                            | Ruta                                                        | Descripción |
| --------------------------------- | ----------------------------------------------------------- | ----------- |
| `GET /api/health`                 | Chequeo de estado.                                          |             |
| `GET /api/productos`              | Lista pública de productos activos.                         |             |
| `POST /api/pedidos`               | Crea un pedido, genera la preferencia MP y descuenta stock. |             |
| `GET /api/pedidos/:id`            | Detalle del pedido.                                         |             |
| `POST /api/webhooks/mp`           | Webhook para sincronizar estados de pago.                   |             |
| `GET /api/admin/pedidos`          | Listado resumido de pedidos (requiere autenticación).       |             |
| `GET /api/admin/pedidos/:id`      | Detalle extendido para el panel admin.                      |             |
| `POST /api/admin/productos`       | Crear producto (Basic Auth).                                |             |
| `PUT /api/admin/productos/:id`    | Editar producto (Basic Auth).                               |             |
| `DELETE /api/admin/productos/:id` | Eliminar producto (Basic Auth).                             |             |


## Frontend (cookies-frontend/)

Vanilla JavaScript, HTML y CSS sin frameworks.

Módulos:

app.js → Renderizado del catálogo, carrito y checkout.
api.js → Centraliza las llamadas al backend.
config.js → Define la URL base del API y utilidades compartidas.
/admin/ → Panel de administración con vistas para productos y pedidos.

## 🔒 Seguridad y buenas prácticas

✅ No hay credenciales expuestas en el código.
✅ Las variables sensibles se leen solo desde bindings o secrets.
✅ Sin archivos .env ni dumps versionados.
✅ URL pública del Worker usada solo como fallback.

