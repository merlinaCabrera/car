# CLAUDE.md — Club Atlético Roberts (CAR)

Guía de contexto para Claude Code. Leer antes de tocar cualquier archivo.

_Última actualización: 2026-09-06._

---

## Qué es este proyecto

Aplicación web para la gestión interna del Club Atlético Roberts (Roberts, Buenos Aires).
Reemplaza planillas Excel y procesos manuales. Mobile-first — la mayoría de los accesos
son desde el celular (porteros en puertas, socios en el campo).

**Dominio en producción:** `https://www.clubatleticoroberts.com`

**Usuarios objetivo:** ~300 socios activos, con proyección a 500.

---

## Stack

### Backend
- **Framework:** FastAPI + Uvicorn
- **ORM:** SQLAlchemy 2.x (con `Mapped`/`mapped_column` — ORM moderno)
- **BD:** PostgreSQL en Neon (serverless, plan gratuito)
- **Auth:** JWT con `python-jose`. Hashing con **bcrypt puro** en `security.py` (no usa passlib; trunca a 72 bytes a mano). `bcrypt==3.2.2` fijado en `requirements.txt` — el comentario del pin menciona passlib por historia, pero passlib ya no se importa.
- **Migraciones:** Alembic (`backend/alembic/`, ~30 revisiones). El schema real se maneja con migraciones; `models.py` es la fuente de verdad para autogenerar. `alembic/env.py` toma la URL de la env var `DATABASE_URL`.
- **Jobs:** APScheduler (BackgroundScheduler, no async)
- **Mail:** Resend vía HTTP directo (templates Jinja2 en `mailer/templates/`)
- **Archivos:** Amazon S3 (`boto3`) — bucket privado `car-archivos-produccion` + bucket público `car-sponsors-produccion` (`S3_BUCKET_PUBLICO`), ambos `sa-east-1`
- **Pagos:** MercadoPago SDK (webhooks implementados, flujo manual de comprobantes activo)
- **Config:** parcialmente en `backend/config.py` (`pydantic-settings`: solo MP, `SISTEMA_USER_ID`, `FRONTEND_URL`, `BACKEND_URL`). El resto (`DATABASE_URL`, `SECRET_KEY`, `AWS_*`, `RESEND_API_KEY`, `S3_BUCKET_*`, `MAIL_*`) se lee con `os.environ` / `os.getenv` en `database.py`, `security.py`, `utils/s3.py` y `mailer/services/email_service.py`. ⚠️ Pendiente: centralizar todo en `config.py`.

### Frontend
- **Framework:** React 18 + Vite
- **Router:** React Router v6
- **Estilos:** Tailwind CSS
- **Íconos:** Lucide React
- **QR:** `qrcode.react` (generación) + `@yudiel/react-qr-scanner` (lectura cámara)
- **Deploy:** S3 + CloudFront (migrado desde Vercel Hobby, que no permite uso comercial)
- **CI/CD:** GitHub Actions → build → S3 sync → invalidar CloudFront

---

## Estructura del repositorio

