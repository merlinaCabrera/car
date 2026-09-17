# Propuesta Técnica: Streaming Seguro con Amazon IVS — CAR (Revisión V2)

Documento de propuesta técnica y diseño de arquitectura para la evolución del módulo de Transmisiones en Vivo (Pay-Per-View) del Club Atlético Roberts, actualizado tras revisión de arquitectura y análisis de riesgos.

---

## 1. Contexto y Diagnóstico del Modelo Actual (Etapa 1: YouTube Oculto)

El club cuenta con la **Etapa 1 implementada y operativa**:
- **Infraestructura:** Emisión vía RTMP (Larix/OBS) hacia YouTube como video Oculto (*Unlisted*).
- **Costo:** $0 USD.
- **Frontend:** Player blindado en `TransmisionEnVivo.jsx` con bloqueo visual de controles, clic derecho y concurrencia única (1 pantalla por entrada) vía heartbeat cada 30 segundos.
- **Comercialización:** Venta automatizada de entradas virtuales con Mercado Pago, Magic Links y panel administrativo de control.

### ¿Por qué migrar? El motivo real:
- **Censura binaria por Copyright de Audio:** En los partidos de la Liga, durante la previa y el entretiempo, la voz del estadio o la hinchada reproduce música comercial por los altoparlantes. Los algoritmos automatizados de YouTube detectan el audio y silencian el stream o **cortan la transmisión en vivo de forma abrupta**. Este es un riesgo operativo crítico: con 40 o 50 espectadores que pagaron su entrada virtual, un corte de YouTube no tiene mitigación manual posible.
- **Aclaración sobre no-motivos:**
  - El límite de 50 suscriptores de YouTube aplica únicamente al botón de emitir de la app móvil oficial de YouTube, **no** cuando se transmite vía RTMP mediante Larix Broadcaster u OBS (que es lo que ya hace el club).
  - La seguridad del video oculto de YouTube hoy descansa en "seguridad por oscuridad" (ocultar el link detrás de máscaras en el frontend). Con IVS sin autorización ocurriría exactamente lo mismo si no se aplican tokens criptográficos.

---

## 2. Amazon IVS: Realidad de Costos y Free Tier

### 2.1. Regla de Free Tier: Horas-Espectador
- **Input:** 5 horas al mes de emisión gratuita.
- **Output:** 100 horas al mes de visualización gratuita.
- **Advertencia de cálculo:** El output se mide en **horas-espectador**, no en horas de partido.
  - Un partido de 2 horas visto por 50 personas = **100 horas-espectador** (2 h x 50 espectadores).
  - Por ende, **un solo partido exitoso consume la totalidad del cupo mensual de salida del Free Tier**.
- **Antigüedad de la cuenta AWS:** El Free Tier de AWS para IVS es válido durante los primeros 12 meses desde la creación de la cuenta. Como la cuenta `clubatleticoroberts1@gmail.com` ya existe y tiene tiempo operando S3 y CloudFront, es muy probable que el Free Tier ya haya expirado o expire en el corto plazo.

### 2.2. Costo Real y Modelo Económico (Tarifa por uso)
Tarifas estimadas para canal tipo **BASIC** (región `us-east-1`):
- **Input (emisión):** ~$0.20 USD por hora.
- **Output (visualización SD/HD):** ~$0.075 USD por hora-espectador.

**Simulación de 1 Partido Oficial (2 horas, 40 espectadores):**
- Input: 2 h x $0.20 = $0.40 USD
- Output: 2 h x 40 espectadores x $0.075 = $6.00 USD
- **Costo total aproximado por partido:** **~$6.40 USD** (~$8.000 ARS).

**Conclusión económica:**
El modelo sigue siendo sumamente rentable para el club. Con la venta de **1 a 2 entradas virtuales** ($4.000 a $5.000 ARS cada una) se financia el 100% de la infraestructura de todo el evento. Las 38 entradas restantes son ganancia neta. Sin embargo, no debe presentarse como un servicio "$0 USD", sino como un **costo variable proporcional al éxito de la venta**.

