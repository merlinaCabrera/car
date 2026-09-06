# Auditoría end-to-end — CAR backend + frontend

_Fecha: 2026-09-06 · Método: lectura de código (no se ejecutaron exploits) · Foco: manejo de dinero y control de acceso por rol._

> **Estado de corrección (2026-09-06):** rama `seguridad/auditoria-alta`.
> **ALTA A1–A5** — `8ca42a2` · **MEDIA M1–M6** — `4acc926` · **MEDIA M7–M11 + BAJA B2** — `5a8ee19`.
> Todos los hallazgos de seguridad/plata están corregidos. Falta testeo con base real.
> Pendiente: BAJA B1, B3–B14 (hygiene/robustez/UX — no bloquean el MVP). Ver "Veredicto" al final.

Cubre: `backend/` completo (routers, `utils/`, `models.py`, `schemas.py`, `security.py`,
`dependencies.py`, `scheduler.py`, `main.py`) y el ruteo del frontend
(`App.jsx`, `RutaPrivada.jsx`).

Severidad: **ALTA** = explotable sin condiciones raras y con impacto real (plata / acceso / PII) ·
**MEDIA** = requiere una condición (carrera, combo de flags, rol interno) o el impacto es acotado ·
**BAJA** = hardening / robustez / edge case.

---

## Resumen ejecutivo

Lo estructural está **bien**: toda la plata usa `Numeric(10,2)`/`Decimal` (nunca float),
los precios se resuelven siempre en el backend y se congelan en el detalle, el motor de
períodos de cuota es correcto y consistente, el modelo de roles re-consulta la DB en cada
request y protege los roles críticos, y el scoping de técnicos por categoría está bien
aplicado en todos los endpoints que mutan planteles/convocatorias.

Los problemas se concentran en tres lugares:

1. **Un schema público hereda campos que no debería** → alta gratis (`es_becado`).
2. **Falta de locks en operaciones que mueven plata/stock** → doble gasto de saldo, doble
   descuento de stock, doble crédito de billetera bajo concurrencia o doble-submit.
3. **Endpoints de lectura demasiado abiertos** → el padrón completo (DNI, email, estado de
   morosidad) queda expuesto a cualquier usuario logueado, incluido el rol `invitado` que
   es para comercios externos.

Nada de esto bloquea el MVP si se ataca la lista de ALTA + las 3-4 MEDIA de plata antes de
abrir a los 300 socios.

---

## ALTA

### A1 · Alta gratis: auto-registro como `es_becado`
**Dónde:** `routers/usuarios.py::crear_usuario` (público, sin auth) · `schemas.py::UsuarioCreate` → `UsuarioBase` · `routers/admin_usuarios.py::aprobar_usuario`.

`UsuarioBase` (que `UsuarioCreate` hereda) declara `es_becado: bool` y `becado_hasta: date`.
`crear_usuario` hace `models.Usuario(**usuario.model_dump(exclude={"password"}))`, así que
esos campos se escriben directo. `aprobar_usuario` **no los resetea** — solo asigna el rol
`socio` y setea `mes_cubierto_hasta`.

**Impacto:** cualquiera que haga `POST /usuarios/` con `{"es_becado": true}` queda, tras la
aprobación del admin (que revisa nombre/DNI, no ese flag), como socio becado permanente:
`calcular_estado_financiero`, el QR de la puerta y `obtener_estado_cuota` devuelven deuda 0,
y `notificar_cuotas_vencidas` lo excluye. Membresía gratis.

**Fix:** schema de creación pública propio, sin `es_becado`/`becado_hasta`/`id_titular`
(o forzar `es_becado=False`, `id_titular=None` en `crear_usuario`). Que la beca se asigne
solo desde `PATCH /admin/usuarios/{id}` (ya existe, admin_general).

---

### A2 · Doble gasto de `saldo_a_favor` en el checkout
**Dónde:** `routers/socio_carrito.py::checkout_carrito` (líneas ~310-321).

```python
if payload.usar_saldo and current_user.saldo_a_favor > 0:
    saldo_disponible = current_user.saldo_a_favor      # lee
    ...
    current_user.saldo_a_favor -= saldo_aplicado       # modifica en Python
```

Read-modify-write sobre la fila del usuario **sin `SELECT ... FOR UPDATE`** y sin `UPDATE`
condicional. Dos checkouts concurrentes (doble-tap del botón, dos pestañas, dos dispositivos)
leen el mismo saldo, ambos lo aplican, ambos escriben. El socio gasta 2× su saldo real.

**Fix:** `db.query(Usuario).filter_by(id=...).with_for_update().one()` antes de tocar el
saldo, **o** `UPDATE usuarios SET saldo_a_favor = saldo_a_favor - :x WHERE id_usuario = :id
AND saldo_a_favor >= :x` y abortar si `rowcount == 0`.

---

