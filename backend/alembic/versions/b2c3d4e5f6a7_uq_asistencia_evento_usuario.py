"""uq_asistencia_evento_usuario

Antes de esta migración, `asistencias` no tenía ninguna restricción que
impidiera dos filas para el mismo (id_evento, id_usuario): un socio escaneado
dos veces en la puerta (por error del operador, doble tap del lector QR, o
dos dispositivos escaneando al mismo tiempo) generaba dos ingresos separados
en la planilla de presentismo del técnico.

Se agrega una UNIQUE constraint sobre (id_evento, id_usuario). El backend
(qr_auth.py::_registrar_asistencia y deportivo.py::registrar_asistencia) pasa
a usar INSERT ... ON CONFLICT DO NOTHING apoyado en esta constraint, así un
segundo escaneo del mismo socio para el mismo evento no falla con un error
de integridad: simplemente no inserta una fila nueva y el endpoint informa
que ya estaba registrado.

Antes de aplicar la constraint se hace DISTINCT ON para limpiar duplicados
que ya puedan existir en datos cargados previamente (se conserva el ingreso
más antiguo de cada par, que es el que realmente cuenta como "hora de
llegada").

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Limpiar duplicados preexistentes, si los hubiera, quedándonos con
    #    el ingreso más antiguo de cada (id_evento, id_usuario).
    op.execute(text("""
        DELETE FROM asistencias a
              USING asistencias b
              WHERE a.id_evento = b.id_evento
                AND a.id_usuario = b.id_usuario
                AND a.fecha_hora_ingreso > b.fecha_hora_ingreso
                AND a.id_asistencia <> b.id_asistencia;
    """))

    # 2) Aplicar la constraint única.
    op.create_unique_constraint(
        "uq_asistencia_evento_usuario",
        "asistencias",
        ["id_evento", "id_usuario"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_asistencia_evento_usuario",
        "asistencias",
        type_="unique",
    )