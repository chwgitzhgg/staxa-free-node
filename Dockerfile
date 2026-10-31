FROM node:20-alpine
RUN apk add --no-cache unzip curl ca-certificates
WORKDIR /app
COPY package.json server.js setup.js ./
RUN node setup.js
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
