"""entradas_virtuales_invitados

Revision ID: bc78e9102a34
Revises: e7b8c9d0f1a2
Create Date: 2026-09-16 00:00:00.000000

Permite compra de entradas virtuales para No-Socios sin obligar a crear cuenta:
- `id_usuario` pasa a ser NULLABLE en `entradas_virtuales`.
- Se agrega `email_invitado` para asociar la compra al email de Mercado Pago / transferencia.
- Se agrega `ticket_token` (token criptográfico único para persistencia en localStorage y enlace mágico).
- Reemplaza la constraint estricta uq_entrada_virtual_evento_usuario por índices condicionales.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'bc78e9102a34'
down_revision: Union[str, Sequence[str], None] = 'e7b8c9d0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Quitar la unique constraint previa que requería id_usuario not null
    op.drop_constraint('uq_entrada_virtual_evento_usuario', 'entradas_virtuales', type_='unique')

    # 2. Hacer id_usuario NULLABLE
    op.alter_column('entradas_virtuales', 'id_usuario',
               existing_type=sa.INTEGER(),
               nullable=True)

    # 3. Agregar email_invitado y ticket_token
    op.add_column('entradas_virtuales',
        sa.Column('email_invitado', sa.String(length=150), nullable=True, comment='Email de compra para no-socios sin cuenta.')
    )
    op.add_column('entradas_virtuales',
        sa.Column('ticket_token', sa.String(length=64), nullable=True, comment='Token de acceso para localStorage y link mágico.')
    )

    # 4. Crear índices únicos condicionales
    op.create_index(
        'uq_entrada_virtual_evento_usuario',
        'entradas_virtuales',
        ['id_evento', 'id_usuario'],
        unique=True,
        postgresql_where=sa.text('id_usuario IS NOT NULL')
    )
    op.create_index(
        'uq_entrada_virtual_evento_email',
        'entradas_virtuales',
        ['id_evento', 'email_invitado'],
        unique=True,
        postgresql_where=sa.text('email_invitado IS NOT NULL')
    )
    op.create_index(
        'idx_entradas_ticket_token',
        'entradas_virtuales',
        ['ticket_token'],
        unique=True
    )


def downgrade() -> None:
    op.drop_index('idx_entradas_ticket_token', table_name='entradas_virtuales')
    op.drop_index('uq_entrada_virtual_evento_email', table_name='entradas_virtuales')
    op.drop_index('uq_entrada_virtual_evento_usuario', table_name='entradas_virtuales')

    op.drop_column('entradas_virtuales', 'ticket_token')
    op.drop_column('entradas_virtuales', 'email_invitado')

    op.alter_column('entradas_virtuales', 'id_usuario',
               existing_type=sa.INTEGER(),
               nullable=False)

    op.create_unique_constraint('uq_entrada_virtual_evento_usuario', 'entradas_virtuales', ['id_evento', 'id_usuario'])
