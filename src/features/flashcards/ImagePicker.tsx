import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useImage } from '@/data/hooks'
import type { ImageChange } from '@/data/cards'
import { imageFromDataTransfer } from '@/lib/image'
import { pastelFor } from '@/lib/colors'

/**
 * Upload, paste (Ctrl+V anywhere in the editor) or drop an image. Resizing
 * happens on save. `pasteTarget` receives paste events.
 */
export function ImagePicker({
  currentImageId,
  emoji,
  seed,
  value,
  onChange,
  pasteTarget,
}: {
  currentImageId?: string
  /** Shown as a preview while there is no image. */
  emoji?: string
  seed: string
  value: ImageChange
  onChange: (change: ImageChange) => void
  pasteTarget: React.RefObject<HTMLElement | null>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const { url: storedUrl, fit } = useImage(value.kind === 'keep' ? currentImageId : undefined)
  const pendingUrl = useMemo(() => (value.kind === 'set' ? URL.createObjectURL(value.file) : undefined), [value])
  useEffect(() => () => (pendingUrl ? URL.revokeObjectURL(pendingUrl) : undefined), [pendingUrl])
  const url = pendingUrl ?? storedUrl

  useEffect(() => {
    const el = pasteTarget.current
    if (!el) return
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromDataTransfer(e.clipboardData)
      if (!file) return
      e.preventDefault()
      onChange({ kind: 'set', file })
    }
    el.addEventListener('paste', onPaste)
    return () => el.removeEventListener('paste', onPaste)
  }, [pasteTarget, onChange])

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = imageFromDataTransfer(e.dataTransfer)
        if (file) onChange({ kind: 'set', file })
      }}
      className={clsx(
        'relative flex h-42 items-center justify-center overflow-hidden rounded-img border transition-colors',
        dragging ? 'border-sage-dot border-dashed' : url ? 'border-transparent' : 'border-line-strong border-dashed',
      )}
      style={{ background: url || emoji ? pastelFor(seed) : undefined }}
    >
      {url ? (
        <>
          <img src={url} alt="Card image" className={clsx('size-full', fit === 'cover' && value.kind === 'keep' ? 'object-cover' : 'object-contain p-3')} />
          <div className="absolute right-2 bottom-2 flex gap-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="h-8 rounded-full bg-main/90 px-3 text-chip font-medium text-ink shadow-tab backdrop-blur hover:bg-main"
            >
              Replace
            </button>
            <button
              type="button"
              aria-label="Remove image"
              onClick={() => onChange(currentImageId && value.kind === 'set' ? { kind: 'keep' } : { kind: 'remove' })}
              className="flex size-8 items-center justify-center rounded-full bg-main/90 text-red-ink shadow-tab backdrop-blur hover:bg-main"
            >
              <Trash2 size={15} strokeWidth={1.8} />
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex size-full flex-col items-center justify-center gap-2 text-small text-muted hover:bg-soft"
        >
          {emoji ? <span className="font-emoji text-[56px] leading-none">{emoji}</span> : <ImagePlus size={22} strokeWidth={1.6} />}
          <span>
            <span className="font-medium text-ink">{emoji ? 'Replace with an image' : 'Upload an image'}</span>, drop one here, or paste with Ctrl+V
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onChange({ kind: 'set', file })
          e.target.value = ''
        }}
      />
    </div>
  )
}
