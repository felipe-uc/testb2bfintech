# Activation Lab

**URL:** https://testb2bfintech.app · **Estado:** en producción. Construido y lanzado en dos días.

Una URL pública donde cualquier persona completa el flujo real de un producto de pagos por transferencia (Fintoc, en modo test) desde "quiero cobrar" hasta el webhook de pago confirmado, mientras el sistema mide cada paso del funnel y diagnostica por qué un intento no llegó a término.

Es un proyecto personal: demuestra, de forma verificable, llevar software de local a producción con Claude Code como copiloto, con decisiones de producto defendidas en [`DECISIONS.md`](DECISIONS.md).

> Proyecto independiente. **No afiliado a Fintoc.** Solo modo test: no hay dinero real.

## Por qué existe

En self-serve el revenue es comercios activados × TPV. El paso que nadie acompaña es de la integración al primer pago de prueba: Soporte responde a mano "no me llega el webhook / el pago quedó pending". Este proyecto replica en pequeño dos tareas de growth y operaciones en un producto self-serve: **instrumentar el funnel de activación** y **automatizar el primer nivel de diagnóstico de Soporte**.

## Qué hace

1. **Segmenta por canal.** Pregunta "¿cómo vendes hoy?" (Shopify / WooCommerce o VTEX / API propia / aún no vendo online) y lo guarda como canal de la sesión. Todos los canales recorren el mismo flujo; el canal sirve para comparar el funnel entre segmentos.
2. **Corre el flujo real.** Crea una checkout session en Fintoc (1.000 CLP de prueba, expira a los 15 min) y abre el widget oficial; el usuario paga con el banco de prueba.
3. **Confirma por webhook.** Fintoc avisa por webhook; el servidor verifica la firma, guarda el payload crudo de forma idempotente y actualiza la sesión.
4. **Muestra la línea de tiempo en vivo** en [`/s/[id]`](https://testb2bfintech.app): sesión creada → widget abierto → autorización → webhook verificado → pago confirmado.
5. **Diagnostica lo que no llegó a término.** Un motor de diez reglas determinísticas, ordenadas como revisa un agente de Soporte, decide un diagnóstico por sesión (por ejemplo: el banco autorizó hace 3 minutos y no ha llegado ningún webhook). Un LLM redacta la explicación y el siguiente paso; no decide nada.
6. **Deja provocar cada caso.** [`/casos`](https://testb2bfintech.app/casos) lista los usuarios y cuentas del banco de prueba que terminan en éxito, falla o pendiente.
7. **Publica el funnel.** [`/metrics`](https://testb2bfintech.app/metrics) muestra solo agregados, con selector "solo yo / todos" para separar las pruebas del autor del uso de terceros.

**Qué cuenta como "activado":** webhook recibido con firma válida y pago exitoso (`checkout_session.finished` con `payment_intent.status = succeeded`, o `payment_intent.succeeded`). Ni el `onSuccess` del widget ni el estado leído por API cuentan. La razón está en `DECISIONS.md`.

### Qué mide `/metrics`

- Las siete etapas del onboarding de un comercio (registro → verificación del negocio → habilitación de productos → integración → primer pago de prueba → paso a live → primer pago real), marcando que este proyecto instrumenta solo **integración → primer pago de prueba**. Las demás ocurren dentro del proveedor.
- Funnel por paso, en total y por canal, con conversión contra el paso anterior y acumulada.
- Mediana y p90 del tiempo entre sesión creada y pago confirmado.
- Sesiones expiradas sin abrir el widget.
- Diagnósticos por regla, más webhooks válidos sin sesión asociada.

### Reglas de diagnóstico

| # | `rule_id` | Severidad |
|---|---|---|
| 1 | `expired_without_widget` | baja |
| 2 | `widget_never_opened` | baja |
| 3 | `widget_load_error` | alta |
| 4 | `abandoned_in_widget` | media |
| 5 | `widget_reopened` | media |
| 6 | `authorized_without_webhook` | crítica |
| 7 | `webhook_invalid_signature` | crítica |
| 8 | `payment_pending` | media |
| 9 | `payment_failed` | media |
| 10 | `webhook_without_session` | alta (no se asocia a una sesión; solo cuenta en `/metrics`) |

La primera regla que aplica es el diagnóstico de la sesión. Las reglas 6 y 7 replican los tickets típicos de Soporte ("pagué y no llegó", "no verifica la firma"). La regla 5 nació de la primera prueba real. Condiciones, umbrales y razones en `DECISIONS.md`.

## Arquitectura

```
Navegador ──POST /api/sessions──▶ Next.js (Vercel) ──POST /v2/checkout_sessions──▶ Fintoc (test)
    │                                  │
    │ widget (js.fintoc.com)           │ Postgres (Supabase)
    │                                  │   sessions · payment_events · funnel_events · diagnostics
    ▼                                  ▼
 Banco de prueba ──────────────▶ Fintoc ──webhook firmado──▶ POST /api/webhooks/payments
                                                                 │ verifica firma (HMAC-SHA256)
                                                                 │ guarda payload crudo, idempotente
                                                                 ▼
 Navegador ◀──GET /api/sessions/[id] (polling 4 s, tope 15 min)── línea de tiempo + diagnóstico
```

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind, Vercel, Postgres en Supabase (driver `postgres`, única dependencia de runtime fuera de Next y React).
- **Cliente de Fintoc:** propio, con `fetch` y `crypto` nativos, en un solo archivo (`lib/fintoc.ts`). Sin SDK.
- **Webhook:** lógica en `lib/webhook.ts`, separada del route handler para testearla sin base de datos.
- **Diagnóstico:** una regla por archivo en `lib/diagnostics/`. Se evalúa al leer la sesión y se guarda una sola vez. Sin cron ni procesos en segundo plano.
- **Redacción con LLM:** `lib/llm.ts` llama a Claude Haiku 5.5 con `fetch`, una vez por sesión diagnosticada (menos de USD 0,0003 cada una). Si el LLM falla, demora más de 6 s o inventa una cifra, queda el texto fijo de la regla.
- **Métricas:** SQL propio en `lib/metrics.ts`, consultado desde el servidor. Sin herramienta externa de analítica.

### Reglas no negociables (y dónde viven)

| Regla | Dónde |
|---|---|
| Payload crudo del webhook siempre guardado | `payment_events.payload_raw` |
| Idempotencia: un webhook reenviado no duplica estado | `fintoc_event_id` único + `on conflict do nothing` |
| Firma verificada sobre el body crudo; `signature_valid` registrado aunque falle | `lib/webhook.ts` |
| Nada de payloads en logs ni en respuestas | `processWebhook().log` solo lleva 4 campos |
| Sin datos personales; sesión = UUID v4 anónimo | esquema en `db/migrations/001_initial.sql` |
| Un diagnóstico y una llamada al LLM por sesión, máximo | `lib/diagnostics/run.ts` |
| El LLM recibe solo `rule_id`, severidad y los números de la regla; nunca payloads ni llaves | `lib/llm.ts` |
| Límites: 10 sesiones/IP/hora, 100 eventos/sesión, body ≤ 64 KB | `lib/ratelimit.ts` (hash de IP en memoria, nunca en DB) |
| Monto fijo en el servidor; solo llaves `_test_` | `lib/fintoc.ts` |
| `/metrics` solo muestra agregados; las sesiones del autor se marcan con una cookie secreta | `lib/metrics.ts` · `lib/owner.ts` |

## Correr en local

```bash
cp .env.example .env.local   # pegar llaves sk_test_/pk_test_, whsec_, DATABASE_URL, LLM_API_KEY
npm install
npm test                     # 47 tests: firma de webhook, idempotencia, confirmación de pago, motor de reglas, LLM
npm run dev
```

La migración `db/migrations/001_initial.sql` se corre una vez en el SQL Editor de Supabase. Para recibir webhooks en local hace falta un túnel (ngrok) y registrar esa URL como endpoint en el Dashboard de Fintoc. `LLM_API_KEY` es opcional: sin ella el diagnóstico usa el texto fijo de cada regla.

## Estructura

```
app/
  page.tsx                   inicio: canal + crear sesión
  s/[id]/                    sesión: widget + línea de tiempo en vivo + diagnóstico
  casos/                     usuarios y cuentas del banco de prueba
  metrics/                   panel público de funnel
  api/sessions/              POST crea sesión · GET [id] estado + timeline + diagnóstico
  api/events/                POST evento de funnel desde el navegador
  api/webhooks/payments/     POST webhook de Fintoc
  layout.tsx · nav.tsx · ui.tsx
lib/
  fintoc.ts                  cliente de la API + verificación de firma
  webhook.ts                 procesamiento del webhook (testeable)
  diagnostics/               una regla por archivo · index.ts (orden) · run.ts
  llm.ts                     redacción del diagnóstico con LLM + respaldo al texto fijo
  metrics.ts                 consultas SQL de /metrics
  db.ts                      conexión y consultas
  ratelimit.ts · owner.ts    límites por IP · cookie de owner para /metrics
  widget.ts                  helpers del widget en el navegador
db/migrations/               esquema SQL
DECISIONS.md                 decisiones de producto, con razón y descartados
CLAUDE.md                    contexto e instrucciones para Claude Code
```

## Cómo se construyó

En dos días, con Claude Code como copiloto y siguiendo `CLAUDE.md`: Claude escribe boilerplate, tests y correcciones sin preguntar; cualquier cambio de esquema, endpoint o dependencia pasa por aprobación; y las decisiones de producto las toma el autor y quedan en `DECISIONS.md` antes del código. El plan original era de tres semanas; el alcance que está en producción (flujo de pago, funnel, diagnóstico y métricas) se completó en dos días.
