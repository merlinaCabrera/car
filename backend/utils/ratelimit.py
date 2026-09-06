# backend/utils/ratelimit.py
"""
Rate limiter in-memory, por IP, para endpoints públicos sin auth.

Ventana fija deslizante simple. NO usa Redis ni una dependencia nueva: para el
MVP (Render free tier, 1 instancia) alcanza. Limitaciones asumidas:
  - El estado vive en memoria del proceso → se reinicia en cada deploy o
    spin-down. Es un mitigador de abuso, no una garantía dura.
  - Si algún día se corren varias instancias, cada una cuenta por separado.

Uso:
    from utils.ratelimit import limitar
    limitar(request, "registro", maximo=5, ventana_seg=3600)
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

_LOCK = threading.Lock()
_HITS: dict[str, list[float]] = defaultdict(list)
_MAX_CLAVES = 20_000  # techo de memoria: si se supera, se poda lo viejo


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
    cliente = getattr(request, "client", None)
    return getattr(cliente, "host", None) or "desconocido"


def limitar(request: Request, bucket: str, *, maximo: int, ventana_seg: int) -> None:
    """
    Registra un hit para (bucket, IP). Si en los últimos `ventana_seg` segundos
    ya hubo `maximo` hits, lanza 429. Llamar al principio del endpoint.
    """
    ahora = time.monotonic()
    corte = ahora - ventana_seg
    clave = f"{bucket}:{_client_ip(request)}"

    with _LOCK:
        marcas = _HITS[clave]
        marcas[:] = [t for t in marcas if t > corte]

        if len(marcas) >= maximo:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Demasiadas solicitudes. Esperá unos minutos y volvé a intentar.",
            )

        marcas.append(ahora)

        if len(_HITS) > _MAX_CLAVES:
            muertas = [k for k, v in _HITS.items() if not v or v[-1] <= corte]
            for k in muertas[: len(muertas) // 2 + 1]:
                _HITS.pop(k, None)


def rate_limit(bucket: str, *, maximo: int, ventana_seg: int):
    """
    Factory de dependencia FastAPI. Como dependencia corre ANTES de validar el
    body, así un flood de payloads inválidos también cuenta contra el límite.

        @router.post("/", dependencies=[Depends(rate_limit("registro", maximo=5, ventana_seg=3600))])
    """
    def _dep(request: Request) -> None:
        limitar(request, bucket, maximo=maximo, ventana_seg=ventana_seg)

    return _dep
