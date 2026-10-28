# Activation Lab

**URL:** https://testb2bfintech.app · **Estado:** semana 1 completa (flujo de pago de punta a punta en producción).

Una URL pública donde cualquier persona completa el flujo real de un producto de pagos por transferencia (Fintoc, en modo test) desde "quiero cobrar" hasta el webhook de pago confirmado, mientras el sistema mide cada paso del funnel y diagnostica por qué un intento no llegó a término.

Es un proyecto personal: demuestra, de forma verificable, llevar software de local a producción con Claude Code como copiloto, con decisiones de producto defendidas en [`DECISIONS.md`](DECISIONS.md).

> Proyecto independiente. **No afiliado a Fintoc.** Solo modo test: no hay dinero real.

## Por qué existe

En self-serve el revenue es comercios activados × TPV. El paso que nadie acompaña es de la integración al primer pago de prueba: Soporte responde a mano "no me llega el webhook / el pago quedó pending". Este proyecto replica en pequeño dos tareas de growth y operaciones en un producto self-serve: **instrumentar el funnel de activación** y **automatizar el primer nivel de diagnóstico de Soporte**.

## Qué hace hoy

1. Pregunta "¿cómo vendes hoy?" (Shopify / WooCommerce o VTEX / API propia / aún no vendo online) y lo guarda como canal de la sesión.
2. Crea una checkout session en Fintoc (1.000 CLP de prueba, expira a los 15 min) y abre el widget oficial.
3. El usuario paga con el banco de prueba de Fintoc.
4. Fintoc avisa por webhook; el servidor verifica la firma, guarda el payload crudo de forma idempotente y actualiza la sesión.
5. La página de la sesión muestra la línea de tiempo en vivo: sesión creada → widget abierto → autorización → webhook verificado → pago confirmado.

**Qué cuenta como "activado":** webhook recibido con firma válida y pago exitoso (`checkout_session.finished` con `payment_intent.status = succeeded`, o `payment_intent.succeeded`). Ni el `onSuccess` del widget ni el estado leído por API cuentan. La razón está en `DECISIONS.md`.

## Qué viene

- **Semana 2:** motor de reglas de diagnóstico (determinístico) + LLM solo para redactar la explicación; `/metrics` pública con el funnel por paso y por canal, con selector "solo yo / todos".
- **Semana 3:** uso real con 10–15 personas; camino plugin (Shopify / WooCommerce) **modelado como checklist, no instrumentado**.

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
 Navegador ◀──GET /api/sessions/[id] (polling 4 s, tope 15 min)── línea de tiempo
```

- **Stack:** Next.js (App Router) + TypeScript, Vercel, Postgres en Supabase (driver `postgres`, única dependencia fuera de Next).
- **Cliente de Fintoc:** propio, con `fetch` y `crypto` nativos, en un solo archivo (`lib/fintoc.ts`). Sin SDK.
- **Webhook:** lógica en `lib/webhook.ts`, separada del route handler para testearla sin base de datos.

### Reglas no negociables (y dónde viven)

| Regla | Dónde |
|---|---|
| Payload crudo del webhook siempre guardado | `payment_events.payload_raw` |
| Idempotencia: un webhook reenviado no duplica estado | `fintoc_event_id` único + `on conflict do nothing` |
| Firma verificada sobre el body crudo; `signature_valid` registrado aunque falle | `lib/webhook.ts` |
| Nada de payloads en logs ni en respuestas | `processWebhook().log` solo lleva 4 campos |
| Sin datos personales; sesión = UUID v4 anónimo | esquema en `db/migrations/001_initial.sql` |
| Límites: 10 sesiones/IP/hora, 100 eventos/sesión, body ≤ 64 KB | `lib/ratelimit.ts` (hash de IP en memoria, nunca en DB) |
| Monto fijo en el servidor; solo llaves `_test_` | `lib/fintoc.ts` |

## Correr en local

```bash
cp .env.example .env.local   # pegar llaves sk_test_/pk_test_, whsec_, DATABASE_URL
npm install
npm test                     # 16 tests: firma de webhook, idempotencia, confirmación de pago
npm run dev
```

La migración `db/migrations/001_initial.sql` se corre una vez en el SQL Editor de Supabase. Para recibir webhooks en local hace falta un túnel (ngrok) y registrar esa URL como endpoint en el Dashboard de Fintoc.

## Estructura

```
app/
  page.tsx                   inicio: canal + crear sesión
  s/[id]/                    sesión: línea de tiempo en vivo + widget
  api/sessions/              POST crea sesión · GET [id] estado + timeline
  api/events/                POST evento de funnel desde el navegador
  api/webhooks/payments/     POST webhook de Fintoc
lib/
  fintoc.ts                  cliente de la API + verificación de firma
  webhook.ts                 procesamiento del webhook (testeable)
  db.ts                      conexión y consultas
  ratelimit.ts · owner.ts    límites por IP · cookie de owner para /metrics
db/migrations/               esquema SQL
DECISIONS.md                 decisiones de producto, con razón y descartados
CLAUDE.md                    contexto e instrucciones para Claude Code
```

## Cómo se construyó

Con Claude Code como copiloto, siguiendo `CLAUDE.md`: Claude escribe boilerplate, tests y correcciones sin preguntar; cualquier cambio de esquema, endpoint o dependencia pasa por aprobación; y las decisiones de producto las toma el autor y quedan en `DECISIONS.md` antes del código.
