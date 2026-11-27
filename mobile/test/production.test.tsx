import { describe, expect, it, jest } from '@jest/globals'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { CrashScreen } from '../src/components/CrashScreen'
import { versionLabel } from '../src/settings/version'

describe('version line', () => {
  it('names the version and the Android version code', () => {
    expect(versionLabel('1.2.3', 10203)).toBe('Lernzeit 1.2.3 (10203)')
    expect(versionLabel('1.2.3')).toBe('Lernzeit 1.2.3')
    expect(versionLabel()).toBe('Lernzeit')
  })
})

describe('crash screen', () => {
  it('says something went wrong and tries again', async () => {
    const retry = jest.fn(async () => {})
    await render(<CrashScreen error={new Error('boom')} onRetry={retry} />)
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