```
car/
├── docker-compose.yml           # Postgres 15 local para dev (usa ./init-db para el seed)
├── init-db/                     # SQL de bootstrap del Postgres local
├── .env                         # Solo POSTGRES_PASSWORD para docker-compose (gitignoreado)
├── backend/
│   ├── main.py                  # FastAPI app, CORS, include_router de todos los routers, /health
│   ├── models.py                # Todos los modelos SQLAlchemy (fuente de verdad para autogenerar migraciones)
│   ├── schemas.py               # Todos los schemas Pydantic (request/response)
│   ├── config.py                # pydantic-settings — solo un subconjunto de env vars (ver Stack)
│   ├── dependencies.py          # require_roles(), get_current_user(), get_db()
│   ├── scheduler.py             # Jobs de APScheduler (5 jobs activos)
│   ├── security.py              # hash/verify password (bcrypt puro), crear JWT
│   ├── database.py              # Engine SQLAlchemy, SessionLocal — lee DATABASE_URL de os.environ
│   ├── alembic.ini              # Config de Alembic — sqlalchemy.url vacío (se inyecta desde env)
│   ├── alembic/                 # env.py + versions/ (~30 revisiones)
│   ├── scripts/
│   │   └── seed_usuario_sistema.py   # Crea el usuario "sistema" (SISTEMA_USER_ID)
│   ├── static/ , uploads/       # Archivos servidos/subidos en local (en prod va todo a S3)
│   ├── routers/                 # Un archivo por dominio
│   │   ├── auth.py              # Login, logout, refresh, recuperar password
│   │   ├── usuarios.py          # Perfil propio del socio (/usuarios/me, foto, password)
│   │   ├── admin_usuarios.py    # CRUD socios desde admin, saldo, roles
│   │   ├── admin_dashboard.py   # Resumen panel admin
│   │   ├── admin_ordenes.py     # Listado y aprobación/rechazo de órdenes
│   │   ├── admin_reservas.py    # Agenda de reservas (canchas/quincho)
│   │   ├── admin_pagos.py       # Verificaciones de comprobantes
│   │   ├── admin_auditoria.py   # Historial de acciones admin
│   │   ├── admin_comercios.py   # CRUD comercios adheridos
│   │   ├── admin_productos.py   # CRUD catálogo de productos
│   │   ├── socio_cuotas.py      # Estado de cuenta, historial, cobro manual admin
│   │   ├── socio_carrito.py     # Carrito, checkout, split-order
│   │   ├── socio_reservas.py    # Pre-reserva de canchas/quincho (socio)
│   │   ├── socio_billetera.py   # Saldo a favor del socio
│   │   ├── deportivo.py         # Categorías, planteles, eventos, convocatorias
│   │   ├── qr_auth.py           # Verificación de QR en escáneres
│   │   ├── notificaciones.py    # Notificaciones in-app
│   │   ├── beneficios.py        # Beneficios en comercios adheridos (validación por QR)
│   │   ├── faq.py               # FAQ público + CRUD admin de entradas
│   │   ├── webhooks_mercadopago.py
│   │   ├── admin_sponsors.py    # CRUD sponsors (admin)
│   │   └── sponsors.py          # Lectura pública de sponsors (landing) — se importa `as sponsors_publico`
│   ├── mailer/
│   │   ├── services/email_service.py   # Envío vía Resend
│   │   ├── services/email_tasks.py     # Funciones de alto nivel por evento
│   │   └── templates/email/            # Templates HTML con Jinja2
│   └── utils/
│       ├── s3.py        # upload_file_to_s3(), delete_file_from_s3(), presigned URLs, bucket público de sponsors
│       ├── audit.py     # registrar_audit() — wrapper para AuditLog
│       └── ordenes.py   # Helpers del ciclo de vida de órdenes
│
├── frontend/
│   └── src/
│       ├── App.jsx              # Todas las rutas (React Router)
│       ├── layouts/MainLayout.jsx       # Shell con menú hamburguesa
│       ├── context/
│       │   ├── AuthContext.jsx  # user, token, login(), logout(), actualizarUsuario()
│       │   └── CartContext.jsx  # Estado del carrito
│       ├── components/
│       │   ├── CalendarioMensual.jsx    # Grilla mensual reutilizable (eventos + reservas)
│       │   ├── ReservaCalendar.jsx      # Grilla de turnos por instalación
│       │   ├── ConfirmDialog.jsx        # Reemplaza window.confirm()
│       │   ├── RutaPrivada.jsx          # Wrapper de rutas protegidas (chequea auth + roles)
│       │   ├── landing/                 # Bloques de la landing pública
│       │   └── admin/                   # MetricCard, CategoriaOrdenBadge, FaqBlock, SponsorsBlock
│       ├── hooks/
│       │   ├── useAdminResource.js      # Fetch genérico con loading/error/data
│       │   ├── useExportarConvocatoria.js  # PDF de lista de convocados (jsPDF dinámico)
│       │   └── useExportarAsistencias.js   # Export asistencias
│       └── pages/               # Una página por ruta
```

