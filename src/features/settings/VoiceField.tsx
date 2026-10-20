import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/primitives'
import { Field, Select } from '@/components/ui/form'
import { useFeedback } from '@/components/ui/feedback'
import { updateSettings } from '@/db/db'
import { clearClips } from '@/data/clips'
import { useLanguage, useSettings } from '@/data/hooks'
import { speak, voiceOptions } from '@/data/voice'
import { onVoicesChanged, speechSupported, voicesFor } from '@/lib/speech'
import { downloadThorsten, isThorstenDownloaded, removeThorsten, THORSTEN_SIZE_MB, thorstenSupported } from '@/lib/thorsten'

type Status = 'checking' | 'missing' | 'downloading' | 'ready' | 'unsupported'

/** Select value for the Thorsten voice; browser voices use their voiceURI, "" is automatic. */
const THORSTEN = 'thorsten'

/** The browser's voices for a language. They load asynchronously, so a change renders again. */
function useVoices(lang: string) {
  const [, setLoads] = useState(0)
  useEffect(() => onVoicesChanged(() => setLoads((n) => n + 1)), [])
  return voicesFor(lang)
}

/**
 * One choice for the voice of the language you learn: one of the browser's
 * voices, or for German the offline Thorsten voice (downloaded the first time
 * it is picked).
 */
export function VoiceField() {
  const settings = useSettings()
  const language = useLanguage()
  const voices = useVoices(language.speech)
  const german = language.code === 'de'
  const { toast, confirm } = useFeedback()
  const [status, setStatus] = useState<Status>(() => (thorstenSupported() ? 'checking' : 'unsupported'))
  // Thorsten speaks German only.
  const offerThorsten = german && status !== 'unsupported'
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (status !== 'checking') return
    let live = true
    void isThorstenDownloaded().then((ok) => {
      if (live) setStatus(ok ? 'ready' : 'missing')
    })
    return () => {
      live = false
    }
  }, [status])

  const download = async () => {
    setProgress(0)
    setStatus('downloading')
    try {
      await downloadThorsten(setProgress)
      await updateSettings({ voiceEngine: 'thorsten' })
      setStatus('ready')
      toast('The Thorsten voice is ready')
    } catch (err) {
      setStatus('missing')
      console.error('Thorsten voice download failed', err)
      const reason = err instanceof Error && err.message ? ` (${err.message})` : ''
      toast(`Could not download the voice${reason}. Check your connection and try again.`, { tone: 'error' })
    }
  }

  const remove = async () => {
    const ok = await confirm({
      title: 'Remove the Thorsten voice?',
      body: `This frees about ${THORSTEN_SIZE_MB} MB and deletes its saved audio. The browser voice speaks until you download it again.`,
      confirmLabel: 'Remove voice',
      danger: true,
    })
    if (!ok) return
    try {
      await updateSettings({ voiceEngine: 'browser' })
      await removeThorsten()
      await clearClips()
      setStatus('missing')
    } catch {
      toast('Could not remove the voice', { tone: 'error' })
    }
  }

  const choose = (value: string) => {
    if (value !== THORSTEN) void updateSettings({ voiceEngine: 'browser', voiceURI: value || undefined })
    else if (status === 'ready') void updateSettings({ voiceEngine: 'thorsten' })
    else if (status === 'missing') void download()
  }

  const thorstenOn = german && settings.voiceEngine === 'thorsten' && status === 'ready'
  const hint =
    status === 'downloading'
      ? `Downloading the Thorsten voice (${THORSTEN_SIZE_MB} MB). The browser voice speaks until it is ready.`
      : thorstenOn
        ? 'Thorsten runs on this device and works without internet.'
        : !speechSupported()
          ? 'Speech is not supported in this browser.'
          : !voices.length && offerThorsten
            ? `This browser has no German voice. Pick Thorsten for a natural one (${THORSTEN_SIZE_MB} MB download).`
            : !voices.length
              ? `This browser has no ${language.name} voice. Your system's language settings can add one.`
              : 'Voices come from your browser and system.'

  return (
    <div className="flex flex-col gap-2">
      <Field label={`${language.name} voice`} htmlFor="voice" hint={hint}>
        <div className="flex gap-2">
          <Select id="voice" className="flex-1" value={thorstenOn ? THORSTEN : (settings.voiceURI ?? '')} disabled={status === 'downloading'} onChange={(e) => choose(e.target.value)}>
            {offerThorsten && (
              <option value={THORSTEN}>Thorsten · natural, offline{status === 'ready' ? '' : ` (download ${THORSTEN_SIZE_MB} MB)`}</option>
            )}
            <option value="">Browser · automatic</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                Browser · {v.name} ({v.lang})
              </option>
            ))}
          </Select>
          <Button variant="outline" iconOnly aria-label="Test voice" onClick={() => speak(language.sample, voiceOptions(settings))}>
            <Volume2 size={17} strokeWidth={1.8} />
          </Button>
        </div>
      </Field>
      {status === 'downloading' && (
        <div className="flex items-center gap-3">
          <ProgressBar value={progress} label="Downloading the Thorsten voice" className="flex-1" />
          <span className="w-10 text-right text-small text-muted tabular-nums">{Math.round(progress * 100)}%</span>
        </div>
      )}
      {status === 'ready' && (
        <p className="text-small text-muted">
          Thorsten voice by Thorsten Müller,{' '}
          <a href="https://github.com/thorstenMueller/Thorsten-Voice" target="_blank" rel="noreferrer" className="text-sage-ink underline-offset-2 hover:underline">
            Thorsten-Voice
          </a>{' '}
          (public domain).{' '}
          <button type="button" onClick={() => void remove()} className="text-sage-ink underline-offset-2 hover:underline">
            Remove it
          </button>
        </p>
      )}
    </div>
  )
}
