"""recordatorio_cuota_plantilla_y_alias

Agrega a configuracion_global los dos campos que necesita el recordatorio
de cuota (deep link de WhatsApp por socio y aviso masivo por mail):

  · alias_transferencia    → el alias/CBU del club, que el socio necesita
                             para transferir. Hasta ahora no vivía en
                             ningún lado del sistema.
  · plantilla_recordatorio → el texto editable del mensaje, con las
                             variables {nombre} {mes} {monto} {alias}
                             {link_pago}.

Ambos NULLABLE y sin server_default a propósito: NULL significa "nunca se
configuró". Para la plantilla eso equivale a usar PLANTILLA_DEFAULT de
utils/recordatorios.py, así el texto por defecto vive en el código (donde
se puede versionar y corregir) y no congelado en una fila de la base.

Revision ID: 936f90e4f1e0
Revises: f2a3b4c5d6e7
Create Date: 2026-09-15 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '936f90e4f1e0'
down_revision: Union[str, Sequence[str], None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'configuracion_global',
        sa.Column(
            'alias_transferencia', sa.String(length=100), nullable=True,
            comment=(
                'Alias/CBU de la cuenta del club. Se interpola como {alias} '
                'en la plantilla del recordatorio de cuota.'
            ),
        ),
    )
    op.add_column(
        'configuracion_global',
        sa.Column(
            'plantilla_recordatorio', sa.Text(), nullable=True,
            comment=(
                'Texto editable del recordatorio de cuota, con las variables '
                '{nombre} {mes} {monto} {alias} {link_pago}. NULL = usar la '
                'plantilla por defecto de utils/recordatorios.py.'
            ),
        ),
    )


def downgrade() -> None:
    op.drop_column('configuracion_global', 'plantilla_recordatorio')
    op.drop_column('configuracion_global', 'alias_transferencia')
