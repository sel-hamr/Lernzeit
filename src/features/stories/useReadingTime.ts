import { useCallback } from 'react'
import { useActiveStudyTime, type ActiveRun } from '@/data/studyTime'
import { recordReadingTime } from '@/data/timer'

/** Saves active reading time as a study session for the story's topic. */
export function useReadingTime({ storyId, title, topicId, enabled }: { storyId: string; title: string; topicId?: string; enabled: boolean }) {
  const save = useCallback((run: ActiveRun) => recordReadingTime({ ...run, title }), [title])
  useActiveStudyTime({ kind: 'reading', id: storyId, topicId, enabled, save })
}
