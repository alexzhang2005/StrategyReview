-- D1 数据库初始化迁移脚本
-- StrategyReview v1.0
-- 2026-05-02

-- ============================================================
-- 策略股池
-- ============================================================
CREATE TABLE IF NOT EXISTS stocks (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    industry TEXT,
    -- 策略命中标志
    s1 INTEGER DEFAULT 0,
    s2 INTEGER DEFAULT 0,
    s3 INTEGER DEFAULT 0,
    s4 INTEGER DEFAULT 0,
    all_3 INTEGER DEFAULT 0,
    any_hit INTEGER DEFAULT 0,
    -- S1: 十大股东持股（万股）
    top10_26q1 REAL, top10_25q4 REAL, top10_25q3 REAL,
    top10_25q2 REAL, top10_25q1 REAL, top10_24q4 REAL,
    delta_26q1 REAL, delta_25q4 REAL, delta_25q3 REAL,
    s1_sub INTEGER DEFAULT 0,
    -- S2: 盈利质量
    roe_25 REAL, roe_24 REAL, roe_23 REAL, roe_22 REAL,
    margin_25 REAL, margin_24 REAL, margin_23 REAL, margin_22 REAL,
    net_profit_25 REAL, net_profit_24 REAL, net_profit_23 REAL, net_profit_22 REAL,
    roe_up INTEGER DEFAULT 0,
    m_up INTEGER DEFAULT 0,
    k_up INTEGER DEFAULT 0,
    quality_count INTEGER DEFAULT 0,
    -- S3: 双加速
    revenue_25 REAL, revenue_24 REAL, revenue_23 REAL, revenue_22 REAL, revenue_21 REAL,
    k_profit_25 REAL, k_profit_24 REAL, k_profit_23 REAL, k_profit_22 REAL, k_profit_21 REAL,
    k_acc INTEGER DEFAULT 0,
    y_acc INTEGER DEFAULT 0,
    -- S4: 机构持股（暂未启用）
    inst_26q1 REAL, inst_25q4 REAL, inst_25q3 REAL, inst_25q2 REAL,
    inst_d1 REAL, inst_d2 REAL, inst_d3 REAL,
    s4_sub INTEGER DEFAULT 0,
    -- 基础信息
    main_business TEXT,
    concepts TEXT,
    pe REAL,
    pb REAL,
    market_cap REAL,
    -- 元数据
    data_version TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stocks_s1 ON stocks(s1);
CREATE INDEX IF NOT EXISTS idx_stocks_s2 ON stocks(s2);
CREATE INDEX IF NOT EXISTS idx_stocks_s3 ON stocks(s3);
CREATE INDEX IF NOT EXISTS idx_stocks_all3 ON stocks(all_3);
CREATE INDEX IF NOT EXISTS idx_stocks_any ON stocks(any_hit);
CREATE INDEX IF NOT EXISTS idx_stocks_industry ON stocks(industry);

-- ============================================================
-- 每日复盘
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_reviews (
    date TEXT PRIMARY KEY,
    title TEXT,
    summary TEXT,
    -- API 原始数据
    indices_json TEXT,
    limits_json TEXT,
    emotion_json TEXT,
    sectors_json TEXT,
    board_json TEXT,
    -- 手动/计算字段
    high_new_diff REAL,
    day5_diff REAL,
    ma5_ratio REAL,
    chart_history_json TEXT,
    analysis_text TEXT,
    -- 状态
    status TEXT DEFAULT 'draft',
    update_source TEXT DEFAULT 'api',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_date ON daily_reviews(date DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON daily_reviews(status);

-- ============================================================
-- 选股列表
-- ============================================================
CREATE TABLE IF NOT EXISTS selection_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    filename TEXT,
    list_name TEXT,
    total_count INTEGER DEFAULT 0,
    strategy_matched INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS selection_stocks (
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

CREATE INDEX IF NOT EXISTS idx_sel_stocks_list ON selection_stocks(list_id);
CREATE INDEX IF NOT EXISTS idx_sel_stocks_code ON selection_stocks(code);
CREATE INDEX IF NOT EXISTS idx_sel_lists_date ON selection_lists(date DESC);
