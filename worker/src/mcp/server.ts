import { McpServer } from '@modelcontextprotocol/server'
import { CfWorkerJsonSchemaValidator } from '@modelcontextprotocol/server/validators/cf-worker'
import pkg from '../../package.json' with { type: 'json' }
import type { Env } from '../env.ts'
import { registerGuide } from './prompts.ts'
import { registerTools } from './tools.ts'

export const INSTRUCTIONS = `Lernzeit is the user's study app: flashcards for German, daily study goals per topic and a task board.
These tools work on the user's Lernzeit cloud library, and what they change reaches the user's devices on the next sync.
Look before you add: call list_decks before create_cards, and list_topics before naming a topic.
These tools add things, and for cards also read (list_cards), move (move_cards) and delete (delete_cards), and delete a whole deck (delete_deck). delete_cards and delete_deck remove cards with their progress: call them only when the user asks, after naming the cards or the deck and its card count back to them. Card fields cannot be edited.
The Docs page holds general Markdown the user saved to read: list_docs, read_doc and create_doc. It is not study material, and existing docs cannot be changed.
The resource lernzeit://guide has the details, including how to write good German cards.`

/** One server for one request: the tools read and write `ownerId`'s library in D1. */
export function buildServer(env: Env, ownerId: string): McpServer {
  // workerd has no eval, which the default validator's compiled schemas would need.
  const server = new McpServer(
    { name: 'lernzeit', version: pkg.version },
    { instructions: INSTRUCTIONS, jsonSchemaValidator: new CfWorkerJsonSchemaValidator() },
  )
  registerTools(server, env, ownerId)
  registerGuide(server)
  return server
}
