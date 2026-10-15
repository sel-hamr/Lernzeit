import { DEFAULT_PORT } from '../../src/bridge/protocol.ts'

export interface ServerConfig {
  token: string
  port: number
  /** Page origins allowed to connect, e.g. http://localhost:5173. */
  origins: ReadonlySet<string>
}

/** The Vite dev server and `vite preview`. */
const LOCAL_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']

const normalizeOrigin = (origin: string) => origin.trim().replace(/\/+$/, '')

/** Reads LERNZEIT_TOKEN, LERNZEIT_PORT and LERNZEIT_ORIGINS. Throws a message meant for the person setting it up. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const token = env.LERNZEIT_TOKEN?.trim()
  if (!token) {
    throw new Error('LERNZEIT_TOKEN is not set. Make one with: node -e "console.log(crypto.randomUUID())"')
  }

  const port = env.LERNZEIT_PORT ? Number(env.LERNZEIT_PORT) : DEFAULT_PORT
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`LERNZEIT_PORT must be a port number, got "${env.LERNZEIT_PORT}".`)
  }

  const extra = (env.LERNZEIT_ORIGINS ?? '').split(',').map(normalizeOrigin).filter(Boolean)
  return { token, port, origins: new Set([...LOCAL_ORIGINS, ...extra]) }
}
