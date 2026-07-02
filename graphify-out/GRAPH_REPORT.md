# Graph Report - car  (2026-07-02)

## Corpus Check
- 54 files · ~150,638 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 383 nodes · 675 edges · 42 communities (22 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `175fbfcb`
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

## God Nodes (most connected - your core abstractions)
1. `Usuario` - 31 edges
2. `useAuth()` - 23 edges
3. `React` - 19 edges
4. `Base` - 18 edges
5. `validar_dni()` - 11 edges
6. `useCart()` - 11 edges
7. `crear_comercio()` - 10 edges
8. `editar_comercio()` - 10 edges
9. `validar_qr_token()` - 10 edges
10. `FastAPI` - 8 edges

## Surprising Connections (you probably didn't know these)
- `login_for_access_token()` --calls--> `verify_password()`  [INFERRED]
  backend/routers/auth.py → backend/security.py
- `Frontend Index HTML` --references--> `Vite Logo`  [EXTRACTED]
  frontend/index.html → frontend/public/vite.svg
- `get_current_user()` --references--> `Usuario`  [EXTRACTED]
  backend/dependencies.py → backend/models.py
- `_roles_activos()` --references--> `Usuario`  [EXTRACTED]
  backend/dependencies.py → backend/models.py
- `crear_comercio()` --references--> `Usuario`  [EXTRACTED]
  backend/routers/admin_comercios.py → backend/models.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Web Application Stack** — fastapi, vite, react [INFERRED 0.90]

## Communities (42 total, 20 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (32): Frontend Index HTML, Vite Logo, App(), Hero(), AuthContext, AuthProvider(), useAuth(), CartContext (+24 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (31): dependencies, lucide-react, qrcode.react, react, react-dom, react-router-dom, @yudiel/react-qr-scanner, devDependencies (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (13): get_current_user(), Session, Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.     Lanz, Devuelve el conjunto de nombres de roles vigentes (sin expirar)., Dependencia de autorización por rol.      Uso en un endpoint:         @router.ge, require_roles(), _roles_activos(), login_for_access_token() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (17): AsistenciaResponse, DNIValidationPayload, LoginPayload, OrdenResponse, ProductoServicioUpdate, QRTokenResponse, Todos los campos opcionales — PATCH parcial., Payload para dar de baja a un usuario (baja lógica, nunca DELETE). (+9 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (20): CategoriaDeportivaBase, CategoriaDeportivaCreate, CategoriaDeportivaResponse, ComercioAsociadoBase, ComercioAsociadoCreate, ComercioAsociadoResponse, ConfiguracionGlobalBase, ConfiguracionGlobalResponse (+12 more)

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (5): Calendario(), Footer(), Galeria(), Historia(), Landing()

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (30): Asistencia, AuditLog, Base, CategoriaDeportiva, ConfiguracionGlobal, DetalleOrden, Evento, Notificacion (+22 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (37): Núcleo del sistema. Un registro por persona física.     La clave de negocio inmu, Usuario, actualizar_roles_usuario(), ActualizarRolesPayload, ActualizarRolesResponse, aprobar_usuario(), crear_socio_manual(), dar_baja_socio() (+29 more)

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
Cohesion: 0.50
Nodes (3): ProductoServicioBase, ProductoServicioCreate, ProductoServicioResponse

### Community 23 - "Community 23"
Cohesion: 0.43
Nodes (13): ComercioAsociado, crear_comercio(), editar_comercio(), eliminar_comercio(), _extraer_ip(), listar_comercios(), obtener_comercio(), _obtener_comercio_o_404() (+5 more)

### Community 39 - "Community 39"
Cohesion: 0.10
Nodes (29): Backend Requirements, _calcular_antiguedad_meses(), _construir_respuesta_desde_orm(), _extraer_ip(), generar_qr_token(), Request, Session, Extrae la IP real considerando proxies (X-Forwarded-For). (+21 more)

## Knowledge Gaps
- **31 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+26 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Usuario` connect `Community 12` to `Community 2`, `Community 39`, `Community 6`, `Community 23`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `React` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `Inyecta en la base de datos:       1. fn_actualizar_search_usuario()  + trigger`, `Elimina en orden inverso: primero triggers (dependen de funciones),     luego la`, `Decodifica el JWT y retorna el Usuario ORM completo con roles cargados.     Lanz` to the rest of the system?**
  _99 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06760316066725197 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06060606060606061 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.10822510822510822 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._