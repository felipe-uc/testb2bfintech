# CLAUDE.md — Activation Lab

Archivo de instrucciones para Claude Code. Se lee al inicio de cada sesión. Contiene todo el contexto necesario; nadie debería tener que leer la conversación donde se diseñó el proyecto.

> Proyecto independiente, no afiliado a Fintoc. No usar "Fintoc" en el nombre del proyecto, del repo ni del dominio. El aviso "No afiliado a Fintoc" va al pie de todas las páginas públicas.

---

## 1. Propósito y para quién es

Activation Lab es una URL pública donde cualquier persona completa el flujo real de un producto de pagos por transferencia (Fintoc, en modo test) desde "quiero cobrar" hasta el webhook de pago confirmado, mientras el sistema mide cada paso del funnel y diagnostica solo por qué un intento no llegó a término. Es un proyecto personal, construido en pocas semanas con Claude Code como copiloto, para demostrar de forma verificable (URL viva, repo público, uso real) que se puede llevar software de local a producción con ayuda de IA. El proyecto cubre el tramo técnico del onboarding de un comercio self-serve (desde que tiene llaves de test hasta su primer pago de prueba con webhook verificado); no cubre el registro ni la verificación del negocio, que viven dentro de Fintoc.

---

## 2. Contexto de negocio que justifica las decisiones

- Fintoc vende pagos por transferencia bancaria (A2A) a pymes en Chile y México con un modelo self-serve: el comercio contrata sin pasar por Ventas.
- Dos poblaciones self-serve con funnels distintos:
  - **Camino plugin**: instala el plugin oficial en Shopify, VTEX o WooCommerce, pega sus llaves, el método aparece en el checkout. Falla por configuración (llaves mal pegadas, método no visible, modo test vs live).
  - **Camino API**: tiene sistema propio; su backend crea una sesión de pago, su frontend abre el widget, el cliente autoriza en el banco, Fintoc avisa por webhook. Falla por integración (webhook no llega, firma no verifica, monto no coincide, sesión expirada).
- En self-serve el revenue es comercios activados × TPV. El paso que nadie acompaña es de la integración al primer pago de prueba; Soporte responde a mano "no me llega el webhook / el pago quedó pending".
- Etapas del onboarding real de un comercio en Fintoc (orden aproximado): registro en el Dashboard → verificación del negocio → habilitación de productos → integración (plugin o API) → primer pago de prueba → paso a live → primer pago real. Este proyecto instrumenta solo el tramo integración → primer pago de prueba. Las etapas anteriores no se pueden replicar desde afuera.
- En un producto self-serve, las palancas de growth y operaciones son: instrumentar el funnel, cross-sell, automatizar lo que Soporte/Ops hace a mano, y canales nuevos. Este proyecto replica en pequeño las dos primeras: **instrumentar el funnel** y **automatizar el primer nivel de diagnóstico de Soporte**.
- Modo test de Fintoc: cubre Movements, Payment Initiation, Direct Debit y Transfers. Se usa con llaves `sk_test_` / `pk_test_` del Dashboard. Los bancos de prueba están documentados en docs.fintoc.com.
- Los plugins oficiales de Fintoc para Shopify, VTEX y WooCommerce ya existen. Replicarlos no aporta nada.

---

## 3. Principios del proyecto

- **Nunca manejar credenciales de terceros ni scrapear detrás de logins.** Por eso no se usa Movements con cuentas reales; solo el sandbox del proveedor.
- **Nada se construye sin URL viva.** El hola mundo se deploya el día 1 y todo lo demás se agrega sobre producción.
- **Cada decisión de producto se puede defender.** Las decisiones viven en `DECISIONS.md` antes del código asociado (ver sección 8); la IA escribe código, no toma decisiones.
- **Solo modo test.** El sitio es un entorno de prueba: sin dinero real, sin datos personales, sin llaves live.

---

## 4. Alcance del MVP

### Dentro

