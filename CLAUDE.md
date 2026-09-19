# CLAUDE.md — Club Atlético Roberts (CAR)

Guía de contexto para Claude Code. Leer antes de tocar cualquier archivo.

_Última actualización: 2026-09-18._

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
- **Migraciones:** Alembic (`backend/alembic/`, ~30 revisiones). `models.py` es la fuente de verdad para autogenerar. `alembic/env.py` toma la URL de la env var `DATABASE_URL`.
  ⚠️ **La cadena NO es replayable desde cero**: `90885e41b585_sincronizar_base_neon` se
  autogeneró contra el estado que tenía Neon en ese momento y falla sobre una base vacía
  (`DuplicateTable: comercios_asociados`). Es válida hacia adelante desde producción, así
  que no se toca. Para un entorno nuevo: `python -m scripts.bootstrap_db` (crea el schema
  desde `models.py` y hace `stamp` en head).
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
- **Asistente Virtual:** "Camotito" (`ChatbotFlotante.jsx`) — Gemini Flash / Fallback por reglas, botonera de consultas frecuentes, blindaje por rol y cero emojis.
- **Onboarding:** Tour Guiado Interactivo (`TourGuiado.jsx`) — 14 pasos para nuevos socios tras primer cambio de clave o a demanda vía chat de Camotito.
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
│   │   ├── socio_cuotas.py      # Estado de cuenta, historial, cobro manual admin + POST /admin/cuotas/aviso-mail-masivo (huérfano, ver Mensajería)
│   │   ├── admin_mensajeria.py  # Plantillas de mail transaccional (asunto/cuerpo editables)
│   │   ├── socio_carrito.py     # Carrito, checkout, split-order
│   │   ├── socio_reservas.py    # Pre-reserva de canchas/quincho (socio)
│   │   ├── socio_billetera.py   # Saldo a favor del socio
│   │   ├── deportivo.py         # Categorías, planteles, eventos, convocatorias
│   │   ├── qr_auth.py           # Verificación de QR en escáneres + GET /admin/escaner/cache (padrón offline)
│   │   ├── notificaciones.py    # Notificaciones in-app
│   │   ├── beneficios.py        # Beneficios en comercios adheridos (validación por QR)
│   │   ├── faq.py               # FAQ público + CRUD admin de entradas
│   │   ├── webhooks_mercadopago.py
│   │   ├── admin_sponsors.py    # CRUD sponsors (admin)
│   │   ├── sponsors.py          # Lectura pública de sponsors (landing) — se importa `as sponsors_publico`
│   │   ├── transmisiones.py     # Transmisiones PPV, sesiones protegidas, entradas invitados, player YouTube blindado, heartbeat
│   │   └── chatbot.py           # Asistente virtual "Camotito" (Gemini Flash + contexto de BD en vivo + fallback)
│   ├── mailer/
│   │   ├── registry.py                 # Catálogo de eventos de mail editables (asunto/cuerpo)
│   │   ├── plantillas.py               # Resuelve overrides de plantillas_mail vs. defaults
│   │   ├── services/email_service.py   # Envío vía Resend
│   │   ├── services/email_tasks.py     # Funciones de alto nivel por evento
│   │   └── templates/email/            # Templates HTML con Jinja2 (+ _editable.html, wrapper de overrides)
│   └── utils/
│       ├── s3.py        # upload_file_to_s3(), delete_file_from_s3(), presigned URLs, bucket público de sponsors
│       ├── audit.py     # registrar_audit() — wrapper para AuditLog
│       ├── recordatorios.py  # Plantilla del recordatorio de cuota, deep link wa.me, morosos
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
│       │   ├── ModalAccesosTransmision.jsx # Gestión de accesos PPV, emisión manual (no-socios/morosos), WhatsApp, transferencias
│       │   ├── ChatbotFlotante.jsx      # Widget flotante del asistente "Camotito" con IA, quick chips y responsive
│       │   ├── RutaPrivada.jsx          # Wrapper de rutas protegidas (chequea auth + roles)
│       │   ├── landing/                 # Bloques de la landing pública
│       │   └── admin/                   # MetricCard, CategoriaOrdenBadge, FaqBlock, SponsorsBlock
│       ├── hooks/
│       │   ├── useAdminResource.js      # Fetch genérico con loading/error/data
│       │   ├── useEscanerCache.js       # Caché local del padrón para el escáner offline
│       │   ├── useExportarConvocatoria.js  # PDF de lista de convocados (jsPDF dinámico)
│       │   └── useExportarAsistencias.js   # Export asistencias
│       └── pages/               # Una página por ruta (incluye TransmisionEnVivo.jsx)
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
GEMINI_API_KEY=...                 # opcional: activa respuestas conversacionales con IA en el chatbot (tier gratuito: 15 req/min)
GEMINI_MODEL=gemini-2.5-flash      # modelo de Gemini por defecto
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
| `/en-vivo` y `/en-vivo/:idEvento` | Transmisión en vivo PPV (partido actual o específico, con player blindado o paywall) |

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