---

## Variables de entorno

### Backend (Render — en dashboard de Render, NO en el repo)

⚠️ **Nunca pegar valores reales en este archivo ni en ningún archivo versionado.** Solo nombres y formato.

```
DATABASE_URL=postgresql://...-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require
SECRET_KEY=...                     # firma de JWT (security.py)
MP_ACCESS_TOKEN=...
MP_WEBHOOK_SECRET=...
SISTEMA_USER_ID=1
FRONTEND_URL=https://www.clubatleticoroberts.com
BACKEND_URL=https://club-atletico-api.onrender.com
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=sa-east-1
S3_BUCKET_NAME=car-archivos-produccion        # bucket privado (fotos, comprobantes)
S3_BUCKET_PUBLICO=car-sponsors-produccion     # bucket público (logos de sponsors)
RESEND_API_KEY=...
MAIL_FROM=...                      # opcional, default onboarding@resend.dev
MAIL_FROM_NAME=Club Atlético Roberts
CLUB_EMAIL=clubatleticoroberts1@gmail.com
```

`alembic/env.py` también lee `DATABASE_URL` de la env var (o del `.env` local) — `alembic.ini` ya no lleva la URL.

### Frontend (GitHub Actions secrets → Vite build)
```
VITE_API_URL=https://club-atletico-api.onrender.com
```

El workflow `.github/workflows/deploy.yml` además usa los secrets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y `CLOUDFRONT_DISTRIBUTION_ID` para el `s3 sync` + invalidación.

⚠️ `FRONTEND_URL` en el backend se usa para armar links en los mails.
Si está mal configurada, todos los links de los mails apuntan a la URL equivocada.

### ⚠️ Secretos filtrados en el historial de git (rotar)

Estos valores estuvieron hardcodeados en archivos versionados y siguen en el historial de git aunque ya se limpiaron del working tree. **Rotar sí o sí antes del MVP:**

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` — estaban en `CLAUDE.md`.
- `DATABASE_URL` de Neon (usuario `neondb_owner` + password) — estaba en `backend/alembic.ini`.

---

## Roles del sistema

Arquitectura multi-rol: tabla puente `usuarios_roles`. Un usuario puede tener varios roles simultáneos — el frontend muestra la suma de permisos.

| Rol | Nombre en DB | Descripción |
|-----|-------------|-------------|
| Administrador General | `admin_general` | CRUD total, config global, gestión de roles |
| Personal Administrativo | `personal_administrativo` | Lectura socios, aprobar/rechazar órdenes |
| Personal Técnico | `personal_tecnico` | Planteles, eventos, convocatorias |
| Jugador | `jugador` | Socio + calendario deportivo + mi-equipo |
| Escáner General | `admin_temporal` | Solo lector QR/DNI en puertas |
| Invitado | `invitado` | Solo validar QR para beneficios en comercios |
| Socio | `socio` | Rol base de todo usuario aprobado |

### Dependencias de FastAPI para permisos
```python
from dependencies import require_roles, get_current_user

# Cualquier usuario logueado:
current_user = Depends(get_current_user)

# Solo admin_general:
admin = Depends(require_roles("admin_general"))

