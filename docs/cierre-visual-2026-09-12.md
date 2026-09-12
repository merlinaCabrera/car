# Cierre visual — 2026-09-12

Última tanda de ajustes visuales antes de retomar QA manual.
Commit: `d65fba5 cierre visual animations` (ya pusheado a `main`, o sea que el
workflow de GitHub Actions lo publicó en CloudFront).

---

## Qué se hizo

| # | Tarea | Archivos |
|---|-------|----------|
| 1 | Borrado `<Calendario />` (componente vacío) | `pages/Landing.jsx`, `components/landing/Calendario.jsx` (eliminado) |
| 2 | Barra del ítem activo del menú: `#183F7C` → `#5B80B4` | `layouts/MainLayout.jsx` |
| 3 | BUG-21 — `ReferenceError: setResultados` al asignar técnico | `pages/TecnicoPlanteles.jsx` |
| 4 | Animaciones en las 3 páginas de socio que faltaban | `SocioPerfil.jsx`, `SocioShopping.jsx`, `SocioCarrito.jsx` |
| 5 | Limpieza: `escudo-car-1.png`, eslint de MainLayout, typo `defaultView` | `public/`, `MainLayout.jsx`, `App.jsx`, `ReservaCalendar.jsx` |
| 6 | Escudo del header sin pastilla blanca, versión monocroma | `layouts/MainLayout.jsx` |

`npm run build` limpio. `MainLayout.jsx` quedó con 0 errores de eslint.

### Notas de implementación que no se ven en el diff

**BUG-21.** No faltaba el `useState`. Hay **dos** componentes en
`TecnicoPlanteles.jsx`: el de la línea ~351 sí tiene
`const [resultados, setResultados] = useState([])`; el de asignación de técnicos
(~565) migró en algún refactor a `const resultados = useMemo(...)` derivado de
`disponibles` + `busqueda`, y quedó la llamada vieja al setter. Como `resultados`
ahora se recalcula solo, limpiar `busqueda` ya vacía la lista. Se borró la línea
sin tocar la lógica de asignación.

**Animaciones.** Criterio aplicado (el mismo del resto de la app, ver el bloque
de comentarios en `index.css`):

- `SocioPerfil` → 3 pasos fijos (`anim-entrada` → `anim-d1` → `anim-d2`).
  Bajo el tope de 4 escalones, así que no hace falta `<Revelar>`.
- `SocioShopping` → título con `anim-entrada`; el catálogo con `<Revelar>`
  porque no tiene tope de ítems. ⚠️ El div que inyecta `Revelar` pasa a ser el
  ítem de la grilla, así que se agregó `h-full` **al envoltorio y a la raíz de
  `TarjetaProducto`** para no perder la altura pareja por fila. Si en algún
  momento se saca el `Revelar`, ese `h-full` de la tarjeta queda de más.
- `SocioCarrito` → título con `anim-entrada`; ítems con `<Revelar>`. El
  `divide-y` del contenedor lo sigue tomando porque el wrapper de `Revelar`
  queda como hijo directo.

**Escudo del header.** Pasó a `assets/escudo-car-blanco.png` (el mismo asset que
usa el Hero). Se le sacaron `bg-white`, `rounded-2xl`, `p-2` y `shadow-sm`;
quedó `h-9 sm:h-10` + `drop-shadow(0 1px 6px rgba(255,255,255,0.25))` — suave, no
el halo fuerte del Hero. Se conservó el `hover:scale-105 / active:scale-95`.

---

## Pendientes

### 1. ⚠️ La galería está desconectada y deja un link roto en la landing pública

Es lo más importante de esta lista porque **lo ve cualquier visitante**.

Estado real hoy:

- `pages/GaleriaCompleta.jsx` existe pero **no tiene ruta en `App.jsx`**.
- `components/landing/Galeria.jsx` (la sección con el carrusel) está **importada
  en `Landing.jsx` pero nunca renderizada** — el `<Galeria />` se sacó del JSX en
  el commit `c97774a historia` y quedó el import huérfano (es uno de los
  `no-unused-vars` que tira eslint).
- Pero **`components/landing/Historia.jsx:62` sí renderiza un
  `<Link to="/galeria">`** en la landing.

