/**
 * Cloudflare Pages Functions - 统一 API 路由
 * 文件路径: functions/api/[[route]].js
 * 处理所有 /api/* 请求
 */

// ==================== CORS ====================
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
  'Content-Type': 'application/json; charset=utf-8',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

// ==================== 主路由 ====================
export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';
  const method = request.method;

  try {
    // ===== 系统状态 =====
    if (path === '/status' && method === 'GET') return handleStatus(env);

    // ===== 复盘 =====
    if (path === '/review' && method === 'GET') return handleReviewList(env, url);
    if (path.match(/^\/review\/\d{8}$/) && method === 'GET') {
      return handleReviewDetail(env, path.split('/')[2]);
    }
    if (path === '/cron/daily-update' && method === 'POST') {
      return handleCronDailyUpdate(env, request);
    }

    // ===== 策略 =====
    if (path === '/strategy' && method === 'GET') return handleStrategySummary(env);
    if (path.match(/^\/strategy\/(s1|s2|s3|s4|all3|any)$/) && method === 'GET') {
      return handleStrategyStocks(env, path.split('/')[2], url);
    }

    // ===== 股票详情 =====
    if (path.match(/^\/stock\/\d{6}$/) && method === 'GET') {
      return handleStockDetail(env, path.split('/')[2]);
    }
    if (path === '/stocks/batch' && method === 'POST') {
      return handleStocksBatch(env, request);
    }

    // ===== 选股列表 =====
    if (path === '/selection' && method === 'GET') return handleSelectionList(env, url);
    if (path.match(/^\/selection\/\d+$/) && method === 'GET') {
      return handleSelectionDetail(env, parseInt(path.split('/')[2]));
    }

    // ===== 上传 =====
    if (path === '/upload/strategy' && method === 'POST') {
      return handleUploadStrategy(env, request);
    }
    if (path === '/upload/selection' && method === 'POST') {
      return handleUploadSelection(env, request);
    }

    return err('Not Found', 404);
  } catch (e) {
    console.error('API Error:', e);
    return err(`Internal Error: ${e.message}`, 500);
  }
}

// ==================== 系统状态 ====================
async function handleStatus(env) {
  const latest = await env.DB.prepare(
    "SELECT date, status, updated_at FROM daily_reviews ORDER BY date DESC LIMIT 1"
  ).first();

  const stockCount = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM stocks WHERE any_hit=1"
  ).first();

  const s1 = await env.DB.prepare("SELECT COUNT(*) as n FROM stocks WHERE s1=1").first();
  const s2 = await env.DB.prepare("SELECT COUNT(*) as n FROM stocks WHERE s2=1").first();
  const s3 = await env.DB.prepare("SELECT COUNT(*) as n FROM stocks WHERE s3=1").first();
  const all3 = await env.DB.prepare("SELECT COUNT(*) as n FROM stocks WHERE all_3=1").first();

  return json({
    ok: true,
    latest_review: latest,
    strategy_stats: {
      any_hit: stockCount?.n || 0,
      s1: s1?.n || 0,
      s2: s2?.n || 0,
      s3: s3?.n || 0,
      all3: all3?.n || 0,
    },
    ts: new Date().toISOString(),
  });
}

// ==================== 复盘列表 ====================
async function handleReviewList(env, url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  const { results } = await env.DB.prepare(
    "SELECT date, title, summary, status, updated_at FROM daily_reviews ORDER BY date DESC LIMIT ? OFFSET ?"
  ).bind(limit, offset).all();

  const total = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM daily_reviews"
  ).first();

  return json({
    items: results || [],
    total: total?.n || 0,
    page,
    limit,
  });
}

// ==================== 复盘详情 ====================
async function handleReviewDetail(env, date) {
  const row = await env.DB.prepare(
    "SELECT * FROM daily_reviews WHERE date = ?"
  ).bind(date).first();

  if (!row) {
    return json({
      date,
      status: 'not_found',
      message: `${date} 暂无复盘数据`,
    });
  }

  // 解析 JSON 字段
  const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

  return json({
    ...row,
    indices: parse(row.indices_json),
    limits: parse(row.limits_json),
    emotion: parse(row.emotion_json),
    sectors: parse(row.sectors_json),
    board: parse(row.board_json),
    chart_history: parse(row.chart_history_json),
  });
}

