import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { AudioLines, ChevronDown } from 'lucide-react'
import { updateSettings } from '@/db/db'
import { useLanguage, useSettings, useVoices } from '@/data/hooks'
import { stopSpeaking } from '@/data/voice'
import { shortVoiceName } from '@/lib/speech'
import { isThorstenDownloaded, THORSTEN_SIZE_MB, thorstenSupported } from '@/lib/thorsten'
import { THORSTEN, VOICE_ID } from '@/features/settings/VoiceField'

/**
 * The same choice of voice as in Settings, from any page: Thorsten (German only) or one of the
 * browser's voices. Thorsten is downloaded in Settings, so until then picking it opens the voice
 * card there.
 */
function useVoiceSelect() {
  const settings = useSettings()
  const language = useLanguage()
  const voices = useVoices(language.speech)
  const navigate = useNavigate()
  const offerThorsten = language.code === 'de' && thorstenSupported()
  const [downloaded, setDownloaded] = useState(false)

  // Settings changes the engine when Thorsten is downloaded or removed, so check again then.
  useEffect(() => {
    if (!offerThorsten) return
    let live = true
    void isThorstenDownloaded().then((ok) => {
      if (live) setDownloaded(ok)
    })
    return () => {
      live = false
    }
  }, [offerThorsten, settings.voiceEngine])

  // Nothing to choose: the browser picks its one voice.
  if (!offerThorsten && voices.length === 0) return null

  const thorstenOn = offerThorsten && downloaded && settings.voiceEngine === 'thorsten'
  const value = thorstenOn ? THORSTEN : (settings.voiceURI ?? '')
  const picked = voices.find((v) => v.voiceURI === settings.voiceURI)
  const display = thorstenOn ? 'Thorsten' : picked ? shortVoiceName(picked.name) : 'Browser'

  const choose = (next: string) => {
    if (next === value) return
    if (next === THORSTEN && !downloaded) return void navigate(`/settings#${VOICE_ID}`)
    stopSpeaking()
    void updateSettings(next === THORSTEN ? { voiceEngine: 'thorsten' } : { voiceEngine: 'browser', voiceURI: next || undefined })
  }

  const options = (
    <>
      {offerThorsten && <option value={THORSTEN}>Thorsten · natural, offline{downloaded ? '' : ` (download ${THORSTEN_SIZE_MB} MB in Settings)`}</option>}
      <option value="">Browser · automatic</option>
      {voices.map((v) => (
        <option key={v.voiceURI} value={v.voiceURI}>
          Browser · {v.name} ({v.lang})
        </option>
      ))}
    </>
  )
  return { label: `${language.name} voice`, value, display, choose, options }
}

/** A native select laid over the row, so phones open their own picker. */
function Overlay({ voice }: { voice: NonNullable<ReturnType<typeof useVoiceSelect>> }) {
  return (
    <select
      aria-label={voice.label}
      value={voice.value}
      onChange={(e) => voice.choose(e.target.value)}
      className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
    >
      {voice.options}
    </select>
  )
}

export function SidebarVoiceSelect() {
  const voice = useVoiceSelect()
  if (!voice) return null
  return (
    <div title={voice.label} className="relative flex h-9 items-center gap-2.5 rounded-img px-3 text-small text-ink-2 transition-colors hover:bg-main/60 hover:text-ink">
      <AudioLines size={16} strokeWidth={1.7} aria-hidden />
      <span className="flex-1">Voice</span>
      <span className="flex min-w-0 items-center gap-1 text-chip text-muted">
        <span className="truncate">{voice.display}</span>
        <ChevronDown size={13} strokeWidth={2} className="shrink-0" aria-hidden />
      </span>
      <Overlay voice={voice} />
    </div>
  )
}

export function HeaderVoiceSelect() {
  const voice = useVoiceSelect()
  if (!voice) return null
  return (
    <div className="relative flex h-8 max-w-30 items-center gap-1.5 rounded-full px-2.5 text-chip font-medium text-ink-2 hover:bg-field">
      <AudioLines size={16} strokeWidth={1.7} className="shrink-0" aria-hidden />
      <span className="truncate">{voice.display}</span>
      <ChevronDown size={13} strokeWidth={2} className="shrink-0" aria-hidden />
      <Overlay voice={voice} />
    </div>
  )
}
