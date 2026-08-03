"""desactivar_rol_portero_cancha

El rol 'portero_cancha' quedó cargado directamente en la base (no viene de
ninguna migración previa) y hoy duplica funcionalmente a 'admin_temporal'
(que ya cubre el escaneo en la puerta de las canchas por evento). Se
desactiva en vez de borrarse: no rompe ninguna asignación existente en
usuario_roles, simplemente deja de ofrecerse como opción nueva en el
selector de roles del panel admin (que filtra por es_activo=true).

Revision ID: f1a2b3c4d5e6
Revises: acb16b122ee1
Create Date: 2026-08-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'acb16b122ee1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(text("""
        UPDATE roles
           SET es_activo = false
         WHERE nombre = 'portero_cancha';
    """))


def downgrade() -> None:
    op.execute(text("""
        UPDATE roles
           SET es_activo = true
         WHERE nombre = 'portero_cancha';
    """))