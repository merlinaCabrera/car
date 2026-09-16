# backend/utils/recordatorios.py
"""
Recordatorio de cuota — plantilla editable, deep link de WhatsApp y selección
de destinatarios del aviso masivo.

Por qué es un módulo aparte
───────────────────────────
Los dos caminos que le avisan a un socio moroso (el botón de WhatsApp de
/admin/socios y el mail masivo del panel) tienen que decir EXACTAMENTE lo
mismo: mismo monto, mismo mes, mismo alias. Si cada endpoint armara su
propio texto, en la primera corrección de la plantilla uno de los dos
quedaría viejo — es el mismo problema que ya tuvo el descuento por menor de
edad copiado en cuatro routers (ver el encabezado de utils/precios.py).

Qué NO hace este módulo
───────────────────────
No decide si un socio debe o no debe: eso es `calcular_estado_financiero`
(utils/cuotas_periodos.py), la fuente única de verdad de la morosidad. Acá
solo se le pregunta.
"""
from __future__ import annotations

import os
import re
from datetime import date
from decimal import Decimal
from typing import Iterable, Optional
from urllib.parse import quote

from sqlalchemy.orm import Session

import models
from utils.cuotas_periodos import calcular_estado_financiero
from utils.fechas import hoy_club
from utils.precios import calcular_precio_cuota, obtener_descuento_menor_pct

# ── Plantilla ────────────────────────────────────────────────────────────────

PLANTILLA_DEFAULT = (
    "Hola {nombre}! Te escribimos desde el club. Te recordamos que tenés "
    "{meses} cuota(s) pendiente(s) desde {mes} por ${monto}. Podés "
    "transferir al alias {alias} o pagar online: {link_pago}. ¡Gracias!"
)

#: Variables que el admin puede usar en la plantilla. La UI las lista a partir
#: de esta tupla — si se agrega una, aparece sola en pantalla.
VARIABLES_PLANTILLA: tuple[str, ...] = (
    "nombre", "meses", "mes", "monto", "alias", "link_pago",
)

#: Tope de caracteres de la plantilla. WhatsApp acepta muchísimo más, pero un
#: `wa.me` con un texto larguísimo se vuelve una URL enorme y algunos clientes
#: de mail la cortan. 1000 alcanza de sobra para el caso real.
MAX_LARGO_PLANTILLA = 1000

_PLACEHOLDER = re.compile(r"\{(\w+)\}")

MESES_ES = (
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
)


def url_pago_socio() -> str:
    """
    A dónde mandamos al socio a pagar (el valor de `{link_pago}`). No es un
    checkout de un solo uso: es la pantalla de cuotas, que ya resuelve sola
    cuánto debe y le arma la orden.

    Se lee `FRONTEND_URL` con os.getenv y no con `config.settings` a propósito:
    `Settings` exige `mp_access_token`, y este módulo lo importan routers que
    tienen que poder cargarse en un entorno sin Mercado Pago configurado. Es el
    mismo criterio que usa mailer/services/email_service.py. Queda anotado en
    el pendiente de CLAUDE.md de centralizar todo en config.py.
    """
    base = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return f"{base}/socio/cuotas"


def renderizar_plantilla(plantilla: str, valores: dict[str, str]) -> str:
    """
    Reemplaza `{variable}` por su valor.

    NO usa `str.format()` a propósito. La plantilla la escribe el admin desde
    un textarea, y `format()` sobre texto no confiable explota con KeyError
    ante cualquier llave suelta (un `{` en el mensaje alcanza) y además
    permite atajos como `{0.__class__}`. Acá una llave desconocida se deja tal
    cual estaba escrita: el admin ve el error en la vista previa en vez de
    recibir un 500.
    """
    return _PLACEHOLDER.sub(
        lambda m: valores.get(m.group(1), m.group(0)),
        plantilla,
    )


def obtener_plantilla(config: Optional[models.ConfiguracionGlobal]) -> str:
    """Plantilla configurada, o la de fábrica si nunca se tocó."""
    if config and config.plantilla_recordatorio:
        return config.plantilla_recordatorio
    return PLANTILLA_DEFAULT


def formatear_mes(vencimiento: Optional[date]) -> str:
    """
    'septiembre' a partir de la fecha de vencimiento del período.

    Sin el año a propósito: el mensaje es una conversación de WhatsApp, no un
    recibo, y "septiembre 2026" se lee como formulario. La ambigüedad de una
    deuda de más de doce meses la cubre `{meses}`, que va al lado en la
    plantilla de fábrica ("tenés 14 cuota(s) pendiente(s) desde julio").
    """
    if vencimiento is None:
        return "—"
    return MESES_ES[vencimiento.month - 1]


