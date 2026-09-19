# Nexo

Chat con IA estilo claude.ai que no depende de un solo proveedor. Funciona con Claude (Anthropic), GPT (OpenAI) y cualquier endpoint compatible con OpenAI: OpenRouter, Ollama, Groq, LM Studio, DeepSeek, etc. Trae cuentas de usuario, conectores MCP, adjuntos, planes con Stripe y cada usuario puede usar su propia API key.

Stack: Next.js 16 + React 19, Postgres con Drizzle, Better Auth, los SDKs oficiales de Anthropic, OpenAI y MCP, y Stripe.

## Arrancarlo en local

Necesitas Node 20.9+, pnpm y Postgres.

```bash
pnpm install
cp .env.example .env.local
```

Llena `.env.local`. Lo mínimo:

```bash
DATABASE_URL=postgres://usuario:clave@localhost:5432/nexo
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
ANTHROPIC_API_KEY=sk-ant-...
```

Y luego:

```bash
pnpm db:migrate
pnpm dev
```

Abre http://localhost:3000, crea una cuenta y listo.

## Proveedores

Cada proveedor aparece en el selector si tiene key, ya sea la global del `.env` o la del usuario (Ajustes → API keys).

- **Anthropic**: `ANTHROPIC_API_KEY`. Trae Opus 5, Fable 5.1, Sonnet 5 y Haiku 4.5. El catálogo está en `src/lib/ai/models.ts`.
- **OpenAI**: `OPENAI_API_KEY`. Los modelos salen de `OPENAI_MODELS` (separados por coma). Usa la Responses API sin estado.
- **Compatible con OpenAI**: `COMPAT_BASE_URL`, `COMPAT_MODELS` y, si el servicio la pide, `COMPAT_API_KEY`. Por ejemplo, para Ollama:

  ```bash
  COMPAT_NAME=Ollama
  COMPAT_BASE_URL=http://localhost:11434/v1
  COMPAT_MODELS=llama3.3,qwen3
  ```

Puedes cambiar de modelo a mitad de un chat, aunque sea de otro proveedor. Si el turno anterior lo respondió el mismo proveedor, se le reenvía tal cual con su razonamiento. Si no, se reconstruye desde el texto y las tools.

## Cómo está armado

```
src/lib/ai/
  types.ts        tipos comunes: partes del mensaje, eventos del stream
  models.ts       catálogo de modelos por proveedor
  engine.ts       bucle del turno: llama al modelo, ejecuta tools, repite
  providers/      un adaptador por proveedor (anthropic, openai, compat)
src/lib/mcp.ts    cliente MCP: conecta los servidores del usuario y expone sus tools
src/app/api/chat  endpoint de streaming (NDJSON)
```

Cada adaptador traduce el historial al formato nativo de su API y emite los mismos eventos (`text`, `reasoning`, `tool_call`, `tool_result`, `notice`). El motor no sabe con qué proveedor habla. Para agregar otro proveedor basta con implementar `ProviderSession`.

Los mensajes se guardan en dos formas: `parts`, que es lo que pinta la UI, y `native`, que son los items tal como los devolvió la API, para poder reenviarlos sin perder nada.

## Conectores MCP

En Ajustes → Conectores agregas la URL de un servidor MCP remoto (Streamable HTTP o SSE) y, si hace falta, headers de auth. Las tools quedan disponibles en todos los chats y con cualquier modelo, porque el cliente MCP corre en nuestro servidor y no depende del conector nativo de cada API.

Por seguridad solo se aceptan URLs `https` que no apunten a redes privadas. Para probar con un servidor local pon `ALLOW_PRIVATE_MCP=1`, pero nunca en producción.

## Planes y Stripe

Los límites están en `src/lib/billing/plans.ts`: Free con 25 mensajes al día y solo modelos rápidos, Pro con 500 y todos los modelos. Los mensajes con key propia no cuentan.

Para activar los pagos:

1. Crea un producto con precio mensual en Stripe y copia el `price_...` a `STRIPE_PRICE_PRO`.
2. Pon `STRIPE_SECRET_KEY`.
3. Apunta un webhook a `/api/billing/webhook` con los eventos `checkout.session.completed` y `customer.subscription.*`, y copia el secreto a `STRIPE_WEBHOOK_SECRET`.

En local puedes usar `stripe listen --forward-to localhost:3000/api/billing/webhook`.

## Login con Google y GitHub

Opcional. Si pones `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` o `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, aparece el botón en el login. La URL de callback es `{BETTER_AUTH_URL}/api/auth/callback/google` (o `/github`).

## Cosas a saber

- Los adjuntos se guardan en Postgres (máximo 20 MB por archivo). Para mucho volumen conviene moverlos a S3/R2.
- No hay verificación de email todavía: Better Auth la soporta, pero falta conectar un servicio de envío de correos.
- El límite diario se reinicia a las 00:00 UTC.

## Scripts

```bash
pnpm dev           # desarrollo
pnpm build         # build de producción
pnpm typecheck     # tipos
pnpm lint
pnpm db:generate   # genera migración tras cambiar src/lib/db/schema.ts
pnpm db:migrate    # aplica migraciones
```
