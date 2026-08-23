"""agregar_tipos_notificacion_beca_y_otros

El CHECK constraint de notificaciones.tipo tenía una lista cerrada de
valores (definida en la migración inicial 0001) que nunca se actualizó al
sumar nuevos tipos de notificación in-app. El primero en pisarlo fue
'beca_actualizada' (avisa al socio cuando se le asigna/quita una beca) —
sin esto, cualquier UPDATE de la beca de un socio fallaba con un 500/409
oscuro en vez de guardar el cambio.

De paso, se agregan 'pago_verificado' y 'convocatoria', dos tipos que ya
están planeados para uso cercano (aviso de pago consolidado por Pago, y
aviso al jugador convocado a un evento) — así no volvemos a pisar el mismo
problema en la próxima ronda.

En el ambiente donde se generó el error real, el nombre del constraint
apareció como 'notificaciones_tipo_check' (nombre autogenerado de Postgres),
no 'chk_notificacion_tipo' como se definió originalmente — probablemente
porque la base real se armó desde otro origen (schema.sql) en algún punto.
Por eso el DROP contempla ambos nombres posibles.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-08-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TIPOS_PERMITIDOS = (
    "'orden_aprobada', 'orden_rechazada', 'cuota_vencida', "
    "'reserva_confirmada', 'reserva_cancelada', 'rol_asignado', "
    "'rol_removido', 'convocatoria_partido', 'convocatoria', "
    "'beca_actualizada', 'pago_verificado', 'sistema'"
)


def upgrade() -> None:
    op.execute(text("ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS chk_notificacion_tipo;"))
    op.execute(text("ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;"))
    op.execute(text(f"""
        ALTER TABLE notificaciones
        ADD CONSTRAINT chk_notificacion_tipo
        CHECK (tipo IN ({_TIPOS_PERMITIDOS}));
    """))


def downgrade() -> None:
    op.execute(text("ALTER TABLE notificaciones DROP CONSTRAINT IF EXISTS chk_notificacion_tipo;"))
    op.execute(text("""
        ALTER TABLE notificaciones
        ADD CONSTRAINT chk_notificacion_tipo
        CHECK (tipo IN (
            'orden_aprobada', 'orden_rechazada', 'cuota_vencida',
            'reserva_confirmada', 'reserva_cancelada', 'rol_asignado',
            'rol_removido', 'convocatoria_partido', 'sistema'
        ));
    """))