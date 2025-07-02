FROM oven/bun

WORKDIR /app

COPY package*.json ./
RUN bun install

COPY . .
RUN apt-get update -y && apt-get install -y openssl

EXPOSE 3000
CMD ["bun", "run", "start"]