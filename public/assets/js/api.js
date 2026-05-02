/**
 * API 客户端 - 封装所有与后端的通信
 */

const API_BASE = '/api';

class ApiClient {
  constructor(base = API_BASE) {
    this.base = base;
  }

  async get(path, params = {}) {
    const url = new URL(this.base + path, window.location.origin);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
    const resp = await fetch(url.toString());
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(e.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  }

  async post(path, body = {}, extraHeaders = {}) {
    const resp = await fetch(this.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(e.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  }

  // ===== 系统状态 =====
  getStatus() { return this.get('/status'); }

  // ===== 复盘 =====
  getReviewList(page = 1, limit = 20) { return this.get('/review', { page, limit }); }
  getReview(date) { return this.get(`/review/${date}`); }
  triggerUpdate(date, adminKey) {
    return this.post(`/cron/daily-update?date=${date}`, {}, { 'X-Admin-Key': adminKey });
  }

  // ===== 策略 =====
  getStrategySummary() { return this.get('/strategy'); }
  getStrategyStocks(strategy, page = 1, limit = 50, sort = 'code', order = 'asc') {
    return this.get(`/strategy/${strategy}`, { page, limit, sort, order });
  }

  // ===== 股票 =====
  getStock(code) { return this.get(`/stock/${code}`); }
  getStocksBatch(codes) { return this.post('/stocks/batch', { codes }); }

  // ===== 选股列表 =====
  getSelectionList(page = 1, limit = 20) { return this.get('/selection', { page, limit }); }
  getSelectionDetail(id) { return this.get(`/selection/${id}`); }

  // ===== 上传 =====
  uploadStrategy(stocks, dataVersion) {
    return this.post('/upload/strategy', { stocks, data_version: dataVersion });
  }
  uploadSelection(stocks, date, filename, listName) {
    return this.post('/upload/selection', { stocks, date, filename, list_name: listName });
  }
}

const api = new ApiClient();
window.api = api;
