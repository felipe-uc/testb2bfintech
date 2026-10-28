# DECISIONS.md — Activation Lab

Decisiones de producto y arquitectura tomadas por el autor del proyecto, escritas antes del código asociado. Una entrada por decisión: qué se decidió, por qué, qué se descartó. Claude Code no escribe aquí; si falta una decisión que necesita, la pide.

---

## 2026-10-28 — Base de datos: Supabase

**Decisión:** Postgres en Supabase, conectado desde el servidor con `DATABASE_URL` (conexión directa / pooler en modo transacción). No se usa el SDK ni el Data API de Supabase; el código es Postgres estándar.

**Por qué:** mayor soporte analítico. Trae editor de tablas y SQL en el navegador para revisar `payment_events` y `funnel_events` sin montar un cliente, y expone la base de forma estable para conectar Looker Studio a `/metrics`.

**Descartado:** Neon. Su ventaja (branching de base de datos, escalado a cero) no está en el alcance del MVP.

**Configuración elegida al crear el proyecto:** Data API desactivado, "automatically expose new tables" desactivado, RLS automático activado.

---

## 2026-10-28 — Cliente de Fintoc: propio con `fetch`, sin SDK

**Decisión:** `lib/fintoc.ts` habla con la API de Fintoc usando `fetch` nativo y verifica la firma del webhook con `crypto` de Node. No se instala el SDK oficial.

**Por qué:** son pocas líneas que puedo explicar completas: dos endpoints (crear y leer checkout session) y la verificación de firma. Todo lo del proveedor queda en un solo archivo, y la parte que maneja llaves y secretos no depende de código de terceros. Como dato secundario, el SDK `fintoc` tiene ~1.800 descargas/semana, bajo el umbral de 10.000 que fija CLAUDE.md para dependencias nuevas.

**Descartado:** SDK oficial `fintoc` (v1.29.0, activo). Su código fuente sirvió como referencia de implementación, y el algoritmo se confirmó contra la guía pública de docs.fintoc.com ("Validate webhook signatures"): header `Fintoc-Signature` con formato `t=<timestamp>,v1=<firma>`, HMAC-SHA256 con el secreto del endpoint sobre la cadena `timestamp + "." + body crudo`, comparación en tiempo constante, tolerancia de 5 minutos.

---

## 2026-10-28 — Expiración de la checkout session: 15 minutos

**Decisión:** `POST /api/sessions` crea la sesión con `expires_at` = 15 minutos desde el servidor.

**Por qué:** coincide con el tope de polling de la línea de tiempo (15 min, CLAUDE.md 12.2): cuando la pantalla deja de preguntar, la sesión ya no puede pagarse, así no hay pagos que lleguen cuando nadie está mirando. Y es un tiempo realista para un cliente que está decidiendo si paga o no.

**Descartado:** el default de Fintoc (24 h): dejaría sesiones vivas sin nadie observándolas y rompería la métrica "sesiones expiradas sin abrir el widget". 10 min (el mínimo de Fintoc): demasiado justo para alguien que usa el flujo por primera vez con un banco de prueba.

---

## 2026-10-28 — Qué cuenta como "activado"

**Decisión:** una sesión está activada cuando llega un webhook con firma válida y el evento es `payment_intent.succeeded` o `checkout_session.finished` con pago exitoso. Ni el `onSuccess` del widget ni el estado leído por API cuentan.

**Por qué:** es lo más real para un cliente. Un comercio no considera vendido un pedido cuando el comprador ve "pago exitoso" en pantalla, sino cuando su sistema recibe la confirmación y puede despachar. Ese es exactamente el paso donde Soporte recibe los tickets ("el cliente pagó pero no me llegó nada"), así que medir la activación ahí es medir lo que al comercio le importa. La firma válida es parte de la definición porque un webhook que no se puede verificar no sirve para automatizar nada encima.

**Descartado:** `onSuccess` del widget: Fintoc lo documenta como señal de UI, no de estado. Consultar el estado por API: funciona, pero no demuestra que la integración del comercio está completa; el webhook sí.

---

## 2026-10-28 — Reglas de diagnóstico: lista y orden

**Decisión:** diez reglas determinísticas, evaluadas en este orden; la primera que aplica es el diagnóstico de la sesión (uno solo por sesión). Se generan una vez, cuando la sesión termina (pago, expiración) o cuando se cumple el umbral de una regla. Una sesión con pago confirmado y sin regla aplicable no genera diagnóstico.

