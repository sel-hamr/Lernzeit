import { useEffect, useRef } from 'react'
import { useNavigate, type NavigateFunction } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { driver, type Driver, type DriveStep, type PopoverDOM } from 'driver.js'
import 'driver.js/dist/driver.css'
import './tour.css'
import { useFeedback } from '@/components/ui/feedback'
import { getTourFacts, getTourState, markTourSeen } from '@/data/tour'
import { tourRoute, tourStops, tourTarget, type TourAction, type TourStop } from '@lernzeit/core/tour'
import { useFeatures } from './plugins'

/** Lets the welcome dialog close and its toast appear before the tour dims the page. */
const START_DELAY_MS = 450
/** How long a page may take to load and show what a stop points at. */
const WAIT_FOR_PAGE_MS = 4000
/** Pages grow as their data loads; the highlight follows them for this long. */
const SETTLE_MS = 1200
/** Where the story reader puts the word panel beside the story (ReaderPage). */
const WIDE_READER = '(min-width: 1100px)'

interface TourContext {
  enabledFeatures: string[]
  navigate: NavigateFunction
  toast: (message: string) => void
}

/**
 * Runs the tour of the app while it is pending: after the welcome screen, or
 * when Settings asks for it. It walks from page to page, and finishing or
 * closing it marks it seen.
 */
export function TourEngine() {
  const state = useLiveQuery(() => getTourState(), [], undefined)
  const features = useFeatures()
  const navigate = useNavigate()
  const { toast } = useFeedback()
  const context = useRef<TourContext>({ enabledFeatures: [], navigate, toast })
  /** The running tour, or 'starting' while it reads what this browser has. */
  const running = useRef<Driver | 'starting' | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    context.current = { enabledFeatures: features.map((f) => f.id), navigate, toast }
  })

  useEffect(() => {
    if (state !== 'pending' || running.current) return
    const timer = setTimeout(() => {
      running.current = 'starting'
      void getTourFacts().then((facts) => {
        if (!mounted.current) return
        const stops = tourStops(context.current.enabledFeatures, { ...facts, wide: window.matchMedia(WIDE_READER).matches })
        running.current = startTour(stops, context.current, () => {
          running.current = null
        })
      })
    }, START_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state])

  // Signing out mid-tour takes the tour away with the app.
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (running.current && running.current !== 'starting') running.current.destroy()
    }
  }, [])

  return null
}

function startTour(stops: TourStop[], { navigate, toast }: TourContext, onEnd: () => void): Driver {
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const last = stops.length - 1
  let finished = false
  let moving = false
  let shown: number | undefined
  let stopSettling: (() => void) | undefined

  /** Opens the page of a stop if it is elsewhere. */
  const open = (stop: TourStop) => {
    const route = tourRoute(stop, window.location.pathname)
    if (!route) return
    navigate(route)
    // A new page starts at the top, as it does from the menu.
    window.scrollTo({ top: 0 })
  }

  /**
   * Opens the page of a stop, does what it needs there (such as tapping a
   * word), then shows it once its target is there. A stop whose action finds
   * nothing to act on is skipped, in the direction you were going.
   */
  const go = async (index: number, step: 1 | -1) => {
    if (moving) return
    moving = true
    try {
      let i = index
      for (; i > 0 && i < last; i += step) {
        open(stops[i])
        const action = stops[i].prepare
        if (!action || (await prepare(action))) break
      }
      // Past the stops in between, only the welcome or the send-off is left; they need nothing.
      if (i <= 0 || i >= last) {
        i = step === 1 ? last : 0
        open(stops[i])
      }
      if (tour.isActive()) tour.moveTo(i)
    } finally {
      moving = false
    }
  }

  // The page under the tour must not act on keys: Enter would rate a card on
  // the practice screen and Esc would leave it. driver.js reads its keys on keyup.
  const holdKeys = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') e.stopImmediatePropagation()
  }
  window.addEventListener('keydown', holdKeys, { capture: true })

  const tour = driver({
    steps: stops.map((stop, index) => toStep(stop, index, last)),
    animate: !still,
    smoothScroll: !still,
    allowClose: true,
    // A stray click on the dimmed page should not end the tour.
    overlayClickBehavior: 'none',
    overlayColor: '#141816',
    overlayOpacity: 0.55,
    stagePadding: 8,
    stageRadius: 16,
    popoverOffset: 14,
    // The tour shows the page; clicking into it would leave the tour behind.
    disableActiveInteraction: true,
    waitForElement: WAIT_FOR_PAGE_MS,
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Start learning',
    closeBtnLabel: 'End the tour',
    popoverClass: 'lz-tour',
    onNextClick: () => {
      const index = tour.getActiveIndex() ?? 0
      if (index >= last) {
        finished = true
        tour.destroy()
      } else {
        void go(index + 1, 1)
      }
    },
    onPrevClick: () => {
      const index = tour.getActiveIndex() ?? 0
      if (index > 0) void go(index - 1, -1)
    },
    onPopoverRender: (popover, { state }) => {
      const index = state.activeIndex ?? 0
      decorate(popover, { index, from: shown ?? index, total: stops.length }, () => tour.destroy())
      shown = index
    },
    onHighlighted: (element) => {
      stopSettling?.()
      stopSettling = element ? followLayout(tour, element) : undefined
    },
    onDestroyed: () => {
      stopSettling?.()
      window.removeEventListener('keydown', holdKeys, { capture: true })
      onEnd()
      void markTourSeen()
      if (!finished) toast('You can take the tour again any time from Settings')
    },
  })
  tour.drive()
  return tour
}

