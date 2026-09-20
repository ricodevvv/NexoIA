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
  builtins.ts     tools propias del servidor: artifact, memory_save, memory_delete
  system.ts       arma el system prompt (preferencias, proyecto, memoria)
src/lib/mcp.ts    cliente MCP: conecta los servidores del usuario y expone sus tools
src/components/artifacts/  panel, versiones y el iframe aislado
src/app/api/chat  endpoint de streaming (NDJSON)
```

Cada adaptador traduce el historial al formato nativo de su API y emite los mismos eventos (`text`, `reasoning`, `tool_call`, `tool_result`, `notice`). El motor no sabe con qué proveedor habla. Para agregar otro proveedor basta con implementar `ProviderSession`.

Los mensajes se guardan en dos formas: `parts`, que es lo que pinta la UI, y `native`, que son los items tal como los devolvió la API, para poder reenviarlos sin perder nada.

## Conectores MCP

En Ajustes → Conectores agregas la URL de un servidor MCP remoto (Streamable HTTP o SSE) y, si hace falta, headers de auth. Las tools quedan disponibles en todos los chats y con cualquier modelo, porque el cliente MCP corre en nuestro servidor y no depende del conector nativo de cada API.

Por seguridad solo se aceptan URLs `https` que no apunten a redes privadas. Para probar con un servidor local pon `ALLOW_PRIVATE_MCP=1`, pero nunca en producción.

## Proyectos

Un proyecto junta chats sobre un mismo tema con instrucciones y archivos fijos. Las instrucciones van al system prompt y los archivos se adjuntan al primer mensaje de cada chat del proyecto (no se guardan duplicados, se inyectan en cada petición). Máximo 30 archivos por proyecto.

## Artifacts

Cuando el modelo genera algo que vale la pena ver aparte (una página, un componente React, un diagrama), llama a la tool `artifact` y se abre en un panel lateral con vista previa, código, versiones y descarga. Tipos: `html`, `react`, `svg`, `mermaid`, `markdown` y `code`.

La vista previa corre en un iframe con `sandbox="allow-scripts"` y sin `allow-same-origin`: el código generado no ve cookies, sesión ni el DOM de la app. Los componentes React se compilan en el navegador con Babel y los paquetes npm se cargan desde esm.sh, así que la vista previa necesita internet.

Las versiones no se guardan en una tabla aparte: salen de las llamadas a la tool que ya están en los mensajes. Editar o regenerar un mensaje también cambia las versiones.

## Memoria y preferencias

En Ajustes → Personalización:

- **Preferencias personales**: texto libre que va al system prompt de todos los chats.
- **Memoria**: el modelo guarda datos con las tools `memory_save` y `memory_delete`, y los ve en el system prompt en los chats siguientes. Tú puedes verlos, agregar, borrar uno o borrar todo. Tope de 100.
- Se pueden apagar los artifacts o la memoria. Así el modelo ni siquiera ve esas tools.

## Compartir chats

El botón Compartir crea un enlace público `/share/:id` con una copia del chat en ese momento, sin el razonamiento. Para incluir mensajes nuevos, hay que actualizar el enlace. Los adjuntos se sirven solo si aparecen en esa copia. Los enlaces activos se ven y se revocan en Personalización.

## Planes y Stripe

Los límites están en `src/lib/billing/plans.ts`: Free con 25 mensajes al día y solo modelos rápidos, Pro con 500 y todos los modelos. Los mensajes con key propia no cuentan.

Para activar los pagos:

1. Crea un producto con precio mensual en Stripe y copia el `price_...` a `STRIPE_PRICE_PRO`.
2. Pon `STRIPE_SECRET_KEY`.
3. Apunta un webhook a `/api/billing/webhook` con los eventos `checkout.session.completed` y `customer.subscription.*`, y copia el secreto a `STRIPE_WEBHOOK_SECRET`.

En local puedes usar `stripe listen --forward-to localhost:3000/api/billing/webhook`.

## Correos: verificar cuenta y recuperar contraseña

Con `RESEND_API_KEY` (y `EMAIL_FROM` con un dominio verificado en Resend) se mandan de verdad. Sin key, el enlace sale en la consola del servidor, que sirve para probar en local.

Al registrarse se manda un enlace de verificación, pero por defecto se puede entrar sin confirmar. Para exigirlo pon `REQUIRE_EMAIL_VERIFICATION=1`. Al restablecer la contraseña se cierran todas las sesiones abiertas.

## Estilos, títulos, búsqueda y dictado

- **Estilos de respuesta**: el botón de pluma del composer. Vienen Normal, Conciso, Explicativo y Formal, y en Personalización cada quien crea los suyos. El estilo va al final del system prompt.
- **Títulos**: al empezar un chat se pide un título al modelo más barato del mismo proveedor (Haiku en Anthropic, el `mini`/`nano` de `OPENAI_MODELS` en OpenAI), en paralelo con la respuesta. Si falla, se queda el título provisional.
- **Búsqueda**: `Ctrl/Cmd + K` busca en títulos y en el texto de todos los mensajes. Es un `ILIKE` sobre el JSON de las partes: va bien para miles de chats. Si crece mucho, conviene un índice `pg_trgm` o full-text.
- **Dictado**: usa la Web Speech API del navegador (Chrome, Edge, Safari). En Firefox el botón no aparece.
- **Exportar**: Ajustes → Cuenta descarga un JSON con todo, menos los secretos y los binarios de los adjuntos.

## Ejecución de código

La tool `run_python` deja que cualquier modelo corra Python para calcular, analizar los archivos adjuntos o hacer gráficas. Trae numpy, pandas, matplotlib, scipy, sympy y scikit-learn. Las figuras se guardan solas y lo que el código escriba en `/mnt/output` le llega al usuario como archivo.

Cómo está aislado:

- Python corre en WebAssembly (Pyodide) dentro de un proceso Node aparte (`sandbox/python-runner.mjs`).
- Ese proceso arranca con el modelo de permisos de Node (`--permission`): no puede escribir a disco, crear procesos ni workers, y solo lee `node_modules`, `sandbox/` y la caché de paquetes. No ve el `.env` ni ningún archivo del proyecto.
- Arranca sin variables de entorno, con 60 s de límite y 512 MB de heap.
- Los paquetes se descargan una vez a una caché (`/tmp/nexo-pyodide-cache`) al levantar el servidor. Esa es la única ejecución con permiso de escritura y no corre código del usuario.

Lo que **no** cubre: la red. El modelo de permisos de Node no la limita. Se bloquea `fetch` antes de correr el código, pero alguien decidido podría abrir sockets desde JS. Por eso:

- En desarrollo está prendida. En producción viene apagada y se activa con `CODE_EXECUTION=1`.
- Para producción, envuélvela sin red con `CODE_SANDBOX_WRAPPER`, por ejemplo `CODE_SANDBOX_WRAPPER="bwrap --unshare-net --ro-bind / / --dev /dev --tmpfs /tmp --bind /tmp/nexo-pyodide-cache /tmp/nexo-pyodide-cache"`, o córrela en un contenedor sin salida a la red interna.
- Al desplegar, copia la carpeta `sandbox/` junto a la app.

## Equipos

Cualquiera puede crear un equipo desde el selector de arriba del sidebar. Dentro de un equipo:

- **Invitaciones** por correo con rol de miembro o admin, válidas 7 días. El enlace lleva a `/invite/:id`; si no hay sesión, primero pasa por el login.
- **Roles**: el dueño lo puede todo; los admins invitan, quitan miembros y manejan conectores y plan; los miembros usan lo compartido.
- **Proyectos compartidos**: al crear un proyecto con un equipo activo se puede compartir. Todos ven y usan las instrucciones y archivos; solo quien lo creó o un admin lo edita. Los chats de cada quien son privados.
- **Conectores de equipo**: los agrega un admin en `/workspace` y sus tools quedan disponibles para todos mientras tengan ese equipo activo. Nadie ve los headers.
- **Uso**: `/workspace` muestra mensajes y tokens por miembro de los últimos 30 días.
- **Plan Team**: se cobra por asiento con `STRIPE_PRICE_TEAM` (precio mensual por unidad). Todos los miembros tienen límites de Pro mientras esté activo. Al entrar o salir alguien, la cantidad se ajusta sola en Stripe con prorrateo. El webhook distingue la suscripción del equipo por `metadata.organizationId`.

El equipo activo se guarda por sesión: al entrar desde otro dispositivo se empieza en el espacio personal.

## Límites de peticiones

Hay un limitador de ventana fija guardado en Postgres (tabla `rate_limit`), así funciona igual con varias instancias. Se usa en el chat (30/min por usuario y 60/min por IP), subidas, búsqueda, conectores, exportación, enlaces públicos y ejecución de código. También lo usa Better Auth para login (10/min), registro y correos de recuperación. Los valores están en `src/lib/rate-limit.ts`. Detrás de un proxy, la IP se toma de `X-Forwarded-For`.

## Login con Google y GitHub

Opcional. Si pones `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` o `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, aparece el botón en el login. La URL de callback es `{BETTER_AUTH_URL}/api/auth/callback/google` (o `/github`).

