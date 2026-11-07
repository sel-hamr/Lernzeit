import { useState } from 'react'
import clsx from 'clsx'
import { Eye, EyeOff } from 'lucide-react'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/form'
import { useMediaQuery } from '@/lib/browser'
import { checkLogin } from './login'
import { LoginSlides } from './LoginSlides'

/* 16px on phones, because iPhones zoom the page into any smaller field. */
const fieldSize = 'h-12! text-[16px]! lg:text-body!'

export function LoginPage({ onSignIn }: { onSignIn: () => void }) {
  // A focused field on a phone opens the keyboard over the page straight away.
  const wide = useMediaQuery('(min-width: 1024px)')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <main className="relative isolate flex min-h-dvh animate-fade-in flex-col bg-button-dark lg:flex-row">
      <LoginSlides />
      <div className="relative -mt-7 flex shrink-0 flex-col rounded-t-[28px] bg-main px-6 pt-7 pb-[calc(24px+env(safe-area-inset-bottom))] lg:mt-0 lg:w-115 lg:rounded-none lg:px-12 lg:py-8">
        <div className="-ml-2 hidden lg:block">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center lg:py-9">
          <form
            className="flex w-full max-w-90 flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (checkLogin(username, password)) onSignIn()
              else setFailed(true)
            }}
          >
            <div className="flex flex-col gap-1.5 pb-2">
              <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.025em] lg:text-[28px]">Willkommen zurück</h1>
              <p className="text-body text-muted">Sign in to carry on with your German.</p>
            </div>
            <Field label="Username" htmlFor="login-username">
              <Input
                id="login-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoFocus={wide}
                required
                className={fieldSize}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setFailed(false)
                }}
              />
            </Field>
            <Field label="Password" htmlFor="login-password" error={failed ? <span role="alert">That username or password isn't right.</span> : undefined}>
              <div className="relative">
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  aria-invalid={failed}
                  className={clsx(fieldSize, 'pr-12')}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setFailed(false)
                  }}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-img text-muted transition-colors hover:text-ink"
                >
                  {showPassword ? <EyeOff size={18} strokeWidth={1.7} /> : <Eye size={18} strokeWidth={1.7} />}
                </button>
              </div>
            </Field>
            <Button type="submit" variant="primary" size="lg" className="mt-2 h-12 w-full">
              Sign in
            </Button>
          </form>
        </div>
        <p className="hidden text-chip text-muted lg:block">Your data stays in this browser.</p>
      </div>
    </main>
  )
}
