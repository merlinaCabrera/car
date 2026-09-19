"""agregar transmision_precio_moroso a eventos

Revision ID: 098123f41c8b
Revises: bc78e9102a34
Create Date: 2026-09-19 00:03:12.480814

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '098123f41c8b'
down_revision: Union[str, Sequence[str], None] = 'bc78e9102a34'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'eventos',
        sa.Column(
            'transmision_precio_moroso',
            sa.Numeric(precision=10, scale=2),
            nullable=True,
            comment='Precio de la entrada virtual para socios morosos. NULL = usar transmision_precio.',
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('eventos', 'transmision_precio_moroso')
