import fs from 'fs';
import path from 'path';

// 轻量级日志系统（不依赖第三方库）
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m', // 灰
  info: '\x1b[36m',  // 青
  warn: '\x1b[33m',  // 黄
  error: '\x1b[31m', // 红
};
const RESET = '\x1b[0m';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

// 日志文件配置
const LOG_DIR = process.env.LOG_DIR || path.join(process.cwd(), 'logs');
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
let logFilePath: string | null = null;
let currentLogSize = 0;

// 确保日志目录存在
function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch {
    // 目录创建失败时静默处理
  }
}

// 获取当前日志文件路径
function getLogFilePath(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `yuyou-${date}.log`);
}

// 写入日志文件
function writeToFile(line: string) {
  try {
    ensureLogDir();
    const filePath = getLogFilePath();

    // 如果日期变化，重置文件大小计数
    if (logFilePath !== filePath) {
      logFilePath = filePath;
      currentLogSize = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    }

    // 检查文件大小，超过限制则轮转
    const lineBytes = Buffer.byteLength(line + '\n', 'utf8');
    if (currentLogSize + lineBytes > MAX_LOG_SIZE) {
      const backupPath = `${filePath}.1`;
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
      if (fs.existsSync(filePath)) fs.renameSync(filePath, backupPath);
      currentLogSize = 0;
    }

    fs.appendFileSync(filePath, line + '\n');
    currentLogSize += lineBytes;
  } catch {
    // 文件写入失败时静默处理，不影响控制台输出
  }
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[MIN_LEVEL];
}

function format(level: LogLevel, tag: string, msg: string, data?: any): string {
  const time = new Date().toISOString();
  const color = COLORS[level];
  let line = `${color}[${time}] [${level.toUpperCase()}]${RESET} [${tag}] ${msg}`;
  if (data !== undefined) {
    if (data instanceof Error) {
      line += `\n${data.stack || data.message}`;
    } else if (typeof data === 'object') {
      try {
        line += ` ${JSON.stringify(data)}`;
      } catch {
        line += ` [无法序列化]`;
      }
    } else {
      line += ` ${data}`;
    }
  }
  return line;
}

// 纯文本格式（用于文件写入，不含颜色代码）
const SENSITIVE_KEYS = ['apiKey', 'api_key', 'token', 'password', 'secret', 'jwt', 'authorization', 'phone', 'code'];

function maskSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (obj instanceof Error) return obj.message;
  const masked: any = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(sk => lowerKey.includes(sk))) {
      masked[key] = '***';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      masked[key] = maskSensitiveData(obj[key]);
    } else {
      masked[key] = obj[key];
    }
  }
  return masked;
}

function formatPlain(level: LogLevel, tag: string, msg: string, data?: any): string {
  const time = new Date().toISOString();
  let line = `[${time}] [${level.toUpperCase()}] [${tag}] ${msg}`;
  if (data !== undefined) {
    if (data instanceof Error) {
      line += `\n${data.stack || data.message}`;
    } else if (typeof data === 'object') {
      try {
        line += ` ${JSON.stringify(maskSensitiveData(data))}`;
      } catch {
        line += ` [无法序列化]`;
      }
    } else {
      line += ` ${data}`;
    }
  }
  return line;
}

function log(level: LogLevel, tag: string, msg: string, data?: any) {
  if (!shouldLog(level)) return;
  const line = format(level, tag, msg, data);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);

  // 同时写入文件（error 和 warn 级别始终写入，info 在生产环境写入）
  if (level === 'error' || level === 'warn' || (level === 'info' && process.env.NODE_ENV === 'production')) {
    writeToFile(formatPlain(level, tag, msg, data));
  }
}

export const logger = {
  debug: (tag: string, msg: string, data?: any) => log('debug', tag, msg, data),
  info: (tag: string, msg: string, data?: any) => log('info', tag, msg, data),
  warn: (tag: string, msg: string, data?: any) => log('warn', tag, msg, data),
  error: (tag: string, msg: string, data?: any) => log('error', tag, msg, data),
};

export default logger;
