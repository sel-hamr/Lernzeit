import type { ReactNode } from 'react'
import { Section } from '@/components/ui/primitives'

/** A Settings card: title, optional description and action, then its controls. */
export function Group({ id, title, description, children, action }: { id?: string; title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Section id={id} className="flex scroll-mt-20 flex-col gap-4 px-6 py-5">
      {/* The actions wrap below the description on narrow cards, still right-aligned. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-[999_1_240px] flex-col gap-1">
          <h2 className="text-section font-semibold">{title}</h2>
          {description && <p className="text-small text-muted">{description}</p>}
        </div>
        {action && <div className="flex min-w-0 flex-[1_1_auto] justify-end">{action}</div>}
      </div>
      {children}
    </Section>
  )
}