- Camino API completo contra el sandbox de Fintoc (Payment Initiation): crear sesión de cobro → abrir widget → autorizar con banco de prueba → `payment_intent` confirmado → webhook recibido y firma verificada → conciliado.
- Página de sesión con línea de tiempo en vivo de esos pasos.
- Diagnóstico automático cuando un intento no llega a término: motor de reglas determinístico (8–10 reglas) y LLM solo para redactar la explicación en castellano y sugerir el siguiente paso.
- Instrumentación de eventos de funnel en cada paso.
- Pregunta inicial "¿cómo vendes hoy?" con cuatro opciones (Shopify / WooCommerce o VTEX / API propia / aún no vendo online), guardada como atributo de la sesión.
- `/metrics` pública con el funnel por paso y por canal, con selector "solo yo / todos".
- Repo público en GitHub con `README.md`, `DECISIONS.md` y diagrama de arquitectura.
- Dominio propio con nombre neutro. Aviso "No afiliado a Fintoc".
- Semana 3: camino plugin **modelado, no instrumentado**: checklist de activación (plugin instalado, llaves configuradas, método visible en checkout, primera orden de prueba) que el usuario marca, con reglas de diagnóstico simples. Marcado así en el README.

### Fuera (no construir aunque parezca fácil)

- Integración con Shopify, VTEX o WooCommerce (OAuth, apps, dev stores).
- Movements / Connections con cuentas reales.
- Cross-sell, scoring de comercios, datos sintéticos de comercios.
- Chatbot sobre documentación.
- Recuperación de pagos abandonados por email o WhatsApp.
- Automatizaciones en n8n / Zapier.
- Generalizar el código "para que sirva para todo" antes de tener la URL viva.

---

## 5. Arquitectura mínima

### Stack (decidido)

- Frontend y backend: Next.js (App Router) + TypeScript.
- Deploy: Vercel. Dominio propio (~USD 10), nombre neutro.
- Base de datos: Postgres (Supabase o Neon; ver preguntas abiertas).
- Proveedor de pagos: API de Fintoc en modo test. SDK oficial de Node si existe; si no, `fetch` directo.
- Eventos de producto: tabla propia `funnel_events` (PostHog opcional; ver preguntas abiertas).
- Panel: Looker Studio conectado directo a Postgres, embebido en `/metrics` o consultas directas desde Next.js.
- Webhooks en local: túnel con ngrok. En producción: route handler en Vercel.
- Diagnóstico: reglas en TypeScript puro; LLM solo para redacción, con el resultado de las reglas como input.

### Páginas

```
/            inicio: pregunta "¿cómo vendes hoy?" y botón para crear sesión
/s/[id]      sesión: línea de tiempo en vivo + diagnóstico si aplica
/metrics     panel público de funnel, con selector "solo yo / todos"
```

### Endpoints

```
POST /api/sessions            crea checkout session en Fintoc y fila en `sessions`
POST /api/webhooks/payments   recibe webhook de Fintoc, verifica firma, guarda crudo, idempotente
POST /api/events              registra evento de funnel (step, session_id, metadata)
GET  /api/sessions/[id]       estado + línea de tiempo + diagnóstico
```

### Tablas

```
sessions         id, created_at, channel (shopify|woo_vtex|api|none), is_owner (bool),
                 fintoc_session_id, amount, status, expires_at
payment_events   id, session_id, received_at, event_type, fintoc_event_id (unique),
                 signature_valid (bool), payload_raw (jsonb)
funnel_events    id, session_id, step, occurred_at, metadata (jsonb)
diagnostics      id, session_id, rule_id, severity, explanation, next_step, created_at
```

### Reglas no negociables

- Guardar siempre el payload crudo del webhook en `payment_events.payload_raw`.
- Idempotencia por `fintoc_event_id`: un webhook reenviado no duplica estado.
- Verificar la firma del webhook antes de procesar; registrar `signature_valid` aunque falle.
- `is_owner` marca las sesiones del autor para que `/metrics` pueda excluirlas.
- Ninguna llave en el código. Todo en variables de entorno (detalle en sección 12).

### Estructura de carpetas

