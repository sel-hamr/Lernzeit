import { questionSet, story } from '../build'
import type { PackQuestion, PackStory } from '../types'

export const STORIES: PackStory[] = [
  story(
    'fr',
    1,
    'A1',
    'Une journée à Paris',
    `Léa habite à Paris. Elle a un petit appartement et un chat. Le chat s'appelle Minou.

Le matin, Léa boit un café et mange du pain avec du fromage. Minou mange aussi. Puis Léa prend le métro.

Léa travaille dans une école. Elle aime son travail. Les enfants sont gentils.

Le soir, Léa rentre à la maison. Elle lit un livre et Minou dort sur le lit. À dix heures, Léa dort aussi.`,
    `Léa lives in Paris. She has a small flat and a cat. The cat is called Minou.

In the morning Léa drinks a coffee and eats bread with cheese. Minou eats too. Then Léa takes the metro.

Léa works in a school. She likes her job. The children are nice.

In the evening Léa goes home. She reads a book and Minou sleeps on the bed. At ten o'clock Léa sleeps too.`,
    'everyday',
  ),
  story(
    'fr',
    2,
    'A1',
    'Au café',
    `Karim et Julie sont amis. Le samedi, ils vont au café.

« Bonjour ! Un café et un thé, s'il vous plaît », dit Karim. Le serveur est sympa.

Julie parle de sa famille. Elle a un frère et une sœur. Son frère habite à Lyon.

Le café est bon. Karim paie et ils disent au revoir. « À samedi prochain ! »`,
    `Karim and Julie are friends. On Saturdays they go to the café.

"Hello! A coffee and a tea, please," says Karim. The waiter is friendly.

Julie talks about her family. She has a brother and a sister. Her brother lives in Lyon.

The coffee is good. Karim pays and they say goodbye. "See you next Saturday!"`,
    'food',
  ),
  story(
    'fr',
    3,
    'A1',
    'Le chien de Tom',
    `Tom a un chien. Le chien est grand et noir. Il s'appelle Max.

Chaque matin, Tom et Max vont au parc. Il fait beau et le soleil brille.

Max aime jouer avec les enfants. Il court vite. Tom est content.

Après le parc, ils rentrent à la maison. Max boit de l'eau et dort.`,
    `Tom has a dog. The dog is big and black. He is called Max.

Every morning Tom and Max go to the park. The weather is nice and the sun is shining.

Max likes playing with the children. He runs fast. Tom is happy.

After the park they go home. Max drinks water and sleeps.`,
    'animals',
  ),
  story(
    'fr',
    4,
    'A2',
    'Un week-end à la mer',
    `Le week-end dernier, Sophie et son frère sont partis à la mer. Ils ont pris le train à huit heures.

Le voyage a duré trois heures. À la gare, ils ont cherché leur hôtel. Il était petit mais très propre.

Le samedi, il a fait beau. Ils sont allés à la plage et ils ont nagé. Le soir, ils ont mangé du poisson dans un restaurant.

Le dimanche, il a plu toute la journée. Ils ont visité un musée et ils ont acheté des souvenirs. C'était un beau week-end.`,
    `Last weekend Sophie and her brother went to the seaside. They took the train at eight o'clock.

The journey took three hours. At the station they looked for their hotel. It was small but very clean.

On Saturday the weather was nice. They went to the beach and swam. In the evening they ate fish in a restaurant.

On Sunday it rained all day. They visited a museum and bought souvenirs. It was a lovely weekend.`,
    'travel',
  ),
  story(
    'fr',
    5,
    'A2',
    'Chez le médecin',
    `Lundi matin, Marc s'est réveillé avec mal à la tête. Il avait aussi de la fièvre.

Il a téléphoné au médecin et il a pris rendez-vous pour dix heures. Il a attendu vingt minutes dans la salle d'attente.

Le médecin a dit : « Vous avez la grippe. Vous devez rester au lit pendant trois jours et boire beaucoup d'eau. »

Marc est rentré à la maison. Il a pris son médicament et il s'est reposé. Jeudi, il allait déjà mieux.`,
    `On Monday morning Marc woke up with a headache. He also had a fever.

He phoned the doctor and made an appointment for ten o'clock. He waited twenty minutes in the waiting room.

The doctor said: "You have the flu. You must stay in bed for three days and drink a lot of water."

Marc went home. He took his medicine and rested. By Thursday he was already feeling better.`,
    'health',
  ),
]

