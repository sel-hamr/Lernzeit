import clsx from 'clsx'
import type { Card, Gender } from '@/db/types'
import { germanText } from '@/lib/german'

const genderClass: Record<Gender, string> = {
  der: 'text-der',
  die: 'text-die',
  das: 'text-das',
}

/** A German noun with its article coloured by gender (der blue, die red, das green). */
export function GermanWord({ word, gender, className }: { word: string; gender?: Gender; className?: string }) {
  return (
    <span className={className}>
      {gender && <span className={clsx(genderClass[gender])}>{gender} </span>}
      {word}
    </span>
  )
}

/** A card's German as a title: coloured article for nouns, "die Leute" for plural-only nouns, plain text otherwise. */
export function CardGerman({ card, className }: { card: Pick<Card, 'type' | 'german' | 'gender' | 'plural' | 'partOfSpeech'>; className?: string }) {
  if (card.type === 'word' && card.gender) return <GermanWord word={card.german} gender={card.gender} className={className} />
  return <span className={className}>{germanText(card)}</span>
}
