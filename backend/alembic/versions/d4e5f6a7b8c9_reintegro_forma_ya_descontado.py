"""reintegro_forma_ya_descontado

Agrega 'ya_descontado' al set de valores válidos de reintegros_qr.forma.

Contexto: el reintegro del 20% por alquiler de cancha pasa a resolverse
EN EL MOMENTO del escaneo en la puerta (AdminScannerCancha.jsx), no días
después por el Admin General. El admin_temporal que tiene el escáner
necesita poder decir, ahí mismo, una de estas 4 cosas:

  - 'efectivo'       → ya se le entregó el efectivo en mano.
  - 'transferencia'  → ya se le hizo la transferencia.
  - 'ya_descontado'  → NUEVO. El monto ya venía descontado del precio
                        cobrado al reservar (no hay nada más que hacer).
  - 'saldo_a_favor'  → se le acredita como cupón en su billetera interna.

'ya_descontado' es el único de los 4 que antes no existía como opción.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-08-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("chk_reintegro_forma", "reintegros_qr", type_="check")
    op.create_check_constraint(
        "chk_reintegro_forma",
        "reintegros_qr",
        "forma IN ('pendiente', 'saldo_a_favor', 'efectivo', 'transferencia', 'ya_descontado')",
    )


def downgrade() -> None:
    # Si hay filas con 'ya_descontado' cargadas, no se pueden bajar sin
    # decidir a qué las reconvertís — las paso a 'pendiente' para no dejar
    # el downgrade roto por violación de constraint.
    op.execute("UPDATE reintegros_qr SET forma = 'pendiente' WHERE forma = 'ya_descontado'")
    op.drop_constraint("chk_reintegro_forma", "reintegros_qr", type_="check")
    op.create_check_constraint(
        "chk_reintegro_forma",
        "reintegros_qr",
        "forma IN ('pendiente', 'saldo_a_favor', 'efectivo', 'transferencia')",
    )