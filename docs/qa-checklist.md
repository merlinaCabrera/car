# QA manual — Checklist del MVP (CAR)

Guía de pruebas manuales para correr **antes de cada release** del MVP.
Alcance del MVP: alta de socio, login/primer ingreso, cuotas, QR + escáner,
reservas de canchas/quincho, panel admin básico.

> **Regla de oro:** correr todo esto en **staging**, nunca en producción.
> Staging = branch de Neon aparte (o DB `car_dev`) + bucket `car-archivos-dev`.

---

## Cómo usar este documento

1. Antes de cada release, hacé una copia de este archivo (o una hoja de cálculo)
   con fecha y commit, y marcá cada ítem.
2. Secciones **1 a 9**: correr completas en cada release (flujos críticos).
3. Secciones **10 a 13**: correr al menos una vez por semana o cuando toques
   scheduler / mails / mobile.
4. Cada bug encontrado: anotarlo con nº de sección + pasos para reproducir +
   qué esperabas vs qué pasó.

**Convención:** `- [ ]` sin probar · `- [x]` pasa · marcar `❌ BUG` al lado si falla.

---

## Regresiones a confirmar (los 9 bugs conocidos, ya corregidos)

**Todos fueron corregidos el 2026-09-06** (ver `docs/auditoria-2026-09-06.md`).
No los busques: **confirmá que siguen arreglados**. Si alguno reaparece, es una
regresión y conviene avisar antes de seguir.

| # | Qué debe pasar ahora | Sección |
|---|----------------------|---------|
| 1 | Pagar N meses acredita **N** (hay test automático por los dos caminos) | 3.4, 3.5 |
| 2 | Con orden pendiente, el socio ve **"Pago en verificación"**, no "MOROSO" en rojo | 3.3 |
| 3 | Doble clic en confirmar **NO** duplica la orden (guarda de re-entrada) | 3.6 |
| 4 | Post-login cae en el home que corresponde al rol, sin doble redirect | 2.1 |
| 5 | El cambio de clave funciona **y la sesión no se cae** (devuelve token nuevo) | 2.3 |
| 6 | El badge aparece solo, sin navegar (refresca cada 60 s y al volver a la pestaña) | 7.1 |
| 7 | Los links de los mails apuntan al dominio real (depende de `FRONTEND_URL` en Render) | 12 |
| 9 | La foto de perfil carga bien | 6.2 |

### Además, verificar lo que se arregló en esta ronda
- [ ] **Escáner de eventos** (`/admin/escaner-evento`): escanear un QR muestra el
      **nombre del socio** y registra la asistencia. (Antes daba 404 y mostraba
      la tarjeta vacía — nunca había funcionado.)
- [ ] **Agenda de reservas** → modal de un turno pendiente → "Rechazar / Liberar
      turno" **funciona**. (Antes daba 404 siempre.)
- [ ] **Suspender por lluvia**: en un turno `confirmada`, el botón "Suspender por
      lluvia / mantenimiento" libera el turno y **acredita saldo a favor** al socio.
      (Antes no existía el botón.)
- [ ] **Mensajes de error**: forzá un error de validación (ej. dejar un campo
      obligatorio vacío en un form del admin) → tiene que mostrar texto legible,
      **nunca `[object Object]`**.
- [ ] **Recuperar contraseña**: pedirlo 6 veces seguidas → el 6º avisa que
      esperes unos minutos, en vez de decir "te mandamos el mail" sin mandarlo.

---

## 0. Preparación del ambiente y datos de prueba

- [ ] Apuntando a **staging** (verificar `VITE_API_URL` y `DATABASE_URL`)
- [ ] `alembic upgrade head` aplicado
- [ ] Usuario "sistema" creado (`python -m scripts.seed_usuario_sistema`)
- [ ] Config del club cargada: cuota social, día de vencimiento (10), descuento menores (40%)
- [ ] Instalaciones disponibles: `cancha_1`, `cancha_2`, `quincho`

**Usuarios de prueba a tener cargados:**

