"""partidos_fixture_y_transmisiones

Revision ID: e7b8c9d0f1a2
Revises: a7c3d9e2b418
Create Date: 2026-09-16 00:00:00.000000

Enriquece la tabla `eventos` para soportar el Programa de Partidos (Fixture)
con datos deportivos (rival, local/visitante, goles) y el módulo de
Transmisión en Vivo (enlace OBS/YouTube/Vimeo, precio, socios gratis).
Crea además la tabla `entradas_virtuales` para el control de acceso y
control de concurrencia (heartbeat anti-cuentas compartidas).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e7b8c9d0f1a2'
down_revision: Union[str, Sequence[str], None] = 'a7c3d9e2b418'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Columnas de Programa de Partidos (Fixture) en `eventos` ──────────
    op.add_column(
        'eventos',
        sa.Column('rival', sa.String(length=150), nullable=True, comment='Nombre del equipo rival.')
    )
    op.add_column(
        'eventos',
        sa.Column('condicion', sa.String(length=20), nullable=False, server_default='local',
                  comment='local | visitante | neutral')
    )
    op.add_column(
        'eventos',
        sa.Column('goles_local', sa.Integer(), nullable=True, comment='Goles del CAR.')
    )
    op.add_column(
        'eventos',
        sa.Column('goles_rival', sa.Integer(), nullable=True, comment='Goles del equipo rival.')
    )

    # ── 2. Columnas de Transmisión en Vivo en `eventos` ───────────────────────
    op.add_column(
        'eventos',
        sa.Column('tiene_transmision', sa.Boolean(), nullable=False, server_default=sa.text('false'),
                  comment='Indica si el partido cuenta con streaming en vivo.')
    )
    op.add_column(
        'eventos',
        sa.Column('transmision_estado', sa.String(length=20), nullable=False, server_default='programada',
                  comment='programada | en_vivo | finalizada | pausada')
    )
    op.add_column(
        'eventos',
        sa.Column('transmision_plataforma', sa.String(length=30), nullable=False, server_default='youtube',
                  comment='youtube | vimeo | custom_iframe')
    )
    op.add_column(
        'eventos',
        sa.Column('transmision_video_id', sa.Text(), nullable=True,
                  comment='ID de video de YouTube/Vimeo o código embed. Solo visible si tiene acceso verificado.')
    )
    op.add_column(
        'eventos',
        sa.Column('transmision_precio', sa.Numeric(10, 2), nullable=False, server_default=sa.text('0.00'),
                  comment='Precio de la entrada virtual para no-socios.')
    )
    op.add_column(
        'eventos',
        sa.Column('transmision_socio_gratis', sa.Boolean(), nullable=False, server_default=sa.text('true'),
                  comment='Si es true, los socios con cuota al día miran gratis.')
    )
    op.add_column(
        'eventos',
        sa.Column('transmision_es_publica', sa.Boolean(), nullable=False, server_default=sa.text('false'),
                  comment='Si es true, la transmisión es abierta a todo público sin requerir entrada.')
    )

    # ── 3. Tabla `entradas_virtuales` ─────────────────────────────────────────
    op.create_table(
        'entradas_virtuales',
        sa.Column('id_entrada', sa.Integer(), primary_key=True),
        sa.Column('id_evento', sa.Integer(), sa.ForeignKey('eventos.id_evento', ondelete='CASCADE'), nullable=False),
        sa.Column('id_usuario', sa.Integer(), sa.ForeignKey('usuarios.id_usuario', ondelete='CASCADE'), nullable=False),
        sa.Column('id_pago', sa.Integer(), sa.ForeignKey('pagos.id_pago', ondelete='SET NULL'), nullable=True),
        sa.Column('token_sesion', sa.String(length=100), nullable=True, comment='Token único de sesión activa para streaming.'),
        sa.Column('ultimo_heartbeat_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('creado_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint('id_evento', 'id_usuario', name='uq_entrada_virtual_evento_usuario'),
    )
    op.create_index('idx_entradas_evento_usuario', 'entradas_virtuales', ['id_evento', 'id_usuario'])


def downgrade() -> None:
    op.drop_index('idx_entradas_evento_usuario', table_name='entradas_virtuales')
    op.drop_table('entradas_virtuales')

    op.drop_column('eventos', 'transmision_es_publica')
    op.drop_column('eventos', 'transmision_socio_gratis')
    op.drop_column('eventos', 'transmision_precio')
    op.drop_column('eventos', 'transmision_video_id')
    op.drop_column('eventos', 'transmision_plataforma')
    op.drop_column('eventos', 'transmision_estado')
    op.drop_column('eventos', 'tiene_transmision')

    op.drop_column('eventos', 'goles_rival')
    op.drop_column('eventos', 'goles_local')
    op.drop_column('eventos', 'condicion')
    op.drop_column('eventos', 'rival')
