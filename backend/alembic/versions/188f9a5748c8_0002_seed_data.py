"""0002_seed_data

Revision ID: 188f9a5748c8
Revises: b12774212e19
Create Date: 2026-06-29 19:14:51.528186

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision: str = '188f9a5748c8'
down_revision = 'c90509324888'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None




def upgrade() -> None:
    op.execute(text("""
        INSERT INTO roles (nombre, descripcion, peso_jerarquico) VALUES
            ('admin_general',           'Acceso completo.', 100),
           ('personal_administrativo', 'Gestión contable.', 60),
            ('personal_tecnico',        'Gestión deportiva.', 50),
            ('admin_temporal',          'Portería. Expira con el evento.', 40),
            ('jugador',                 'Socio + panel deportivo.', 20),
            ('socio',                   'Rol base del sistema.', 10),
            ('invitado',                'Solo lector QR/DNI.', 1)
        ON CONFLICT (nombre) DO NOTHING;
    """))

    op.execute(text("""
        INSERT INTO configuracion_global
             (valor_cuota_base, meses_antiguedad_beneficio, descuento_beneficio)
        VALUES (4000.00, 6, 15.00)
        ON CONFLICT DO NOTHING;
     """))

def downgrade() -> None:
     op.execute(text("DELETE FROM configuracion_global;"))
     op.execute(text("DELETE FROM roles;"))