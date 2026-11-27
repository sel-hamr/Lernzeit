import { useState } from 'react'
import clsx from 'clsx'
import { Check, Search } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { findThemes, THEME_GROUPS, type ThemeGroup } from '@lernzeit/core/storyThemes'

/**
 * Every theme idea, by group, with a search. Picking one puts its scene in
 * the theme box and closes the popup.
 */
export function ThemeIdeasDialog({ open, onClose, theme, onPick }: { open: boolean; onClose: () => void; theme: string; onPick: (scene: string) => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Theme ideas" description="Pick a scene for your story. It goes in the theme box, where you can still change it." size="lg">
      {open && (
        <ThemeIdeasList
          theme={theme}
          onPick={(scene) => {
            onPick(scene)
            onClose()
          }}
        />
      )}
    </Dialog>
  )
}

function ThemeIdeasList({ theme, onPick }: { theme: string; onPick: (scene: string) => void }) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<ThemeGroup | undefined>()
  const themes = findThemes(query, group)
  const current = theme.trim()

  return (
    <div className="flex flex-col gap-3 pb-1">
      <label className="flex h-10 items-center gap-2 rounded-img border border-line bg-field px-3 text-muted transition-colors focus-within:border-line-strong">
        <Search size={15} strokeWidth={1.8} aria-hidden />
        <input
          type="search"
          aria-label="Find a theme"
          placeholder="Find a theme, such as train or birthday…"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full min-w-0 bg-transparent text-small text-ink outline-none placeholder:text-muted"
        />
      </label>

      <div role="group" aria-label="Theme groups" className="flex flex-wrap gap-1.5">
        {[undefined, ...THEME_GROUPS].map((g) => (
          <button
            key={g ?? 'all'}
            type="button"
            aria-pressed={group === g}
            onClick={() => setGroup(g)}
            className={clsx(
              'h-7 rounded-full border px-2.5 text-chip font-medium transition-colors',
              group === g ? 'border-button-dark bg-button-dark text-on-dark' : 'border-line bg-main text-ink-2 hover:border-line-strong hover:text-ink',
            )}
          >
            {g ?? 'All'}
          </button>
        ))}
      </div>

      {themes.length === 0 ? (
        <p className="py-8 text-center text-small text-muted">No theme matches “{query.trim()}”.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {themes.map((t) => {
            const on = current === t.scene
            return (
              <li key={t.name}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(t.scene)}
                  className={clsx(
                    'flex h-full w-full flex-col gap-1 rounded-row border px-3.5 py-3 text-left transition-colors',
                    on ? 'border-sage-border bg-sage' : 'border-line bg-main hover:border-line-strong hover:bg-soft',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={clsx('min-w-0 flex-1 truncate text-small font-medium', on ? 'text-sage-ink' : 'text-ink')}>{t.name}</span>
                    {on ? <Check size={14} strokeWidth={2.4} aria-hidden className="shrink-0 text-sage-ink" /> : !group && <span className="shrink-0 text-chip text-muted">{t.group}</span>}
                  </span>
                  <span className="line-clamp-3 text-chip leading-relaxed text-muted">{t.scene}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