# Admin o personal administrativo:
staff = Depends(require_roles("admin_general", "personal_administrativo"))
```

---

## Rutas del frontend

### Públicas
| Ruta | Página |
|------|--------|
| `/` | Landing (visual, comercios, sponsors, historia) |
| `/login` | Login con DNI + contraseña |
| `/registro` | Solicitud de alta de socio |
| `/recuperar-password` | Recupero por email |
| `/ayuda` | FAQ público |

### Socio (requiere auth, cualquier rol)
| Ruta | Página |
|------|--------|
| `/socio` | Home del socio (QR, estado, comercios) |
| `/socio/cuotas` | Gestión de cuotas, calendario, historial |
| `/socio/reservas` | Reserva quincho |
| `/socio/cancha` | Reserva canchas |
| `/shopping` | Tienda oficial |
| `/mis-compras` | Historial de órdenes del socio |
| `/carrito` | Carrito + checkout |
| `/perfil` o `/configuracion` | Perfil: foto, teléfono, dirección, contraseña |
| `/notificaciones` | Notificaciones in-app |
| `/cambiar-password-obligatorio` | Forzado en primer ingreso |

### Jugador (requiere rol `jugador`)
| Ruta | Página |
|------|--------|
| `/mi-equipo` | Plantel, capitán, próximo evento, presentismo |
| `/calendario-deportivo` | Partidos, convocatorias, confirmar asistencia |

### Técnico (requiere `personal_tecnico` o `admin_general`)
| Ruta | Página |
|------|--------|
| `/gestion-planteles` | CRUD categorías y planteles, capitán |
| `/gestion-eventos` | Lista/calendario de eventos, convocatorias |
| `/asistencias` | Registro de asistencia post-evento |

### Admin (requiere `admin_general` o `personal_administrativo`)
| Ruta | Página |
|------|--------|
| `/admin` | Panel: métricas, pendientes, accesos rápidos |
| `/admin/solicitudes` | Aprobar/rechazar solicitudes de alta |
| `/admin/socios` | CRUD socios, filtros, roles, beca, saldo |
| `/admin/verificaciones` | Bandeja de comprobantes pendientes (filtra por `?tipo=cuota\|compra\|alquiler`) |
| `/admin/pagos`, `/admin/tienda`, `/admin/alquileres` | Redirects a `/admin/verificaciones?tipo=...` (no son páginas propias) |
| `/admin/reservas` | Agenda de canchas y quincho |
| `/admin/escaner` | Escáner QR general (portero) |
| `/admin/escaner-evento` | Escáner QR para eventos deportivos |
| `/admin/escaner-canchas` | Escáner QR para reintegro en canchas |
| `/admin/productos` | CRUD catálogo |
| `/admin/comercios` | CRUD comercios adheridos |
| `/admin/auditoria` | Historial de acciones (audit_log) |
| `/admin/estadisticas` | Estadísticas y reportes |

---

## Flujo económico (carrito y órdenes)

El sistema no usa gateway de pagos en tiempo real. El flujo es:

1. Socio agrega ítems al carrito → checkout → se crea `Orden` con estado `pendiente_verificacion`
2. Para cuotas/alquileres: el sistema bloquea el turno o registra los meses
3. Socio sube foto del comprobante de transferencia
4. Admin/administrativo ve la orden en `/admin/verificaciones` → aprueba o rechaza
5. Al aprobar: se ejecutan las acciones atómicas (acreditar cuotas, confirmar reserva, descontar stock)

**Split-order:** Una orden puede tener ítems mixtos (cuota + alquiler + producto). La lógica de split está en `utils/ordenes.py`.

**Saldo a favor:** Los reintegros de canchas y las suspensiones por lluvia acreditan saldo en `usuarios.saldo_a_favor`. El socio puede aplicarlo en el checkout como descuento.

---

## Instalaciones y alquileres

Tres instalaciones, identificadas por string fijo:
- `cancha_1` → Cancha 1
- `cancha_2` → Cancha 2
- `quincho` → Quincho

Las reservas tienen dos estados propios (`bloqueada`, `confirmada`, `liberada`, `expirada`) y el estado de pago viene de la `Orden` asociada (`estado_orden`). El frontend colorea por `estado_orden`:
- Naranja: `pendiente_verificacion`
- Verde: `aprobada`
- Azul: sin orden (reserva manual del admin)
- Gris: `rechazada` / `cancelada_socio` / `expirada`

---

## Scheduler (APScheduler)

Cinco jobs en `backend/scheduler.py`. Todos usan `BackgroundScheduler` (no async).

| Job | Frecuencia | Qué hace |
|-----|-----------|---------|
| `cerrar_eventos_vencidos` | cada 12 hs | Cierra eventos deportivos pasados |
| `expirar_ordenes_vencidas` | cada 4 hs | Expira órdenes por `expira_at` |
| `recordatorio_comprobante_pendiente` | cada 4 hs | Mail recordatorio a socios con orden pendiente |
| `notificar_cuotas_vencidas` | cron 9:00 UTC | Mail a socios morosos |
| `expirar_reservas_sin_pago` | cada 15 min | Libera reservas cuyo turno ya comenzó sin pago aprobado |

⚠️ Render free tier hace spin-down por inactividad. Si el servidor está dormido, los jobs no corren. Esto puede dejar reservas bloqueadas más tiempo del esperado.

---

## Archivos en S3

- **Bucket privado:** `car-archivos-produccion` (`S3_BUCKET_NAME`, región `sa-east-1`) — carpetas `fotos_perfil/` y `comprobantes/`
- **Bucket público:** `car-sponsors-produccion` (`S3_BUCKET_PUBLICO`) — logos de sponsors, servidos por URL directa
- **Helper:** `utils/s3.py` — `upload_file_to_s3(file, folder)` (privado, devuelve URL/presigned) + helpers separados para el bucket público de sponsors
- **⚠️ Bug conocido:** Al subir foto de perfil, el backend sube a S3 correctamente pero la URL guardada en DB puede ser la ruta local (`/fotos_perfil/...`) en lugar de la URL de S3. El frontend usa `resolverFotoUrl()` en `SocioPerfil.jsx` para normalizar URLs relativas y absolutas.

---

## Mails transaccionales

Servicio: Resend. Templates en `mailer/templates/email/` (Jinja2 + HTML).

Los templates usan `FRONTEND_URL` del backend para armar links (lo lee `mailer/services/email_service.py` con `os.getenv`, default `http://localhost:5173`). Si `FRONTEND_URL` está mal en Render, todos los links del mail van al lugar equivocado.

