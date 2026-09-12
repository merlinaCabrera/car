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

### 1. ✅ RESUELTO en la ronda 2 — La galería está desconectada y deja un link roto en la landing pública

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

### 2. ✅ RESUELTO en la ronda 2 — `jugadores.PNG` pesa 3,06 MB

Es, de lejos, el archivo más pesado del build (`dist/assets/jugadores-*.PNG` =
3.133 kB; el segundo más pesado es el bundle JS con 933 kB). Lo usan `Historia.jsx`
(landing, arriba del pliegue) y `GaleriaCompleta.jsx`.

En una app mobile-first para un club de pueblo, eso es varios segundos de espera
con datos móviles antes de que se vea la foto de la landing.

- [ ] Redimensionar a lo que realmente se muestra y exportar a WebP (o JPG con
      calidad ~80). Debería bajar a menos de 200 kB sin diferencia visible.

### 3. ⏳ SIGUE ABIERTO (y creció) — Verificación visual en dispositivo real

`npm run build` pasa y el diff es correcto, pero **no se verificó en un navegador**
cómo quedaron los cambios 2 y 6. Vale mirar en el celular:

- [ ] El escudo blanco sobre el header azul — que el `drop-shadow` no se lea como
      halo sucio y que `h-9 sm:h-10` no quede chico al lado del botón de menú.
- [ ] El contraste de la barra `#5B80B4` del ítem activo del menú.

### 4. ✅ RESUELTO en la ronda 2 (parcial) — eslint del proyecto no está limpio

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

### 5. ✅ RESUELTO en la ronda 2 — No hay ruta catch-all

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

---

# Ronda 2 — 2026-09-12

Dos features del manual de marca + los cuatro fixes de cierre que habían quedado
como pendientes 1, 2, 4 y 5 de arriba. `npm run build` limpio. **Sin pushear.**

## Qué se hizo

| # | Tarea | Archivos |
|---|-------|----------|
| 1 | Foto de perfil del socio en el header (reemplaza al escudo) | `layouts/MainLayout.jsx` |
| 2 | Foto de perfil en el carnet digital, con fallback a iniciales | `pages/SocioInicio.jsx` |
| 3 | Fuera el link roto a `/galeria` + import huérfano de `Galeria` | `components/landing/Historia.jsx`, `pages/Landing.jsx` |
| 4 | Ruta catch-all `path="*"` → redirect a `/` | `App.jsx` |
| 5 | `jugadores.PNG` (3.060 kB) → `jugadores.webp` (181 kB) | `assets/`, `Historia.jsx`, `Galeria.jsx`, `GaleriaCompleta.jsx` |
| 6 | `react/prop-types` apagado + los `no-unused-vars` destapados | `eslint.config.js`, `SocioNotificaciones.jsx`, `SocioCarrito.jsx`, `SocioInicio.jsx` |

## Notas de implementación que no se ven en el diff

**El campo es `foto_perfil_url`, no `foto_perfil`.** Así lo devuelve
`/usuarios/me` (`schemas.UsuarioResponse` hereda de `UsuarioBase`), y es el
nombre que ya usaban `SocioPerfil.jsx`, `JugadorEquipo.jsx` y los escáneres.

