---
description: Generar o aplicar una migración de Alembic, o armar una base nueva
---

Ayudame con una migración de base de datos. Primero decime qué caso es:

**A) Agregué/modifiqué un modelo en `models.py` y necesito migrar una base
que ya existe.** Generá con `alembic revision --autogenerate`, pero mostrame
el archivo generado antes de aplicarlo — no asumas que el diff es correcto,
sobre todo con `Mapped`/`mapped_column`. Aplicá contra staging primero.

**B) Necesito armar una base nueva desde cero** (local, staging nuevo, CI).
Usar `python -m scripts.bootstrap_db` — **nunca** `alembic upgrade head`
sobre una base vacía, porque la cadena de migraciones no es replayable desde
cero (falla en `90885e41b585_sincronizar_base_neon` con
`DuplicateTable: comercios_asociados`). Si necesito resetear una base
existente, usar `--reset`.

Recordatorio: el script se niega a correr contra un host de Neon/Render
salvo `--permitir-remoto` — no me sugieras bypassear esa guarda salvo que yo
lo pida explícitamente, y nunca contra producción.

Si no está claro contra qué entorno estamos corriendo esto, preguntame antes
de ejecutar nada.
