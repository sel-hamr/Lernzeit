import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { buttonClass, type ButtonSize, type ButtonVariant } from './buttonClass'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  /** Square, icon-only button. Needs an aria-label. */
  iconOnly?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'md', icon, iconOnly, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass({ variant, size, iconOnly, className })} {...rest}>
      {icon}
      {children}
    </button>
  )
})

