// 敏感词过滤和内容安全检查

// 基础敏感词库（可根据需要扩展）
const SENSITIVE_WORDS = [
  // 政治敏感
  '习近平', '李克强', '温家宝', '胡锦涛', '江泽民', '毛泽东', '邓小平',
  '共产党', '国民党', '台独', '藏独', '疆独', '香港独立', '澳门独立',
  '法轮功', 'FLG',
  // 色情相关
  '色情', '淫秽', '嫖娼', '卖淫', '强奸', '乱伦', '性奴', '裸聊', '约炮',
  // 暴力恐怖
  '杀人', '爆炸', '炸弹', '枪支', '毒品', '冰毒', '海洛因', '大麻',
  // 诈骗相关
  '诈骗', '传销', '洗钱', '赌博', '博彩', '六合彩',
  // 广告引流
  '加微信', '加QQ', '扫码', '二维码', '点击链接', '刷单', '兼职赚钱',
];

// 变体字符映射（用于绕过检测的常见手段）
const VARIANT_MAP: Record<string, string> = {
  '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
  '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
  'ａ': 'a', 'ｂ': 'b', 'ｃ': 'c', 'ｄ': 'd', 'ｅ': 'e',
  'ｆ': 'f', 'ｇ': 'g', 'ｈ': 'h', 'ｉ': 'i', 'ｊ': 'j',
  'ｋ': 'k', 'ｌ': 'l', 'ｍ': 'm', 'ｎ': 'n', 'ｏ': 'o',
  'ｐ': 'p', 'ｑ': 'q', 'ｒ': 'r', 'ｓ': 's', 'ｔ': 't',
  'ｕ': 'u', 'ｖ': 'v', 'ｗ': 'w', 'ｘ': 'x', 'ｙ': 'y', 'ｚ': 'z',
  'Ａ': 'A', 'Ｂ': 'B', 'Ｃ': 'C', 'Ｄ': 'D', 'Ｅ': 'E',
  'Ｆ': 'F', 'Ｇ': 'G', 'Ｈ': 'H', 'Ｉ': 'I', 'Ｊ': 'J',
  'Ｋ': 'K', 'Ｌ': 'L', 'Ｍ': 'M', 'Ｎ': 'N', 'Ｏ': 'O',
  'Ｐ': 'P', 'Ｑ': 'Q', 'Ｒ': 'R', 'Ｓ': 'S', 'Ｔ': 'T',
  'Ｕ': 'U', 'Ｖ': 'V', 'Ｗ': 'W', 'Ｘ': 'X', 'Ｙ': 'Y', 'Ｚ': 'Z',
  '·': '', '•': '', '‧': '', '。': '', '，': '', '、': '',
  '！': '', '？': '', '：': '', '；': '', '（': '', '）': '',
  '【': '', '】': '', '「': '', '」': '', '『': '', '』': '',
  ' ': '', '\t': '', '\n': '', '\r': '',
};

// 将文本标准化（去除变体字符和干扰符号）
function normalizeText(text: string): string {
  let normalized = text;
  for (const [variant, standard] of Object.entries(VARIANT_MAP)) {
    normalized = normalized.split(variant).join(standard);
  }
  return normalized.toLowerCase();
}

// 使用 Aho-Corasick 算法的简化版：构建 Trie 树进行多模式匹配
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEnd = false;
  word = '';
}

class SensitiveWordFilter {
  private root = new TrieNode();
  private initialized = false;

  constructor(words: string[]) {
    this.buildTrie(words);
    this.initialized = true;
  }

  private buildTrie(words: string[]) {
    for (const word of words) {
      if (!word) continue;
      let node = this.root;
      for (const char of word) {
        if (!node.children.has(char)) {
          node.children.set(char, new TrieNode());
        }
        node = node.children.get(char)!;
      }
      node.isEnd = true;
      node.word = word;
    }
  }

