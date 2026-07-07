# Graph Report - car  (2026-07-07)

## Corpus Check
- 76 files · ~364,072 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 671 nodes · 1354 edges · 84 communities (49 shown, 35 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `648937d0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]

## God Nodes (most connected - your core abstractions)
1. `Usuario` - 72 edges
2. `useAuth()` - 48 edges
3. `React` - 28 edges
4. `Base` - 19 edges
5. `FastAPI` - 17 edges
6. `registrar_pago_manual()` - 14 edges
7. `useCart()` - 13 edges
8. `aprobar_orden()` - 12 edges
9. `validar_qr_token()` - 11 edges
10. `validar_dni()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `login_for_access_token()` --calls--> `verify_password()`  [INFERRED]
  backend/routers/auth.py → backend/security.py
- `Frontend Index HTML` --references--> `Vite Logo`  [EXTRACTED]
  frontend/index.html → frontend/public/vite.svg
- `get_current_user()` --references--> `Usuario`  [EXTRACTED]
  backend/dependencies.py → backend/models.py
- `_roles_activos()` --references--> `Usuario`  [EXTRACTED]
  backend/dependencies.py → backend/models.py
- `actualizar_dia_vencimiento()` --references--> `ConfiguracionGlobal`  [EXTRACTED]
  backend/routers/admin_productos.py → backend/models.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Web Application Stack** — fastapi, vite, react [INFERRED 0.90]

## Communities (84 total, 35 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.11
Nodes (14): AuthContext, AuthProvider(), useAuth(), AdminComercios(), AdminInicio(), AdminScannerEvento(), SelectorEvento(), AdminTienda() (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (33): dependencies, date-fns, lucide-react, qrcode.react, react, react-big-calendar, react-dom, react-router-dom (+25 more)

### Community 2 - "Community 2"
Cohesion: 0.16
Nodes (24): Orden, Cabecera del movimiento contable. Una orden puede contener múltiples ítems., _aplicar_filtro_tipo(), aprobar_orden(), _calcular_nuevo_mes_cubierto(), contar_ordenes_pendientes(), contar_ordenes_pendientes_tienda(), _extraer_ip() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (29): AsignarRolPayload, AsistenciaResponse, DetalleOrdenResponse, DNIValidationPayload, GenerarOrdenCuotaPayload, GenerarOrdenCuotaResponse, LoginPayload, NotificacionResponse (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.12
Nodes (21): CategoriaDeportivaBase, CategoriaDeportivaResponse, ComercioAsociadoBase, ComercioAsociadoCreate, ComercioAsociadoResponse, ConfiguracionGlobalBase, ConfiguracionGlobalResponse, EventoBase (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.24
Nodes (6): Calendario(), Footer(), Galeria(), Hero(), Historia(), Landing()

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (13): AuditLog, Base, ConfiguracionGlobal, DetalleOrden, Catálogo maestro de roles del sistema. Tabla estática; no la modifica el ORM., Tabla puente MULTIROL. Soporta roles temporales con fecha de expiración.     Un, Registro inmutable de toda acción sensible.     Regla de negocio: NUNCA UPDATE n, Ítems de una orden. El precio histórico se congela al momento de la compra. (+5 more)

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (5): Agenda de instalaciones. Previene conflictos de doble reserva.     Ciclo de vida, ReservaInstalacion, listar_reservas_admin(), Session, Devuelve un listado completo de todas las reservas de instalaciones,     enrique

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (38): Núcleo del sistema. Un registro por persona física.     La clave de negocio inmu, Usuario, actualizar_roles_usuario(), ActualizarRolesPayload, ActualizarRolesResponse, aprobar_usuario(), crear_socio_manual(), dar_baja_socio() (+30 more)

### Community 13 - "Community 13"
Cohesion: 0.40
Nodes (4): downgrade(), Inyecta en la base de datos:       1. fn_actualizar_search_usuario()  + trigger, Elimina en orden inverso: primero triggers (dependen de funciones),     luego la, upgrade()

### Community 14 - "Community 14"
Cohesion: 0.40
Nodes (4): DetalleOrdenCreate, OrdenCreate, Un ítem dentro del carrito. El precio se resuelve en el backend., El socio envía los ítems; el backend calcula monto_total y bloquea stock/reserva

### Community 15 - "Community 15"
Cohesion: 0.40
Nodes (5): Payload del script de migración desde Excel.     La contraseña se genera automát, Respuesta estándar. No expone password_hash.     qr_token y estado financiero so, UsuarioBase, UsuarioCreateMigracion, UsuarioResponse

### Community 16 - "Community 16"
Cohesion: 0.19
Nodes (22): _calcular_edad(), _calcular_precio_cuota(), cancelar_orden_pendiente(), _extraer_ip(), generar_orden_cuota(), obtener_estado_cuota(), obtener_historial_pagos(), obtener_orden_pendiente() (+14 more)

### Community 23 - "Community 23"
Cohesion: 0.43
Nodes (13): ComercioAsociado, crear_comercio(), editar_comercio(), eliminar_comercio(), _extraer_ip(), listar_comercios(), obtener_comercio(), _obtener_comercio_o_404() (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.36
Nodes (3): models.py — SQLAlchemy 2.0 Declarative Models Club Atlético — Sistema de Gestión, datetime, FastAPI

### Community 30 - "Community 30"
Cohesion: 0.20
Nodes (21): _calcular_edad(), _calcular_nuevo_mes_cubierto(), _calcular_precio_cuota(), _extraer_ip(), listar_morosos(), _obtener_dia_vencimiento(), obtener_estadisticas(), _obtener_producto_cuota_social() (+13 more)

### Community 32 - "Community 32"
Cohesion: 0.47
Nodes (4): formatoFechaLarga(), formatoHora(), JugadorCalendario(), TIPO_CONFIG

### Community 36 - "Community 36"
Cohesion: 0.60
Nodes (4): calcularEstadoFinanciero(), fechaLocal(), parsearISO(), SocioInicio()

### Community 37 - "Community 37"
Cohesion: 0.40
Nodes (4): formatRelativeTime(), NOTIFICATION_ICONS, NotificationCard(), SocioNotificaciones()

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (3): OrdenAdminResponse, OrdenResponse, OrdenResponse enriquecida con los datos del socio, para el panel admin.

### Community 39 - "Community 39"
Cohesion: 0.14
Nodes (25): _calcular_antiguedad_meses(), _construir_respuesta_desde_orm(), _extraer_ip(), generar_qr_token(), Request, Session, Extrae la IP real considerando proxies (X-Forwarded-For)., Calcula los meses de antigüedad desde fecha_ingreso hasta hoy. (+17 more)

### Community 43 - "Community 43"
Cohesion: 0.13
Nodes (11): Frontend Index HTML, Vite Logo, App(), AdminPagos(), formatoMoneda, AdminReservas(), JugadorEquipo(), RecuperarPassword() (+3 more)

### Community 45 - "Community 45"
Cohesion: 0.14
Nodes (12): CartContext, CartProvider(), useCart(), MainLayout(), NAV_JUGADOR, NAV_PERSONAL_TECNICO, NAV_SOCIO, SocioAlquileres() (+4 more)

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (6): locales, localizer, PRODUCTO_ALQUILER_QUINCHO, ReservaCalendar(), Reservas(), React

### Community 47 - "Community 47"
Cohesion: 0.17
Nodes (13): Pago, Cabecera de cobro — patrón "Split-Order bajo un único Pago".      Un Pago agrupa, checkout_carrito(), _extraer_ip(), listar_mis_compras(), listar_productos_tienda(), Request, Session (+5 more)

### Community 49 - "Community 49"
Cohesion: 0.20
Nodes (19): ProductoServicio, Catálogo unificado: cuotas, alquileres e indumentaria.     stock = NULL para ser, Backend Requirements, actualizar_dia_vencimiento(), crear_producto(), DiaVencimientoResponse, DiaVencimientoUpdatePayload, editar_producto() (+11 more)

### Community 52 - "Community 52"
Cohesion: 0.50
Nodes (4): get_current_user(), Session, Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.     Lanz, HTTPAuthorizationCredentials

### Community 54 - "Community 54"
Cohesion: 0.23
Nodes (7): ESTADO_CONFIG, formatearARS(), formatearFecha(), resolverUrlArchivo(), resumenItems(), SocioCompras(), TarjetaOrden()

### Community 55 - "Community 55"
Cohesion: 0.18
Nodes (3): CATEGORIAS, COLORES_CATEGORIA, formatoMoneda

### Community 56 - "Community 56"
Cohesion: 0.20
Nodes (11): calcularEstadoFinanciero(), ESTADO_CONFIG, EstadoCard(), estadoDeMes(), fechaLocal(), formatearFechaCobertura(), formatoFecha, formatoMoneda (+3 more)

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (5): AdminProductos(), CATEGORIA_BADGE_CLASSES, CATEGORIA_LABELS, CATEGORIAS, formatoMoneda

### Community 58 - "Community 58"
Cohesion: 0.33
Nodes (4): AdminScanner(), resolverVariante(), TarjetaResultado(), VARIANTES

### Community 60 - "Community 60"
Cohesion: 0.29
Nodes (8): login_for_access_token(), Session, listar_disponibilidad(), date, Session, create_access_token(), verify_password(), timedelta

### Community 61 - "Community 61"
Cohesion: 0.22
Nodes (8): AdminSocios(), calcularEdad(), calcularEstadoFinanciero(), calcularPrecioFinal(), fechaLocal(), formatoMoneda, parsearISO(), TABS_ROLES

### Community 66 - "Community 66"
Cohesion: 0.16
Nodes (29): Asistencia, CategoriaDeportiva, Evento, Divisiones del club: Sub-12, Sub-15, Primera División, etc., Tabla puente: jugador ↔ categoría deportiva.     PK compuesta: (id_usuario, id_c, Partidos, torneos, entrenamientos u otros eventos institucionales.     El contro, Registro inmutable de cada ingreso en puerta, vinculado a un evento.     El camp, UsuarioCategoria (+21 more)

### Community 68 - "Community 68"
Cohesion: 0.25
Nodes (7): Notificacion, Centro de mensajes internos. El campo referencia_id + referencia_tabla     permi, listar_notificaciones(), marcar_notificaciones_leidas(), Session, Devuelve todas las notificaciones del usuario autenticado, tanto leídas     como, Actualiza el estado de una lista de notificaciones a `leida = True`.     La oper

## Knowledge Gaps
- **59 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+54 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **35 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Usuario` connect `Community 12` to `Community 65`, `Community 2`, `Community 66`, `Community 68`, `Community 6`, `Community 7`, `Community 39`, `Community 70`, `Community 47`, `Community 16`, `Community 49`, `Community 52`, `Community 23`, `Community 26`, `Community 60`, `Community 30`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `React` connect `Community 46` to `Community 0`, `Community 1`, `Community 32`, `Community 36`, `Community 37`, `Community 43`, `Community 45`, `Community 51`, `Community 54`, `Community 55`, `Community 56`, `Community 57`, `Community 58`, `Community 61`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **What connects `Inyecta en la base de datos:       1. fn_actualizar_search_usuario()  + trigger`, `Elimina en orden inverso: primero triggers (dependen de funciones),     luego la`, `Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.     Lanz` to the rest of the system?**
  _174 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.11594202898550725 - nodes in this community are weakly interconnected._