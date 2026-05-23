# --- Build Stage ---
FROM node:18-alpine AS builder

# Install pnpm for efficient package management
RUN npm install -g pnpm

WORKDIR /app

# Copy lockfile and package configuration first to utilize Docker layer caching
COPY package.json pnpm-lock.yaml ./

# Install project dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the application files
COPY . .

# Compile the React SPA for Web
RUN pnpm build:web

# --- Runner Stage ---
FROM nginx:alpine

# Copy custom Nginx configuration supporting SPA routing
COPY deployments/nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts to Nginx default document root
COPY --from=builder /app/dist /usr/share/nginx/html