### Admin
| Ruta | Página | Roles permitidos |
|------|--------|------------------|
| `/admin` | Panel ejecutivo: métricas, pendientes, accesos rápidos | `admin_general` |
| `/admin/estadisticas` | Estadísticas y reportes ejecutivos | `admin_general` |
| `/admin/solicitudes` | Aprobar/rechazar solicitudes de alta | `admin_general` |
| `/admin/verificaciones` | Bandeja de comprobantes pendientes (`?tipo=cuota\|compra\|alquiler`) | `admin_general` |
| `/admin/pagos`, `/admin/tienda`, `/admin/alquileres` | Redirects a `/admin/verificaciones?tipo=...` | `admin_general` |
| `/admin/socios` | CRUD socios, filtros, roles, beca, saldo | `admin_general`, `personal_administrativo` |
| `/admin/reservas` | Agenda de canchas y quincho | `admin_general`, `personal_administrativo` |
| `/admin/productos` | CRUD catálogo (productos, comercios, sponsors, FAQ) | `admin_general`, `personal_administrativo` |
| `/admin/mensajeria` | Plantillas de mail + recordatorio de cuota por WhatsApp | `admin_general` |
| `/admin/comercios` | Redirect a `/admin/productos` | `admin_general`, `personal_administrativo` |
| `/admin/auditoria` | Historial de acciones (audit_log) | `admin_general`, `personal_administrativo` |
| `/admin/escaner` | Escáner QR general (portero) | `admin_general`, `personal_administrativo`, `admin_temporal` |
| `/admin/escaner-evento` | Escáner QR para eventos deportivos | `admin_general`, `personal_administrativo`, `admin_temporal` |
| `/admin/escaner-canchas` | Escáner QR para reintegro en canchas | `admin_general`, `personal_administrativo`, `admin_temporal` |

---

## Escáner de la puerta — modo offline

La puerta del club tiene mala señal, así que `/admin/escaner` funciona sin red.

- **Caché local:** `localStorage['escaner_cache']` = `{ timestamp, generado_at, socios[] }`.
  Se refresca **cada 15 minutos** mientras haya conexión, y también al dispararse el
  evento `online` del navegador. La lógica vive en `frontend/src/hooks/useEscanerCache.js`
  (`setInterval`, **no** Service Worker — decisión explícita: más fácil de debuggear).
- **Endpoint:** `GET /admin/escaner/cache` (router `router_admin_escaner` en
  `backend/routers/qr_auth.py`, registrado aparte en `main.py`). Devuelve el padrón
  activo (`fecha_baja IS NULL`) con el estado de puerta **ya resuelto por socio** —
  la misma forma que `UsuarioQRValidacionResponse` más el `dni`. Se hace así para no
  reimplementar la regla de morosidad en JavaScript.
- **Roles:** `admin_general`, `personal_administrativo`, `admin_temporal`. **No** `invitado`
  (es un volcado del padrón entero; misma razón por la que el comercio adherido no puede
  usar `/qr/validar-dni`).
- **No escribe en `audit_log`** — se llamaría cientos de veces por día y taparía
  `/admin/auditoria`. Cada validación real se sigue registrando.
