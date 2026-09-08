---
name: db-migration
description: Usar siempre que se agregue/modifique un modelo en backend/models.py, se necesite generar o aplicar una migración de Alembic, o se arme una base de datos nueva (local, staging, o entorno de test) para el proyecto CAR.
---

# Migraciones de base de datos — CAR (Alembic + Neon)

## Contexto crítico (no romper esto)

`models.py` es la fuente de verdad. La cadena de migraciones de Alembic **no es
replayable desde cero**: la revisión `90885e41b585_sincronizar_base_neon` se
autogeneró comparando `models.py` contra el estado que Neon tenía en ese
momento, y asume un schema de partida que las migraciones anteriores no
producen. Correrla sobre una base vacía falla con:

```
DuplicateTable: relation "comercios_asociados" already exists
```

Esa migración **es válida hacia adelante** desde el estado actual de
producción (que ya está por delante de ella). **No se toca, no se borra, no
se "arregla".** El problema no es un bug: es una consecuencia de cómo se armó
esa revisión, y tocarla rompería la cadena para producción.

## Flujo según el caso

### A) Agregando/modificando un modelo (caso normal, entorno ya existente)
1. Editar `models.py`.
2. Generar la migración: `alembic revision --autogenerate -m "descripción"`.
3. **Leer el archivo generado a mano** antes de aplicarlo — autogenerate en
   SQLAlchemy 2.x con `Mapped`/`mapped_column` a veces detecta cambios de tipo
   o de índice que no son intencionales. No asumir que el diff es correcto.
4. Aplicar con `alembic upgrade head` contra staging primero, nunca contra prod
   directamente.
5. Actualizar `ALEMBIC_HEAD` en `backend/scripts/bootstrap_db.py` si ese
   archivo lo referencia (ver comentario "actualizar al agregar migraciones").

### B) Armar una base nueva desde cero (local, staging nuevo, CI)
**Nunca usar `alembic upgrade head` sobre una base vacía** — va a fallar por
lo explicado arriba. Usar en cambio:

```bash
DATABASE_URL=postgresql://usuario:pass@host:5432/car_dev \
    python -m scripts.bootstrap_db
```

Esto crea el schema directo desde `models.py` y hace `stamp` de Alembic en
`head`, para que las migraciones futuras se apliquen con normalidad.

Para reiniciar completamente una base existente (borra todo el schema
`public`): agregar `--reset`.

**Guarda de seguridad ya incluida en el script:** se niega a correr contra un
host que contenga `neon.tech` o `render.com` salvo que se pase
`--permitir-remoto`. Respetar esa guarda — no sugerir bypassearla salvo pedido
explícito y consciente del usuario, y nunca contra producción.

### C) Dudas sobre qué entorno es cuál
Si no está claro si `DATABASE_URL` apunta a producción, staging o local,
**preguntar antes de correr cualquier comando de Alembic o de bootstrap.**

## Qué NO hacer
- No correr `alembic upgrade head` sobre una base vacía sin pasar antes por `bootstrap_db`.
- No modificar ni eliminar la revisión `90885e41b585_sincronizar_base_neon`.
- No correr `bootstrap_db --reset` contra nada que no sea explícitamente local/dev.
- No aplicar una migración autogenerada sin haberla leído.
