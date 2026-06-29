-- =============================================================================
-- SISTEMA DE GESTIÓN - CLUB ATLÉTICO
-- Schema completo PostgreSQL
-- Módulos: Identidad & Accesos | E-Commerce & Finanzas | Deportivo & Eventos | Config Global
-- =============================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "unaccent";   -- para búsquedas sin tilde

-- =============================================================================
-- MÓDULO 0: CONFIGURACIÓN GLOBAL
-- Debe crearse primero porque otras tablas la referencian en lógica de negocio.
-- Acceso exclusivo del Administrador General.
-- =============================================================================

CREATE TABLE configuracion_global (
    id                          SERIAL          PRIMARY KEY,

    -- Cuota social
    valor_cuota_base            NUMERIC(10,2)   NOT NULL,           -- Ej: 4000.00

    -- Beneficios por antigüedad
    meses_antiguedad_beneficio  INTEGER         NOT NULL DEFAULT 6,  -- Meses para acceder al descuento
    descuento_beneficio         NUMERIC(5,2)    NOT NULL DEFAULT 15, -- % de descuento en alquileres

    -- Metadatos de auditoría de la config
    actualizado_por             INTEGER,        -- FK a usuarios (se agrega constraint al final)
    actualizado_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Solo puede existir UNA fila de configuración global
CREATE UNIQUE INDEX idx_configuracion_global_singleton ON configuracion_global ((TRUE));

COMMENT ON TABLE configuracion_global IS
    'Cerebro financiero del sistema. Una sola fila. Solo el Admin General puede modificarla.';
COMMENT ON COLUMN configuracion_global.valor_cuota_base IS
    'Al modificar este campo, la deuda de todos los morosos se recalcula dinámicamente.';
COMMENT ON COLUMN configuracion_global.descuento_beneficio IS
    'Porcentaje (0-100) de descuento en alquiler de instalaciones por antigüedad.';


-- =============================================================================
-- MÓDULO 1: IDENTIDAD & ACCESOS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLA: roles
-- Catálogo maestro de roles del sistema.
-- -----------------------------------------------------------------------------
CREATE TABLE roles (
    id_rol              SERIAL          PRIMARY KEY,
    nombre              VARCHAR(50)     NOT NULL UNIQUE,    -- 'socio', 'jugador', 'personal_tecnico', etc.
    descripcion         TEXT,
    peso_jerarquico     INTEGER         NOT NULL DEFAULT 0, -- Mayor número = mayor jerarquía
    es_activo           BOOLEAN         NOT NULL DEFAULT TRUE
);

COMMENT ON COLUMN roles.peso_jerarquico IS
    'Permite ordenar y comparar roles. Admin General = 100, Socio = 10, Invitado = 1.';

-- Seed de roles del sistema
INSERT INTO roles (nombre, descripcion, peso_jerarquico) VALUES
    ('admin_general',        'Acceso completo de lectura y escritura total. Único con acceso a configuración global.', 100),
    ('personal_administrativo', 'Gestión contable, cuotas, verificación de comprobantes y aprobación de órdenes.',    60),
    ('personal_tecnico',     'Gestión deportiva: jugadores, categorías, asistencias y convocatorias.',                50),
    ('admin_temporal',       'Rol de portería asignado por evento. Expira automáticamente al cierre del evento.',     40),
    ('jugador',              'Hereda derechos de Socio + panel de Calendario Deportivo.',                             20),
    ('socio',                'Rol base. QR dinámico, cuotas, alquileres, tienda oficial e historial de pagos.',       10),
    ('invitado',             'Solo accede al lector QR/DNI para validación de beneficios comerciales.',                1);


-- -----------------------------------------------------------------------------
-- TABLA: usuarios
-- Núcleo del sistema. Un registro por persona física.
-- La clave de negocio inmutable es el DNI.
-- -----------------------------------------------------------------------------
CREATE TABLE usuarios (
    id_usuario              SERIAL          PRIMARY KEY,
    dni                     VARCHAR(10)     NOT NULL UNIQUE,            -- Clave de negocio inmutable

    -- Datos personales
    nombre                  VARCHAR(100)    NOT NULL,
    apellido                VARCHAR(100)    NOT NULL,
    email                   VARCHAR(150)    UNIQUE,
    telefono                VARCHAR(30),
    direccion               VARCHAR(200),
    foto_perfil_url         TEXT,

    -- Seguridad
    password_hash           VARCHAR(255)    NOT NULL,
    requiere_cambio_password BOOLEAN        NOT NULL DEFAULT TRUE,      -- TRUE en primer ingreso
    ultimo_login_at         TIMESTAMPTZ,

    -- QR dinámico (token opaco, nunca datos planos)
    qr_token                UUID            NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    qr_generado_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- Estado financiero (calculado en runtime, pero cacheado para performance)
    mes_cubierto_hasta      DATE,                                       -- NULL = nunca pagó
    deuda_historica_meses   INTEGER         NOT NULL DEFAULT 0,         -- Meses adeudados (NO pesos)

    -- Ciclo de vida
    fecha_nacimiento        DATE,
    fecha_ingreso           DATE            NOT NULL DEFAULT CURRENT_DATE,
    fecha_baja              DATE,                                       -- NULL = activo

    -- Flags especiales
    is_directivo            BOOLEAN         NOT NULL DEFAULT FALSE,
    nombre_completo_search  TSVECTOR,                                   -- Para búsqueda full-text

    -- Titular para socios adherentes (familia)
    id_titular              INTEGER         REFERENCES usuarios(id_usuario) ON DELETE SET NULL,

    -- Notificaciones
    push_token              VARCHAR(255),                               -- Web Push o device token

    -- Metadatos
    creado_at               TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    actualizado_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Índices de búsqueda frecuente
CREATE INDEX idx_usuarios_dni            ON usuarios (dni);
CREATE INDEX idx_usuarios_apellido       ON usuarios (apellido);
CREATE INDEX idx_usuarios_fecha_baja     ON usuarios (fecha_baja) WHERE fecha_baja IS NULL;
CREATE INDEX idx_usuarios_qr_token       ON usuarios (qr_token);
CREATE INDEX idx_usuarios_search         ON usuarios USING GIN (nombre_completo_search);

-- Trigger: mantener tsvector actualizado para búsqueda por nombre
CREATE OR REPLACE FUNCTION fn_actualizar_search_usuario()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.nombre_completo_search := to_tsvector('spanish',
        unaccent(COALESCE(NEW.apellido, '')) || ' ' ||
        unaccent(COALESCE(NEW.nombre, '')) || ' ' ||
        COALESCE(NEW.dni, '')
    );
    NEW.actualizado_at := NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_usuarios_search
    BEFORE INSERT OR UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_actualizar_search_usuario();

-- Trigger: rotar QR token automáticamente al cambiar estado financiero
CREATE OR REPLACE FUNCTION fn_rotar_qr_token()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Rota el token si cambia el estado de deuda o mes cubierto
    IF OLD.deuda_historica_meses IS DISTINCT FROM NEW.deuda_historica_meses
    OR OLD.mes_cubierto_hasta    IS DISTINCT FROM NEW.mes_cubierto_hasta THEN
        NEW.qr_token        := gen_random_uuid();
        NEW.qr_generado_at  := NOW();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_rotar_qr
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION fn_rotar_qr_token();

COMMENT ON COLUMN usuarios.qr_token IS
    'Token opaco UUID. El QR nunca expone datos planos. Se rota al cambiar estado financiero.';
COMMENT ON COLUMN usuarios.deuda_historica_meses IS
    'Cantidad de meses adeudados. Deuda total = deuda_historica_meses × valor_cuota_base_vigente.';
COMMENT ON COLUMN usuarios.mes_cubierto_hasta IS
    'Si pagó por adelantado, queda inmune a aumentos hasta esta fecha.';
COMMENT ON COLUMN usuarios.requiere_cambio_password IS
    'TRUE para socios migrados desde Excel. El frontend bloquea navegación hasta que cambien la clave.';


-- -----------------------------------------------------------------------------
-- TABLA: usuarios_roles (tabla puente MULTIROL)
-- Un usuario puede tener múltiples roles simultáneos.
-- -----------------------------------------------------------------------------
CREATE TABLE usuarios_roles (
    id_usuario          INTEGER         NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    id_rol              INTEGER         NOT NULL REFERENCES roles(id_rol) ON DELETE RESTRICT,

    -- Para roles temporales (ej: admin_temporal durante un partido)
    valido_hasta        TIMESTAMPTZ,                    -- NULL = permanente
    asignado_por        INTEGER         REFERENCES usuarios(id_usuario),
    asignado_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id_usuario, id_rol)
);

CREATE INDEX idx_usuarios_roles_usuario ON usuarios_roles (id_usuario);
CREATE INDEX idx_usuarios_roles_expiry  ON usuarios_roles (valido_hasta) WHERE valido_hasta IS NOT NULL;

COMMENT ON COLUMN usuarios_roles.valido_hasta IS
    'Para admin_temporal: se completa con la fecha de cierre del evento. Job programado lo limpia.';


-- =============================================================================
-- MÓDULO 2: AUDITORÍA
-- Registro inmutable de toda acción sensible del sistema.
-- =============================================================================

CREATE TABLE audit_log (
    id                  BIGSERIAL       PRIMARY KEY,
    usuario_actor       INTEGER         REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    accion              VARCHAR(100)    NOT NULL,        -- 'APROBAR_ORDEN', 'CAMBIO_ROL', 'BAJA_USUARIO', etc.
    tabla_afectada      VARCHAR(60)     NOT NULL,
    registro_id         INTEGER,                        -- ID del registro afectado
    detalle             JSONB,                          -- {antes: {...}, despues: {...}}
    ip_origen           INET,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Solo índices de lectura, esta tabla nunca se modifica
CREATE INDEX idx_audit_log_actor      ON audit_log (usuario_actor);
CREATE INDEX idx_audit_log_accion     ON audit_log (accion);
CREATE INDEX idx_audit_log_tabla      ON audit_log (tabla_afectada, registro_id);
CREATE INDEX idx_audit_log_created_at ON audit_log (created_at DESC);

COMMENT ON TABLE audit_log IS
    'Tabla de solo escritura. Nunca se actualiza ni elimina. Trazabilidad completa del sistema.';


-- =============================================================================
-- MÓDULO 3: E-COMMERCE & FINANZAS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLA: productos_servicios
-- Catálogo unificado de todo lo que se puede comprar/reservar en el sistema.
-- Categorías posibles: 'cuota_social', 'alquiler', 'indumentaria'
-- -----------------------------------------------------------------------------
CREATE TABLE productos_servicios (
    id_producto         SERIAL          PRIMARY KEY,
    nombre              VARCHAR(150)    NOT NULL,
    categoria           VARCHAR(50)     NOT NULL CHECK (categoria IN ('cuota_social', 'alquiler', 'indumentaria', 'otro')),
    descripcion         TEXT,
    precio_actual       NUMERIC(10,2)   NOT NULL,
    stock               INTEGER,                        -- NULL = sin límite (ej: cuota social)
    es_activo           BOOLEAN         NOT NULL DEFAULT TRUE,
    imagen_url          TEXT,
    creado_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    actualizado_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_productos_categoria ON productos_servicios (categoria) WHERE es_activo = TRUE;

COMMENT ON COLUMN productos_servicios.stock IS
    'NULL para servicios sin stock físico (cuota social). Integer para indumentaria.';


-- -----------------------------------------------------------------------------
-- TABLA: reservas_instalaciones
-- Controla la agenda y evita conflictos de doble reserva.
-- Se crea ANTES de aprobar la orden para bloquear el horario.
-- -----------------------------------------------------------------------------
CREATE TABLE reservas_instalaciones (
    id_reserva          SERIAL          PRIMARY KEY,
    id_producto         INTEGER         NOT NULL REFERENCES productos_servicios(id_producto),
    instalacion         VARCHAR(100)    NOT NULL,       -- 'quincho', 'cancha_1', 'cancha_2', etc.
    fecha_inicio        TIMESTAMPTZ     NOT NULL,
    fecha_fin           TIMESTAMPTZ     NOT NULL,
    estado              VARCHAR(30)     NOT NULL DEFAULT 'bloqueada'
                            CHECK (estado IN ('bloqueada', 'confirmada', 'liberada', 'expirada')),
    id_orden            INTEGER,                        -- FK a ordenes (se agrega al final)
    creado_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_reserva_fechas CHECK (fecha_fin > fecha_inicio)
);

-- Índice para detección de conflictos de horario (exclusión por rango)
CREATE INDEX idx_reservas_instalacion_tiempo
    ON reservas_instalaciones (instalacion, fecha_inicio, fecha_fin)
    WHERE estado IN ('bloqueada', 'confirmada');

COMMENT ON TABLE reservas_instalaciones IS
    'Una reserva se crea en estado bloqueada al generar la orden. Pasa a confirmada al aprobarla, y a liberada si se rechaza o expira.';


-- -----------------------------------------------------------------------------
-- TABLA: ordenes
-- Cabecera del movimiento contable. Una orden agrupa varios ítems en un pago.
-- -----------------------------------------------------------------------------
CREATE TABLE ordenes (
    id_orden            SERIAL          PRIMARY KEY,
    id_usuario          INTEGER         NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    fecha_creacion      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    estado              VARCHAR(40)     NOT NULL DEFAULT 'pendiente_verificacion'
                            CHECK (estado IN (
                                'pendiente_verificacion',   -- Socio generó la orden, esperando pago
                                'aprobada',                 -- Admin verificó el comprobante
                                'rechazada',                -- Comprobante inválido o no coincide
                                'cancelada_socio',          -- El socio canceló antes de pagar
                                'expirada'                  -- Pasó el tiempo límite sin comprobante
                            )),
    monto_total         NUMERIC(10,2)   NOT NULL,
    comprobante_url     TEXT,                           -- URL del comprobante subido por el socio
    motivo_rechazo      TEXT,                           -- Obligatorio al rechazar (lo completa el admin)
    aprobada_por        INTEGER         REFERENCES usuarios(id_usuario),
    aprobada_at         TIMESTAMPTZ,
    expira_at           TIMESTAMPTZ     NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'), -- Auto-expiración
    notas_admin         TEXT
);

CREATE INDEX idx_ordenes_usuario        ON ordenes (id_usuario);
CREATE INDEX idx_ordenes_estado         ON ordenes (estado) WHERE estado = 'pendiente_verificacion';
CREATE INDEX idx_ordenes_expira_at      ON ordenes (expira_at) WHERE estado = 'pendiente_verificacion';

COMMENT ON COLUMN ordenes.expira_at IS
    'Un job programado revisa periódicamente y marca como expirada las órdenes vencidas, liberando stock y reservas.';
COMMENT ON COLUMN ordenes.motivo_rechazo IS
    'Requerido si estado = rechazada. El admin debe explicar por qué (ej: monto no coincide).';


-- -----------------------------------------------------------------------------
-- TABLA: detalles_orden
-- Ítems individuales dentro de una orden. Guarda precio histórico al momento
-- de la compra para no verse afectado por actualizaciones futuras de precio.
-- -----------------------------------------------------------------------------
CREATE TABLE detalles_orden (
    id_detalle                  SERIAL          PRIMARY KEY,
    id_orden                    INTEGER         NOT NULL REFERENCES ordenes(id_orden) ON DELETE CASCADE,
    id_producto                 INTEGER         NOT NULL REFERENCES productos_servicios(id_producto),
    cantidad                    INTEGER         NOT NULL DEFAULT 1 CHECK (cantidad > 0),
    precio_unitario_historico   NUMERIC(10,2)   NOT NULL,   -- Precio congelado al momento de la compra
    mes_referencia              DATE,                       -- Para ítems de cuota social (ej: 2025-06-01)
    id_reserva                  INTEGER         REFERENCES reservas_instalaciones(id_reserva)
);

CREATE INDEX idx_detalles_orden_orden    ON detalles_orden (id_orden);
CREATE INDEX idx_detalles_orden_producto ON detalles_orden (id_producto);

COMMENT ON COLUMN detalles_orden.precio_unitario_historico IS
    'CRÍTICO: al aprobar la orden, usar SIEMPRE este valor, nunca precio_actual del producto.';
COMMENT ON COLUMN detalles_orden.mes_referencia IS
    'Para cuotas: almacena el mes al que corresponde el pago (2025-06-01 = Junio 2025).';


-- FK circular: ordenes ↔ reservas_instalaciones
ALTER TABLE reservas_instalaciones
    ADD CONSTRAINT fk_reservas_orden FOREIGN KEY (id_orden)
    REFERENCES ordenes(id_orden) ON DELETE SET NULL;


-- =============================================================================
-- MÓDULO 4: DEPORTIVO & EVENTOS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABLA: categorias_deportivas
-- Divisiones del club: Sub-12, Sub-15, Primera División, etc.
-- -----------------------------------------------------------------------------
CREATE TABLE categorias_deportivas (
    id_categoria        SERIAL          PRIMARY KEY,
    nombre              VARCHAR(100)    NOT NULL UNIQUE,
    descripcion         TEXT,
    es_activa           BOOLEAN         NOT NULL DEFAULT TRUE
);


-- -----------------------------------------------------------------------------
-- TABLA: usuarios_categorias (tabla puente)
-- Un jugador puede pertenecer a múltiples categorías.
-- -----------------------------------------------------------------------------
CREATE TABLE usuarios_categorias (
    id_usuario          INTEGER         NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    id_categoria        INTEGER         NOT NULL REFERENCES categorias_deportivas(id_categoria) ON DELETE CASCADE,
    temporada           VARCHAR(10)     NOT NULL DEFAULT TO_CHAR(CURRENT_DATE, 'YYYY'), -- '2025'
    es_capitan          BOOLEAN         NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id_usuario, id_categoria, temporada)
);


-- -----------------------------------------------------------------------------
-- TABLA: eventos
-- Partidos, torneos, entrenamientos u otros eventos institucionales.
-- Cada control de puerta se asocia a un evento activo.
-- -----------------------------------------------------------------------------
CREATE TABLE eventos (
    id_evento           SERIAL          PRIMARY KEY,
    titulo              VARCHAR(200)    NOT NULL,
    tipo                VARCHAR(50)     NOT NULL CHECK (tipo IN ('partido', 'torneo', 'entrenamiento', 'institucional', 'otro')),
    descripcion         TEXT,
    id_categoria        INTEGER         REFERENCES categorias_deportivas(id_categoria),
    fecha_inicio        TIMESTAMPTZ     NOT NULL,
    fecha_fin           TIMESTAMPTZ,
    ubicacion           VARCHAR(200),
    estado              VARCHAR(30)     NOT NULL DEFAULT 'programado'
                            CHECK (estado IN ('programado', 'en_curso', 'finalizado', 'cancelado')),
    creado_por          INTEGER         REFERENCES usuarios(id_usuario),
    creado_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_eventos_fecha    ON eventos (fecha_inicio DESC);
CREATE INDEX idx_eventos_estado   ON eventos (estado) WHERE estado IN ('programado', 'en_curso');


-- -----------------------------------------------------------------------------
-- TABLA: asistencias
-- Registro de cada ingreso escaneado en puerta, vinculado a un evento.
-- Generado por el Lector QR/DNI. Inmutable una vez creado.
-- -----------------------------------------------------------------------------
CREATE TABLE asistencias (
    id_asistencia       BIGSERIAL       PRIMARY KEY,
    id_evento           INTEGER         NOT NULL REFERENCES eventos(id_evento) ON DELETE RESTRICT,
    id_usuario          INTEGER         NOT NULL REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
    fecha_hora_ingreso  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    metodo              VARCHAR(10)     NOT NULL CHECK (metodo IN ('QR', 'DNI')),   -- QR escaneado o búsqueda manual
    registrado_por      INTEGER         NOT NULL REFERENCES usuarios(id_usuario),   -- Operador en puerta
    estado_financiero_snapshot VARCHAR(20) NOT NULL CHECK (estado_financiero_snapshot IN ('al_dia', 'moroso'))
    -- Snapshot del estado al momento del ingreso (no depende de cambios posteriores)
);

CREATE INDEX idx_asistencias_evento   ON asistencias (id_evento);
CREATE INDEX idx_asistencias_usuario  ON asistencias (id_usuario);
CREATE INDEX idx_asistencias_fecha    ON asistencias (fecha_hora_ingreso DESC);

COMMENT ON TABLE asistencias IS
    'Registro inmutable de ingresos. El campo estado_financiero_snapshot guarda el estado al momento del escaneo.';


-- =============================================================================
-- MÓDULO 5: NOTIFICACIONES
-- Centro de mensajes internos del sistema para los usuarios.
-- =============================================================================

CREATE TABLE notificaciones (
    id_notificacion     BIGSERIAL       PRIMARY KEY,
    id_usuario          INTEGER         NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    tipo                VARCHAR(60)     NOT NULL CHECK (tipo IN (
                            'orden_aprobada',
                            'orden_rechazada',
                            'cuota_vencida',
                            'reserva_confirmada',
                            'reserva_cancelada',
                            'rol_asignado',
                            'rol_removido',
                            'convocatoria_partido',
                            'sistema'
                        )),
    titulo              VARCHAR(150)    NOT NULL,
    cuerpo              TEXT,
    leida               BOOLEAN         NOT NULL DEFAULT FALSE,
    referencia_id       INTEGER,                            -- ID de la orden, evento, etc. relacionado
    referencia_tabla    VARCHAR(60),                        -- 'ordenes', 'eventos', etc.
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notificaciones_usuario_no_leidas
    ON notificaciones (id_usuario, created_at DESC)
    WHERE leida = FALSE;


-- =============================================================================
-- CONSTRAINTS DIFERIDOS (FKs circulares resueltas al final)
-- =============================================================================

-- configuracion_global → usuarios (admin que actualizó)
ALTER TABLE configuracion_global
    ADD CONSTRAINT fk_config_actualizado_por
    FOREIGN KEY (actualizado_por) REFERENCES usuarios(id_usuario) ON DELETE SET NULL;


-- =============================================================================
-- VISTAS ÚTILES
-- =============================================================================

-- Vista: estado financiero completo de cada socio
CREATE OR REPLACE VIEW v_estado_financiero AS
SELECT
    u.id_usuario,
    u.dni,
    u.nombre || ' ' || u.apellido                                   AS nombre_completo,
    u.mes_cubierto_hasta,
    u.deuda_historica_meses,
    cg.valor_cuota_base,
    u.deuda_historica_meses * cg.valor_cuota_base                   AS deuda_total_calculada,
    CASE
        WHEN u.fecha_baja IS NOT NULL                               THEN 'inactivo'
        WHEN u.deuda_historica_meses > 0                            THEN 'moroso'
        WHEN u.mes_cubierto_hasta >= CURRENT_DATE                   THEN 'al_dia'
        ELSE 'al_dia'
    END                                                             AS estado_financiero,
    -- Antigüedad en meses
    EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.fecha_ingreso)) * 12 +
    EXTRACT(MONTH FROM AGE(CURRENT_DATE, u.fecha_ingreso))          AS antiguedad_meses,
    -- ¿Aplica descuento por antigüedad?
    CASE
        WHEN (
            EXTRACT(YEAR FROM AGE(CURRENT_DATE, u.fecha_ingreso)) * 12 +
            EXTRACT(MONTH FROM AGE(CURRENT_DATE, u.fecha_ingreso))
        ) >= cg.meses_antiguedad_beneficio                          THEN TRUE
        ELSE FALSE
    END                                                             AS aplica_descuento_antiguedad,
    cg.descuento_beneficio                                          AS porcentaje_descuento
FROM usuarios u
CROSS JOIN configuracion_global cg
WHERE u.fecha_baja IS NULL;

COMMENT ON VIEW v_estado_financiero IS
    'Calcula deuda en tiempo real: meses_adeudados × cuota_vigente. Sin pesos históricos.';


-- Vista: roles activos de cada usuario (excluyendo roles temporales vencidos)
CREATE OR REPLACE VIEW v_usuarios_roles_activos AS
SELECT
    u.id_usuario,
    u.dni,
    u.nombre || ' ' || u.apellido   AS nombre_completo,
    u.fecha_baja,
    r.nombre                        AS rol,
    r.peso_jerarquico,
    ur.valido_hasta,
    ur.asignado_at
FROM usuarios u
JOIN usuarios_roles ur  ON u.id_usuario = ur.id_usuario
JOIN roles r            ON ur.id_rol    = r.id_rol
WHERE r.es_activo = TRUE
  AND (ur.valido_hasta IS NULL OR ur.valido_hasta > NOW());


-- Vista: reporte de asistencia por evento (para el cierre de puerta)
CREATE OR REPLACE VIEW v_reporte_evento AS
SELECT
    e.id_evento,
    e.titulo,
    e.fecha_inicio,
    COUNT(a.id_asistencia)                                          AS total_ingresos,
    COUNT(CASE WHEN a.metodo = 'QR'  THEN 1 END)                   AS ingresos_qr,
    COUNT(CASE WHEN a.metodo = 'DNI' THEN 1 END)                   AS ingresos_manual,
    COUNT(CASE WHEN a.estado_financiero_snapshot = 'al_dia'   THEN 1 END) AS socios_al_dia,
    COUNT(CASE WHEN a.estado_financiero_snapshot = 'moroso'   THEN 1 END) AS socios_morosos,
    COUNT(CASE WHEN r.nombre = 'jugador' THEN 1 END)               AS jugadores_federados
FROM eventos e
LEFT JOIN asistencias a     ON e.id_evento   = a.id_evento
LEFT JOIN usuarios_roles ur ON a.id_usuario  = ur.id_usuario
LEFT JOIN roles r           ON ur.id_rol     = r.id_rol AND r.nombre = 'jugador'
GROUP BY e.id_evento, e.titulo, e.fecha_inicio;


-- =============================================================================
-- FUNCIÓN: Validación de ingreso por QR
-- El backend llama a esta función al escanear un token.
-- Devuelve toda la info necesaria para renderizar la tarjeta de aprobación.
-- =============================================================================

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
    -- Buscar usuario por token QR
    SELECT * INTO v_usuario FROM usuarios WHERE qr_token = p_token;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Token inválido'::TEXT,
                            NULL::TEXT, 'desconocido'::TEXT, ARRAY[]::TEXT[], 0, 'QR NO RECONOCIDO'::TEXT;
        RETURN;
    END IF;

    -- Usuario dado de baja
    IF v_usuario.fecha_baja IS NOT NULL THEN
        RETURN QUERY SELECT FALSE, v_usuario.id_usuario,
                            v_usuario.nombre || ' ' || v_usuario.apellido,
                            v_usuario.foto_perfil_url,
                            'inactivo'::TEXT, ARRAY[]::TEXT[], 0, 'SOCIO INACTIVO'::TEXT;
        RETURN;
    END IF;

    -- Calcular antigüedad
    SELECT EXTRACT(YEAR FROM AGE(CURRENT_DATE, v_usuario.fecha_ingreso))::INTEGER * 12 +
           EXTRACT(MONTH FROM AGE(CURRENT_DATE, v_usuario.fecha_ingreso))::INTEGER
    INTO v_antiguedad;

    -- Obtener roles activos
    SELECT ARRAY_AGG(r.nombre ORDER BY r.peso_jerarquico DESC)
    INTO v_roles
    FROM usuarios_roles ur
    JOIN roles r ON ur.id_rol = r.id_rol
    WHERE ur.id_usuario = v_usuario.id_usuario
      AND (ur.valido_hasta IS NULL OR ur.valido_hasta > NOW())
      AND r.es_activo = TRUE;

    -- Estado financiero
    IF v_usuario.deuda_historica_meses > 0 THEN
        v_estado := 'moroso';
    ELSE
        v_estado := 'al_dia';
    END IF;

    RETURN QUERY SELECT
        TRUE,
        v_usuario.id_usuario,
        v_usuario.nombre || ' ' || v_usuario.apellido,
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

COMMENT ON FUNCTION fn_validar_qr IS
    'Punto de entrada del lector de puerta. Recibe el UUID del QR y devuelve la tarjeta de aprobación.';


-- =============================================================================
-- FUNCIÓN: Aprobación atómica de orden
-- Las tres acciones (cuotas, reservas, stock) ocurren en una sola transacción.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_aprobar_orden(
    p_id_orden      INTEGER,
    p_admin_id      INTEGER,
    p_notas         TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_orden         ordenes%ROWTYPE;
    v_detalle       detalles_orden%ROWTYPE;
    v_resultado     JSONB := '{"ok": true, "acciones": []}'::JSONB;
BEGIN
    -- Lock de la orden para evitar doble aprobación
    SELECT * INTO v_orden FROM ordenes WHERE id_orden = p_id_orden FOR UPDATE;

    IF NOT FOUND THEN
        RETURN '{"ok": false, "error": "Orden no encontrada"}'::JSONB;
    END IF;

    IF v_orden.estado != 'pendiente_verificacion' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'La orden ya fue procesada: ' || v_orden.estado);
    END IF;

    -- Procesar cada ítem de la orden
    FOR v_detalle IN SELECT * FROM detalles_orden WHERE id_orden = p_id_orden LOOP

        -- CASO 1: Cuota social → actualizar mes_cubierto_hasta y deuda
        IF v_detalle.mes_referencia IS NOT NULL THEN
            UPDATE usuarios
            SET
                mes_cubierto_hasta    = GREATEST(COALESCE(mes_cubierto_hasta, CURRENT_DATE), v_detalle.mes_referencia) + INTERVAL '1 month' * v_detalle.cantidad,
                deuda_historica_meses = GREATEST(0, deuda_historica_meses - v_detalle.cantidad)
            WHERE id_usuario = v_orden.id_usuario;

            v_resultado := jsonb_set(v_resultado, '{acciones}',
                v_resultado->'acciones' || '["cuota_saldada"]'::JSONB);
        END IF;

        -- CASO 2: Alquiler → confirmar reserva
        IF v_detalle.id_reserva IS NOT NULL THEN
            UPDATE reservas_instalaciones
            SET estado = 'confirmada'
            WHERE id_reserva = v_detalle.id_reserva;

            v_resultado := jsonb_set(v_resultado, '{acciones}',
                v_resultado->'acciones' || '["reserva_confirmada"]'::JSONB);
        END IF;

        -- CASO 3: Indumentaria → descontar stock
        UPDATE productos_servicios
        SET stock = stock - v_detalle.cantidad
        WHERE id_producto = v_detalle.id_producto
          AND stock IS NOT NULL;

        IF FOUND THEN
            v_resultado := jsonb_set(v_resultado, '{acciones}',
                v_resultado->'acciones' || '["stock_descontado"]'::JSONB);
        END IF;

    END LOOP;

    -- Marcar orden como aprobada
    UPDATE ordenes
    SET
        estado        = 'aprobada',
        aprobada_por  = p_admin_id,
        aprobada_at   = NOW(),
        notas_admin   = p_notas
    WHERE id_orden = p_id_orden;

    -- Registrar en audit_log
    INSERT INTO audit_log (usuario_actor, accion, tabla_afectada, registro_id, detalle)
    VALUES (p_admin_id, 'APROBAR_ORDEN', 'ordenes', p_id_orden,
            jsonb_build_object('orden_id', p_id_orden, 'resultado', v_resultado));

    -- Notificar al socio
    INSERT INTO notificaciones (id_usuario, tipo, titulo, cuerpo, referencia_id, referencia_tabla)
    VALUES (v_orden.id_usuario, 'orden_aprobada', 'Pago confirmado',
            'Tu orden #' || p_id_orden || ' fue aprobada.',
            p_id_orden, 'ordenes');

    RETURN v_resultado;
END;
$$;


-- =============================================================================
-- FUNCIÓN: Verificar postulación a comisión directiva
-- Requiere mínimo 24 meses de antigüedad.
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_verificar_directivo(p_id_usuario INTEGER)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
    v_meses INTEGER;
BEGIN
    SELECT
        EXTRACT(YEAR FROM AGE(CURRENT_DATE, fecha_ingreso))::INTEGER * 12 +
        EXTRACT(MONTH FROM AGE(CURRENT_DATE, fecha_ingreso))::INTEGER
    INTO v_meses
    FROM usuarios WHERE id_usuario = p_id_usuario;

    IF v_meses >= 24 THEN
        UPDATE usuarios SET is_directivo = TRUE WHERE id_usuario = p_id_usuario;
        RETURN jsonb_build_object('ok', true, 'antiguedad_meses', v_meses);
    ELSE
        RETURN jsonb_build_object(
            'ok', false,
            'antiguedad_meses', v_meses,
            'falta_meses', 24 - v_meses,
            'mensaje', 'Se requieren 24 meses de antigüedad. Faltan ' || (24 - v_meses) || ' meses.'
        );
    END IF;
END;
$$;


-- =============================================================================
-- DATOS SEMILLA (solo estructura de roles ya insertada arriba)
-- El Administrador General se inserta via script Python de migración separado.
-- =============================================================================

-- Configuración global inicial (valores de ejemplo, el admin los ajusta)
INSERT INTO configuracion_global (valor_cuota_base, meses_antiguedad_beneficio, descuento_beneficio)
VALUES (4000.00, 6, 15.00);


-- =============================================================================
-- FIN DEL SCHEMA
-- Tablas creadas: 12 + 3 vistas + 4 funciones
-- Módulos: Identidad | Auditoría | E-Commerce | Deportivo | Notificaciones | Config Global
-- =============================================================================
