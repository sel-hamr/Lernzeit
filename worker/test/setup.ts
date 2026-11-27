import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'

// Every test file starts with an empty database that has the real schema.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
