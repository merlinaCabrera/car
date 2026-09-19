"""plantillas_mail_editables

Revision ID: 57da35c780d5
Revises: 098123f41c8b
Create Date: 2026-09-19 00:46:25.257145

Tabla de overrides del asunto/cuerpo de los mails transaccionales, editables
desde /admin/mensajeria. No se siembra ninguna fila: sin fila (o con los dos
campos en NULL) el mail usa el texto de fábrica del código.

NOTA: el autogenerate arrastró además ~30 operaciones que NO son de este
cambio — comments desincronizados entre models.py y Neon, índices con
`DESC` que Alembic compara mal y los vuelve a crear, y hasta drops de
índices vivos (idx_faq_categoria_orden, ix_sponsors_orden,
idx_tecnicos_categorias_categoria). Todo eso se sacó a mano: es drift viejo,
no tiene nada que ver con plantillas_mail, y aplicarlo de rebote acá sería
meter cambios de schema que nadie revisó.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '57da35c780d5'
down_revision: Union[str, Sequence[str], None] = '098123f41c8b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'plantillas_mail',
        sa.Column('clave', sa.String(length=60), nullable=False),
        sa.Column('asunto', sa.String(length=200), nullable=True),
        sa.Column('cuerpo', sa.Text(), nullable=True),
        sa.Column('actualizado_por', sa.Integer(), nullable=True),
        sa.Column('actualizado_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(
            ['actualizado_por'], ['usuarios.id_usuario'],
            name='fk_plantilla_mail_actualizado_por',
            ondelete='SET NULL', use_alter=True,
        ),
        sa.PrimaryKeyConstraint('clave'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('plantillas_mail')
