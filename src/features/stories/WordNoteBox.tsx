import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import clsx from 'clsx'
import { isTypingTarget } from '@/lib/browser'
import { placeNote, type NotePlacement } from './notePosition'

/** Clicks on these keep the box open: another word opens its own note, and the card beside the story belongs to this one. */
const KEEPS_OPEN = '[data-word], [data-word-panel]'

/** How long the closing animation in index.css runs. A timer rather than animationend, which never fires on a hidden page. */
const CLOSING_MS = 180

/** A box that grows out of a word of the story, floats above it and follows it as the page scrolls. */
export function WordNoteBox({
  anchor,
  label,
  wide,
  onClose,
  children,
}: {
  anchor: RefObject<HTMLElement | null>
  label: string
  /** Room for the note's second column. */
  wide: boolean
  onClose: () => void
  children: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<NotePlacement>()
  const [closing, setClosing] = useState(false)

  useLayoutEffect(() => {
    const update = () => {
      const word = anchor.current
      const content = box.current
      if (!word || !content) return
      // Sizes without transforms: the animation scales the box, and these must not change with it.
      setPlace(
        placeNote(
          word.getBoundingClientRect(),
          { width: content.offsetWidth, height: content.scrollHeight },
          { width: document.documentElement.clientWidth, height: window.innerHeight, left: word.closest('main')?.getBoundingClientRect().left },
        ),
      )
    }
    update()
    // Capturing, so scrolling any part of the page moves the box too.
    window.addEventListener('scroll', update, { capture: true, passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, { capture: true })
      window.removeEventListener('resize', update)
    }
  }, [anchor])

  useEffect(() => {
    const onPress = (e: PointerEvent) => {
      const target = e.target as Element
      if (!box.current?.contains(target) && !target.closest(KEEPS_OPEN)) setClosing(true)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTypingTarget(e.target)) return
      // Escape closes the note first; the reader's own handler then clears the word on the next press.
      e.stopPropagation()
      setClosing(true)
    }
    document.addEventListener('pointerdown', onPress)
    window.addEventListener('keydown', onKey, { capture: true })
    return () => {
      document.removeEventListener('pointerdown', onPress)
      window.removeEventListener('keydown', onKey, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(onClose, CLOSING_MS)
    return () => clearTimeout(timer)
  }, [closing, onClose])

  return (
    <div
      ref={box}
      role="dialog"
      aria-label={label}
      style={{
        left: place?.left,
        top: place?.top,
        maxHeight: place?.maxHeight,
        transformOrigin: place && `${place.originX}px ${place.originY}px`,
        visibility: place ? undefined : 'hidden',
      }}
      className={clsx(
        'fixed z-40 max-w-[calc(100vw-24px)] scrollbar-none overflow-y-auto rounded-section border border-line bg-main shadow-float',
        closing ? 'animate-note-out' : 'animate-note-in',
        wide ? 'w-145' : 'w-80',
      )}
    >
      {children}
    </div>
  )
}
