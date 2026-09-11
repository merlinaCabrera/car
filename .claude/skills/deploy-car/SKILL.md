---
name: deploy-car
description: Usar cuando el usuario pida deployar, publicar cambios de frontend o backend a producción, o pregunte por el pipeline de CI/CD del proyecto CAR.
---

# Deploy — CAR (Club Atlético Roberts)

## Frontend (automatizado)

El deploy del frontend es automático vía GitHub Actions
(`.github/workflows/deploy.yml`), dispara con push a `main` que toque algo en
`frontend/**`:

1. `npm install` + `npm run build` (con `VITE_API_URL` desde secrets).
2. `aws s3 sync dist/ s3://clubatleticoroberts.com --delete`.
3. Invalidación de CloudFront (`aws cloudfront create-invalidation --paths "/*"`).

Para deployar frontend: **mergear a `main` alcanza**, no hace falta correr
nada a mano. Si se necesita forzar un deploy sin cambios de código (ej.
cambió una env var en secrets), hay que re-disparar el workflow manualmente
desde GitHub Actions o hacer un commit vacío que toque `frontend/**`.

Antes de mergear a `main`, correr el checklist de QA (ver skill `qa-release`)
— este pipeline no tiene ningún paso de testing automático antes del sync a S3.

## Backend (automatizado, pero fuera de este repo)

El backend lo deploya **Render con Auto-Deploy**: push a `main` y levanta solo,
sin ningún paso manual. Confirmado por la dueña del proyecto el 2026-09-11.

No hay workflow de CI/CD para el backend **en este repo** — por eso no se ve
nada en `.github/workflows/` —: la conexión es directa entre Render y GitHub,
configurada en el dashboard de Render.

Consecuencias prácticas:
- Un push a `main` que toque `backend/**` **ya es** un deploy a producción.
- El deploy tarda unos minutos, y en el free tier el primer request después
  puede pegarle a un proceso frío (40-60 s). Antes de testear, confirmar en el
  dashboard que el deploy terminó y que corresponde al commit esperado.
- Frontend y backend salen por caminos distintos y **no son atómicos**: si un
  cambio necesita los dos lados, durante unos minutos convive el frontend nuevo
  con el backend viejo.

Lo que sí se sabe con certeza del backend en runtime:
- Usa `DATABASE_URL` apuntando a Neon en producción.
- Variables de entorno leídas por fuera de `config.py`: `SECRET_KEY`,
  `AWS_*`, `RESEND_API_KEY`, `S3_BUCKET_*`, `MAIL_*` — confirmar que estén
  seteadas en el entorno de destino antes de cualquier deploy manual.
- Si se corrió una migración de Alembic nueva, aplicarla contra la base de
  producción es un paso aparte del deploy del código (ver skill `db-migration`).

## Checklist previo a cualquier deploy a producción
1. Correr QA en staging (skill `qa-release`).
2. Si hay migraciones nuevas: aplicarlas primero, y en el orden correcto según
   si el backend nuevo depende de columnas/tablas nuevas.
3. Confirmar que las env vars necesarias existen en destino (especialmente
   las que se leen con `os.getenv` fuera de `config.py`).
4. Frontend y backend: mergear a `main` dispara los dos solos (GitHub Actions
   y Render respectivamente). Verificar que ambos hayan terminado antes de
   testear — no salen al mismo tiempo.

## Qué NO hacer
- No decirle al usuario que el backend necesita un paso manual: sale con el push.
- No mergear a `main` sin haber corrido QA si el cambio toca flujos críticos.
- No aplicar migraciones directo contra producción sin haberlas probado en staging.