  // 检测文本中是否包含敏感词
  detect(text: string): { hasSensitive: boolean; words: string[]; positions: Array<{ start: number; end: number; word: string }> } {
    if (!this.initialized || !text) {
      return { hasSensitive: false, words: [], positions: [] };
    }

    const normalized = normalizeText(text);
    const positions: Array<{ start: number; end: number; word: string }> = [];
    const foundWords = new Set<string>();

    for (let i = 0; i < normalized.length; i++) {
      let node = this.root;
      for (let j = i; j < normalized.length; j++) {
        const char = normalized[j];
        if (!node.children.has(char)) break;

        node = node.children.get(char)!;
        if (node.isEnd) {
          positions.push({ start: i, end: j, word: node.word });
          foundWords.add(node.word);
        }
      }
    }

    return {
      hasSensitive: positions.length > 0,
      words: Array.from(foundWords),
      positions,
    };
  }

  // 过滤敏感词（替换为 *）
  filter(text: string, replaceChar = '*'): string {
    if (!this.initialized || !text) return text;

    const normalized = normalizeText(text);
    const result = text.split('');
    const mask = new Array(text.length).fill(false);

    // 先在标准化文本上检测位置
    for (let i = 0; i < normalized.length; i++) {
      let node = this.root;
      for (let j = i; j < normalized.length; j++) {
        const char = normalized[j];
        if (!node.children.has(char)) break;

        node = node.children.get(char)!;
        if (node.isEnd) {
          // 标记原始文本中对应位置（简化处理：假设标准化前后位置一致）
          for (let k = i; k <= j && k < text.length; k++) {
            mask[k] = true;
          }
        }
      }
    }

    // 替换被标记的字符
    for (let i = 0; i < result.length; i++) {
      if (mask[i]) {
        result[i] = replaceChar;
      }
    }

    return result.join('');
  }

  // 检查文本是否安全
  isSafe(text: string): boolean {
    return !this.detect(text).hasSensitive;
  }
}

// 全局过滤器实例
const globalFilter = new SensitiveWordFilter(SENSITIVE_WORDS);

// 导出便捷函数
export function checkSensitive(text: string) {
  return globalFilter.detect(text);
}

export function filterSensitive(text: string, replaceChar = '*') {
  return globalFilter.filter(text, replaceChar);
}

export function isSafeContent(text: string) {
  return globalFilter.isSafe(text);
}

// 聊天消息内容安全检查（综合检测）
export function checkChatMessage(text: string): { safe: boolean; reason?: string; filtered?: string } {
  if (!text || typeof text !== 'string') {
    return { safe: false, reason: '消息内容不能为空' };
  }

  // 长度检查
  if (text.length > 500) {
    return { safe: false, reason: '消息过长，最多500字' };
  }

  if (text.length === 0) {
    return { safe: false, reason: '消息内容不能为空' };
  }

  // 敏感词检测
  const sensitiveResult = checkSensitive(text);
  if (sensitiveResult.hasSensitive) {
    return {
      safe: false,
      reason: `消息包含敏感内容`,
      filtered: filterSensitive(text),
    };
  }

  // 连续数字检测（防手机号/微信号泄露）- 保留原有逻辑
  const digitMatches = text.match(/\d{8,}/g);
  if (digitMatches) {
    return {
      safe: false,
      reason: '消息中不能包含连续8位以上数字',
      filtered: text.replace(/(\d{4})\d{4,}/g, '$1****'),
    };
  }

  return { safe: true };
}

// 用户资料内容安全检查
export function checkUserProfile(profile: {
  nickname?: string;
  bio?: string;
  wechatId?: string;
}): { safe: boolean; field?: string; reason?: string } {
  if (profile.nickname) {
    const result = checkSensitive(profile.nickname);
    if (result.hasSensitive) {
      return { safe: false, field: 'nickname', reason: '昵称包含敏感内容' };
    }
    if (profile.nickname.length > 20) {
      return { safe: false, field: 'nickname', reason: '昵称过长，最多20字' };
    }
  }

  if (profile.bio) {
    const result = checkSensitive(profile.bio);
    if (result.hasSensitive) {
      return { safe: false, field: 'bio', reason: '简介包含敏感内容' };
    }
    if (profile.bio.length > 200) {
      return { safe: false, field: 'bio', reason: '简介过长，最多200字' };
    }
  }

  if (profile.wechatId) {
    const result = checkSensitive(profile.wechatId);
    if (result.hasSensitive) {
      return { safe: false, field: 'wechatId', reason: '微信号包含敏感内容' };
    }
    if (profile.wechatId.length > 50) {
      return { safe: false, field: 'wechatId', reason: '微信号过长' };
    }
  }

  return { safe: true };
}
