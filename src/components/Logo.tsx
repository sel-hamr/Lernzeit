export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <circle cx="13" cy="13" r="12" fill="var(--logo-face, #22302A)" />
      <path d="M13 6.5V13l4 2.5" stroke="var(--logo-hands, #FFFFFF)" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="13" cy="13" r="1.6" fill="#C8412F" />
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