### A3 · Stock se descuenta DOS veces en el camino feliz
**Dónde:** `routers/socio_carrito.py::checkout_carrito` (línea ~296) **y**
`utils/ordenes.py::procesar_aprobacion_orden` (línea ~294).

- Checkout: `producto.stock -= item.cantidad`
- Aprobación: `detalle.producto.stock -= detalle.cantidad` (otra vez)

El resto del sistema asume **un solo** descuento en el checkout: `scheduler.expirar_ordenes_vencidas`
hace `stock += cantidad` una vez, y `admin_ordenes.reabrir_orden` hace `stock -= cantidad` una vez.
Solo la aprobación descuenta de más.

**Impacto:** cada orden de tienda con stock finito aprobada consume el doble de lo comprado.
Además, si el stock quedó bajo, `procesar_aprobacion_orden` tira `HTTPException 400
"Stock insuficiente"` — y en el webhook de MP esa excepción sale del handler → MP recibe 400
→ reintenta para siempre.

**Fix:** eliminar el bloque de stock de `procesar_aprobacion_orden`
(`utils/ordenes.py` ~284-294). El checkout ya es el dueño del descuento.

---

### A4 · El rechazo de una orden nunca devuelve el stock
**Dónde:** `routers/admin_ordenes.py::rechazar_orden` (~430-443).

Libera las reservas de alquiler pero **no** hace `stock += `. El comentario de
`socio_carrito.py` dice explícitamente *"El stock reservado se libera automáticamente si el
admin rechaza la orden (ver rechazar_orden)"* — pero el código no lo hace.

**Impacto:** cada orden de indumentaria/otro rechazada pierde stock de forma permanente.

**Fix:** en `rechazar_orden`, para cada detalle con `producto.stock is not None` y
categoría ∉ {`cuota_social`, `alquiler`}, `detalle.producto.stock += detalle.cantidad`
(igual que hace el scheduler al expirar).

---

### A5 · Padrón completo + estado de morosidad expuesto a cualquier logueado (incl. `invitado`)
**Dónde:**
- `routers/usuarios.py::listar_usuarios` — `GET /usuarios/`, guard = `get_current_user` (cualquiera). `UsuarioListResponse` incluye **DNI, email, `mes_cubierto_hasta`, `es_becado`, `fecha_baja`** de todos los activos. `limit` sin tope.
- `routers/qr_auth.py::validar_dni` / `validar_qr_token` — guard = `_ROLES_SCANNER = ("admin_general", "personal_administrativo", "admin_temporal", "invitado")`. Devuelve nombre, foto, `estado_financiero` (`moroso`!), roles, meses adeudados **para cualquier DNI**. Sin rate limiting.

`invitado` es el rol pensado para comercios adheridos (gente externa al club). Con
cualquiera de estos dos endpoints, un comercio puede: enumerar DNIs (7-8 dígitos) y
cosechar nombre + foto + si está moroso de todo el padrón.

**Fix:**
- `GET /usuarios/` → `require_roles(*_ADMIN)` (o eliminarlo si nadie lo usa; hay
  `admin_usuarios.listar_todos_los_usuarios` que ya está guardado).
- Sacar `invitado` de `_ROLES_SCANNER`, o que para ese rol la respuesta sea mínima
  (`es_valido` + nombre, sin estado financiero ni foto ni roles).
- Rate-limit en `validar-dni`.

---

## MEDIA

> M1–M6 ✅ `4acc926` · M7–M11 ✅ `5a8ee19`.

### M1 ✅ · Webhook de MP: no verifica el monto
**Dónde:** `routers/webhooks_mercadopago.py::recibir_webhook_mercadopago`.

Aprueba el `Pago` con solo `estado_mp == "approved"` + `external_reference == id_pago`.
Nunca compara `pago_mp["transaction_amount"]` contra `pago.monto_total`.

**Fix:** antes de aprobar, `assert Decimal(str(pago_mp["transaction_amount"])) >= pago.monto_total`.

### M2 ✅ · La preferencia de MP ignora el `saldo_a_favor` aplicado
**Dónde:** `routers/socio_carrito.py::_crear_preferencia_mercado_pago` + `checkout_carrito`.

La preference se arma con `items_resueltos` a precio completo. Si el socio hizo
`usar_saldo=True` con saldo parcial y `metodo_pago="mercado_pago"`: `pago.monto_total` y el
saldo descontado reflejan el descuento, pero MP le cobra el total sin descuento → paga de
más y el saldo ya se le restó.
Además, con `saldo_cubre_todo=True` + `metodo_pago="mercado_pago"`, la línea 472
(`metodo = payload.metodo_pago`, el valor previo al override) hace que igual se genere un
`init_point` de MP para un `Pago` que ya se auto-aprobó.

**Fix:** si `usar_saldo` reduce el total, la preference tiene que usar el neto (un único
ítem "Compra CAR" por `pago.monto_total`) — o prohibir `usar_saldo` + `mercado_pago` juntos.
Y cortar el branch de MP cuando `saldo_cubre_todo`.

