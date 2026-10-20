import type { CardPack, CardPackCard, CardPackDeck } from '@/data/io'

/**
 * "My Words": the personal word list, in its original order. Words that the
 * German starter pack already has are moved into this deck (so nothing is
 * learned twice); the rest are new cards written for it.
 *
 * Two entries in the list were typos: "nachnamme" is der Nachname, and
 * "beuen" is taken to be bauen (to build).
 */
export const MY_WORDS_DECK: CardPackDeck = {
  id: 'my-words',
  name: 'My Words',
  topic: 'German',
  directions: { imageToDe: true, enToDe: true, deToEn: true },
}

const deckId = MY_WORDS_DECK.id
const card = (c: Omit<CardPackCard, 'deckId' | 'type'>): CardPackCard => ({ deckId, type: 'word', ...c })

/** A string is the id of a card in the starter pack; an object is a new card. */
export const MY_WORDS: (string | CardPackCard)[] = [
  card({
    id: 'my-0001', english: 'surname, last name', german: 'Nachname', gender: 'der', plural: 'die Nachnamen', partOfSpeech: 'noun',
    exampleDe: 'Wie ist Ihr Nachname?', exampleEn: 'What is your last name?', tags: ['A1', 'noun', 'people'], emoji: '🪪', imageQuery: 'name tag',
  }),
  'de-0372', // bauen
  'de-0441', // laut
  'de-0602', // Hallo!
  'de-0607', // Tschüss!
  card({
    id: 'my-0002', english: 'thank you, thanks', german: 'danke', partOfSpeech: 'interjection',
    exampleDe: 'Danke für deine Hilfe!', exampleEn: 'Thanks for your help!', tags: ['A1', 'interjection'], emoji: '🙏',
  }),
  card({
    id: 'my-0003', english: "please; you're welcome", german: 'bitte', partOfSpeech: 'adverb',
    exampleDe: 'Einen Kaffee, bitte.', exampleEn: 'A coffee, please.', tags: ['A1', 'adverb'],
  }),
  'de-0529', // ja
  'de-0530', // nein
  'de-0390', // gut
  'de-0474', // ich
  'de-0475', // du
  'de-0551', // hier
  'de-0040', // der Tee
  'de-0039', // der Kaffee
  'de-0041', // die Milch
  'de-0038', // das Wasser
  'de-0059', // der Saft
  'de-0042', // das Brot
  'de-0052', // der Reis
  card({
    id: 'my-0004', english: 'banana', german: 'Banane', gender: 'die', plural: 'die Bananen', partOfSpeech: 'noun',
    exampleDe: 'Die Banane ist gelb.', exampleEn: 'The banana is yellow.', tags: ['A1', 'noun', 'food'], emoji: '🍌', imageQuery: 'banana',
  }),
  card({
    id: 'my-0005', english: 'tomato', german: 'Tomate', gender: 'die', plural: 'die Tomaten', partOfSpeech: 'noun',
    exampleDe: 'Ich kaufe ein Kilo Tomaten.', exampleEn: "I'm buying a kilo of tomatoes.", tags: ['A1', 'noun', 'food'], emoji: '🍅', imageQuery: 'tomato',
  }),
  card({
    id: 'my-0006', english: 'pizza', german: 'Pizza', gender: 'die', plural: 'die Pizzas', partOfSpeech: 'noun',
    exampleDe: 'Wir bestellen heute Pizza.', exampleEn: "We're ordering pizza today.", tags: ['A1', 'noun', 'food'], emoji: '🍕', imageQuery: 'pizza',
  }),
  card({
    id: 'my-0007', english: 'chocolate', german: 'Schokolade', gender: 'die', plural: 'die Schokoladen', partOfSpeech: 'noun',
    exampleDe: 'Ich esse gern Schokolade.', exampleEn: 'I like eating chocolate.', tags: ['A1', 'noun', 'food'], emoji: '🍫', imageQuery: 'chocolate',
  }),
  'de-0056', // der Zucker
  'de-0122', // das Taxi
  'de-0124', // das Hotel
  'de-0118', // das Auto
  'de-0169', // das Telefon
  card({
    id: 'my-0008', english: 'radio', german: 'Radio', gender: 'das', plural: 'die Radios', partOfSpeech: 'noun',
    exampleDe: 'Im Auto höre ich Radio.', exampleEn: 'I listen to the radio in the car.', tags: ['A1', 'noun', 'things'], emoji: '📻', imageQuery: 'radio',
  }),
  'de-0167', // der Computer
  'de-0032', // die Lampe
  'de-0021', // das Haus
  'de-0131', // die Bank
  'de-0136', // der Park
  'de-0064', // das Restaurant
  'de-0139', // das Café
  'de-0117', // der Bus
  card({
    id: 'my-0009', english: 'ball', german: 'Ball', gender: 'der', plural: 'die Bälle', partOfSpeech: 'noun',
    exampleDe: 'Das Kind spielt mit dem Ball.', exampleEn: 'The child is playing with the ball.', tags: ['A1', 'noun', 'leisure'], emoji: '🏐', imageQuery: 'ball',
  }),
  'de-0178', // die Musik
  'de-0177', // der Film
  'de-0231', // das Problem
  'de-0017', // der Name
  'de-0001', // der Mann
  'de-0002', // die Frau
  'de-0003', // das Kind
  card({
    id: 'my-0010', english: 'mum, mom', german: 'Mama', gender: 'die', plural: 'die Mamas', partOfSpeech: 'noun',
    exampleDe: 'Meine Mama ruft jeden Sonntag an.', exampleEn: 'My mum calls every Sunday.', tags: ['A1', 'noun', 'family'], emoji: '👩‍👧', imageQuery: 'mother and child',
  }),
  card({
    id: 'my-0011', english: 'dad', german: 'Papa', gender: 'der', plural: 'die Papas', partOfSpeech: 'noun',
    exampleDe: 'Mein Papa repariert das Fahrrad.', exampleEn: 'My dad is repairing the bike.', tags: ['A1', 'noun', 'family'], emoji: '👨‍👧', imageQuery: 'father and child',
  }),
  'de-0006', // der Freund
  'de-0019', // der Lehrer
  card({
    id: 'my-0012', english: 'student (male)', german: 'Student', gender: 'der', plural: 'die Studenten', partOfSpeech: 'noun',
    exampleDe: 'Der Student lernt in der Bibliothek.', exampleEn: 'The student is studying in the library.', tags: ['A1', 'noun', 'school'], emoji: '🧑‍🎓', imageQuery: 'student',
  }),
  'de-0392', // groß
  'de-0393', // klein
]

/**
 * Adds My Words to the starter pack: its deck comes first, listed cards are
 * moved into it, and new cards are added, all in the list's order.
 */
export function withMyWords(pack: CardPack): CardPack {
  const byId = new Map(pack.cards.map((c) => [c.id, c]))
  const mine: CardPackCard[] = []
  const moved = new Set<string>()
  for (const entry of MY_WORDS) {
    if (typeof entry !== 'string') {
      mine.push(entry)
      continue
    }
    const found = byId.get(entry)
    if (!found) continue
    mine.push({ ...found, deckId })
    moved.add(entry)
  }
  return {
    ...pack,
    decks: [MY_WORDS_DECK, ...pack.decks],
    cards: [...mine, ...pack.cards.filter((c) => !c.id || !moved.has(c.id))],
  }
}