- ⚠️ **Sin conexión el QR no se valida.** `qr_token` no se cachea: rota cada vez que el
  socio abre su pantalla de QR (una copia estaría vencida casi siempre) y sería guardar
  300 credenciales en el teléfono del portero. Offline el camino es **DNI manual**, y la
  pantalla lo dice.
- **Timeouts:** 3 s para la validación en vivo antes de caer a la caché; 60 s para el
  refresco del padrón (tolera el cold start de Render).
- El banner de conexión arriba del escáner tiene cuatro estados: verde (en línea),
  ámbar (caché < 2 h), rojo (caché > 2 h) y gris (sin caché).
- **La sesión sobrevive a una recarga sin señal.** `AuthContext` guarda el perfil
  en `localStorage['car_user_profile']` y solo cierra sesión ante un 401/403
  explícito de `/usuarios/me` — un fallo de red o un 502 del cold start de
  Render ya no desloguean a nadie. Sin esto el modo offline servía únicamente
  mientras la pestaña siguiera abierta, y en un celular el navegador la descarta
  al bloquear la pantalla.

## Recordatorio de cuota — WhatsApp

Se le avisa al socio moroso **uno por uno, por WhatsApp**, con la plantilla
editable que vive en `configuracion_global`. El motor está en
`backend/utils/recordatorios.py` — si alguna vez hay que cambiar cómo se arma
el mensaje, es el único archivo que se toca.

⚠️ **El aviso masivo por mail se sacó de la UI (2026-09-19).** Resend limita a
100 mails/día en el plan gratuito y un solo disparo del broadcast lo agotó: el
botón se quedó cargando, se canceló a mitad de camino y llegó el aviso de
límite alcanzado. El endpoint sigue existiendo pero **ya no hay nada en el
frontend que lo llame**. Antes de reponer cualquier envío masivo hay que
resolver el límite de mail de fondo (plan pago o cola con throttling), porque
el mismo techo lo va a chocar un fin de semana de partido con muchas compras.

- **Plantilla:** `configuracion_global.plantilla_recordatorio` (NULL = usar
  `PLANTILLA_DEFAULT` del código, así el texto de fábrica se puede corregir en
  un deploy y no queda congelado en una fila). Variables: `{nombre}` `{meses}`
  `{mes}` `{monto}` `{alias}` `{link_pago}`. `{mes}` es el período adeudado
  **más viejo**, no el mes en curso, y va **sin el año** ("septiembre"); la
  ambigüedad de una deuda de más de 12 meses la cubre `{meses}`, que es la
  cantidad de cuotas adeudadas. `{monto}` omite los centavos cuando son cero
  (`$5.000`), y los muestra si son reales. `{link_pago}` es
  `FRONTEND_URL/socio/cuotas`. Se exige que la plantilla incluya `{mes}` y
  `{monto}` — ojo que `{mes}` y `{meses}` son variables distintas y la
  validación no detecta que se haya puesto una por la otra.
- **Alias del club:** `configuracion_global.alias_transferencia`. Se edita en
  la misma pantalla (`/admin/mensajeria`, panel "Recordatorio de cuota") junto
  con la plantilla y una vista previa con datos de ejemplo. El endpoint sigue
  colgando de `/admin/productos/...` (ahí nació), pero la UI se mudó.
- **Número de WhatsApp del club:** `configuracion_global.whatsapp_club`, en el
  mismo panel. Es **informativo y nada más**: no se interpola en la plantilla,
  no interviene en el deep link y ninguna lógica del servidor lo lee. `wa.me`
  abre la sesión de WhatsApp del dispositivo desde el que se hace click — no
  hay forma de elegir el remitente. Existe porque en la secretaría hay varios
  celulares y hace falta saber cuál se usa. Se guarda tal cual se escribe, sin
  pasar por `normalizar_telefono_ar()`.