def formatear_monto(monto: Decimal) -> str:
    """
    Monto en el formato que se lee en Argentina: 12.345,67 — y sin el signo
    $, porque la plantilla ya lo trae escrito (`${monto}`).

    Los centavos se omiten cuando son cero: la cuota es un número redondo y
    "$5.000" es como lo dice la secretaria, mientras que "$5.000,00" suena a
    sistema. Si el total tiene centavos reales (puede pasar con un descuento
    de menor que no divide exacto) se muestran, porque ahí el redondeo sería
    una diferencia real contra lo que el socio ve en /socio/cuotas.
    """
    entero, _, decimales = f"{monto:.2f}".partition(".")
    negativo = entero.startswith("-")
    entero = entero.lstrip("-")
    miles = f"{int(entero):,}".replace(",", ".")
    signo = "-" if negativo else ""
    if decimales == "00":
        return f"{signo}{miles}"
    return f"{signo}{miles},{decimales}"


# ── Teléfono ─────────────────────────────────────────────────────────────────

def normalizar_telefono_ar(crudo: Optional[str]) -> Optional[str]:
    """
    Convierte un teléfono cargado a mano en el formato que pide `wa.me`:
    solo dígitos, con código de país y sin el 0 ni el 15.

    Para un celular argentino el destino es `54` + `9` + 10 dígitos (código de
    área sin el 0 + número sin el 15). Los socios lo cargan de mil formas
    distintas: `2355-123456`, `02355 15 123456`, `+54 9 2355 123456`,
    `(2355) 15-123456`.

    Reglas, en orden:
      1. Se queda solo con los dígitos.
      2. Saca el prefijo internacional `00` si está.
      3. Si ya empieza con `54`, lo toma como número completo (solo se le
         agrega el `9` de celular si le falta).
      4. Si no, saca el `0` inicial (prefijo nacional) y el `15` del celular,
         y le antepone `54 9`.

    El `15` no se puede detectar con certeza porque el código de área mide
    entre 2 y 4 dígitos. Se usa la regla práctica: un número argentino
    completo tiene 10 dígitos, así que si quedaron 12 y hay un `15` en la
    posición 2, 3 o 4, ese `15` es el del celular.

    Devuelve None si el resultado no es plausible — el llamador decide qué
    hacer (acá: responder 400 con un mensaje claro, no armar un link roto).
    """
    if not crudo:
        return None

    digitos = re.sub(r"\D", "", crudo)
    if not digitos:
        return None

    if digitos.startswith("00"):
        digitos = digitos[2:]

    if digitos.startswith("54"):
        resto = digitos[2:]
        if resto.startswith("9"):
            resto = resto[1:]
        resto = resto.lstrip("0")
        nacional = _sacar_quince(resto)
    else:
        nacional = _sacar_quince(digitos.lstrip("0"))

    # Un número argentino completo (área + abonado) tiene 10 dígitos.
    if len(nacional) != 10:
        return None

    return f"549{nacional}"


def _sacar_quince(nacional: str) -> str:
    """Quita el `15` del celular si el largo delata que está de más."""
    if len(nacional) != 12:
        return nacional
    for corte in (2, 3, 4):
        if nacional[corte:corte + 2] == "15":
            return nacional[:corte] + nacional[corte + 2:]
    return nacional


def armar_link_whatsapp(telefono_normalizado: str, mensaje: str) -> str:
    """Deep link de WhatsApp. `quote` con safe='' para que no quede ningún
    carácter sin escapar dentro del query string."""
    return f"https://wa.me/{telefono_normalizado}?text={quote(mensaje, safe='')}"


# ── Datos del recordatorio de un socio ───────────────────────────────────────

class RecordatorioSocio:
    """
    Lo que hace falta para armarle el mensaje a UN socio. Es una clase chica y
    no un dict para que un typo en un nombre de campo falle acá y no en
    silencio dentro de la plantilla.
    """

    __slots__ = ("socio", "meses_adeudados", "monto_total", "mes_mas_viejo", "mensaje")

    def __init__(
        self,
        socio: models.Usuario,
        meses_adeudados: int,
        monto_total: Decimal,
        mes_mas_viejo: Optional[date],
        mensaje: str,
    ) -> None:
        self.socio = socio
        self.meses_adeudados = meses_adeudados
        self.monto_total = monto_total
        self.mes_mas_viejo = mes_mas_viejo
        self.mensaje = mensaje


