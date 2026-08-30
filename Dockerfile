FROM node:22-bookworm-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production
ENV KASA_DATA=/data/kasa.json
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "src/server.ts"]
