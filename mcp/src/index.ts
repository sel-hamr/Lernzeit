import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import pkg from '../package.json' with { type: 'json' }
import { readConfig, type ServerConfig } from './config.ts'
import { BrowserHub } from './hub.ts'
import { registerTools } from './tools.ts'

const INSTRUCTIONS = `Lernzeit is the user's study app: flashcards for German, daily study goals per topic and a task board.
Its data lives in the user's browser, so these tools work only while Lernzeit is open there with Settings → AI connection → Connect to AI on.
Look before you add: call list_decks before create_cards, and list_topics before naming a topic.
These tools only add things. Nothing can be edited or deleted through them.`

// stdout carries the MCP messages, so logs go to stderr.
const log = (message: string) => console.error(`[lernzeit] ${message}`)

let config: ServerConfig
try {
  config = readConfig()
} catch (error) {
  log((error as Error).message)
  process.exit(1)
}

const hub = new BrowserHub({ token: config.token, origins: config.origins, log })
await hub.start(config.port)

const stdio = serveStdio(
  () => {
    const server = new McpServer({ name: 'lernzeit', version: pkg.version }, { instructions: INSTRUCTIONS })
    registerTools(server, hub)
    return server
  },
  { onerror: (error) => log(error.message) },
)

let stopping = false
async function shutdown() {
  if (stopping) return
  stopping = true
  await Promise.allSettled([stdio.close(), hub.close()])
  process.exit(0)
}

// The AI app closes stdin when it quits; the WebSocket server would otherwise keep the process alive.
process.stdin.once('end', () => void shutdown())
process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
