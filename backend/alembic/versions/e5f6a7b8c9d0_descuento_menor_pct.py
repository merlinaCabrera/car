"""descuento_menor_pct

Agrega configuracion_global.descuento_menor_pct — el porcentaje de
descuento en la cuota social para socios menores de 18 años, que hasta
ahora estaba HARDCODEADO como Decimal("0.40") en dos archivos distintos
(routers/socio_cuotas.py y routers/admin_pagos.py), cada uno con su propia
constante DESCUENTO_MENOR desincronizable.

server_default='40' preserva el comportamiento actual (40%) para todas las
filas existentes — nadie ve cambiar su cuota por aplicar esta migración.

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-08-07 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'configuracion_global',
        sa.Column(
            'descuento_menor_pct', sa.Numeric(precision=5, scale=2),
            nullable=False, server_default=sa.text('40'),
            comment=(
                'Porcentaje (0-100) de descuento en la cuota social para '
                'socios menores de 18 años.'
            ),
        ),
    )


def downgrade() -> None:
    op.drop_column('configuracion_global', 'descuento_menor_pct')