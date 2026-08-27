"""rate_limiting_login_e_invalidacion_tokens

Agrega a usuarios las columnas necesarias para dos mejoras de seguridad
del sistema de auth:

  - intentos_fallidos / bloqueado_hasta: rate limiting simple sobre
    /auth/login. Sin esto, un DNI conocido permitía fuerza bruta de
    contraseña sin ninguna fricción (ver auth.py: login_for_access_token).

  - password_actualizada_en: permite invalidar tokens JWT ya emitidos
    cuando el usuario cambia su contraseña (por reset vía mail o desde
    su perfil). Sin esto, un token robado seguía siendo válido durante
    las 8hs de vida del token aunque la víctima ya hubiera cambiado su
    contraseña (ver dependencies.py: get_current_user, que ahora rechaza
    tokens con iat anterior a este timestamp).

No requiere backfill: los usuarios existentes arrancan con
intentos_fallidos=0, bloqueado_hasta=NULL y password_actualizada_en=NULL
(este último simplemente significa "sin invalidaciones retroactivas" —
todos los tokens ya emitidos siguen siendo válidos hasta su expiración
natural, que es el comportamiento correcto para no desloguear a nadie
de golpe con este deploy).

Revision ID: a3b4c5d6e7f8
Revises: a7b8c9d0e1f2
Create Date: 2026-08-26 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'usuarios',
        sa.Column(
            'intentos_fallidos',
            sa.Integer(),
            nullable=False,
            server_default=sa.text('0'),
        ),
    )
    op.add_column(
        'usuarios',
        sa.Column(
            'bloqueado_hasta',
            sa.DateTime(timezone=True),
            nullable=True,
            comment='Si tiene valor futuro, el login queda bloqueado hasta esta fecha por intentos fallidos.',
        ),
    )
    op.add_column(
        'usuarios',
        sa.Column(
            'password_actualizada_en',
            sa.DateTime(timezone=True),
            nullable=True,
            comment='Timestamp del último cambio de password. Tokens emitidos antes de esta fecha se rechazan.',
        ),
    )


def downgrade() -> None:
    op.drop_column('usuarios', 'password_actualizada_en')
    op.drop_column('usuarios', 'bloqueado_hasta')
    op.drop_column('usuarios', 'intentos_fallidos')