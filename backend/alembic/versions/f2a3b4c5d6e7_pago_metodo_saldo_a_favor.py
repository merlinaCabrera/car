"""pago_metodo_saldo_a_favor

Cuando el socio paga el carrito ENTERO con su saldo a favor, checkout_carrito
crea el Pago con metodo_pago='saldo_a_favor' (y lo auto-aprueba). Pero el
CHECK chk_pago_metodo solo permitía 'efectivo' | 'transferencia' |
'mercado_pago' → el INSERT del Pago violaba la constraint y el checkout tiraba
500. Esta migración agrega 'saldo_a_favor' al set permitido.

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-09-06 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, Sequence[str], None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('chk_pago_metodo', 'pagos', type_='check')
    op.create_check_constraint(
        'chk_pago_metodo', 'pagos',
        "metodo_pago IN ('efectivo', 'transferencia', 'mercado_pago', 'saldo_a_favor')",
    )


def downgrade() -> None:
    op.drop_constraint('chk_pago_metodo', 'pagos', type_='check')
    op.create_check_constraint(
        'chk_pago_metodo', 'pagos',
        "metodo_pago IN ('efectivo', 'transferencia', 'mercado_pago')",
    )