- **Endpoints:**
  - `GET|PATCH /admin/productos/configuracion/recordatorio` (PATCH solo
    `admin_general`, como el resto de la config global).
  - `GET /admin/usuarios/{id}/whatsapp-recordatorio` → devuelve el deep link
    `wa.me`. **No manda nada y no escribe en `audit_log`**: pedir el link no es
    haberlo usado. Va en `/admin/usuarios` porque ese es el prefijo del router;
    `/admin/socios` es la ruta del frontend.
  - `POST /admin/cuotas/aviso-mail-masivo` (router `router_admin_cuotas` en
    `socio_cuotas.py`, registrado aparte en `main.py`). **Huérfano desde el
    2026-09-19**: sigue vivo pero ningún componente del frontend lo llama (ver
    el aviso de arriba). Escribe en `audit_log` (`AVISO_MAIL_MASIVO_CUOTA`).
    Destinatarios: morosos activos sin beca vigente, con email, y **sin** una
    orden de cuota en `pendiente_verificacion` — esos ya pagaron y esperan al
    admin (BUG-02).
- **Teléfonos:** `normalizar_telefono_ar()` convierte lo que haya cargado
  (`02355 15 123456`, `+54 9 …`, `(2355) 15-…`) al formato `549XXXXXXXXXX` que
  pide `wa.me`. Si no llega a 10 dígitos nacionales devuelve None y el endpoint
  responde 409 en vez de armar un link roto.
- **Plantilla ≠ `str.format()`:** el texto lo escribe el admin en un textarea,
  así que se renderiza con una regex sobre `{variable}`. Con `format()`, una
  llave suelta sería un 500 y `{0.__class__}` un agujero.

## Mensajería — plantillas de mail editables (`/admin/mensajeria`)

El admin puede reescribir el asunto (y a veces el cuerpo) de los mails
transaccionales sin tocar código. Pantalla: `/admin/mensajeria`, que además
aloja el panel del recordatorio de cuota por WhatsApp.

- **Catálogo:** `backend/mailer/registry.py`. Una entrada por **evento**, no
  por archivo `.html`: `aviso_club_pago_recibido` y `aviso_club_efectivo`
  comparten `aviso_club_pago.html` con asuntos distintos. Son 24 eventos.
  Quedan afuera a propósito `recordatorio_cuota` (ya tiene su propio editor en
  `configuracion_global`) y `orden_generada` (función sin uso, BUG D5).
- **Overrides:** tabla `plantillas_mail` (`models.PlantillaMail`), una fila por
  clave con `asunto` y `cuerpo` nullables. **Sin fila, o con el campo en NULL,
  el mail usa el texto de fábrica del código** — el comportamiento por defecto
  es idéntico al de antes de esta función. Guardar cadena vacía borra el
  override (vuelve al default); no hay DELETE.
- **`editable_cuerpo`:** solo los templates que son **pura interpolación
  `{{ variable }}`**, sin `{% if %}` ni `{% for %}`. Los 5 con lógica real
  (`compra_confirmada` con su lista de ítems, `aviso_admin_jugador_categoria`
  con colores calculados en Python, `reserva_suspendida`,
  `bienvenida_alta_manual`, `solicitud_rechazada`) son **solo asunto**: un
  admin editando Jinja2 a mano puede romper la sintaxis sin darse cuenta y ese
  mail deja de mandarse **en silencio** (`email_tasks.py` loguea y sigue, no
  revienta el request que lo disparó).
- **Cómo se renderiza un override:** con la misma regex sobre `{variable}` de
  `utils/recordatorios.renderizar_plantilla` — **nunca con Jinja2**. El HTML
  resultante se inserta en `_editable.html`, que extiende `base.html`, así el
  encabezado y el pie siguen siendo los de siempre. Por eso un placeholder mal
  escrito se ve tal cual en el mail en vez de tirar un error.
- **El cuerpo de fábrica que ve el editor** no está guardado en ningún lado: se
  deriva al vuelo del `.html` real (`mailer/plantillas.cuerpo_default`), que
  saca el `{% block content %}` y convierte `{{ var }}` → `{var}`. Así no hay
  una copia del texto que se desincronice del template.
