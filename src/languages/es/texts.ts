import { questionSet, story } from '../build'
import type { PackQuestion, PackStory } from '../types'

export const STORIES: PackStory[] = [
  story(
    'es',
    1,
    'A1',
    'Un día en Madrid',
    `Lucía vive en Madrid. Tiene un piso pequeño y un gato. El gato se llama Tigre.

Por la mañana, Lucía bebe un café y come pan con queso. Tigre también come. Después, Lucía toma el metro.

Lucía trabaja en una escuela. Le gusta su trabajo. Los niños son simpáticos.

Por la noche, Lucía vuelve a casa. Lee un libro y Tigre duerme en la cama. A las diez, Lucía también duerme.`,
    `Lucía lives in Madrid. She has a small flat and a cat. The cat is called Tigre.

In the morning Lucía drinks a coffee and eats bread with cheese. Tigre eats too. Then Lucía takes the metro.

Lucía works in a school. She likes her job. The children are nice.

In the evening Lucía goes home. She reads a book and Tigre sleeps on the bed. At ten o'clock Lucía sleeps too.`,
    'everyday',
  ),
  story(
    'es',
    2,
    'A1',
    'En el café',
    `Omar y Elena son amigos. Los sábados van a un café.

«Hola. Un café y un té, por favor», dice Omar. El camarero es simpático.

Elena habla de su familia. Tiene un hermano y una hermana. Su hermano vive en Valencia.

El café está muy bueno. Omar paga y dicen adiós. «¡Hasta el sábado!»`,
    `Omar and Elena are friends. On Saturdays they go to a café.

"Hello. A coffee and a tea, please," says Omar. The waiter is friendly.

Elena talks about her family. She has a brother and a sister. Her brother lives in Valencia.

The coffee is very good. Omar pays and they say goodbye. "See you on Saturday!"`,
    'food',
  ),
  story(
    'es',
    3,
    'A1',
    'El perro de Carlos',
    `Carlos tiene un perro. El perro es grande y negro. Se llama Rayo.

Todas las mañanas, Carlos y Rayo van al parque. Hace buen tiempo y hace sol.

A Rayo le gusta jugar con los niños. Corre muy rápido. Carlos está contento.

Después del parque, vuelven a casa. Rayo bebe agua y duerme.`,
    `Carlos has a dog. The dog is big and black. He is called Rayo.

Every morning Carlos and Rayo go to the park. The weather is nice and it is sunny.

Rayo likes playing with the children. He runs very fast. Carlos is happy.

After the park they go home. Rayo drinks water and sleeps.`,
    'animals',
  ),
  story(
    'es',
    4,
    'A2',
    'Un fin de semana en la playa',
    `El fin de semana pasado, Marta y su hermano fueron a la playa. Tomaron el tren a las ocho.

El viaje duró tres horas. En la estación buscaron su hotel. Era pequeño pero muy limpio.

El sábado hizo buen tiempo. Fueron a la playa y nadaron. Por la noche comieron pescado en un restaurante.

El domingo llovió todo el día. Visitaron un museo y compraron recuerdos. Fue un fin de semana muy bonito.`,
    `Last weekend Marta and her brother went to the beach. They took the train at eight o'clock.

The journey took three hours. At the station they looked for their hotel. It was small but very clean.

On Saturday the weather was nice. They went to the beach and swam. In the evening they ate fish in a restaurant.

On Sunday it rained all day. They visited a museum and bought souvenirs. It was a lovely weekend.`,
    'travel',
  ),
  story(
    'es',
    5,
    'A2',
    'En el médico',
    `El lunes por la mañana, Javier se despertó con dolor de cabeza. También tenía fiebre.

Llamó al médico y pidió una cita para las diez. Esperó veinte minutos en la sala de espera.

El médico le dijo: «Tiene gripe. Tiene que quedarse en la cama tres días y beber mucha agua».

Javier volvió a casa. Tomó la medicina y descansó. El jueves ya estaba mejor.`,
    `On Monday morning Javier woke up with a headache. He also had a fever.

He called the doctor and asked for an appointment at ten. He waited twenty minutes in the waiting room.

The doctor told him: "You have the flu. You have to stay in bed for three days and drink a lot of water."

Javier went home. He took the medicine and rested. By Thursday he was already better.`,
    'health',
  ),
]

export const QUESTIONS: PackQuestion[] = [
  ...questionSet('es', 'Presentarse', 'A1', [
    [1, '¿Cómo te llamas?', "What's your name?", 'Me llamo Sara.', ['Me llamo', 'Mi nombre es', 'el nombre', 'el apellido']],
    [2, '¿Cuántos años tienes?', 'How old are you?', 'Tengo veintiocho años.', ['Tengo', 'años', 'veinte', 'treinta']],
    [3, '¿De dónde eres?', 'Where are you from?', 'Soy de Marruecos.', ['Soy de', 'Marruecos', 'España', 'Francia']],
    [4, '¿Dónde vives?', 'Where do you live?', 'Vivo en Casablanca.', ['Vivo en', 'desde hace', 'la ciudad', 'el barrio']],
    [5, '¿Qué idiomas hablas?', 'Which languages do you speak?', 'Hablo árabe, inglés y un poco de español.', ['Hablo', 'un poco de', 'bien', 'la lengua materna']],
    [6, '¿Tienes hermanos?', 'Do you have brothers and sisters?', 'Sí, tengo un hermano y una hermana.', ['un hermano', 'una hermana', 'hijo único', 'hija única']],
  ]),
  ...questionSet('es', 'Tiempo libre', 'A1', [
    [7, '¿Qué te gusta hacer?', 'What do you like doing?', 'Me gusta leer y hacer deporte.', ['Me gusta', 'leer', 'cocinar', 'viajar', 'la música']],
    [8, '¿Haces deporte?', 'Do you do any sport?', 'Sí, juego al fútbol los sábados.', ['juego al', 'hago', 'la natación', 'la bicicleta']],
    [9, '¿Qué desayunas?', 'What do you have for breakfast?', 'Desayuno pan y un café.', ['pan', 'huevos', 'un té', 'un zumo de naranja']],
    [10, '¿Te gusta cocinar?', 'Do you like cooking?', 'Sí, me gusta cocinar los fines de semana.', ['cocinar', 'el plato', 'la receta', 'el fin de semana']],
  ]),
  ...questionSet('es', 'Trabajo y vida diaria', 'A2', [
    [11, '¿A qué te dedicas?', 'What do you do for a living?', 'Soy programador en una empresa.', ['Soy', 'Trabajo como', 'la empresa', 'la oficina']],
    [12, '¿Cómo vas al trabajo?', 'How do you get to work?', 'Voy en autobús, tardo veinte minutos.', ['en coche', 'a pie', 'en autobús', 'tardo']],
    [13, '¿Qué hiciste el fin de semana pasado?', 'What did you do last weekend?', 'Fui al cine con unos amigos.', ['fui', 'vi', 'comí', 'con unos amigos']],
    [14, '¿Dónde fuiste de vacaciones?', 'Where did you go on holiday?', 'Fui a Francia con mi familia.', ['fui a', 'de vacaciones', 'la playa', 'la montaña']],
    [15, '¿Desde cuándo estudias español?', 'How long have you been studying Spanish?', 'Estudio español desde hace un año.', ['desde hace', 'un año', 'seis meses', 'estudio']],
    [16, '¿Qué haces cuando estás enfermo?', 'What do you do when you are ill?', 'Me quedo en la cama y bebo mucho té.', ['me quedo', 'el médico', 'la medicina', 'descanso']],
  ]),
]