### 2.3. Salvaguardas Financieras Obligatorias
Para evitar consumos accidentales en la tarjeta del club:
1. **AWS Budget & Alarm:** Crear un presupuesto en AWS con alerta inmediata por correo a `clubatleticoroberts1@gmail.com` si el gasto proyectado supera los **$15 USD/mes**.
2. **Botón de Emergencia "Detener Emisión" (StopStream):** En el panel de control del club, incorporar una acción conectada a `ivs.stop_stream()` para forzar el corte inmediato del input si el camarógrafo olvida apagar la app al finalizar el partido.

---

## 3. Arquitectura de Seguridad: Playback Authorization (Tokens JWT)

### El riesgo de un canal público
En un canal IVS estándar, la URL `.m3u8` es pública. Si un usuario que compró su entrada abre las herramientas de desarrollador (F12) o inspecciona la red, obtiene el archivo `.m3u8` y puede pegarlo en VLC o compartirlo en grupos de WhatsApp. En un canal público, esos espectadores piratas reproducirían el video sin pasar por el backend, y **cada espectador pirata facturaría horas-output a la tarjeta del club**.

### La Solución: Canal Privado + Playback Key Pair + JWT de Vida Corta
Amazon IVS ofrece de forma nativa **Playback Authorization**:
1. El canal se configura como privado (`authorized: true`).
2. Se genera un par de claves criptográficas **ECDSA (ES256)** en AWS IVS (*Playback Key Pair*).
3. La clave pública queda registrada en AWS IVS; la clave privada se almacena como secreto de entorno en el backend (`IVS_PLAYBACK_PRIVATE_KEY`).
4. Cuando un socio o invitado autorizado solicita ver el partido, el backend genera y firma un **JWT** que incluye:
   - `sub`: Identificador de sesión o usuario.
   - `ivs:channel-arn`: ARN específico del canal.
   - `exp`: Expiración de corto plazo (**5 a 10 minutos**).
5. El reproductor frontend recibe el stream como:
   `https://[ivs-playback-url].m3u8?token=[JWT_FIRMADO]`
6. **Renovación periódica con Heartbeat:** Como el frontend ya ejecuta un heartbeat cada 30 segundos (`/transmisiones/{id}/heartbeat`), el backend verifica que la sesión siga siendo la única activa (concurrencia = 1) y renueva el token JWT antes de que expire.
7. **Resultado:** Si un usuario comparte el enlace, el token vence en pocos minutos y queda inservible para terceros, garantizando que solo reproduce quien mantenga una sesión válida activa en el backend.

```
┌────────────────────────────────────────────────────────┐
│             CAMARÓGRAFO (Larix / OBS)                  │
│       Apunta a RTMPS (Servidor + Clave fija CAR)       │
└──────────────────────────┬─────────────────────────────┘
                           │ RTMPS (720p @ 1.5 Mbps)
                           ▼
┌────────────────────────────────────────────────────────┐
│             AMAZON IVS (authorized: true)              │
│       Rechaza cualquier reproducción sin JWT ES256     │
└──────────────────────────┬─────────────────────────────┘
                           ▲
     Verifica token criptográfico en cada segmento HLS
                           │
┌──────────────────────────┴─────────────────────────────┐
│             BACKEND FASTAPI (/transmisiones)           │
│  1. Valida socio al día o ticket PPV pago.             │
│  2. Firma JWT ES256 con vencimiento (5-10 min).        │
│  3. Devuelve .m3u8?token=...                           │
│  4. Heartbeat (30s) renueva token si sesión es única.  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             FRONTEND REACT (/en-vivo)                  │
│  - HLS.js (Chrome/Android/PC)                          │
│  - HLS Nativo (Safari iOS con playsinline)             │
│  - 0 Publicidades - Fullscreen nativo                  │
└────────────────────────────────────────────────────────┘
```

---

## 4. Calidad de Transmisión y Limitación de ABR