### M3 ✅ · La firma del webhook de MP se saltea según un flag del propio body
**Dónde:** `routers/webhooks_mercadopago.py` (~149): `es_live = body.get("live_mode", False)`;
la firma solo se valida si `es_live`. El atacante controla el body → manda `live_mode:false`
y no hay validación. Además `_validar_firma` devuelve `True` si `MP_WEBHOOK_SECRET` no está
seteado. (Mitiga bastante que igual se consulta la API real de MP, pero es débil.)

**Fix:** validar firma siempre que `MP_WEBHOOK_SECRET` esté seteado; controlar el modo
sandbox con una env var, no con el body. Verificar que `MP_WEBHOOK_SECRET` esté en Render.

### M4 ✅ · Carreras por falta de lock en transiciones de estado (plata / stock / billetera)
Mismo patrón en varios lados: `SELECT` y después mutar en Python bajo READ COMMITTED, sin
`with_for_update()`. Bajo concurrencia (dos admins, o admin + webhook de MP, o doble-submit):

| Endpoint | Efecto de la carrera |
|---|---|
| `admin_ordenes.aprobar_orden` / `reabrir_orden` | doble descuento de stock / doble avance de `mes_cubierto_hasta` |
| `admin_pagos.registrar_pago_manual` | dos cobros en ventanilla → un solo avance de cobertura (plata cobrada, cobertura no) |
| `admin_reservas.suspender_reserva` | dos admins suspendiendo la misma reserva por lluvia → **doble crédito de `saldo_a_favor`** |
| `admin_reservas.definir_forma_reintegro` | dos llamadas `forma=saldo_a_favor` sobre un reintegro `pendiente` → doble crédito |
| `socio_cuotas.cancelar_orden_pendiente` vs `aprobar_orden` | orden queda `cancelada_socio` pero la cobertura/stock ya se aplicaron |

`escanear_qr` es el único que lo hace bien (`INSERT ... ON CONFLICT DO NOTHING`).

**Fix:** `with_for_update()` sobre la fila clave (orden / reserva / usuario / reintegro) al
principio de cada uno de estos handlers, o `UPDATE ... WHERE estado = :esperado` con chequeo
de `rowcount`.

### M5 ✅ · Cambiar la contraseña desde la app no invalida los JWT viejos
**Dónde:** `routers/usuarios.py::cambiar_password`.

Setea `password_hash` y `requiere_cambio_password=False` pero **no** `password_actualizada_en`
— que es justo el campo que `dependencies.get_current_user` usa para rechazar tokens
emitidos antes del cambio. `auth.py::resetear_password` sí lo setea.

**Impacto:** si el socio cambia la clave porque se la comprometieron (o porque la provisoria
`car`+DNI es adivinable), el token viejo del atacante sigue vivo hasta 8 h.

**Fix:** en `cambiar_password`, `current_user.password_actualizada_en = datetime.now(timezone.utc)`.

### M6 ✅ · No se exige el cambio de contraseña a nivel API
`dependencies.get_current_user` no mira `requiere_cambio_password`. Una cuenta con clave
provisoria (`car` + últimos 5 del DNI, adivinable para un DNI puntual) recibe un token de
8 h y puede llamar cualquier endpoint por API; solo la SPA bloquea la navegación.

**Fix:** en `get_current_user` (o en un dependency aparte para las rutas sensibles), si
`requiere_cambio_password` es True, permitir solo `GET /usuarios/me` y `POST /usuarios/me/password`.

### M7 ✅ · `personal_administrativo` puede reescribir los meses de cuota al aprobar
**Dónde:** `routers/admin_ordenes.py::aprobar_orden` (`_ROLES_ADMIN` incluye `personal_administrativo`) + `utils/ordenes.py::procesar_aprobacion_orden` (paso 1).

`payload.meses_corregidos` (validado solo `gt=0`, sin tope) sobreescribe `detalle.cantidad`
y `orden.monto_total`, y con eso el avance de `mes_cubierto_hasta`. Además **rompe la
invariante** `Pago.monto_total == Σ Orden.monto_total` (no actualiza el `Pago` padre) →
el "saldo aplicado" del mail de confirmación y cualquier reporte sobre `pago.monto_total`
quedan mal.

**Fix:** decidir si `personal_administrativo` puede corregir meses (si no, mover ese
parámetro a un endpoint `admin_general`); poner tope (`le=`); y actualizar `pago.monto_total`
cuando se corrige.

### M8 ✅ · `admin_temporal` mueve plata en el flujo de reintegros
**Dónde:** `routers/admin_reservas.py::definir_forma_reintegro` (`_ROLES_ESCANEO` = incluye `admin_temporal`).

