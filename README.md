# Nexo

Nexo is a self-hosted AI chat app, similar to claude.ai, that works with any model provider.

## What it does

- **Chat with any model**: Claude (Anthropic), GPT (OpenAI) and any OpenAI-compatible API (OpenRouter, Ollama, Groq, NVIDIA, DeepSeek, LM Studio…). Users can add their own API keys and endpoints.
- **Accounts and teams**: sign up, email verification, password reset, Google/GitHub login, shared team projects.
- **Tools**: MCP connectors (with OAuth), web search, memory, search over past chats.
- **Files**: upload images, PDFs, text, zips and Office files. The model can read them, run Python on them and send files back (including zips).
- **Artifacts and widgets**: live HTML/React previews, charts, quizzes, step-by-step guides, diagrams and more, right inside the chat.
- **Projects**: shared instructions and files for a group of chats.
- **Nexo Code**: a coding agent in the browser, powered by [nexocode](https://github.com/ricodevvv/nexocode). Connect your own `nexocode serve`, or let Nexo spin up a cloud container for each session on Kubernetes (k3s).
- **Plans and billing**: optional Stripe subscriptions with daily limits.
- **Share**: public read-only links to chats.

Built with Next.js 16, React 19, PostgreSQL (Drizzle), Better Auth and the official Anthropic, OpenAI and MCP SDKs.

## Deploy with Docker Compose (easiest)

You need Docker with the Compose plugin.

```bash
git clone https://github.com/ricodevvv/NexoIA.git nexo
cd nexo
cp .env.example .env
```

Edit `.env` and set at least:

```bash
POSTGRES_PASSWORD=choose-a-password
BETTER_AUTH_SECRET=   # openssl rand -base64 32
ENCRYPTION_KEY=       # openssl rand -hex 32
BETTER_AUTH_URL=https://chat.example.com   # the public URL of your site
ANTHROPIC_API_KEY=    # and/or OPENAI_API_KEY, or the COMPAT_* variables
CODE_EXECUTION=1      # optional: lets the model run Python in the sandbox
```

Start it:

```bash
docker compose up -d --build
```

Nexo listens on port 3000. Put a reverse proxy with HTTPS in front of it (see `deploy/Caddyfile` for a Caddy example) and open your URL to create the first account.

## Deploy on a Linux server (without Docker for the app)

You need Node 22+, pnpm, PostgreSQL 16 and Docker (only for the code sandbox).

1. Create the database and a system user:

   ```bash
   sudo -u postgres createuser -P nexo
   sudo -u postgres createdb -O nexo nexo
   sudo useradd -r -m nexo
   ```

2. Get the code and build it:

   ```bash
   sudo git clone https://github.com/ricodevvv/NexoIA.git /opt/nexo
   sudo chown -R nexo /opt/nexo
   cd /opt/nexo
   pnpm install --frozen-lockfile
   ```

3. Put your settings in `/etc/nexo/nexo.env` (use `.env.example` as the template), then migrate and build:

   ```bash
   DATABASE_URL=postgres://nexo:password@localhost:5432/nexo npx drizzle-kit migrate
   pnpm build
   ```

4. Install the service and the HTTPS proxy:

   ```bash
   sudo cp deploy/nexo.service /etc/systemd/system/
   sudo systemctl enable --now nexo
   sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # set NEXO_HOST and ACME_EMAIL for Caddy
   sudo systemctl restart caddy
   ```

5. Optional, to let the model run Python safely: build the sandbox image with `docker build -t nexo-sandbox sandbox` and set `CODE_EXECUTION=1` plus `CODE_SANDBOX_COMMAND` (see `sandbox/run.sh`). The sandbox reaches the internet only through an egress proxy that blocks private addresses, so it can install packages with micropip and download data without seeing your host or cluster. `deploy/redeploy.sh` creates the isolated `nexo-sandbox` network and the `nexo-sandbox-egress` container for you.

To update later, pull the code and run `./deploy/redeploy.sh`.

## Optional: cloud workspaces for Nexo Code

Nexo can run each Nexo Code session in its own container, the same way Claude Code on the web does: a pod with 2 GB of RAM, its own disk and the nexocode agent. When you start a session, Nexo creates the pod, clones the repo you picked, runs the environment's setup script and then hands your task to the agent. Pods turn off after 15 minutes without use and come back with the same disk when you reopen the session. Sessions nobody opens for 30 days get deleted with their disk. API keys never enter the pod; the agent reaches the models through Nexo.

Sessions belong to an environment. Everyone gets a "Predeterminado" one, and you can make more from the environment picker. Each environment has:

- Network access: `none` (only GitHub and the domains you add), `trusted` (GitHub, GitLab and the package registries: npm, PyPI, Maven, crates, Go, RubyGems, Debian and similar) or `full` (any public site). All pod traffic goes through an egress proxy in the cluster, and the NetworkPolicy blocks every other way out. Each pod carries its policy signed by Nexo, so the agent can't change it.
- Environment variables, in `.env` format. The agent can read them.
- A setup script that runs with bash when each session starts, inside the repo if there is one. If it fails, the session doesn't start.

Changes to an environment apply the next time a session's container starts.

1. Install [k3s](https://k3s.io) on the server:

   ```bash
   curl -sfL https://get.k3s.io | sh -s - --disable traefik --disable servicelb
   ```

2. Create the namespace, permissions, limits and network isolation:

   ```bash
   sudo k3s kubectl apply -f deploy/k8s/workspaces.yaml
   ```

3. Create the secret the egress proxy uses to check each pod's network policy, and build the proxy image (it's the same one as the code sandbox):

   ```bash
   EGRESS_SECRET=$(openssl rand -hex 32)
   sudo k3s kubectl -n nexo-ws create secret generic nexo-egress --from-literal=secret="$EGRESS_SECRET"
   sudo docker build -q -t nexo-sandbox:latest sandbox
   sudo docker save nexo-sandbox:latest | sudo k3s ctr images import -
   ```

   Save `$EGRESS_SECRET`, it goes into Nexo's config in step 5.

4. Build the workspace image. Put a compiled `nexocode` binary in `deploy/workspace/` first (from the nexocode repo: `bun run script/build.ts --single`), then:

   ```bash
   deploy/workspace/build.sh
   ```

   It builds the image with the agent's instructions, skills and subagents from `prompts/code/` and imports it into k3s. Pods pick it up the next time they start.

5. Give Nexo access to the cluster. Add these to `/etc/nexo/nexo.env`:

   ```bash
   K8S_API=https://127.0.0.1:6443
   K8S_NAMESPACE=nexo-ws
   K8S_TOKEN=   # sudo k3s kubectl -n nexo-ws get secret nexo-controller-token -o jsonpath='{.data.token}' | base64 -d
   K8S_CA=      # sudo k3s kubectl -n nexo-ws get secret nexo-controller-token -o jsonpath='{.data.ca\.crt}'
   NEXO_WORKSPACES=pro   # pro, all or off
   NEXO_EGRESS_PROXY=nexo-egress.nexo-ws.svc.cluster.local:3128
   NEXO_EGRESS_SECRET=   # the value from step 3
   NEXO_SESSION_MAX_RUNNING=3        # containers on at once per user; the oldest one turns off to make room
   NEXO_SESSION_RETENTION_DAYS=30
   ```

6. Restart Nexo. Users with access will see the "Predeterminado" environment in `/code`.

If you were already running the old per-user workspaces, their `ws-*` pods get turned off by the reaper, but their disks stay. Delete them with `sudo k3s kubectl -n nexo-ws delete pvc -l workspace`.

## Optional: GitHub for Nexo Code

With this on, each user connects their GitHub account in Settings → GitHub, installs the app on their account or organizations, and picks the repos. The coding agent can then clone them, commit, push branches and open pull requests as that user. `git` and `gh` in the workspace ask Nexo for a fresh token every time, so no token is stored in the pod.

It uses a GitHub App, not the OAuth App of the GitHub login. The quick way is to let Nexo create it: put your email in `NEXO_ADMIN_EMAILS`, open Settings → GitHub and click "Crear la GitHub App". GitHub opens with everything filled in; confirm, and the credentials come back to Nexo encrypted in the database. Rename the app there if the suggested name is taken.

To create it by hand instead, go to github.com → Settings → Developer settings → GitHub Apps → New GitHub App:

- Callback URL: `https://<your site>/api/github/callback`. Also tick "Expire user authorization tokens".
- Setup URL: the same URL, with "Redirect on update" ticked. Leave "Request user authorization (OAuth) during installation" unticked.
- Webhook: untick "Active", it's not used.
- Repository permissions: Contents, Pull requests, Issues and Workflows set to read and write. Metadata stays read-only.
- Where can it be installed: "Any account", if people outside your account are going to use it.

Then generate a client secret and add the values to `/etc/nexo/nexo.env`:

```bash
GITHUB_APP_SLUG=nexo-code          # the app's URL name, github.com/apps/<slug>
GITHUB_APP_CLIENT_ID=Iv23li...
GITHUB_APP_CLIENT_SECRET=...
```

Workspaces pick up the GitHub setup the next time they start.

## Configuration

All settings are environment variables. `.env.example` lists every one of them. The most common:

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` | Random secrets (keep them safe, don't change them later) |
| `BETTER_AUTH_URL` | Public URL of the site |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | Server-wide model keys (optional if users bring their own) |
| `COMPAT_BASE_URL`, `COMPAT_MODELS` | Any OpenAI-compatible API |
| `CODE_EXECUTION` | `1` to let the model run Python in the sandbox |
| `RESEND_API_KEY`, `EMAIL_FROM` | Sending emails (verification, password reset) |
| `STRIPE_SECRET_KEY` | Enables paid plans |
| `STORAGE_DRIVER=s3`, `S3_*` | Store uploads in S3/R2/MinIO instead of the database |
| `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET` | GitHub App so the coding agent can use the user's repos; optional if you create it from Settings |
| `NEXO_ADMIN_EMAILS` | Comma-separated emails allowed to create the GitHub App from Settings |

## License

MIT. See [LICENSE](LICENSE).
