-- First-party page loads only. No IP, email, referrer, cookie, or persistent user ID.
CREATE TABLE IF NOT EXISTS name_tool_page_views (
  id TEXT PRIMARY KEY,
  viewed_at TEXT NOT NULL,
  day_jst TEXT NOT NULL,
  is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0,1))
);
CREATE INDEX IF NOT EXISTS name_tool_page_views_day ON name_tool_page_views(day_jst,is_test);