`admin_temporal` es "solo lector QR/DNI en puertas" según el diseño, pero puede hacer
`PATCH /admin/reintegros/{id}/forma?forma=saldo_a_favor` → acredita billetera (y al revés,
debita). `configurar_reparto` (`_ROLES_ADMIN`, incluye `personal_administrativo`) fija
`monto_reintegro_unitario` sin tope superior. Montos chicos y todo auditado, pero
`admin_temporal` no debería ser rol de plata.

**Fix:** `definir_forma_reintegro` → `_ROLES_ADMIN`; validar `monto_reintegro_unitario >= 0`
y `<= precio_total` en `configurar_reparto`.

### M9 ✅ · Endpoints públicos sin rate limiting / anti-abuso
- `POST /usuarios/` — registro masivo → spam de la bandeja del admin + mails
  `solicitud_recibida` / `aviso_admin_nuevo_socio` a direcciones arbitrarias desde el
  dominio Resend del club (riesgo de reputación del dominio).
- `POST /auth/recuperar-password` — bombing de mails de reset a una víctima.
- `POST /faq/contacto` — mail al club sin auth; si `task_contacto_publico` mete
  `email`/`nombre` en headers (From/Reply-To) sin sanitizar → **inyección de headers CRLF**.
  Verificar ese task.
- El lockout de login es en sí un vector de griefing: DNI conocido (el sistema los revela)
  + 5 intentos malos = 15 min bloqueado, y **cada** intento malo posterior re-bloquea
  (`intentos_fallidos` solo se resetea con login exitoso).

**Fix:** rate limiting por IP en los 3 endpoints públicos; CAPTCHA en registro y contacto;
sanitizar/validar el `email` de contacto; resetear `intentos_fallidos` cuando pasa
`bloqueado_hasta`.

### M10 ✅ · `uploads/` servido sin auth + `foto_perfil_url` editable como string libre
**Dónde:** `main.py` (`app.mount("/uploads", StaticFiles(...))`) · `routers/usuarios.py::actualizar_perfil` (`_CAMPOS_EDITABLES_SOCIO` incluye `foto_perfil_url`).

En prod los archivos van a S3, pero el bug conocido #9 (fallback a ruta local) dejaría
comprobantes en `/uploads/comprobantes/...` accesibles sin ninguna autenticación. Y un
socio puede `PATCH /usuarios/{suyo}` con `foto_perfil_url` = cualquier string (ruta local
arbitraria o URL externa).

**Fix:** quitar el mount de `/uploads` en prod (o ponerlo detrás de auth); sacar
`foto_perfil_url` del whitelist del socio (ya existe `POST /usuarios/me/foto` dedicado).

### M11 ✅ · Chequeo de tamaño de upload después de leer todo el archivo en memoria
**Dónde:** `socio_cuotas.py::subir_comprobante` (10 MB) y `usuarios.py::subir_foto_perfil` (5 MB).

`contenido = await file.read()` antes de validar el tamaño → un POST grande puede reventar
por RAM la instancia de 512 MB de Render (free tier).

**Fix:** chequear `request.headers["content-length"]` primero, y/o leer en chunks cortando
al superar el límite.

---

## BAJA / hardening

- **B1 — Sin gate de rol en el frontend.** `RutaPrivada` solo mira el token; `App.jsx` no
  tiene rutas por rol: cualquier logueado puede navegar a `/admin/*`, `/gestion-planteles`,
  etc. El backend igual rechaza los datos (verificado), así que no es fuga — pero es la causa
  probable del bug #4 y de "la página de admin se ve rota". Agregar un `<RequireRole roles={[...]}>`.
- **B2 — Sin tope en `meses_a_pagar` / `cantidad` / `meses_corregidos`.** `gt=0`/`ge=1` sin
  `le=`. Valores enormes → overflow de `Numeric(10,2)` o `date` con año > 9999 → 500
  (en la aprobación, para el camino del socio). Poner `le=` razonable (ej. 60).
- **B3 — `notificar_cuotas_vencidas` no le escribe a los que nunca pagaron.**
  `Usuario.mes_cubierto_hasta < hoy` con `mes_cubierto_hasta IS NULL` → `NULL` en SQL → fila
  excluida. Los socios nuevos que nunca abonaron no reciben el aviso.
- **B4 — Todo en UTC.** `date.today()` y el scheduler → off-by-one en el día de vencimiento y
  en el cálculo de edad ~3 h por noche (Argentina UTC-3). Ya está en el checklist de QA.
- **B5 — `GET /` expone el host de la base** (`bd_host`). Sacarlo.
- **B6 — N+1 en `admin_pagos.listar_morosos`**: una query a `ConfiguracionGlobal` por socio
  dentro del loop. Con 300-500 socios y cold start de Neon, lento. Leer la config una vez.
- **B7 — `registrar_pago_manual` no chequea si el socio ya tiene una orden de cuota
  pendiente** → el admin puede cobrar en ventanilla y después aprobar también la pendiente
  (doble cobertura).
