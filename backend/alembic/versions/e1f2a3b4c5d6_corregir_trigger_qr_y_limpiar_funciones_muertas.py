"""corregir_trigger_qr_y_limpiar_funciones_muertas

La migración anterior (d0e1f2a3b4c5) eliminó usuarios.deuda_historica_meses
pero se pasó por alto que había objetos SQL crudos (funciones/triggers de
Postgres, invisibles para el ORM) que también la referenciaban:

  1. fn_rotar_qr_token() — TRIGGER VIVO, dispara en cada UPDATE de usuarios.
     Comparaba OLD/NEW.deuda_historica_meses además de mes_cubierto_hasta
     para decidir si rotar el QR. Rompía CUALQUIER update a un usuario en
     producción (error real visto: 500 en GET /qr/token). Se corrige para
     comparar solo mes_cubierto_hasta — es la única señal real de cambio
     de estado financiero de todos modos.

  2. fn_validar_qr(UUID) — código MUERTO. El propio docstring de
     qr_auth.py dice explícitamente que se abandonó en favor de un port a
     Python (_calcular_estado_financiero), justamente para que esta regla
     no viva duplicada en dos lenguajes. Se elimina en vez de corregir.

  3. fn_aprobar_orden(...) — código MUERTO. Solo aparece mencionada en
     comentarios de models.py/socio_carrito.py como referencia histórica;
     la aprobación real de órdenes vive en utils/ordenes.py
     (procesar_aprobacion_orden), en Python. Se elimina.

  4. fn_actualizar_search_usuario() y fn_verificar_directivo() no tocan
     deuda_historica_meses — no se tocan.

Moraleja para el futuro: antes de dropear una columna, buscar también en
funciones/triggers/vistas de Postgres, no solo en el código Python — no
aparecen en ningún grep del repo porque viven como texto SQL crudo dentro
de migraciones de Alembic.

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-08-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, Sequence[str], None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Corregir el trigger vivo ─────────────────────────────────────────
    op.execute(text("""
        CREATE OR REPLACE FUNCTION fn_rotar_qr_token()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.mes_cubierto_hasta IS DISTINCT FROM NEW.mes_cubierto_hasta THEN
                NEW.qr_token       := gen_random_uuid();
                NEW.qr_generado_at := NOW();
            END IF;
            RETURN NEW;
        END;
        $$;
    """))

    # ── 2 y 3. Eliminar funciones muertas (sin trigger que las dispare;
    # nada en el código Python las invoca) ──────────────────────────────────
    op.execute(text("DROP FUNCTION IF EXISTS fn_validar_qr(UUID);"))
    op.execute(text("DROP FUNCTION IF EXISTS fn_aprobar_orden(INTEGER, INTEGER, TEXT);"))


def downgrade() -> None:
    # Revierte el trigger a su forma original (con deuda_historica_meses).
    # No se recrean fn_validar_qr ni fn_aprobar_orden en el downgrade:
    # ya estaban abandonadas antes de esta migración, no tiene sentido
    # revivirlas. Si hiciera falta, están en a0c06916cf98.
    op.execute(text("""
        CREATE OR REPLACE FUNCTION fn_rotar_qr_token()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.deuda_historica_meses IS DISTINCT FROM NEW.deuda_historica_meses
            OR OLD.mes_cubierto_hasta    IS DISTINCT FROM NEW.mes_cubierto_hasta THEN
                NEW.qr_token       := gen_random_uuid();
                NEW.qr_generado_at := NOW();
            END IF;
            RETURN NEW;
        END;
        $$;
    """))