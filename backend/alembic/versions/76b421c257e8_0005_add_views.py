"""0005_add_views

Revision ID: 76b421c257e8
Revises: a0c06916cf98
Create Date: 2026-06-29 19:23:15.517843

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '76b421c257e8'
down_revision = 'a0c06916cf98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Se separa de los triggers porque las vistas son más fáciles de recrear
# sin downgrade complejo y pueden cambiar sin afectar los triggers.
#


def upgrade() -> None:

    op.execute(text("""
        CREATE OR REPLACE VIEW v_estado_financiero AS
        SELECT
            u.id_usuario,
            u.dni,
            u.nombre || ' ' || u.apellido                                 AS nombre_completo,
            u.mes_cubierto_hasta,
            u.deuda_historica_meses,
            cg.valor_cuota_base,
            u.deuda_historica_meses * cg.valor_cuota_base                 AS deuda_total_calculada,
            CASE
                WHEN u.fecha_baja IS NOT NULL           THEN 'inactivo'
                WHEN u.deuda_historica_meses > 0        THEN 'moroso'
                ELSE 'al_dia'
            END                                                           AS estado_financiero,
            EXTRACT(YEAR  FROM AGE(CURRENT_DATE, u.fecha_ingreso)) * 12 +
            EXTRACT(MONTH FROM AGE(CURRENT_DATE, u.fecha_ingreso))        AS antiguedad_meses,
             (
                EXTRACT(YEAR  FROM AGE(CURRENT_DATE, u.fecha_ingreso)) * 12 +
                EXTRACT(MONTH FROM AGE(CURRENT_DATE, u.fecha_ingreso))
            ) >= cg.meses_antiguedad_beneficio                            AS aplica_descuento_antiguedad,
            cg.descuento_beneficio                                        AS porcentaje_descuento
        FROM usuarios u
        CROSS JOIN configuracion_global cg
        WHERE u.fecha_baja IS NULL;
    """))

    op.execute(text("""
        CREATE OR REPLACE VIEW v_usuarios_roles_activos AS
        SELECT
            u.id_usuario,
            u.dni,
            u.nombre || ' ' || u.apellido AS nombre_completo,
            u.fecha_baja,
            r.nombre                      AS rol,
            r.peso_jerarquico,
            ur.valido_hasta,
            ur.asignado_at
        FROM usuarios u
        JOIN usuarios_roles ur ON u.id_usuario = ur.id_usuario
        JOIN roles r           ON ur.id_rol    = r.id_rol
        WHERE r.es_activo = TRUE
          AND (ur.valido_hasta IS NULL OR ur.valido_hasta > NOW());
    """))

    op.execute(text("""
       CREATE OR REPLACE VIEW v_reporte_evento AS
        SELECT
            e.id_evento,
            e.titulo,
            e.fecha_inicio,
            COUNT(a.id_asistencia)                                        AS total_ingresos,
            COUNT(CASE WHEN a.metodo = 'QR'  THEN 1 END)                 AS ingresos_qr,
            COUNT(CASE WHEN a.metodo = 'DNI' THEN 1 END)                 AS ingresos_manual,
            COUNT(CASE WHEN a.estado_financiero_snapshot = 'al_dia'  THEN 1 END) AS socios_al_dia,
            COUNT(CASE WHEN a.estado_financiero_snapshot = 'moroso'  THEN 1 END) AS socios_morosos,
            COUNT(CASE WHEN r.nombre = 'jugador' THEN 1 END)             AS jugadores_federados
        FROM eventos e
        LEFT JOIN asistencias a     ON e.id_evento  = a.id_evento
        LEFT JOIN usuarios_roles ur ON a.id_usuario = ur.id_usuario
        LEFT JOIN roles r           ON ur.id_rol    = r.id_rol AND r.nombre = 'jugador'
        GROUP BY e.id_evento, e.titulo, e.fecha_inicio;
    """))

def downgrade() -> None:
    op.execute(text("DROP VIEW IF EXISTS v_reporte_evento;"))
    op.execute(text("DROP VIEW IF EXISTS v_usuarios_roles_activos;"))
    op.execute(text("DROP VIEW IF EXISTS v_estado_financiero;"))