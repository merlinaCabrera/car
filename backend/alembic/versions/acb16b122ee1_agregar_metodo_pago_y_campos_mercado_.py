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
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
