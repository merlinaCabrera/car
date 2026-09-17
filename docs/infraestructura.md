# Infraestructura — Club Atlético Roberts

Documentación técnica de la infraestructura, entornos de base de datos en Neon, deploys dev/prod, checklist de entrega y operaciones de mantenimiento del sistema.

---

## Entorno de base de datos — branches de Neon

**Fecha:** 2026-09-17

Se configuró una separación de entornos en el proyecto Neon `quiet-tree-39982542` (`club-atletico-db`, región São Paulo):

**Antes:** una sola branch llamada `production`.

**Después:**

```
quiet-tree-39982542 (club-atletico-db)
├── main  (br-polished-bonus-acji2gdz)  ← producción / entrega al club
└── dev   (br-orange-fire-ac4be828)     ← desarrollo y QA de Merlina
```

- La branch `production` fue renombrada a `main`. Es la default del proyecto. Render apunta acá.
- La branch `dev` fue creada como copia exacta de `main` al momento `2026-09-17T00:27:33Z`. Contiene todos los datos de prueba actuales.

---

## Flujo de trabajo dev/prod

```
┌─────────────────────────────────────────────────────────┐
│  DESARROLLO / QA                                        │
│  Frontend: npm run dev (local)                          │
│  Backend:  Render  ←→  Neon branch dev                 │
│            (cambiar DATABASE_URL en panel de Render)    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  PRODUCCIÓN (entrega al club)                           │
│  Frontend: S3 + CloudFront                              │
│  Backend:  Render  ←→  Neon branch main                │
│            (DATABASE_URL apunta a main por defecto)     │
└─────────────────────────────────────────────────────────┘
```

Para cambiar entre entornos:
1. Entrar al panel de Render (`https://dashboard.render.com`).
2. Seleccionar el servicio del backend (`club-atletico-api`).
3. Ir a la pestaña **Environment**.
4. Cambiar `DATABASE_URL` según corresponda (dev o main).
5. Click en **Save Changes** (Render redeploya automáticamente).

> **Seguridad de credenciales:**
> - `main` connection string: obtenerlo desde el panel de Neon (no hardcodear en docs ni versionar en git).
> - `dev` connection string: ídem — no hardcodear en docs, solo en `.env` local.

---

## Flujo de migraciones con Alembic

### El día a día normal

1. **Modificación de modelos:** Hacés el cambio en el modelo (`backend/models.py` o scripts correspondientes).
2. **Generación del archivo de migración:**
   ```bash
   alembic revision --autogenerate -m "descripcion_del_cambio"
   ```
3. **Aplicar la migración contra dev:**
   ```bash
   # En Windows PowerShell:
   $env:DATABASE_URL="<dev>"; alembic upgrade head

   # O usando el helper:
   python -m scripts.migrate dev
   ```
4. **Pruebas en desarrollo:** Probás en el navegador contra dev (con Render o backend local apuntando a la branch dev).
5. **Commit sin push:** Todo ok → se realiza el commit local sin pushear (`git commit`).
6. **Push a repositorio:** Merlina pushea a GitHub cuando las pruebas son satisfactorias.
7. **Redeploy automático:** Render detecta el push en `main` y redeploya el backend automáticamente.
8. **Aplicar la migración contra main:**
   ```bash
   # Desde consola local o terminal:
   python -m scripts.migrate prod
   # (solicita confirmación explícita antes de ejecutar contra main)
   ```
9. **Verificación final:** Verificar que ambas branches queden en `head` y que el backend responda con normalidad.

### Configuración del helper de migraciones y Makefile

Para no tener que copiar ni pegar los connection strings a mano en cada migración, podés agregar en `backend/.env`:

```env
# En backend/.env (ignorado por git)
DATABASE_URL_DEV=postgresql://...dev...
DATABASE_URL_PROD=postgresql://...main...
```

*(Si `DATABASE_URL_DEV` no está especificado, el script toma automáticamente el valor de `DATABASE_URL`).*

#### Comandos disponibles:

- **Desde Windows PowerShell / Terminal:**
  - `python -m backend.scripts.migrate status` (o desde la carpeta `backend`: `python -m scripts.migrate status`) — Muestra la revisión actual en dev y prod.
  - `python -m backend.scripts.migrate dev` — Aplica migraciones pendientes en `dev`.
  - `python -m backend.scripts.migrate prod` — Aplica migraciones en `main`/`prod` con confirmación interactiva.
  - `python -m backend.scripts.migrate create "descripcion"` — Autogenera una nueva migración con Alembic.

- **Desde Linux / WSL / Git Bash (usando make):**
  - `make migrate-status`
  - `make migrate-dev`
  - `make migrate-prod`

---

## Checklist de entrega al club (cuando corresponda)

Antes de la entrega real al club, ejecutar en orden:

1. **DATABASE_URL en Render:** Asegurarse de que `DATABASE_URL` en Render apunta a `main`.
2. **Semilla limpia:** Correr `python -m scripts.bootstrap_db --permitir-remoto` contra `main` (truncate + semilla inicial de roles, usuario sistema y catálogo base).
3. **Rotación de credenciales:** Rotar `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` y `DATABASE_URL` de Neon (quedaron expuestos en el historial de git).
4. **Monitoreo UptimeRobot:** Configurar UptimeRobot contra `/health` (mantiene vivo el contenedor gratuito de Render para que no se duerma el scheduler de noche y notifica alertas).
5. **Verificación de CDN:** Verificar que S3 + CloudFront sirven el build de producción correcto.

---

## Decisiones pendientes / no tocadas hoy

- **Playwright + pytest para testing automatizado:** Aprobado en conversación, pendiente de implementar.
- **Split de contextos React (`AuthContext`, `CartContext`, `RequireRole`):** Completado en commit anterior.
- **`ReservaCalendar.jsx` borrado + chunk JS reducido:** Completado en commit anterior.
- **15 errores eslint:** Resueltos, eslint en cero.
