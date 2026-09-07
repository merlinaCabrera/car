// frontend/src/config/features.js
/**
 * Flags de funcionalidad del frontend.
 *
 * Se leen de variables de entorno de Vite (`VITE_*`), que se resuelven en
 * BUILD TIME: cambiar el valor exige volver a buildear/desplegar. Alcanza de
 * sobra para prender o apagar un método de pago.
 */

/**
 * Mercado Pago — APAGADO para el MVP (decisión del club, 2026-09-06).
 *
 * El flujo del MVP es: transferencia o efectivo + comprobante + verificación
 * manual del admin. El código de MP (preferencia, webhook, aprobación
 * automática) sigue en el repo y funciona, pero está sin probar de punta a
 * punta contra la cuenta real y no entra en el alcance del lanzamiento.
 *
 * Para reactivarlo:
 *   1. `VITE_MERCADOPAGO_HABILITADO=true` en frontend/.env  → rebuild
 *   2. Verificar en Render: MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET
 *   3. Probar en sandbox los puntos M1/M2 de docs/auditoria-2026-09-06.md
 *      (verificación de monto y preferencia cuando se aplicó saldo a favor)
 */
export const MERCADOPAGO_HABILITADO =
  String(import.meta.env.VITE_MERCADOPAGO_HABILITADO ?? '').toLowerCase() === 'true'
