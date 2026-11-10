CREATE TABLE IF NOT EXISTS name_tool_surveys (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  challenges TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  marketing INTEGER NOT NULL DEFAULT 0 CHECK (marketing IN (0,1)),
  privacy_version TEXT NOT NULL,
  release_key TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  grant_hash TEXT NOT NULL,
  grant_expires INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS name_tool_grant ON name_tool_surveys(grant_hash);
CREATE INDEX IF NOT EXISTS name_tool_email_created ON name_tool_surveys(email,created_at);
CREATE INDEX IF NOT EXISTS name_tool_created ON name_tool_surveys(created_at);
CREATE TABLE IF NOT EXISTS name_tool_release_chunks (
  release_key TEXT NOT NULL,
  file_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (release_key,file_id,chunk_index)
);
