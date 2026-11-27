import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router'
import clsx from 'clsx'
import { Settings } from 'lucide-react'
import { Dialog } from '@/components/ui/Dialog'
import { useFeatures } from '@/app/plugins'
import { menuItems } from './nav'
import { SyncRow } from './SyncRow'
import { SidebarVoiceSelect } from './VoiceSelect'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  clsx(
    'flex h-11 items-center gap-3 rounded-img border px-3 text-body transition-colors',
    isActive ? 'border-line bg-field font-semibold text-ink' : 'border-transparent text-ink-2 hover:bg-field hover:text-ink',
  )

/**
 * The phone's menu, a sheet from the bottom: the pages that are not on the bottom bar, Settings,
 * the voice and the sync status. It closes on navigation, Escape and a tap outside (the Dialog does the last two).
 */
export function PhoneMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname, hash } = useLocation()
  const items = menuItems(useFeatures())

  // Closes when the place changes, not on the first render.
  const lastPlace = useRef(pathname + hash)
  useEffect(() => {
    if (lastPlace.current === pathname + hash) return
    lastPlace.current = pathname + hash
    onClose()
    // onClose is a new function each render; only a change of place closes the menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hash])

  return (
    <Dialog open={open} onClose={onClose} title="Menu" size="sm">
      {/* A tap on a link closes it, also when the link points at the page you are on. */}
      <div onClick={(e) => (e.target as HTMLElement).closest('a') && onClose()} className="flex flex-col gap-3">
        <nav aria-label="Menu" className="flex flex-col gap-0.5">
          {items.map(({ id, path, label, icon: Icon, badge: Badge }) => (
            <NavLink key={id} to={path} className={linkClass}>
              <Icon size={18} strokeWidth={1.7} aria-hidden />
              <span className="flex-1">{label}</span>
              {Badge && <Badge />}
            </NavLink>
          ))}
          <NavLink to="/settings" className={linkClass}>
            <Settings size={18} strokeWidth={1.7} aria-hidden />
            <span className="flex-1">Settings</span>
          </NavLink>
        </nav>
        <div className="flex flex-col gap-0.5 border-t border-line pt-3">
          <SidebarVoiceSelect />
          <SyncRow />
        </div>
      </div>
    </Dialog>
  )
}
