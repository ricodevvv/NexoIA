FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git curl ca-certificates openssh-client unzip zip jq ripgrep less procps \
    python3 python3-pip python3-venv \
    openjdk-17-jdk-headless maven \
    build-essential \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable pnpm \
  && userdel -r node \
  && useradd -m -u 1000 -s /bin/bash nexo

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

COPY nexocode /usr/local/bin/nexocode
COPY entrypoint.sh /usr/local/bin/nexo-workspace
COPY present-files.mjs /usr/local/lib/nexo/present-files.mjs
COPY --from=prompts AGENTS.md /usr/local/lib/nexo/AGENTS.md
COPY --from=prompts agents/explorer.md agents/reviewer.md /usr/local/lib/nexo/nexocode/agents/
COPY --from=prompts skills/office-files /usr/local/lib/nexo/nexocode/skills/office-files
COPY --from=prompts skills/review /usr/local/lib/nexo/nexocode/skills/review

ENV HOME=/home/nexo \
    NPM_CONFIG_PREFIX=/home/nexo/.npm-global \
    PIP_USER=1 \
    PIP_BREAK_SYSTEM_PACKAGES=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PATH=/home/nexo/.npm-global/bin:/home/nexo/.local/bin:$PATH \
    NEXOCODE_MODELS_URL=https://models.dev \
    NEXOCODE_CONFIG_DIR=/usr/local/lib/nexo/nexocode

USER 1000
WORKDIR /home/nexo
EXPOSE 4096
ENTRYPOINT ["/usr/local/bin/nexo-workspace"]
