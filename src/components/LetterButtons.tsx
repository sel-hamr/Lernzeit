import { useLanguage } from '@/data/hooks'

/** Buttons for the letters of the language you learn that a keyboard may not have, such as ä or é. */
export function LetterButtons({ onLetter }: { onLetter: (letter: string) => void }) {
  const { letters } = useLanguage()
  if (!letters.length) return null
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {letters.map((ch) => (
        <button
          key={ch}
          type="button"
          onClick={() => onLetter(ch)}
          className="h-7 min-w-8 rounded-md border border-line bg-main px-1.5 text-small text-ink hover:bg-field"
        >
          {ch}
        </button>
      ))}
    </div>
  )
}