- **Los asuntos ya no son f-strings** en `email_service.py`: viven en el
  registro como plantillas con `{variable}`. Cada `enviar_*` llama a
  `_enviar_evento(clave, destinatarios, contexto)`, que abre una sesión corta
  de DB para leer el override. Se hizo así para no cambiar la firma de ninguna
  función de envío ni de sus decenas de llamadores.
- **Permisos:** lectura `admin_general` + `personal_administrativo`, escritura
  solo `admin_general` (mismo criterio que el resto de la config del club).
  El PATCH escribe en `audit_log` (`EDITAR_PLANTILLA_MAIL`).

## Transmisiones en vivo (Streaming Pay-Per-View)

Permite al club emitir partidos en directo a través de la web oficial, monetizando mediante entradas virtuales para simpatizantes/no-socios sin cuenta obligatoria, protegiendo el acceso para socios al día, y controlando la concurrencia.

- **Modelo de datos unificado (`eventos` + `entradas_virtuales`):**
  - `Evento`: concentra fixture y configuración de streaming (`tiene_transmision`, `transmision_estado`, `transmision_plataforma`, `transmision_video_id`, `transmision_precio`, `transmision_socio_gratis`, `transmision_es_publica`, más fixture: `rival`, `condicion`, `goles_local`, `goles_rival`).
  - `EntradaVirtual`: soporta tanto a socios (`id_usuario`) como a simpatizantes sin cuenta (`email_invitado` + `ticket_token` criptográfico único).
  - Migraciones: `e7b8c9d0f1a2_partidos_fixture_y_transmisiones.py` y `bc78e9102a34_entradas_virtuales_invitados.py`.
- **"Player Blindado" para YouTube Oculto (Costo $0):**
  - Diseñado para emitir videos Unlisted de YouTube sin costo de servidores ni CDN.
  - Máscara invisible superior que bloquea clics en el título, logo de canal, avatar y botones de "Compartir" / "Mirar en YouTube".
  - Máscara inferior que bloquea el logo/watermark de YouTube.
  - Bloqueo de click derecho (`onContextMenu`) para evitar copiar la URL del video.
  - Botón nativo de pantalla completa (API Fullscreen HTML5) y controles de Play/Pausa/Volumen operativos.
  - Desacoplado: listo para alternar a Vimeo o a streaming directo HLS / OBS (Cloudflare Stream o Mux) cambiando la plataforma.
- **Control de concurrencia de 1 espectador (Anti-compartir cuenta):**
  - Al abrir el reproductor, el backend genera un `token_sesion` único.
  - El frontend emite un heartbeat cada 30 segundos (`POST /transmisiones/{id_evento}/heartbeat`).
  - Si un usuario o invitado abre el enlace en otro dispositivo o lo comparte, la nueva conexión adquiere el control y la pestaña anterior recibe un `409 Conflict`, pausando el reproductor al instante e informando que la sesión se abrió en otro lugar.
- **Entradas para no-socios sin registro:**
  - El hincha no necesita crearse cuenta ni recordar contraseñas: solo ingresa su email al pagar.
  - Recibe un Magic Link (`/en-vivo/:id?ticket=XYZ`) que se almacena automáticamente en `localStorage['car_ticket_<id>']`. Si refresca la página (F5) o cierra el navegador, no pierde el acceso ni se le pide pagar de nuevo.
- **Panel de control de accesos (`ModalAccesosTransmision.jsx`):**
  - Integrado en `TecnicoEventos.jsx` con el botón `[🎟️ Accesos]` en la tarjeta de cada partido con streaming.
  - **Emisión a No-Socios:** Ingreso de email + opcional nombre y teléfono. Emite el ticket y genera botón directo **"Enviar por WhatsApp"** (`wa.me`) con mensaje pre-redactado.
  - **Emisión a Socios Morosos:** Buscador en vivo de socios (`GET /transmisiones/buscar-usuarios`), badge indicativo de morosidad, desbloqueo inmediato del reproductor para su cuenta sin condonar ni alterar su deuda de cuota social, más botón de WhatsApp.
  - **Aprobación de Transferencias:** Listado de espectadores con filtro por transferencias pendientes y botón `[✓ Aprobar Pago]` en 1 clic.
  - **Control de Stream en vivo:** Switcher para alternar estado (`programada`, `en_vivo`, `pausada`, `finalizada`) y métricas en tiempo real (espectadores online, entradas vendidas, recaudación).

