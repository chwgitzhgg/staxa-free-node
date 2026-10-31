FROM node:20-alpine
RUN apk add --no-cache unzip curl
WORKDIR /app
COPY package.json server.js setup.js ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
