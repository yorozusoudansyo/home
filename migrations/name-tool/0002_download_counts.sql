CREATE TABLE IF NOT EXISTS name_tool_download_events (
  id TEXT PRIMARY KEY,
  response_id TEXT NOT NULL REFERENCES name_tool_surveys(id),
  release_key TEXT NOT NULL,
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  downloaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS name_tool_download_response ON name_tool_download_events(response_id);
CREATE INDEX IF NOT EXISTS name_tool_download_file ON name_tool_download_events(file_id,downloaded_at);
