import { questionSet, story } from '../build'
import type { PackQuestion, PackStory } from '../types'
import { m } from './words'

export const STORIES: PackStory[] = [
  story(
    'en',
    1,
    'A1',
    'A Day in London',
    `Emma lives in London. She has a small flat and a cat. The cat is called Lucky.

In the morning Emma drinks coffee and eats bread with cheese. Then she takes the bus to work. She works in a school and she likes her job.

In the evening Emma goes home. She reads a book and Lucky sleeps on the bed. At ten o'clock Emma sleeps too.`,
    m(
      `تسكن إيما في لندن. عندها شقة صغيرة وقطة. اسم القطة لاكي.

في الصباح تشرب إيما القهوة وتأكل الخبز مع الجبن. ثم تركب الحافلة إلى العمل. تعمل في مدرسة وتحب عملها.

في المساء ترجع إيما إلى البيت. تقرأ كتابا ولاكي تنام على السرير. في الساعة العاشرة تنام إيما أيضا.`,
      `Emma habite à Londres. Elle a un petit appartement et un chat. Le chat s'appelle Lucky.

Le matin, Emma boit un café et mange du pain avec du fromage. Puis elle prend le bus pour aller au travail. Elle travaille dans une école et elle aime son travail.

Le soir, Emma rentre à la maison. Elle lit un livre et Lucky dort sur le lit. À dix heures, Emma dort aussi.`,
      `Emma vive en Londres. Tiene un piso pequeño y un gato. El gato se llama Lucky.

Por la mañana, Emma bebe café y come pan con queso. Después toma el autobús para ir al trabajo. Trabaja en una escuela y le gusta su trabajo.

Por la noche, Emma vuelve a casa. Lee un libro y Lucky duerme en la cama. A las diez, Emma también duerme.`,
      `Emma wohnt in London. Sie hat eine kleine Wohnung und eine Katze. Die Katze heißt Lucky.

Am Morgen trinkt Emma Kaffee und isst Brot mit Käse. Dann fährt sie mit dem Bus zur Arbeit. Sie arbeitet in einer Schule und mag ihre Arbeit.

Am Abend geht Emma nach Hause. Sie liest ein Buch und Lucky schläft auf dem Bett. Um zehn Uhr schläft Emma auch.`,
    ),
    'everyday',
  ),
  story(
    'en',
    2,
    'A1',
    'At the Café',
    `Sam and Nora are friends. On Saturdays they go to a café in town.

"Hello! A coffee and a tea, please," says Sam. Nora talks about her family. She has a brother and a sister.

The coffee is good. Sam pays and they say goodbye. "See you next Saturday!"`,
    m(
      `سام ونورة صديقان. يوم السبت يذهبان إلى مقهى في المدينة.

يقول سام: «مرحبا! قهوة وشاي من فضلك.» تتكلم نورة عن عائلتها. عندها أخ وأخت.

القهوة جيدة. يدفع سام ويقولان مع السلامة. «إلى اللقاء يوم السبت القادم!»`,
      `Sam et Nora sont amis. Le samedi, ils vont dans un café en ville.

« Bonjour ! Un café et un thé, s'il vous plaît », dit Sam. Nora parle de sa famille. Elle a un frère et une sœur.

Le café est bon. Sam paie et ils se disent au revoir. « À samedi prochain ! »`,
      `Sam y Nora son amigos. Los sábados van a un café del centro.

«¡Hola! Un café y un té, por favor», dice Sam. Nora habla de su familia. Tiene un hermano y una hermana.

El café está bueno. Sam paga y se despiden. «¡Hasta el sábado que viene!»`,
      `Sam und Nora sind Freunde. Am Samstag gehen sie in ein Café in der Stadt.

„Hallo! Einen Kaffee und einen Tee, bitte“, sagt Sam. Nora erzählt von ihrer Familie. Sie hat einen Bruder und eine Schwester.

Der Kaffee ist gut. Sam bezahlt und sie verabschieden sich. „Bis nächsten Samstag!“`,
    ),
    'food',
  ),
  story(
    'en',
    3,
    'A1',
    "Ben's Dog",
    `Ben has a dog. The dog is big and black. His name is Max.

Every morning Ben and Max go to the park. The sun is shining. Max likes playing with the children, and he runs very fast.

After the park they go home. Max drinks some water and sleeps. Ben is happy.`,
    m(
      `عند بن كلب. الكلب كبير وأسود. اسمه ماكس.

كل صباح يذهب بن وماكس إلى الحديقة. الشمس مشرقة. ماكس يحب اللعب مع الأطفال، ويجري بسرعة كبيرة.

بعد الحديقة يرجعان إلى البيت. يشرب ماكس قليلا من الماء وينام. بن سعيد.`,
      `Ben a un chien. Le chien est grand et noir. Il s'appelle Max.

Chaque matin, Ben et Max vont au parc. Le soleil brille. Max aime jouer avec les enfants, et il court très vite.

Après le parc, ils rentrent à la maison. Max boit un peu d'eau et dort. Ben est content.`,
      `Ben tiene un perro. El perro es grande y negro. Se llama Max.

Todas las mañanas, Ben y Max van al parque. Hace sol. A Max le gusta jugar con los niños, y corre muy rápido.

Después del parque vuelven a casa. Max bebe un poco de agua y duerme. Ben está contento.`,
      `Ben hat einen Hund. Der Hund ist groß und schwarz. Er heißt Max.

Jeden Morgen gehen Ben und Max in den Park. Die Sonne scheint. Max spielt gern mit den Kindern, und er läuft sehr schnell.

Nach dem Park gehen sie nach Hause. Max trinkt etwas Wasser und schläft. Ben ist glücklich.`,
    ),
    'animals',
  ),
  story(
    'en',
    4,
    'A2',
    'A Weekend by the Sea',
    `Last weekend Anna and her brother went to the seaside. They took the train at eight o'clock, and the trip took three hours.

On Saturday the weather was lovely. They swam in the sea and ate fish in a small restaurant. On Sunday it rained all day, so they visited a museum.

They came home tired but happy. It was a great weekend.`,
    m(
      `في نهاية الأسبوع الماضي ذهبت آنا وأخوها إلى البحر. ركبا القطار في الساعة الثامنة، واستغرقت الرحلة ثلاث ساعات.

يوم السبت كان الطقس جميلا. سبحا في البحر وأكلا السمك في مطعم صغير. يوم الأحد نزل المطر طول اليوم، فزارا متحفا.

رجعا إلى البيت متعبين لكن سعيدين. كانت عطلة رائعة.`,
      `Le week-end dernier, Anna et son frère sont allés à la mer. Ils ont pris le train à huit heures, et le voyage a duré trois heures.

Le samedi, il a fait très beau. Ils ont nagé dans la mer et ont mangé du poisson dans un petit restaurant. Le dimanche, il a plu toute la journée, alors ils ont visité un musée.

Ils sont rentrés fatigués mais heureux. C'était un super week-end.`,
      `El fin de semana pasado, Anna y su hermano fueron a la playa. Tomaron el tren a las ocho, y el viaje duró tres horas.

El sábado hizo muy buen tiempo. Nadaron en el mar y comieron pescado en un restaurante pequeño. El domingo llovió todo el día, así que visitaron un museo.

Volvieron a casa cansados pero contentos. Fue un fin de semana estupendo.`,
      `Letztes Wochenende sind Anna und ihr Bruder ans Meer gefahren. Sie haben um acht Uhr den Zug genommen, und die Reise hat drei Stunden gedauert.

Am Samstag war das Wetter herrlich. Sie sind im Meer geschwommen und haben in einem kleinen Restaurant Fisch gegessen. Am Sonntag hat es den ganzen Tag geregnet, also haben sie ein Museum besucht.

Sie sind müde, aber glücklich nach Hause gekommen. Es war ein tolles Wochenende.`,
    ),
    'travel',
  ),
  story(
    'en',
    5,
    'A2',
    'At the Doctor',
    `On Monday morning Jack woke up with a headache and a fever. He called the doctor and made an appointment for ten o'clock.

The doctor said, "You have the flu. You must stay in bed for three days and drink a lot of water."

Jack went home, took his medicine and rested. By Thursday he was already feeling better.`,
    m(
      `يوم الاثنين صباحا استيقظ جاك وعنده صداع وحمى. اتصل بالطبيب وأخذ موعدا في الساعة العاشرة.

قال الطبيب: «عندك زكام. يجب أن تبقى في السرير ثلاثة أيام وتشرب الماء كثيرا.»

رجع جاك إلى البيت، وأخذ الدواء وارتاح. يوم الخميس كان قد تحسن.`,
      `Lundi matin, Jack s'est réveillé avec mal à la tête et de la fièvre. Il a appelé le médecin et a pris rendez-vous pour dix heures.

Le médecin a dit : « Vous avez la grippe. Vous devez rester au lit pendant trois jours et boire beaucoup d'eau. »

Jack est rentré chez lui, il a pris son médicament et il s'est reposé. Jeudi, il allait déjà mieux.`,
      `El lunes por la mañana, Jack se despertó con dolor de cabeza y fiebre. Llamó al médico y pidió una cita para las diez.

El médico dijo: «Tiene gripe. Tiene que quedarse en la cama tres días y beber mucha agua».

Jack volvió a casa, tomó la medicina y descansó. El jueves ya se sentía mejor.`,
      `Am Montagmorgen ist Jack mit Kopfschmerzen und Fieber aufgewacht. Er hat beim Arzt angerufen und einen Termin um zehn Uhr bekommen.

Der Arzt sagte: „Sie haben die Grippe. Sie müssen drei Tage im Bett bleiben und viel Wasser trinken.“

Jack ist nach Hause gegangen, hat sein Medikament genommen und sich ausgeruht. Am Donnerstag ging es ihm schon besser.`,
    ),
    'health',
  ),
]

