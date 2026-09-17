"""
Script de gestión de migraciones de Alembic para entornos dev y prod (Neon).

USO:
    # Ver estado de ambas branches (dev y main)
    python -m scripts.migrate status

    # Aplicar migraciones en DEV (alembic upgrade head)
    python -m scripts.migrate dev

    # Aplicar migraciones en PROD / MAIN (pide confirmación)
    python -m scripts.migrate prod

    # Crear una nueva migración autogenerada
    python -m scripts.migrate create "descripcion_del_cambio"

    # Pasar argumentos directos a Alembic (ej. downgrade o history)
    python -m scripts.migrate dev history
    python -m scripts.migrate dev downgrade -1

CONFIGURACIÓN:
    En backend/.env podés definir:
        DATABASE_URL_DEV=postgresql://...branch-dev...
        DATABASE_URL_PROD=postgresql://...branch-main...  (o DATABASE_URL_MAIN)

    Si DATABASE_URL_DEV no está definido, usa DATABASE_URL de backend/.env.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Ubicar carpetas backend y raíz del repo
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
ROOT_DIR = BACKEND_DIR.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"

# Cargar variables de entorno
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(ROOT_DIR / ".env")


def get_db_urls() -> tuple[str | None, str | None]:
    """Obtiene las URLs de conexión para dev y prod desde las variables de entorno."""
    url_dev = os.environ.get("DATABASE_URL_DEV") or os.environ.get("DATABASE_URL")
    url_prod = os.environ.get("DATABASE_URL_PROD") or os.environ.get("DATABASE_URL_MAIN")
    return url_dev, url_prod


def run_alembic(database_url: str, alembic_args: list[str]) -> int:
    """Ejecuta Alembic configurando la variable DATABASE_URL."""
    # Asegurar que el path incluya backend
    if str(BACKEND_DIR) not in sys.path:
        sys.path.insert(0, str(BACKEND_DIR))

    from alembic.config import CommandLine

    # Inyectar DATABASE_URL en el entorno del proceso
    os.environ["DATABASE_URL"] = database_url

    cmd = CommandLine()
    argv = ["-c", str(ALEMBIC_INI)] + alembic_args
    try:
        cmd.main(argv=argv)
        return 0
    except SystemExit as e:
        return e.code if isinstance(e.code, int) else (1 if e.code else 0)
    except Exception as exc:
        print(f"Error al ejecutar Alembic: {exc}", file=sys.stderr)
        return 1


def _extract_host(url: str) -> str:
    """Extrae el host de forma segura sin exponer credenciales."""
    try:
        host = url.split("@")[-1].split("/")[0]
        return host
    except Exception:
        return "host-desconocido"


def cmd_status() -> int:
    url_dev, url_prod = get_db_urls()
    print("=" * 60)
    print("ESTADO DE MIGRACIONES (ALEMBIC)")
    print("=" * 60)

    if url_dev:
        host_dev = _extract_host(url_dev)
        print(f"\n[DEV] Host: {host_dev}")
        run_alembic(url_dev, ["current"])
    else:
        print("\n[DEV] No configurada (DATABASE_URL_DEV o DATABASE_URL ausente)")

    if url_prod:
        host_prod = _extract_host(url_prod)
        print(f"\n[PROD / MAIN] Host: {host_prod}")
        run_alembic(url_prod, ["current"])
    else:
        print("\n[PROD / MAIN] No configurada en .env (DATABASE_URL_PROD o DATABASE_URL_MAIN)")

    print("\nHeads disponibles en el repositorio:")
    if url_dev or url_prod:
        active_url = url_dev or url_prod
        run_alembic(active_url, ["heads"])
    print("=" * 60)
    return 0


def cmd_dev(extra_args: list[str]) -> int:
    url_dev, _ = get_db_urls()
    if not url_dev:
        print("ERROR: No se encontró DATABASE_URL_DEV ni DATABASE_URL en backend/.env", file=sys.stderr)
        return 1

    host = _extract_host(url_dev)
    args = extra_args if extra_args else ["upgrade", "head"]
    print(f"→ Ejecutando contra DEV ({host}): alembic {' '.join(args)}")
    return run_alembic(url_dev, args)


def cmd_prod(extra_args: list[str]) -> int:
    _, url_prod = get_db_urls()
    if not url_prod:
        print("ERROR: No se encontró DATABASE_URL_PROD ni DATABASE_URL_MAIN en backend/.env", file=sys.stderr)
        print("Agregala en backend/.env para poder migrar producción sin copiarla a mano.", file=sys.stderr)
        return 1

    host = _extract_host(url_prod)
    args = extra_args if extra_args else ["upgrade", "head"]

    # Confirmación explícita
    if "--yes" not in extra_args and "-y" not in extra_args:
        print("\n" + "!" * 60)
        print("ATENCIÓN: Vas a ejecutar migraciones sobre PRODUCCIÓN (main)")
        print(f"Host destino: {host}")
        print(f"Comando: alembic {' '.join(args)}")
        print("!" * 60)
        confirm = input("¿Confirmar ejecución en PRODUCCIÓN? [s/N]: ").strip().lower()
        if confirm not in ("s", "si", "y", "yes"):
            print("Operación cancelada.")
            return 0
    else:
        args = [a for a in args if a not in ("--yes", "-y")]

    print(f"→ Ejecutando contra PRODUCCIÓN ({host}): alembic {' '.join(args)}")
    return run_alembic(url_prod, args)


def cmd_create(message: str) -> int:
    if not message:
        print("ERROR: Debes indicar un mensaje para la migración. Ej: python -m scripts.migrate create \"nueva_tabla\"", file=sys.stderr)
        return 1
    url_dev, url_prod = get_db_urls()
    base_url = url_dev or url_prod
    if not base_url:
        print("ERROR: Se requiere al menos una base de datos conectada para autogenerar la migración.", file=sys.stderr)
        return 1
    print(f"→ Autogenerando migración: '{message}'")
    return run_alembic(base_url, ["revision", "--autogenerate", "-m", message])


def print_help():
    print("""
Uso: python -m scripts.migrate <comando> [opciones]

Comandos disponibles:
    status                  Muestra la revisión actual en dev y prod
    dev [args...]           Ejecuta alembic contra dev (default: upgrade head)
    prod [args...]          Ejecuta alembic contra prod/main con confirmación (default: upgrade head)
    create "descripcion"    Autogenera una nueva revisión basada en models.py

Ejemplos:
    python -m scripts.migrate status
    python -m scripts.migrate dev
    python -m scripts.migrate prod
    python -m scripts.migrate create "agregar_campo_telefono"
    python -m scripts.migrate dev downgrade -1
""")


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help", "help"):
        print_help()
        sys.exit(0)

    subcmd = sys.argv[1].lower()
    extra_args = sys.argv[2:]

    if subcmd == "status":
        sys.exit(cmd_status())
    elif subcmd == "dev":
        sys.exit(cmd_dev(extra_args))
    elif subcmd == "prod":
        sys.exit(cmd_prod(extra_args))
    elif subcmd == "create":
        msg = extra_args[0] if extra_args else ""
        sys.exit(cmd_create(msg))
    else:
        print(f"Comando desconocido: '{subcmd}'", file=sys.stderr)
        print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
