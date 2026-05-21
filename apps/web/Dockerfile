FROM node:24-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY tsconfig.json ./tsconfig.json
COPY apps/web ./apps/web

EXPOSE 3000

CMD ["npm", "run", "web:dev"]
