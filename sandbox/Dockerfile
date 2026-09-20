FROM node:22-slim

WORKDIR /sandbox
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY python-runner.mjs server.mjs ./

RUN mkdir -p /cache \
  && echo '{"warm":["numpy","pandas","matplotlib","scipy","sympy","scikit-learn"],"cacheDir":"/cache"}' \
     | node python-runner.mjs \
  && chmod -R a+rX /cache \
  && mkdir -p /run/nexo-sandbox && chown node:node /run/nexo-sandbox

USER node
ENTRYPOINT ["timeout", "-s", "KILL", "60", "node", "--permission", "--allow-fs-read=/sandbox", "--allow-fs-read=/cache", "--max-old-space-size=512", "python-runner.mjs"]
