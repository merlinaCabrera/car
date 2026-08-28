# ERP - Club Deportivo

Este repositorio contiene el código fuente de una plataforma integral para la administración y operación de un club deportivo. El sistema combina una landing para el público general con un portal privado altamente modular, diseñado para resolver las necesidades financieras, administrativas y deportivas de la institución.

El proyecto está dividido en dos aplicaciones principales y se apoya en servicios en la nube para garantizar escalabilidad y persistencia.

## Stack Tecnológico

- **Frontend:** Desarrollado con React.js y empaquetado con Vite. 
- **Backend:** API REST construida con Python y FastAPI.
- **Base de Datos:** PostgreSQL. Se utiliza SQLAlchemy 2.0 como ORM y Alembic para el control de migraciones.

## Módulos Principales

### 1. Identidad y Control de Accesos
- **Multi-Rol:** Un mismo usuario puede tener múltiples roles simultáneos (puede ser Socio, Jugador y Personal Técnico al mismo tiempo).
- **Código QR:** Cada socio posee un QR único. El token subyacente rota automáticamente si hay cambios en su estado financiero.
- **Control en Puerta:** Interfaz para escanear códigos QR (o buscar por DNI), permitiendo autorizar o denegar el acceso instantáneamente según si el socio está al día o es moroso.

### 2. Finanzas y E-Commerce
- **Motor de Cuotas:** El cálculo de deudas no se guarda en pesos históricos, sino en "cantidad de meses adeudados". Si el valor de la cuota se actualiza globalmente, la deuda de los morosos se indexa de forma automática.
- **Carrito de Compras Unificado (Split-Order):** Los socios pueden agregar a un mismo carrito el pago de cuotas atrasadas o por adelantado, el alquiler de instalaciones (canchas, quinchos) y productos de tienda (indumentaria y otros).
- **Aprobación de Pagos:** Pagos por efectivo o transferencia. Las órdenes quedan en estado pendiente hasta que el personal administrativo cruza los datos con el banco, revisa el comprobante y aprueba la transacción. Al aprobarse, se descuenta stock, se asientan meses pagados y se confirman las reservas de forma atómica. Existe la integración con Mercado Pago (que automatiza este procesamiento vía links de pago), pero está en etapa de desarrollo.

### 3. Gestión Deportiva y Eventos
- **Categorías y Planteles:** El personal técnico puede administrar listas de jugadores, designar capitanes y mantener historiales por temporada.
- **Convocatorias:** Creación de eventos deportivos (partidos, entrenamientos) y citación de jugadores.
- **Asistencia Vinculada a Eventos:** El escaneo en puerta no genera ingresos aislados, sino que se asocia a un evento específico (si se lo selecciona previamente). Al finalizar, el sistema emite un reporte automático de asistencia (socios, morosos que regularizaron, métodos de ingreso).

### 4. Administración General y Auditoría
- **Configuración Global:** Un único registro en la base de datos permite al administrador modificar el valor base de la cuota, beneficios por antigüedad y días de vencimiento, impactando en toda la plataforma al instante.
- **Audit Log:** Tabla inmutable que registra cada acción sensible dentro del sistema (quién aprobó un pago, quién dio de baja a un socio, etc.) asegurando la trazabilidad total.
- **Correos:** Para flujos de alta/baja de usuarios o de compras (en general, de un tipo de ítem o mixtas, es decir: cuotas, indumentaria y alquileres) están establecidas notificaciones por correo electrónico, para lo cual se utiliza la plataforma Resend.
