#!/usr/bin/env node
/**
 * seed-from-json.js
 * 
 * 从参考文档中的 strategy_data.json / stock_detail_data.json / strategy_lookup.json
 * 批量导入初始数据到 Cloudflare D1（通过 Pages Functions API）
 * 
 * 用法：
 *   node scripts/seed-from-json.js --api <PAGES_URL> --key <ADMIN_KEY> [--dry-run]
 * 
 * 示例：
 *   node scripts/seed-from-json.js --api https://strategy-review.pages.dev --key mykey123
 *   node scripts/seed-from-json.js --api http://localhost:8788 --key dev-key --dry-run
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ===== 命令行参数 =====
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const isDryRun = args.includes('--dry-run');
const API_BASE = getArg('--api') || 'http://localhost:8788';
const ADMIN_KEY = getArg('--key') || '';

if (!ADMIN_KEY && !isDryRun) {
  console.error('❌ 缺少 --key 参数（Admin Key）');
  process.exit(1);
}

// ===== 数据路径（相对于项目根目录的参考文档路径）=====
const REF_DIR = path.resolve(__dirname, '../../Strategy Review/参考文档/每日复盘');
const STRATEGY_DATA_PATH = path.join(REF_DIR, 'strategy_data.json');
const STOCK_DETAIL_PATH = path.join(REF_DIR, 'stock_detail_data.json');
const STRATEGY_LOOKUP_PATH = path.join(REF_DIR, 'strategy_lookup.json');
const STRATEGY_POOL_PATH = path.join(REF_DIR, 'strategy_pool.json');

// ===== HTTP 工具 =====
function httpPost(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const data = JSON.stringify(body);
    
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Admin-Key': ADMIN_KEY,
        ...headers,
      },
    };

    const req = mod.request(options, (res) => {
      let body = '';
      res.on('data', d => { body += d; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(body)); }
          catch { resolve(body); }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ===== 批量发送（50条/批）=====
async function batchUpload(stocks, batchSize = 50) {
  let totalInserted = 0, totalUpdated = 0, totalFailed = 0;
  
  for (let i = 0; i < stocks.length; i += batchSize) {
    const batch = stocks.slice(i, i + batchSize);
    process.stdout.write(`  进度: ${i + batch.length}/${stocks.length}\r`);
    
    if (!isDryRun) {
      try {
        const result = await httpPost(`${API_BASE}/api/stocks/batch`, { stocks: batch });
        totalInserted += result.inserted || 0;
        totalUpdated  += result.updated  || 0;
        totalFailed   += result.failed   || 0;
      } catch (e) {
        console.error(`\n  批次 ${i}-${i + batch.length} 失败: ${e.message}`);
        totalFailed += batch.length;
      }
    }
    
    // 避免速率限制
    await new Promise(r => setTimeout(r, 200));
  }
  
  return { inserted: totalInserted, updated: totalUpdated, failed: totalFailed };
}

// ===== 加载 JSON 文件（带错误处理）=====
function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️  文件不存在: ${filePath}`);
    return null;
  }
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(text);
  } catch (e) {
    console.error(`  ❌ 解析失败: ${filePath}: ${e.message}`);
    return null;
  }
}

// ===== 转换 strategy_data.json 格式 =====
function transformStrategyData(raw) {
  // 支持数组或 {stocks: [...]} 格式
  const items = Array.isArray(raw) ? raw : (raw.stocks || raw.data || []);
  
  return items.map(item => ({
    code: String(item.code || item.股票代码 || '').trim().padStart(6, '0').slice(-6),
    name: item.name || item.股票名称 || item.简称 || '',
    industry: item.industry || item.行业 || '',
    
    // 策略标志（兼容多种字段名）
    s1: !!(item.s1 || item.S1 || item.持股增长),
    s2: !!(item.s2 || item.S2 || item.盈利质量),
    s3: !!(item.s3 || item.S3 || item.全速前进),
    s4: !!(item.s4 || item.S4 || item.机构持股增长),
    
    // 加速标志
    k_acc: !!(item.k_acc || item.扣非净利加速),
    y_acc: !!(item.y_acc || item.营收加速),
    s1_sub: !!(item.s1_sub || item.持股增速加速),
    
    // 质量评分
    quality_count: item.quality_count || item.质量评分 || 0,
    
    // S2 数据（ROE/毛利/扣非净利，25~22年）
    roe_25: item.roe_25 || item.ROE25 || null,
    roe_24: item.roe_24 || item.ROE24 || null,
    roe_23: item.roe_23 || item.ROE23 || null,
    roe_22: item.roe_22 || item.ROE22 || null,
    margin_25: item.margin_25 || item.毛利率25 || null,
    margin_24: item.margin_24 || item.毛利率24 || null,
    margin_23: item.margin_23 || item.毛利率23 || null,
    margin_22: item.margin_22 || item.毛利率22 || null,
    k_profit_25: item.k_profit_25 || item.扣非净利25 || null,
    k_profit_24: item.k_profit_24 || item.扣非净利24 || null,
    k_profit_23: item.k_profit_23 || item.扣非净利23 || null,
    k_profit_22: item.k_profit_22 || item.扣非净利22 || null,
    
    // S3 数据（营收增速，25~21年）
    revenue_25: item.revenue_25 || null,
    revenue_24: item.revenue_24 || null,
    revenue_23: item.revenue_23 || null,
    revenue_22: item.revenue_22 || null,
    revenue_21: item.revenue_21 || null,
    
    // S1 数据（十大股东六期）
    top10_26q1: item.top10_26q1 || null,
    top10_25q4: item.top10_25q4 || null,
    top10_25q3: item.top10_25q3 || null,
    top10_25q2: item.top10_25q2 || null,
    top10_25q1: item.top10_25q1 || null,
    top10_24q4: item.top10_24q4 || null,
    delta_26q1: item.delta_26q1 || null,
    delta_25q4: item.delta_25q4 || null,
    delta_25q3: item.delta_25q3 || null,
    
    data_version: item.data_version || 'seed-v1',
  })).filter(s => s.code && s.code.length === 6 && s.code !== '000000');
}

// ===== 合并 lookup 数据 =====
function mergeLookupData(stocks, lookup) {
  if (!lookup) return stocks;
  // lookup 可能是 {code: {name, industry, concepts, main_business, pe, pb}} 格式
  const lookupMap = {};
  if (Array.isArray(lookup)) {
    lookup.forEach(item => { lookupMap[item.code] = item; });
  } else {
    Object.assign(lookupMap, lookup);
  }
  
  return stocks.map(s => {
    const extra = lookupMap[s.code];
    if (!extra) return s;
    return {
      ...s,
      name: s.name || extra.name || extra.股票名称 || '',
      industry: s.industry || extra.industry || extra.行业 || '',
      main_business: extra.main_business || extra.主营业务 || '',
      concepts: extra.concepts
        ? (Array.isArray(extra.concepts) ? JSON.stringify(extra.concepts) : extra.concepts)
        : null,
      pe: extra.pe || extra.PE || null,
      pb: extra.pb || extra.PB || null,
      market_cap: extra.market_cap || null,
    };
  });
}

// ===== 主流程 =====
async function main() {
  console.log('='.repeat(60));
  console.log('StrategyReview 数据初始化脚本');
  console.log(`API: ${API_BASE}`);
  console.log(`模式: ${isDryRun ? '🔍 预览（不写入）' : '✍️  写入'}`);
  console.log('='.repeat(60));

  // 1. 加载 strategy_data.json
  let stocks = [];
  
  console.log('\n📂 加载策略数据...');
  const strategyData = loadJson(STRATEGY_DATA_PATH);
  if (strategyData) {
    const transformed = transformStrategyData(strategyData);
    stocks = [...stocks, ...transformed];
    console.log(`  ✅ strategy_data.json: ${transformed.length} 只股票`);
  }

  // 尝试 strategy_pool.json
  if (!stocks.length) {
    const poolData = loadJson(STRATEGY_POOL_PATH);
    if (poolData) {
      const transformed = transformStrategyData(poolData);
      stocks = [...stocks, ...transformed];
      console.log(`  ✅ strategy_pool.json: ${transformed.length} 只股票`);
    }
  }

  // 2. 合并 lookup 数据（基础信息：主营业务、概念）
  console.log('\n📂 加载补充数据...');
  const lookupData = loadJson(STRATEGY_LOOKUP_PATH) || loadJson(STOCK_DETAIL_PATH);
  if (lookupData) {
    const before = stocks.length;
    stocks = mergeLookupData(stocks, lookupData);
    console.log(`  ✅ lookup 数据合并完成（${before} 只）`);
  }

  // 3. 去重（按股票代码）
  const deduped = [...new Map(stocks.map(s => [s.code, s])).values()];
  console.log(`\n📊 汇总：${deduped.length} 只唯一股票`);
  
  const s1Count = deduped.filter(s => s.s1).length;
  const s2Count = deduped.filter(s => s.s2).length;
  const s3Count = deduped.filter(s => s.s3).length;
  const all3Count = deduped.filter(s => s.s1 && s.s2 && s.s3).length;
  console.log(`  S1（持股增长）: ${s1Count}`);
  console.log(`  S2（盈利质量）: ${s2Count}`);
  console.log(`  S3（全速前进）: ${s3Count}`);
  console.log(`  三合一: ${all3Count}`);

  if (isDryRun) {
    console.log('\n🔍 预览模式，跳过写入');
    console.log('前5条：');
    deduped.slice(0, 5).forEach(s => {
      console.log(`  ${s.code} ${s.name} | S1:${s.s1?1:0} S2:${s.s2?1:0} S3:${s.s3?1:0}`);
    });
    return;
  }

  // 4. 批量上传
  console.log('\n📤 批量写入数据库...');
  const result = await batchUpload(deduped);
  console.log('\n');
  console.log(`  ✅ 成功写入: ${result.inserted} 条`);
  console.log(`  🔄 更新: ${result.updated} 条`);
  console.log(result.failed ? `  ❌ 失败: ${result.failed} 条` : '  ❌ 失败: 0 条');

  console.log('\n✨ 数据初始化完成！');
}

main().catch(err => {
  console.error('\n❌ 脚本出错:', err.message);
  process.exit(1);
});