// ==================== 每日自动更新（Cron 触发）====================
async function handleCronDailyUpdate(env, request) {
  // 验证 Admin Key
  const adminKey = request.headers.get('X-Admin-Key');
  if (env.ADMIN_KEY && adminKey !== env.ADMIN_KEY) {
    return err('Unauthorized', 401);
  }

  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const today = dateParam || getTodayCST();

  try {
    const result = await fetchAndStoreDailyData(env, today);
    return json(result);
  } catch (e) {
    return err(`Update failed: ${e.message}`, 500);
  }
}

// ==================== 策略汇总 ====================
async function handleStrategySummary(env) {
  const stats = await env.DB.prepare(`
    SELECT 
      SUM(s1) as s1_count,
      SUM(s2) as s2_count,
      SUM(s3) as s3_count,
      SUM(s4) as s4_count,
      SUM(all_3) as all3_count,
      SUM(any_hit) as any_count,
      MAX(updated_at) as last_updated,
      MAX(data_version) as data_version
    FROM stocks
  `).first();

  const sample_all3 = await env.DB.prepare(
    "SELECT code, name, industry FROM stocks WHERE all_3=1 LIMIT 5"
  ).all();

  return json({
    counts: stats || {},
    sample_all3: sample_all3.results || [],
  });
}

// ==================== 策略股票列表 ====================
async function handleStrategyStocks(env, strategy, url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200);
  const offset = (page - 1) * limit;
  const sort = url.searchParams.get('sort') || 'code';
  const order = url.searchParams.get('order') === 'desc' ? 'DESC' : 'ASC';

  const colMap = {
    s1: 's1=1',
    s2: 's2=1',
    s3: 's3=1',
    s4: 's4=1',
    all3: 'all_3=1',
    any: 'any_hit=1',
  };

  const where = colMap[strategy];
  if (!where) return err('Invalid strategy', 400);

  const validSorts = ['code', 'name', 'industry', 'quality_count'];
  const sortCol = validSorts.includes(sort) ? sort : 'code';

  const { results } = await env.DB.prepare(
    `SELECT code, name, industry, s1, s2, s3, s4, all_3, any_hit,
            quality_count, k_acc, y_acc, s1_sub, concepts, pe, market_cap
     FROM stocks WHERE ${where}
     ORDER BY ${sortCol} ${order}
     LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();

  const total = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM stocks WHERE ${where}`
  ).first();

  return json({
    strategy,
    items: results || [],
    total: total?.n || 0,
    page,
    limit,
  });
}

// ==================== 股票详情 ====================
async function handleStockDetail(env, code) {
  const row = await env.DB.prepare(
    "SELECT * FROM stocks WHERE code = ?"
  ).bind(code).first();

  if (!row) return err(`股票 ${code} 不在策略库中`, 404);

  const strategies = [];
  if (row.all_3) strategies.push({ name: '三合一', color: 'gold' });
  if (row.s1) strategies.push({ name: '持股增长', color: 'blue' });
  if (row.s2) strategies.push({ name: '盈利质量', color: 'green' });
  if (row.s3) strategies.push({ name: '全速前进', color: 'red' });
  if (row.s4) strategies.push({ name: '机构持股', color: 'purple' });

  const parse = (s) => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

  return json({
    code: row.code,
    name: row.name,
    industry: row.industry,
    strategies,
    s1: !!row.s1, s2: !!row.s2, s3: !!row.s3, s4: !!row.s4,
    all_3: !!row.all_3, any_hit: !!row.any_hit,
    // S1 详情
    s1_detail: {
      top10_26q1: row.top10_26q1, top10_25q4: row.top10_25q4,
      top10_25q3: row.top10_25q3, top10_25q2: row.top10_25q2,
      top10_25q1: row.top10_25q1, top10_24q4: row.top10_24q4,
      delta_26q1: row.delta_26q1, delta_25q4: row.delta_25q4,
      delta_25q3: row.delta_25q3, s1_sub: !!row.s1_sub,
    },
    // S2 详情
    s2_detail: {
      roe: [row.roe_25, row.roe_24, row.roe_23, row.roe_22],
      margin: [row.margin_25, row.margin_24, row.margin_23, row.margin_22],
      net_profit: [row.net_profit_25, row.net_profit_24, row.net_profit_23, row.net_profit_22],
      roe_up: !!row.roe_up, m_up: !!row.m_up, k_up: !!row.k_up,
      quality_count: row.quality_count,
    },
    // S3 详情
    s3_detail: {
      revenue: [row.revenue_25, row.revenue_24, row.revenue_23, row.revenue_22, row.revenue_21],
      k_profit: [row.k_profit_25, row.k_profit_24, row.k_profit_23, row.k_profit_22, row.k_profit_21],
      k_acc: !!row.k_acc, y_acc: !!row.y_acc,
    },
    // 基础信息
    main_business: row.main_business,
    concepts: parse(row.concepts),
    pe: row.pe, pb: row.pb,
    market_cap: row.market_cap,
    data_version: row.data_version,
    updated_at: row.updated_at,
  });
}