def beca_activa(socio: models.Usuario, hoy: date) -> bool:
    """Mismo criterio que /socio/cuotas/estado y /admin/socios."""
    return bool(socio.es_becado) and (socio.becado_hasta is None or socio.becado_hasta >= hoy)


def construir_recordatorio(
    socio: models.Usuario,
    *,
    plantilla: str,
    alias: Optional[str],
    link_pago: str,
    precio_base: Decimal,
    descuento_menor_pct: Decimal,
    dia_vencimiento: int,
    db: Session,
    hoy: Optional[date] = None,
) -> RecordatorioSocio:
    """
    Calcula deuda y renderiza el mensaje de un socio.

    `{mes}` es el período adeudado MÁS VIEJO, no "el mes en curso": un socio
    que debe cinco meses tiene que entender de dónde viene el monto. Si debe
    uno solo, las dos lecturas coinciden.

    `precio_base` y `descuento_menor_pct` se reciben ya resueltos porque esta
    función corre dentro de un loop sobre todo el padrón — leerlos adentro
    sería un N+1 de dos queries por socio.
    """
    hoy = hoy or hoy_club()

    if beca_activa(socio, hoy):
        estado_meses: list[date] = []
    else:
        estado_meses = calcular_estado_financiero(
            socio.mes_cubierto_hasta, socio.fecha_ingreso, dia_vencimiento, hoy,
        ).meses_adeudados

    precio_socio = calcular_precio_cuota(
        precio_base, socio.fecha_nacimiento, db,
        descuento_menor_pct=descuento_menor_pct,
    )
    monto_total = Decimal(len(estado_meses)) * precio_socio
    mes_mas_viejo = estado_meses[0] if estado_meses else None

    mensaje = renderizar_plantilla(plantilla, {
        "nombre":    socio.nombre or "",
        "meses":     str(len(estado_meses)),
        "mes":       formatear_mes(mes_mas_viejo),
        "monto":     formatear_monto(monto_total),
        "alias":     alias or "—",
        "link_pago": link_pago,
    })

    return RecordatorioSocio(
        socio=socio,
        meses_adeudados=len(estado_meses),
        monto_total=monto_total,
        mes_mas_viejo=mes_mas_viejo,
        mensaje=mensaje,
    )


# ── Destinatarios del aviso masivo ───────────────────────────────────────────

def socios_morosos(db: Session, dia_vencimiento: int, hoy: Optional[date] = None) -> list[models.Usuario]:
    """
    Socios activos que hoy están en mora, sin beca vigente.

    Calcado del job `notificar_cuotas_vencidas` (scheduler.py), incluida la
    razón del filtro amplio: `mes_cubierto_hasta IS NULL` es el socio que
    nunca pagó, y en SQL `NULL < hoy` no es TRUE, así que sin el OR quedaba
    afuera justo el caso más moroso de todos. La morosidad fina se decide en
    Python con el motor de siempre.
    """
    hoy = hoy or hoy_club()

    candidatos = (
        db.query(models.Usuario)
        .filter(
            models.Usuario.fecha_baja.is_(None),
            (
                (models.Usuario.mes_cubierto_hasta < hoy)
                | (models.Usuario.mes_cubierto_hasta.is_(None))
            ),
        )
        .order_by(models.Usuario.apellido, models.Usuario.nombre)
        .all()
    )

    return [
        s for s in candidatos
        if not beca_activa(s, hoy)
        and calcular_estado_financiero(
            s.mes_cubierto_hasta, s.fecha_ingreso, dia_vencimiento, hoy,
        ).moroso
    ]


def ids_con_orden_de_cuota_pendiente(db: Session) -> set[int]:
    """
    Socios que ya subieron el comprobante y esperan que el admin lo apruebe.
    No hay que avisarles nada: para ellos el sistema todavía dice "moroso"
    (BUG-02 de la QA) pero ya hicieron su parte.
    """
    ids_cuota: Iterable[int] = [
        p.id_producto
        for p in db.query(models.ProductoServicio)
        .filter(models.ProductoServicio.categoria == "cuota_social")
        .all()
    ]
    if not ids_cuota:
        return set()

    filas = (
        db.query(models.Orden.id_usuario)
        .join(models.DetalleOrden, models.DetalleOrden.id_orden == models.Orden.id_orden)
        .filter(
            models.Orden.estado == "pendiente_verificacion",
            models.DetalleOrden.id_producto.in_(ids_cuota),
        )
        .all()
    )
    return {fila[0] for fila in filas}
