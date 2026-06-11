# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
COPY apps/web/package*.json ./apps/web/
COPY packages/shared/package*.json ./packages/shared/

# 安装依赖
RUN npm install

# 复制源码
COPY . .

# 构建 shared
RUN cd packages/shared && npm run build

# 构建前端
RUN cd apps/web && npm run build

# 构建后端
RUN cd apps/server && npm run build

# 生产阶段
FROM node:20-alpine AS production

WORKDIR /app

# 安装生产依赖
COPY package*.json ./
COPY apps/server/package*.json ./apps/server/
COPY packages/shared/package*.json ./packages/shared/

RUN npm install --production

# 复制构建产物
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# 暴露端口
EXPOSE 3001

# 启动命令
CMD ["node", "apps/server/dist/index.js"]