## Asistente Virtual IA ("Camote" / Chatbot)

Asistente inteligente flotante integrado en la web (`ChatbotFlotante.jsx`), diseñado para responder consultas frecuentes de socios, hinchas y simpatizantes de manera instantánea, sobria y clara.

- **Backend y Endpoints (`backend/routers/chatbot.py`):**
  - `GET /chatbot/info-inicial`: Retorna sugerencias rápidas, datos resumidos del club (próximo partido, alias, valor de cuota, WhatsApp).
  - `POST /chatbot/mensaje`: Recibe `{ mensaje, historial }`, inyecta contexto en vivo desde la base de datos de Neon y consulta a Gemini Flash (`gemini-3.6-flash`).
- **Contexto dinámico inyectado en vivo:**
  - **Configuración del club:** alias de transferencias, valor de cuota base, día de vencimiento, WhatsApp oficial (`ConfiguracionGlobal`).
  - **Fixture y Streaming:** próximo partido programado, rival, fecha, hora, condición y si tiene transmisión online activa (`Evento`).
  - **Preguntas Frecuentes:** listado completo de preguntas y respuestas vigentes (`FaqEntry`).
  - **Comercios adheridos:** lista de negocios y beneficios activos para socios (`ComercioAsociado`).
- **Modo Fallback Resiliente (Costo $0 y sin clave):**
  - Si `GEMINI_API_KEY` no está configurada o si la API de Gemini no responde / agota cuota, el backend conmuta de forma automática e imperceptible a un motor de reglas y búsqueda de FAQs por palabras clave. **Nunca arroja error 500.**
- **Frontend y UX (`ChatbotFlotante.jsx` montado en `App.jsx`):**
  - Botón flotante inferior derecho con badge "Online".
  - Avatar oficial con el logo del Camotí (`camoti-azul.PNG`), sin emojis ni globos.
  - Cero emojis en toda la interfaz y respuestas.
  - Enlaces con nombres amigables (ej. "Ver transmisión en vivo", "Consultar cuotas y pagos") estilizados como botones interactivos en lugar de rutas técnicas con barras.
  - Popover modal responsive: ventana flotante estilizada en desktop y modal cómodo adaptado en pantallas móviles (< 640px).
  - **Botones rápidos de 1 toque (quick chips):**
    - Próximo partido y stream
    - Cuota social y alias
    - Alquiler de canchas y quincho
    - Cómo hacerme socio
    - Contactar por WhatsApp con Secretaría
  - Persistencia del hilo en `sessionStorage` (el hincha puede navegar entre páginas del club sin perder su conversación).

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
| `cerrar_eventos_vencidos` | cada 5 min | Cierra eventos deportivos pasados |
| `expirar_ordenes_vencidas` | cada 1 h | Expira órdenes por `expira_at` |
| `recordatorio_comprobante_pendiente` | cada 1 h | Mail recordatorio a socios con orden pendiente |
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

⚠️ **El asunto y (en la mayoría) el cuerpo se pueden editar desde
`/admin/mensajeria`** — ver esa sección. Los textos de acá son los de fábrica:
si en producción un mail dice otra cosa, buscar primero un override en
`plantillas_mail`.

⚠️ **Límite de Resend: 100 mails/día en el plan gratuito** (3000/mes). Es el
techo real del sistema, no una estimación: ya se alcanzó una vez y por eso se
sacó el aviso masivo de cuota. Cualquier función nueva que mande mails en
lote tiene que contar contra ese límite.

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
| Transmisiones en vivo (PPV) | ✅ Implementado | Streaming YouTube blindado, fixture, entradas invitados, concurrencia=1, panel accesos y WhatsApp |
| Tienda | 🔲 Sin testear | |
| Escáneres | 🔲 Sin testear | |
| Módulo deportivo | 🔲 Sin testear | |
| Personal administrativo | 🔲 Sin testear | |
| Comercios / Sponsors | 🔲 Sin testear | |