```
/app
  /page.tsx
  /s/[id]/page.tsx
  /metrics/page.tsx
  /api/sessions/route.ts
  /api/sessions/[id]/route.ts
  /api/webhooks/payments/route.ts
  /api/events/route.ts
/lib
  /fintoc.ts        cliente de la API (crear sesión, verificar firma)
  /db.ts            conexión y consultas
  /diagnostics/     una regla por archivo + index.ts que las ordena
  /llm.ts           redacción de la explicación a partir del resultado de reglas
/db
  /migrations/
/docs
  /architecture.md  diagrama
/.claude
  /settings.json    permisos de Claude Code (versionado; ver sección 13)
DECISIONS.md
README.md
CLAUDE.md
.env.example
.gitignore
```

---

## 6. Plan semana a semana

### Semana 1 — llegar vivo a producción

- Días 1–2: cuentas (Fintoc Dashboard, GitHub, Vercel, Supabase/Neon, dominio). Repo con plantilla de Next.js. Deploy del "hola mundo" al dominio **el mismo día 1**.
- Días 3–5: flujo completo contra sandbox: `POST /api/sessions` → widget → pago con banco de prueba → webhook guardado con firma verificada.
- **Criterio de salida**: una URL donde el autor hace un pago test de punta a punta y queda registrado en Postgres. Sin UI bonita.

### Semana 2 — convertirlo en producto de growth

- Eventos de funnel en cada paso. Línea de tiempo en vivo en `/s/[id]`.
- Motor de reglas de diagnóstico + redacción con LLM.
- `/metrics` con Looker Studio o consultas directas, selector "solo yo / todos", funnel por canal.
- `DECISIONS.md` escrito a medida que se decide, no al final.
- **Criterio de salida**: una persona que no es el autor completa el flujo sin ayuda.

### Semana 3 — uso real y pulido

- Invitar 10–15 personas (developers conocidos, post en LinkedIn, comunidades de ecommerce chileno).
- Corregir lo que rompan. Agregar al menos una regla de diagnóstico nacida de un fallo real.
- Camino plugin modelado como checklist (ver sección 4).
- Video de 90 s como respaldo de la demo.
- Si sobra tiempo: sección "qué haría con esto en Fintoc" en el README. No más código.
- **Criterio de salida**: funnel con usuarios reales en `/metrics`, repo limpio, demo ensayada.

---

## 7. Métricas que expone `/metrics`

Todas con selector "solo yo / todos" y desglose por `channel`:

- Vista de etapas del onboarding completo (las siete etapas de la sección 2), marcando visualmente cuáles están instrumentadas en este proyecto y cuáles no. Es la primera cosa que se ve en /metrics.
- Visitas a `/`.
- Sesiones creadas.
- Widget abierto.
- Autorización completada.
- Pago confirmado.
- Webhook recibido.
- Webhook verificado (firma válida).
- Conversión paso a paso y acumulada.
- Mediana y p90 de tiempo entre sesión creada y pago confirmado.
- Distribución de diagnósticos por `rule_id`.
- Sesiones expiradas sin abrir el widget.

---

## 8. Reglas de trabajo entre Claude Code y el autor

### Claude Code hace sin preguntar

- Boilerplate de Next.js, componentes, estilos.
- Migraciones que implementen un esquema ya aprobado.
- Tests (especialmente del motor de reglas y de la idempotencia del webhook).
- Consultas SQL para `/metrics`.
- Corrección de errores de build, lint, tipos y deploy.
- Refactors que no cambien esquema, endpoints ni dependencias.

### Claude Code propone y espera aprobación

- Cualquier cambio de esquema de base de datos.
- Cualquier endpoint nuevo o cambio de contrato de uno existente.
- Cualquier dependencia nueva en `package.json` (criterios en sección 12.4).
- Cualquier cambio en el flujo de verificación de firma o idempotencia.

### Decisiones del autor: deben existir en `DECISIONS.md` antes del código asociado

- Qué cuenta como "activado" (¿pago confirmado o webhook verificado?).
- La lista y el orden de las reglas de diagnóstico, escritas desde cómo piensa un agente de Soporte.
- Qué métricas van en `/metrics` y cuáles no.
- Reglas primero, LLM después: por qué y qué cuesta cada diagnóstico.
- Qué partes del código son del proveedor (Fintoc) y cuáles son propias y reutilizables.

Si el autor pide código para algo de esta lista y no hay entrada en `DECISIONS.md`, Claude Code lo señala y pide la decisión antes de escribir.

