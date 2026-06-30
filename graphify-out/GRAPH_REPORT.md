# Graph Report - car  (2026-06-29)

## Corpus Check
- 46 files · ~18,366 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 273 nodes · 412 edges · 40 communities (20 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bd2c0775`
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

## God Nodes (most connected - your core abstractions)
1. `Base` - 18 edges
2. `React` - 15 edges
3. `useAuth()` - 13 edges
4. `useCart()` - 11 edges
5. `login_for_access_token()` - 6 edges
6. `UsuarioBase` - 5 edges
7. `UsuarioCreate` - 5 edges
8. `ProductoServicioBase` - 5 edges
9. `EventoBase` - 5 edges
10. `scripts` - 5 edges

## Surprising Connections (you probably didn't know these)
- `login_for_access_token()` --calls--> `verify_password()`  [INFERRED]
  backend/routers/auth.py → backend/security.py
- `Frontend Index HTML` --references--> `Vite Logo`  [EXTRACTED]
  frontend/index.html → frontend/public/vite.svg
- `login_for_access_token()` --references--> `LoginPayload`  [EXTRACTED]
  backend/routers/auth.py → backend/schemas.py
- `login_for_access_token()` --calls--> `create_access_token()`  [INFERRED]
  backend/routers/auth.py → backend/security.py
- `crear_usuario()` --calls--> `get_password_hash()`  [INFERRED]
  backend/routers/usuarios.py → backend/security.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Web Application Stack** — fastapi, vite, react [INFERRED 0.90]

## Communities (40 total, 20 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.10
Nodes (26): Frontend Index HTML, Vite Logo, App(), Hero(), AuthContext, AuthProvider(), useAuth(), CartContext (+18 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (15): dependencies, qrcode.react, react, react-dom, react-router-dom, @yudiel/react-qr-scanner, name, private (+7 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (15): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+7 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (15): AsistenciaResponse, LoginPayload, MarcarLeidaPayload, NotificacionResponse, OrdenResponse, ProductoServicioUpdate, Resumen de cierre del evento (resultado de la vista v_reporte_evento)., RemoverRolPayload (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.20
Nodes (13): CategoriaDeportivaBase, CategoriaDeportivaCreate, CategoriaDeportivaResponse, ConfiguracionGlobalBase, ConfiguracionGlobalResponse, DetalleOrdenResponse, EventoBase, EventoCreate (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (5): Calendario(), Footer(), Galeria(), Historia(), Landing()

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (33): Asistencia, AuditLog, Base, CategoriaDeportiva, ComercioAsociado, ConfiguracionGlobal, DetalleOrden, Evento (+25 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (15): Backend Requirements, login_for_access_token(), Session, crear_usuario(), listar_usuarios(), Session, Payload para dar de alta un nuevo usuario.     El backend hashea `password` ante, UsuarioCreate (+7 more)

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

## Knowledge Gaps
- **29 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `React` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `react` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **What connects `Inyecta en la base de datos:       1. fn_actualizar_search_usuario()  + trigger`, `Elimina en orden inverso: primero triggers (dependen de funciones),     luego la`, `models.py — SQLAlchemy 2.0 Declarative Models Club Atlético — Sistema de Gestión` to the rest of the system?**
  _71 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.10434782608695652 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._