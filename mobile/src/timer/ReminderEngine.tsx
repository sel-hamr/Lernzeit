import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { useSettings } from '../data/settings'
import { useTodayView } from '../today/useTodayView'
import { cancelMatching, scheduleAt } from './notify'
import { planReminders } from './reminders'

/**
 * Keeps the goal reminders scheduled as local notifications (also while the app is closed): the set
 * times of the next days, today's skipped once its goals are met. Planned again when the goals, the
 * times or the day change, and when the app comes back to the front. Renders nothing.
 */
export function ReminderEngine() {
  const settings = useSettings()
  const view = useTodayView()
  const [fronts, setFronts] = useState(0)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && setFronts((n) => n + 1))
    return () => sub.remove()
  }, [])
  const open = view.progress.topics.filter((r) => r.goal > 0 && r.left > 0).map((r) => ({ name: r.topic.name, left: r.left }))
  const key = JSON.stringify([settings.remindersEnabled, settings.reminderTimes, open, view.today])

  useEffect(() => {
    let current = true
    void (async () => {
      await cancelMatching('lz-reminder')
      if (!current || !settings.remindersEnabled) return
      for (const r of planReminders({ times: settings.reminderTimes, now: Date.now(), open })) await scheduleAt(r.id, r.at, r.title, r.body, 'reminders')
    })()
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fronts])

  return null
}