export const QUESTIONS: PackQuestion[] = [
  ...questionSet('en', 'Introducing yourself', 'A1', [
    [1, "What's your name?", m('ما اسمك؟', 'Comment tu t’appelles ?', '¿Cómo te llamas?', 'Wie heißt du?'), 'My name is Sara.', ['My name is', "I'm", 'first name', 'surname']],
    [2, 'How old are you?', m('كم عمرك؟', 'Quel âge as-tu ?', '¿Cuántos años tienes?', 'Wie alt bist du?'), "I'm twenty-eight years old.", ["I'm", 'years old', 'twenty', 'thirty']],
    [3, 'Where are you from?', m('من أين أنت؟', "D'où viens-tu ?", '¿De dónde eres?', 'Woher kommst du?'), "I'm from Morocco.", ["I'm from", 'Morocco', 'France', 'Spain']],
    [4, 'Where do you live?', m('أين تسكن؟', 'Où habites-tu ?', '¿Dónde vives?', 'Wo wohnst du?'), 'I live in Casablanca.', ['I live in', 'near', 'the city', 'since']],
    [5, 'Which languages do you speak?', m('ما اللغات التي تتكلمها؟', 'Quelles langues parles-tu ?', '¿Qué idiomas hablas?', 'Welche Sprachen sprichst du?'), 'I speak Arabic, French and a little English.', ['I speak', 'a little', 'fluently', 'mother tongue']],
    [6, 'Do you have any brothers or sisters?', m('هل عندك إخوة؟', 'Tu as des frères et sœurs ?', '¿Tienes hermanos?', 'Hast du Geschwister?'), 'Yes, I have one brother and one sister.', ['brother', 'sister', 'only child', 'older']],
  ]),
  ...questionSet('en', 'Free time', 'A1', [
    [7, 'What do you like doing?', m('ماذا تحب أن تفعل؟', 'Qu’est-ce que tu aimes faire ?', '¿Qué te gusta hacer?', 'Was machst du gern?'), 'I like reading and playing football.', ['I like', 'reading', 'cooking', 'travelling', 'music']],
    [8, 'Do you play any sports?', m('هل تمارس الرياضة؟', 'Tu fais du sport ?', '¿Practicas algún deporte?', 'Treibst du Sport?'), 'Yes, I play football on Saturdays.', ['I play', 'I go', 'swimming', 'running']],
    [9, 'What do you have for breakfast?', m('ماذا تأكل في الفطور؟', 'Qu’est-ce que tu manges au petit-déjeuner ?', '¿Qué desayunas?', 'Was isst du zum Frühstück?'), 'I have bread and a cup of coffee.', ['bread', 'eggs', 'a cup of tea', 'orange juice']],
    [10, 'Do you like cooking?', m('هل تحب الطبخ؟', 'Tu aimes cuisiner ?', '¿Te gusta cocinar?', 'Kochst du gern?'), 'Yes, I like cooking at the weekend.', ['cooking', 'dish', 'recipe', 'at the weekend']],
  ]),
  ...questionSet('en', 'Work and daily life', 'A2', [
    [11, 'What do you do?', m('ما عملك؟', 'Qu’est-ce que tu fais dans la vie ?', '¿A qué te dedicas?', 'Was machst du beruflich?'), "I'm a software developer at a big company.", ["I'm a", 'I work as', 'company', 'office']],
    [12, 'How do you get to work?', m('كيف تذهب إلى العمل؟', 'Comment tu vas au travail ?', '¿Cómo vas al trabajo?', 'Wie kommst du zur Arbeit?'), 'I take the bus. It takes twenty minutes.', ['by car', 'on foot', 'I take the bus', 'it takes']],
    [13, 'What did you do last weekend?', m('ماذا فعلت في نهاية الأسبوع الماضي؟', 'Qu’est-ce que tu as fait le week-end dernier ?', '¿Qué hiciste el fin de semana pasado?', 'Was hast du letztes Wochenende gemacht?'), 'I went to the cinema with some friends.', ['I went', 'I saw', 'I visited', 'with friends']],
    [14, 'Where did you go on holiday?', m('أين قضيت عطلتك؟', 'Où es-tu parti en vacances ?', '¿Adónde fuiste de vacaciones?', 'Wohin bist du in den Urlaub gefahren?'), 'I went to Spain with my family.', ['I went to', 'on holiday', 'the beach', 'the mountains']],
    [15, 'How long have you been learning English?', m('منذ متى تتعلم الإنجليزية؟', "Depuis quand apprends-tu l'anglais ?", '¿Desde cuándo aprendes inglés?', 'Seit wann lernst du Englisch?'), "I've been learning English for a year.", ["I've been learning", 'for a year', 'six months', 'since']],
    [16, 'What do you do when you are ill?', m('ماذا تفعل عندما تكون مريضا؟', 'Qu’est-ce que tu fais quand tu es malade ?', '¿Qué haces cuando estás enfermo?', 'Was machst du, wenn du krank bist?'), 'I stay in bed and drink a lot of tea.', ['I stay', 'the doctor', 'medicine', 'I rest']],
  ]),
]