- **Sin ABR en canal BASIC:** El canal tipo BASIC de IVS **no transcodifica** (no genera múltiples resoluciones simultáneas como 360p, 480p, 720p). Emite exactamente la tasa de bits que envía la cámara.
- **Riesgo:** Si se emite a 1080p y 4 Mbps, los hinchas en zonas rurales con señal móvil débil sufrirán buffering constante.
- **Configuración recomendada para la cámara:**
  - **Resolución:** 720p (1280x720).
  - **Bitrate de video:** 1.5 Mbps (óptimo para capturar movimiento de fútbol sin saturar la red celular).
  - **Framerate:** 30 fps.
  - **Audio:** 96 o 128 kbps AAC.

---

## 5. Higiene de Seguridad y Mejoras en el Código

1. **Eliminar riesgo de XSS en Frontend:**
   En `TransmisionEnVivo.jsx:381`, el bloque `custom_iframe` renderiza HTML mediante `dangerouslySetInnerHTML`. Al migrar a IVS y contar con un reproductor HLS nativo y YouTube unificado, este bloque obsoleto debe removerse por completo para erradicar cualquier vector de XSS almacenado.
2. **Gestión segura de la Stream Key:**
   - La clave de transmisión jamás debe almacenarse en texto plano en la base de datos ni exponerse a cualquier usuario staff.
   - Solo `admin_general` podrá consultarla en el panel, obteniéndola en caliente desde la API de AWS (`boto3.client("ivs").get_stream_key()`).
3. **Compatibilidad iOS y Reproducción Limpia:**
   - Detección de soporte HLS: `Hls.isSupported()` para navegadores compatibles con Media Source Extensions, y `video.canPlayType("application/vnd.apple.mpegurl")` para Safari en iOS.
   - Atributo `playsinline` obligatorio en el tag `<video>` para evitar que iOS abra el reproductor nativo del sistema que expone opciones de compartir y AirPlay de la URL directa.

---

## 6. Estrategia Híbrida y Plan de Contingencia

Se mantendrá en el modelo de base de datos el soporte híbrido (`plataforma = "ivs" | "youtube"`):
- **IVS como plataforma principal:** Cero riesgo de corte de audio por música en cancha, experiencia limpia y privada.
- **YouTube Oculto como Plan B en caliente:** Si durante un partido el 4G de la cancha fluctúa o surge cualquier imprevisto de conectividad hacia AWS, el administrador puede conmutar el evento a YouTube en un clic desde el panel sin interrumpir la validación de tickets de los espectadores.

---

## 7. Plan de Trabajo y Próximos Pasos

### Paso 0: Validación Previa sin Código (1 hora)
1. **Verificar estado de cuenta AWS:** Comprobar en la consola de AWS la fecha de creación de la cuenta del club (`clubatleticoroberts1@gmail.com`) y verificar el estado del Free Tier.
2. **Prueba de Uplink 4G en la Cancha:**
   - Crear un canal de prueba en AWS IVS manualmente.
   - Instalar Larix Broadcaster en el celular del camarógrafo en el estadio de Roberts.
   - Emitir 20 minutos seguidos a 720p @ 1.5 Mbps.
   - *Criterio de éxito:* El 4G del campo de juego debe sostener 1.5 Mbps de subida continua sin caídas graves. Si la señal local no lo tolera, se replantea el bitrate antes de programar nada.

### Paso 1: Prioridades MVP (No bloquear salida)
Atender antes los requerimientos prioritarios de producción:
- Rotación de credenciales expuestas en git.
- Configuración de UptimeRobot apuntando al `/health` del backend en Render (mantiene despierto el servicio para que los cron jobs nocturnos de cobro y vencimiento funcionen).
- Limpieza de datos huérfanos de auditoría (D2/D3).

### Paso 2: Implementación de IVS (Etapa 2)
1. Generación de Playback Key Pair en AWS y carga de clave privada en variables de entorno.
2. Endpoint backend para firma de JWT y refresco en heartbeat.
3. Integración de `hls.js` + `<video playsinline>` en `TransmisionEnVivo.jsx` y remoción de `dangerouslySetInnerHTML`.
4. Botón de emergencia `StopStream` y selector IVS en el panel admin.
5. Creación de AWS Budget de alerta ($15 USD) en la cuenta del club.
