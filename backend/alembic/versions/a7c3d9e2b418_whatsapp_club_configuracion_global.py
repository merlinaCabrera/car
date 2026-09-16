"""whatsapp_club_configuracion_global

Agrega `configuracion_global.whatsapp_club`: el número de WhatsApp desde el
que la secretaría manda los recordatorios de cuota.

Es un campo puramente informativo. NO entra en la plantilla del mensaje, no
es el remitente del deep link (`wa.me` abre la sesión que el operador ya
tenga en su dispositivo) y ningún camino del servidor lo lee. Existe porque
en la secretaría del club hay varios celulares y hace falta un lugar donde
quede escrito cuál es el que se usa para esto.

NULLABLE y sin server_default, igual que los otros dos campos del
recordatorio: NULL significa "nunca se configuró".

Revision ID: a7c3d9e2b418
Revises: 936f90e4f1e0
Create Date: 2026-09-16 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a7c3d9e2b418'
down_revision: Union[str, Sequence[str], None] = '936f90e4f1e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'configuracion_global',
        sa.Column(
            'whatsapp_club', sa.String(length=30), nullable=True,
            comment=(
                'Número de WhatsApp desde el que la secretaría manda los '
                'recordatorios. Informativo: no se interpola en la plantilla '
                'ni lo lee ninguna lógica del servidor.'
            ),
        ),
    )


def downgrade() -> None:
    op.drop_column('configuracion_global', 'whatsapp_club')
