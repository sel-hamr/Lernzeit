import type { Question, StoryLevel } from '@/db/types'

export type StarterQuestion = Pick<Question, 'id' | 'set' | 'question' | 'english' | 'suggested' | 'words' | 'level' | 'tags'>

type Entry = [n: number, question: string, english: string, suggested: string, words: string[]]

/**
 * A set of questions. Each `n` becomes an id (7 → question-0007) that must
 * never change: installing the questions again skips the ids it has.
 */
function questionSet(set: string, level: StoryLevel, entries: Entry[]): StarterQuestion[] {
  return entries.map(([n, question, english, suggested, words]) => ({
    id: `question-${String(n).padStart(4, '0')}`,
    set,
    question,
    english,
    suggested,
    words,
    level,
    tags: ['starter'],
  }))
}

/**
 * Questions the speaking part of an A1 or A2 exam asks, and everyday small
 * talk. The suggested answers show the sentence pattern and the words offer
 * other choices; the user writes their own answer. Loaded on demand, like
 * the starter stories.
 */
export const STARTER_QUESTIONS: StarterQuestion[] = [
  ...questionSet('Sich vorstellen', 'A1', [
    [1, 'Wie heißt du?', "What's your name?", 'Ich heiße Anna.', ['Ich heiße', 'Mein Name ist', 'Vorname', 'Nachname']],
    [2, 'Wie alt bist du?', 'How old are you?', 'Ich bin 28 Jahre alt.', ['Ich bin', 'Jahre alt', 'zwanzig', 'dreißig']],
    [3, 'Woher kommst du?', 'Where are you from?', 'Ich komme aus Marokko.', ['Ich komme aus', 'aus der Türkei', 'aus den USA', 'Ich bin geboren in']],
    [4, 'Wo wohnst du?', 'Where do you live?', 'Ich wohne in Berlin.', ['Ich wohne in', 'seit', 'in der Nähe von', 'die Stadt']],
    [5, 'Welche Sprachen sprichst du?', 'Which languages do you speak?', 'Ich spreche Arabisch, Französisch und ein bisschen Deutsch.', ['Englisch', 'Spanisch', 'ein bisschen', 'fließend', 'die Muttersprache']],
    [6, 'Was bist du von Beruf?', 'What do you do for a living?', 'Ich bin Softwareentwickler.', ['Ich arbeite als', 'Lehrer', 'Ärztin', 'Student', 'arbeitslos']],
    [7, 'Was sind deine Hobbys?', 'What are your hobbies?', 'Ich lese gern und spiele Fußball.', ['gern', 'Musik hören', 'kochen', 'reisen', 'schwimmen']],
    [8, 'Bist du verheiratet?', 'Are you married?', 'Nein, ich bin ledig.', ['verheiratet', 'ledig', 'geschieden', 'mein Mann', 'meine Frau']],
    [9, 'Hast du Kinder?', 'Do you have children?', 'Nein, ich habe keine Kinder.', ['ein Kind', 'zwei Kinder', 'einen Sohn', 'eine Tochter', 'keine']],
    [10, 'Wann hast du Geburtstag?', 'When is your birthday?', 'Ich habe am 12. Mai Geburtstag.', ['am', 'im Januar', 'im Sommer', 'Geburtstag']],
    [11, 'Seit wann lernst du Deutsch?', 'How long have you been learning German?', 'Ich lerne seit einem Jahr Deutsch.', ['seit', 'einem Monat', 'zwei Jahren', 'im Kurs', 'allein']],
    [12, 'Warum lernst du Deutsch?', 'Why are you learning German?', 'Ich lerne Deutsch, weil ich in Deutschland arbeiten möchte.', ['weil', 'die Arbeit', 'das Studium', 'meine Familie', 'die Prüfung']],
  ]),
  ...questionSet('Familie und Freunde', 'A1', [
    [13, 'Hast du Geschwister?', 'Do you have brothers or sisters?', 'Ja, ich habe einen Bruder und eine Schwester.', ['einen Bruder', 'eine Schwester', 'zwei Brüder', 'keine Geschwister', 'älter', 'jünger']],
    [14, 'Wo wohnt deine Familie?', 'Where does your family live?', 'Meine Familie wohnt in Casablanca.', ['meine Eltern', 'wohnen', 'auf dem Land', 'in der Stadt']],
    [15, 'Was macht deine Mutter?', 'What does your mother do?', 'Meine Mutter ist Lehrerin.', ['arbeitet als', 'Hausfrau', 'Rentnerin', 'Krankenschwester']],
    [16, 'Wie oft siehst du deine Eltern?', 'How often do you see your parents?', 'Ich sehe meine Eltern zweimal im Jahr.', ['jede Woche', 'einmal im Monat', 'selten', 'oft', 'telefonieren']],
    [17, 'Hast du viele Freunde hier?', 'Do you have many friends here?', 'Ja, ich habe ein paar gute Freunde hier.', ['viele', 'ein paar', 'noch nicht', 'Kollegen', 'kennenlernen']],
    [18, 'Was machst du mit deinen Freunden?', 'What do you do with your friends?', 'Wir kochen zusammen oder gehen ins Kino.', ['zusammen', 'ins Kino gehen', 'Kaffee trinken', 'spazieren gehen', 'Fußball spielen']],
  ]),
  ...questionSet('Freizeit', 'A1', [
    [19, 'Was machst du am Wochenende?', 'What do you do at the weekend?', 'Am Wochenende gehe ich spazieren und treffe Freunde.', ['am Samstag', 'am Sonntag', 'ausschlafen', 'Freunde treffen', 'einkaufen']],
    [20, 'Treibst du Sport?', 'Do you do any sport?', 'Ja, ich gehe zweimal pro Woche ins Fitnessstudio.', ['joggen', 'Rad fahren', 'schwimmen', 'Yoga', 'pro Woche']],
    [21, 'Was isst du gern?', 'What do you like to eat?', 'Ich esse gern Pizza und Gemüse.', ['gern', 'am liebsten', 'Fleisch', 'Fisch', 'Obst']],
    [22, 'Liest du gern?', 'Do you like reading?', 'Ja, ich lese gern Krimis.', ['Bücher', 'Romane', 'Zeitung', 'nicht so gern', 'am Abend']],
    [23, 'Welche Musik hörst du gern?', 'What music do you like?', 'Ich höre gern Pop und ein bisschen Jazz.', ['Rock', 'klassische Musik', 'Rap', 'am liebsten', 'im Auto']],
    [24, 'Wohin fährst du im Urlaub?', 'Where do you go on holiday?', 'Im Urlaub fahre ich ans Meer.', ['in die Berge', 'zu meiner Familie', 'nach Italien', 'mit dem Zug', 'fliegen']],
    [25, 'Was hast du gestern Abend gemacht?', 'What did you do yesterday evening?', 'Ich habe gekocht und einen Film gesehen.', ['Ich habe', 'Ich bin', 'gelesen', 'gegessen', 'ins Kino gegangen']],
  ]),
  ...questionSet('Arbeit und Schule', 'A2', [
    [26, 'Wo arbeitest du?', 'Where do you work?', 'Ich arbeite bei einer Softwarefirma in Berlin.', ['bei', 'in einem Büro', 'im Krankenhaus', 'von zu Hause', 'die Firma']],
    [27, 'Seit wann arbeitest du dort?', 'How long have you worked there?', 'Ich arbeite dort seit zwei Jahren.', ['seit', 'einem Jahr', 'sechs Monaten', 'erst seit', 'schon lange']],
    [28, 'Wie kommst du zur Arbeit?', 'How do you get to work?', 'Ich fahre mit der U-Bahn zur Arbeit.', ['mit dem Bus', 'mit dem Fahrrad', 'mit dem Auto', 'zu Fuß', 'brauche']],
    [29, 'Wann fängt deine Arbeit an?', 'When does your work start?', 'Meine Arbeit fängt um neun Uhr an.', ['um acht Uhr', 'fängt an', 'hört auf', 'Feierabend', 'flexibel']],
    [30, 'Was gefällt dir an deiner Arbeit?', 'What do you like about your job?', 'Mir gefallen meine Kollegen und die interessanten Projekte.', ['Mir gefällt', 'das Team', 'die Kunden', 'abwechslungsreich', 'das Gehalt']],
    [31, 'Was hast du studiert?', 'What did you study?', 'Ich habe Informatik studiert.', ['Ich habe', 'studiert', 'eine Ausbildung gemacht', 'Wirtschaft', 'an der Universität']],
    [32, 'Was möchtest du in Zukunft machen?', 'What would you like to do in the future?', 'Ich möchte in Zukunft ein eigenes Team leiten.', ['Ich möchte', 'später', 'eine neue Stelle', 'mich selbstständig machen', 'weiterlernen']],
  ]),
  ...questionSet('Wohnen und Alltag', 'A2', [
    [33, 'Wie ist deine Wohnung?', 'What is your flat like?', 'Meine Wohnung ist klein, aber hell und ruhig.', ['groß', 'gemütlich', 'laut', 'teuer', 'der Balkon']],
    [34, 'Wie viele Zimmer hat deine Wohnung?', 'How many rooms does your flat have?', 'Sie hat zwei Zimmer, eine Küche und ein Bad.', ['das Wohnzimmer', 'das Schlafzimmer', 'die Küche', 'das Bad', 'der Flur']],
    [35, 'Wohnst du allein?', 'Do you live alone?', 'Nein, ich wohne mit einem Freund zusammen.', ['allein', 'zusammen', 'mit meiner Familie', 'in einer WG', 'mit meinem Partner']],
    [36, 'Wann stehst du morgens auf?', 'When do you get up in the morning?', 'Ich stehe um sieben Uhr auf.', ['stehe auf', 'um halb sieben', 'früh', 'spät', 'der Wecker']],
    [37, 'Was frühstückst du?', 'What do you have for breakfast?', 'Ich esse Brot mit Käse und trinke einen Kaffee.', ['das Müsli', 'das Ei', 'der Tee', 'die Marmelade', 'nichts']],
    [38, 'Wo kaufst du ein?', 'Where do you go shopping?', 'Ich kaufe im Supermarkt in meiner Straße ein.', ['kaufe ein', 'auf dem Markt', 'beim Bäcker', 'online', 'einmal pro Woche']],
    [39, 'Was machst du nach der Arbeit?', 'What do you do after work?', 'Nach der Arbeit koche ich und rufe meine Familie an.', ['Nach der Arbeit', 'Sport machen', 'fernsehen', 'ausruhen', 'Deutsch lernen']],
  ]),
  ...questionSet('Beim Arzt und auf dem Amt', 'A2', [
    [40, 'Was fehlt Ihnen?', "What's wrong?", 'Ich habe seit zwei Tagen Kopfschmerzen und Fieber.', ['Halsschmerzen', 'Bauchschmerzen', 'der Husten', 'erkältet', 'Mir ist schlecht']],
    [41, 'Seit wann haben Sie die Schmerzen?', 'How long have you had the pain?', 'Ich habe die Schmerzen seit gestern Abend.', ['seit', 'heute Morgen', 'drei Tagen', 'einer Woche', 'schlimmer']],
    [42, 'Nehmen Sie Medikamente?', 'Do you take any medication?', 'Nein, ich nehme keine Medikamente.', ['die Tablette', 'jeden Tag', 'gegen', 'allergisch gegen', 'keine']],
    [43, 'Haben Sie einen Termin?', 'Do you have an appointment?', 'Ja, ich habe um zehn Uhr einen Termin.', ['um', 'Uhr', 'keinen Termin', 'einen Termin machen', 'dringend']],
    [44, 'Wie kann ich Ihnen helfen?', 'How can I help you?', 'Ich möchte mich anmelden. Ich bin neu in der Stadt.', ['Ich möchte', 'mich anmelden', 'einen Ausweis beantragen', 'ein Formular', 'umziehen']],
    [45, 'Haben Sie Ihren Pass dabei?', 'Do you have your passport with you?', 'Ja, hier ist mein Pass.', ['der Pass', 'der Ausweis', 'die Aufenthaltserlaubnis', 'vergessen', 'hier bitte']],
  ]),
]
