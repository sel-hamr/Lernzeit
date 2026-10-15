import { DAYS_STORIES } from './days'
import { FOOD_STORIES } from './food'
import { HOME_STORIES } from './home'
import type { StarterStory } from './story'
import { TOWN_STORIES } from './town'

export type { StarterStory } from './story'

/** The first stories, a little longer than the rest. */
const FIRST_STORIES: StarterStory[] = [
  {
    id: 'story-0001',
    title: 'Ein Tag in Berlin',
    level: 'A1',
    topic: 'German',
    tags: ['starter'],
    text: `Anna wohnt in Berlin. Sie hat eine kleine Wohnung und einen Hund. Der Hund heißt Bruno.

Am Morgen steht Anna früh auf. Sie trinkt einen Kaffee und isst ein Brot mit Käse. Bruno bekommt Wasser und sein Essen.

Dann gehen Anna und Bruno in den Park. Die Sonne scheint, und viele Kinder spielen im Park. Bruno läuft schnell und ist sehr glücklich.

Am Nachmittag arbeitet Anna zu Hause. Sie schreibt E-Mails und telefoniert mit ihrer Mutter. Am Abend kocht sie Nudeln mit Tomaten. Das Essen ist gut. Um zehn Uhr geht Anna ins Bett.`,
    translation: `Anna lives in Berlin. She has a small flat and a dog. The dog is called Bruno.

In the morning Anna gets up early. She drinks a coffee and eats bread with cheese. Bruno gets water and his food.

Then Anna and Bruno go to the park. The sun is shining, and many children are playing in the park. Bruno runs fast and is very happy.

In the afternoon Anna works at home. She writes emails and talks to her mother on the phone. In the evening she cooks pasta with tomatoes. The food is good. At ten o'clock Anna goes to bed.`,
  },
  {
    id: 'story-0002',
    title: 'Im Café',
    level: 'A1',
    topic: 'German',
    tags: ['starter'],
    text: `Tom und Lena sind Freunde. Am Samstag treffen sie sich in einem Café in der Stadt.

„Hallo, Lena! Wie geht es dir?“, fragt Tom. „Gut, danke! Und dir?“, antwortet Lena.

Der Kellner kommt an den Tisch. „Was möchten Sie trinken?“ Tom möchte einen Tee mit Milch. Lena nimmt einen Kaffee und ein Stück Kuchen.

Sie sprechen über die Arbeit, die Familie und das Wetter. Lena erzählt von ihrer Reise nach Hamburg. Tom hört zu und lacht.

Nach einer Stunde bezahlen sie. Der Tee kostet drei Euro, der Kaffee und der Kuchen kosten sechs Euro. „Bis bald!“, sagt Lena. „Tschüss!“, sagt Tom.`,
    translation: `Tom and Lena are friends. On Saturday they meet in a café in town.

"Hello, Lena! How are you?" asks Tom. "Good, thanks! And you?" Lena answers.

The waiter comes to the table. "What would you like to drink?" Tom would like a tea with milk. Lena has a coffee and a piece of cake.

They talk about work, family and the weather. Lena tells him about her trip to Hamburg. Tom listens and laughs.

After an hour they pay. The tea costs three euros; the coffee and the cake cost six euros. "See you soon!" says Lena. "Bye!" says Tom.`,
  },
  {
    id: 'story-0003',
    title: 'Der verlorene Schlüssel',
    level: 'A2',
    topic: 'German',
    tags: ['starter'],
    text: `Gestern war ein schlechter Tag für Max. Am Morgen hat er seinen Schlüssel nicht gefunden. Er hat in der Küche, im Bad und unter dem Bett gesucht.

Max war schon spät dran. Er hat seine Nachbarin gefragt: „Haben Sie vielleicht einen Schlüssel gesehen?“ Aber sie hatte keinen Schlüssel gesehen.

Dann hat Max seine Jacke angezogen und wollte zur Arbeit gehen. Plötzlich hat er etwas in der Tasche gefühlt. Der Schlüssel war die ganze Zeit in seiner Jacke!

Max hat laut gelacht. Er ist schnell zum Bus gelaufen und ist nur fünf Minuten zu spät gekommen. Am Abend hat er einen Haken für den Schlüssel gekauft. Jetzt hängt der Schlüssel immer neben der Tür.`,
    translation: `Yesterday was a bad day for Max. In the morning he couldn't find his key. He looked in the kitchen, in the bathroom and under the bed.

Max was already running late. He asked his neighbour: "Have you seen a key, by any chance?" But she hadn't seen a key.

Then Max put on his jacket and wanted to go to work. Suddenly he felt something in the pocket. The key was in his jacket the whole time!

Max laughed out loud. He ran quickly to the bus and was only five minutes late. In the evening he bought a hook for the key. Now the key always hangs next to the door.`,
  },
]

/**
 * Short stories written with the starter decks' words, so most of each one
 * is highlighted from the start. The Stories page lists them in this order.
 * Loaded on demand, like the starter decks.
 */
export const STARTER_STORIES: StarterStory[] = [...FIRST_STORIES, ...HOME_STORIES, ...FOOD_STORIES, ...TOWN_STORIES, ...DAYS_STORIES]
