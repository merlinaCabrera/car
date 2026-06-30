# Graph Report - backend  (2026-06-29)

## Corpus Check
- 11 files · ~7,436 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 163 nodes · 222 edges · 48 communities (16 shown, 32 thin omitted)
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
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
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

## God Nodes (most connected - your core abstractions)
1. `Base` - 18 edges
2. `UsuarioBase` - 5 edges
3. `ProductoServicioBase` - 5 edges
4. `EventoBase` - 5 edges
5. `ConfiguracionGlobal` - 4 edges
6. `Rol` - 4 edges
7. `Usuario` - 4 edges
8. `UsuarioRol` - 4 edges
9. `AuditLog` - 4 edges
10. `ProductoServicio` - 4 edges

## Surprising Connections (you probably didn't know these)
- `AuditLog` --inherits--> `Base`  [EXTRACTED]
  models.py → models.py  _Bridges community 4 → community 15_
- `CategoriaDeportiva` --inherits--> `Base`  [EXTRACTED]
  models.py → models.py  _Bridges community 4 → community 16_
- `ComercioAsociado` --inherits--> `Base`  [EXTRACTED]
  models.py → models.py  _Bridges community 4 → community 5_
- `ConfiguracionGlobal` --inherits--> `Base`  [EXTRACTED]
  models.py → models.py  _Bridges community 4 → community 17_
- `DetalleOrden` --inherits--> `Base`  [EXTRACTED]
  models.py → models.py  _Bridges community 4 → community 18_

## Import Cycles
- None detected.

## Communities (48 total, 32 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.18
Nodes (14): CategoriaDeportivaBase, CategoriaDeportivaCreate, CategoriaDeportivaResponse, ConfiguracionGlobalBase, ConfiguracionGlobalResponse, NotificacionResponse, OrdenResponse, schemas.py — Pydantic v2 Schemas Club Atlético — Sistema de Gestión  Convencione (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.22
Nodes (9): BaseModel, AsistenciaResponse, DetalleOrdenResponse, LoginPayload, MarcarLeidaPayload, ProductoServicioUpdate, ReservaInstalacionResponse, UsuarioCategoriaCreate (+1 more)

### Community 2 - "Community 2"
Cohesion: 0.25
Nodes (7): Payload para dar de alta un nuevo usuario.     El backend hashea `password` ante, Payload del script de migración desde Excel.     La contraseña se genera automát, Respuesta estándar. No expone password_hash.     qr_token y estado financiero so, UsuarioBase, UsuarioCreate, UsuarioCreateMigracion, UsuarioResponse

### Community 4 - "Community 4"
Cohesion: 0.33
Nodes (5): DeclarativeBase, Asistencia, Base, Base declarativa compartida por todos los modelos., Registro inmutable de cada ingreso en puerta, vinculado a un evento.     El camp

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (4): ComercioAsociado, Orden, models.py — SQLAlchemy 2.0 Declarative Models Club Atlético — Sistema de Gestión, Cabecera del movimiento contable. Una orden puede contener múltiples ítems.

### Community 6 - "Community 6"
Cohesion: 0.40
Nodes (4): downgrade(), Inyecta en la base de datos:       1. fn_actualizar_search_usuario()  + trigger, Elimina en orden inverso: primero triggers (dependen de funciones),     luego la, upgrade()

### Community 7 - "Community 7"
Cohesion: 0.40
Nodes (4): DetalleOrdenCreate, OrdenCreate, Un ítem dentro del carrito. El precio se resuelve en el backend., El socio envía los ítems; el backend calcula monto_total y bloquea stock/reserva

### Community 8 - "Community 8"
Cohesion: 0.50
Nodes (3): EventoBase, EventoCreate, EventoResponse

### Community 9 - "Community 9"
Cohesion: 0.50
Nodes (3): ProductoServicioBase, ProductoServicioCreate, ProductoServicioResponse

## Knowledge Gaps
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Base` connect `Community 4` to `Community 5`, `Community 15`, `Community 16`, `Community 17`, `Community 18`, `Community 19`, `Community 20`, `Community 21`, `Community 22`, `Community 23`, `Community 24`, `Community 25`, `Community 26`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `UsuarioCambiarPassword` connect `Community 28` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Why does `AsistenciaCreate` connect `Community 27` to `Community 0`, `Community 1`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **What connects `Inyecta en la base de datos:       1. fn_actualizar_search_usuario()  + trigger`, `Elimina en orden inverso: primero triggers (dependen de funciones),     luego la`, `models.py — SQLAlchemy 2.0 Declarative Models Club Atlético — Sistema de Gestión` to the rest of the system?**
  _42 weakly-connected nodes found - possible documentation gaps or missing edges._