// ==================== 批量查询股票 ====================
async function handleStocksBatch(env, request) {
  const body = await request.json();
  const codes = body.codes || [];
  if (!codes.length) return err('codes cannot be empty');
  if (codes.length > 500) return err('Too many codes (max 500)');

  const placeholders = codes.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT code, name, industry, s1, s2, s3, s4, all_3, any_hit, concepts
     FROM stocks WHERE code IN (${placeholders})`
  ).bind(...codes).all();

  const map = {};
  for (const r of (results || [])) map[r.code] = r;
  return json({ stocks: map });
}

// ==================== 选股列表 ====================
async function handleSelectionList(env, url) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  const { results } = await env.DB.prepare(
    "SELECT * FROM selection_lists ORDER BY created_at DESC LIMIT ? OFFSET ?"
  ).bind(limit, offset).all();

  const total = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM selection_lists"
  ).first();

  return json({
    items: results || [],
    total: total?.n || 0,
    page,
    limit,
  });
}

async function handleSelectionDetail(env, listId) {
  const list = await env.DB.prepare(
    "SELECT * FROM selection_lists WHERE id = ?"
  ).bind(listId).first();

  if (!list) return err('列表不存在', 404);

  const { results: stocks } = await env.DB.prepare(
    "SELECT * FROM selection_stocks WHERE list_id = ? ORDER BY any_hit DESC, code ASC"
  ).bind(listId).all();

  const parse = (s) => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

  return json({
    ...list,
    stocks: (stocks || []).map(s => ({ ...s, concepts_arr: parse(s.concepts) })),
  });
}

// ==================== 上传策略 Excel（接收解析后的 JSON）====================
async function handleUploadStrategy(env, request) {
  const adminKey = request.headers.get('X-Admin-Key');
  if (env.ADMIN_KEY && adminKey !== env.ADMIN_KEY) {
    return err('Unauthorized', 401);
  }

  const body = await request.json();
  const { stocks, data_version } = body;

  if (!stocks || !Array.isArray(stocks)) {
    return err('Invalid data: stocks array required');
  }

  const version = data_version || new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  let inserted = 0, updated = 0;

  // 批量插入/更新（D1 限制每次 max 100 语句，分批处理）
  const BATCH_SIZE = 50;
  for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
    const batch = stocks.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(s => {
      return env.DB.prepare(`
        INSERT INTO stocks (
          code, name, industry,
          s1, s2, s3, s4, all_3, any_hit,
          top10_26q1, top10_25q4, top10_25q3, top10_25q2, top10_25q1, top10_24q4,
          delta_26q1, delta_25q4, delta_25q3, s1_sub,
          roe_25, roe_24, roe_23, roe_22,
          margin_25, margin_24, margin_23, margin_22,
          net_profit_25, net_profit_24, net_profit_23, net_profit_22,
          roe_up, m_up, k_up, quality_count,
          revenue_25, revenue_24, revenue_23, revenue_22, revenue_21,
          k_profit_25, k_profit_24, k_profit_23, k_profit_22, k_profit_21,
          k_acc, y_acc,
          inst_26q1, inst_25q4, inst_25q3, inst_25q2, inst_d1, inst_d2, inst_d3, s4_sub,
          main_business, concepts, pe, pb, market_cap,
          data_version, updated_at
        ) VALUES (
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?
        )
        ON CONFLICT(code) DO UPDATE SET
          name=excluded.name, industry=excluded.industry,
          s1=excluded.s1, s2=excluded.s2, s3=excluded.s3, s4=excluded.s4,
          all_3=excluded.all_3, any_hit=excluded.any_hit,
          top10_26q1=excluded.top10_26q1, top10_25q4=excluded.top10_25q4,
          top10_25q3=excluded.top10_25q3, top10_25q2=excluded.top10_25q2,
          top10_25q1=excluded.top10_25q1, top10_24q4=excluded.top10_24q4,
          delta_26q1=excluded.delta_26q1, delta_25q4=excluded.delta_25q4,
          delta_25q3=excluded.delta_25q3, s1_sub=excluded.s1_sub,
          roe_25=excluded.roe_25, roe_24=excluded.roe_24,
          roe_23=excluded.roe_23, roe_22=excluded.roe_22,
          margin_25=excluded.margin_25, margin_24=excluded.margin_24,
          margin_23=excluded.margin_23, margin_22=excluded.margin_22,
          net_profit_25=excluded.net_profit_25, net_profit_24=excluded.net_profit_24,
          net_profit_23=excluded.net_profit_23, net_profit_22=excluded.net_profit_22,
          roe_up=excluded.roe_up, m_up=excluded.m_up, k_up=excluded.k_up,
          quality_count=excluded.quality_count,
          revenue_25=excluded.revenue_25, revenue_24=excluded.revenue_24,
          revenue_23=excluded.revenue_23, revenue_22=excluded.revenue_22,
          revenue_21=excluded.revenue_21,
          k_profit_25=excluded.k_profit_25, k_profit_24=excluded.k_profit_24,
          k_profit_23=excluded.k_profit_23, k_profit_22=excluded.k_profit_22,
          k_profit_21=excluded.k_profit_21,
          k_acc=excluded.k_acc, y_acc=excluded.y_acc,
          inst_26q1=excluded.inst_26q1, inst_25q4=excluded.inst_25q4,
          inst_25q3=excluded.inst_25q3, inst_25q2=excluded.inst_25q2,
          inst_d1=excluded.inst_d1, inst_d2=excluded.inst_d2, inst_d3=excluded.inst_d3,
          s4_sub=excluded.s4_sub,
          main_business=excluded.main_business, concepts=excluded.concepts,
          pe=excluded.pe, pb=excluded.pb, market_cap=excluded.market_cap,
          data_version=excluded.data_version, updated_at=excluded.updated_at
      `).bind(
        s.code, s.name || '', s.industry || null,
        s.s1 ? 1 : 0, s.s2 ? 1 : 0, s.s3 ? 1 : 0, s.s4 ? 1 : 0,
        s.all_3 ? 1 : 0, s.any_hit ? 1 : 0,
        s.top10_26q1 ?? null, s.top10_25q4 ?? null, s.top10_25q3 ?? null,
        s.top10_25q2 ?? null, s.top10_25q1 ?? null, s.top10_24q4 ?? null,
        s.delta_26q1 ?? null, s.delta_25q4 ?? null, s.delta_25q3 ?? null,
        s.s1_sub ? 1 : 0,
        s.roe_25 ?? null, s.roe_24 ?? null, s.roe_23 ?? null, s.roe_22 ?? null,
        s.margin_25 ?? null, s.margin_24 ?? null, s.margin_23 ?? null, s.margin_22 ?? null,
        s.net_profit_25 ?? null, s.net_profit_24 ?? null, s.net_profit_23 ?? null, s.net_profit_22 ?? null,
        s.roe_up ? 1 : 0, s.m_up ? 1 : 0, s.k_up ? 1 : 0,
        s.quality_count ?? 0,
        s.revenue_25 ?? null, s.revenue_24 ?? null, s.revenue_23 ?? null,
        s.revenue_22 ?? null, s.revenue_21 ?? null,
        s.k_profit_25 ?? null, s.k_profit_24 ?? null, s.k_profit_23 ?? null,
        s.k_profit_22 ?? null, s.k_profit_21 ?? null,
        s.k_acc ? 1 : 0, s.y_acc ? 1 : 0,
        s.inst_26q1 ?? null, s.inst_25q4 ?? null, s.inst_25q3 ?? null, s.inst_25q2 ?? null,
        s.inst_d1 ?? null, s.inst_d2 ?? null, s.inst_d3 ?? null, s.s4_sub ? 1 : 0,
        s.main_business ?? null,
        Array.isArray(s.concepts) ? JSON.stringify(s.concepts) : (s.concepts ?? null),
        s.pe ?? null, s.pb ?? null, s.market_cap ?? null,
        version, now
      );
    });

    await env.DB.batch(stmts);
    inserted += batch.length;
  }

  return json({
    ok: true,
    processed: inserted,
    data_version: version,
    message: `成功导入 ${inserted} 条策略数据`,
  });
}

// ==================== 上传选股列表（接收解析后的 JSON）====================
async function handleUploadSelection(env, request) {
  const body = await request.json();
  const { date, filename, list_name, stocks } = body;

  if (!stocks || !Array.isArray(stocks)) {
    return err('Invalid data: stocks array required');
  }

  const today = date || getTodayCST();
  const name = list_name || filename?.replace(/\.[^.]+$/, '') || '未命名列表';

  // 获取策略信息
  const codes = stocks.map(s => s.code).filter(Boolean);
  if (!codes.length) return err('No valid stock codes');

  const placeholders = codes.map(() => '?').join(',');
  const { results: strategyData } = await env.DB.prepare(
    `SELECT code, name as sname, s1, s2, s3, s4, all_3, any_hit, concepts
     FROM stocks WHERE code IN (${placeholders})`
  ).bind(...codes).all();

  const strategyMap = {};
  for (const r of (strategyData || [])) strategyMap[r.code] = r;

  // 插入列表记录
  const now = new Date().toISOString();
  const listResult = await env.DB.prepare(
    "INSERT INTO selection_lists (date, filename, list_name, total_count, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id"
  ).bind(today, filename || null, name, codes.length, now).first();

  const listId = listResult?.id;
  if (!listId) return err('Failed to create list');

  // 插入股票
  const stockStmts = stocks.map(s => {
    const sd = strategyMap[s.code] || {};
    return env.DB.prepare(`
      INSERT INTO selection_stocks (list_id, code, name, s1, s2, s3, s4, all_3, any_hit, pct_change, concepts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      listId, s.code, s.name || sd.sname || '',
      sd.s1 || 0, sd.s2 || 0, sd.s3 || 0, sd.s4 || 0,
      sd.all_3 || 0, sd.any_hit || 0,
      s.pct_change ?? null,
      sd.concepts || null
    );
  });

  const BATCH_SIZE = 50;
  for (let i = 0; i < stockStmts.length; i += BATCH_SIZE) {
    await env.DB.batch(stockStmts.slice(i, i + BATCH_SIZE));
  }

  // 更新命中数量
  const matched = stocks.filter(s => strategyMap[s.code]?.any_hit).length;
  await env.DB.prepare(
    "UPDATE selection_lists SET strategy_matched = ? WHERE id = ?"
  ).bind(matched, listId).run();

  return json({
    ok: true,
    list_id: listId,
    total: codes.length,
    matched,
    message: `已上传 ${codes.length} 只股票，命中策略 ${matched} 只`,
  });
}