**Las URLs hay que normalizarlas.** El backend devuelve las fotos como presigned
URL absoluta de S3, pero quedan filas viejas con ruta local `/uploads/...` (bug
conocido #9). En vez de escribir un tercer `resolverFotoUrl` —ya hay dos copias,
una en `SocioPerfil.jsx` y otra en `JugadorEquipo.jsx`— las dos pantallas nuevas
usan `resolverUrlArchivo()` de `utils/archivos.js`, que hace exactamente lo mismo
y es el helper que el resto de la app ya comparte.

**Las dos fotos tienen `onError` con estado `fotoFallo`.** Una presigned URL
vence, y una fila legacy puede apuntar a un archivo que ya no está en S3. Sin el
`onError` el navegador deja el ícono de imagen rota justo en el centro del header
y adentro del carnet. Con el fallo detectado se vuelve al escudo / a las
iniciales. En `MainLayout` hay además un `useEffect` que resetea `fotoFallo`
cuando cambia `user?.foto_perfil_url`: sin eso, un fallo puntual de red dejaba el
escudo puesto para el resto de la sesión, incluso después de que el socio subiera
una foto nueva.

**Iniciales del carnet.** Se escribió una copia local en `SocioInicio.jsx` con el
mismo criterio que la de `SocioPerfil.jsx` (primera letra de nombre + primera de
apellido). Son 2 líneas; unificarlas en `utils/` cuando aparezca una tercera.

**El círculo de iniciales usa `bg-roberts-600`, no `bg-blue-600`.** Son el mismo
color (`tailwind.config.js` reasigna la escala `blue` a Azul Roberts), pero en
código nuevo el manual pide el nombre de marca.

**El catch-all va FUERA de `RutaPrivada`** y último dentro de `<Routes>`. Si
quedara adentro, una URL mal escrita sin sesión activa rebotaría a
`/login?next=<la-url-rota>` y después del login volvería a la pantalla en blanco.
`Navigate` ya estaba importado en `App.jsx` (lo usan los redirects de
`/admin/pagos` y compañía), así que no hubo import nuevo.

**No se creó página de 404.** Redirect a `/` y listo, como estaba pedido. Cuando
exista una `NotFound.jsx`, reemplazar el `Navigate` — está marcado con comentario
en el lugar.

## El asset pesado

`jugadores.PNG` era en realidad un **JPEG con extensión `.PNG`** (1536×2048,
3.060 kB). Se convirtió con PIL a `jugadores.webp`: **675×900, calidad 82,
181 kB — un 94% menos.**

El recorte a 900 px de lado largo no es agresivo: donde más grande se muestra es
en el carrusel de `Historia` (`md:w-72 md:h-80` = 288×320 px CSS con
`object-cover`), así que 675×900 sigue sobrando incluso en pantallas 2×.

El `.PNG` original se borró (`git rm`) y los tres importadores
—`Historia.jsx`, `Galeria.jsx`, `GaleriaCompleta.jsx`— apuntan al `.webp`. Si
alguna vez se necesita el original en tamaño completo, está en el historial de
git. **No quedó conversión manual pendiente.**

Assets del build: de ~3.400 kB a **521 kB** en total.

## eslint: de 881 errores a 16

Apagar `react/prop-types` bajó de **881 errores a 20**. Los 11 `no-unused-vars`
que quedaron destapados se revisaron uno por uno, y el caso de `Galeria` no fue
el único con código muerto real detrás.

**Arreglados (código de socio / config):**

- `pages/Landing.jsx` — import huérfano de `Galeria`. Borrado (ver punto 3).
- `pages/SocioNotificaciones.jsx:10` — `Loader2` nunca usado. Borrado.
- `pages/SocioCarrito.jsx:76` — `cartPayload`: el caller lo pasaba
  (`cartPayload={cart}`) y `OrdenGeneradaModal` nunca lo leía. Se sacó de los dos
  lados.
- `pages/Registro.jsx:58` — **falso positivo.** La desestructuración con rest es
  el idiom para SACAR el campo del payload: la variable se nombra justamente para
  no usarla, y la validación sí existe en la línea 39. Se resolvió en la config,
  no en el código, agregando `ignoreRestSiblings: true` a `no-unused-vars`.
- `pages/SocioInicio.jsx` — el `no-empty` del `catch` vacío del fetch de perfil:
  se le escribió adentro por qué se traga el error (`no-empty` ignora bloques que
  contienen un comentario), así el intent queda documentado en vez de silencioso.

**⚠️ Encontrado pero NO tocado — `ReservaCalendar.jsx` es código muerto entero.**
Los dos `no-unused-vars` de ese archivo son la punta de algo más grande: **nada
renderiza `<ReservaCalendar />`**. El grep solo encuentra su propia definición y
su docstring; `Reservas.jsx` usa un `CalendarioMensual` propio. Son 194 líneas y
es el **único importador de `react-big-calendar`** en todo el frontend (o sea que
esa dependencia hoy no entra al bundle, pero sigue en `package.json`). Además
`onSeleccionar` es el callback que su propio docstring documenta como API y el
cuerpo nunca lo llama, así que si alguien lo montara hoy, no avisaría nada al
componente padre.

No se borró porque `CLAUDE.md` lo lista como componente vivo ("Grilla de turnos
por instalación") y borrar un componente de 194 líneas es una decisión de
producto, no una limpieza de lint.

- [ ] Decidir: borrar `components/ReservaCalendar.jsx` + `react-big-calendar` de
      `package.json` + la línea de `CLAUDE.md`, o conectarlo donde iba.

**⚠️ Encontrado pero NO tocado — bug real en `AdminProductos.jsx:95`.** Quedó
fuera porque el panel de admin estaba explícitamente excluido de esta tanda, pero
conviene no perderlo:

`categoriasDisponibles` filtra `cuota_social` cuando ya existe una y no estás
editando, y el `<select>` (L216) mapea esa lista filtrada. Pero `formData`
inicializa la categoría con `CATEGORIAS[0]`, y `CATEGORIAS[0] === 'cuota_social'`.
Entonces, al crear un producto nuevo con una cuota social ya existente, el estado
arranca con un valor que **no tiene `<option>` en el select**: si la persona no
toca ese campo, se envía `categoria: 'cuota_social'` — exactamente lo que el
filtro quería evitar.

La línea 95 (`const categoriaInicial = ...`) es el fix, escrito y nunca
conectado. Es cambiar una línea: usar `categoria: categoriaInicial` en el
`useState` en lugar de `producto?.categoria ?? CATEGORIAS[0]`.

- [ ] Aplicar ese cambio de una línea en la próxima tanda de admin.

**Los 16 errores que quedan** son todos de panel de admin o del componente
muerto, ninguno tocado a propósito:

| Archivo | Errores | Qué son |
|---------|---------|---------|
| `components/ReservaCalendar.jsx` | 2 | `useMemo`, `onSeleccionar` — componente muerto (arriba) |
| `pages/AdminProductos.jsx` | 3 | `categoriaInicial` (bug de arriba) + 2 `no-unescaped-entities` |
| `pages/AdminScannerEvento.jsx` | 8 | `RefreshCw`, `err` + 6 `no-unescaped-entities` |
| `pages/AdminVerificaciones.jsx` | 3 | `Receipt`, `User`, `hayPendientes` — imports/local muertos, inocuos |

Los 15 warnings son los mismos de antes (`react-refresh/only-export-components`
y `react-hooks/exhaustive-deps`), sin cambios.

## Pendiente de esta ronda

- [ ] **Verificación en dispositivo real** (es el pendiente 3 de arriba, ahora con
      más superficie). `npm run build` pasa, pero las dos features nuevas no se
      vieron en un navegador con un socio real logueado y con foto cargada:
      - El avatar de 36/40 px en el header: que el `ring-2 ring-white/20` alcance
        para despegarlo del azul, y que una foto vertical de celular no quede
        mal recortada por el `object-cover` en un círculo.
      - La foto de 80 px en el carnet: está centrada (`mx-auto`, como se pidió)
        sobre un bloque de datos que está alineado a la izquierda. Mirar si el
        eje mixto se lee bien o si conviene pasarla al costado del nombre.
      - El círculo de iniciales: probar con un socio sin foto y con un socio con
        un solo nombre cargado.
- [ ] Confirmar que las fotos legacy con ruta `/uploads/fotos_perfil/...` siguen
      resolviendo bien en producción con `resolverUrlArchivo()`.
