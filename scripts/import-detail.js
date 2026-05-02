/**
 * import-detail.js — 导入 stock_detail_data.json 到 D1
 * 同时从 strategy_pool.json 合并策略标记，避免覆盖 s1/s2/s3
 * 用法: node scripts/import-detail.js
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const ADMIN_KEY = 'sr_admin_92411_20260502';
const API_BASE = 'https://strategy-review.pages.dev';
const DETAIL_PATH = path.resolve(__dirname, '../../Strategy Review/参考文档/每日复盘/stock_detail_data.json');
const STRATEGY_PATH = path.resolve(__dirname, '../../Strategy Review/参考文档/每日复盘/strategy_pool.json');

const raw = fs.readFileSync(DETAIL_PATH, 'utf8');
const json = JSON.parse(raw);

// Load strategy flags to merge
let strategyPool = {};
try {
  const sraw = fs.readFileSync(STRATEGY_PATH, 'utf8');
  strategyPool = JSON.parse(sraw);
  console.log('Strategy pool loaded:', Object.keys(strategyPool).length, 'entries');
} catch (e) {
  console.warn('Could not load strategy_pool.json, s1/s2/s3 flags will be 0');
}

const updates = [];
for (const [rawCode, v] of Object.entries(json)) {
  const code = rawCode.replace(/[^0-9]/g, '').padStart(6, '0').slice(-6);
  if (!code || code.length !== 6) continue;

  const concepts = (v['概念和主题'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const mainBiz = (v['主营业务'] || '').trim();
  const pe = parseFloat(v['市盈(TTM)']) || null;
  const name = (v['名称'] || '').trim();
  const industry = (v['一二级行业'] || '').trim();

  // Merge strategy flags from strategy_pool
  const sp = strategyPool[code] || {};

  updates.push({
    code,
    name: sp.name || name,
    industry: sp.industry || industry,
    s1: sp.s1 ? 1 : 0,
    s2: sp.s2 ? 1 : 0,
    s3: sp.s3 ? 1 : 0,
    s4: sp.s4 ? 1 : 0,
    all_3: sp.all_3 ? 1 : 0,
    any_hit: (sp.s1 || sp.s2 || sp.s3 || sp.s4) ? 1 : 0,
    // S1 detail fields
    top10_26q1: sp.top10_26q1 ?? null,
    top10_25q4: sp.top10_25q4 ?? null,
    top10_25q3: sp.top10_25q3 ?? null,
    top10_25q2: sp.top10_25q2 ?? null,
    top10_25q1: sp.top10_25q1 ?? null,
    top10_24q4: sp.top10_24q4 ?? null,
    delta_26q1: sp.delta_26q1 ?? null,
    delta_25q4: sp.delta_25q4 ?? null,
    delta_25q3: sp.delta_25q3 ?? null,
    s1_sub: sp.s1_sub ? 1 : 0,
    // S2 detail fields
    roe_25: sp.roe_25 ?? null,
    roe_24: sp.roe_24 ?? null,
    roe_23: sp.roe_23 ?? null,
    roe_22: sp.roe_22 ?? null,
    margin_25: sp.margin_25 ?? null,
    margin_24: sp.margin_24 ?? null,
    margin_23: sp.margin_23 ?? null,
    margin_22: sp.margin_22 ?? null,
    net_profit_25: sp.net_profit_25 ?? null,
    net_profit_24: sp.net_profit_24 ?? null,
    net_profit_23: sp.net_profit_23 ?? null,
    net_profit_22: sp.net_profit_22 ?? null,
    roe_up: sp.roe_up ? 1 : 0,
    m_up: sp.m_up ? 1 : 0,
    k_up: sp.k_up ? 1 : 0,
    quality_count: sp.quality_count ?? 0,
    // S3 detail fields
    revenue_25: sp.revenue_25 ?? null,
    revenue_24: sp.revenue_24 ?? null,
    revenue_23: sp.revenue_23 ?? null,
    revenue_22: sp.revenue_22 ?? null,
    revenue_21: sp.revenue_21 ?? null,
    k_profit_25: sp.k_profit_25 ?? null,
    k_profit_24: sp.k_profit_24 ?? null,
    k_profit_23: sp.k_profit_23 ?? null,
    k_profit_22: sp.k_profit_22 ?? null,
    k_profit_21: sp.k_profit_21 ?? null,
    k_acc: sp.k_acc ? 1 : 0,
    y_acc: sp.y_acc ? 1 : 0,
    // S4 detail fields
    inst_26q1: sp.inst_26q1 ?? null,
    inst_25q4: sp.inst_25q4 ?? null,
    inst_25q3: sp.inst_25q3 ?? null,
    inst_25q2: sp.inst_25q2 ?? null,
    inst_d1: sp.inst_d1 ?? null,
    inst_d2: sp.inst_d2 ?? null,
    inst_d3: sp.inst_d3 ?? null,
    s4_sub: sp.s4_sub ? 1 : 0,
    // Detail enrichment
    main_business: mainBiz,
    concepts: JSON.stringify(concepts),
    pe,
    data_version: 'detail-20260430',
  });
}

console.log('Detail records prepared:', updates.length);

function postBatch(batch) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ stocks: batch, data_version: 'detail-20260430' });
    const url = new URL(API_BASE + '/api/upload/strategy');
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': ADMIN_KEY,
        'Content-Length': Buffer.byteLength(data),
      },
    }, res => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, ...JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, raw: body.substring(0, 100) }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  const BATCH = 50;
  let total = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    process.stdout.write(`Progress: ${i + batch.length}/${updates.length}\r`);
    const r = await postBatch(batch);
    if (r.status === 200) {
      total += r.processed || batch.length;
    } else {
      console.error(`\nError at ${i}:`, r.status, r.error || r.raw);
    }
    await new Promise(r => setTimeout(r, 150));
  }
  console.log(`\nDone! processed: ${total}`);
}

run().catch(e => { console.error(e); process.exit(1); });
