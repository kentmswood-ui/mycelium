CREATE TABLE IF NOT EXISTS skills (
  name TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'local',
  trust REAL NOT NULL DEFAULT 0.5,
  adopted_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  strength REAL NOT NULL DEFAULT 0.0,
  protected INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT
);
CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_name TEXT NOT NULL,
  tool TEXT NOT NULL,
  model TEXT,
  task TEXT NOT NULL,
  outcome TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_name TEXT NOT NULL,
  tool TEXT NOT NULL,
  model TEXT,
  outcome TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Every consult, with its verdict + which tool/model asked. The brain itself spends no LLM
-- tokens (it's local), but the verdict drives downstream host-model spend (searching/build do
-- research + dialogue). This log lets the cockpit show frequency by tool/model/verdict and a
-- tunable token ESTIMATE so the user can adjust how often they engage mycelium.
CREATE TABLE IF NOT EXISTS consult_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool TEXT NOT NULL,
  model TEXT,
  verdict TEXT NOT NULL,
  skill TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  task TEXT,
  source TEXT,
  source_url TEXT,
  trust REAL NOT NULL DEFAULT 0,
  risk TEXT,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Read-only log of what the search path found and what it did with each hit.
-- This is NOT an approval queue — the user never acts on these rows.
CREATE TABLE IF NOT EXISTS discoveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  source TEXT,
  tier TEXT,
  trust REAL NOT NULL DEFAULT 0,
  -- how this hit was handled: 'synthesized' | 'duplicate' | 'low-fit' | 'logged'
  disposition TEXT NOT NULL DEFAULT 'logged',
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Simple key/value settings the cockpit can read/write (e.g. enabled source tiers).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Recurrence counter: how many times a normalized task-shape has missed locally. The
-- expensive cascade steps (online research, build suggestion) only fire once a shape recurs.
CREATE TABLE IF NOT EXISTS misses (
  signature TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  sample_task TEXT,
  build_suggested INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Per-day tally of expensive actions (install proposals + build suggestions) for quota capping.
CREATE TABLE IF NOT EXISTS quota_log (
  day TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);
-- Negative learning: a skill that was wrong for a normalized task-shape (the agent ignored the
-- reuse, or feedback came back 'fail' with the task). The matcher suppresses a skill for a shape
-- once its misfit count crosses a threshold, so the same wrong suggestion stops recurring.
CREATE TABLE IF NOT EXISTS skill_misfits (
  signature TEXT NOT NULL,
  skill TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  last_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (signature, skill)
);
-- Ecosystem catalog: a KNOWLEDGE MAP of skills that exist out in the world (anthropics/skills,
-- antigravity-awesome-skills, skills.sh, skillsmp...), NOT skills installed locally. The brain
-- "knows what's out there" without installing it. This table is deliberately SEPARATE from the
-- `skills` table so the matcher's precision (tuned on the small installed corpus) is never diluted
-- by hundreds of catalog entries. consult only consults the catalog on a local miss, to suggest an
-- install — it never auto-matches against it.
--   tier:  'green'  = trusted source + clean scan → may be proposed for install
--          'yellow' = community/marketplace, clean scan → install needs explicit approval
--          'red'    = dangerous patterns or L3 risk → cataloged but NEVER installable
--   risk:  'L0'..'L3' coarse risk level; risk_flags = which dangerous patterns matched
CREATE TABLE IF NOT EXISTS catalog (
  content_hash TEXT PRIMARY KEY,   -- dedupe key (name+description+source normalized)
  name TEXT NOT NULL,
  purpose TEXT,                    -- one-line what-it-does (from description)
  source TEXT NOT NULL,            -- 'anthropics' | 'antigravity' | 'skills.sh' | 'skillsmp'
  url TEXT,
  domain TEXT,                     -- coarse category if known (dev/design/research/...)
  keywords TEXT,                   -- JSON array of trigger terms
  tier TEXT NOT NULL DEFAULT 'yellow',
  risk TEXT NOT NULL DEFAULT 'L0',
  risk_flags TEXT,                 -- comma-joined dangerous-pattern labels, '' when clean
  stars INTEGER,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_name ON catalog(name);
CREATE INDEX IF NOT EXISTS idx_catalog_tier ON catalog(tier);