### Cómo se escribe `DECISIONS.md`

- El contenido es solo del autor: la decisión, la razón y lo descartado salen de lo que él dice, en sus palabras. Claude Code no inventa razones ni toma decisiones por él.
- Claude Code sí puede editar el archivo, pero **solo con el OK explícito del autor** en cada cambio: el autor dicta la decisión, Claude Code propone la entrada con la estructura de abajo, y la escribe únicamente cuando el autor la aprueba. Sin OK, no se toca.
- Formato fijo de cada entrada: `## AAAA-MM-DD — Tema`, luego **Decisión**, **Por qué**, **Descartado**. Una entrada por decisión, en orden cronológico. Al final del archivo, la lista de pendientes; cuando una decisión se toma, Claude Code la saca de pendientes al escribir la entrada.
- Si el autor cambia una decisión, se agrega una entrada nueva que referencia la anterior; no se edita ni borra la original.

### Convenciones de commits

- Mensajes en inglés, en imperativo: `Add webhook signature verification`.
- Un cambio por commit.
- Archivos agregados por nombre (nunca `git add .`); `git status` antes de cada commit.
- Nunca commitear llaves, `.env` ni payloads con datos reales. `.env.example` sí.
- Repo público desde el primer commit.

### Al terminar cada tarea

Claude Code explica en dos líneas qué cambió y por qué. Sin resumen de pasos, sin lista de archivos salvo que se pida.

### Estilo de respuesta

Instrucciones ejecutables, no explicaciones de concepto. Si un concepto es necesario para una decisión del autor, una frase y un enlace a la documentación.

---

## 9. Riesgos e ideas descartadas

### Riesgos

- Que parezca herramienta para developers y no de growth. Mitigación: el panel de funnel y la narrativa de activación, no de API.
- Primer deploy del proyecto. Mitigación: hola mundo en producción el día 1; nada se construye sin URL viva.
- Camino plugin flojo porque no se puede probar sin cuenta live. Mitigación: marcado como "modelado, no instrumentado".
- Demo en vivo falla. Mitigación: video de 90 s.
- Inflar números con pruebas propias. Mitigación: `is_owner` y selector "solo yo / todos".

### Descartado y por qué

- **Motor de cross-sell desde Movements**: lo más estratégico, pero todo el dato sería sintético; es una presentación, no un producto.
- **Recuperación de pagos abandonados en Shopify**: toca revenue directo, pero exige Shopify Partners + OAuth + Fintoc en el primer deploy; alta probabilidad de llegar con algo roto, y el único usuario sería el autor.
- **Chatbot sobre la documentación**: sin usuario ni revenue; es lo que cualquiera mostraría.
- **Replicar el plugin de Shopify/WooCommerce**: ya existe; tutorial con marca ajena.
- **Dashboard de datos públicos de pagos**: estático, sin decisión de producto.
- **Leer cuentas reales vía Movements**: viola la regla de credenciales de terceros.
- **n8n / Zapier**: no demuestra "de local a producción".

---

## 10. Guion de demo de 5 minutos (video y presentaciones del proyecto)

1. **30 s, el problema**: "En self-serve el revenue es comercios activados × TPV. Quise medir y arreglar el paso que nadie ve: de la integración al primer pago de prueba."
2. **2 min, demo en vivo desde el celular**: abrir la URL, elegir canal, crear sesión, pagar con banco de prueba; en una segunda pantalla aparece el webhook y la línea de tiempo se cierra. Forzar un fallo (webhook caído) y mostrar el diagnóstico.
3. **1 min, los números**: funnel con usuarios reales, dónde se cae la gente, error más común. "Esto mide el tramo técnico del onboarding; el tramo de registro y verificación vive dentro del proveedor, y es lo primero que pediría ver con datos reales."
4. **1 min, decisiones defendidas**: reglas antes que LLM, costo por diagnóstico, qué pasa con un webhook duplicado, por qué se guarda el payload crudo.
5. **30 s, repo y `DECISIONS.md` en pantalla**: "Lo construí con Claude Code; estas decisiones las tomé yo y puedo explicar por qué."

