import { useId } from 'react'

// sel-hamr agent mark: a rounded tile with two eyes cut out, so the eyes show the
// background behind it. The eyes are a mask, so they can blink and look around
// (keyframes in index.css). Source: design/brand/sel-hamr/build.mjs

// Electric blue unless --logo-face overrides it (e.g. white on the login photo).
export function LogoMark({ size = 26 }: { size?: number }) {
  const id = `logo-eyes${useId().replace(/[^\w-]/g, '')}` // React ids contain ':' or '«', which break url(#…)
  return (
    <svg width={size} height={size} viewBox="4 4 56 56" aria-hidden="true">
      <mask id={id}>
        <rect x="4" y="4" width="56" height="56" rx="19" fill="#fff" />
        <g className="logo-eyes">
          <rect className="logo-eye" x="23" y="21" width="8" height="19" rx="4" fill="#000" />
          <rect className="logo-eye" x="38" y="21" width="8" height="19" rx="4" fill="#000" />
        </g>
      </mask>
      <rect x="4" y="4" width="56" height="56" rx="19" fill="var(--logo-face, #2E5BFF)" mask={`url(#${id})`} />
    </svg>
  )
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      <LogoMark />
      <span className="text-[20px] font-semibold tracking-[-0.01em]">Lernzeit</span>
    </div>
  )
}
