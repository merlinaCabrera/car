# Graph Report - car  (2026-06-29)

## Corpus Check
- 43 files · ~18,287 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 260 nodes · 385 edges · 41 communities (21 shown, 20 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2c2afe7b`
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

## God Nodes (most connected - your core abstractions)
1. `Base` - 18 edges
2. `React` - 15 edges
3. `useAuth()` - 13 edges
4. `useCart()` - 11 edges
5. `UsuarioBase` - 5 edges
6. `ProductoServicioBase` - 5 edges
7. `EventoBase` - 5 edges
8. `scripts` - 5 edges
9. `ConfiguracionGlobal` - 4 edges
10. `Rol` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Frontend Index HTML` --references--> `Vite Logo`  [EXTRACTED]
  frontend/index.html → frontend/public/vite.svg
- `Hero()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/components/landing/Hero.jsx → frontend/src/context/AuthContext.jsx
- `MainLayout()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/layouts/MainLayout.jsx → frontend/src/context/AuthContext.jsx
- `AdminInicio()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/pages/AdminInicio.jsx → frontend/src/context/AuthContext.jsx
- `Login()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/pages/Login.jsx → frontend/src/context/AuthContext.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Web Application Stack** — fastapi, vite, react [INFERRED 0.90]

## Communities (41 total, 20 thin omitted)

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
Cohesion: 0.12
Nodes (17): AsignarRolPayload, AsistenciaResponse, LoginPayload, MarcarLeidaPayload, NotificacionResponse, OrdenResponse, ProductoServicioUpdate, Payload para asignar un rol a un usuario. (+9 more)

### Community 4 - "Community 4"
Cohesion: 0.20
Nodes (13): CategoriaDeportivaBase, CategoriaDeportivaCreate, CategoriaDeportivaResponse, ConfiguracionGlobalBase, ConfiguracionGlobalResponse, DetalleOrdenResponse, EventoBase, EventoCreate (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (5): Calendario(), Footer(), Galeria(), Historia(), Landing()

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (33): Asistencia, AuditLog, Base, CategoriaDeportiva, ComercioAsociado, ConfiguracionGlobal, DetalleOrden, Evento (+25 more)

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (4): Backend Requirements, FastAPI, Pydantic, Uvicorn

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
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `react` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **What connects `Inyecta en la base de datos:       1. fn_actualizar_search_usuario()  + trigger`, `Elimina en orden inverso: primero triggers (dependen de funciones),     luego la`, `models.py — SQLAlchemy 2.0 Declarative Models Club Atlético — Sistema de Gestión` to the rest of the system?**
  _71 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.10434782608695652 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._