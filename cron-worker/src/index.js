/**
 * Cloudflare Cron Worker - 每日自动更新触发器
 *
 * 每交易日 17:00-23:30 CST (09:00-15:30 UTC) 每 30 分钟触发一次。
 * 若当日数据已发布 (status='published')，则跳过；否则调用 Pages API 拉取数据。
 * 这样即使第一次触发时 A 股行情尚未收盘，后续会自动重试，直到数据完整为止。
 */

export default {
  // 定时触发
  async scheduled(event, env, ctx) {
    const pagesBase = env.PAGES_BASE_URL || 'https://strategy-review.pages.dev';
    const adminKey = env.ADMIN_KEY || '';

    // 计算当前 CST 日期 (UTC+8)
    const now = new Date();
    const cst = new Date(now.getTime() + 8 * 3600 * 1000);
    const dateStr = cst.toISOString().slice(0, 10).replace(/-/g, '');

    // 跳过周末
    const weekday = cst.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      console.log(`[Cron] Skip weekend: ${dateStr}`);
      return;
    }

    // 检查今日数据是否已完整发布
    try {
      const checkResp = await fetch(`${pagesBase}/api/review/${dateStr}`);
      if (checkResp.ok) {
        const existing = await checkResp.json();
        if (existing && existing.status === 'published' && existing.indices_json) {
          console.log(`[Cron] ${dateStr} already published, skipping.`);
          return;
        }
      }
    } catch (e) {
      // 检查失败不阻塞主流程，继续尝试更新
      console.warn(`[Cron] Check failed: ${e.message}`);
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
        schedule: '交易日 17:00-23:30 CST 每 30 分钟 (09:00-15:30 UTC)',
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Method Not Allowed', { status: 405 });
  },
};

