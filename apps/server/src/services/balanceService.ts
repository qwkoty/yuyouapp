import { getAgentById } from './agentService';
import redis from '../lib/redis';

export interface BalanceInfo {
  provider: string;
  balance: number | null;
  currency: string;
  used: number | null;
  total: number | null;
  // 缓存统计
  cache_hit_tokens: number;
  cache_miss_tokens: number;
  cache_total_tokens: number;
  hit_rate: number;
  miss_rate: number;
  total_calls: number;
}

async function getCacheStats(agentId: string): Promise<{
  cache_hit_tokens: number;
  cache_miss_tokens: number;
  total_calls: number;
}> {
  try {
    const key = `agent_cache:${agentId}`;
    const data = await redis.hgetall(key);
    return {
      cache_hit_tokens: Number(data?.cache_hit) || 0,
      cache_miss_tokens: Number(data?.cache_miss) || 0,
      total_calls: Number(data?.total_calls) || 0,
    };
  } catch {
    return { cache_hit_tokens: 0, cache_miss_tokens: 0, total_calls: 0 };
  }
}

function buildRate(hit: number, miss: number): { hit_rate: number; miss_rate: number; total: number } {
  const total = hit + miss;
  if (total === 0) return { hit_rate: 0, miss_rate: 0, total: 0 };
  return {
    hit_rate: Math.round((hit / total) * 1000) / 10, // 保留1位小数
    miss_rate: Math.round((miss / total) * 1000) / 10,
    total,
  };
}

export async function getAgentBalance(agentId: string): Promise<BalanceInfo> {
  const agent = await getAgentById(agentId);
  if (!agent) throw new Error('智能体不存在');

  // 缓存统计（任何 provider 都有）
  const cacheStats = await getCacheStats(agentId);
  const rates = buildRate(cacheStats.cache_hit_tokens, cacheStats.cache_miss_tokens);

  // 如果没配置 API Key，直接返回缓存统计
  if (!agent.api_key) {
    return {
      provider: agent.api_provider,
      balance: null,
      currency: agent.api_provider === 'openai' ? 'USD' : 'CNY',
      used: null,
      total: null,
      cache_hit_tokens: cacheStats.cache_hit_tokens,
      cache_miss_tokens: cacheStats.cache_miss_tokens,
      cache_total_tokens: rates.total,
      hit_rate: rates.hit_rate,
      miss_rate: rates.miss_rate,
      total_calls: cacheStats.total_calls,
    };
  }

  // 确定 API URL
  let apiUrl = agent.api_url;
  if (agent.api_provider === 'deepseek') {
    apiUrl = apiUrl || 'https://api.deepseek.com';
  } else if (agent.api_provider === 'openai') {
    apiUrl = apiUrl || 'https://api.openai.com';
  } else if (agent.api_provider === 'nvidia') {
    apiUrl = apiUrl || 'https://integrate.api.nvidia.com/v1';
  }

  let balance: number | null = null;
  let currency = 'CNY';
  let used: number | null = null;
  let total: number | null = null;
  let provider = agent.api_provider;

  if (apiUrl) {
    try {
      if (agent.api_provider === 'deepseek') {
        const res = await fetch(`${apiUrl}/user/balance`, {
          headers: { 'Authorization': `Bearer ${agent.api_key}` },
        });
        if (res.ok) {
          const data = await res.json() as any;
          const info = data?.balance_infos?.[0];
          balance = info?.total_balance ? parseFloat(info.total_balance) : null;
          const granted = info?.granted ? parseFloat(info.granted) : null;
          total = granted;
          if (granted !== null && balance !== null) {
            used = Math.max(0, granted - balance);
          }
          currency = 'CNY';
          provider = 'deepseek';
        }
      } else if (agent.api_provider === 'openai') {
        currency = 'USD';
        provider = 'openai';
      } else if (agent.api_provider === 'nvidia') {
        currency = 'CNY';
        provider = 'nvidia';
      } else {
        // 自定义 provider
        const res = await fetch(`${apiUrl}/user/balance`, {
          headers: { 'Authorization': `Bearer ${agent.api_key}` },
        }).catch(() => null);
        if (res && res.ok) {
          const data = await res.json() as any;
          const info = data?.balance_infos?.[0];
          balance = info?.total_balance ? parseFloat(info.total_balance) : (data?.balance || null);
          total = info?.granted ? parseFloat(info.granted) : null;
          used = info?.used ? parseFloat(info.used) : null;
          currency = data?.currency || 'CNY';
          provider = 'custom';
        }
      }
    } catch (err) {
      // 查询失败不影响缓存统计
      console.error('[Balance] 查询失败:', err);
    }
  }

  return {
    provider,
    balance,
    currency,
    used,
    total,
    cache_hit_tokens: cacheStats.cache_hit_tokens,
    cache_miss_tokens: cacheStats.cache_miss_tokens,
    cache_total_tokens: rates.total,
    hit_rate: rates.hit_rate,
    miss_rate: rates.miss_rate,
    total_calls: cacheStats.total_calls,
  };
}