Templates existentes:
`solicitud_recibida`, `cuenta_aprobada`, `solicitud_rechazada`, `socio_dado_de_baja`, `socio_reactivado`, `bienvenida_alta_manual`, `orden_generada`, `orden_aprobada`, `orden_aprobada_cuota`, `orden_aprobada_tienda`, `orden_rechazada`, `orden_expirada`, `recordatorio_comprobante`, `cuota_vencida`, `recuperar_password`, `convocatoria`, `reserva_suspendida`, `aviso_admin_nuevo_socio`, `aviso_admin_solicitud_reactivacion`, `aviso_admin_jugador_categoria`, `aviso_club_comprobante`, `aviso_club_pago`, `compra_confirmada`

---

## Estado actual de módulos (Septiembre 2026)

| Módulo | Estado | Notas |
|--------|--------|-------|
| Gestión de socios | ✅ Funcional | Bugs menores en corrección |
| Gestión de cuotas | ⚠️ En corrección | Ver bugs conocidos |
| Alquileres | ✅ Funcional | Pendiente testeo completo |
| Tienda | 🔲 Sin testear | |
| Escáneres | 🔲 Sin testear | |
| Módulo deportivo | 🔲 Sin testear | |
| Personal administrativo | 🔲 Sin testear | |
| Comercios / Sponsors | 🔲 Sin testear | |

---

## Bugs conocidos

Lista viva. Algunos ítems de cuotas pueden estar ya resueltos por commits recientes (`fix cuotas`, `correlatividad pagos`, `4b7d46a`) — verificar contra el código antes de darlos por abiertos.