| Alias | Rol(es) | Estado | Para qué |
|-------|---------|--------|----------|
| `admin@test` | `admin_general` | activo | Aprobaciones, CRUD, config |
| `staff@test` | `personal_administrativo` | activo | Probar límites de permisos |
| `portero@test` | `admin_temporal` | activo | Escáner en puerta |
| `socio-aldia@test` | `socio` | al día | Camino feliz |
| `socio-moroso@test` | `socio` | 3 meses de deuda | Deuda, morosidad, precio indexado |
| `socio-menor@test` | `socio` | menor de edad, al día | Descuento 40% |
| `socio-primer-login@test` | `socio` | `requiere_cambio_password = true` | Primer ingreso |
| `socio-baja@test` | `socio` | dado de baja | Rechazo en escáner |

---

## 1. Alta de socio

### 1.1 Registro público
- [ ] `/registro`: completar el form y enviar → mensaje "solicitud recibida"
- [ ] Llega mail **`solicitud_recibida`** al socio
- [ ] Llega mail **`aviso_admin_nuevo_socio`** al admin
- [ ] La solicitud aparece en `/admin/solicitudes`
- [ ] Registrar con un **DNI ya existente** → error claro, no crea nada
- [ ] Registrar con un **email ya existente** → error claro
- [ ] Campos obligatorios vacíos → validación del form, no rompe

