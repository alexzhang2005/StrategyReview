#!/usr/bin/env node
/**
 * import-strategy-financial.js
 *
 * 从 strategy_data.json 导入金融详情字段到 D1（通过 wrangler d1 execute --file）
 * 生成多个 SQL 文件到 scripts/sql_batches/ 目录，然后逐一执行
 *
 * 字段映射：
 *   six_q[0..5] → top10_26q1 .. top10_24q4
 *   delta = six_q[i] - six_q[i+1] → delta_26q1, delta_25q4, delta_25q3
 *   roe/roe24/roe23/roe22 → roe_25/roe_24/roe_23/roe_22
 *   毛利/毛利率24/毛利率23/毛利率22 → margin_25/margin_24/margin_23/margin_22
 *   净利/扣非净利24/扣非净利23/扣非净利22 → net_profit_25/..22 AND k_profit_25/..22
 *   营收25..22 → revenue_25..22
 *   j1/j2/j3/j4 → inst_26q1/inst_25q4/inst_25q3/inst_25q2
 *   j1-j2 → inst_d1, j2-j3 → inst_d2, j3-j4 → inst_d3
 *   s4/s4_sub → s4/s4_sub
 *   any_hit → s1|s2|s3|s4
 *
 * 用法：
 *   node scripts/import-strategy-financial.js [--execute]
 *   --execute  生成 SQL 后立即调用 wrangler 执行
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXECUTE = process.argv.includes('--execute');
const BATCH_SIZE = 200; // statements per SQL file
const OUT_DIR = path.join(__dirname, 'sql_batches');
const SOURCE = path.join(__dirname, '../../Strategy Review/参考文档/每日复盘/strategy_data.json');
const DB_NAME = 'strategy-review-db';

// ── helpers ────────────────────────────────────────────────────────────────
const n = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'NULL' : v);
const q = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'NULL' : Number(v));
const b = (v) => (v ? 1 : 0);

function buildUpdateSQL(row) {
  const sq = row.six_q || [];
  const top10 = [0,1,2,3,4,5].map(i => q(sq[i]));
  const d1 = (sq[0] != null && sq[1] != null) ? q(sq[0] - sq[1]) : 'NULL';
  const d2 = (sq[1] != null && sq[2] != null) ? q(sq[1] - sq[2]) : 'NULL';
  const d3 = (sq[2] != null && sq[3] != null) ? q(sq[2] - sq[3]) : 'NULL';

  const j = [row.j1, row.j2, row.j3, row.j4].map(v => q(v));
  const id1 = (row.j1 != null && row.j2 != null) ? q(row.j1 - row.j2) : 'NULL';
  const id2 = (row.j2 != null && row.j3 != null) ? q(row.j2 - row.j3) : 'NULL';
  const id3 = (row.j3 != null && row.j4 != null) ? q(row.j3 - row.j4) : 'NULL';

  const anyHit = (row.s1 || row.s2 || row.s3 || row.s4) ? 1 : 0;

  return `UPDATE stocks SET
    s1=${b(row.s1)}, s2=${b(row.s2)}, s3=${b(row.s3)}, s4=${b(row.s4)},
    s1_sub=${b(row.s1_sub)}, s4_sub=${b(row.s4_sub)},
    all_3=${b(row.all_3)}, any_hit=${anyHit},
    top10_26q1=${top10[0]}, top10_25q4=${top10[1]}, top10_25q3=${top10[2]},
    top10_25q2=${top10[3]}, top10_25q1=${top10[4]}, top10_24q4=${top10[5]},
    delta_26q1=${d1}, delta_25q4=${d2}, delta_25q3=${d3},
    roe_25=${q(row.roe)}, roe_24=${q(row.roe24)}, roe_23=${q(row.roe23)}, roe_22=${q(row.roe22)},
    margin_25=${q(row['毛利'])}, margin_24=${q(row['毛利率24'])}, margin_23=${q(row['毛利率23'])}, margin_22=${q(row['毛利率22'])},
    net_profit_25=${q(row['净利'])}, net_profit_24=${q(row['扣非净利24'])}, net_profit_23=${q(row['扣非净利23'])}, net_profit_22=${q(row['扣非净利22'])},
    k_profit_25=${q(row['净利'])}, k_profit_24=${q(row['扣非净利24'])}, k_profit_23=${q(row['扣非净利23'])}, k_profit_22=${q(row['扣非净利22'])},
    revenue_25=${q(row['营收25'])}, revenue_24=${q(row['营收24'])}, revenue_23=${q(row['营收23'])}, revenue_22=${q(row['营收22'])},
    quality_count=${n(row.quality_count)},
    k_acc=${b(row.k_acc)}, y_acc=${b(row.y_acc)},
    inst_26q1=${j[0]}, inst_25q4=${j[1]}, inst_25q3=${j[2]}, inst_25q2=${j[3]},
    inst_d1=${id1}, inst_d2=${id2}, inst_d3=${id3}
  WHERE code='${row.code.replace(/'/g, "''")}';`;
}

// ── main ───────────────────────────────────────────────────────────────────
console.log('📖 读取 strategy_data.json…');
const raw = fs.readFileSync(SOURCE, 'utf8');
const cleaned = raw.replace(/\bNaN\b/g, 'null');
const arr = JSON.parse(cleaned);
console.log(`✅ 解析完成，共 ${arr.length} 条记录`);

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

// 清除旧批次文件
fs.readdirSync(OUT_DIR).forEach(f => {
  if (f.startsWith('batch_') && f.endsWith('.sql')) {
    fs.unlinkSync(path.join(OUT_DIR, f));
  }
});

const batchFiles = [];
for (let i = 0; i < arr.length; i += BATCH_SIZE) {
  const chunk = arr.slice(i, i + BATCH_SIZE);
  const sql = chunk.map(buildUpdateSQL).join('\n');
  const file = path.join(OUT_DIR, `batch_${String(Math.floor(i / BATCH_SIZE) + 1).padStart(3, '0')}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  batchFiles.push(file);
}
console.log(`✅ 生成 ${batchFiles.length} 个 SQL 批次文件 → ${OUT_DIR}`);

if (!EXECUTE) {
  console.log('\n提示: 运行 node scripts/import-strategy-financial.js --execute 自动执行导入');
  console.log(`或手动执行: for 文件 in ${OUT_DIR}\\batch_*.sql: npx wrangler d1 execute ${DB_NAME} --remote --file=文件`);
  process.exit(0);
}

// ── 执行 ───────────────────────────────────────────────────────────────────
console.log('\n🚀 开始执行 D1 导入…');
let done = 0;
for (const file of batchFiles) {
  process.stdout.write(`  [${++done}/${batchFiles.length}] ${path.basename(file)}…`);
  try {
    execSync(`npx wrangler d1 execute ${DB_NAME} --remote --file="${file}"`, {
      stdio: 'pipe',
      cwd: path.join(__dirname, '..'),
    });
    process.stdout.write(' ✅\n');
  } catch (e) {
    process.stdout.write(' ❌\n');
    console.error('  错误:', e.stderr?.toString().slice(0, 200) || e.message);
  }
}
console.log('\n✅ 导入完成');