Como `App.jsx` no tiene ruta `/galeria` **ni catch-all `path="*"`**, hacer clic
en ese link deja la pantalla en blanco. No es un 404 con mensaje: es blanco.

Hay que decidir una de estas tres:

- [ ] **Conectar la galería**: agregar `<Route path="/galeria" element={<GaleriaCompleta />} />`
      y volver a poner `<Galeria />` en `Landing.jsx`.
- [ ] **Enterrarla**: sacar el link de `Historia.jsx:62`, el import muerto de
      `Landing.jsx` y los archivos `Galeria.jsx` / `GaleriaCompleta.jsx`.
- [ ] Como mínimo, si queda para después: **sacar el link de `Historia.jsx`**
      para que nadie caiga en la pantalla blanca.

Ojo además: la galería es toda placeholder. `Galeria.jsx` usa un array
`placeholders = [1, 2, 3, 4]` y `GaleriaCompleta.jsx` repite **seis veces la
misma foto** (`jugadores.PNG`). Conectarla sin fotos reales del club no aporta
nada — está esperando material.

### 2. `jugadores.PNG` pesa 3,06 MB

Es, de lejos, el archivo más pesado del build (`dist/assets/jugadores-*.PNG` =
3.133 kB; el segundo más pesado es el bundle JS con 933 kB). Lo usan `Historia.jsx`
(landing, arriba del pliegue) y `GaleriaCompleta.jsx`.

En una app mobile-first para un club de pueblo, eso es varios segundos de espera
con datos móviles antes de que se vea la foto de la landing.

- [ ] Redimensionar a lo que realmente se muestra y exportar a WebP (o JPG con
      calidad ~80). Debería bajar a menos de 200 kB sin diferencia visible.

### 3. Verificación visual en dispositivo real

`npm run build` pasa y el diff es correcto, pero **no se verificó en un navegador**
cómo quedaron los cambios 2 y 6. Vale mirar en el celular:

- [ ] El escudo blanco sobre el header azul — que el `drop-shadow` no se lea como
      halo sucio y que `h-9 sm:h-10` no quede chico al lado del botón de menú.
- [ ] El contraste de la barra `#5B80B4` del ítem activo del menú.

### 4. eslint del proyecto no está limpio

`npx eslint src/` tira **896 problemas (881 errores, 15 warnings)**. La enorme
mayoría son `react/prop-types` en archivos que no se tocaron en esta tanda —
viene de antes y es ruido de configuración, no bugs.

Lo que sí conviene mirar alguna vez son los `no-unused-vars`, que sí señalan
código muerto real. En archivos tocados este ciclo quedaron (todos preexistentes,
fuera del alcance pedido):

- `pages/Landing.jsx:5` — `Galeria` (ver punto 1, no es ruido: es el síntoma)
- `components/ReservaCalendar.jsx:19` — `useMemo`
- `components/ReservaCalendar.jsx:55` — `onSeleccionar`
- `pages/SocioCarrito.jsx:76` — `cartPayload`

- [ ] Decidir si se apaga `react/prop-types` en `eslint.config.js` (el proyecto no
      usa PropTypes en ningún lado, así que la regla solo genera ruido) para que
      los errores que quedan sean los que importan.

### 5. No hay ruta catch-all

`App.jsx` no define `path="*"`. Cualquier URL que no matchee —un link roto como
el de la galería, o un socio que escribe mal la dirección— muestra una pantalla
en blanco, sin explicación ni forma de volver.

- [ ] Agregar una `<Route path="*">` con un 404 mínimo que ofrezca volver al inicio.

---

## Fuera de alcance por decisión (no son deuda técnica)

Se dejaron sin tocar a propósito en esta tanda:

- **`models.TIPOS_NOTIFICACION`** — va con la próxima migración de Alembic.
- **Cobro en ventanilla sin mail** — decisión de negocio pendiente con el club.
- **Panel de admin sin animaciones** — decidido así; el admin es herramienta de
  trabajo, no vidriera.
- **Backend** — no se tocó ningún archivo.
- **Warning de chunk > 500 kB** en el build — preexistente, es el bundle JS único.
  Se resuelve con code-splitting si alguna vez molesta; hoy no es prioridad frente
  al punto 2.