- **B8 — `suspender_reserva` acredita el precio histórico completo** aunque parte de esa
  reserva se haya pagado originalmente con saldo → sobre-crédito chico en ese caso.
- **B9 — Enumeración en login/registro**: mensajes distintos para DNI inexistente / clave
  mala / dado de baja (+ leak de `id_usuario`), y "email ya registrado" vs "DNI ya
  registrado". Decisión explícita del equipo según los docstrings — se deja anotado.
- **B10 — `token_recuperacion` en texto plano en la DB** (TTL 1 h, 256 bits aleatorios, no
  brute-forceable). Idealmente hashearlo at rest.
- **B11 — bcrypt trunca a 72 bytes a mano** (documentado): dos contraseñas con los mismos
  primeros 72 bytes son equivalentes.
- **B12 — `actualizar_perfil` (rama admin) no audita.** Un `admin_general` cambiando
  `es_becado` / `dni` / `email` / `is_directivo` vía `PATCH /usuarios/{id}` no deja
  `audit_log` (a diferencia de `ajustar_saldo`, `dar_baja`, `CAMBIO_ROLES`). Confirmar si
  `admin_usuarios.editar_socio` es el camino "oficial" y si ese sí audita.
- **B13 — `ajustar_saldo` reemplaza en vez de sumar** → si entra un reintegro entre que el
  admin lee el saldo en la UI y envía el nuevo total, el ajuste pisa el reintegro. Considerar
  API de delta (`+/- monto`) en vez de valor absoluto.
- **B14 — APScheduler sin lock de instancia única.** Irrelevante en Render free (1 instancia),
  pero si algún día escala, los jobs corren N veces (doble restore de stock, doble mail).

---

## Lo que está bien (no tocar)

- **Dinero:** todas las columnas monetarias son `Numeric(10,2)` / `Decimal`. `_calcular_precio_cuota`
  opera en `Decimal` estricto. El precio que manda el frontend se ignora; se resuelve en el
  backend en el checkout y se congela en `DetalleOrden.precio_unitario_historico`.
- **Motor de cuotas:** `calcular_nuevo_mes_cubierto` / `calcular_estado_financiero`
  (`utils/cuotas_periodos.py`) — la lógica "sin amnistía" (la base es siempre
  `mes_cubierto_hasta`, nunca se saltea a hoy) es correcta y consistente entre el pago
  manual y la aprobación (ambos usan el mismo motor). **El bug conocido #1 ("pagar N muestra
  N-1") parece ya resuelto** en el código actual — agregar un test de regresión y cerrarlo.
- **Roles:** `require_roles` re-consulta los roles desde la DB en cada request (los roles del
  JWT son informativos), respeta `es_activo` y `valido_hasta`. `admin_general` y `socio` son
  inmutables por API; no se puede auto-quitar `admin_general`; hay protección de "último
  admin" en la baja; los cambios de rol quedan auditados.
- **Scoping de técnicos:** `_verificar_acceso_categoria` / `_verificar_acceso_evento` están
  llamados en todos los endpoints que mutan plantel/convocatoria/asistencia
  (`inscribir_jugador`, `eliminar_jugador`, `actualizar_capitan`, `convocar_jugadores_evento`,
  `eliminar_convocatoria`, `cerrar_convocatoria_evento`, `listar_asistencias_evento`).
- **`escanear_qr`** usa `INSERT ... ON CONFLICT DO NOTHING` sobre `uq_reintegro_reserva_usuario` — race-safe.
- **`actualizar_perfil`** aplica el whitelist de campos del socio en código (bug histórico ya corregido).
- **IDOR:** `cancelar_orden_pendiente`, `subir_comprobante`, `notificaciones/marcar-leidas`,
  `socio_billetera` filtran por `id_usuario` y devuelven 404 en filas ajenas.
- **MP idempotencia** vía la constraint única de `mp_payment_id` (que además cubre por
  accidente la carrera de webhooks concurrentes, vía IntegrityError + rollback).
- **Audit logging** amplio y consistente en toda acción de estado/plata del admin.

---

## Orden sugerido de corrección para el MVP

1. ~~**A1** (schema de registro)~~ ✅
2. ~~**A3 + A4** (modelo de stock coherente)~~ ✅
3. **A2** ✅ (saldo) · **M4** pendiente (resto de los locks: aprobación / suspensión / reintegro / cancelación-vs-aprobación).
4. ~~**A5** (cerrar `GET /usuarios/` + `invitado` fuera de `validar-dni` + respuesta mínima para `invitado`)~~ ✅
5. **M1 + M2 + M3** (webhook MP: verificar monto, respetar saldo, firma siempre) — pendiente.
6. **M5 + M6** (invalidación de token al cambiar clave + enforcement de `requiere_cambio_password`) — pendiente.
7. **M9** (rate limiting en los 3 endpoints públicos) — pendiente.
8. El resto (MEDIA/BAJA) entra en el backlog post-MVP salvo que el testeo manual los toque.

