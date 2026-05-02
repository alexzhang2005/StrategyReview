# StrategyReview

A股策略复盘平台 — 每日市场复盘 + 量化选股策略 + 选股列表匹配

**部署地址**：https://strategy-review.pages.dev  
**技术栈**：Cloudflare Pages + Functions + D1 | 纯原生 HTML/CSS/JS

---

## 功能

| 页面 | 路径 | 说明 |
|------|------|------|
| 首页 | `/` | 统计概览、最近复盘、三合一股票 |
| 每日复盘 | `/review.html` | 市场情绪、指数、板块、涨跌停 |
| 选股策略 | `/strategy.html` | S1/S2/S3/三合一股票筛选表格 |
| 股票详情 | `/stock.html?code=XXXXXX` | 单股策略命中详情 |
| 选股列表 | `/selection.html` | Excel 上传 + 策略匹配 |
| 管理后台 | `/admin.html` | 数据维护、手动触发、JSON 导入 |

## 策略说明

| 策略 | 标签 | 规则 |
|------|------|------|
| S1 持股增长 | 🔵 | 十大股东三季度连续增持（>100万股） |
| S2 盈利质量 | 🟢 | ROE + 毛利率 + 扣非净利 连续三年递增 |
| S3 全速前进 | 🔴 | 扣非净利增速 + 营收增速 双加速 |
| 三合一 | 🟡 | S1 + S2 + S3 全部命中 |

## 数据更新

- **每日复盘**：每个工作日 18:00 自动抓取九宽 API（Cron Worker 驱动）
- **策略数据**：每季度财报后，通过管理后台上传 Excel 更新
- **选股列表**：任意时间上传 `.xls/.xlsx`，自动与策略库匹配

---

## 快速开始

### 1. 环境准备

```bash
npm install
# 需要 Wrangler 4.x
npx wrangler --version
```

### 2. 创建 D1 数据库

```bash
npx wrangler d1 create strategy-review-db
# 复制输出的 database_id，填入 wrangler.toml 中的 PLACEHOLDER_DB_ID
```

### 3. 运行数据库迁移

```bash
# 本地开发
npm run db:local-migrate

# 生产环境
npm run db:migrate
```

### 4. 本地开发

```bash
npm run dev
# 访问 http://localhost:8788
```

### 5. 导入初始数据

```bash
# 本地
node scripts/seed-from-json.js --api http://localhost:8788 --key dev-key --dry-run
node scripts/seed-from-json.js --api http://localhost:8788 --key dev-key

# 生产
node scripts/seed-from-json.js --api https://strategy-review.pages.dev --key <ADMIN_KEY>
```

### 6. 部署

```bash
npm run deploy
```

### 7. 设置密钥

```bash
npx wrangler pages secret put ADMIN_KEY
# 输入管理员密钥

npx wrangler pages secret put JIUKUAN_API_KEY
# 输入九宽 API Key
```

### 8. 部署 Cron Worker

```bash
cd cron-worker
# 更新 wrangler.toml 中的 PAGES_BASE_URL 为实际域名
npx wrangler deploy
```

---

## 项目结构

```
StrategyReview/
├── public/                    # 前端静态文件
│   ├── index.html             # 首页
│   ├── review.html            # 每日复盘
│   ├── strategy.html          # 选股策略
│   ├── stock.html             # 股票详情
│   ├── selection.html         # 选股列表
│   ├── admin.html             # 管理后台
│   └── assets/
│       ├── css/main.css       # 全局样式（深色金融主题）
│       └── js/
│           ├── api.js         # API 客户端封装
│           └── components.js  # 共享 UI 组件
├── functions/
│   └── api/
│       └── [[route]].js       # Pages Functions API（所有 /api/* 路由）
├── cron-worker/               # 独立 Cron Worker（18:00 自动触发）
│   ├── wrangler.toml
│   └── src/index.js
├── migrations/
│   └── 0001_init.sql          # D1 数据库 Schema
├── scripts/
│   └── seed-from-json.js      # 初始数据导入脚本
├── docs/
│   ├── PRD.md                 # 产品需求文档
│   └── ARCHITECTURE.md        # 技术架构文档
├── wrangler.toml              # Cloudflare Pages 配置
└── package.json
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/status` | 系统状态 |
| GET | `/api/review` | 复盘列表 |
| GET | `/api/review/:date` | 指定日期复盘 |
| POST | `/api/cron/daily-update` | 触发每日更新（需 Admin Key） |
| GET | `/api/strategy` | 策略统计 |
| GET | `/api/strategy/:name` | 策略股票列表 |
| GET | `/api/stock/:code` | 股票详情 |
| POST | `/api/stocks/batch` | 批量写入股票（需 Admin Key） |
| GET | `/api/selection` | 选股列表 |
| GET | `/api/selection/:id` | 选股详情 |
| POST | `/api/upload/strategy` | 上传策略数据（需 Admin Key） |
| POST | `/api/upload/selection` | 上传选股列表 |

## 九宽 API

- Base URL: `https://9quant.online`
- Auth Header: `X-API-Key: <key>`（注意：不是 Bearer）
- 主要端点：`/api/v1/big-index/`, `/api/v1/limit`, `/api/v1/daily/`, `/api/v1/ths-mainstream/`

---

## License

MIT
