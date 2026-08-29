"""crear_tabla_sponsors

Nueva tabla para los sponsors de la landing pública. Antes vivían
hardcodeados en el frontend (Sponsors.jsx); ahora el admin_general los
gestiona desde /admin/sponsors (imagen + link + orden + activo/inactivo).

imagen_key guarda el object key del bucket público car-sponsors-produccion
(no la URL completa) — la URL se arma en el momento vía utils/s3.py:
url_publica(). Igual criterio que se usa con comprobantes en el bucket
privado (se guarda el key, no una URL fija), para no tener que hacer
backfill en DB si algún día se pone CloudFront delante del bucket.

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-08-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b4c5d6e7f8a9'
down_revision: Union[str, Sequence[str], None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sponsors',
        sa.Column('id_sponsor', sa.Integer(), primary_key=True),
        sa.Column('nombre', sa.String(length=150), nullable=False),
        sa.Column('imagen_key', sa.Text(), nullable=False),
        sa.Column('url_destino', sa.Text(), nullable=False),
        sa.Column('orden', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('activo', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('creado_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_sponsors_orden', 'sponsors', ['orden'])


def downgrade() -> None:
    op.drop_index('ix_sponsors_orden', table_name='sponsors')
    op.drop_table('sponsors')