---

## Bugs conocidos

Estado verificado el 2026-09-06 (ver `docs/auditoria-2026-09-06.md`).

⚠️ Esta tabla cubre solo la auditoría del 06-09. El QA manual vive en dos documentos:

- **`docs/qa-manual-2026-09-16.md`** — el **vivo**. Se actualiza ronda a ronda; acá van
  los casos pendientes y los hallazgos nuevos.
- **`docs/qa-manual-2026-09-08.md`** — **cerrado el 16-09**, no se toca más. Es el
  registro de las rondas 1 a 13 y el lugar donde vive el **diagnóstico**: una ficha por
  bug (BUG-01…BUG-27) con su causa raíz. Antes de diagnosticar cualquier bug de cuotas,
  pagos, mails o roles, leer la ficha correspondiente ahí — varias tienen causas raíz
  que costaron 2-3 rondas encontrar.

| # | Bug | Estado |
|---|-----|--------|
| 1 | **Cuotas — pagar N meses acredita N-1** | ✅ **Resuelto y con test.** El pago manual y la aprobación comparten `utils/cuotas_periodos.calcular_nuevo_mes_cubierto`, que parte de `mes_cubierto_hasta` (no del mes en curso). Regresión cubierta en `scripts/qa_seguridad.py` por los dos caminos. |
| 2 | Socio figura moroso al agregar al carrito | ✅ **Resuelto (UI).** El backend está bien: hasta la aprobación el socio sigue debiendo. Ahora `SocioInicio` y `SocioCuotas` muestran **"Pago en verificación"** cuando hay orden pendiente. El QR sigue inhabilitado (la puerta debe denegar), pero explicado. |
| 3 | Pago duplicado al elegir efectivo | ✅ **Resuelto.** Era doble submit: `setIsConfirming` es state de React (asincrónico), el doble clic entraba dos veces antes de que el `disabled` llegara al DOM. Guarda con `useRef` en checkout, pago manual, aprobar/rechazar y suspender. |
| 4 | Redirect post-login a `/admin/auditoria` | ✅ **Resuelto.** `Login.jsx` solo honra `?next=/admin/...` si la cuenta es admin, y ahora usa `homePorRol()` — el mismo mapa que `RequireRole`, así no hay doble redirect para técnicos/porteros/staff. |
| 5 | 405 en el cambio de contraseña obligatorio | ✅ **No reproducible.** Front y back usan `POST /usuarios/me/password`. Además el flujo se rehizo entero (devuelve token nuevo, ver abajo). |
| 6 | Badge de notificaciones sin leer no aparece | ✅ **Resuelto.** Era el momento del refresco: solo recontaba al montar y al cambiar de ruta, pero las notificaciones las crea el backend por acciones de terceros. Ahora hay polling cada 60 s (con la pestaña visible) + refresco al volver a la pestaña. |
| 7 | Links de los mails rotos | ⚙️ **Configuración, no código.** `FRONTEND_URL` debe estar en Render; si falta, cae a `localhost:5173`. |
| 8 | Alta manual genera socio moroso | ✅ Resuelto (historial 19/08). |
| 9 | URL de foto de perfil local en vez de S3 | ✅ **Resuelto en el origen.** `subir_foto_perfil` guarda el key de S3. Quedan filas viejas con ruta local; `resolverFotoUrl()` sigue como red. ⚠️ Desde el fix M10 solo se sirve `/uploads/fotos_perfil` (los comprobantes ya no se exponen). |

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

# ── Base NUEVA (vacía) ──────────────────────────────────────────────────────
# NO usar `alembic upgrade head`: la cadena no es replayable desde cero
# (ver el aviso en Stack → Migraciones). bootstrap_db crea el schema desde
# models.py, hace stamp en head y siembra roles + config + cuota + usuario
# "sistema". Se niega a correr contra Neon/Render salvo --permitir-remoto.
python -m scripts.bootstrap_db
# Falta crear el primer admin_general a mano (el endpoint de roles lo protege).

