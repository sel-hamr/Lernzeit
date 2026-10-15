import { DEFAULT_PORT, MAX_CARDS_PER_CALL, MAX_QUESTIONS_PER_CALL, MAX_STORY_CHARS, MAX_STUDY_MINUTES } from '../../src/bridge/protocol.ts'

export const GUIDE_URI = 'lernzeit://guide'

/** Everything an AI needs to use the Lernzeit tools well, served as a resource and inside the prompts. */
export const GUIDE = `# Lernzeit guide

Lernzeit is the user's study app for daily German and AI learning: flashcards with spaced repetition (FSRS), short German stories to read with the decks, German questions to practise answering, a daily goal in minutes per topic, a focus timer and a task board.

## How the tools reach the app

The data lives in the user's browser, not on a server. Each tool call goes to a Lernzeit tab that has Settings → AI connection → Connect to AI turned on.

- No browser connected: ask the user to open Lernzeit and turn on Connect to AI.
- Several browsers connected (each browser and profile has its own data): ask which one, then pass its name as \`browser\`. \`list_browsers\` shows the names.
- The tools only add things. Nothing can be edited or deleted, and cards, stories, questions, answers, history and notes cannot be read.

## Tools

| Tool | Use it to |
|---|---|
| \`list_browsers\` | See which browsers are connected |
| \`list_topics\` | Get the topic names, such as German and AI |
| \`list_decks\` | Get the decks with their topic and card count |
| \`create_deck\` | Make a deck, optionally linked to a topic. Returns the existing deck if the name is taken |
| \`create_cards\` | Add up to ${MAX_CARDS_PER_CALL} cards to a deck |
| \`create_story\` | Add a German story to read, with its English translation |
| \`create_questions\` | Add up to ${MAX_QUESTIONS_PER_CALL} German questions to practise answering, in a set |
| \`create_task\` | Add a task to the board |
| \`log_study_time\` | Save study time done away from the timer |

Look before you add: call \`list_decks\` before \`create_cards\`, and \`list_topics\` before naming a topic.

## Writing good cards

| Field | Rule | Example |
|---|---|---|
| \`english\` | Short meaning; separate meanings with "; " | "woman; wife" |
| \`german\` | Nouns without their article | "Hund" |
| \`gender\` | Article of a noun: der, die or das | "der" |
| \`plural\` | With its article | "die Hunde" |
| \`verbForms\` | Infinitive – Präteritum – Perfekt | "gehen – ging – ist gegangen" |
| \`partOfSpeech\` | noun, verb, adjective, adverb, phrase… | "noun" |
| \`exampleDe\` / \`exampleEn\` | One short, everyday sentence and its translation | "Der Hund schläft." / "The dog is sleeping." |
| \`emoji\` | One emoji, only when it clearly shows the word | "🐕" |
| \`tags\` | Level and theme | ["A1", "animals"] |

- Card types: \`word\` (default), \`sentence\` for a whole phrase, and \`cloze\` for a gap sentence. Mark the gap with double braces: "Ich {{gehe}} nach Hause." with english "I {{go}} home."
- Only nouns are practised from the picture, so set \`partOfSpeech\` to "noun" for nouns.
- Every card gets the tag "ai". A card whose German text is already in the deck is skipped and listed under "skipped"; that is not an error.
- Match the user's level. Tell them how many cards were added and which were skipped.

## Writing stories

In the reader, every word that is in one of the user's decks is highlighted by how well they know it, nouns are coloured by gender, and tapping a word shows its card or adds it to a deck. Stories teach best when the user already knows almost every word.

- Write at the user's level and keep it short: 100 to 250 words for A1 and A2. Use everyday words, short sentences and the present tense or Perfekt.
- Separate paragraphs with an empty line. Give \`translation\` the same number of paragraphs, so each English paragraph can show under its German one.
- Set \`level\` (A1 to C2) and a German \`title\`. Text and translation can each have up to ${MAX_STORY_CHARS} characters.
- Every story gets the tag "ai". Sending the same text again returns the saved story instead of a copy.
- Afterwards, offer to add the story's most useful new words as cards with \`create_cards\`, using the sentence from the story as \`exampleDe\`.

## Writing questions

The user practises a question by typing an answer from memory, then comparing it with **their own answer** (which they write in the app, about their real life) and the **suggested answer** you give. There is no grading.

- Ask what people really get asked: the speaking part of the Goethe or telc exam, small talk, the doctor, the Bürgeramt. Use du for personal questions and Sie for formal situations.
- \`suggested\` is one short, correct sentence at the user's level that shows the pattern ("Ich arbeite als Lehrerin."). It is an example, not the user's answer; they write their own.
- \`words\` are three to six words someone may need for their own answer, shown as hints: other choices than the suggested answer uses ("Lehrer", "die Ärztin", "arbeiten als"). Nouns with their article.
- Group questions by theme in a \`set\`, e.g. "Arbeit". A set name that already exists, in any case, adds to that set. Set \`level\` and give \`english\`.
- Every question gets the tag "ai". A question already in the set is skipped and listed under "skipped"; that is not an error.

## Tasks and study time

- \`create_task\`: priority is high, medium (default) or low. Status is the board column: backlog, todo (default), doing or done. \`dueDate\` is YYYY-MM-DD.
- \`log_study_time\`: \`minutes\` from 1 to ${MAX_STUDY_MINUTES}. \`start\` is local time, YYYY-MM-DDTHH:MM; without it the session ends now. Time in the future is refused. It counts toward the topic's daily goal.

## Errors

Every error ends with a code in brackets, and its message says what to do.

| Code | Meaning |
|---|---|
| no_browser | No Lernzeit tab is connected |
| pick_browser | Several are connected; ask which one |
| unknown_browser | No browser has that name; the message lists the real ones |
| deck_not_found / topic_not_found | The message lists the real names |
| invalid_input | Fix the input as the message says |
| timeout / disconnected | The tab did not answer; ask the user to check that Lernzeit is open |
| port_in_use | Another AI app runs the Lernzeit server on port ${DEFAULT_PORT}; only one can at a time |
`
