"""
test_mail.py — Debe ejecutarse desde ~/Escritorio/car (la raíz del proyecto)
con: python test_mail.py

Ajustá el import de abajo según dónde termine viviendo tu carpeta backend/.
"""

import asyncio
from backend.mailer.services.email_service import enviar_orden_aprobada

asyncio.run(
    enviar_orden_aprobada(
        email_destino="merlinacabreramc@gmail.com",  # poné un mail tuyo para verlo llegar
        nombre_socio="Juan Pérez",
        numero_orden=123,
        monto="5000.00",
    )
)
print("Mail enviado (revisá también la carpeta Spam)")