---
description: Correr el checklist de QA manual antes de un release
---

Corré el checklist de QA de `docs/qa-checklist.md` contra el entorno de
staging (nunca contra producción). Confirmá primero contra qué entorno vamos
a correr esto si no es obvio.

Secciones 1–9 son flujos críticos: correr siempre. Secciones 10–13
(scheduler, mails, mobile): correr si tocamos algo de eso o hace más de una
semana que no se corren.

Además, repasá `docs/auditoria-2026-09-06.md` — son los 9 bugs ya
corregidos. No hace falta "buscarlos" activamente, solo confirmar que los
flujos relacionados siguen andando. Si alguno reaparece, es una regresión:
avisame antes de seguir con cualquier otra cosa.

Al final, dame un resumen: qué se probó, qué pasó, qué falló (si algo falló,
con sección + pasos para reproducir + esperado vs obtenido).
