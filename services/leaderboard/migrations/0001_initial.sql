PRAGMA foreign_keys = ON;

CREATE TABLE players (
  player_id TEXT PRIMARY KEY NOT NULL,
  nickname TEXT,
  best_score INTEGER NOT NULL CHECK (best_score >= 0),
  best_achieved_at TEXT NOT NULL,
  total_runs INTEGER NOT NULL DEFAULT 0 CHECK (total_runs >= 0),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE runs (
  run_id TEXT PRIMARY KEY NOT NULL,
  player_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  rules_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE
);

CREATE INDEX players_leaderboard_idx
  ON players (best_score DESC, best_achieved_at ASC)
  WHERE nickname IS NOT NULL;

CREATE INDEX runs_player_created_idx
  ON runs (player_id, created_at DESC);

CREATE INDEX runs_created_idx
  ON runs (created_at DESC);
