import clsx from 'clsx'
import { ImageOff } from 'lucide-react'
import { useImage } from '@/data/hooks'
import { pastelFor } from '@/lib/colors'

/**
 * A card's picture on its soft pastel background (10px radius): the uploaded
 * image if there is one, otherwise its emoji, otherwise a quiet initial of
 * `label`. Everything is sized to fit the box. Photos are never cropped: the
 * full photo sits on a blurred copy of itself, unless `crop` asks otherwise.
 */
export function CardImage({
  imageId,
  emoji,
  label,
  seed,
  alt,
  className,
  imgClassName,
  placeholder = true,
  crop = false,
}: {
  imageId?: string
  emoji?: string
  /** Its first letter stands in when there is no picture (usually the German word). */
  label?: string
  /** Picks the pastel background; use the card id. */
  seed: string
  alt: string
  className?: string
  imgClassName?: string
  placeholder?: boolean
  /** Crop photos to fill the box, for thumbnails too small to show a whole photo. */
  crop?: boolean
}) {
  const { url, fit } = useImage(imageId)
  const backdrop = !crop && fit === 'cover'
  return (
    <div
      className={clsx('relative flex items-center justify-center overflow-hidden rounded-img @container-size', className)}
      style={{ background: pastelFor(seed) }}
    >
      {url && backdrop ? (
        <>
          <img src={url} alt="" aria-hidden draggable={false} className="absolute inset-0 size-full scale-110 object-cover opacity-60 blur-xl" />
          <img src={url} alt={alt} draggable={false} className={clsx('relative size-full object-contain', imgClassName)} />
        </>
      ) : url ? (
        <img
          src={url}
          alt={alt}
          draggable={false}
          className={clsx('size-full', fit === 'cover' ? 'object-cover' : 'object-contain p-[6%]', imgClassName)}
        />
      ) : emoji && !imageId ? (
        <span
          role="img"
          aria-label={alt}
          className="font-emoji text-[min(56cqh,48cqw)] leading-none select-none"
        >
          {emoji}
        </span>
      ) : label && !imageId && placeholder ? (
        <span aria-hidden className="text-[min(46cqh,40cqw)] leading-none font-semibold text-on-pastel/15 select-none">
          {initial(label)}
        </span>
      ) : (
        placeholder && !imageId && <ImageOff size={22} strokeWidth={1.5} className="text-on-pastel/25" aria-hidden />
      )}
    </div>
  )
}

/** First letter of the word, skipping articles: "der Hund" -> "H". */
function initial(text: string): string {
  const word = text.replace(/^(der|die|das)\s+/i, '').trim()
  return [...word][0]?.toUpperCase() ?? ''
}
