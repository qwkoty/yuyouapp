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

function log(level: LogLevel, tag: string, msg: string, data?: any) {
  if (!shouldLog(level)) return;
  const line = format(level, tag, msg, data);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (tag: string, msg: string, data?: any) => log('debug', tag, msg, data),
  info: (tag: string, msg: string, data?: any) => log('info', tag, msg, data),
  warn: (tag: string, msg: string, data?: any) => log('warn', tag, msg, data),
  error: (tag: string, msg: string, data?: any) => log('error', tag, msg, data),
};

export default logger;
