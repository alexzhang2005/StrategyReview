# 技术架构文档
# StrategyReview — 系统架构设计

**版本**: v1.0  
**日期**: 2026-05-02

---

## 1. 系统架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    用户浏览器                             │
│  index.html / review.html / strategy.html / ...         │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────┐
│              Cloudflare Pages                           │
│   strategy-review.pages.dev                             │
│   ┌─────────────────────────────────────────────────┐   │
│   │  Static Frontend (HTML/CSS/JS)                  │   │
│   │  /public/* → served by CDN                     │   │
│   └─────────────────────────────────────────────────┘   │
│   ┌─────────────────────────────────────────────────┐   │
│   │  Pages Functions (/functions/api/*)             │   │
│   │  → Handles all /api/* requests                  │   │
│   │  → Bound to D1 database                        │   │
│   └────────────────────┬────────────────────────────┘   │
└────────────────────────│────────────────────────────────┘
                         │ D1 SQL
┌────────────────────────▼────────────────────────────────┐
│              Cloudflare D1 (SQLite)                     │
│   strategy-review-db                                    │
│   ┌──────────┐ ┌──────────────┐ ┌───────────────────┐  │
│   │  stocks  │ │daily_reviews │ │ selection_lists   │  │
│   └──────────┘ └──────────────┘ └───────────────────┘  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              Cloudflare Worker (Cron)                   │
│   strategy-review-cron                                  │
│   Schedule: 0 10 * * 1-5  (18:00 CST, Weekdays)        │
│   → calls /api/cron/daily-update on Pages               │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              GitHub (Code Repository)                   │
│   alexzhang2005/StrategyReview                          │
│   → GitHub Actions: auto-deploy to Cloudflare Pages     │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 目录结构

```
StrategyReview/
├── public/                         # 前端静态文件（Cloudflare Pages 服务）
│   ├── index.html                  # 首页
│   ├── review.html                 # 每日复盘（列表+详情）
│   ├── strategy.html               # 选股策略总览
│   ├── stock.html                  # 股票详情
│   ├── selection.html              # 选股列表（上传+展示）
│   ├── admin.html                  # 管理页面
│   └── assets/
│       ├── css/
│       │   └── main.css            # 全局样式
│       └── js/
│           ├── api.js              # API 客户端（封装所有 fetch 调用）
│           ├── components.js       # 可复用 UI 组件
│           └── xlsx.min.js         # SheetJS Excel 解析库
│
├── functions/                      # Cloudflare Pages Functions（API 层）
│   └── api/
│       └── [[route]].js            # 路由分发（所有 /api/* 请求）
│
├── cron-worker/                    # 独立 Cron Worker（仅用于定时触发）
│   ├── src/
│   │   └── index.js                # Cron trigger → 调用 Pages API
│   └── wrangler.toml
│
├── migrations/                     # D1 数据库迁移脚本
│   └── 0001_init.sql               # 初始表结构
│
├── scripts/                        # 本地辅助脚本
│   ├── seed-from-json.js           # 从现有 JSON 数据导入 D1
│   └── seed-from-db.js             # 从现有 SQLite 导入 D1
│
├── docs/                           # 项目文档
│   ├── PRD.md                      # 产品需求文档
│   ├── ARCHITECTURE.md             # 本文档
│   ├── API.md                      # API 接口规范
│   ├── STRATEGY.md                 # 策略规则说明
│   └── CHANGELOG.md                # 变更日志
│
├── wrangler.toml                   # Pages + D1 配置
├── package.json
└── README.md
```

---

## 3. 数据库设计（D1 SQLite）

### 3.1 stocks 表（策略股池）

```sql
CREATE TABLE stocks (
    code TEXT PRIMARY KEY,       -- 股票代码（6位）
    name TEXT NOT NULL,          -- 股票名称
    industry TEXT,               -- 行业（一级/二级）
    -- 策略命中
    s1 INTEGER DEFAULT 0,        -- 持股增长
    s2 INTEGER DEFAULT 0,        -- 盈利质量
    s3 INTEGER DEFAULT 0,        -- 全速前进
    s4 INTEGER DEFAULT 0,        -- 机构持股增长（暂未启用）
    all_3 INTEGER DEFAULT 0,     -- 三合一
    any_hit INTEGER DEFAULT 0,   -- 任意策略命中
    -- S1 详情：十大股东持股数（万股）
    top10_26q1 REAL, top10_25q4 REAL, top10_25q3 REAL,
    top10_25q2 REAL, top10_25q1 REAL, top10_24q4 REAL,
    delta_26q1 REAL, delta_25q4 REAL, delta_25q3 REAL,
    s1_sub INTEGER DEFAULT 0,    -- 子策略：增速加速
    -- S2 详情：盈利质量
    roe_25 REAL, roe_24 REAL, roe_23 REAL, roe_22 REAL,
    margin_25 REAL, margin_24 REAL, margin_23 REAL, margin_22 REAL,
    net_profit_25 REAL, net_profit_24 REAL, net_profit_23 REAL, net_profit_22 REAL,
    roe_up INTEGER DEFAULT 0,
    m_up INTEGER DEFAULT 0,
    k_up INTEGER DEFAULT 0,
    quality_count INTEGER DEFAULT 0,
    -- S3 详情：双加速
    revenue_25 REAL, revenue_24 REAL, revenue_23 REAL, revenue_22 REAL, revenue_21 REAL,
    k_profit_25 REAL, k_profit_24 REAL, k_profit_23 REAL, k_profit_22 REAL, k_profit_21 REAL,
    k_acc INTEGER DEFAULT 0,
    y_acc INTEGER DEFAULT 0,
    -- S4 详情：机构持股（暂未启用）
    inst_26q1 REAL, inst_25q4 REAL, inst_25q3 REAL, inst_25q2 REAL,
    inst_d1 REAL, inst_d2 REAL, inst_d3 REAL,
    s4_sub INTEGER DEFAULT 0,
    -- 基础信息
    main_business TEXT,
    concepts TEXT,               -- JSON 数组存储
    pe REAL,
    pb REAL,
    market_cap REAL,
    -- 元数据
    data_version TEXT,           -- 数据版本（季度标识）
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 daily_reviews 表（每日复盘）

```sql
CREATE TABLE daily_reviews (
    date TEXT PRIMARY KEY,       -- YYYYMMDD
    title TEXT,
    summary TEXT,
    -- API 原始数据（JSON）
    indices_json TEXT,           -- 四大指数
    limits_json TEXT,            -- 涨停/跌停
    emotion_json TEXT,           -- 情绪统计
    sectors_json TEXT,           -- 热点板块 TOP5
    board_json TEXT,             -- 板块成分股（含策略标注）
    -- 手动填写字段
    high_new_diff REAL,          -- 250日新高新低差
    day5_diff REAL,              -- 5日差值
    ma5_ratio REAL,              -- MA5 以上比例
    chart_history_json TEXT,     -- 历史数据（用于折线图）
    analysis_text TEXT,          -- 手动分析文字
    -- 状态
    status TEXT DEFAULT 'draft', -- draft/partial/published/failed
    update_source TEXT,          -- api/manual/cron
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3 selection_lists 表（选股列表）

```sql
CREATE TABLE selection_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,          -- YYYYMMDD
    filename TEXT,               -- 原始文件名
    list_name TEXT,              -- 列表名称（从文件名提取）
    total_count INTEGER DEFAULT 0,
    strategy_matched INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE selection_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL REFERENCES selection_lists(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT,
    s1 INTEGER DEFAULT 0,
    s2 INTEGER DEFAULT 0,
    s3 INTEGER DEFAULT 0,
    s4 INTEGER DEFAULT 0,
    all_3 INTEGER DEFAULT 0,
    any_hit INTEGER DEFAULT 0,
    pct_change REAL,
    concepts TEXT
);
```

---

## 4. API 规范（详见 docs/API.md）

### 关键端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/status` | 系统状态 |
| GET | `/api/review` | 复盘列表 |
| GET | `/api/review/:date` | 单日复盘数据 |
| POST | `/api/cron/daily-update` | 触发复盘更新（需 API Key） |
| GET | `/api/strategy` | 策略汇总 |
| GET | `/api/strategy/:name` | 策略股票列表 |
| GET | `/api/stock/:code` | 股票详情 |
| GET | `/api/selection` | 选股列表历史 |
| POST | `/api/upload/strategy` | 上传策略 Excel |
| POST | `/api/upload/selection` | 上传选股列表 Excel |

---

## 5. 技术选型理由

| 技术 | 选择 | 理由 |
|------|------|------|
| 前端框架 | 纯 HTML/CSS/JS | 与现有风格一致，零依赖，速度快 |
| 后端 | Cloudflare Pages Functions | 与 Pages 共享域名，免费，D1 原生支持 |
| 数据库 | Cloudflare D1 | SQLite 兼容，免费 5GB，实现跨页面数据共享 |
| 定时任务 | Cloudflare Cron Worker | 免费，与 D1 解耦 |
| Excel 解析 | SheetJS (浏览器端) | 无需后端处理二进制，减少 Worker 复杂度 |
| 代码托管 | GitHub | 版本控制，CI/CD 自动化 |
| 部署 | Cloudflare Pages | 自动部署，全球 CDN，免费 |

---

## 6. 关键设计决策

### 6.1 为什么用 Pages Functions 而不是独立 Worker？
- Pages Functions 与前端共享同一域名，无需 CORS
- D1 数据库可直接绑定到 Pages 项目
- 单次部署（`wrangler pages deploy`）包含前端和 API

### 6.2 为什么单独设置 Cron Worker？
- Pages Functions 不支持 Cron Triggers
- Cron Worker 极简（仅发一个 HTTP 请求），不包含业务逻辑
- 业务逻辑全部在 Pages Functions 中，避免重复

### 6.3 为什么 Excel 在浏览器解析？
- 避免在 Worker 中处理大型二进制文件
- 用户上传 → 浏览器解析 → JSON 发送到 API → D1 存储
- 减少网络传输（只传 JSON，不传 Excel 原文件）

### 6.4 数据同步如何实现？
- 所有数据存在同一个 D1 数据库
- 复盘页面的"策略标注"来自 `stocks` 表实时查询
- 选股列表匹配结果也来自 `stocks` 表
- 季度 Excel 更新 `stocks` 表后，全站自动生效（无需重新生成页面）

---

## 7. 部署流程

```
本地开发
    │
    ├── git push → GitHub（alexzhang2005/StrategyReview）
    │                   │
    │                   └── GitHub Actions → wrangler pages deploy
    │                                            │
    │                                            └── Cloudflare Pages（strategy-review.pages.dev）
    │
    └── 手动：npx wrangler deploy cron-worker/src/index.js
                  （仅 Cron Worker，极少更新）
```

### 首次部署步骤
1. 创建 D1 数据库：`npx wrangler d1 create strategy-review-db`
2. 运行迁移：`npx wrangler d1 migrations apply strategy-review-db`
3. 导入数据：`node scripts/seed-from-json.js`
4. 部署 Pages：`npx wrangler pages deploy public --project-name=strategy-review`
5. 部署 Cron Worker：`cd cron-worker && npx wrangler deploy`