Pregunta abierta para quien opere un producto así: "¿Qué porcentaje de los tickets de activación viene de plugin versus API?"

---

## 11. Preguntas abiertas para la primera sesión

- Nombre del proyecto y del dominio (neutro, sin "Fintoc").
- ¿Existe SDK oficial de Fintoc para Node? Si no, cliente propio con `fetch`.
- Nombre exacto del header de firma del webhook de Fintoc y algoritmo de verificación (verificar en docs.fintoc.com).
- Tiempo de expiración real de una checkout session en Fintoc (en la conversación se usó "10 min" como ejemplo, no está verificado).
- Supabase o Neon para Postgres.
- Tabla propia `funnel_events` sola, o además PostHog.
- Looker Studio embebido en `/metrics` o consultas directas desde Next.js.
- Proveedor y modelo para la redacción del diagnóstico, y costo estimado por diagnóstico.
- Lista inicial de las 8–10 reglas de diagnóstico (el autor la escribe en `DECISIONS.md` antes de la semana 2).
- Qué cuenta como "activado" (el autor, `DECISIONS.md`).
- Credenciales de bancos de prueba del sandbox (copiar de la documentación al `.env.example` como referencia, no como valores).
- Lista de las 10–15 personas a invitar en semana 3.

---

## 12. Seguridad y límites de gasto (reglas duras)

Estas reglas mandan sobre cualquier petición. Si una tarea las contradice, Claude Code se detiene y lo dice.

### 12.1 Llaves y secretos

- Las llaves viven en **un solo lugar por entorno**: `.env.local` en local, variables de entorno en Vercel en producción. En ningún otro sitio: ni código, ni README, ni commits, ni issues, ni prompts, ni capturas, ni el video de demo.
- `.env.example` se commitea con **nombres de variables y valores falsos** (`sk_test_XXXX`). Es el único archivo `.env*` que entra al repo.
- Claude Code **no lee `.env.local`** ni ningún `.env*` distinto de `.env.example`. Si necesita saber qué variables existen, lee `.env.example`. Nunca imprime, copia ni resume el contenido de un `.env`.
- Solo existen llaves `sk_test_` / `pk_test_`. **Nunca** crear, copiar ni configurar `sk_live_`. La cuenta de Fintoc se queda en modo test todo el proyecto.
- Ninguna variable con secreto lleva el prefijo `NEXT_PUBLIC_` (ese prefijo la manda al navegador). Lo único público es `pk_test_`. `sk_test_`, el secreto del webhook, la URL de Postgres y la llave del LLM son solo de servidor.
- La base de datos se consulta **solo desde el servidor** (route handlers / server components). Nunca desde el navegador, nunca con una llave de servicio en el cliente.
- Claude Code **nunca ejecuta `git add .` ni `git add -A`**. Agrega archivos por nombre y muestra `git status` antes de cada commit.
- Claude Code **nunca ejecuta `git push --force`**, `git reset --hard` ni borra ramas sin aprobación explícita.
- Si una llave toca git aunque sea un segundo: **rotarla** (Dashboard de Fintoc → nueva llave; Vercel → actualizar variable; borrar la vieja). No intentar limpiar el historial: el repo es público y ya fue indexado. Rotar es más barato que borrar.
- Activar en GitHub (Settings → Code security): **Secret scanning** y **Push protection**. Son gratis en repos públicos y bloquean el push si detectan una llave.
- 2FA activado en GitHub, Vercel, Fintoc y el proveedor de base de datos antes de deployar.

### 12.2 Gasto

