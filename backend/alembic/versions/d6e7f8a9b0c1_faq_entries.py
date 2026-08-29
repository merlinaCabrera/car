"""faq_entries

Crea la tabla de preguntas frecuentes editables por el Admin General.
Gestionadas desde un bloque dentro de /admin/comercios, mostradas en /ayuda
(pública y privada, según es_publica).

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
Create Date: 2026-08-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd6e7f8a9b0c1'
down_revision: Union[str, Sequence[str], None] = 'c5d6e7f8a9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "faq_entries",
        sa.Column("id_faq", sa.Integer(), primary_key=True, index=True),
        sa.Column("categoria", sa.String(80), nullable=False),
        sa.Column("pregunta", sa.String(300), nullable=False),
        sa.Column("respuesta", sa.Text(), nullable=False),
        sa.Column("es_publica", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("es_activa", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("orden", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("creado_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("actualizado_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("idx_faq_categoria_orden", "faq_entries", ["categoria", "orden"])

    # Semilla mínima — el club la completa/edita después desde el admin.
    # Se cargan 2 públicas (landing sin login) y 1 privada (portal de socio),
    # solo para que la pantalla no arranque vacía.
    op.execute(sa.text("""
        INSERT INTO faq_entries (categoria, pregunta, respuesta, es_publica, es_activa, orden)
        VALUES
        (
            'Cómo asociarme',
            '¿Cómo me hago socio del club?',
            'Desde la página principal, tocá "Crear cuenta" y completá la Solicitud de Alta. '
            'La administración la revisa y te avisamos por mail cuando tu cuenta esté aprobada.',
            true, true, 1
        ),
        (
            'Sobre el club',
            '¿Cómo sigo las novedades del club?',
            'Podés seguirnos en nuestras redes sociales, donde publicamos resultados, '
            'convocatorias y novedades institucionales.',
            true, true, 2
        ),
        (
            'Cuotas',
            '¿Cómo pago mi cuota social?',
            'Desde tu portal de socio, en "Gestión de Cuotas", vas a ver tu estado de cuenta '
            'y las opciones de pago disponibles.',
            false, true, 1
        )
    """))


def downgrade() -> None:
    op.drop_index("idx_faq_categoria_orden", table_name="faq_entries")
    op.drop_table("faq_entries")