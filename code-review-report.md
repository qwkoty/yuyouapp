# 遇友（Yuyou）代码全面扫描报告 — Bug & 史山代码清单

> 扫描范围：全部后端 + 前端核心模块（约 70+ 文件），重点关注 Bug、安全隐患、史山代码和重复逻辑

---

## 🔴 严重 Bug（需立即修复）

### 1. `calculateAge` 重复定义 — 双版本不一致风险

**位置：**
- `apps/server/src/services/authService.ts:239-248` — 本地定义
- `apps/server/src/lib/utils.ts:7-15` — 模块导出版

**问题：** 两个完全相同的 `calculateAge` 函数，`userService.ts` 正确引用了 `utils.ts` 版本，但 `authService.ts` 自己又定义了一份。如果未来修改逻辑只改了一处，就会导致行为不一致。

**修复：** 删除 `authService.ts` 中的本地定义，改用 `import { calculateAge } from '../lib/utils'`

---

### 2. Redis 连接未显式 `connect()` — 潜在连接时序问题

**位置：** `apps/server/src/lib/redis.ts`

**问题：** 配置了 `lazyConnect: true`，但代码中**没有在任何地方显式调用 `redis.connect()`**。ioredis 的 lazyConnect 模式下，第一个命令才会触发连接。如果数据库初始化先于 Redis 实际连接完成，可能出现命令排队超时。

**当前表现：** 大部分情况下没问题（第一个 Redis 命令会自动触发连接），但在高并发启动时可能导致首次请求延迟。

**修复建议：** 在 `start()` 函数中，`initDB()` 之前加入 `await redis.connect()`

---

### 3. 匹配池退出逻辑缺陷 — 优先匹配时会跳过同城同性别

**位置：** `apps/server/src/sockets/matchHandler.ts:97-99`

```typescript
const targetGender = filters.gender || (profile.gender === 'male' ? 'female' : 'male');
const targetProvince = filters.province || profile.province;
```

**问题：** 匹配池 key 是 `match_pool:{gender}:{province}`，当用户 A（北京男）匹配时默认目标为 `match_pool:female:北京`。但如果用户 B（北京女）的筛选条件指定了 `gender: male, province: 上海`，B 会进入 `match_pool:male:上海` 池。A 在北京池里找不到 B，即使两人实际上互相满足条件。

**本质问题：** 匹配池设计无法处理"双方筛选条件交叉"的场景。用户只进入自己目标筛选条件对应的池，但对方可能在不同池里。

**修复建议：** 长期方案是改用更灵活的匹配策略（如全量扫描 + 内存过滤）；短期可在 `tryMatch` 中增加跨池扫描逻辑。

---

### 4. 验证码发送频率限制逻辑错误 — 10次/分钟 vs 5次/分钟矛盾

**位置：** `apps/server/src/services/authService.ts:23-28`

```typescript
// 检查发送频率限制（每分钟最多10次）
if (currentCount && parseInt(currentCount) >= 10) {
```

**问题：** 注释说"每分钟最多10次"，但 HTTP 路由层的 `rateLimiters.sendCode` 限制是 5次/分钟。Redis 层的限制(10次) 比 HTTP 层(5次) 更宽松，实际上 Redis 层的限制永远不会触发（因为 HTTP 层先拦截了）。这段 Redis 限流代码是**无效的史山代码**。

**修复：** 删除 Redis 层的发送频率限制（已被 HTTP 限流器覆盖），或者统一为一致的阈值。

---

### 5. 验证码 `expiresAt` 双重过期 — Redis TTL vs JSON 字段冲突

**位置：** `apps/server/src/services/authService.ts:33-36`

```typescript
const expiresAt = Date.now() + 5 * 60 * 1000; // 5分钟有效
await redis.setex(`sms_code:${phone}`, 300, JSON.stringify({ code, expiresAt }));
```

**问题：** Redis key 设置了 300 秒 TTL 自动过期，同时又在 JSON 值里存了 `expiresAt`。`verifyAndLogin` 中**先检查 Redis key 是否存在**（Redis 过期会返回 null），再检查 `expiresAt` 字段。第二个检查永远不会触发（因为 Redis 过期后 key 已不存在）。

**修复：** 删除 JSON 中的 `expiresAt` 字段，完全依赖 Redis TTL。或者反过来，不依赖 Redis TTL，仅用 JSON 中的时间戳（但这样需要手动清理过期 key）。

---

### 6. 新用户创建硬编码默认值 — 不符合产品逻辑

**位置：** `apps/server/src/services/authService.ts:139-141`

```typescript
INSERT INTO users (id, phone, nickname, gender, birth_date, province, city)
VALUES ($1, $2, '新用户', 'male', '2000-01-01', '北京', '北京')
```

**问题：** 新注册用户默认性别为 `male`、出生日期 `2000-01-01`、地区 `北京/北京`。但应用有性别筛选匹配逻辑，默认 male 会导致女性用户注册后初始被当作男性匹配。`2000-01-01` 导致年龄计算固定为 25-26 岁。

