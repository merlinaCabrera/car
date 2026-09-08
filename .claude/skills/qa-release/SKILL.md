---
name: qa-release
description: Usar antes de mergear a main, antes de un deploy, o cuando el usuario diga "release", "mergeá esto", "subilo a prod" o similar. Corre el checklist manual de QA del MVP de CAR y verifica que no hayan reaparecido los 9 bugs ya corregidos el 2026-09-06.
---

# QA de release — Club Atlético Roberts (CAR)

## Cuándo se activa
- El usuario pide mergear a `main`, hacer un release, o deployar a producción.
- El usuario pide "revisar antes de subir" o "checklist de QA".
- Se tocó código en áreas críticas: alta de socio, login, cuotas, QR/escáner,
  reservas de canchas/quincho, o panel admin.

## Regla de oro
Todo esto se corre en **staging**, nunca en producción.
Staging = branch de Neon aparte (o DB `car_dev`) + bucket `car-archivos-dev`.
Si no hay forma de confirmar que se está en staging, preguntar antes de seguir.

## Qué hacer

1. Confirmar contra qué entorno se está corriendo (staging, no prod).
2. Leer `docs/qa-checklist.md` completo — es la fuente de verdad, no reinventar
   los pasos. Secciones 1–9 son flujos críticos: correr siempre.
   Secciones 10–13 (scheduler, mails, mobile): correr si se tocó algo de eso
   o hace más de una semana que no se corren.
3. Leer `docs/auditoria-2026-09-06.md` para conocer los 9 bugs ya corregidos.
   **No hay que "buscarlos"** — solo confirmar que el flujo relacionado sigue
   andando bien. Si algo de esa lista vuelve a fallar, es una regresión:
   avisar al usuario antes de continuar con nada más.
4. Ir marcando cada ítem del checklist (`- [x]` pasa, `❌ BUG` si falla) y
   reportar al usuario un resumen al final: qué pasó, qué falló, qué bugs
   conocidos se reconfirmaron como corregidos.
5. Si algo falla: no seguir con el merge/deploy. Reportar el bug con sección +
   pasos para reproducir + esperado vs obtenido, siguiendo la convención del
   propio checklist.

## Qué NO hacer
- No saltear la sección 1–9 aunque el cambio "parezca chico".
- No correr nada de esto contra la base de producción o el bucket de producción.
- No dar por bueno un release solo porque compila o pasan los tests unitarios:
  este checklist es manual y cubre flujos de punta a punta que los tests no cubren.
