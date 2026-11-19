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
  /** The page it is on. A stop without one stays on the page you are on. */
  path?: string
  /** What it points at, as a CSS selector. A stop without one sits in the middle of the screen. */
  target?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  title: string
  /** HTML written here, never anything you typed, so it is safe to render. */
  body: string
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

export const TOUR_STOPS: TourStop[] = [
  {
    id: 'welcome',
    title: 'Welcome to Lernzeit',
    body:
      '<p>Take two minutes to walk through the app. Each stop shows one part of it and why it helps you learn faster and remember longer.</p>' +
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
    id: 'flashcards',
    feature: 'flashcards',
    path: '/flashcards',
    target: tourTarget('flashcards-practise'),
    side: 'bottom',
    align: 'end',
    title: 'Flashcards: words that stay',
    body:
      '<p>You forget most of a new word within a few days. Each time you pull it back from memory, just as it starts to fade, it stays longer. This is spaced recall, the best-tested way to remember.</p>' +
      FORGETTING_CURVE +
      `<p>Open a deck and press <b>Practise deck</b>. Rate each card honestly: <b>Again</b> brings it back ${AGAIN} cards later, <b>Hard</b> after ${HARD}, <b>Good</b> after ${GOOD}, and <b>Easy</b> means you know it.</p>`,
  },
  {
    id: 'stories',
    feature: 'stories',
    path: '/stories',
    target: tourTarget('stories-ai'),
    side: 'bottom',
    align: 'end',
    title: 'Stories: words in context',
    body:
      '<p>Your brain keeps a story far better than a list. A word met inside a scene comes with a picture and the words around it, so it is easier to find again. Words from your decks light up while you read, and any word can become a card.</p>' +
      `<p><b>Write with AI</b> asks Claude for a story with the words of the decks you pick: one, several or all of them. Choose a level and a length, and write what it should be about or take one of ${STORY_THEMES.length} theme ideas.</p>` +
      why('The story Claude writes is saved here, so you read the very words you are practising, in a scene you chose.'),
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
    target: '#ai-connection',
    side: 'top',
    align: 'start',
    title: 'Connect your AI',
    body:
      '<p>Turn on <b>AI connection</b> and an AI app such as Claude works in Lernzeit through MCP: it adds cards and decks, writes stories from your decks, saves docs and logs study time.</p>' +
      hint('Try asking: “Make 20 cards for ordering food, and a short story that uses them.”') +
      why('Making cards takes minutes, not an evening, so your time goes into practice. It works only while Lernzeit is open here.'),
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
      '<p>A good day in Lernzeit: start the timer, practise a deck, read a story. Ideas that pop up go on the board.</p>' +
      hint('You can take this tour again any time from Settings.'),
  },
]

/** The stops to show, without those for features that are turned off. */
export function tourStops(enabledFeatures: readonly string[], stops: readonly TourStop[] = TOUR_STOPS): TourStop[] {
  return stops.filter((stop) => !stop.feature || enabledFeatures.includes(stop.feature))
}

/** Where the tour has to go before it can show a stop, or undefined to stay on this page. */
export function tourRoute(stop: TourStop, pathname: string): string | undefined {
  if (!stop.path) return undefined
  const here = pathname.replace(/\/+$/, '') || '/'
  return here === stop.path ? undefined : stop.path
}
