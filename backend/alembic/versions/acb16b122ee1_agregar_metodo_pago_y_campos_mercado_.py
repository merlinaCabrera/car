"""agregar metodo_pago y campos mercado pago a pagos

Revision ID: acb16b122ee1
Revises: 74d2ae369e43
Create Date: 2026-07-22 03:46:04.789953

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'acb16b122ee1'
down_revision: Union[str, Sequence[str], None] = '74d2ae369e43'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "pagos",
        sa.Column(
            "metodo_pago",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'transferencia'"),
        ),
    )
    op.add_column(
        "pagos",
        sa.Column("mp_preference_id", sa.String(length=80), nullable=True),
    )
    op.add_column(
        "pagos",
        sa.Column("mp_payment_id", sa.String(length=80), nullable=True),
    )

    op.create_unique_constraint(
        "uq_pagos_mp_preference_id", "pagos", ["mp_preference_id"]
    )
    op.create_unique_constraint(
        "uq_pagos_mp_payment_id", "pagos", ["mp_payment_id"]
    )
    op.create_check_constraint(
        "chk_pago_metodo",
        "pagos",
        "metodo_pago IN ('efectivo', 'transferencia', 'mercado_pago')",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("chk_pago_metodo", "pagos", type_="check")
    op.drop_constraint("uq_pagos_mp_payment_id", "pagos", type_="unique")
    op.drop_constraint("uq_pagos_mp_preference_id", "pagos", type_="unique")
    op.drop_column("pagos", "mp_payment_id")
    op.drop_column("pagos", "mp_preference_id")
    op.drop_column("pagos", "metodo_pago")