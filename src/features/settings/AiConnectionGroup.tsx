import { useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Chip, type ChipTone } from '@/components/ui/primitives'
import { Field, Input, Switch } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { browserKind, updateBridgeConfig, useBridgeConfig } from '@/bridge/config'
import { DEFAULT_PORT } from '@/bridge/protocol'
import { claudeCodeCommand, claudeDesktopEntry, generateToken } from '@/bridge/setup'
import { useBridgeIndicator, type StatusLevel } from '@/bridge/status'
import { Group } from './Group'

export const AI_CONNECTION_ID = 'ai-connection'

const LEVEL_TONE: Record<StatusLevel, ChipTone> = { ok: 'sage', idle: 'soft', waiting: 'neutral', error: 'red' }

const toPort = (value: string) => Math.min(65535, Math.max(1, Math.trunc(Number(value)) || DEFAULT_PORT))

export function AiConnectionGroup() {
  const config = useBridgeConfig()
  const indicator = useBridgeIndicator()
  const { toast, confirm } = useFeedback()
  const [showToken, setShowToken] = useState(false)
  const setup = { token: config.token, port: config.port, origin: window.location.origin }

  const newToken = async () => {
    if (config.token) {
      const ok = await confirm({
        title: 'Make a new token?',
        body: 'Your AI app keeps the old token until you paste the new setup into its config.',
        confirmLabel: 'Make a new token',
      })
      if (!ok) return
    }
    await updateBridgeConfig({ token: generateToken() })
    setShowToken(true)
    toast('New token made. Copy the setup for your AI app below.')
  }

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${what} copied`)
    } catch {
      toast('The browser blocked copying. Select the token and copy it by hand.', { tone: 'error' })
    }
  }

  return (
    <Group
      id={AI_CONNECTION_ID}
      title="AI connection"
      description="Lets an AI app such as Claude add cards, decks, tasks and study time to this browser. It needs the Lernzeit MCP server running on this computer."
      action={indicator && <Chip tone={LEVEL_TONE[indicator.level]}>{indicator.label}</Chip>}
    >
      <Switch
        label="Connect to AI"
        description="Each browser and profile keeps its own data. Turn this on only where AI-made cards should go."
        checked={config.enabled}
        onChange={(v) => void updateBridgeConfig({ enabled: v })}
      />

      {config.enabled && (
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Field label="Browser name" htmlFor="bridge-name" hint="Browsers don’t tell websites the profile name, so type it, e.g. “Chrome Personal”. You say it to the AI when several browsers are connected.">
            <Input id="bridge-name" value={config.name} placeholder={browserKind()} maxLength={40} autoComplete="off" onChange={(e) => void updateBridgeConfig({ name: e.target.value })} />
          </Field>
          <Field label="Port" htmlFor="bridge-port">
            <Input id="bridge-port" type="number" inputMode="numeric" min={1} max={65535} value={config.port} onChange={(e) => void updateBridgeConfig({ port: toPort(e.target.value) })} />
          </Field>
          <Field label="Token" htmlFor="bridge-token" className="sm:col-span-2" hint={config.token ? undefined : 'Generate one here, or paste LERNZEIT_TOKEN from your AI app’s config.'}>
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Input
                  id="bridge-token"
                  type={showToken ? 'text' : 'password'}
                  value={config.token}
                  autoComplete="off"
                  spellCheck={false}
                  className="pr-11"
                  onChange={(e) => void updateBridgeConfig({ token: e.target.value.trim() })}
                />
                <button
                  type="button"
                  aria-label={showToken ? 'Hide token' : 'Show token'}
                  aria-pressed={showToken}
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-field hover:text-ink"
                >
                  {showToken ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}
                </button>
              </div>
              <Button icon={<KeyRound size={15} strokeWidth={1.8} />} onClick={() => void newToken()}>
                Generate
              </Button>
            </div>
          </Field>
        </div>
      )}

      {indicator?.hint && <p className="text-small text-muted">{indicator.hint}</p>}

      {config.enabled && config.token && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex flex-col gap-1">
            <span className="text-body font-medium">Set up your AI app</span>
            <span className="text-small text-muted">
              Copies the server entry with this token. For Claude Desktop, paste it inside “mcpServers” in claude_desktop_config.json, then quit and reopen the app.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" icon={<Copy size={15} strokeWidth={1.8} />} onClick={() => void copy(claudeDesktopEntry(setup), 'Claude Desktop entry')}>
              Copy for Claude Desktop
            </Button>
            <Button size="sm" variant="soft" icon={<Terminal size={15} strokeWidth={1.8} />} onClick={() => void copy(claudeCodeCommand(setup), 'Claude Code command')}>
              Copy for Claude Code
            </Button>
          </div>
        </div>
      )}
    </Group>
  )
}
