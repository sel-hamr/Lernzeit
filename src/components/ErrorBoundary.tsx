import { Component, type ErrorInfo, type ReactNode } from 'react'
import { buttonClass } from './ui/buttonClass'

interface State {
  error: Error | null
}

/** Keeps one broken page from blanking the whole app. Reset by changing `resetKey` (the route). */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-section border border-line bg-main px-6 py-10 text-center">
        <h1 className="text-section font-semibold">Something went wrong on this page</h1>
        <p className="text-small text-muted">Your data is safe on this device. Reloading usually fixes it.</p>
        <code className="max-w-full truncate rounded-md bg-field px-2 py-1 text-chip text-muted">{this.state.error.message}</code>
        <button type="button" className={buttonClass({ variant: 'primary', className: 'mt-2' })} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