| # | `rule_id` | Cuándo aplica | Severidad | Siguiente paso |
|---|---|---|---|---|
| 1 | `expired_without_widget` | Sesión expirada y nunca se abrió el widget | baja | Fricción antes de pagar: revisar que el botón de pago sea visible y el monto claro |
| 2 | `widget_never_opened` | Sesión viva, creada hace más de 5 min, sin `widget_opened` | baja | El cliente se fue antes de intentar; mirar la página previa al pago |
| 3 | `widget_load_error` | `widget_error` con `type = widget_load` | alta | Llave pública inválida o script bloqueado; verificar `pk_test_` y bloqueadores |
| 4 | `abandoned_in_widget` | `widget_opened` sin autorización ni webhook, más de 3 min | media | Abandono en el banco; sin acción técnica |
| 5 | `widget_reopened` | Dos o más `widget_opened` sin pago | media | El cliente reintenta; revisar si el primer intento falló en el banco |
| 6 | `authorized_without_webhook` | `authorization_completed` y ningún webhook después de 2 min | crítica | El ticket "pagué y no llegó": verificar URL del endpoint, eventos suscritos y respuesta 200 |
| 7 | `webhook_invalid_signature` | Al menos un webhook con `signature_valid = false` | crítica | Secreto equivocado o body parseado antes de firmar; rotar `whsec_` y usar el body crudo |
| 8 | `payment_pending` | Estado `pending` por más de 5 min | media | Fintoc enviará un segundo webhook; no reintentar; esperar |
| 9 | `payment_failed` | Estado `failed`, `rejected` o `expired` tras webhook válido | media | El banco rechazó o el cliente canceló; sugerir reintento |
| 10 | `webhook_without_session` | Webhook válido cuyo `checkout_session` no está en `sessions` | alta | Llaves de otro proyecto o ambiente test/live mezclado. No se asocia a una sesión: solo cuenta en `/metrics` |

**Por qué este orden:** es como revisa un agente de Soporte. Primero descarta lo que anula todo (expiró, nunca lo intentó), después sigue el flujo paso a paso hasta el punto donde se cortó, y al final mira la calidad de lo que sí llegó. Las reglas 6 y 7 replican los tickets reales ("pagué y no llegó", "no verifica la firma"); por eso son críticas y son el centro de la demo. La regla 5 nació de la primera prueba real: el widget se abrió dos veces sin cierre entre medio.

**Umbrales:** 5 min (reglas 2 y 8), 3 min (regla 4), 2 min (regla 6). Regla 5: 3 min desde la última apertura en sesiones vivas; en sesiones terminadas (falla, expiración) aplica de inmediato. Las reglas 2, 4 y 5 no aplican a sesiones pagadas. Ajustado el 2026-10-28 tras la primera tanda de pruebas: un reintento que luego pagaba quedaba diagnosticado para siempre. Se siguen ajustando con datos de uso real en la semana 3.

**Qué recibe el LLM:** solo `rule_id`, severidad y los números que usa la regla (minutos transcurridos, cantidad de intentos). Nunca el payload ni llaves.

**Descartado:** diagnósticos múltiples por sesión (confunden al usuario y multiplican el costo del LLM). Reglas basadas en datos del banco o del comprador (no se guardan datos personales).

---

## 2026-10-28 — `/metrics`: consultas directas desde Next.js, no Looker Studio

**Decisión:** `/metrics` es una página de Next.js que consulta Postgres desde el servidor con SQL propio. Sin Looker Studio ni librería de gráficos. Selector "solo yo / todos" como parámetro de URL que cambia el `where is_owner`.

**Métricas que entran, en este orden:**
1. Vista de etapas del onboarding completo (las siete etapas de la sección 2 de CLAUDE.md), marcando cuáles instrumenta este proyecto. Es lo primero que se ve.
2. Funnel por paso: sesiones creadas → widget abierto → autorización → webhook verificado → pago confirmado, con conversión paso a paso y acumulada, en total y por canal.
3. Mediana y p90 del tiempo entre sesión creada y pago confirmado.
4. Distribución de diagnósticos por `rule_id`, más webhooks sin sesión asociada (regla 10).
5. Sesiones expiradas sin abrir el widget.

**Por qué:** la base se consulta solo desde el servidor (CLAUDE.md 12.1); Looker Studio exigiría abrirla a un tercero con credenciales persistentes. El selector "solo yo / todos" es un `where` en SQL; en un panel público de Looker sería un filtro que cualquiera puede quitar. Todo el SQL queda en el repo y se puede explicar línea por línea. Son cuatro tablas con cientos de filas: sin necesidad de herramienta externa ni dependencias nuevas.

**Descartado:** Looker Studio embebido (cuenta extra, lógica fuera del repo, acceso de terceros a la base). "Visitas a `/`" queda fuera por ahora: hoy no se registra la visita y exigiría un evento más desde el navegador; se agrega si hace falta en la semana 3.

---

## Pendientes (en orden de necesidad)

- Reglas primero, LLM después: por qué y qué cuesta cada diagnóstico.
- Qué partes del código son del proveedor (Fintoc) y cuáles propias y reutilizables.
- Proveedor y modelo del LLM para la redacción del diagnóstico.
