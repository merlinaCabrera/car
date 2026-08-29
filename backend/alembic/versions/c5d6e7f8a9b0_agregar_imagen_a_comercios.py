"""agregar_imagen_a_comercios

Los comercios asociados ahora pueden tener una foto (igual que los
sponsors), para mostrarse en la sección "Beneficios" de la landing
pública. Reusa el mismo bucket público car-sponsors-produccion, con
prefijo comercios/{id}/ en vez de sponsors/{id}/ — la bucket policy ya
permite GetObject sobre todo el bucket, no hace falta tocar AWS de nuevo.

imagen_key es nullable a propósito: un comercio puede seguir existiendo
sin foto (solo se usa para el escáner de beneficios internamente), y
simplemente no aparece en la landing hasta que se le cargue una.

Revision ID: c5d6e7f8a9b0
Revises: b4c5d6e7f8a9
Create Date: 2026-08-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, Sequence[str], None] = 'b4c5d6e7f8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'comercios_asociados',
        sa.Column('imagen_key', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('comercios_asociados', 'imagen_key')