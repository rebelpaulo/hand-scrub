FROM node:24.19.0-bookworm-slim
WORKDIR /app
RUN install -d -o node -g node /data
COPY --chown=node:node . .
ENV NODE_ENV=production PALCO_HOST=0.0.0.0 PORT=8777 PALCO_DATA=/data/config.json
USER node
EXPOSE 8777
CMD ["node", "installation/server.mjs"]