## Cosas a saber

- Los adjuntos se guardan en Postgres (máximo 20 MB por archivo). Para mucho volumen conviene moverlos a S3/R2.
- No hay verificación de email todavía: Better Auth la soporta, pero falta conectar un servicio de envío de correos.
- El límite diario se reinicia a las 00:00 UTC.

## Despliegue en esta VM

Producción corre desde una copia aparte en `/opt/nexo`, así editar el repo no rompe lo que está publicado.

- `nexo.service`: la app con `next start` en `127.0.0.1:3000`, como el usuario `ricodevvv`. Sus variables están en `/etc/nexo/nexo.env` (solo root), con secretos distintos a los de desarrollo.
- `nexo-tunnel.service`: un túnel rápido de Cloudflare que da HTTPS sin abrir puertos en Azure. Al arrancar, `deploy/tunnel.sh` lee la URL asignada, la guarda en `/etc/nexo/public-url`, actualiza `BETTER_AUTH_URL` y reinicia la app.
- Para publicar cambios: `./deploy/redeploy.sh`. Copia el código, instala, migra, compila y reinicia. Hay aproximadamente un minuto sin servicio mientras compila.
- Desarrollo usa otra base (`nexo_dev`) y el puerto 3001, para no mezclar datos de prueba con los reales.

Comandos útiles:

```bash
cat /etc/nexo/public-url                 # URL pública actual
journalctl -u nexo -f                    # logs de la app (aquí salen los enlaces de correo si no hay Resend)
sudo systemctl restart nexo              # reiniciar la app tras cambiar /etc/nexo/nexo.env
```

La URL de `trycloudflare.com` **cambia si se reinicia el túnel** (por ejemplo, si se reinicia la VM). Para una URL fija: un túnel con nombre de Cloudflare apuntando a un dominio tuyo, o abrir los puertos 80/443 en el NSG de Azure y poner Caddy con Let's Encrypt.

## Scripts

```bash
pnpm dev           # desarrollo
pnpm build         # build de producción
pnpm typecheck     # tipos
pnpm lint
pnpm db:generate   # genera migración tras cambiar src/lib/db/schema.ts
pnpm db:migrate    # aplica migraciones
```