/** Does a stop's action on its page. False when there is nothing to act on, so the stop is skipped. */
async function prepare(action: TourAction): Promise<boolean> {
  switch (action) {
    case 'reveal-answer': {
      // Back from a later stop, the answer may already be showing.
      if (document.querySelector(tourTarget('practice-rate'))) return true
      const rate = tourTarget('practice-rate')
      for (let attempt = 0; attempt < 2; attempt++) {
        const show = await waitFor<HTMLButtonElement>(tourTarget('practice-show'))
        if (!show) return false
        // A new card resets the answer in an effect after it shows, so a click right away would be undone.
        await settle()
        show.click()
        if (await waitFor(rate, 1000)) return true
      }
      return false
    }
    case 'open-word-note': {
      const word = await waitFor<HTMLButtonElement>('[data-word][data-noted]')
      if (!word) return false
      await settle()
      word.scrollIntoView({ block: 'center' })
      word.click()
      return true
    }
  }
}

/**
 * Gives the page a moment, so its effects run after what it just drew. A
 * timer rather than animation frames, which a hidden tab does not run.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 80))
}

/** The first element matching `selector`, once the page shows one, or null after a while. */
function waitFor<T extends Element>(selector: string, ms = WAIT_FOR_PAGE_MS): Promise<T | null> {
  return new Promise((resolve) => {
    const found = document.querySelector<T>(selector)
    if (found) return resolve(found)
    const observer = new MutationObserver(() => {
      const el = document.querySelector<T>(selector)
      if (!el) return
      clearTimeout(timer)
      observer.disconnect()
      resolve(el)
    })
    const timer = setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, ms)
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

function toStep(stop: TourStop, index: number, last: number): DriveStep {
  return {
    element: stop.target,
    data: { id: stop.id },
    popover: {
      title: stop.title,
      description: stop.body,
      side: stop.side,
      align: stop.align,
      // The first stop asks whether to go on; Not now is added in decorate().
      ...(index === 0 && { showButtons: ['next', 'close'], nextBtnText: 'Show me around' }),
      ...(index === last && { showButtons: ['next', 'previous'] }),
    },
  }
}

/**
 * Adds a progress bar along the top, which grows (or shrinks, going back)
 * from the stop before, a name for the dialog, and Not now on the first stop.
 */
function decorate(popover: PopoverDOM, { index, from, total }: { index: number; from: number; total: number }, end: () => void) {
  const { wrapper, title, footerButtons, nextButton } = popover
  wrapper.setAttribute('role', 'dialog')
  title.id = 'lz-tour-title'
  wrapper.setAttribute('aria-labelledby', title.id)

  const bar = document.createElement('div')
  bar.className = 'lz-tour-bar'
  bar.setAttribute('aria-hidden', 'true')
  bar.style.setProperty('--lz-tour-from', String((from + 1) / total))
  bar.style.setProperty('--lz-tour-done', String((index + 1) / total))
  wrapper.prepend(bar)

  if (index === 0) {
    const skip = document.createElement('button')
    skip.type = 'button'
    skip.className = 'driver-popover-footer-btn lz-tour-skip'
    skip.textContent = 'Not now'
    skip.addEventListener('click', end)
    footerButtons.insertBefore(skip, nextButton)
  }
  // Enter or Space moves on right away. driver.js focuses the popover after this hook, so wait for it.
  setTimeout(() => nextButton.focus({ preventScroll: true }))
}

/**
 * Keeps the highlight on its element while the page around it settles, for
 * example Settings, whose cards above grow once their data is loaded.
 */
function followLayout(tour: Driver, element: Element): () => void {
  let frame = 0
  const update = () => {
    cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const box = element.getBoundingClientRect()
      const offscreen = box.bottom < 0 || box.top > window.innerHeight
      if (offscreen) element.scrollIntoView({ block: 'center' })
      tour.refresh()
    })
  }
  const observer = new ResizeObserver(update)
  observer.observe(document.body)
  observer.observe(element)
  const timer = setTimeout(() => observer.disconnect(), SETTLE_MS)
  return () => {
    clearTimeout(timer)
    cancelAnimationFrame(frame)
    observer.disconnect()
  }
}
