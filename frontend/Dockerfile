# Stage 1: Build the application
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files and workspace files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Install dependencies (including devDependencies for build)
RUN pnpm install

# Copy the rest of the application files
COPY . .

# Set NEXT_PUBLIC_BACKEND_URL to empty string during build to force relative paths
ENV NEXT_PUBLIC_BACKEND_URL=""

# Build the application
RUN pnpm build

# Stage 2: Production runner
FROM node:20-alpine AS runner

WORKDIR /app

# Set environment variable to production
ENV NODE_ENV=production

# Install pnpm
RUN npm install -g pnpm

# Copy necessary files from the builder
COPY --from=builder /app/package.json /app/pnpm-lock.yaml* /app/pnpm-workspace.yaml* ./
COPY --from=builder /app/.next /app/.next
COPY --from=builder /app/public /app/public
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/next.config.ts /app/next.config.ts

# Expose Next.js default port
EXPOSE 3000

# Start the application in production mode
CMD ["pnpm", "start"]
