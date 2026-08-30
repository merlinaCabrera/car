"""eliminar_deuda_historica_meses_redundante

Elimina el contador manual `usuarios.deuda_historica_meses`. Nunca subía
solo con el paso del tiempo (solo bajaba al pagar), por lo que quedaba
desincronizado de mes_cubierto_hasta — el frontend (AdminSocios.jsx) ya
lo había detectado y calculaba el estado real por su cuenta, ignorando
este campo.

De ahora en más, los meses adeudados (cantidad y cuáles puntualmente) se
derivan siempre de mes_cubierto_hasta / fecha_ingreso en tiempo real, vía
utils/cuotas_periodos.calcular_estado_financiero() — una sola fuente de
verdad, sin contador redundante que mantener sincronizado a mano.

No hace falta backfill: mes_cubierto_hasta ya refleja fielmente la
cobertura real de cada socio (es el campo que siempre determinó el acceso
real), así que no se pierde información al borrar la columna vieja.

Revision ID: d0e1f2a3b4c5
Revises: d6e7f8a9b0c1
Create Date: 2026-08-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

# revision identifiers, used by Alembic.
revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, Sequence[str], None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # v_estado_financiero (creada en 76b421c257e8) lee deuda_historica_meses
    # directo en SQL — no la usa ningún endpoint ni router (búsqueda en todo
    # el código, cero coincidencias). Se elimina en vez de recrearla porque
    # replicar exactamente calcular_estado_financiero() en SQL puro (con el
    # ajuste de "día ya pasado este mes") es frágil de mantener duplicado en
    # dos lenguajes. Si en algún momento hace falta para un reporte externo
    # (DBeaver, BI), avisar antes de aplicar esta migración.
    op.execute(text("DROP VIEW IF EXISTS v_estado_financiero;"))

    # IF EXISTS a propósito: el constraint declarado en models.py nunca
    # llegó a crearse en la DB real con ese nombre (o no se creó en
    # absoluto) — mismo caso que el CHECK de notificaciones.tipo.
    op.execute(text("ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_deuda_no_negativa;"))
    op.execute(text("ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_deuda_historica_meses_check;"))
    op.drop_column('usuarios', 'deuda_historica_meses')


def downgrade() -> None:
    op.add_column(
        'usuarios',
        sa.Column('deuda_historica_meses', sa.Integer(), nullable=False, server_default=sa.text('0')),
    )
    op.create_check_constraint('chk_deuda_no_negativa', 'usuarios', 'deuda_historica_meses >= 0')

    # Recreación textual idéntica a la de 76b421c257e8.
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