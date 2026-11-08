import { Switch } from '@/components/ui/form'
import { useSettings } from '@/data/hooks'
import { PLUGINS, setFeatureOn } from '@/app/plugins'
import { Group } from './Group'

/** One switch per feature plugin. Turning one off hides it from the menu and closes its pages. */
export function FeaturesGroup() {
  const { hiddenFeatures } = useSettings()
  return (
    <Group title="Features" description="Turn off what you don't use. It leaves the menu, and nothing you saved in it is deleted.">
      {PLUGINS.map((plugin) => (
        <Switch
          key={plugin.id}
          label={plugin.label}
          description={plugin.required ? 'Always on.' : plugin.description}
          checked={plugin.required || !hiddenFeatures.includes(plugin.id)}
          disabled={plugin.required}
          onChange={(on) => void setFeatureOn(plugin.id, on)}
        />
      ))}
    </Group>
  )
}