---

## Detalle de la corrección de ALTA (2026-09-06)

### A1 ✅ — `routers/usuarios.py::crear_usuario`
Descarta `es_becado`, `becado_hasta`, `id_titular` del payload de alta pública antes de
construir el `Usuario`. La beca/familia solo se asignan desde el panel admin.

### A2 ✅ — `routers/socio_carrito.py::checkout_carrito`
Antes de leer/escribir `saldo_a_favor`, lock pesimista de la fila del socio
(`db.query(Usuario).filter(...).populate_existing().with_for_update().one()`). Dos checkouts
concurrentes ahora se serializan → no se puede gastar el saldo dos veces.

### A3 ✅ — `utils/ordenes.py::procesar_aprobacion_orden`
Eliminado el segundo `stock -= cantidad` en la aprobación. El stock se descuenta **solo** en
el checkout. Nuevo helper `restaurar_stock_orden(orden)` como única definición de "devolver
stock".

### A4 ✅ — rechazo / cancelación / expiración
`restaurar_stock_orden(orden)` se llama ahora en `admin_ordenes.rechazar_orden`,
`socio_cuotas.cancelar_orden_pendiente` y `scheduler.expirar_ordenes_vencidas`
(este último reemplaza su loop inline por el helper). Ciclo completo:
checkout −1 · (rechazo/cancelación/expiración) +1 · reabrir −1 · aprobar 0.

### A5 ✅ — `routers/usuarios.py` + `routers/qr_auth.py`
- `GET /usuarios/` → `require_roles("admin_general", "personal_administrativo")` (no lo consume
  ninguna pantalla; el registro usa `POST`, no este listado). `limit` con tope 500.
- `POST /qr/validar-dni` → nuevo `_ROLES_SCANNER_DNI` sin `invitado` (mata la enumeración de
  DNIs por comercios).
- `POST /qr/validar-token` → sigue disponible para `invitado` (es el flujo real de beneficios:
  escanear el QR del socio), pero si el operador es **solo** `invitado`, la respuesta se
  recorta: sin foto, sin roles, sin detalle de morosidad; `estado_financiero` colapsa a
  `no_habilitado` cuando `es_valido` es False.
- **Cambio de comportamiento a confirmar con el club:** una cuenta `invitado` ya no puede
  hacer búsqueda manual por DNI en el escáner. Si algún comercio realmente lo necesita, hay
  que darle otro rol o un endpoint acotado. Conviene además ocultar el input de DNI en
  `AdminScanner.jsx` para operadores `invitado`.

---

## Detalle de la corrección de MEDIA M1–M6 (2026-09-06 · commit `4acc926`)

### M1 ✅ — `routers/webhooks_mercadopago.py`
Antes de aprobar, compara `transaction_amount` (traído de la API de MP) contra
`pago.monto_total` con tolerancia de 1 centavo. Si MP cobró menos → no aprueba, guarda el
`mp_payment_id` y devuelve `{"status": "monto_no_coincide", ...}` para revisión manual.

### M2 ✅ — `routers/socio_carrito.py`
- `_crear_preferencia_mercado_pago`: si la suma de ítems ≠ `pago.monto_total` (= se aplicó
  saldo a favor), la preference se colapsa a **un solo ítem** por `pago.monto_total`. Antes
  MP cobraba el bruto mientras la billetera ya se había debitado.
- `checkout_carrito`: `metodo = "saldo_a_favor" if saldo_cubre_todo else payload.metodo_pago`
  → cuando el saldo cubre todo, ya no se genera link de MP ni se dispara el aviso de
  "efectivo" ni el mail de "orden generada" (el Pago ya se auto-aprobó y salió el de
  "compra confirmada").

### M3 ✅ — `routers/webhooks_mercadopago.py`
Se elimina el gate `body["live_mode"]`. La firma se valida **siempre** que
`MP_WEBHOOK_SECRET` esté seteado (`_validar_firma` solo hace skip si el secret está vacío,
para sandbox local). ⚠️ **En Render, `MP_WEBHOOK_SECRET` DEBE estar configurado** — sin él,
el webhook queda sin autenticar.

### M4 ✅ — `with_for_update()` en 6 puntos
| Función | Fila(s) lockeada(s) | Carrera que cubre |
|---|---|---|
| `utils/ordenes.procesar_aprobacion_orden` | socio | admin + webhook MP / doble aprobación → doble avance de `mes_cubierto_hasta` |
| `admin_ordenes._obtener_orden_o_404(lock=True)` (aprobar/rechazar/reabrir) | orden | doble aprobación, aprobar-vs-rechazar, cancelar-socio-vs-aprobar |
| `admin_pagos.registrar_pago_manual` | socio | dos cobros de ventanilla / cobro + aprobación de pendiente |
| `admin_reservas.suspender_reserva` | reserva + responsable | dos admins suspendiendo por lluvia → doble crédito de saldo |
| `admin_reservas.definir_forma_reintegro` | reintegro + socio | doble `forma=saldo_a_favor` / reintegros hermanos del mismo socio |

