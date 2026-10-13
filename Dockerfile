FROM node:24-bookworm-slim
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile && pnpm build
ENV NODE_ENV=production FLIGHTPILOT_BIND_ADDRESS=0.0.0.0
RUN mkdir /app/.data && chown node:node /app/.data
USER node
EXPOSE 3000
CMD ["pnpm","start"]
