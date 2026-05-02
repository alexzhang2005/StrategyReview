/**
 * 公共 UI 组件和工具函数
 */

// ===== 导航栏 =====
function renderNav(activePage) {
  const pages = [
    { id: 'index',     href: '/',              icon: '🏠', label: '首页' },
    { id: 'review',    href: '/review.html',   icon: '📊', label: '每日复盘' },
    { id: 'strategy',  href: '/strategy.html', icon: '🎯', label: '选股策略' },
    { id: 'selection', href: '/selection.html',icon: '📋', label: '选股列表' },
    { id: 'admin',     href: '/admin.html',    icon: '⚙️',  label: '管理' },
  ];

  const links = pages.map(p => `
    <a href="${p.href}" class="nav-link ${activePage === p.id ? 'active' : ''}">
      ${p.icon} <span>${p.label}</span>
    </a>`).join('');

  return `
    <nav class="nav">
      <a href="/" class="nav-brand">📈 StrategyReview</a>
      <div class="nav-links">${links}</div>
      <div class="nav-right">
        <div class="nav-status" id="nav-status">
          <div class="status-dot" id="status-dot"></div>
          <span id="status-text">加载中...</span>
        </div>
      </div>
    </nav>`;
}

// 初始化导航状态
async function initNavStatus() {
  try {
    const data = await api.getStatus();
    const review = data.latest_review;
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');

    if (!review) { dot.className = 'status-dot'; text.textContent = '暂无数据'; return; }

    const statusMap = {
      published: { cls: 'ok',      msg: `✅ ${formatDateDisplay(review.date)} 已更新` },
      partial:   { cls: 'partial', msg: `⚠️ ${formatDateDisplay(review.date)} 部分更新` },
      draft:     { cls: '',        msg: `⏳ 等待更新` },
      failed:    { cls: 'failed',  msg: `❌ 更新失败` },
    };

    const s = statusMap[review.status] || statusMap.draft;
    dot.className = `status-dot ${s.cls}`;
    text.textContent = s.msg;
  } catch (e) {
    const text = document.getElementById('status-text');
    if (text) text.textContent = '连接失败';
  }
}

// ===== 策略标签 =====
function strategyTags(stock) {
  const tags = [];
  if (stock.all_3) tags.push('<span class="tag tag-gold">三合一</span>');
  if (stock.s1)    tags.push('<span class="tag tag-blue">持股增长</span>');
  if (stock.s2)    tags.push('<span class="tag tag-green">盈利质量</span>');
  if (stock.s3)    tags.push('<span class="tag tag-red">全速前进</span>');
  if (stock.s4)    tags.push('<span class="tag tag-purple">机构持股</span>');
  return tags.join(' ');
}

// ===== 涨跌格式化 =====
function fmtPct(v) {
  if (v == null || isNaN(v)) return '<span class="flat">-</span>';
  const n = parseFloat(v);
  const cls = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  const sign = n > 0 ? '+' : '';
  return `<span class="${cls}">${sign}${n.toFixed(2)}%</span>`;
}

function fmtNum(v, decimals = 2) {
  if (v == null || isNaN(v)) return '-';
  return parseFloat(v).toFixed(decimals);
}

// ===== 日期格式化 =====
function formatDateDisplay(dateStr) {
  if (!dateStr || dateStr.length < 8) return dateStr || '-';
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

function todayStr() {
  const now = new Date();
  // CST = UTC+8
  const cst = new Date(now.getTime() + 8 * 3600 * 1000);
  return cst.toISOString().slice(0, 10).replace(/-/g, '');
}

// ===== 加载占位 =====
function loadingHtml(msg = '加载中...') {
  return `<div class="loading"><div class="spinner"></div>${msg}</div>`;
}

// ===== 空状态 =====
function emptyHtml(title = '暂无数据', sub = '') {
  return `<div class="empty"><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div>`;
}

// ===== Toast 通知 =====
let toastTimer;
function showToast(msg, type = 'ok') {
  let t = document.getElementById('global-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'global-toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  clearTimeout(toastTimer);
  t.textContent = msg;
  t.className = `toast ${type} show`;
  toastTimer = setTimeout(() => { t.className = `toast ${type}`; }, 3500);
}

// ===== 分页组件 =====
function renderPagination(total, page, limit, onPageChange) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return '';

  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);

  if (start > 1) {
    pages.push(`<button class="page-btn" onclick="${onPageChange}(1)">1</button>`);
    if (start > 2) pages.push(`<span style="color:var(--sub)">...</span>`);
  }

  for (let i = start; i <= end; i++) {
    pages.push(`<button class="page-btn ${i === page ? 'active' : ''}" onclick="${onPageChange}(${i})">${i}</button>`);
  }

  if (end < totalPages) {
    if (end < totalPages - 1) pages.push(`<span style="color:var(--sub)">...</span>`);
    pages.push(`<button class="page-btn" onclick="${onPageChange}(${totalPages})">${totalPages}</button>`);
  }

  return `<div class="pagination">${pages.join('')}</div>`;
}

// ===== 迷你折线图 =====
function drawMiniChart(canvasId, data, color = '#ffd700') {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length < 2) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const vals = data.map(d => d.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';

  data.forEach((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.value - min) / range) * (h - 4) - 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });

  ctx.stroke();
}

// ===== 排序工具 =====
function makeSortable(tableId, sortState, reload) {
  const table = document.getElementById(tableId);
  if (!table) return;
  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortState.col === col) {
        sortState.order = sortState.order === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.col = col;
        sortState.order = 'asc';
      }
      table.querySelectorAll('th').forEach(t => t.classList.remove('th-sorted'));
      th.classList.add('th-sorted');
      th.textContent = th.dataset.label + (sortState.order === 'asc' ? ' ↑' : ' ↓');
      reload();
    });
  });
}

// ===== 股票代码跳转 =====
function goToStock(code) {
  window.open(`/stock.html?code=${code}`, '_blank');
}

// ===== 成交额格式化 =====
function fmtAmount(v) {
  if (v == null) return '-';
  const n = parseFloat(v);
  if (n >= 10000) return `${(n / 10000).toFixed(2)} 万亿`;
  if (n >= 1)     return `${n.toFixed(2)} 亿`;
  return `${(n * 100).toFixed(2)} 千万`;
}

// 导出供模块化使用（如果需要）
if (typeof module !== 'undefined') {
  module.exports = { renderNav, strategyTags, fmtPct, fmtNum, formatDateDisplay, todayStr,
    loadingHtml, emptyHtml, showToast, renderPagination, drawMiniChart, goToStock, fmtAmount };
}
