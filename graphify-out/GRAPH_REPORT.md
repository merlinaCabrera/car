# Graph Report - car  (2026-07-21)

## Corpus Check
- 82 files · ~397,526 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 823 nodes · 1658 edges · 104 communities (53 shown, 51 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `58bf516c`
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
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 89|Community 89]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 91|Community 91]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 93|Community 93]]
- [[_COMMUNITY_Community 94|Community 94]]
- [[_COMMUNITY_Community 95|Community 95]]
- [[_COMMUNITY_Community 96|Community 96]]
- [[_COMMUNITY_Community 97|Community 97]]
- [[_COMMUNITY_Community 98|Community 98]]
- [[_COMMUNITY_Community 99|Community 99]]
- [[_COMMUNITY_Community 100|Community 100]]
- [[_COMMUNITY_Community 101|Community 101]]
- [[_COMMUNITY_Community 102|Community 102]]
- [[_COMMUNITY_Community 103|Community 103]]

## God Nodes (most connected - your core abstractions)
1. `Usuario` - 87 edges
2. `useAuth()` - 61 edges
3. `React` - 34 edges
4. `Base` - 20 edges
5. `FastAPI` - 17 edges
6. `_extraer_ip()` - 15 edges
7. `_registrar_audit()` - 15 edges
8. `useCart()` - 15 edges
9. `registrar_pago_manual()` - 14 edges
10. `aprobar_orden()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `crear_socio_manual()` --calls--> `get_password_hash()`  [INFERRED]
  backend/routers/admin_usuarios.py → backend/security.py
- `cambiar_password()` --calls--> `verify_password()`  [INFERRED]
  backend/routers/usuarios.py → backend/security.py
- `ConvocatoriaModal()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/pages/TecnicoEventos.jsx → frontend/src/context/AuthContext.jsx
- `NuevoEventoModal()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/pages/TecnicoEventos.jsx → frontend/src/context/AuthContext.jsx
- `SeleccionMesesModal()` --calls--> `useCart()`  [EXTRACTED]
  frontend/src/pages/SocioCuotas.jsx → frontend/src/context/CartContext.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Web Application Stack** — fastapi, vite, react [INFERRED 0.90]

## Communities (104 total, 51 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.17
Nodes (12): useAuth(), AdminScannerEvento(), SelectorEvento(), ANIO_ACTUAL, AutocompletarModal(), formatearFecha(), InscribirJugadorModal(), TecnicoPlanteles() (+4 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (33): dependencies, date-fns, lucide-react, qrcode.react, react, react-big-calendar, react-dom, react-router-dom (+25 more)

### Community 2 - "Community 2"
Cohesion: 0.16
Nodes (24): Orden, Cabecera del movimiento contable. Una orden puede contener múltiples ítems., _aplicar_filtro_tipo(), aprobar_orden(), _calcular_nuevo_mes_cubierto(), contar_ordenes_pendientes(), contar_ordenes_pendientes_tienda(), _extraer_ip() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (27): AsistenciaResponse, AutocompletarPlantelResponse, ComprobanteUploadResponse, ConvocatoriaCitarCategoriaResponse, DetalleOrdenResponse, DNIValidationPayload, EventoUpdate, GenerarOrdenCuotaResponse (+19 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (22): ComercioAsociadoBase, ComercioAsociadoCreate, ComercioAsociadoResponse, ConfiguracionGlobalBase, ConfiguracionGlobalResponse, ConvocatoriaResponse, EventoBase, EventoCreate (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.24
Nodes (6): Calendario(), Footer(), Galeria(), Hero(), Historia(), Landing()

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (12): Pago, Cabecera de cobro — patrón "Split-Order bajo un único Pago".      Un Pago agrupa, checkout_carrito(), _extraer_ip(), listar_mis_compras(), listar_productos_tienda(), Request, Session (+4 more)

### Community 7 - "Community 7"
Cohesion: 0.16
Nodes (14): login_for_access_token(), Session, liberar_pre_reserva(), liberar_pre_reservas_expiradas(), listar_disponibilidad(), date, Session, Libera una reserva 'bloqueada' sin orden asociada, típicamente porque el     soc (+6 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (32): actualizar_roles_usuario(), ActualizarRolesPayload, ActualizarRolesResponse, aprobar_usuario(), crear_socio_manual(), dar_baja_socio(), editar_socio(), get_socios_activos() (+24 more)

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
Cohesion: 0.07
Nodes (24): CalendarioMensual(), claveLocal(), DIAS_SEMANA, MESES, COLORES, construirPDF(), ESTADOS_LABEL, formatFechaCorta() (+16 more)

### Community 26 - "Community 26"
Cohesion: 0.50
Nodes (3): CategoriaDeportivaBase, CategoriaDeportivaCreate, CategoriaDeportivaResponse

### Community 29 - "Community 29"
Cohesion: 0.28
Nodes (3): models.py — SQLAlchemy 2.0 Declarative Models Club Atlético — Sistema de Gestión, datetime, FastAPI

### Community 30 - "Community 30"
Cohesion: 0.20
Nodes (21): _calcular_edad(), _calcular_nuevo_mes_cubierto(), _calcular_precio_cuota(), _extraer_ip(), listar_morosos(), _obtener_dia_vencimiento(), obtener_estadisticas(), _obtener_producto_cuota_social() (+13 more)

### Community 32 - "Community 32"
Cohesion: 0.25
Nodes (16): ProductoServicio, Catálogo unificado: cuotas, alquileres e indumentaria.     stock = NULL para ser, actualizar_dia_vencimiento(), crear_producto(), DiaVencimientoResponse, DiaVencimientoUpdatePayload, editar_producto(), _extraer_ip() (+8 more)

### Community 36 - "Community 36"
Cohesion: 0.60
Nodes (4): calcularEstadoFinanciero(), fechaLocal(), parsearISO(), SocioInicio()

### Community 37 - "Community 37"
Cohesion: 0.40
Nodes (4): formatRelativeTime(), NOTIFICATION_ICONS, NotificationCard(), SocioNotificaciones()

### Community 38 - "Community 38"
Cohesion: 0.43
Nodes (13): ComercioAsociado, crear_comercio(), editar_comercio(), eliminar_comercio(), _extraer_ip(), listar_comercios(), obtener_comercio(), _obtener_comercio_o_404() (+5 more)

### Community 39 - "Community 39"
Cohesion: 0.11
Nodes (34): _calcular_antiguedad_meses(), _calcular_estado_financiero(), _construir_respuesta_desde_orm(), _es_beca_activa(), _extraer_ip(), generar_qr_token(), _hoy_local(), _obtener_dia_vencimiento() (+26 more)

### Community 43 - "Community 43"
Cohesion: 0.18
Nodes (10): colorAvatar(), COLORES_AVATAR, CompaneroCard(), formatoFechaLarga(), formatoHora(), iniciales(), JugadorEquipo(), ProximoEventoCard() (+2 more)

### Community 45 - "Community 45"
Cohesion: 0.12
Nodes (14): locales, localizer, PRODUCTO_ALQUILER_QUINCHO, ReservaCalendar(), CartContext, CartProvider(), useCart(), MainLayout() (+6 more)

### Community 46 - "Community 46"
Cohesion: 0.16
Nodes (8): CeldaDia(), fechaLocal(), formatoMoneda, isoDeFechaLocal(), NOMBRES_DIA_SEMANA, NOMBRES_MES, Reservas(), TURNOS

### Community 48 - "Community 48"
Cohesion: 0.22
Nodes (9): AvatarUploader(), formatoFechaLarga(), FORTALEZA_CONFIG, fortalezaPassword(), IndicadorFortaleza(), iniciales(), resolverFotoUrl(), SocioPerfil() (+1 more)

### Community 51 - "Community 51"
Cohesion: 0.08
Nodes (17): Frontend Index HTML, Vite Logo, App(), AuthContext, AuthProvider(), AdminComercios(), AdminInicio(), AdminPagos() (+9 more)

### Community 53 - "Community 53"
Cohesion: 0.18
Nodes (12): actualizar_perfil(), cambiar_password(), crear_usuario(), listar_usuarios(), Session, UploadFile, Un socio solo puede editar su propio perfil.     El admin_general puede editar c, Guarda la imagen en `uploads/fotos_perfil/` con un nombre único (uuid4) y     ac (+4 more)

### Community 54 - "Community 54"
Cohesion: 0.23
Nodes (7): ESTADO_CONFIG, formatearARS(), formatearFecha(), resolverUrlArchivo(), resumenItems(), SocioCompras(), TarjetaOrden()

### Community 55 - "Community 55"
Cohesion: 0.17
Nodes (4): CATEGORIAS, COLORES_CATEGORIA, formatoMoneda, SocioShopping()

### Community 56 - "Community 56"
Cohesion: 0.18
Nodes (12): calcularEstadoFinanciero(), ESTADO_CONFIG, EstadoCard(), estadoDeMes(), fechaLocal(), formatearFechaCobertura(), formatoFecha, formatoMoneda (+4 more)

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (5): AdminProductos(), CATEGORIA_BADGE_CLASSES, CATEGORIA_LABELS, CATEGORIAS, formatoMoneda

### Community 58 - "Community 58"
Cohesion: 0.33
Nodes (4): AdminScanner(), resolverVariante(), TarjetaResultado(), VARIANTES

### Community 61 - "Community 61"
Cohesion: 0.22
Nodes (8): AdminSocios(), calcularEdad(), calcularEstadoFinanciero(), calcularPrecioFinal(), fechaLocal(), formatoMoneda, parsearISO(), TABS_ROLES

### Community 66 - "Community 66"
Cohesion: 0.09
Nodes (57): Asistencia, Base, CategoriaDeportiva, Convocatoria, Evento, Notificacion, Registro inmutable de cada ingreso en puerta, vinculado a un evento.     El camp, Centro de mensajes internos. El campo referencia_id + referencia_tabla     permi (+49 more)

### Community 68 - "Community 68"
Cohesion: 0.25
Nodes (7): Agenda de instalaciones. Previene conflictos de doble reserva.     Ciclo de vida, ReservaInstalacion, listar_reservas_admin(), Session, Devuelve un listado completo de todas las reservas de instalaciones,     enrique, crear_pre_reserva(), Crea una `ReservaInstalacion` en estado 'bloqueada' (sin orden asociada     toda

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (4): Asistencias(), ESTADO_CONFIG, formatoFechaCorta(), PlanillaEvento()

### Community 79 - "Community 79"
Cohesion: 0.50
Nodes (4): get_current_user(), Session, Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.     Lanz, HTTPAuthorizationCredentials

### Community 88 - "Community 88"
Cohesion: 0.67
Nodes (3): Backend Requirements, Pydantic, Uvicorn

## Knowledge Gaps
- **78 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+73 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **51 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Usuario` connect `Community 66` to `Community 32`, `Community 2`, `Community 68`, `Community 38`, `Community 39`, `Community 6`, `Community 7`, `Community 12`, `Community 79`, `Community 16`, `Community 53`, `Community 90`, `Community 92`, `Community 29`, `Community 30`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `React` connect `Community 51` to `Community 0`, `Community 1`, `Community 36`, `Community 37`, `Community 72`, `Community 43`, `Community 45`, `Community 46`, `Community 48`, `Community 55`, `Community 54`, `Community 23`, `Community 56`, `Community 57`, `Community 58`, `Community 61`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Community 0` to `Community 36`, `Community 5`, `Community 37`, `Community 72`, `Community 43`, `Community 45`, `Community 46`, `Community 48`, `Community 51`, `Community 55`, `Community 54`, `Community 23`, `Community 56`, `Community 57`, `Community 58`, `Community 61`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **What connects `Inyecta en la base de datos:       1. fn_actualizar_search_usuario()  + trigger`, `Elimina en orden inverso: primero triggers (dependen de funciones),     luego la`, `Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.     Lanz` to the rest of the system?**
  _219 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.07142857142857142 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.11333333333333333 - nodes in this community are weakly interconnected._