// ==================== 每日数据获取核心逻辑 ====================
async function fetchAndStoreDailyData(env, dateStr) {
  const apiBase = env.JIUKUAN_API_BASE || 'https://9quant.online';
  const apiKey = env.JIUKUAN_API_KEY;
  const headers = { 'X-API-Key': apiKey, 'User-Agent': 'StrategyReview/1.0' };

  // 格式化日期
  const dashDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
  const fetchTimeout = 15000;

  const fetchJson = async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), fetchTimeout);
    try {
      const resp = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  };

  let indices = null, upLimits = null, downLimits = null, emotion = null, sectors = null;
  let failCount = 0;

  // 并行获取所有数据
  const results = await Promise.allSettled([
    fetchJson(`${apiBase}/api/v1/big-index/?date=${dateStr}`),
    fetchJson(`${apiBase}/api/v1/limit?type=U&date=${dashDate}`),
    fetchJson(`${apiBase}/api/v1/limit?type=D&date=${dashDate}`),
    fetchJson(`${apiBase}/api/v1/daily/?date=${dateStr}`),
    fetchJson(`${apiBase}/api/v1/ths-mainstream/?date=${dateStr}`),
  ]);

  if (results[0].status === 'fulfilled') {
    indices = results[0].value?.data?.index_data || null;
  } else { failCount++; }

  if (results[1].status === 'fulfilled') {
    upLimits = results[1].value?.data?.limit_data || null;
  } else { failCount++; }

  if (results[2].status === 'fulfilled') {
    downLimits = results[2].value?.data?.limit_data || null;
  } else { failCount++; }

  if (results[3].status === 'fulfilled') {
    emotion = results[3].value?.data?.[0] || null;
  } else { failCount++; }

  if (results[4].status === 'fulfilled') {
    sectors = results[4].value?.data?.ths_data?.slice(0, 5) || null;
  } else { failCount++; }

  // 计算状态
  let status = 'published';
  if (failCount === 5) status = 'failed';
  else if (failCount > 0) status = 'partial';

  // 构建板块成分股数据（含策略标注）
  let boardData = null;
  if (sectors && sectors.length > 0) {
    boardData = await enrichSectorsWithStrategies(env, sectors);
  }

  // 构建基本数据
  const title = formatDateTitle(dateStr);
  const now = new Date().toISOString();

  // 写入数据库
  await env.DB.prepare(`
    INSERT INTO daily_reviews (
      date, title, summary,
      indices_json, limits_json, emotion_json, sectors_json, board_json,
      status, update_source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'cron', ?, ?)
    ON CONFLICT(date) DO UPDATE SET
      indices_json = excluded.indices_json,
      limits_json = excluded.limits_json,
      emotion_json = excluded.emotion_json,
      sectors_json = excluded.sectors_json,
      board_json = excluded.board_json,
      status = excluded.status,
      update_source = excluded.update_source,
      updated_at = excluded.updated_at
  `).bind(
    dateStr,
    title,
    generateSummary(indices, emotion, status),
    indices ? JSON.stringify(indices) : null,
    JSON.stringify({ up: upLimits, down: downLimits }),
    emotion ? JSON.stringify(emotion) : null,
    sectors ? JSON.stringify(sectors) : null,
    boardData ? JSON.stringify(boardData) : null,
    status,
    now, now
  ).run();

  return {
    ok: true,
    date: dateStr,
    status,
    fail_count: failCount,
    has_sectors: !!sectors,
    message: statusMessage(status),
  };
}

