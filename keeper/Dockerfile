FROM node:22-alpine
WORKDIR /app

# Install dependencies (including devDependencies for tsx)
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Run directly with tsx — no compile step needed
CMD ["npx", "tsx", "src/index.ts"]
