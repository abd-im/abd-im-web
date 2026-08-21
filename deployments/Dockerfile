# --- Build Stage ---
FROM node:22-alpine AS builder

# Install pnpm for efficient package management
RUN npm install -g pnpm

WORKDIR /app

# Copy the application files
COPY . .

# Install project dependencies
RUN pnpm install --frozen-lockfile

# Compile the React SPA for Web
RUN pnpm build:web

# --- Runner Stage ---
FROM nginx:alpine

# Copy custom Nginx configuration supporting SPA routing
COPY deployments/nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts to Nginx default document root
COPY --from=builder /app/dist /usr/share/nginx/html
