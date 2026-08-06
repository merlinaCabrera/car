"""tecnicos_categorias

Paso 1 del nuevo modelo de permisos del técnico: crea la tabla puente
técnico ↔ categoría a cargo. Todavía NO cambia ningún permiso existente —
los endpoints de deportivo.py siguen funcionando exactamente igual que
antes. Esta migración solo deja la base de datos lista para que el
siguiente paso (permisos acotados por categoría en los endpoints) pueda
apoyarse en esta tabla.

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-08-05 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tecnicos_categorias",
        sa.Column("id_usuario", sa.Integer(), nullable=False),
        sa.Column("id_categoria", sa.Integer(), nullable=False),
        sa.Column("asignado_por", sa.Integer(), nullable=True),
        sa.Column(
            "asignado_at", sa.DateTime(timezone=True),
            nullable=False, server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["id_usuario"], ["usuarios.id_usuario"],
            ondelete="CASCADE", name="fk_tecnico_categoria_usuario",
        ),
        sa.ForeignKeyConstraint(
            ["id_categoria"], ["categorias_deportivas.id_categoria"],
            ondelete="CASCADE", name="fk_tecnico_categoria_categoria",
        ),
        sa.ForeignKeyConstraint(
            ["asignado_por"], ["usuarios.id_usuario"],
            ondelete="SET NULL", name="fk_tecnico_categoria_asignador",
        ),
        sa.PrimaryKeyConstraint("id_usuario", "id_categoria"),
    )
    op.create_index(
        "idx_tecnicos_categorias_categoria",
        "tecnicos_categorias",
        ["id_categoria"],
    )

    # Migración de datos: cualquier usuario que hoy tenga el rol
    # 'personal_tecnico' queda asignado a TODAS las categorías activas,
    # para no dejar a nadie momentáneamente sin acceso a lo que ya venía
    # gestionando antes de este cambio. El admin ajusta después desde el
    # panel quién queda en cada categoría específica.
    op.execute(sa.text("""
        INSERT INTO tecnicos_categorias (id_usuario, id_categoria)
        SELECT DISTINCT u.id_usuario, c.id_categoria
          FROM usuarios u
          JOIN usuarios_roles ur ON ur.id_usuario = u.id_usuario
          JOIN roles r ON r.id_rol = ur.id_rol
          CROSS JOIN categorias_deportivas c
         WHERE r.nombre = 'personal_tecnico'
           AND u.fecha_baja IS NULL
           AND c.es_activa = true
        ON CONFLICT (id_usuario, id_categoria) DO NOTHING;
    """))


def downgrade() -> None:
    op.drop_index("idx_tecnicos_categorias_categoria", table_name="tecnicos_categorias")
    op.drop_table("tecnicos_categorias")