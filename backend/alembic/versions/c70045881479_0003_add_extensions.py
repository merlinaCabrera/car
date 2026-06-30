"""0003_add_extensions

Revision ID: c70045881479
Revises: 188f9a5748c8
Create Date: 2026-06-29 19:18:46.413829

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision = 'c70045881479'
down_revision = '188f9a5748c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(text('CREATE EXTENSION IF NOT EXISTS "pgcrypto";'))
    op.execute(text('CREATE EXTENSION IF NOT EXISTS "unaccent";'))
def downgrade() -> None:
    # Nunca dropear extensiones en producción — pueden estar usadas por otros schemas
    pass
