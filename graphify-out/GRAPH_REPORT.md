# Graph Report - car  (2026-06-29)

## Corpus Check
- 36 files · ~7,829 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 107 nodes · 172 edges · 12 communities (11 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `50c9b5af`
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

## God Nodes (most connected - your core abstractions)
1. `React` - 15 edges
2. `useAuth()` - 13 edges
3. `useCart()` - 11 edges
4. `scripts` - 5 edges
5. `MainLayout()` - 4 edges
6. `SocioCuotas()` - 4 edges
7. `Hero()` - 3 edges
8. `AdminInicio()` - 3 edges
9. `Login()` - 3 edges
10. `SocioAlquileres()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `Frontend Index HTML` --references--> `Vite Logo`  [EXTRACTED]
  frontend/index.html → frontend/public/vite.svg
- `MainLayout()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/layouts/MainLayout.jsx → frontend/src/context/AuthContext.jsx
- `SocioCuotas()` --calls--> `useCart()`  [EXTRACTED]
  frontend/src/pages/SocioCuotas.jsx → frontend/src/context/CartContext.jsx
- `Hero()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/components/landing/Hero.jsx → frontend/src/context/AuthContext.jsx
- `AdminInicio()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/src/pages/AdminInicio.jsx → frontend/src/context/AuthContext.jsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Web Application Stack** — fastapi, vite, react [INFERRED 0.90]

## Communities (12 total, 1 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.17
Nodes (11): Frontend Index HTML, Vite Logo, App(), AdminPagos(), AdminQRScanner(), AdminSolicitudes(), JugadorCalendario(), RecuperarPassword() (+3 more)

### Community 1 - "Community 1"
Cohesion: 0.12
Nodes (15): dependencies, qrcode.react, react, react-dom, react-router-dom, @yudiel/react-qr-scanner, name, private (+7 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (15): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals (+7 more)

### Community 3 - "Community 3"
Cohesion: 0.25
Nodes (8): Hero(), AuthContext, AuthProvider(), useAuth(), AdminInicio(), Login(), SocioCuotas(), SocioInicio()

### Community 4 - "Community 4"
Cohesion: 0.29
Nodes (7): CartContext, CartProvider(), useCart(), MainLayout(), SocioAlquileres(), SocioCarrito(), SocioShopping()

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (5): Calendario(), Footer(), Galeria(), Historia(), Landing()

### Community 6 - "Community 6"
Cohesion: 0.32
Nodes (3): Rol, Usuario, Base

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (4): Backend Requirements, FastAPI, Pydantic, Uvicorn

## Knowledge Gaps
- **30 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+25 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `React` connect `Community 0` to `Community 1`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.329) - this node is a cross-community bridge._
- **Why does `react` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.312) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _30 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._