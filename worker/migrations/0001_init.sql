CREATE TABLE owner (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, iterations INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE auth_tokens (token_hash TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('web', 'device')), name TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER NOT NULL);
CREATE TABLE login_attempts (ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX login_attempts_ip ON login_attempts (ip, at);
CREATE TABLE counters (owner TEXT PRIMARY KEY, seq INTEGER NOT NULL);
CREATE TABLE records (owner TEXT NOT NULL, tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, seq INTEGER NOT NULL, PRIMARY KEY (owner, tbl, id));
CREATE INDEX records_seq ON records (owner, seq, tbl, id);
CREATE TABLE blobs (owner TEXT NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, bytes BLOB NOT NULL, PRIMARY KEY (owner, id));
