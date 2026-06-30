"""0004_add_functions_triggers

Revision ID: a0c06916cf98
Revises: c70045881479
Create Date: 2026-06-29 19:20:49.228306

"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text
# revision identifiers, used by Alembic.
revision: str = 'a0c06916cf98'
down_revision = 'c70045881479'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None






def upgrade() -> None:
    """
    Inyecta en la base de datos:
      1. fn_actualizar_search_usuario()  + trigger trg_usuarios_search
      2. fn_rotar_qr_token()             + trigger trg_rotar_qr
      3. fn_validar_qr()
      4. fn_aprobar_orden()
      5. fn_verificar_directivo()
    """

    # ── 1. Función y trigger: full-text search ────────────────────────────────
    op.execute(text("""
        CREATE OR REPLACE FUNCTION fn_actualizar_search_usuario()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            NEW.nombre_completo_search := to_tsvector('spanish',
                unaccent(COALESCE(NEW.apellido, '')) || ' ' ||
                unaccent(COALESCE(NEW.nombre,   '')) || ' ' ||
                COALESCE(NEW.dni, '')
            );
            NEW.actualizado_at := NOW();
            RETURN NEW;
        END;
        $$;
    """))

    op.execute(text("""
        CREATE TRIGGER trg_usuarios_search
            BEFORE INSERT OR UPDATE ON usuarios
            FOR EACH ROW EXECUTE FUNCTION fn_actualizar_search_usuario();
    """))

    # ── 2. Función y trigger: rotación de QR ──────────────────────────────────
    op.execute(text("""
        CREATE OR REPLACE FUNCTION fn_rotar_qr_token()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            IF OLD.deuda_historica_meses IS DISTINCT FROM NEW.deuda_historica_meses
            OR OLD.mes_cubierto_hasta    IS DISTINCT FROM NEW.mes_cubierto_hasta THEN
                NEW.qr_token       := gen_random_uuid();
                NEW.qr_generado_at := NOW();
            END IF;
            RETURN NEW;
        END;
        $$;
    """))

    op.execute(text("""
        CREATE TRIGGER trg_rotar_qr
            BEFORE UPDATE ON usuarios
            FOR EACH ROW EXECUTE FUNCTION fn_rotar_qr_token();
    """))

    # ── 3. Función: validar QR en puerta ──────────────────────────────────────
    op.execute(text("""
        CREATE OR REPLACE FUNCTION fn_validar_qr(p_token UUID)
        RETURNS TABLE (
            es_valido           BOOLEAN,
            id_usuario          INTEGER,
            nombre_completo     TEXT,
            foto_perfil_url     TEXT,
            estado_financiero   TEXT,
            roles_activos       TEXT[],
            antiguedad_meses    INTEGER,
            mensaje_display     TEXT
        ) LANGUAGE plpgsql AS $$
        DECLARE
            v_usuario       usuarios%ROWTYPE;
            v_estado        TEXT;
            v_roles         TEXT[];
            v_antiguedad    INTEGER;
        BEGIN
            SELECT * INTO v_usuario FROM usuarios WHERE qr_token = p_token;

            IF NOT FOUND THEN
                RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Token inválido'::TEXT,
                                    NULL::TEXT, 'desconocido'::TEXT,
                                    ARRAY[]::TEXT[], 0, 'QR NO RECONOCIDO'::TEXT;
                RETURN;
            END IF;

            IF v_usuario.fecha_baja IS NOT NULL THEN
                RETURN QUERY SELECT FALSE, v_usuario.id_usuario,
                                    (v_usuario.nombre || ' ' || v_usuario.apellido),
                                    v_usuario.foto_perfil_url,
                                    'inactivo'::TEXT, ARRAY[]::TEXT[], 0, 'SOCIO INACTIVO'::TEXT;
                RETURN;
            END IF;

            SELECT EXTRACT(YEAR  FROM AGE(CURRENT_DATE, v_usuario.fecha_ingreso))::INTEGER * 12 +
                   EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_usuario.fecha_ingreso))::INTEGER
            INTO v_antiguedad;

            SELECT ARRAY_AGG(r.nombre ORDER BY r.peso_jerarquico DESC)
            INTO v_roles
            FROM usuarios_roles ur
            JOIN roles r ON ur.id_rol = r.id_rol
            WHERE ur.id_usuario = v_usuario.id_usuario
              AND (ur.valido_hasta IS NULL OR ur.valido_hasta > NOW())
              AND r.es_activo = TRUE;

            v_estado := CASE WHEN v_usuario.deuda_historica_meses > 0 THEN 'moroso' ELSE 'al_dia' END;

            RETURN QUERY SELECT
                TRUE,
                v_usuario.id_usuario,
                (v_usuario.nombre || ' ' || v_usuario.apellido),
                v_usuario.foto_perfil_url,
                v_estado,
                COALESCE(v_roles, ARRAY[]::TEXT[]),
                v_antiguedad,
                CASE v_estado
                    WHEN 'al_dia' THEN 'SOCIO HABILITADO ✓'
                    ELSE               'SOCIO NO HABILITADO ✗'
                END;
        END;
        $$;
    """))

    # ── 4. Función: aprobación atómica de orden ────────────────────────────────
    op.execute(text("""
        CREATE OR REPLACE FUNCTION fn_aprobar_orden(
            p_id_orden  INTEGER,
            p_admin_id  INTEGER,
            p_notas     TEXT DEFAULT NULL
        )
        RETURNS JSONB LANGUAGE plpgsql AS $$
        DECLARE
            v_orden     ordenes%ROWTYPE;
            v_detalle   detalles_orden%ROWTYPE;
            v_resultado JSONB := '{"ok": true, "acciones": []}'::JSONB;
        BEGIN
            SELECT * INTO v_orden FROM ordenes WHERE id_orden = p_id_orden FOR UPDATE;

            IF NOT FOUND THEN
                RETURN '{"ok": false, "error": "Orden no encontrada"}'::JSONB;
            END IF;

            IF v_orden.estado != 'pendiente_verificacion' THEN
                RETURN jsonb_build_object('ok', false,
                    'error', 'La orden ya fue procesada: ' || v_orden.estado);
            END IF;

            FOR v_detalle IN SELECT * FROM detalles_orden WHERE id_orden = p_id_orden LOOP

                -- Cuota social
                IF v_detalle.mes_referencia IS NOT NULL THEN
                    UPDATE usuarios SET
                        mes_cubierto_hasta    = GREATEST(COALESCE(mes_cubierto_hasta, CURRENT_DATE),
                                                         v_detalle.mes_referencia)
                                                + INTERVAL '1 month' * v_detalle.cantidad,
                        deuda_historica_meses = GREATEST(0, deuda_historica_meses - v_detalle.cantidad)
                    WHERE id_usuario = v_orden.id_usuario;
                    v_resultado := jsonb_set(v_resultado, '{acciones}',
                        v_resultado->'acciones' || '["cuota_saldada"]'::JSONB);
                END IF;

                -- Alquiler: confirmar reserva
                IF v_detalle.id_reserva IS NOT NULL THEN
                    UPDATE reservas_instalaciones SET estado = 'confirmada'
                    WHERE id_reserva = v_detalle.id_reserva;
                    v_resultado := jsonb_set(v_resultado, '{acciones}',
                        v_resultado->'acciones' || '["reserva_confirmada"]'::JSONB);
                END IF;

                -- Indumentaria: descontar stock
                UPDATE productos_servicios
                SET stock = stock - v_detalle.cantidad
                WHERE id_producto = v_detalle.id_producto AND stock IS NOT NULL;

                IF FOUND THEN
                    v_resultado := jsonb_set(v_resultado, '{acciones}',
                        v_resultado->'acciones' || '["stock_descontado"]'::JSONB);
                END IF;

            END LOOP;

            UPDATE ordenes SET
                estado       = 'aprobada',
                aprobada_por = p_admin_id,
                aprobada_at  = NOW(),
                notas_admin  = p_notas
            WHERE id_orden = p_id_orden;

            INSERT INTO audit_log (usuario_actor, accion, tabla_afectada, registro_id, detalle)
            VALUES (p_admin_id, 'APROBAR_ORDEN', 'ordenes', p_id_orden,
                    jsonb_build_object('orden_id', p_id_orden, 'resultado', v_resultado));

            INSERT INTO notificaciones (id_usuario, tipo, titulo, cuerpo, referencia_id, referencia_tabla)
            VALUES (v_orden.id_usuario, 'orden_aprobada', 'Pago confirmado',
                    'Tu orden #' || p_id_orden || ' fue aprobada.', p_id_orden, 'ordenes');

            RETURN v_resultado;
        END;
        $$;
    """))

    # ── 5. Función: verificar antigüedad para comisión directiva ───────────────
    op.execute(text("""
        CREATE OR REPLACE FUNCTION fn_verificar_directivo(p_id_usuario INTEGER)
        RETURNS JSONB LANGUAGE plpgsql AS $$
        DECLARE
            v_meses INTEGER;
        BEGIN
            SELECT
                EXTRACT(YEAR  FROM AGE(CURRENT_DATE, fecha_ingreso))::INTEGER * 12 +
                EXTRACT(MONTH FROM AGE(CURRENT_DATE, fecha_ingreso))::INTEGER
            INTO v_meses
            FROM usuarios WHERE id_usuario = p_id_usuario;

            IF v_meses >= 24 THEN
                UPDATE usuarios SET is_directivo = TRUE WHERE id_usuario = p_id_usuario;
                RETURN jsonb_build_object('ok', true, 'antiguedad_meses', v_meses);
            ELSE
                RETURN jsonb_build_object(
                    'ok',              false,
                    'antiguedad_meses', v_meses,
                    'falta_meses',      24 - v_meses,
                    'mensaje',          'Se requieren 24 meses. Faltan ' || (24 - v_meses) || ' meses.'
                );
            END IF;
        END;
        $$;
    """))


def downgrade() -> None:
    """
    Elimina en orden inverso: primero triggers (dependen de funciones),
    luego las funciones.
    """
    # Triggers
    op.execute(text("DROP TRIGGER IF EXISTS trg_rotar_qr       ON usuarios;"))
    op.execute(text("DROP TRIGGER IF EXISTS trg_usuarios_search ON usuarios;"))

    # Funciones
    op.execute(text("DROP FUNCTION IF EXISTS fn_verificar_directivo(INTEGER);"))
    op.execute(text("DROP FUNCTION IF EXISTS fn_aprobar_orden(INTEGER, INTEGER, TEXT);"))
    op.execute(text("DROP FUNCTION IF EXISTS fn_validar_qr(UUID);"))
    op.execute(text("DROP FUNCTION IF EXISTS fn_rotar_qr_token();"))
    op.execute(text("DROP FUNCTION IF EXISTS fn_actualizar_search_usuario();"))