- Todo en plan gratuito sin tarjeta registrada: Vercel Hobby, Supabase/Neon free tier, GitHub público. El único gasto autorizado es el dominio (~USD 10). Si un servicio pide tarjeta para seguir, se detiene y se decide; no se agrega la tarjeta "para probar".
- Proveedor del LLM: **límite de gasto mensual configurado en la consola del proveedor antes de usar la llave** (USD 10 sugerido). Modelo barato, `max_tokens` ≤ 400 por llamada.
- **Un diagnóstico por sesión, máximo.** Se genera una vez, se guarda en `diagnostics`, y las cargas siguientes de `/s/[id]` leen la tabla. Nunca se llama al LLM en cada render ni en cada poll.
- El LLM **nunca** recibe el `payload_raw` del webhook ni llaves: solo recibe el `rule_id`, la severidad y los campos mínimos que la regla necesite.
- Endpoints públicos (`POST /api/sessions`, `POST /api/events`) con límite por IP: máximo 10 sesiones por IP por hora y 100 eventos por sesión. Respuesta `429` al exceder. Cómo se implementa (middleware propio vs dependencia) es una decisión que pasa por la regla de "dependencia nueva".
- El monto del cobro es **fijo en el servidor** (una constante, en modo test). El cliente no envía montos ni moneda.
- La línea de tiempo en vivo hace polling cada 3–5 s con **tope de 15 minutos**; después se detiene y muestra "sesión expirada". Sin websockets, sin loops infinitos.
- Ningún cron job, ningún job programado en Vercel, ningún proceso que corra sin que un usuario lo dispare.
- Tamaño máximo de body en `/api/webhooks/payments` y `/api/events`: 64 KB. Más grande se rechaza con `413`.

### 12.3 Datos de personas

- El producto **no pide ni guarda datos personales**: sin email, sin nombre, sin login, sin RUT, sin teléfono. La sesión es un UUID anónimo. Si una feature "necesitaría" un email, está fuera de alcance.
- No se guarda la IP de nadie en la base de datos. Si el rate limit la necesita, vive en memoria o en un hash con sal, nunca en `sessions`.
- `is_owner` se marca con un **cookie secreto** que solo el autor tiene (valor en variable de entorno), no con un parámetro visible ni un botón público.
- `/metrics` muestra **solo agregados**. Nunca lista sesiones individuales, payloads ni IDs de Fintoc.
- `/s/[id]` muestra solo esa sesión; el `id` es UUID v4 (no secuencial, no adivinable). No existe endpoint que liste sesiones.
- `payload_raw` del webhook se guarda en la base de datos (regla no negociable) pero **nunca se escribe en `console.log`** en producción: los logs de Vercel son visibles y persistentes. En logs van `session_id`, `event_type` y `signature_valid`, nada más.
- Ningún payload, ni de prueba, se commitea al repo. Los fixtures de tests se escriben a mano con valores inventados.
- Las credenciales de bancos de prueba de la documentación de Fintoc pueden ir en `.env.example` como referencia (son públicas). Credenciales de bancos reales, de cualquier persona, **jamás** (principio de la sección 3).
- Errores en producción devuelven mensajes genéricos. Nunca el stack trace ni el mensaje del proveedor al usuario.

### 12.4 Dependencias y repo

- Cada dependencia nueva pasa por aprobación (sección 8). Antes de aprobar: `npm view <paquete>` para ver descargas semanales y última publicación; menos de 10.000 descargas/semana o sin actualizar hace 2 años, se descarta.
- `npm audit` antes de cada deploy a producción. Vulnerabilidades `high`/`critical` bloquean el deploy.
- El repo es público desde el primer commit: todo lo que entra se asume leído por cualquiera, para siempre.

### 12.5 Si algo se filtra

1. Rotar la llave afectada en el proveedor (Fintoc / Vercel / DB / LLM).
2. Actualizar la variable en Vercel y en `.env.local`.
3. Anotar en `DECISIONS.md` qué pasó y qué se cambió para que no se repita.
4. No borrar historial, no reescribir commits.

---

## 13. Archivos que deben existir ANTES del `git init`

### `.gitignore`

```
# secretos
.env
.env.*
!.env.example

# next / vercel
.next/
.vercel/
out/
next-env.d.ts
*.tsbuildinfo

# certificados
*.pem

# deps y sistema
node_modules/
.DS_Store
*.log
npm-debug.log*

# claude code (ajustes locales con rutas de tu máquina)
.claude/settings.local.json
```

### `.env.example`

