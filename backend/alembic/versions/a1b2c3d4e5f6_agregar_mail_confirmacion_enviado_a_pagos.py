"""agregar_mail_confirmacion_enviado_a_pagos

Soporta el mail único de "Compra confirmada" que se manda a nivel Pago (no
por Orden). Como un Pago puede tener varias Órdenes (cuota + tienda) que se
aprueban en momentos distintos (ej: el admin aprueba una y después la otra),
necesitamos una bandera para saber si ya se envió el resumen y no duplicarlo.

Revision ID: a1b2c3d4e5f6
Revises: f1a2b3c4d5e6
Create Date: 2026-08-04 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'pagos',
        sa.Column(
            'mail_confirmacion_enviado',
            sa.Boolean(),
            nullable=False,
            server_default=sa.text('false'),
        ),
    )


def downgrade() -> None:
    op.drop_column('pagos', 'mail_confirmacion_enviado')