import { PRACTICE_RETURN } from './queue'
import { STORY_THEMES } from './storyThemes'

/**
 * The tour of the app that follows the welcome screen, and that Settings can
 * start again. Each stop points at one part of a page and says why it helps
 * you learn. src/app/Tour.tsx runs it with driver.js.
 */
export interface TourStop {
  id: string
  /** The feature it shows (a plugin id). The stop is left out while that feature is off. */
  feature?: string
  /** What the stop needs to make sense; it is left out without it. */
  needs?: TourNeed[]
  /** The page it is on, and may hold `:story`. A stop without one stays on the page you are on. */
  path?: string
  /** What it points at, as a CSS selector that may hold `:story`. A stop without one sits in the middle of the screen. */
  target?: string
  /** Something the tour does on the page first, such as tapping a word to open its note. */
  prepare?: TourAction
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  title: string
  /** HTML written here, never anything you typed, so it is safe to render. */
  body: string
}

/**
 * cards: there are cards to practise. story: there is a story to open.
 * recall: practice shows Show answer, not a typing box. wide: the reader has
 * room for the word panel beside the story.
 */
export type TourNeed = 'cards' | 'story' | 'recall' | 'wide'

/** reveal-answer: presses Show answer on the practice screen. open-word-note: taps a word that has a note. */
export type TourAction = 'reveal-answer' | 'open-word-note'

/** What this browser has, which decides the stops that make sense. */
export interface TourFacts {
  cards: boolean
  /** The story the tour opens: the first one in the list with word notes, else the first one. */
  story?: string
  recall: boolean
  wide: boolean
}

/** The attribute a page puts on what a stop points at: <div data-tour="today-goals">. */
export function tourTarget(name: string): string {
  return `[data-tour="${name}"]`
}

/** "Why it helps": the reason under each stop. */
function why(text: string): string {
  return `<p class="lz-tour-why"><span>Why it helps</span>${text}</p>`
}

function hint(text: string): string {
  return `<p class="lz-tour-hint">${text}</p>`
}

/**
 * The forgetting curve: memory drops fast after you learn a word, and each
 * practice brings it back and makes the next drop slower.
 */
export const FORGETTING_CURVE = `<figure class="lz-tour-figure">
<svg viewBox="0 0 280 104" role="img" aria-label="Without practice, memory of a word drops fast. Each practice brings it back, and it fades more slowly every time.">
<path class="lz-tour-grid" d="M8 10H272M8 86H272"/>
<path class="lz-tour-forget" d="M8 10C16 58 42 80 272 84"/>
<path class="lz-tour-recall" pathLength="1" d="M8 10C15 40 34 54 72 58V10C86 30 106 40 142 44V10C160 22 188 28 216 30V10C236 15 254 18 272 19"/>
<circle class="lz-tour-dot" cx="72" cy="10" r="3.5"/><circle class="lz-tour-dot" cx="142" cy="10" r="3.5"/><circle class="lz-tour-dot" cx="216" cy="10" r="3.5"/>
<text x="8" y="100">learned</text><text x="72" y="100" text-anchor="middle">practise</text><text x="142" y="100" text-anchor="middle">practise</text><text x="216" y="100" text-anchor="middle">practise</text>
</svg>
<figcaption><span class="lz-tour-key lz-tour-key-recall"></span>with practice<span class="lz-tour-key lz-tour-key-forget"></span>without</figcaption>
</figure>`

const [AGAIN, HARD, GOOD] = [PRACTICE_RETURN[1], PRACTICE_RETURN[2], PRACTICE_RETURN[3]]

/** How a story from your decks gets written, step by step. */
const STORY_STEPS = `<ol class="lz-tour-steps">
<li>Tick the decks: one, several or all of them.</li>
<li>Pick a level and a length, and say what it is about, or take one of ${STORY_THEMES.length} theme ideas.</li>
<li>Copy the prompt and paste it into Claude.</li>
<li>Claude saves the story to your library, and it syncs here.</li>
</ol>`

/** The reader's highlight colours, drawn with its own classes. */
const WORD_COLOURS = `<div class="lz-tour-words">
<span><span class="lz-tour-word lz-tour-word-new">Haus</span>in a deck, not studied yet</span>
<span><span class="lz-tour-word lz-tour-word-learning">gehen</span>learning</span>
<span><span class="lz-tour-word lz-tour-word-known">gut</span>known</span>
<span><span class="lz-tour-word">Wald</span>not in a deck: tap to add</span>
</div>`

