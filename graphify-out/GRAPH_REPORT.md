# Graph Report - car  (2026-07-04)

## Corpus Check
- 67 files · ~231,655 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 558 nodes · 1060 edges · 80 communities (41 shown, 39 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `994465be`
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
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
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
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]

## God Nodes (most connected - your core abstractions)
1. `Usuario` - 52 edges
2. `useAuth()` - 37 edges
3. `React` - 25 edges
4. `Base` - 19 edges
5. `FastAPI` - 14 edges
6. `aprobar_orden()` - 12 edges
7. `validar_dni()` - 11 edges
8. `useCart()` - 11 edges
9. `ProductoServicio` - 10 edges
10. `crear_comercio()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `login_for_access_token()` --calls--> `verify_password()`  [INFERRED]
  backend/routers/auth.py → backend/security.py
- `Frontend Index HTML` --references--> `Vite Logo`  [EXTRACTED]
  frontend/index.html → frontend/public/vite.svg
- `_roles_activos()` --references--> `Usuario`  [EXTRACTED]
  backend/dependencies.py → backend/models.py
- `crear_comercio()` --references--> `Usuario`  [EXTRACTED]
  backend/routers/admin_comercios.py → backend/models.py
- `editar_comercio()` --references--> `Usuario`  [EXTRACTED]
  backend/routers/admin_comercios.py → backend/models.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Web Application Stack** — fastapi, vite, react [INFERRED 0.90]

## Communities (80 total, 39 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.14
Nodes (11): Hero(), AuthContext, AuthProvider(), useAuth(), AdminInicio(), AdminTienda(), formatoMoneda, Login() (+3 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (33): dependencies, date-fns, lucide-react, qrcode.react, react, react-big-calendar, react-dom, react-router-dom (+25 more)

### Community 2 - "Community 2"
Cohesion: 0.16
Nodes (24): Orden, Cabecera del movimiento contable. Una orden puede contener múltiples ítems., _aplicar_filtro_tipo(), aprobar_orden(), _calcular_nuevo_mes_cubierto(), contar_ordenes_pendientes(), contar_ordenes_pendientes_tienda(), _extraer_ip() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (25): AsistenciaResponse, AuditLogResponse, DetalleOrdenResponse, DNIValidationPayload, EstadisticasPagosResponse, GenerarOrdenCuotaPayload, HistorialPagoCuotaResponse, LoginPayload (+17 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (19): CategoriaDeportivaBase, CategoriaDeportivaCreate, CategoriaDeportivaResponse, ComercioAsociadoBase, ComercioAsociadoCreate, ComercioAsociadoResponse, ConfiguracionGlobalBase, ConfiguracionGlobalResponse (+11 more)

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (5): Calendario(), Footer(), Galeria(), Historia(), Landing()

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (15): Asistencia, Base, ConfiguracionGlobal, Evento, Catálogo maestro de roles del sistema. Tabla estática; no la modifica el ORM., Tabla puente MULTIROL. Soporta roles temporales con fecha de expiración.     Un, Agenda de instalaciones. Previene conflictos de doble reserva.     Ciclo de vida, Base declarativa compartida por todos los modelos. (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (41): get_current_user(), Session, Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.     Lanz, Núcleo del sistema. Un registro por persona física.     La clave de negocio inmu, Usuario, actualizar_roles_usuario(), ActualizarRolesPayload, ActualizarRolesResponse (+33 more)

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
Cohesion: 0.26
Nodes (16): cancelar_orden_pendiente(), _extraer_ip(), generar_orden_cuota(), obtener_estado_cuota(), obtener_historial_pagos(), obtener_orden_pendiente(), _obtener_producto_cuota_social(), Request (+8 more)

### Community 23 - "Community 23"
Cohesion: 0.43
Nodes (13): ComercioAsociado, crear_comercio(), editar_comercio(), eliminar_comercio(), _extraer_ip(), listar_comercios(), obtener_comercio(), _obtener_comercio_o_404() (+5 more)

### Community 26 - "Community 26"
Cohesion: 0.19
Nodes (9): Devuelve el conjunto de nombres de roles vigentes (sin expirar)., Dependencia de autorización por rol.      Uso en un endpoint:         @router.ge, require_roles(), _roles_activos(), models.py — SQLAlchemy 2.0 Declarative Models Club Atlético — Sistema de Gestión, listar_disponibilidad(), Session, datetime (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.42
Nodes (9): _extraer_ip(), listar_morosos(), obtener_estadisticas(), _obtener_producto_cuota_social(), Request, Session, Busca el producto activo de categoría 'cuota_social'. Si hay varios activos, _registrar_audit() (+1 more)

### Community 37 - "Community 37"
Cohesion: 0.50
Nodes (3): EventoBase, EventoCreate, EventoResponse

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (3): OrdenAdminResponse, OrdenResponse, OrdenResponse enriquecida con los datos del socio, para el panel admin.

### Community 39 - "Community 39"
Cohesion: 0.14
Nodes (23): _calcular_antiguedad_meses(), _construir_respuesta_desde_orm(), _extraer_ip(), generar_qr_token(), Request, Session, Extrae la IP real considerando proxies (X-Forwarded-For)., Calcula los meses de antigüedad desde fecha_ingreso hasta hoy. (+15 more)

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (8): Frontend Index HTML, Vite Logo, App(), AdminComercios(), JugadorCalendario(), RecuperarPassword(), Registro(), SocioPerfil()

### Community 45 - "Community 45"
Cohesion: 0.17
Nodes (9): CartContext, CartProvider(), useCart(), MainLayout(), SocioAlquileres(), formatoMoneda, SocioCarrito(), SeleccionMesesModal() (+1 more)

### Community 46 - "Community 46"
Cohesion: 0.15
Nodes (6): locales, localizer, ReservaCalendar(), AdminSolicitudes(), Reservas(), React

### Community 47 - "Community 47"
Cohesion: 0.15
Nodes (13): Pago, Cabecera de cobro — patrón "Split-Order bajo un único Pago".      Un Pago agrupa, checkout_carrito(), _extraer_ip(), listar_mis_compras(), listar_productos_tienda(), Request, Session (+5 more)

### Community 49 - "Community 49"
Cohesion: 0.38
Nodes (10): ProductoServicio, Catálogo unificado: cuotas, alquileres e indumentaria.     stock = NULL para ser, crear_producto(), editar_producto(), _extraer_ip(), listar_productos(), _obtener_producto_o_404(), Request (+2 more)

### Community 54 - "Community 54"
Cohesion: 0.25
Nodes (6): ESTADO_CONFIG, formatearARS(), formatearFecha(), resolverUrlArchivo(), resumenItems(), TarjetaOrden()

### Community 55 - "Community 55"
Cohesion: 0.18
Nodes (3): CATEGORIAS, COLORES_CATEGORIA, formatoMoneda

### Community 56 - "Community 56"
Cohesion: 0.32
Nodes (6): esMoroso(), EstadoCard(), formatearFechaCobertura(), formatoFecha, formatoMoneda, SocioCuotas()

### Community 57 - "Community 57"
Cohesion: 0.29
Nodes (5): AdminProductos(), CATEGORIA_BADGE_CLASSES, CATEGORIA_LABELS, CATEGORIAS, formatoMoneda

### Community 58 - "Community 58"
Cohesion: 0.33
Nodes (4): AdminScanner(), resolverVariante(), TarjetaResultado(), VARIANTES

### Community 60 - "Community 60"
Cohesion: 0.50
Nodes (5): login_for_access_token(), Session, create_access_token(), verify_password(), timedelta

### Community 70 - "Community 70"
Cohesion: 0.67
Nodes (3): Backend Requirements, Pydantic, Uvicorn

## Knowledge Gaps
- **48 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+43 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Usuario` connect `Community 12` to `Community 2`, `Community 6`, `Community 39`, `Community 47`, `Community 16`, `Community 49`, `Community 23`, `Community 26`, `Community 30`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Why does `React` connect `Community 46` to `Community 0`, `Community 1`, `Community 43`, `Community 45`, `Community 54`, `Community 55`, `Community 56`, `Community 57`, `Community 58`, `Community 59`, `Community 61`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `Inyecta en la base de datos:       1. fn_actualizar_search_usuario()  + trigger`, `Elimina en orden inverso: primero triggers (dependen de funciones),     luego la`, `Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.     Lanz` to the rest of the system?**
  _147 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.1422924901185771 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 4` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._