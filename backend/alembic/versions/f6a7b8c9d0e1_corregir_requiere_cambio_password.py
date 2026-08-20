"""corregir_requiere_cambio_password_cuentas_existentes

La columna usuarios.requiere_cambio_password se agregó con
server_default=true, así que TODA cuenta que ya existía antes de que se
implementara el chequeo en el frontend (RutaPrivada) quedó marcada como
"necesita cambiar contraseña" sin que nadie lo haya puesto a propósito —
incluidas cuentas de admin creadas por script/seed, y cualquier socio que
ya viene usando su contraseña real desde hace tiempo.

Esta migración es un corte único: pone en false a todas las cuentas que
existen HASTA AHORA (ya tienen una contraseña que conocen y usan). De acá
en adelante, el flag solo se pone en true explícitamente al crear un socio
nuevo de forma manual con contraseña temporal (ver admin_usuarios.py).

No es perfectamente reversible (no hay forma de saber cuáles "deberían"
volver a true), así que el downgrade es un no-op documentado.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-08-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(text("""
        UPDATE usuarios
           SET requiere_cambio_password = false
         WHERE requiere_cambio_password = true;
    """))


def downgrade() -> None:
    # No-op intencional: no hay forma segura de saber qué cuentas "deberían"
    # volver a true (eso rompería el login de cualquiera que ya cambió su
    # contraseña con normalidad después de este corte).
    pass