**修复：** 注册后应强制引导用户完善资料（当前有 ProfileSetup 页面，但默认值仍可能影响匹配池）。建议新用户不进入匹配池直到资料完善。

---

## 🟡 中等 Bug / 逻辑问题

### 7. `getAgentById` 返回全部字段包括 `api_key` — IDOR 修复后仍有泄露风险

**位置：** `apps/server/src/services/agentService.ts:55-60`

```typescript
export async function getAgentById(agentId: string) {
  const result = await pool.query(
    `SELECT * FROM ai_agents WHERE id = $1`, [agentId]
  );
```

**问题：** `SELECT *` 会返回 `api_key` 字段。虽然路由层 `getOwnedAgent` 做了归属校验，但 `getAgents`（列表查询）只返回了排除 api_key 的字段。`getAgentById` 却暴露了 api_key，如果未来有新路由使用此函数但忘了做归属校验，就会泄露用户 API Key。

**修复：** 将 `getAgentById` 的 SELECT 也排除 api_key，只在 `llmService` 需要时单独查询。

---

### 8. `blockUser` / `unblockUser` 接口缺少 JWT 鉴权中间件

**位置：** `apps/server/src/routes/api.ts:809-856`

```typescript
router.post('/block', async (req, res) => {  // 没有 requireAuth!
  const { token, targetId } = req.body;
  const decoded = verifyToken(token);  // 从 body 中取 token
```

**问题：** `/block` 和 `/unblock` 路由没有使用 `requireAuth` 中间件，而是从请求体中取 token。这与其他路由（使用 Authorization header）不一致。虽然功能上可行，但：
- 请求体中的 token 容易被日志记录
- 与其他路由的认证方式不一致，容易维护混乱

**修复：** 改为使用 `requireAuth` 中间件 + Authorization header，与其他路由保持一致。

---

### 9. 管理员密钥 `195674` 硬编码在 README 中 — 信息泄露

**位置：** `README.md:74`

```
在设置页面输入管理员密钥 `195674` 可打开测试面板。
```

**问题：** 管理员密钥直接写在公开仓库的 README 中，任何人都能看到并使用。虽然 `envCheck.ts` 会在未设置 `ADMIN_KEY` 时生成随机值，但 README 暗示这个硬编码值可用。

**修复：** 删除 README 中的密钥值，改为提示"请通过 ADMIN_KEY 环境变量配置"。

---

### 10. `endSessionByTimer` 动态 import redis — 每次超时都重新加载模块

**位置：** `apps/server/src/sockets/matchHandler.ts:425`

```typescript
const { setSessionStatus } = await import('../lib/redis');
```

**问题：** 文件顶部已经静态 import 了 `endSession` 等 redis 函数，但 `endSessionByTimer` 又用了动态 `import()` 来获取 `setSessionStatus`。这个函数在文件顶部 import 列表中**确实没有包含**，但动态 import 比静态 import 效率低（Node.js 需要额外解析）。

**修复：** 将 `setSessionStatus` 加入顶部静态 import 列表。

---

### 11. 前端 `App.tsx` 后台验证 token 不可取消 — useEffect 清理不完整

**位置：** `apps/web/src/App.tsx:39-100`

**问题：** useEffect 中创建了 `AbortController` 和 `timeoutId`，并在 cleanup 函数中清理。但 `fetch` 返回后内部的 `.then()` 链中仍然会执行（因为 abort 只取消网络请求，不阻止 then 回调执行）。虽然代码在 catch 中处理了 AbortError，但 `.then()` 链中的 `clearTimeout(timeoutId)` 在 abort 后仍会被调用，可能导致清理逻辑混乱。

**轻微问题**，实际影响不大，但建议使用 `fetch` + AbortController 的更标准模式。

---

## 🗑️ 史山代码（需清理）

### 12. Redis 验证码发送限流 — 无效代码

**位置：** `authService.ts:22-43`（`sendVerificationCode` 中的 Redis 限流逻辑）

**问题：** 如 Bug #4 所述，HTTP 层限流器(5次/分钟)比 Redis 层(10次/分钟)更严格，Redis 层永远不会触发。整段 `sms_limit:` 相关代码是**无效的史山**。

**清理：** 删除 `sms_limit:` 相关的 Redis 计数逻辑。

---

### 13. `verification_codes` 数据库表 — 审计用途存疑

**位置：** `authService.ts:46-49`, `db.ts:75-85`

**问题：** 验证码同时存 Redis（用于实际验证）和 PostgreSQL（"用于审计"）。但：
- 数据库中的验证码没有被任何业务逻辑查询
- 仅在 `verifyAndLogin` 中标记 `used = TRUE`，但这只是附带操作
- 每次发送验证码都写数据库，增加不必要的 I/O

**清理建议：** 如果确实需要审计，保留；否则删除数据库写入和 `verification_codes` 表。

---

### 14. `logger.ts` — 整个文件未被使用

**位置：** `apps/server/src/lib/logger.ts`