```
# Fintoc (solo modo test; nunca sk_live_)
FINTOC_SECRET_KEY=sk_test_XXXXXXXXXXXXXXXX
NEXT_PUBLIC_FINTOC_PUBLIC_KEY=pk_test_XXXXXXXXXXXXXXXX
FINTOC_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXX

# Base de datos (solo servidor)
DATABASE_URL=postgres://user:password@host:5432/dbname

# LLM (solo servidor; límite de gasto configurado en la consola del proveedor)
LLM_API_KEY=XXXXXXXXXXXXXXXX

# Marca las sesiones del autor para excluirlas de /metrics
OWNER_COOKIE_SECRET=cambiar-por-un-valor-largo-y-aleatorio

# Referencia: credenciales de bancos de prueba según docs.fintoc.com (públicas)
# TEST_BANK_USER=...
# TEST_BANK_PASSWORD=...
```

### `.claude/settings.json` (versionado; Claude Code lo respeta en cada sesión)

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./.env.local)",
      "Bash(git add .)",
      "Bash(git add -A)",
      "Bash(git add --all)",
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(git reset --hard*)",
      "Bash(rm -rf*)"
    ],
    "allow": [
      "Read(./.env.example)"
    ]
  }
}
```

### Hook de pre-commit (no versionado, se crea una vez; corre antes de cada commit)

```bash
# correr después de git init, desde la raíz del repo
cat > .git/hooks/pre-commit <<'EOF'
#!/bin/sh
# 1) llaves o cadenas de conexión en el diff (ignora los placeholders XXXX de .env.example y CLAUDE.md)
if git diff --cached -U0 | grep -E 'sk_(test|live)_[A-Za-z0-9]{8,}|whsec_[A-Za-z0-9]{8,}|postgres://[^:]+:[^@]+@' | grep -vE '_X{8,}|postgres://user:password@' ; then
  echo "BLOQUEADO: parece haber una llave o conexión en el commit. Rotar si ya se pegó en algún lado."
  exit 1
fi
# 2) cualquier archivo .env* salvo .env.example
if git diff --cached --name-only | grep -E '^\.env(\..*)?$' | grep -v '^\.env\.example$' ; then
  echo "BLOQUEADO: intentas commitear un archivo .env"
  exit 1
fi
EOF
chmod +x .git/hooks/pre-commit
```

---

## Primera sesión

Cuatro pasos del día 1, en este orden. El objetivo es terminar el día con una URL viva, no con código.

```bash
# 1. Crear el proyecto
npx create-next-app@latest <nombre-del-proyecto> --typescript --app --eslint
cd <nombre-del-proyecto>

# 2. Archivos de seguridad ANTES del git init (contenido en sección 13)
#    .gitignore, .env.example, .claude/settings.json
cp .env.example .env.local   # luego pegar las llaves reales solo en .env.local

# 3. Primer commit en un repo público de GitHub (archivos por nombre, nunca git add .)
git init
#    instalar el hook de pre-commit (sección 13)
git add .gitignore .env.example .claude/settings.json package.json package-lock.json \
        tsconfig.json next.config.* app public
git status                   # confirmar que no aparece .env.local
git commit -m "Initialize Next.js project"
# crear el repo público en GitHub, activar Secret scanning + Push protection, y conectarlo:
git remote add origin <url-del-repo>
git push -u origin main

# 4. Primer deploy del hola mundo
npx vercel          # vincular el proyecto y deployar
npx vercel --prod   # deploy a producción; luego conectar el dominio en el panel de Vercel
```

Después de esto: crear la cuenta en el Dashboard de Fintoc, copiar las llaves `sk_test_` y `pk_test_` a `.env.local` y a las variables de entorno de Vercel, y pasar a los días 3–5 de la semana 1.

### Checklist del día 1 (antes del primer `git push`)

- [ ] `.gitignore`, `.env.example` y `.claude/settings.json` creados y commiteados.
- [ ] Hook de pre-commit instalado.
- [ ] `git status` no muestra ningún `.env.local`.
- [ ] Repo público en GitHub con Secret scanning + Push protection activados.
- [ ] 2FA en GitHub, Vercel, Fintoc, proveedor de DB.
- [ ] Ninguna tarjeta registrada en Vercel ni en la DB.
- [ ] Límite de gasto mensual configurado en el proveedor del LLM (antes de crear la llave).
- [ ] Llaves de Fintoc solo `_test_`, pegadas en `.env.local` y en Vercel → Environment Variables, nunca en otro sitio.