Análisis de deadlock: el único orden de adquisición con dos filas es orden→socio (aprobar).
Ningún camino toma socio→orden. Sin ciclo. Los locks no se sostienen sobre llamadas de red
(las de MP van antes del lock o después del commit).

### M5 ✅ — `routers/usuarios.py::cambiar_password`
Setea `password_actualizada_en = now(utc)` → `get_current_user` rechaza los JWT emitidos
antes del cambio. **Efecto para el usuario:** al cambiar la contraseña desde el perfil, la
sesión actual se corta y hay que volver a loguear. El frontend debería manejar el 401
posterior con un redirect limpio a `/login` en vez de mostrar un error.

### M6 ✅ — `dependencies.py::get_current_user`
Si `requiere_cambio_password` es True, cualquier ruta que no sea `GET /usuarios/me` o
`POST /usuarios/me/password` responde `403 {"tipo": "requiere_cambio_password"}`. Antes esto
solo lo bloqueaba la SPA; con un token de clave provisoria (`car`+DNI, adivinable) se podía
operar toda la API por fuera. `get_current_user` y `get_current_user_optional` ahora reciben
`Request` para conocer la ruta.

---

## Testing pendiente (necesita base real)

1. **Stock (A3/A4):** comprar→aprobar (stock −1, no −2), comprar→rechazar (vuelve), comprar→
   expirar (vuelve), reabrir (vuelve a salir). Verificar contra el stock inicial.
2. **Saldo (A2/M4):** dos checkouts casi simultáneos con `usar_saldo` → solo uno consume.
3. **Registro (A1):** `POST /usuarios/` con `{"es_becado": true, "id_titular": 1}` → se ignora,
   el socio queda no-becado y sin titular.
4. **QR invitado (A5):** login como `invitado` → `validar-token` devuelve respuesta recortada;
   `validar-dni` responde 403.
5. **Primer ingreso (M6):** login con `requiere_cambio_password=True` → `GET /socio/cuotas/estado`
   responde 403 `requiere_cambio_password`; `POST /usuarios/me/password` funciona; después
   todo normal.
6. **Cambio de clave (M5):** cambiar desde `/perfil` → la request siguiente con el token viejo
   responde 401.
7. **MP (M1/M2/M3):** webhook sin firma con `MP_WEBHOOK_SECRET` seteado → 401. Checkout con
   saldo parcial + MP → el link de MP cobra el neto.

---

## Detalle de la corrección de MEDIA M7–M11 + B2 (2026-09-06 · commit `5a8ee19`)

### M7 ✅ — `routers/admin_ordenes.py` + `utils/ordenes.py`
- `aprobar_orden`: si viene `meses_corregidos`, exige que el operador tenga rol
  `admin_general` (Personal Administrativo solo aprueba/rechaza tal cual).
- `procesar_aprobacion_orden`: al corregir meses, ajusta `pago.monto_total` el
  mismo delta que `orden.monto_total` → se mantiene `Pago.monto_total == Σ Orden.monto_total`.

### M8 ✅ — `routers/admin_reservas.py` + `schemas.py`
- `definir_forma_reintegro`: pasar un reintegro a `saldo_a_favor` (acredita
  billetera) exige `admin_general`/`personal_administrativo`. `admin_temporal`
  sigue pudiendo registrar `efectivo`/`transferencia`/`ya_descontado`.
- `ConfigurarRepartoPayload`: `monto_reintegro_unitario` ahora **está declarado**
  en el schema (accederlo tiraba `AttributeError` → 500) con `ge=0, le=999999.99`.
  `num_socios_esperados` con `le=500`.

### M9 ✅ — `utils/ratelimit.py` (nuevo) + `usuarios.py` / `auth.py` / `faq.py`
- Rate limiter in-memory por IP, sin dependencia nueva. Se aplica como
  **dependencia** de FastAPI (corre antes de validar el body):
  `POST /usuarios/` 5/h · `POST /auth/recuperar-password` 5/h · `POST /faq/contacto` 3/h.
- `login`: al vencer `bloqueado_hasta` se resetea `intentos_fallidos` (antes
  quedaba en 5 y cualquier typo posterior re-bloqueaba 15 min).
- **Inyección de headers vía `/contacto`: NO aplica** — el mail sale por la API
  HTTP de Resend (`httpx`, `json=`), no por SMTP; el `nombre` en el Subject es
  un campo JSON, no una línea de header.
- ⚠️ El estado del limiter vive en memoria del proceso → se reinicia en cada
  deploy/spin-down y no se comparte entre instancias. Es un mitigador, no una
  garantía. Suficiente para el MVP (Render free, 1 instancia).

