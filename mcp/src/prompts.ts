import type { GetPromptResult, McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod'
import { GUIDE, GUIDE_URI } from './guide.ts'

/** A prompt is the guide, attached as a resource, followed by the request. */
function withGuide(request: string): GetPromptResult {
  return {
    messages: [
      { role: 'user', content: { type: 'resource', resource: { uri: GUIDE_URI, mimeType: 'text/markdown', text: GUIDE } } },
      { role: 'user', content: { type: 'text', text: request } },
    ],
  }
}

/** The guide as a resource the user can attach, and prompts that start common requests. */
export function registerGuide(server: McpServer) {
  server.registerResource(
    'guide',
    GUIDE_URI,
    {
      title: 'Lernzeit guide',
      description: 'What Lernzeit is, every tool, how to write good German cards, and what the errors mean.',
      mimeType: 'text/markdown',
    },
    (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: GUIDE }] }),
  )

  server.registerPrompt(
    'make_cards',
    {
      title: 'Make German flashcards',
      description: 'Adds a set of German cards on a theme to a Lernzeit deck.',
      argsSchema: z.object({
        theme: z.string().describe('What the words are about, e.g. "kitchen" or "at the doctor"'),
        count: z.string().optional().describe('How many cards. Default 10'),
        level: z.string().optional().describe('CEFR level, e.g. A1 or B1. Default A2'),
        deck: z.string().optional().describe('Deck to add them to. Default: a deck named after the theme'),
      }),
    },
    ({ theme, count = '10', level = 'A2', deck }) =>
      withGuide(
        [
          `Make ${count} German flashcards about "${theme}" at level ${level}, following the guide.`,
          deck ? `Add them to the deck "${deck}".` : `Add them to a deck named after the theme; create it under the German topic if it does not exist.`,
          'Mix nouns, verbs and a few useful phrases. Give each one a short example sentence.',
          'Afterwards, list what was added and what was skipped.',
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'write_story',
    {
      title: 'Write a German story',
      description: 'Writes a short German story at your level and adds it to Lernzeit to read.',
      argsSchema: z.object({
        theme: z.string().describe('What the story is about, e.g. "a day at the market"'),
        level: z.string().optional().describe('CEFR level, e.g. A1 or B1. Default A2'),
        words: z.string().optional().describe('About how many words. Default 150'),
      }),
    },
    ({ theme, level = 'A2', words = '150' }) =>
      withGuide(
        [
          `Write a German story of about ${words} words about "${theme}" at level ${level}, following the guide.`,
          'Give it a German title, three to five paragraphs, and an English translation with the same paragraphs.',
          'Add it with create_story, then tell me its title and word count.',
          'Finally, suggest five to eight useful words from the story that I may not know yet, and offer to add them as cards.',
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'make_questions',
    {
      title: 'Make German practice questions',
      description: 'Adds questions to practise answering, like in the speaking part of an exam.',
      argsSchema: z.object({
        theme: z.string().describe('What the questions are about, e.g. "work" or "at the doctor"'),
        count: z.string().optional().describe('How many questions. Default 10'),
        level: z.string().optional().describe('CEFR level, e.g. A1 or B1. Default A2'),
      }),
    },
    ({ theme, count = '10', level = 'A2' }) =>
      withGuide(
        [
          `Make ${count} German questions about "${theme}" at level ${level} that someone could really ask me, following the guide.`,
          'Give each one its English and a short suggested answer. Add them with create_questions in a set named after the theme, in German.',
          'Afterwards, tell me how many were added, and remind me to write my own answers in Lernzeit.',
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'make_grammar',
    {
      title: 'Make grammar exercises',
      description: 'Adds exercises with explanations to a grammar topic, or starts a new topic.',
      argsSchema: z.object({
        topic: z.string().describe('The grammar point, e.g. "Dativ" or "weil and dass"'),
        count: z.string().optional().describe('How many exercises. Default 12'),
        level: z.string().optional().describe('CEFR level, e.g. A1 or B1. Default A2'),
      }),
    },
    ({ topic, count = '12', level = 'A2' }) =>
      withGuide(
        [
          `Make ${count} German grammar exercises on "${topic}" at level ${level}, following the guide.`,
          'Call list_grammar_topics first. If a topic fits, add to it with its title; otherwise start a new topic with a short rule, a table where it helps, and three examples.',
          'Mix the four kinds of exercise, and give every exercise its English and a one-sentence why. Add them with add_grammar.',
          'Afterwards, tell me how many were added, and that they are under Grammar in Lernzeit.',
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'plan_tasks',
    {
      title: 'Plan study tasks',
      description: 'Breaks a learning goal into tasks on the Lernzeit board.',
      argsSchema: z.object({
        goal: z.string().describe('What the user wants to reach, e.g. "pass the A2 exam"'),
        until: z.string().optional().describe('Deadline, YYYY-MM-DD'),
        topic: z.string().optional().describe('Topic name, e.g. German'),
      }),
    },
    ({ goal, until, topic }) =>
      withGuide(
        [
          `Help me reach this goal: "${goal}"${until ? ` by ${until}` : ''}.`,
          'Suggest 3 to 7 concrete tasks, each small enough for one or two study sessions. Show me the list first.',
          `When I agree, add them with create_task${topic ? ` under the topic "${topic}"` : ''}, spreading due dates sensibly${until ? ' before the deadline' : ''}. The first task goes to todo, the rest to backlog.`,
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'help',
    {
      title: 'What can Lernzeit do?',
      description: 'Explains the Lernzeit tools and checks the connection.',
    },
    () =>
      withGuide(
        'Using the guide, explain in a few short lines what you can do in Lernzeit for me. Then call list_browsers and tell me whether a browser is connected, and what to do if not.',
      ),
  )
}
