.PHONY: help migrate-status migrate-dev migrate-prod

help:
	@echo "Comandos disponibles:"
	@echo "  make migrate-status  - Muestra la revisión actual en dev y prod"
	@echo "  make migrate-dev     - Aplica migraciones pendientes en DEV"
	@echo "  make migrate-prod    - Aplica migraciones pendientes en PROD (pide confirmación)"

migrate-status:
	python -m backend.scripts.migrate status

migrate-dev:
	python -m backend.scripts.migrate dev

migrate-prod:
	python -m backend.scripts.migrate prod
