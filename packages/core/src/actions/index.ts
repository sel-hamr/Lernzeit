/*
 * The AI tools' actions, run against the owner's library. Each call reads
 * the library, stages its writes and commits them in one go at the end, so a
 * call that fails writes nothing. Local dates are in the owner's time zone.
 */
import { stageWrites, type LibraryStore } from '../library'
import type { ActionName, ActionParams, ActionResult } from '../protocol'
import { addGrammar, listGrammarTopics } from './grammar'
import { createCards, deleteCards, listCards, moveCards } from './cards'
import { createDeck, deleteDeck, listDecks } from './decks'
import { createDoc, listDocs, readDoc } from './docs'
import { createQuestions } from './questions'
import { createStory } from './stories'
import { invalid, type Handler } from './shared'
import { createTask } from './tasks'
import { logStudyTime } from './time'
import { listTopics } from './topics'

export { AI_TAG } from './shared'

const handlers: { [A in ActionName]: Handler<A> } = {
  list_topics: listTopics,
  list_decks: listDecks,
  list_cards: listCards,
  create_deck: createDeck,
  create_cards: createCards,
  move_cards: moveCards,
  delete_cards: deleteCards,
  delete_deck: deleteDeck,
  create_story: createStory,
  create_questions: createQuestions,
  list_grammar_topics: listGrammarTopics,
  add_grammar: addGrammar,
  list_docs: listDocs,
  read_doc: readDoc,
  create_doc: createDoc,
  create_task: createTask,
  log_study_time: logStudyTime,
}

/**
 * Runs one tool call. Its writes reach `store` only once the action has
 * finished, followed by a single `commit()`; when the action throws, `store`
 * gets no write and no commit. Errors the AI should read are `BridgeError`s.
 */
export async function runAction<A extends ActionName>(store: LibraryStore, action: A, params: ActionParams<A>): Promise<ActionResult<A>> {
  if (!Object.hasOwn(handlers, action)) throw invalid(`Unknown action "${action}".`)
  const handler: Handler<A> = handlers[action]
  const staged = stageWrites(store)
  const result = await handler(params ?? ({} as ActionParams<A>), {
    store: staged,
    now: store.now(),
    timeZone: store.timeZone,
    newId: () => crypto.randomUUID(),
  })
  for (const change of staged.changes()) {
    if (change.data) store.put(change.tbl, change.data)
    else store.remove(change.tbl, change.id)
  }
  await store.commit()
  return result
}