### 1.2 Aprobación
- [ ] Admin en `/admin/solicitudes` → **Aprobar**
- [ ] Llega mail **`cuenta_aprobada`** con instrucciones de primer login
- [ ] El socio aparece en `/admin/socios` como activo
- [ ] **El socio arranca AL DÍA, no moroso** (regresión del bug histórico #8)
- [ ] El socio puede loguear con la provisoria: `car` + últimos 5 dígitos del DNI

### 1.3 Rechazo
- [ ] Admin rechaza una solicitud con motivo
- [ ] Llega mail **`solicitud_rechazada`**
- [ ] Ese usuario no puede loguear

### 1.4 Alta manual desde admin
- [ ] Admin en `/admin/socios` → crear socio nuevo
- [ ] Llega mail **`bienvenida_alta_manual`**
- [ ] **Arranca al día, no moroso** (bug #8)
- [ ] Queda registrado en `/admin/auditoria`

---

## 2. Login y primer ingreso

### 2.1 Login OK
- [ ] DNI + password correcta → entra al home de su rol (socio → `/socio`,
      staff → `/admin`, técnico → `/gestion-planteles`, portero → `/admin/escaner`),
      **sin doble redirect visible**
- [ ] El menú hamburguesa muestra solo las opciones del rol del usuario

### 2.2 Login fallido
- [ ] Password incorrecta → error, no entra
- [ ] DNI inexistente → **mismo mensaje genérico** que password mala (no revelar si el DNI existe)
- [ ] Varios intentos fallidos seguidos → **rate limiting** (bloqueo temporal), mensaje claro
- [ ] Tras esperar el bloqueo, se puede volver a intentar

### 2.3 Primer ingreso / cambio obligatorio
- [ ] Login con `socio-primer-login@test` → redirige a `/cambiar-password-obligatorio`
- [ ] No se puede navegar a otra ruta hasta cambiar la password
- [ ] Cambiar la password → redirige a `/socio` **sin pedir volver a loguear**
      (el backend devuelve un token nuevo; si te patea al login, es regresión)
- [ ] Logout + login con la password nueva → OK
- [ ] La provisoria vieja ya **no** funciona

### 2.4 Recuperar password
- [ ] `/recuperar-password` → ingresar email → mensaje neutro ("si existe, te enviamos un mail")
- [ ] Llega mail **`recuperar_password`** con link
- [ ] El link abre el form de nueva password; cambiar → login con la nueva OK
- [ ] Reusar el mismo link → **error** (token ya usado)
- [ ] Link vencido → **error** claro
- [ ] Email inexistente → mismo mensaje neutro y **no llega ningún mail**

---

## 3. Cuotas (núcleo del MVP)

### 3.1 Estado de cuenta — socio al día
- [ ] `/socio/cuotas`: muestra "al día" y el próximo vencimiento correcto (día 10)
- [ ] Calendario mensual: meses pagos en verde, meses futuros sin marcar
- [ ] El QR en `/socio` muestra estado "al día"

### 3.2 Estado de cuenta — socio moroso
- [ ] `socio-moroso@test`: deuda = **meses adeudados × precio de cuota actual**
- [ ] El calendario marca los meses adeudados
- [ ] El QR muestra "moroso"

### 3.3 Pago por comprobante (socio)
- [ ] `/socio/cuotas` o carrito → elegir pagar **2 meses**
- [ ] El monto = 2 × cuota (con descuento del 40% si el socio es menor)
- [ ] Checkout → se crea orden en estado `pendiente_verificacion`
- [ ] **Regresión #2:** tras crear la orden, `/socio` y `/socio/cuotas` deben mostrar
      **"Pago en verificación"** (azul), no "MOROSO" (rojo). El QR sigue inhabilitado
      hasta la aprobación — eso es correcto.
- [ ] Subir foto del comprobante → la orden queda con el adjunto
- [ ] Llega mail **`orden_generada`**
- [ ] La orden aparece en `/admin/verificaciones`

### 3.4 Aprobación / rechazo de pago (admin)
- [ ] `/admin/verificaciones` → abrir el comprobante (la imagen carga desde S3)
- [ ] **Aprobar** →
  - [ ] Se acreditan los meses; `mes_cubierto_hasta` avanza
  - [ ] **Regresión #1:** pagué 2 meses → se acreditan **2** (no 1).
  - [ ] El socio pasa a "al día" (o baja la cantidad de meses de deuda)
  - [ ] Llega mail **`orden_aprobada_cuota`**
  - [ ] QR y calendario quedan **coherentes entre sí**
- [ ] **Rechazar** otra orden con motivo →
  - [ ] Llega mail **`orden_rechazada`**
  - [ ] Los meses **no** se acreditan
  - [ ] Si había un bloqueo asociado, se libera

### 3.5 Cobro manual desde admin
- [ ] Admin registra el pago de cuota de un socio desde el panel (N meses)
- [ ] **Regresión #1:** N meses registrados = N meses acreditados
- [ ] Queda en `/admin/auditoria`

### 3.6 Método efectivo
> ⚠️ **Mercado Pago está APAGADO para el MVP** (`VITE_MERCADOPAGO_HABILITADO=false`).
> El botón no aparece en el checkout. Los únicos métodos a testear son
> transferencia y efectivo. Si en algún lado te aparece MP, avisá: quedó un flag mal.

- [ ] En checkout elegir "efectivo" → **la orden llega UNA sola vez** a `/admin/verificaciones` (❌ BUG #3 si llega duplicada)

### 3.7 Descuento a menores
- [ ] `socio-menor@test`: el 40% de descuento se aplica en **todos** los cálculos
      (estado de cuenta, monto de checkout, cálculo de deuda)

### 3.8 Precio de cuota indexado
- [ ] Subir el precio de cuota en la config del club
- [ ] `socio-moroso@test`: la deuda se **recalcula** al precio nuevo
- [ ] Un socio que pagó meses **por adelantado**: su pago quedó **congelado** al precio viejo, no se le cobra la diferencia

---

## 4. QR y escáner

### 4.1 QR del socio
- [ ] `/socio` muestra el QR completo y legible
- [ ] El QR refleja el estado real (al día / moroso)

### 4.2 Escáner en la puerta (`/admin/escaner`)
- [ ] `portero@test` (rol `admin_temporal`) loguea → **solo** ve el escáner
- [ ] Escanear QR de socio **al día** → verde / acceso OK, muestra nombre y foto
- [ ] Escanear QR de socio **moroso** → advertencia / rojo
- [ ] Escanear QR de `socio-baja@test` → **rechazo**
- [ ] Escanear un QR inválido / cualquier otro código → error claro, no rompe
- [ ] Probar con **poca luz**, en la puerta real, de noche

### 4.3 Validación por DNI (fallback)
- [ ] Ingresar el DNI a mano en el escáner → mismo resultado que el QR

---

## 5. Reservas de canchas / quincho

> ⚠️ **Antes de programar/probar:** confirmar con el club la regla
> *"¿los morosos pueden reservar?"* — cambia si el checkout chequea estado de cuota.

### 5.1 Pre-reserva del socio
- [ ] `/socio/cancha` (o `/socio/reservas` para quincho): elegir instalación, día y turno libre
- [ ] Confirmar → se crea reserva **`bloqueada`** + orden `pendiente_verificacion`
- [ ] El turno pasa a ocupado / **naranja** para el resto de los socios **al instante**
- [ ] Subir comprobante → orden con adjunto; llega mail **`orden_generada`**

### 5.2 Doble reserva (condición de carrera)
- [ ] Dos socios intentan el **mismo turno** casi simultáneamente
- [ ] Solo **uno** lo obtiene; el otro ve "ya no disponible", sin orden fantasma

### 5.3 Aprobación / rechazo (admin)
- [ ] `/admin/reservas` o `/admin/verificaciones` → **Aprobar**
- [ ] La reserva pasa a **`confirmada`**, color **verde**; llega mail **`orden_aprobada`**
- [ ] **Rechazar** otra → reserva **`liberada`**, el turno vuelve a estar libre, mail **`orden_rechazada`**

### 5.4 Expiración sin pago
- [ ] Crear reserva `bloqueada`, **no** subir comprobante, dejar pasar la hora de inicio del turno
- [ ] El job `expirar_reservas_sin_pago` la libera → estado `expirada`/`liberada`, turno libre
- [ ] **Free tier:** si el server estuvo dormido, al **cargar el calendario** la reserva vencida igual se libera (expiración *lazy*, si está implementada)
- [ ] Una reserva con **orden aprobada** NO se libera nunca por este camino

### 5.5 Reserva manual del admin
- [ ] `/admin/reservas` → crear reserva a mano (sin orden asociada)
- [ ] Aparece **azul**, no expira, no pisa una pre-reserva de socio existente

### 5.6 Cancelación del socio
- [ ] El socio cancela su reserva **antes** del turno → estado `cancelada_socio`, **gris**, turno liberado

### 5.7 Lluvia / suspensión + saldo a favor
- [ ] Admin suspende una reserva `confirmada` por lluvia
  - [ ] Llega mail **`reserva_suspendida`**
  - [ ] Se acredita **`saldo_a_favor`** al socio por el monto correspondiente
- [ ] El socio hace un nuevo checkout (cuota o reserva) → puede **aplicar el saldo** como descuento
  - [ ] Total final = total − saldo aplicado
  - [ ] El saldo restante queda bien registrado
- [ ] Ajuste manual de saldo desde `/admin/socios` **exige motivo** y queda en `/admin/auditoria`

---

## 6. Perfil del socio

### 6.1 Editar datos
- [ ] `/perfil`: cambiar teléfono y dirección → guarda OK
- [ ] **Email y DNI no son editables** por el socio (campos bloqueados)

### 6.2 Foto de perfil
- [ ] Subir foto → se ve en el perfil y en el escáner de la puerta
- [ ] **Regresión #9:** la foto carga bien (las nuevas se guardan como key de S3)
- [ ] Subir desde galería y desde cámara (en el celu)

### 6.3 Cambiar password desde el perfil
- [ ] Con la password actual correcta → cambia OK
- [ ] Con la password actual incorrecta → error, no cambia

---

## 7. Notificaciones

### 7.1 Badge de la campana
- [ ] **Regresión #6:** generar una notificación (ej. asignar beca desde otro
      navegador) → el badge aparece **solo, sin navegar**, en menos de 60 s
- [ ] `/notificaciones` lista las notas
- [ ] Marcar como leída → baja el contador

### 7.2 Beca
- [ ] Admin asigna beca a un socio → genera **notificación in-app** (NO manda mail)

---

## 8. Panel admin

### 8.1 Dashboard `/admin`
- [ ] Las métricas cargan (socios activos, pendientes, etc.)
- [ ] Los accesos rápidos llevan a la página correcta

### 8.2 CRUD socios `/admin/socios`
- [ ] Listar, filtrar y buscar funciona
- [ ] Editar un socio → guarda
- [ ] Dar de baja un socio → mail **`socio_dado_de_baja`**
- [ ] Reactivar → mail **`socio_reactivado`**
- [ ] El admin **no** puede darse de baja a sí mismo
- [ ] No se puede dar de baja al **último admin activo**

### 8.3 Límites de "personal administrativo"
- [ ] `staff@test`: puede ver socios y aprobar/rechazar órdenes
- [ ] `staff@test`: **no** puede crear / editar / dar de baja socios (botón oculto o 403)

### 8.4 Auditoría `/admin/auditoria`
- [ ] Toda acción crítica queda registrada (aprobaciones, rechazos, ajustes de saldo, bajas, altas)
- [ ] La paginación funciona
- [ ] El `admin_general` **no** recibe mails de sus propias acciones

---

## 9. Permisos y seguridad (transversal)

- [ ] `socio` logueado navega a `/admin/*` → redirigido o pantalla de "sin permiso"
- [ ] `socio` pega directo a un endpoint admin de la API con su token → **403**
- [ ] `personal_administrativo` a un endpoint de CRUD de socios → **403**
- [ ] Request sin token a un endpoint protegido → **401**
- [ ] Token vencido → **401**, la app fuerza re-login
- [ ] Logout → el token deja de funcionar
- [ ] **Bucket privado:** pegar en el navegador una URL de comprobante **sin firmar** → **acceso denegado** (el bucket `car-archivos-produccion` no debe servir contenido público)

---

## 10. Mobile (mobile-first)

Correr los flujos **2, 3, 4, 5** en:
- [ ] Android de gama baja
- [ ] iPhone (si hay uno disponible)

Verificar en cada uno:
- [ ] Menú hamburguesa abre/cierra bien
- [ ] Formularios usables (teclado no tapa el botón de enviar)
- [ ] Cámara del escáner QR enfoca y lee
- [ ] Subida de foto desde galería y desde cámara
- [ ] El QR del socio se ve completo en pantalla chica

---

## 11. Zona horaria

El scheduler y `date.today()` corren en **UTC**. Probar con hora de Argentina
**entre las 21 y las 24 hs** (cuando en UTC ya es el día siguiente):

- [ ] Crear una reserva / registrar un pago → la fecha guardada es el **día de Argentina**, no el de UTC
- [ ] Vencimiento "día 10": el socio queda moroso el día correcto, no el 9 a la noche
- [ ] Descuento menor: un socio que **cumple años hoy** obtiene (o pierde) el descuento en la fecha correcta

---

## 12. Mails (revisar todos)

Para **cada** mail: (a) llega, (b) no cae en spam — dominio verificado en Resend,
(c) los links van a `https://www.clubatleticoroberts.com` (**❌ BUG #7** si van a `localhost` o Vercel),
(d) se ve bien en el cliente de mail del **celular**.

- [ ] `solicitud_recibida`
- [ ] `cuenta_aprobada`
- [ ] `solicitud_rechazada`
- [ ] `bienvenida_alta_manual`
- [ ] `orden_generada`
- [ ] `orden_aprobada_cuota`
- [ ] `orden_aprobada` (reserva)
- [ ] `orden_rechazada`
- [ ] `orden_expirada`
- [ ] `recordatorio_comprobante`
- [ ] `cuota_vencida`
- [ ] `recuperar_password`
- [ ] `reserva_suspendida`
- [ ] `socio_dado_de_baja`
- [ ] `socio_reactivado`
- [ ] `aviso_admin_nuevo_socio`

---

## 13. Jobs / scheduler

> **Free tier:** confirmar en los logs de Render que los jobs **efectivamente
> corren**. Con UptimeRobot pegándole a `/health` cada 5 min el server no debería
> dormirse durante el día. De noche puede dormirse → la expiración *lazy*
> (secciones 3 y 5) es el respaldo.

- [ ] `expirar_ordenes_vencidas`: orden con `expira_at` pasado → pasa a `expirada`, mail **`orden_expirada`**, bloqueos liberados
- [ ] `expirar_reservas_sin_pago`: ver **5.4**
- [ ] `recordatorio_comprobante_pendiente`: socio con orden pendiente hace varias horas → mail **`recordatorio_comprobante`**
- [ ] `notificar_cuotas_vencidas`: socio moroso → mail **`cuota_vencida`** (corre 9:00 UTC = 06:00 Argentina — validar que esa hora sea deseable)
- [ ] `cerrar_eventos_vencidos`: corre sin error aunque el módulo deportivo esté fuera del MVP

---

## Registro de ejecución

| Fecha | Commit / versión | Quién | Resultado | Bugs encontrados |
|-------|------------------|-------|-----------|------------------|
|       |                  |       |           |                  |
