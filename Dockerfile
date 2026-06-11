# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package.json package-lock.json* ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# 安装所有依赖
RUN npm install

# 复制源码
COPY . .

# 构建 shared 包
RUN cd packages/shared && npm run build

# 构建前端
RUN cd apps/web && npm run build

# 构建后端
RUN cd apps/server && npm run build

# 复制前端产物到 server/dist/web
RUN cp -r apps/web/dist apps/server/dist/web

# 生产阶段
FROM node:20-alpine AS production

WORKDIR /app

# 复制 package 文件
COPY package.json package-lock.json* ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

# 安装生产依赖
RUN npm install --omit=dev

# 复制构建产物
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/src ./packages/shared/src
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# 暴露端口
EXPOSE 10000

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=10000

# 启动命令
CMD ["node", "apps/server/dist/index.js"]
