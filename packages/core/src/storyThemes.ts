import { foldText } from './text'

/*
 * Theme ideas for stories written with AI. Each has a short name for its
 * button and a scene for the theme box: people, a place and something that
 * happens, in simple words so it suits every level.
 */

export const THEME_GROUPS = ['Everyday life', 'Food & shopping', 'Travel', 'Work & study', 'Health', 'Family & friends', 'Free time', 'Celebrations & seasons'] as const

export type ThemeGroup = (typeof THEME_GROUPS)[number]

export interface StoryTheme {
  name: string
  group: ThemeGroup
  scene: string
}

export const STORY_THEMES: readonly StoryTheme[] = [
  // Everyday life
  { group: 'Everyday life', name: 'A busy morning', scene: 'Jonas wakes up late on a Monday. He looks for his keys, drinks his coffee too fast, runs to the bus stop and just catches the bus.' },
  { group: 'Everyday life', name: 'Looking for a flat', scene: 'A young couple looks for their first flat in the city. They visit two flats, compare the rooms and the rent, and choose one near a park.' },
  { group: 'Everyday life', name: 'New neighbours', scene: 'A family moves into the flat next door. Clara brings them a cake, shows them the way to the bakery and invites them for coffee.' },
  { group: 'Everyday life', name: 'Lost in the city', scene: 'A tourist loses her phone in a big German city. She asks people for directions, takes the wrong bus, and a kind stranger helps her find her hotel.' },
  { group: 'Everyday life', name: 'At the post office', scene: 'Ben wants to send a parcel to his sister in Spain. He waits in a long line, fills in a form, pays for the stamps and has a funny talk with the clerk.' },
  { group: 'Everyday life', name: 'Cleaning day', scene: 'Three flatmates clean their flat together on Saturday. They share the jobs, find old things under the sofa, and order pizza when they are done.' },

  // Food & shopping
  { group: 'Food & shopping', name: 'At the market', scene: 'Anna goes to the Saturday market with her little brother. They buy fruit and vegetables for a family lunch, ask the prices, and the friendly vendor gives them a free apple.' },
  { group: 'Food & shopping', name: 'At the café', scene: 'Two old school friends meet in a small café after many years. They order coffee and cake, talk about their jobs and families, and plan a trip together.' },
  { group: 'Food & shopping', name: 'At the bakery', scene: 'Every morning Mr Weber buys bread at the same bakery. One day the baker is ill, a new young baker is there, and she gets his order wrong.' },
  { group: 'Food & shopping', name: 'In a restaurant', scene: 'Lisa takes her parents to a restaurant for their anniversary. They read the menu, order three dishes, and the waiter brings the wrong soup.' },
  { group: 'Food & shopping', name: 'Shopping for clothes', scene: 'Mia needs new clothes for a job interview. She tries on trousers and jackets in two shops, asks the shop assistant for help, and finds the right size.' },
  { group: 'Food & shopping', name: 'Cooking for friends', scene: 'Leon invites friends for dinner for the first time. He buys everything at the supermarket, follows his grandmother’s recipe, and the kitchen gets very messy.' },

  // Travel
  { group: 'Travel', name: 'A trip to Berlin', scene: 'Tom visits Berlin for a weekend. He takes the train, finds his hotel, visits the Brandenburg Gate and a museum, and gets lost on the way back.' },
  { group: 'Travel', name: 'At the train station', scene: 'Paul wants to visit his grandmother, but his train is late. He buys a ticket, waits on the platform, talks to an old man, and finally catches another train.' },
  { group: 'Travel', name: 'At the hotel', scene: 'A couple arrives at a hotel in the mountains late at night. Their room is not ready, the receptionist finds a solution, and they get a room with a great view.' },
  { group: 'Travel', name: 'A day at the lake', scene: 'Four friends cycle to a lake on a hot summer day. They swim, eat sandwiches, play cards, and ride home when a storm starts.' },
  { group: 'Travel', name: 'Camping trip', scene: 'A father and his two children go camping for the first time. They put up the tent, cook on a small fire, and hear strange noises at night.' },
  { group: 'Travel', name: 'At the airport', scene: 'Nina flies to visit her friend in Vienna. She checks in her suitcase, goes through security, and almost misses her flight because of a long line.' },

  // Work & study
  { group: 'Work & study', name: 'First day at work', scene: 'Max starts a new job in an office. He meets his colleagues, learns where everything is, makes a small mistake and gets help from a friendly coworker.' },
  { group: 'Work & study', name: 'A job interview', scene: 'Sofia has a job interview at a hotel. She is nervous, answers questions about her experience, asks about the working hours, and gets a call the next day.' },
  { group: 'Work & study', name: 'The German course', scene: 'Students from many countries meet in a German course. They introduce themselves, practise a dialogue in pairs, and go for a drink after class.' },
  { group: 'Work & study', name: 'Exam day', scene: 'Emre has an important exam at university. He studies all night, forgets his pen in the morning, borrows one from a stranger and passes the exam.' },
  { group: 'Work & study', name: 'Working from home', scene: 'Julia works from home for a week. Her cat walks over the keyboard in a video call, the internet stops working, and she goes to a café to finish her work.' },

  // Health
  { group: 'Health', name: 'At the doctor', scene: 'Lena feels ill and goes to the doctor. She describes her headache and fever, the doctor asks questions, and she gets medicine and advice to rest.' },
  { group: 'Health', name: 'At the pharmacy', scene: 'Herr Klein has a cold and goes to the pharmacy. He explains how he feels, the pharmacist recommends tea and tablets, and tells him to stay in bed.' },
  { group: 'Health', name: 'A sports accident', scene: 'During a football game David falls and hurts his foot. His friends take him to the hospital, he gets an X-ray, and he must rest for two weeks.' },
  { group: 'Health', name: 'A healthy new start', scene: 'Marie wants to live more healthily. She starts to run in the park every morning, cooks more vegetables, and meets a new friend at the running club.' },
  { group: 'Health', name: 'At the dentist', scene: 'Felix is afraid of the dentist, but he has a toothache. The dentist is very kind, explains everything, and Felix is surprised how fast it goes.' },

  // Family & friends
  { group: 'Family & friends', name: 'Family dinner', scene: 'A family cooks dinner together on Sunday. Everyone has a job in the kitchen, something goes wrong with the soup, and they laugh about it at the table.' },
  { group: 'Family & friends', name: 'Visiting grandma', scene: 'Two children spend the weekend at their grandmother’s house in the country. They feed the chickens, bake a cake with her, and listen to old stories.' },
  { group: 'Family & friends', name: 'A new pet', scene: 'The Schmidt family gets a puppy from an animal shelter. The children choose a name, buy food and a bed, and the puppy eats a shoe on the first day.' },
  { group: 'Family & friends', name: 'An old friend', scene: 'On the tram, Petra sees a woman she knows from school twenty years ago. They talk, exchange phone numbers, and meet again the next weekend.' },
  { group: 'Family & friends', name: 'Babysitting', scene: 'Tim looks after his little cousins for an evening. They do not want to sleep, they build a tent from blankets, and he tells them a story.' },

  // Free time
  { group: 'Free time', name: 'A rainy weekend', scene: 'It rains all weekend, so a family stays at home. They play board games, bake a cake, watch a film, and go outside when the sun comes out on Sunday evening.' },
  { group: 'Free time', name: 'At the cinema', scene: 'Two friends want to see a film, but they cannot agree which one. They buy popcorn, watch a comedy, and talk about it in a bar afterwards.' },
  { group: 'Free time', name: 'A hike in the mountains', scene: 'A group of friends hikes up a mountain. The weather changes, they find a small hut, drink hot chocolate, and see the sunset from the top.' },
  { group: 'Free time', name: 'A football match', scene: 'Luca goes to his first football match in a big stadium with his dad. They sing with the fans, eat a sausage, and their team scores in the last minute.' },
  { group: 'Free time', name: 'The music festival', scene: 'Three friends go to a summer music festival. They put up their tent, dance in the rain, lose each other in the crowd, and meet again at the main stage.' },
  { group: 'Free time', name: 'A new hobby', scene: 'After many years Katrin starts to play the guitar again. She takes lessons, practises every evening, and plays a song at her friend’s party.' },

  // Celebrations & seasons
  { group: 'Celebrations & seasons', name: 'A birthday party', scene: 'Sara plans a surprise party for her best friend. She invites friends, buys a cake and decorations, and almost gives away the secret.' },
  { group: 'Celebrations & seasons', name: 'Christmas market', scene: 'On a cold December evening a family visits the Christmas market. They drink hot punch, buy small presents, and the children ride the carousel.' },
  { group: 'Celebrations & seasons', name: 'New Year’s Eve', scene: 'Friends celebrate New Year’s Eve in a small flat. They cook together, play games, watch the fireworks from the balcony, and make plans for the new year.' },
  { group: 'Celebrations & seasons', name: 'A wedding', scene: 'Jana’s brother gets married in a small village. She helps with the flowers, gives a speech, and everyone dances until late at night.' },
  { group: 'Celebrations & seasons', name: 'Oktoberfest', scene: 'Two friends from abroad visit the Oktoberfest in Munich. They try on traditional clothes, eat a big pretzel, and learn a German song in the tent.' },
  { group: 'Celebrations & seasons', name: 'The first snow', scene: 'It snows for the first time this winter. The children of a small street build a snowman together, have a snowball fight, and drink hot cocoa.' },
]

/** The ideas shown under the theme box before "More themes": a mix of everyday scenes. */
export const FEATURED_THEMES: readonly StoryTheme[] = [
  'At the market',
  'At the café',
  'A trip to Berlin',
  'At the doctor',
  'First day at work',
  'Family dinner',
  'A birthday party',
  'A rainy weekend',
].map((name) => STORY_THEMES.find((t) => t.name === name)!)

/** The theme after picking an idea: its scene, or nothing when that scene is already the theme. */
export function pickTheme(current: string, scene: string): string {
  return current.trim() === scene ? '' : scene
}

/** The idea whose scene is the theme, if the theme is one. */
export const themeOf = (theme: string): StoryTheme | undefined => STORY_THEMES.find((t) => t.scene === theme.trim())

/** The ideas in `group` (or every group) whose name or scene holds every word of `query`, ignoring case and accents. */
export function findThemes(query: string, group?: ThemeGroup): StoryTheme[] {
  const words = foldText(query).split(/\s+/).filter(Boolean)
  return STORY_THEMES.filter((t) => (!group || t.group === group) && words.every((w) => foldText(`${t.name} ${t.scene}`).includes(w)))
}
