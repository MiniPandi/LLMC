FROM oven/bun

WORKDIR /app

COPY package*.json ./
RUN bun install

COPY . .
RUN apt-get update -y

EXPOSE 3000
CMD ["bun", "run", "start"]