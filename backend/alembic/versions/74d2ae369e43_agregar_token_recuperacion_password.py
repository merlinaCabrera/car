"""agregar token recuperacion password
Revision ID: 74d2ae369e43
Revises: e0851f0fdd20
Create Date: 2026-07-21 17:04:04.857443
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '74d2ae369e43'
down_revision: Union[str, Sequence[str], None] = 'e0851f0fdd20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("usuarios", sa.Column("token_recuperacion", sa.String(255), nullable=True))
    op.add_column("usuarios", sa.Column("token_recuperacion_expira", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("usuarios", "token_recuperacion_expira")
    op.drop_column("usuarios", "token_recuperacion")