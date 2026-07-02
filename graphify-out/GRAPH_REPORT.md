# Graph Report - car  (2026-07-02)

## Corpus Check
- 57 files · ~155,666 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 452 nodes · 837 edges · 54 communities (26 shown, 28 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0fd3c0e9`
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

## God Nodes (most connected - your core abstractions)
1. `Usuario` - 41 edges
2. `useAuth()` - 25 edges
3. `React` - 20 edges
4. `Base` - 18 edges
5. `validar_dni()` - 11 edges
6. `FastAPI` - 11 edges
7. `crear_comercio()` - 10 edges
8. `editar_comercio()` - 10 edges
9. `aprobar_orden()` - 10 edges
10. `rechazar_orden()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `login_for_access_token()` --calls--> `verify_password()`  [INFERRED]
  backend/routers/auth.py → backend/security.py
- `Frontend Index HTML` --references--> `Vite Logo`  [EXTRACTED]
  frontend/index.html → frontend/public/vite.svg
- `crear_comercio()` --references--> `Usuario`  [EXTRACTED]
  backend/routers/admin_comercios.py → backend/models.py
- `editar_comercio()` --references--> `Usuario`  [EXTRACTED]
  backend/routers/admin_comercios.py → backend/models.py
- `eliminar_comercio()` --references--> `Usuario`  [EXTRACTED]
  backend/routers/admin_comercios.py → backend/models.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Web Application Stack** — fastapi, vite, react [INFERRED 0.90]

## Communities (54 total, 28 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (38): Frontend Index HTML, Vite Logo, App(), Hero(), AuthContext, AuthProvider(), useAuth(), CartContext (+30 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (31): dependencies, lucide-react, qrcode.react, react, react-dom, react-router-dom, @yudiel/react-qr-scanner, devDependencies (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.35
Nodes (11): Orden, Cabecera del movimiento contable. Una orden puede contener múltiples ítems., aprobar_orden(), _extraer_ip(), listar_ordenes_pendientes(), _obtener_orden_o_404(), Request, Session (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (23): AsistenciaResponse, DetalleOrdenResponse, DNIValidationPayload, LoginPayload, MarcarLeidaPayload, NotificacionResponse, OrdenAprobarResponse, OrdenListResponse (+15 more)

### Community 4 - "Community 4"
Cohesion: 0.16
Nodes (17): CategoriaDeportivaBase, CategoriaDeportivaCreate, CategoriaDeportivaResponse, ComercioAsociadoBase, ComercioAsociadoCreate, ComercioAsociadoResponse, ConfiguracionGlobalBase, ConfiguracionGlobalResponse (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (5): Calendario(), Footer(), Galeria(), Historia(), Landing()

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (28): Asistencia, AuditLog, Base, CategoriaDeportiva, ConfiguracionGlobal, DetalleOrden, Evento, Notificacion (+20 more)

### Community 12 - "Community 12"
Cohesion: 0.05
Nodes (54): get_current_user(), Session, Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.     Lanz, Devuelve el conjunto de nombres de roles vigentes (sin expirar)., Dependencia de autorización por rol.      Uso en un endpoint:         @router.ge, require_roles(), _roles_activos(), Núcleo del sistema. Un registro por persona física.     La clave de negocio inmu (+46 more)

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
Cohesion: 0.38
Nodes (11): _extraer_ip(), generar_orden_cuota(), obtener_estado_cuota(), obtener_historial_pagos(), _obtener_producto_cuota_social(), Request, Session, Mismo criterio que admin_pagos.py: producto activo más reciente. (+3 more)

### Community 23 - "Community 23"
Cohesion: 0.43
Nodes (13): ComercioAsociado, crear_comercio(), editar_comercio(), eliminar_comercio(), _extraer_ip(), listar_comercios(), obtener_comercio(), _obtener_comercio_o_404() (+5 more)

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
Nodes (25): _calcular_antiguedad_meses(), _construir_respuesta_desde_orm(), _extraer_ip(), generar_qr_token(), Request, Session, Extrae la IP real considerando proxies (X-Forwarded-For)., Calcula los meses de antigüedad desde fecha_ingreso hasta hoy. (+17 more)

### Community 40 - "Community 40"
Cohesion: 0.33
Nodes (3): OrdenRechazarResponse, Confirmación de rechazo., ReservaInstalacionCreate

## Knowledge Gaps
- **35 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+30 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Usuario` connect `Community 12` to `Community 2`, `Community 6`, `Community 39`, `Community 16`, `Community 23`, `Community 30`?**
  _High betweenness centrality (0.078) - this node is a cross-community bridge._
- **Why does `React` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `Inyecta en la base de datos:       1. fn_actualizar_search_usuario()  + trigger`, `Elimina en orden inverso: primero triggers (dependen de funciones),     luego la`, `Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.     Lanz` to the rest of the system?**
  _118 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.054203180785459264 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Community 6` be split into smaller, more focused modules?**
  _Cohesion score 0.05656565656565657 - nodes in this community are weakly interconnected._