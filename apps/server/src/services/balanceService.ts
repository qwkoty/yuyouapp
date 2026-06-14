import { getAgentById } from './agentService';

interface BalanceInfo {
  provider: string;
  balance: number | null;
  currency: string;
  used: number | null;
  total: number | null;
}

export async function getAgentBalance(agentId: string): Promise<BalanceInfo> {
  const agent = await getAgentById(agentId);
  if (!agent) throw new Error('智能体不存在');
  if (!agent.api_key) throw new Error('请先配置API Key');

  let apiUrl = agent.api_url;
  if (agent.api_provider === 'deepseek') {
    apiUrl = apiUrl || 'https://api.deepseek.com';
  } else if (agent.api_provider === 'openai') {
    apiUrl = apiUrl || 'https://api.openai.com';
  }
  if (!apiUrl) throw new Error('请配置API地址');

  try {
    if (agent.api_provider === 'deepseek') {
      // DeepSeek 余额接口
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${apiUrl}/user/balance`, {
        headers: { 'Authorization': `Bearer ${agent.api_key}` },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
      if (!res.ok) throw new Error(`API返回 ${res.status}`);
      const data = await res.json() as any;
      const balanceInfos = data?.balance_infos?.[0];
      return {
        provider: 'deepseek',
        balance: balanceInfos?.total_balance ? parseFloat(balanceInfos.total_balance) : null,
        currency: 'CNY',
        used: balanceInfos?.granted ? parseFloat(balanceInfos.granted) - parseFloat(balanceInfos?.total_balance || '0') : null,
        total: balanceInfos?.granted ? parseFloat(balanceInfos.granted) : null,
      };
    } else if (agent.api_provider === 'openai') {
      // OpenAI 没有公开余额查询接口，返回提示
      return {
        provider: 'openai',
        balance: null,
        currency: 'USD',
        used: null,
        total: null,
      };
    } else {
      // 自定义 provider，尝试通用 /dashboard/billing/credit_grants 或 /user/balance
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${apiUrl}/user/balance`, {
        headers: { 'Authorization': `Bearer ${agent.api_key}` },
        signal: controller.signal,
      }).catch(() => null).finally(() => clearTimeout(timeoutId));

      if (res && res.ok) {
        const data = await res.json() as any;
        const balanceInfos = data?.balance_infos?.[0];
        return {
          provider: 'custom',
          balance: balanceInfos?.total_balance ? parseFloat(balanceInfos.total_balance) : (data?.balance || data?.total || null),
          currency: data?.currency || 'CNY',
          used: balanceInfos?.used ? parseFloat(balanceInfos.used) : null,
          total: balanceInfos?.granted ? parseFloat(balanceInfos.granted) : null,
        };
      }

      return {
        provider: 'custom',
        balance: null,
        currency: 'CNY',
        used: null,
        total: null,
      };
    }
  } catch (err: any) {
    return {
      provider: agent.api_provider,
      balance: null,
      currency: agent.api_provider === 'openai' ? 'USD' : 'CNY',
      used: null,
      total: null,
    };
  }
}
