import { exerciseProblem } from '../grammar'
import {
  MAX_GRAMMAR_EXAMPLES_PER_CALL,
  MAX_GRAMMAR_EXERCISES_PER_CALL,
  MAX_GRAMMAR_TEXT,
  MAX_RULE_CHARS,
  type AddGrammarParams,
  type AddGrammarResult,
  type GrammarTopicSummary,
} from '../protocol'
import type { GrammarTopic } from '../types'
import { byId, invalid, key, parseLevel, type ActionContext } from './shared'

/** Topics added without a section go here. */
const DEFAULT_GROUP = 'My topics'

type TopicInput = Pick<GrammarTopic, 'title' | 'english' | 'group' | 'level' | 'summary' | 'rule' | 'examples' | 'exercises' | 'drill'>

/** As the topic editor saves a topic. */
function normalizeTopic(input: TopicInput): TopicInput {
  const clean = (s?: string) => s?.trim() || undefined
  return {
    title: input.title.trim().replace(/\s+/g, ' '),
    english: clean(input.english),
    group: input.group.trim().replace(/\s+/g, ' ') || DEFAULT_GROUP,
    level: parseLevel(input.level),
    summary: clean(input.summary),
    rule: input.rule.trim(),
    examples: input.examples.flatMap(({ de, en }) => (de.trim() ? [en?.trim() ? { de: de.trim(), en: en.trim() } : { de: de.trim() }] : [])),
    exercises: input.exercises.flatMap(({ id, text, en, why }) =>
      text.trim() ? [{ id, text: text.trim(), ...(en?.trim() ? { en: en.trim() } : {}), ...(why?.trim() ? { why: why.trim() } : {}) }] : [],
    ),
    drill: input.drill,
  }
}

/** Saves a topic as the editor does. Exercises that were removed take their scores with them. */
function saveTopic(ctx: ActionContext, input: TopicInput, previous?: GrammarTopic): GrammarTopic {
  const topic: GrammarTopic = { ...normalizeTopic(input), id: previous?.id ?? ctx.newId(), createdAt: previous?.createdAt ?? ctx.now, updatedAt: ctx.now }
  if (!topic.drill) delete topic.drill
  ctx.store.put('grammarTopics', topic)
  if (previous) {
    const kept = new Set(topic.exercises.map((e) => e.id))
    for (const e of previous.exercises) if (!kept.has(e.id)) ctx.store.remove('exerciseStats', e.id)
  }
  return topic
}

function describeTopic(topic: GrammarTopic): GrammarTopicSummary {
  return { id: topic.id, title: topic.title, english: topic.english, level: topic.level, group: topic.group, exercises: topic.exercises.length }
}

export async function listGrammarTopics(_params: unknown, ctx: ActionContext): Promise<GrammarTopicSummary[]> {
  return (await ctx.store.list<GrammarTopic>('grammarTopics')).sort((a, b) => a.createdAt - b.createdAt || byId(a, b)).map(describeTopic)
}

/**
 * Adds a grammar topic, or exercises and examples to one. An existing topic
 * keeps its title, section and rule; a rule is only filled in when it has none.
 */
export async function addGrammar(params: AddGrammarParams, ctx: ActionContext): Promise<AddGrammarResult> {
  const { topic: name, english, group, level, summary, rule, examples = [], exercises = [] } = params
  const title = name.trim().replace(/\s+/g, ' ')
  if (!title) throw invalid('Name the topic.')
  if (title.length > MAX_GRAMMAR_TEXT) throw invalid(`Keep the topic title under ${MAX_GRAMMAR_TEXT} characters.`)
  if (exercises.length > MAX_GRAMMAR_EXERCISES_PER_CALL) throw invalid(`Send at most ${MAX_GRAMMAR_EXERCISES_PER_CALL} exercises per call.`)
  if (examples.length > MAX_GRAMMAR_EXAMPLES_PER_CALL) throw invalid(`Send at most ${MAX_GRAMMAR_EXAMPLES_PER_CALL} examples per call.`)
  if ((rule?.length ?? 0) > MAX_RULE_CHARS) throw invalid(`Keep the rule under ${MAX_RULE_CHARS} characters.`)
  if (level !== undefined && !parseLevel(level)) throw invalid('level must be one of A1, A2, B1, B2, C1 or C2.')
  exercises.forEach((e, i) => {
    if ([e.text, e.en, e.why].some((text) => (text?.length ?? 0) > MAX_GRAMMAR_TEXT)) throw invalid(`Keep exercise ${i + 1} under ${MAX_GRAMMAR_TEXT} characters per field.`)
    const problem = exerciseProblem(e.text)
    if (problem) throw invalid(`Exercise ${i + 1} ("${e.text.trim()}"): ${problem}.`)
  })
  examples.forEach((e, i) => {
    if (!e.de.trim()) throw invalid(`Example ${i + 1} needs text.`)
    if ([e.de, e.en].some((text) => (text?.length ?? 0) > MAX_GRAMMAR_TEXT)) throw invalid(`Keep example ${i + 1} under ${MAX_GRAMMAR_TEXT} characters.`)
  })

  const topics = (await ctx.store.list<GrammarTopic>('grammarTopics')).sort(byId)
  const existing = topics.find((t) => t.id === name) ?? topics.find((t) => key(t.title) === key(title))
  if (existing && !exercises.length && !examples.length && !rule?.trim()) throw invalid('Send exercises, examples or a rule to add to the topic.')
  if (!existing && !exercises.length && !rule?.trim()) throw invalid('A new topic needs a rule or some exercises.')

  const seen = new Set(existing?.exercises.map((e) => key(e.text)))
  const skipped: string[] = []
  const fresh = exercises.flatMap((e) => {
    if (seen.has(key(e.text))) {
      skipped.push(e.text.trim())
      return []
    }
    seen.add(key(e.text))
    return [{ id: ctx.newId(), text: e.text, en: e.en, why: e.why }]
  })
  const knownExamples = new Set(existing?.examples.map((e) => key(e.de)))
  const newExamples = examples.filter((e) => !knownExamples.has(key(e.de)) && knownExamples.add(key(e.de)))

  const saved = existing
    ? saveTopic(
        ctx,
        {
          ...existing,
          rule: existing.rule.trim() ? existing.rule : (rule ?? ''),
          examples: [...existing.examples, ...newExamples],
          exercises: [...existing.exercises, ...fresh],
        },
        existing,
      )
    : saveTopic(ctx, { title, english, group: group?.trim() || DEFAULT_GROUP, level, summary, rule: rule ?? '', examples: newExamples, exercises: fresh, drill: undefined })
  return { topic: describeTopic(saved), created: !existing, added: fresh.length, skipped }
}
