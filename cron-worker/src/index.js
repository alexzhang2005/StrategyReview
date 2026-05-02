/**
 * Cloudflare Cron Worker - 每日自动更新触发器
 * 
 * 每个交易日 18:00 CST（10:00 UTC）自动触发
 * 调用 Pages Functions API 执行实际的数据更新逻辑
 */

export default {
  // 定时触发
  async scheduled(event, env, ctx) {
    const pagesBase = env.PAGES_BASE_URL || 'https://strategy-review.pages.dev';
    const adminKey = env.ADMIN_KEY || '';

    // 计算今天的日期（CST UTC+8）
    const now = new Date();
    const cst = new Date(now.getTime() + 8 * 3600 * 1000);
    const dateStr = cst.toISOString().slice(0, 10).replace(/-/g, '');

    // 跳过周末（1=Mon...5=Fri, 6=Sat, 0=Sun）
    const weekday = cst.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      console.log(`[Cron] Skip weekend: ${dateStr}`);
      return;
    }

    console.log(`[Cron] Triggering daily update for ${dateStr}...`);

    try {
      const resp = await fetch(
        `${pagesBase}/api/cron/daily-update?date=${dateStr}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Key': adminKey,
          },
        }
      );

      const result = await resp.json();
      console.log(`[Cron] Result for ${dateStr}:`, JSON.stringify(result));
    } catch (e) {
      console.error(`[Cron] Error: ${e.message}`);
    }
  },

  // HTTP 请求（手动触发测试）
  async fetch(request, env, ctx) {
    if (request.method === 'GET') {
      return new Response(JSON.stringify({
        name: 'strategy-review-cron',
        status: 'running',
        schedule: '每交易日 18:00 CST (10:00 UTC)',
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Method Not Allowed', { status: 405 });
  },
};