// 为板块成分股添加策略标注
async function enrichSectorsWithStrategies(env, sectors) {
  // 收集所有股票代码
  const allCodes = [];
  for (const sector of sectors) {
    const stocks = sector.stocks || sector.stock_list || [];
    for (const s of stocks) {
      if (s.code || s.ts_code) allCodes.push((s.code || s.ts_code).replace('.SZ', '').replace('.SH', ''));
    }
  }

  if (!allCodes.length) return sectors;

  const uniq = [...new Set(allCodes)];
  const placeholders = uniq.map(() => '?').join(',');
  const { results } = await env.DB.prepare(
    `SELECT code, s1, s2, s3, all_3, any_hit FROM stocks WHERE code IN (${placeholders})`
  ).bind(...uniq).all();

  const stratMap = {};
  for (const r of (results || [])) stratMap[r.code] = r;

  return sectors.map(sector => {
    const rawStocks = sector.stocks || sector.stock_list || [];
    const enriched = rawStocks.slice(0, 8).map(s => {
      const code = (s.code || s.ts_code || '').replace('.SZ', '').replace('.SH', '');
      const sd = stratMap[code] || {};
      const strategies = [];
      if (sd.all_3) strategies.push('三合一');
      if (sd.s1) strategies.push('持股增长');
      if (sd.s2) strategies.push('盈利质量');
      if (sd.s3) strategies.push('全速前进');
      return {
        code,
        name: s.name || s.ts_name || '',
        pct: s.pct_chg || s.change || s.pct || 0,
        price: s.close || s.price || null,
        strategies,
        s1: !!sd.s1, s2: !!sd.s2, s3: !!sd.s3, all_3: !!sd.all_3,
      };
    });

    return {
      name: sector.name || sector.ts_name || sector.board_name || '',
      changePct: sector.pct_chg || sector.change || sector.pct || 0,
      stocks: enriched,
    };
  });
}

// ==================== 辅助函数 ====================
function getTodayCST() {
  const now = new Date();
  // UTC+8
  const cst = new Date(now.getTime() + 8 * 3600 * 1000);
  return cst.toISOString().slice(0, 10).replace(/-/g, '');
}

function formatDateTitle(dateStr) {
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  return `市场复盘 ${y}年${m}月${d}日`;
}

function generateSummary(indices, emotion, status) {
  if (status === 'failed') return '数据获取失败，请稍后查看';
  if (!indices) return '市场数据获取中...';
  const sh = indices.find(i => i.ts_code === '000001.SH');
  if (!sh) return '今日行情数据已更新';
  const pct = parseFloat(sh.pct_chg || 0).toFixed(2);
  const arrow = pct >= 0 ? '▲' : '▼';
  return `上证指数 ${arrow} ${Math.abs(pct)}%，详情见复盘`;
}

function statusMessage(status) {
  const map = {
    published: '✅ 数据更新完成',
    partial: '⚠️ 部分数据更新',
    draft: '⏳ 数据还未更新',
    failed: '❌ 数据获取失败',
  };
  return map[status] || status;
}
