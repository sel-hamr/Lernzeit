import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { CardType, TaskStatus } from '@/db/types'
import { CardEditorDialog } from '@/features/flashcards/CardEditor'
import { QuickAddDialog } from '@/features/flashcards/QuickAdd'
import { TaskEditorDialog } from '@/features/board/TaskEditor'
import { LogTimeDialog } from '@/features/today/LogTimeDialog'

export interface CardEditorRequest {
  cardId?: string
  deckId?: string
  type?: CardType
}

export interface TaskEditorRequest {
  taskId?: string
  status?: TaskStatus
  topicId?: string
  dueDate?: string
}

interface UIContextValue {
  openCardEditor: (req?: CardEditorRequest) => void
  openQuickAdd: () => void
  openTaskEditor: (req?: TaskEditorRequest) => void
  openLogTime: (topicId?: string) => void
}

const UIContext = createContext<UIContextValue | null>(null)

/** Owns the dialogs that can be opened from anywhere (header buttons, the "+" button, search). */
export function UIProvider({ children }: { children: ReactNode }) {
  const [cardEditor, setCardEditor] = useState<CardEditorRequest | null>(null)
  const [quickAdd, setQuickAdd] = useState(false)
  const [taskEditor, setTaskEditor] = useState<TaskEditorRequest | null>(null)
  const [logTime, setLogTime] = useState<{ topicId?: string } | null>(null)

  const openCardEditor = useCallback((req: CardEditorRequest = {}) => setCardEditor(req), [])
  const openQuickAdd = useCallback(() => setQuickAdd(true), [])
  const openTaskEditor = useCallback((req: TaskEditorRequest = {}) => setTaskEditor(req), [])
  const openLogTime = useCallback((topicId?: string) => setLogTime({ topicId }), [])

  const value = useMemo(
    () => ({ openCardEditor, openQuickAdd, openTaskEditor, openLogTime }),
    [openCardEditor, openQuickAdd, openTaskEditor, openLogTime],
  )

  return (
    <UIContext.Provider value={value}>
      {children}
      <CardEditorDialog request={cardEditor} onClose={() => setCardEditor(null)} />
      <QuickAddDialog
        open={quickAdd}
        onClose={() => setQuickAdd(false)}
        onMore={(deckId) => {
          setQuickAdd(false)
          setCardEditor({ deckId })
        }}
      />
      <TaskEditorDialog request={taskEditor} onClose={() => setTaskEditor(null)} />
      <LogTimeDialog request={logTime} onClose={() => setLogTime(null)} />
    </UIContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUI(): UIContextValue {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI must be used inside UIProvider')
  return ctx
}
