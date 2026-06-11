# 遇友 - 限时破冰社交应用

> 88秒限时聊天，破冰交友新体验

## 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS + Vite
- **后端**: Node.js + Express + Socket.IO
- **数据库**: PostgreSQL
- **缓存**: Redis
- **状态管理**: Zustand

## 核心功能

- 无账号系统，直接创建资料开始匹配
- 88秒倒计时聊天，限时破冰
- 匹配筛选（地区、年龄、性别）
- 微信号可控展示
- 匹配历史记录
- 举报系统

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端运行在 http://localhost:3000，后端运行在 http://localhost:3001。

## 生产部署

### 部署到 Render（推荐）

1. Fork 本仓库到 GitHub
2. 在 [Render](https://render.com) 注册账号
3. 点击 "New Blueprint Instance"
4. 选择你的 GitHub 仓库
5. Render 会自动读取 `render.yaml` 配置并部署

### 手动部署

```bash
# 构建
npm run build

# 复制前端产物到后端
cp -r apps/web/dist apps/server/dist/web

# 启动生产服务器
cd apps/server && node dist/index.js
```

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务器端口 | 3001 |
| `DATABASE_URL` | PostgreSQL 连接字符串 | - |
| `DB_HOST` | 数据库主机 | localhost |
| `DB_PORT` | 数据库端口 | 5432 |
| `DB_USER` | 数据库用户 | yuyou |
| `DB_PASSWORD` | 数据库密码 | yuyou123 |
| `DB_NAME` | 数据库名 | yuyou |
| `REDIS_URL` | Redis 连接字符串 | - |
| `REDIS_HOST` | Redis 主机 | localhost |
| `REDIS_PORT` | Redis 端口 | 6379 |

## 管理员功能

在设置页面输入管理员密钥 `195674` 可打开测试面板。

## License

MIT
