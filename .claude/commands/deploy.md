---
description: Deployar cambios de CAR (frontend y/o backend) a producción
---

Ayudame a deployar. Antes de nada, confirmá qué se está deployando: frontend,
backend, o ambos, y si ya se corrió `/qa` sobre estos cambios.

**Frontend:** se deploya solo con mergear a `main` (GitHub Actions:
`.github/workflows/deploy.yml` → build → S3 sync → invalidación de
CloudFront). Si hace falta forzarlo sin cambios de código nuevos, re-disparar
el workflow manualmente o hacer un commit vacío que toque `frontend/**`.

**Backend:** no hay pipeline automatizado en este repo. Preguntame a mí cómo
lo estoy deployando actualmente antes de asumir nada — no está documentado
en el código.

Si hay migraciones de Alembic nuevas de por medio, avisame que hay que
aplicarlas aparte (ver `/migrate`) y en qué orden respecto al deploy del
código.

Antes de terminar, dame un checklist corto de lo que falta confirmar: QA
corrido, env vars necesarias en destino, migraciones aplicadas si corresponde.