1. **Cuotas — pagar N meses muestra N-1:** El pago manual via admin contabiliza el mes actual como parte de los N meses. La lógica de `mes_cubierto_hasta` arranca desde el mes en curso en lugar del próximo mes pendiente.
2. **Cuotas — socio queda moroso al agregar al carrito:** Al crear la orden (estado `pendiente_verificacion`), el frontend muestra al socio como moroso antes de que el admin apruebe. El QR lo refleja antes que el calendario.
3. **Pago duplicado al elegir efectivo:** Al seleccionar método "efectivo" en checkout, la orden llega duplicada al admin.
4. **Redirect post-login:** Al hacer login, algunos usuarios son redirigidos a `/admin/auditoria` en lugar de `/socio`.
5. **Error 405 en cambio de contraseña obligatorio:** El endpoint `POST /usuarios/me/password` devuelve 405 en algunos contextos del primer ingreso.
6. **Ícono de notificaciones sin leer no aparece:** El badge del ícono de campana no se actualiza cuando hay notificaciones nuevas.
7. **Links en mails:** Si `FRONTEND_URL` no está configurada en Render, `email_service.py` cae al default `http://localhost:5173` y todos los links de los mails quedan rotos. (La migración desde Vercel ya está hecha; no quedan referencias a Vercel en el código.)
8. **Alta manual genera socio moroso:** Corregido en historial 19/08 — un alta manual ahora arranca al día igual que una solicitud aprobada.
9. **URL de foto de perfil en DB:** La URL guardada puede ser ruta local en lugar de URL S3. Workaround en frontend con `resolverFotoUrl()`.

---

## Decisiones de diseño explícitas

- **El socio no puede cambiar su propio email ni DNI.** El admin general sí puede. El socio puede cambiar teléfono, dirección y contraseña.
- **El admin general no recibe mails de sus propias acciones** (aprobaciones, rechazos). Usa la página `/admin/auditoria` como historial.
- **El saldo a favor no usa códigos alfanuméricos** — es una billetera interna (campo `usuarios.saldo_a_favor`). Se ajusta manualmente desde `/admin/socios` con motivo obligatorio (queda en audit_log).
- **La beca no genera mail** — genera notificación in-app.
- **Los morosos pueden reservar canchas** — decisión pendiente de confirmar con el club.
- **Precio de cuota indexado:** La deuda de morosos se calcula como `meses_adeudados × precio_cuota_actual`. Los pagos adelantados congelan el precio al momento del pago.
- **Mercado Pago** está integrado pero el flujo principal es validación humana (comprobante + aprobación manual). MP se usa como canal alternativo, no obligatorio.
- **Historial de admin** no tiene límite de tiempo — tiene paginación. No se borra automáticamente.
- **El admin no puede darse de baja a sí mismo** ni dar de baja al último admin activo.
- **Personal administrativo** tiene solo lectura sobre socios. No puede hacer CRUD de socios (eso es exclusivo del admin general).
- **Roles temporales** (ej. asignar rol de escáner solo para un evento) no están implementados. Anotado para el futuro.

---

## Flujo de primer ingreso (contraseña provisoria)

Al cargar socios existentes masivamente (migración desde Excel):
1. Se genera contraseña provisoria `car` + últimos 5 dígitos del DNI
2. El backend setea `requiere_cambio_password = true` en el usuario
3. Al hacer login, el backend devuelve un flag en el JWT
4. El frontend detecta el flag y redirige a `/cambiar-password-obligatorio`
5. El usuario no puede navegar hasta cambiar la contraseña

---

## Convenciones de código

