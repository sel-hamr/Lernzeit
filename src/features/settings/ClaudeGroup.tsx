import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { failureMessage } from '@/sync/account'
import { disconnectApp, listConnectedApps, mcpInfo, type ConnectedApp } from '@/sync/api'
import { Group } from './Group'

export const CLAUDE_ID = 'claude'

const connectedOn = (time: number) => new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** How to connect Claude to this library, and the apps already connected. */
export function ClaudeGroup() {
  const { toast } = useFeedback()
  const { url, error } = useConnectorUrl()
  const shown = url ?? (error ? 'The address could not be loaded' : 'Loading…')
  const command = `claude mcp add --transport http lernzeit ${url ?? '<connector address>'}`

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${what} copied`)
    } catch {
      toast('The browser blocked copying. Select the text and copy it by hand.', { tone: 'error' })
    }
  }

  return (
    <Group
      id={CLAUDE_ID}
      title="Claude"
      description="Connect Claude to your library. It adds cards, decks, stories and docs to your cloud, so it works from your phone too, with no computer running."
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="mcp-url" className="text-small font-medium">
          Connector address
        </label>
        <div className="flex gap-2">
          <Input id="mcp-url" readOnly value={shown} spellCheck={false} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1" />
          <Button icon={<Copy size={15} strokeWidth={1.8} />} disabled={!url} onClick={() => void copy(url ?? '', 'Address')}>
            Copy
          </Button>
        </div>
        {error && <p className="text-small text-muted">{error}</p>}
      </div>

      <div className="flex flex-col gap-3 text-small text-ink-2">
        <div className="flex flex-col gap-1">
          <span className="text-body font-medium text-ink">Claude on your phone, on claude.ai or in Claude Desktop</span>
          <span>Open Settings → Connectors → Add custom connector, paste the address, then sign in with your Lernzeit password.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-body font-medium text-ink">Claude Code</span>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="min-w-0 max-w-full flex-1 overflow-x-auto rounded-row bg-field px-3 py-2 text-chip whitespace-nowrap">{command}</code>
            <Button size="sm" variant="soft" icon={<Copy size={15} strokeWidth={1.8} />} disabled={!url} onClick={() => void copy(command, 'Command')}>
              Copy
            </Button>
          </div>
        </div>
      </div>

      <ConnectedApps />
    </Group>
  )
}

/** The connector address, from the cloud (`GET /api/mcp/info`), since this page may run on another origin. */
function useConnectorUrl(): { url?: string; error?: string } {
  const [state, setState] = useState<{ url?: string; error?: string }>({})
  useEffect(() => {
    let current = true
    mcpInfo().then(
      ({ url }) => current && setState({ url }),
      (err: unknown) => current && setState({ error: failureMessage(err) }),
    )
    return () => {
      current = false
    }
  }, [])
  return state
}

function ConnectedApps() {
  const { toast, confirm } = useFeedback()
  const [apps, setApps] = useState<ConnectedApp[]>()
  const [error, setError] = useState<string>()
  // Bumped to load the list again.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    listConnectedApps().then(
      (list) => {
        if (!current) return
        setApps(list)
        setError(undefined)
      },
      (err: unknown) => current && setError(failureMessage(err)),
    )
    return () => {
      current = false
    }
  }, [version])

  const disconnect = async (app: ConnectedApp) => {
    const ok = await confirm({
      title: `Disconnect ${app.clientName}?`,
      body: 'It can no longer reach your library. Connect it again, with your Lernzeit password, to let it back in. What it already saved stays.',
      confirmLabel: 'Disconnect',
      danger: true,
    })
    if (!ok) return
    try {
      await disconnectApp(app.id)
      setVersion((v) => v + 1)
    } catch (err) {
      toast(failureMessage(err), { tone: 'error' })
    }
  }

  return (
    <div className="flex flex-col border-t border-line pt-4">
      <span className="pb-1 text-small font-medium">Connected apps</span>
      {error && <p className="py-2 text-small text-muted">Connected apps could not be loaded. {error}</p>}
      {!error && apps?.length === 0 && <p className="py-2 text-small text-muted">No AI apps connected yet.</p>}
      {apps?.map((app) => (
        <div key={app.id} className="flex items-center gap-3 border-t border-line py-3 first-of-type:border-t-0">
          <div className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-body">{app.clientName}</span>
            <span className="text-chip text-muted">Connected {connectedOn(app.createdAt)}</span>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void disconnect(app)}>
            Disconnect
          </Button>
        </div>
      ))}
    </div>
  )
}
