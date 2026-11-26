/*
 * Grammar over the local library, with the web's rules (src/data/grammar.ts, drills.ts): a topic
 * saved without some exercises takes their scores with it, and every answer in a round updates
 * the exercise's or card drill's stat.
 */
import { nextStat } from '@lernzeit/core/drills'
import { nextExerciseStat, normalizeTopic, type TopicInput } from '@lernzeit/core/grammar'
import type { DrillKind, DrillStat, ExerciseStat, GrammarTopic } from '@lernzeit/core/types'
import { newId } from '../data/ids'
import type { LocalLibrary } from '../store/library'
import { useLiveQuery } from '../store/live'

export const useGrammarTopics = (): GrammarTopic[] => useLiveQuery(['grammarTopics'], (l) => l.list<GrammarTopic>('grammarTopics').sort((a, b) => a.createdAt - b.createdAt), [])
export const useGrammarTopic = (id: string): GrammarTopic | undefined => useLiveQuery(['grammarTopics'], (l) => l.get<GrammarTopic>('grammarTopics', id), [id])
export const useExerciseStats = (): ExerciseStat[] => useLiveQuery(['exerciseStats'], (l) => l.list<ExerciseStat>('exerciseStats'), [])
export const useDrillStats = (): DrillStat[] => useLiveQuery(['drillStats'], (l) => l.list<DrillStat>('drillStats'), [])

export function saveTopic(library: LocalLibrary, input: TopicInput, existingId?: string): GrammarTopic {
  const data = normalizeTopic(input)
  if (!data.title) throw new Error('A topic needs a title')
  return library.write(() => {
    const now = Date.now()
    const previous = existingId ? library.get<GrammarTopic>('grammarTopics', existingId) : undefined
    const topic: GrammarTopic = { ...data, id: previous?.id ?? newId(), createdAt: previous?.createdAt ?? now, updatedAt: now }
    if (!topic.drill) delete topic.drill
    library.put('grammarTopics', topic)
    if (previous) {
      const kept = new Set(topic.exercises.map((e) => e.id))
      for (const e of previous.exercises) if (!kept.has(e.id)) library.remove('exerciseStats', e.id)
    }
    return topic
  })
}

export function deleteTopic(library: LocalLibrary, id: string): void {
  library.write(() => {
    library.remove('grammarTopics', id)
    for (const sid of library.listIds('exerciseStats', { topicId: id })) library.remove('exerciseStats', sid)
  })
}

export function saveExerciseAnswer(library: LocalLibrary, topicId: string, exerciseId: string, correct: boolean, now = Date.now()): ExerciseStat {
  const stat = nextExerciseStat(library.get<ExerciseStat>('exerciseStats', exerciseId), topicId, exerciseId, correct, now)
  library.put('exerciseStats', stat)
  return stat
}

export function saveDrillAnswer(library: LocalLibrary, cardId: string, drill: DrillKind, correct: boolean, now = Date.now()): DrillStat {
  const stat = nextStat(library.get<DrillStat>('drillStats', `${cardId}:${drill}`), cardId, drill, correct, now)
  library.put('drillStats', stat)
  return stat
}
