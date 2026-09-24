FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git curl ca-certificates openssh-client unzip zip jq ripgrep less procps \
    python3 python3-pip python3-venv \
    openjdk-17-jdk-headless maven \
    build-essential \
  && rm -rf /var/lib/apt/lists/* \
  && userdel -r node \
  && useradd -m -u 1000 -s /bin/bash nexo

COPY nexocode /usr/local/bin/nexocode
COPY entrypoint.sh /usr/local/bin/nexo-workspace

ENV HOME=/home/nexo \
    NPM_CONFIG_PREFIX=/home/nexo/.npm-global \
    PIP_USER=1 \
    PATH=/home/nexo/.npm-global/bin:/home/nexo/.local/bin:$PATH \
    NEXOCODE_MODELS_URL=https://models.dev

USER 1000
WORKDIR /home/nexo
EXPOSE 4096
ENTRYPOINT ["/usr/local/bin/nexo-workspace"]
