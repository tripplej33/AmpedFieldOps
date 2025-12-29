# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install postgresql-client for pg_isready (before switching user)
RUN apk add --no-cache postgresql-client wget

# Create node user early
RUN addgroup -g 1001 -S node && \
    adduser -S node -u 1001

# Copy package files with correct ownership
COPY --chown=node:node package*.json ./

# Install dependencies (including dev for migrations)
# In production, you might want to separate this, but for now we need tsx for migrations
RUN npm install --production=false && \
    chown -R node:node /app/node_modules

# Copy built files from builder with correct ownership
COPY --chown=node:node --from=builder /app/dist ./dist

# Copy source files for migrations (migrate.ts and seed.ts need to run)
COPY --chown=node:node --from=builder /app/src ./src

# Copy entrypoint script with correct ownership
COPY --chown=node:node docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create uploads directory with correct ownership
RUN mkdir -p uploads/logos && \
    chown -R node:node /app/uploads

# Use non-root user
USER node

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start the application via entrypoint
ENTRYPOINT ["/app/docker-entrypoint.sh"]
