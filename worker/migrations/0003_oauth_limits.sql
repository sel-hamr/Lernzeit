-- Per-address limits on the OAuth routes that anyone can call without signing in (/register and
-- the authorize page), kept in D1 so a flood is refused before it costs a KV write. One row per
-- request inside the window; `bucket` names the route. See worker/src/rateLimit.ts.
CREATE TABLE oauth_hits (bucket TEXT NOT NULL, ip TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX oauth_hits_by_ip ON oauth_hits (bucket, ip, at);