**问题：** 定义了完整的日志系统（分级、脱敏、文件轮转），但**全项目没有任何一处 import 或使用它**。所有日志都直接用 `console.log/error/warn`。

**清理：** 删除 `logger.ts`，或者全局替换 `console.*` 为 `logger.*`（推荐后者，日志脱敏对 API Key 安全有价值）。

---

### 15. `chat_messages` 数据库表 — 写入但不读取

**位置：** `chatHandler.ts:98-101`

```typescript
pool.query(
  `INSERT INTO chat_messages (session_id, sender_id, content, type) VALUES (...)`
).catch(...)
```

**问题：** 聊天消息持久化到数据库，但**没有任何路由或服务读取这个表**。消息只在 Redis 中临时存储（120秒 TTL），通过 Socket.IO 实时传输。数据库中的消息无人消费，只会不断堆积。

**清理建议：** 如果需要聊天历史功能，添加读取接口；否则删除写入逻辑和 `chat_messages` 表。

---

### 16. `now()` 函数 — 冗余导出

**位置：** `apps/server/src/lib/utils.ts:18-20`

```typescript
export function now(): number {
  return Date.now();
}
```

**问题：** 包装 `Date.now()` 的函数，全项目没有使用。

**清理：** 删除。

---

### 17. 前端 `userStore.updateProfile` — 不使用 `apiClient`

**位置：** `apps/web/src/stores/userStore.ts:24-27`

```typescript
const res = await fetch('/api/auth/update-profile', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, profile: input }),
});
```

**问题：** 项目有统一的 `apiClient` 封装（带 token、错误处理、限流），但 `userStore.updateProfile` 直接用 `fetch`，绕过了所有统一处理（401 自动跳转、错误 toast、超时控制）。

**清理：** 改为使用 `api.post('/auth/update-profile', { token, profile: input })`。

---

### 18. `contentFilter.ts` — 敏感词"诈骗"会误判聊天

**位置：** `apps/server/src/lib/contentFilter.ts:14`

```
'诈骗', '传销', '洗钱', '赌博', '博彩', '六合彩',
```

**问题：** "诈骗" 在日常聊天中可能出现在"我差点被骗/诈骗"这类正常语境中，但过滤会直接拦截整条消息。应该区分"提及"和"传播"。

**建议：** 敏感词过滤不应直接拦截消息，而是替换为 `***` 后发送（当前 `checkChatMessage` 返回 `safe: false` 完全拦截）。

---

## 🟢 小问题 / 可优化

### 19. `balanceService.ts` 的 `openai` provider — 应用不支持

`api_provider` CHECK 约束只有 `deepseek, nvidia, qwen, custom`，但 `balanceService` 有 `openai` 分支。这是历史遗留。

### 20. `docker-compose.yml` + `Dockerfile` + `build.sh` — 三套构建方式并存

`build.sh`、`Dockerfile`、`render.yaml` 三套构建逻辑，其中 `build.sh` 可能已过时（Render 用 `render.yaml`）。

### 21. 管理员认证方式不一致 — body token vs header token

- `requireAuth`：Authorization header + Bearer token
- `/block` `/unblock`：请求体中的 token
- 管理员路由：请求体中的 token
- Socket.IO：handshake auth token

四种认证方式，应统一。

### 22. `session_user:` Redis key TTL 120秒 — 88秒聊天会提前过期

`createSession` 设置 `session_user:` TTL 为 120 秒，但聊天只有 88 秒。如果聊天结束后用户没有新会话，120 秒内 `getUserSession` 仍返回旧 sessionId（虽然 session 已删除）。应与聊天时长对齐。

### 23. `matched_pair:` TTL 1小时 — 过短

`markMatchedPair` 设置 1 小时 TTL，意味着同一对用户 1 小时后可以再次匹配。如果产品意图是"不再匹配同一人"，应延长或持久化。

### 24. `agentService.ts:110` — `getConversationHistory` 默认 limit 5000

按条数限制 5000 条对话，但 `contextLength` 字段按字符/token 限制。两者语义不一致，可能导致上下文超出 `contextLength` 限制。

---

## 📊 总结

| 类别 | 数量 | 优先级 |
|------|------|--------|
| 🔴 严重 Bug | 6 | P0 |
| 🟡 中等问题 | 5 | P1 |
| 🗑️ 史山代码 | 7 | P2 |
| 🟢 小问题 | 6 | P3 |

**建议修复顺序：**
1. 删除 `authService.ts` 重复的 `calculateAge` → import from utils
2. 删除 Redis 验证码发送限流（无效代码）
3. 删除 `logger.ts`（未被使用）
4. 删除 `now()` 函数
5. 修复管理员密钥泄露（删除 README 中的硬编码值）
6. `getAgentById` 排除 `api_key` 字段
7. `/block` `/unblock` 改用 `requireAuth` 中间件
8. `endSessionByTimer` 改用静态 import
9. `userStore.updateProfile` 改用 `apiClient`
10. 清理 `chat_messages` 表写入（无读取）
11. 统一认证方式