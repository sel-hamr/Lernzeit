import StoryPage from '../app/story/[id]'
import StoryEditPage from '../app/story/edit'
import GrammarTopicPage from '../app/grammar/[id]'
import GrammarEditPage from '../app/grammar/edit'
import GrammarPracticePage from '../app/grammar/practice'
import QuestionsPracticePage from '../app/questions/practice'
import DocPage from '../app/doc/[id]'
import DocEditPage from '../app/doc/edit'
import DocsFolderPage from '../app/docs/[folder]'
import CardPage from '../app/card/[id]'
import CardEditPage from '../app/card/edit'
import ImportCsvPage from '../app/import-csv'
import HistoryPage from '../app/more/history'
import MenuPage from '../app/more/[id]'
import PracticePage from '../app/practice'
import PracticeHistoryPage from '../app/practice-history'
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
  'story/[id]': StoryPage,
  'story/edit': StoryEditPage,
  'grammar/[id]': GrammarTopicPage,
  'grammar/edit': GrammarEditPage,
  'grammar/practice': GrammarPracticePage,
  'questions/practice': QuestionsPracticePage,
  'doc/[id]': DocPage,
  'doc/edit': DocEditPage,
  'docs/[folder]': DocsFolderPage,
  'more/history': HistoryPage,
  'card/[id]': CardPage,
  'card/edit': CardEditPage,
  practice: PracticePage,
  'practice-history': PracticeHistoryPage,
  'import-csv': ImportCsvPage,
  search: SearchPage,
  settings: SettingsPage,
  'sign-in': SignIn,
}
