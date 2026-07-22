# backend/scripts/seed_usuario_sistema.py
"""
Ejecutar UNA sola vez:
    cd backend
    python -m scripts.seed_usuario_sistema

Crea el usuario técnico que queda registrado como "aprobador" cuando
Mercado Pago confirma un pago automáticamente vía webhook (sin admin humano
de por medio). No tiene login real: password_hash es un hash de un valor
random que nadie conoce ni necesita usar.

DNI ficticio: 99999999 (00000000 ya está en uso para el rol invitado de
comercios asociados — no tocar ese).
"""
import secrets

from dotenv import load_dotenv
load_dotenv()  # ← tiene que correr ANTES de importar database (lee el .env a os.environ)

from database import SessionLocal
from security import get_password_hash
import models


def main():
    db = SessionLocal()
    try:
        existente = (
            db.query(models.Usuario)
            .filter(models.Usuario.dni == "99999999")
            .first()
        )
        if existente:
            print(f"Ya existe: id_usuario={existente.id_usuario}")
            print(f"→ Confirmá que tu .env tenga:  SISTEMA_USER_ID={existente.id_usuario}")
            return

        usuario_sistema = models.Usuario(
            dni="99999999",
            nombre="Sistema",
            apellido="Mercado Pago",
            email=None,
            password_hash=get_password_hash(secrets.token_urlsafe(32)),
            requiere_cambio_password=False,
        )
        db.add(usuario_sistema)
        db.commit()
        db.refresh(usuario_sistema)

        print(f"Usuario sistema creado: id_usuario={usuario_sistema.id_usuario}")
        print(f"→ Agregá esto a tu .env:  SISTEMA_USER_ID={usuario_sistema.id_usuario}")
    finally:
        db.close()


if __name__ == "__main__":
    main()