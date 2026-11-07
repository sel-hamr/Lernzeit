import { useEffect, useState, type CSSProperties } from 'react'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { useMediaQuery } from '@/lib/browser'

/** Photos from Pexels (free licence) by Muhammed Hanefi, Levent Simsek, 0xd1ma and Snapwire. */
const SLIDES = [
  { photo: '/login/bremen.jpg', focus: '35% 50%', place: 'Bremen', german: 'Übung macht den Meister.', english: 'Practice makes perfect.' },
  { photo: '/login/dresden.jpg', focus: '30% 50%', place: 'Dresden', german: 'Aller Anfang ist schwer.', english: 'Every beginning is hard.' },
  { photo: '/login/bamberg.jpg', focus: '40% 60%', place: 'Bamberg', german: 'Wer rastet, der rostet.', english: 'Whoever rests, rusts.' },
  { photo: '/login/neuschwanstein.jpg', focus: '35% 45%', place: 'Neuschwanstein', german: 'Morgenstund hat Gold im Mund.', english: 'The morning hour has gold in its mouth.' },
]

const SLIDE_MS = 7000

const roundButton =
  'flex size-10 items-center justify-center rounded-full border border-[#fff]/50 text-[#fff] backdrop-blur-sm transition-colors hover:bg-[#fff]/15'

/** Full-screen photos that crossfade, with the proverbs over them. Phones get the bars and logo at the top instead of the buttons. */
export function LoginSlides() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const calm = useMediaQuery('(prefers-reduced-motion: reduce)')
  const autoplay = !paused && !calm
  const slide = SLIDES[index]
  const step = (by: number) => setIndex((i) => (i + by + SLIDES.length) % SLIDES.length)

  useEffect(() => {
    if (!autoplay) return
    const timer = setTimeout(() => setIndex((i) => (i + 1) % SLIDES.length), SLIDE_MS)
    return () => clearTimeout(timer)
  }, [index, autoplay])

  const bars = (
    <div className="flex gap-1.5">
      {SLIDES.map((s, i) => (
        <button key={s.photo} type="button" aria-label={`Show ${s.place}`} aria-current={i === index} onClick={() => setIndex(i)} className="flex h-6 flex-1 items-center">
          <span className="h-0.75 w-full overflow-hidden rounded-full bg-[#fff]/30">
            {i === index && (
              <span
                // Restarts in step with the timer whenever the slide or the pause changes.
                key={`${index}-${autoplay}`}
                style={autoplay ? { animationDuration: `${SLIDE_MS}ms` } : undefined}
                className={clsx('block h-full origin-left rounded-full bg-[#fff]', autoplay && 'animate-slide-progress')}
              />
            )}
          </span>
        </button>
      ))}
    </div>
  )

  return (
    <>
      {SLIDES.map((s, i) => (
        <img
          key={s.photo}
          src={s.photo}
          alt=""
          style={{ objectPosition: s.focus }}
          className={clsx(
            'absolute inset-0 size-full object-cover transition-opacity ease-out',
            // The new photo fades in on top; the old one stays underneath until it has.
            // Opacity only: scaling a photo this large while it animates makes it look pixelated.
            i === index ? '-z-10 opacity-100 duration-1200' : '-z-20 opacity-0 delay-1200 duration-0',
          )}
        />
      ))}
      <div className="flex min-h-70 min-w-0 flex-1 flex-col justify-between gap-6 bg-linear-to-t from-[#0c1412]/90 via-[#0c1412]/30 to-[#0c1412]/55 px-5 pt-[calc(14px+env(safe-area-inset-top))] pb-13 text-[#fff] lg:justify-end lg:gap-7 lg:to-[#0c1412]/5 lg:p-12">
        <div className="flex flex-col gap-2 lg:hidden">
          {bars}
          <div className="-ml-2" style={{ '--logo-face': '#fff', '--logo-hands': '#1c211e' } as CSSProperties}>
            <Logo />
          </div>
        </div>
        <div key={index} className="flex max-w-160 animate-rise flex-col gap-1.5 [animation-duration:700ms] lg:gap-3">
          <span className="text-chip font-medium tracking-wide uppercase opacity-85 lg:text-small">{slide.place}</span>
          <p className="text-[30px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance lg:text-[52px] lg:leading-[1.08] lg:tracking-[-0.03em]">„{slide.german}“</p>
          <p className="text-body opacity-90 lg:text-[17px]">{slide.english}</p>
        </div>
        <div className="hidden items-center gap-5 lg:flex">
          <div className="flex gap-2">
            <button type="button" aria-label="Previous slide" onClick={() => step(-1)} className={roundButton}>
              <ChevronLeft size={18} strokeWidth={1.8} />
            </button>
            <button type="button" aria-label="Next slide" onClick={() => step(1)} className={roundButton}>
              <ChevronRight size={18} strokeWidth={1.8} />
            </button>
            {!calm && (
              <button type="button" aria-label={paused ? 'Play slides' : 'Pause slides'} onClick={() => setPaused(!paused)} className={roundButton}>
                {paused ? <Play size={15} strokeWidth={1.8} /> : <Pause size={15} strokeWidth={1.8} />}
              </button>
            )}
          </div>
          <div className="max-w-72 flex-1">{bars}</div>
        </div>
      </div>
    </>
  )
}
