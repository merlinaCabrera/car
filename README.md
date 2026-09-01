# ERP - Club Deportivo

Este repositorio contiene el código fuente de una plataforma integral para la administración y operación de un club deportivo. El sistema combina una landing para el público general con un portal privado altamente modular, diseñado para resolver las necesidades financieras, administrativas y deportivas de la institución.
El proyecto está dividido en dos aplicaciones principales y se apoya en servicios en la nube para garantizar escalabilidad y persistencia.

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=for-the-badge&logo=amazon-web-services&logoColor=white)

## Stack Tecnológico

| Capa | Tecnología | Detalles |
| :--- | :--- | :--- |
| **Frontend** | React.js + Vite | SPA responsiva, alojada en AWS S3 + CloudFront. |
| **Backend** | Python + FastAPI | API REST, validación con Pydantic v2. |
| **Base de Datos**| PostgreSQL | ORM SQLAlchemy 2.0, control de migraciones con Alembic. |

<img width="706" height="518" alt="image" src="https://github.com/user-attachments/assets/6fc809cd-b54e-485e-900c-10d762ce1080" />

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


```text
📦 club-atletico-erp
 ┣ 📂 backend
 ┃ ┣ 📂 alembic       # Migraciones de base de datos
 ┃ ┣ 📂 routers       # Endpoints segregados por rol
 ┃ ┣ 📜 models.py     # Modelos de SQLAlchemy
 ┃ ┗ 📜 schemas.py    # Esquemas de validación de Pydantic
 ┗ 📂 frontend
   ┣ 📂 src
   ┃ ┣ 📂 components  # Componentes modulares
   ┃ ┣ 📂 context     # Estado global (Auth, Carrito)
   ┃ ┗ 📂 pages       # Vistas de la aplicación
   ┗ 📜 package.json
```