export const TOUR_STOPS: TourStop[] = [
  {
    id: 'welcome',
    title: 'Welcome to Lernzeit',
    body:
      '<p>Take a few minutes to walk through the app. Each stop shows one part of it, how it works, and why it helps you learn faster and remember longer.</p>' +
      hint('Use the buttons or the arrow keys. Esc ends the tour.'),
  },
  {
    id: 'today',
    feature: 'today',
    path: '/',
    target: tourTarget('today-goals'),
    side: 'bottom',
    align: 'start',
    title: 'Today: your daily plan',
    body:
      '<p>Every topic has a daily goal in minutes. The bars fill as you study, with the timer, flashcards, stories or grammar.</p>' +
      why('A little every day beats one long session a week. Short, regular practice is what your memory keeps.'),
  },
  {
    id: 'decks',
    feature: 'flashcards',
    path: '/flashcards',
    target: tourTarget('flashcards-decks'),
    side: 'bottom',
    align: 'start',
    title: 'Flashcards: your decks',
    body:
      '<p>Each deck is a tab with its number of cards, and the decks that don’t fit wait behind <b>more</b>, with a search. Open one to see its cards: tap a card for its picture, examples and forms, or add your own with <b>Add card</b>.</p>',
  },
  {
    id: 'flashcards',
    feature: 'flashcards',
    path: '/flashcards',
    target: tourTarget('flashcards-practise'),
    side: 'bottom',
    align: 'end',
    title: 'Practise: words that stay',
    body:
      '<p>You forget most of a new word within a few days. Each time you pull it back from memory, just as it starts to fade, it stays longer. This is spaced recall, the best-tested way to remember.</p>' +
      FORGETTING_CURVE +
      '<p><b>Practise deck</b> asks every card of the open deck, and <b>Practise</b> on All asks every deck. First you pick the directions: picture → German, English → German or German → English.</p>',
  },
  {
    id: 'practice-card',
    feature: 'flashcards',
    needs: ['cards', 'recall'],
    path: '/flashcards/review?cards=all',
    target: tourTarget('practice-card'),
    side: 'bottom',
    align: 'center',
    title: 'Answer from memory first',
    body:
      '<p>A card shows one side. Say the answer in your head, or out loud, before you look. Then press <b>Show answer</b> or Space.</p>' +
      why('Trying to remember, even when you get it wrong, teaches more than reading the answer again.'),
  },
  {
    id: 'practice-rate',
    feature: 'flashcards',
    needs: ['cards', 'recall'],
    path: '/flashcards/review?cards=all',
    prepare: 'reveal-answer',
    target: tourTarget('practice-rate'),
    side: 'top',
    align: 'center',
    title: 'Rate how well you knew it',
    body:
      `<p>Be honest: the rating decides when the card comes back in this session. <b>Again</b> brings it back ${AGAIN} cards later, <b>Hard</b> after ${HARD}, <b>Good</b> after ${GOOD}, and <b>Easy</b> means you know it.</p>` +
      '<p>The session ends when every card is Easy. Keys 1 to 4 rate too. Each session is saved in Practice history, the clock on Flashcards.</p>' +
      why('Hard cards come back soon and easy ones step aside, so your time goes to the words you don’t know yet.'),
  },
  {
    id: 'stories',
    feature: 'stories',
    path: '/stories',
    target: tourTarget('stories-ai'),
    side: 'bottom',
    align: 'end',
    title: 'Stories: write one with AI',
    body:
      '<p><b>Write with AI</b> asks Claude for a story made of the words you are learning:</p>' +
      STORY_STEPS +
      why('Your brain keeps a story far better than a list. A word met inside a scene comes with a picture and the words around it, so it is easier to find again.'),
  },
  {
    id: 'story-card',
    feature: 'stories',
    needs: ['story'],
    path: '/stories',
    target: 'a[href="/stories/:story"]',
    side: 'right',
    align: 'start',
    title: 'Pick a story you can read',
    body:
      '<p>Each story shows its level and how much of it is in your decks. The bar fills with the words you know and are learning.</p>' +
      why('You learn new words best when almost every other word is familiar, so start with stories that are mostly in your decks.'),
  },
  {
    id: 'reader',
    feature: 'stories',
    needs: ['story'],
    path: '/stories/:story',
    target: tourTarget('reader-text'),
    side: 'top',
    align: 'start',
    title: 'Read with your decks',
    body:
      '<p>Words from your decks light up by how well you know them, and nouns take the colour of <span class="lz-tour-der">der</span>, <span class="lz-tour-die">die</span> or <span class="lz-tour-das">das</span>.</p>' +
      WORD_COLOURS +
      '<p>The speaker next to each paragraph reads it out loud, and <b>Translation</b> shows it in English.</p>',
  },
  {
    id: 'word-note',
    feature: 'stories',
    needs: ['story'],
    path: '/stories/:story',
    prepare: 'open-word-note',
    target: tourTarget('word-note'),
    side: 'bottom',
    align: 'start',
    title: 'Tap any word',
    body:
      '<p>A note pops up with what the word means here and why it has this form, such as a case ending or a past tense. The speaker says it for you.</p>' +
      why('Seeing why a word changes teaches the grammar in passing, right where you need it.'),
  },
  {
    id: 'word-card',
    feature: 'stories',
    needs: ['story', 'wide'],
    path: '/stories/:story',
    target: '[data-word-panel]',
    side: 'left',
    align: 'start',
    title: 'Its card, or a new one',
    body:
      '<p>Beside the story you see the word’s card with its picture and translation. A word that is not in a deck yet gets <b>Add to a deck</b>, so a new word becomes a card in one click.</p>' +
      why('Words you meet while reading are the ones worth learning, and they come with a sentence to remember them by.'),
  },
  {
    id: 'timer',
    feature: 'timer',
    path: '/timer',
    target: tourTarget('timer-clock'),
    side: 'right',
    align: 'start',
    title: 'Focus timer: time that counts',
    body:
      '<p>Pick a topic, press start and do only that until the bell. Focus blocks with short breaks get more done than hours of half attention.</p>' +
      why('Every focused minute counts toward today’s goal, so you see the time you really studied, not the time you sat there.'),
  },
  {
    id: 'board',
    feature: 'board',
    path: '/board',
    target: tourTarget('board-add'),
    side: 'bottom',
    align: 'end',
    title: 'Board: park the idea, keep the focus',
    body:
      '<p>An idea or a to-do comes up in the middle of a focus block? Write it down here in a few seconds and go straight back to work.</p>' +
      why('Once a thought is written down, your head lets go of it. You stay focused and lose nothing.'),
  },
  {
    id: 'history',
    feature: 'history',
    path: '/history',
    target: tourTarget('history-stats'),
    side: 'bottom',
    align: 'start',
    title: 'History: see how you are doing',
    body:
      '<p>Your weeks at a glance: hours per topic, the days you hit every goal, and a year of study days in the heatmap. Tap any day to see what you did.</p>' +
      why('Progress you can see keeps you going. A growing streak is a good reason to study today too.'),
  },
  {
    id: 'docs',
    feature: 'docs',
    path: '/docs',
    target: tourTarget('docs-new'),
    side: 'bottom',
    align: 'end',
    title: 'Docs: notes next to your study',
    body:
      '<p>Save Markdown notes, grammar summaries or anything you want to read again. They open like a clean README, with headings to jump between.</p>' +
      why('Writing a rule down in your own words is a second way to learn it, and your AI can save docs here too.'),
  },
  {
    id: 'ai',
    path: '/settings',
    target: '#claude',
    side: 'top',
    align: 'start',
    title: 'Connect Claude',
    body:
      '<p>Connect Claude under <b>Settings → Claude</b> and it works in Lernzeit through MCP, also from your phone: it adds cards and decks, writes stories from your decks, saves docs and logs study time.</p>' +
      hint('Try asking: “Make 20 cards for ordering food, and a short story that uses them.”') +
      why('Making cards takes minutes, not an evening, so your time goes into practice. What Claude saves reaches every device on the next sync.'),
  },
  {
    id: 'audio',
    path: '/settings',
    target: '#flashcards-audio',
    side: 'top',
    align: 'start',
    title: 'Hear every word',
    body:
      '<p>Pick a voice and a speed. Cards and stories read words out loud, typing mode checks your spelling, and listening mode asks you to write what you hear.</p>' +
      why('Hearing and saying a word gives your memory one more way back to it.'),
  },
  {
    id: 'features',
    path: '/settings',
    target: '#features',
    side: 'top',
    align: 'start',
    title: 'Make it yours',
    body: '<p>Turn off what you don’t use and it leaves the menu. Nothing you saved in it is deleted, and you can turn it back on any time.</p>',
  },
  {
    id: 'done',
    path: '/',
    title: 'You’re ready',
    body:
      '<p>A good day in Lernzeit: start the timer, practise a deck, read a story and tap the words you don’t know. Ideas that pop up go on the board.</p>' +
      hint('You can take this tour again any time from Settings.'),
  },
]

/** What a stop needs that this browser has. */
function hasNeed(need: TourNeed, facts: TourFacts): boolean {
  return need === 'story' ? !!facts.story : facts[need]
}

/**
 * The stops to show: without those for features that are turned off or that
 * need what this browser lacks, with `:story` filled in.
 */
export function tourStops(enabledFeatures: readonly string[], facts: TourFacts, stops: readonly TourStop[] = TOUR_STOPS): TourStop[] {
  const fill = (text?: string) => (text && facts.story ? text.replaceAll(':story', facts.story) : text)
  return stops
    .filter((stop) => (!stop.feature || enabledFeatures.includes(stop.feature)) && (stop.needs ?? []).every((need) => hasNeed(need, facts)))
    .map((stop) => ({ ...stop, path: fill(stop.path), target: fill(stop.target) }))
}

/** Where the tour has to go before it can show a stop, or undefined to stay on this page. */
export function tourRoute(stop: TourStop, pathname: string): string | undefined {
  if (!stop.path) return undefined
  const here = pathname.replace(/\/+$/, '') || '/'
  return here === stop.path.split('?')[0] ? undefined : stop.path
}