### M10 ✅ — `main.py` + `usuarios.py`
- `main.py` monta **solo** `/uploads/fotos_perfil` (baja sensibilidad + URLs
  locales legacy en DB). **Nunca** `/uploads/comprobantes` — en prod van a S3
  (bucket privado + presigned) y las rutas locales legacy solo se ven detrás de
  la verificación del admin.
  ⚠️ Si hay comprobantes viejos guardados como ruta local en la DB, en la
  pantalla de verificaciones se verán rotos → migrarlos a S3 o resolver a mano.
- `foto_perfil_url` sale de `_CAMPOS_EDITABLES_SOCIO` (era string libre que el
  socio podía apuntar a cualquier ruta). Se cambia por `POST /usuarios/me/foto`.
  Verificado: el frontend (`SocioPerfil.jsx`) manda solo `{telefono, direccion}`
  en el PATCH → no se rompe nada.

### M11 ✅ — `socio_cuotas.py` + `usuarios.py`
`subir_comprobante` y `subir_foto_perfil` leen con `await file.read(limite + 1)`
→ nunca se carga en RAM más que el límite + 1 byte, aunque el cliente mienta en
Content-Length. 413 si excede.

### B2 ✅ — `schemas.py`
`le=`: `meses_a_pagar` (60), `cantidad` de ítem de carrito (100),
`meses_corregidos` (60), `num_socios_esperados` (500).

---

## Veredicto (2026-09-06)

**Seguridad y manejo de dinero: cerrado para el MVP.** Los 5 hallazgos ALTA y los
11 MEDIA están corregidos. No queda ninguna vía conocida de: alta gratis, doble
gasto de saldo, doble movimiento de stock, doble crédito de billetera, aprobación
de MP sin verificar monto/firma, escalada de privilegios, ni exposición del
padrón/estado financiero a roles que no corresponden.

**Falta antes de abrir a los 300:**

1. **Testeo con base real** — checklist de 7 escenarios abajo. Sin esto no se
   puede dar por bueno ningún fix (varios son de concurrencia y de flujo de plata).
2. **B4 — zona horaria (recomendado).** `date.today()` y el scheduler corren en
   UTC; entre las 21 y 24 hs ARG el backend adelanta un día → un socio figura
   moroso ~3 h antes de tiempo en su último día cubierto, y el descuento de
   menor puede quedar off-by-one el día del cumpleaños. `qr_auth.py` ya usa
   `America/Argentina/Buenos_Aires`; hay que llevar ese criterio a
   `utils/cuotas_periodos`, `scheduler.py`, `admin_pagos.py`, `admin_usuarios.py`.
   Es correctness visible para el socio, no seguridad.
3. **B1 — gate de rol en el frontend (recomendado).** `RutaPrivada` solo mira el
   token. Cualquier logueado puede navegar a `/admin/*`; el backend rechaza los
   datos (verificado) pero la página se ve rota → es la causa probable del bug
   #4 y de carga de soporte. Es un `<RequireRole>` envolviendo los grupos de
   rutas admin/técnico/jugador.

**Se puede diferir a post-MVP:** B3, B5–B14 (N+1 en morosos, `bd_host` en `/`,
hash del token de recuperación, auditar el PATCH admin de perfil, etc.). Ninguno
es riesgo de plata ni de acceso.

**Mi recomendación:** un sprint corto B1 + B4 + los one-liners (B3, B5, B6, B7,
B8, B12) — 1 a 2 días — y con eso el backend queda listo para el testeo end-to-end
del checklist de QA. B1 se puede hacer en paralelo con el QA manual.

---

## Testing pendiente (necesita base real) — actualizado

1. **Stock (A3/A4):** comprar→aprobar (−1, no −2), comprar→rechazar (vuelve),
   comprar→expirar (vuelve), reabrir (vuelve a salir).
2. **Saldo (A2/M4):** dos checkouts casi simultáneos con `usar_saldo` → uno solo consume.
3. **Registro (A1):** `POST /usuarios/` con `es_becado:true`, `id_titular:1` → ignorado.
4. **QR invitado (A5):** `validar-token` recortado; `validar-dni` → 403.
5. **Primer ingreso (M6):** token con `requiere_cambio_password` → 403 en cualquier
   ruta salvo `GET /usuarios/me` y `POST /usuarios/me/password`.
6. **Cambio de clave (M5):** cambiar desde `/perfil` → request siguiente con el
   token viejo → 401. **El frontend debe redirigir a /login, no mostrar error.**
7. **MP (M1/M2/M3):** webhook sin firma con secret seteado → 401; checkout con
   saldo parcial + MP → el link cobra el neto.
8. **M7:** Personal Administrativo aprobando con `meses_corregidos` → 403.
9. **M8:** `admin_temporal` haciendo `definir_forma_reintegro?forma=saldo_a_favor` → 403.
10. **M9:** 6º `POST /usuarios/` desde la misma IP en una hora → 429.
11. **M11:** subir un archivo de 20 MB como comprobante → 413, sin picos de RAM.
