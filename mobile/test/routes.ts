import MenuPage from '../app/more/[id]'
import RootLayout from '../app/_layout'
import SearchPage from '../app/search'
import SettingsPage from '../app/settings'
import SignIn from '../app/sign-in'
import Flashcards from '../app/(tabs)/flashcards'
import Today from '../app/(tabs)/index'
import TabsLayout from '../app/(tabs)/_layout'
import Stories from '../app/(tabs)/stories'
import Timer from '../app/(tabs)/timer'

/** The app's route files, as renderRouter takes them. */
export const routes = {
  _layout: RootLayout,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': Today,
  '(tabs)/flashcards': Flashcards,
  '(tabs)/stories': Stories,
  '(tabs)/timer': Timer,
  'more/[id]': MenuPage,
  search: SearchPage,
  settings: SettingsPage,
  'sign-in': SignIn,
}