# ── Base EXISTENTE (dev o producción) ───────────────────────────────────────
alembic upgrade head                       # acá sí: aplica lo que falte

uvicorn main:app --reload --port 8000
```

### Suite de regresión de seguridad
Cubre los hallazgos de `docs/auditoria-2026-09-06.md` (29 escenarios: permisos,
stock, saldo concurrente, primer ingreso, rate limit, webhook MP).
**Nunca contra producción** — crea usuarios y órdenes.
```bash
docker exec car_postgres_db psql -U admin_car -d postgres -c "CREATE DATABASE car_test;"
export QA_DB='postgresql://admin_car:password123@localhost:5432/car_test'
DATABASE_URL=$QA_DB python -m scripts.bootstrap_db
DATABASE_URL=$QA_DB python -m scripts.seed_qa
DATABASE_URL=$QA_DB MP_WEBHOOK_SECRET=testsecret123 uvicorn main:app --port 8010 &
QA_BASE=http://localhost:8010 python -m scripts.qa_seguridad     # --keep para no limpiar
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
| Streaming en vivo (PPV) | YouTube Oculto (actual) / Amazon IVS (Etapa 2) | Costo variable (~USD 6/partido) | clubatleticoroberts1@gmail.com (AWS) |
| Mail transaccional | Resend | Gratuito | — |
| Dominio | Namecheap → CloudFront | ~USD 12/año | clubatleticoroberts1@gmail.com |

**Documentación técnica reciente:**
- `docs/infraestructura.md`: Separación de branches Neon (`main` y `dev`), deploys dev/prod y helper de migraciones.
- `docs/propuesta-streaming-ivs.md`: Propuesta de transmisión segura con Amazon IVS (Revisión V2: Playback Authorization JWT ECDSA, costos reales por espectador-hora, prueba previa de uplink 4G y salvaguardas).
- `docs/qa-manual-2026-09-16.md`: Guía de QA exhaustiva para Streaming PPV (§I), Asistente Virtual Camotito (§J), Tour Guiado Interactivo (§K) y sesiones automatizadas de Pre-QA (56 tests) y QA Extendido (69 tests).
- `backend/scripts/extended_qa_test.py`: Suite de 69 tests automatizados que valida Neon en vivo, RBAC, cuotas, WhatsApp, escáner, reservas, streaming y chatbot antes del QA manual.

**Pendiente antes del MVP:**
- Rotar todas las claves (AWS, MP, Resend, `SECRET_KEY`, password de Neon) — ver "Secretos filtrados en el historial de git". Idealmente también limpiar el historial (`git filter-repo`) o asumir que quedan expuestas y rotar.
- Configurar UptimeRobot apuntando a `/health` (además de las alertas de caída, evita que Render duerma el proceso del free tier por inactividad y con eso reactiva el scheduler — sin esto los jobs no corren de noche).
- Correr el `UPDATE` manual de limpieza de D3 (pagos zombis) documentado en `docs/auditoria-2026-09-06.md`, una vez confirmado que el scheduler está vivo. Las ~45 filas viejas no se arreglan solas (sus órdenes ya están expiradas, el job no las vuelve a mirar).
- Confirmar que las 11 pre-reservas huérfanas de D2 (`reservas_instalaciones` en `bloqueada` con `id_orden = NULL`) se liberen solas una vez que el scheduler esté corriendo — `expirar_ordenes_vencidas` ya llama a `liberar_pre_reservas_expiradas()`. Si no se liberan en la primera corrida, revisar ese camino.
- Agregar `tzdata` a `requirements.txt` — en Render (Linux) da igual, pero en Windows (entorno de dev) `utils/fechas.py` revienta al importar con `ZoneInfoNotFoundError` porque no hay tz database del sistema.
- Confirmar `FRONTEND_URL` en Render (debe ser `https://www.clubatleticoroberts.com`). Si falta, todos los links de los mails caen a `localhost:5173` (bug conocido #7).
- Limpiar las 3 becas de prueba (`es_becado = true`: DNIs ficticios tipo `99999998`, "Pedro Perez (Becado)").
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