### Backend
- Todos los endpoints usan `require_roles()` o `get_current_user()` de `dependencies.py`
- Audit log con `utils/audit.py` → `registrar_audit()` para todas las acciones críticas
- Los schemas de respuesta viven en `schemas.py` — nunca devolver modelos SQLAlchemy directos
- `joinedload()` explícito en queries que necesiten relaciones — no lazy loading
- Transacciones explícitas: `db.flush()` antes de `db.commit()` cuando necesitás el ID generado
- ⚠️ **Orden de imports en `main.py` y en cualquier script:** `load_dotenv()` tiene que correr ANTES de importar `database`, `config` o cualquier módulo que lea env vars al importarse (los imports ejecutan el módulo la primera vez). `main.py` tiene un bloque comentado explicando esto; los scripts de `scripts/` hacen `load_dotenv()` antes de `from database import ...`.
- Nunca hardcodear credenciales ni connection strings en archivos versionados (incluye `alembic.ini`, `CLAUDE.md`, tests). Todo por env var.

### Frontend
- `useAdminResource(path)` para fetches admin con loading/error/data estándar
- `AuthContext` provee `user`, `token`, `actualizarUsuario()` — no hacer fetch a `/usuarios/me` en cada componente
- `CalendarioMensual` es el componente compartido de grilla mensual — reutilizarlo, no duplicar
- `ConfirmDialog` en lugar de `window.confirm()` para todas las acciones destructivas
- Tailwind puro en componentes nuevos — evitar `form-input` si no está definido en `index.css`

---

## Cómo correr en local

### Base de datos local (opcional, alternativa a Neon dev)
```bash
# Desde la raíz. Levanta Postgres 15 en localhost:5432 con el seed de ./init-db
docker compose up -d db
# .env de la raíz solo necesita: POSTGRES_PASSWORD=...
```

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# Crear backend/.env con las variables de la sección "Variables de entorno"
# (DATABASE_URL apuntando a Neon dev o al Postgres de docker-compose)
alembic upgrade head                       # aplicar migraciones
python -m scripts.seed_usuario_sistema     # crear el usuario "sistema" (SISTEMA_USER_ID)
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
# Crear .env.local con:
# VITE_API_URL=http://localhost:8000
npm run dev
```

---

## Infraestructura (resumen)

| Componente | Servicio | Plan | Cuenta |
|------------|---------|------|--------|
| Backend API | Render | Gratuito | merlinacabreramc@gmail.com |
| Base de datos | Neon (PostgreSQL) | Gratuito | merlinacabreramc@gmail.com |
| Frontend | S3 + CloudFront | Pago por uso ~USD 1/mes | clubatleticoroberts1@gmail.com (AWS) |
| Archivos (fotos/comprobantes) | Amazon S3 | Pago por uso ~USD 1/mes | clubatleticoroberts1@gmail.com (AWS) |
| Mail transaccional | Resend | Gratuito | — |
| Dominio | Namecheap → CloudFront | ~USD 12/año | clubatleticoroberts1@gmail.com |

**Pendiente antes del MVP:**
- Rotar todas las claves (AWS, MP, Resend, `SECRET_KEY`, password de Neon) — ver "Secretos filtrados en el historial de git". Idealmente también limpiar el historial (`git filter-repo`) o asumir que quedan expuestas y rotar.
- Configurar UptimeRobot para alertas de caída (ya existe el endpoint `/health`)
- Migrar Render y Neon a cuenta del club (clubatleticoroberts1@gmail.com)
- Centralizar todas las env vars en `config.py` (hoy están repartidas entre `config.py` y `os.getenv` sueltos)

---

## Contexto del club

- **Nombre completo:** Club Atlético Roberts
- **Localidad:** Roberts, Buenos Aires, Argentina
- **Socios activos:** ~300 (proyección 500)
- **Cuota social:** configurable desde `/admin` → `configuracion_club`
- **Día de vencimiento de cuota:** día 10 de cada mes (configurable)
- **Descuento menores de edad:** 40% sobre la cuota base
- **Instalaciones:** Cancha 1, Cancha 2, Quincho
- **Correo del club:** clubatleticoroberts1@gmail.com