export const QUESTIONS: PackQuestion[] = [
  ...questionSet('fr', 'Se présenter', 'A1', [
    [1, 'Comment tu t’appelles ?', "What's your name?", 'Je m’appelle Sara.', ['Je m’appelle', 'Mon nom est', 'le prénom', 'le nom']],
    [2, 'Quel âge as-tu ?', 'How old are you?', "J'ai vingt-huit ans.", ["J'ai", 'ans', 'vingt', 'trente']],
    [3, "D'où viens-tu ?", 'Where are you from?', 'Je viens du Maroc.', ['Je viens de', 'du Maroc', 'de France', "d'Espagne"]],
    [4, 'Où habites-tu ?', 'Where do you live?', "J'habite à Casablanca.", ["J'habite à", 'en France', 'depuis', 'la ville']],
    [5, 'Quelles langues parles-tu ?', 'Which languages do you speak?', "Je parle arabe, anglais et un peu français.", ['Je parle', 'un peu', 'couramment', 'la langue maternelle']],
    [6, 'Tu as des frères et sœurs ?', 'Do you have brothers and sisters?', "Oui, j'ai un frère et une sœur.", ['un frère', 'une sœur', 'fils unique', 'fille unique']],
  ]),
  ...questionSet('fr', 'Loisirs', 'A1', [
    [7, 'Qu’est-ce que tu aimes faire ?', 'What do you like doing?', "J'aime lire et faire du sport.", ["J'aime", 'lire', 'cuisiner', 'voyager', 'la musique']],
    [8, 'Tu fais du sport ?', 'Do you do any sport?', 'Oui, je joue au football le samedi.', ['je joue au', 'je fais du', 'la natation', 'le vélo']],
    [9, 'Qu’est-ce que tu manges le matin ?', 'What do you eat in the morning?', 'Je mange du pain et je bois un café.', ['du pain', 'des œufs', 'un thé', 'un jus d’orange']],
    [10, 'Tu aimes cuisiner ?', 'Do you like cooking?', "Oui, j'aime cuisiner le week-end.", ['cuisiner', 'le plat', 'la recette', 'le week-end']],
  ]),
  ...questionSet('fr', 'Travail et vie quotidienne', 'A2', [
    [11, 'Qu’est-ce que tu fais dans la vie ?', 'What do you do for a living?', 'Je suis développeur dans une entreprise.', ['Je suis', 'Je travaille comme', "l'entreprise", 'le métier']],
    [12, 'Comment tu vas au travail ?', 'How do you get to work?', 'Je prends le bus, ça dure vingt minutes.', ['en voiture', 'à pied', 'je prends', 'ça dure']],
    [13, 'Qu’est-ce que tu as fait le week-end dernier ?', 'What did you do last weekend?', 'Je suis allé au cinéma avec des amis.', ['je suis allé', "j'ai vu", "j'ai mangé", 'avec des amis']],
    [14, 'Où es-tu parti en vacances ?', 'Where did you go on holiday?', 'Je suis parti en Espagne avec ma famille.', ['je suis parti', 'en vacances', 'la plage', 'la montagne']],
    [15, 'Depuis quand apprends-tu le français ?', 'How long have you been learning French?', "J'apprends le français depuis un an.", ['depuis', 'un an', 'six mois', "j'apprends"]],
    [16, 'Qu’est-ce que tu fais quand tu es malade ?', 'What do you do when you are ill?', 'Je reste au lit et je bois beaucoup de thé.', ['je reste', 'le médecin', 'le médicament', 'je me repose']],
  ]),
]
