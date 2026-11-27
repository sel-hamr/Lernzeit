import type { D1Migration } from '@cloudflare/vitest-plugin'
import type { Env as WorkerEnv } from '../src/env.ts'

// `env` from cloudflare:workers is typed by the global Cloudflare.Env: give it the Worker's bindings
// and the migrations that vitest.config.ts passes in.
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[]
    }
  }
}
