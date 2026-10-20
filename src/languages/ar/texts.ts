import { questionSet, story } from '../build'
import type { PackQuestion, PackStory } from '../types'

export const STORIES: PackStory[] = [
  story(
    'ar',
    1,
    'A1',
    'يوم في الرباط',
    `ليلى تسكن في الرباط. عندها شقة صغيرة وقطة. اسم القطة ميمي.

في الصباح تشرب ليلى القهوة وتأكل الخبز مع الجبن. ميمي تأكل أيضا. ثم تذهب ليلى إلى العمل بالحافلة.

ليلى تعمل في مدرسة. هي تحب عملها. الأطفال لطفاء.

في المساء ترجع ليلى إلى البيت. تقرأ كتابا وميمي تنام على السرير. في الساعة العاشرة تنام ليلى أيضا.`,
    `Laila lives in Rabat. She has a small flat and a cat. The cat's name is Mimi.

In the morning Laila drinks coffee and eats bread with cheese. Mimi eats too. Then Laila goes to work by bus.

Laila works in a school. She loves her job. The children are kind.

In the evening Laila returns home. She reads a book and Mimi sleeps on the bed. At ten o'clock Laila sleeps too.`,
    'everyday',
  ),
  story(
    'ar',
    2,
    'A1',
    'في المقهى',
    `يوسف وسلمى صديقان. يوم السبت يذهبان إلى المقهى.

يقول يوسف: «مرحبا! قهوة وشاي بالنعناع من فضلك.» النادل لطيف.

تتكلم سلمى عن عائلتها. عندها أخ وأخت. أخوها يسكن في مراكش.

القهوة جيدة. يدفع يوسف ويقولان مع السلامة. «إلى اللقاء يوم السبت!»`,
    `Youssef and Salma are friends. On Saturday they go to the café.

Youssef says: "Hello! A coffee and a mint tea, please." The waiter is kind.

Salma talks about her family. She has a brother and a sister. Her brother lives in Marrakesh.

The coffee is good. Youssef pays and they say goodbye. "See you on Saturday!"`,
    'food',
  ),
  story(
    'ar',
    3,
    'A1',
    'كلب كريم',
    `عند كريم كلب. الكلب كبير وأسود. اسمه برق.

كل صباح يذهب كريم وبرق إلى الحديقة. الجو جميل والشمس مشرقة.

برق يحب اللعب مع الأطفال. هو يجري بسرعة. كريم سعيد.

بعد الحديقة يرجعان إلى البيت. برق يشرب الماء وينام.`,
    `Karim has a dog. The dog is big and black. His name is Barq.

Every morning Karim and Barq go to the park. The weather is nice and the sun is shining.

Barq loves playing with the children. He runs fast. Karim is happy.

After the park they return home. Barq drinks water and sleeps.`,
    'animals',
  ),
  story(
    'ar',
    4,
    'A2',
    'عطلة على البحر',
    `في نهاية الأسبوع الماضي سافرت نادية وأخوها إلى البحر. ركبا القطار في الساعة الثامنة.

استغرق السفر ثلاث ساعات. في المحطة بحثا عن الفندق. كان صغيرا لكنه نظيف جدا.

يوم السبت كان الجو جميلا. ذهبا إلى الشاطئ وسبحا. في المساء أكلا السمك في مطعم.

يوم الأحد نزل المطر طول اليوم. زارا متحفا واشتريا هدايا. كانت عطلة جميلة.`,
    `Last weekend Nadia and her brother travelled to the seaside. They took the train at eight o'clock.

The journey took three hours. At the station they looked for the hotel. It was small but very clean.

On Saturday the weather was beautiful. They went to the beach and swam. In the evening they ate fish in a restaurant.

On Sunday it rained all day. They visited a museum and bought presents. It was a lovely holiday.`,
    'travel',
  ),
  story(
    'ar',
    5,
    'A2',
    'عند الطبيب',
    `يوم الاثنين استيقظ عمر وعنده صداع. كانت عنده حمى أيضا.

اتصل بالطبيب وأخذ موعدا في الساعة العاشرة. انتظر عشرين دقيقة في غرفة الانتظار.

قال الطبيب: «عندك زكام. يجب أن تبقى في السرير ثلاثة أيام وتشرب الماء كثيرا.»

رجع عمر إلى البيت. أخذ الدواء وارتاح. يوم الخميس كان أحسن.`,
    `On Monday Omar woke up with a headache. He also had a fever.

He called the doctor and made an appointment at ten o'clock. He waited twenty minutes in the waiting room.

The doctor said: "You have a cold. You must stay in bed for three days and drink a lot of water."

Omar returned home. He took the medicine and rested. On Thursday he was better.`,
    'health',
  ),
]

export const QUESTIONS: PackQuestion[] = [
  ...questionSet('ar', 'التعارف', 'A1', [
    [1, 'ما اسمك؟', "What's your name?", 'اسمي سارة.', ['اسمي', 'الاسم', 'اسم العائلة', 'أنا']],
    [2, 'كم عمرك؟', 'How old are you?', 'عمري ثمانية وعشرون عاما.', ['عمري', 'عاما', 'عشرون', 'ثلاثون']],
    [3, 'من أين أنت؟', 'Where are you from?', 'أنا من المغرب.', ['أنا من', 'المغرب', 'فرنسا', 'إسبانيا']],
    [4, 'أين تسكن؟', 'Where do you live?', 'أسكن في الدار البيضاء.', ['أسكن في', 'المدينة', 'منذ', 'قريب من']],
    [5, 'ما اللغات التي تتكلمها؟', 'Which languages do you speak?', 'أتكلم العربية والفرنسية وقليلا من الإنجليزية.', ['أتكلم', 'قليلا', 'جيدا', 'اللغة الأم']],
    [6, 'هل عندك إخوة؟', 'Do you have brothers and sisters?', 'نعم، عندي أخ وأخت.', ['عندي', 'أخ', 'أخت', 'ليس عندي']],
  ]),
  ...questionSet('ar', 'الوقت الحر', 'A1', [
    [7, 'ماذا تحب أن تفعل؟', 'What do you like doing?', 'أحب القراءة والرياضة.', ['أحب', 'القراءة', 'الطبخ', 'السفر', 'الموسيقى']],
    [8, 'هل تمارس الرياضة؟', 'Do you do any sport?', 'نعم، ألعب كرة القدم يوم السبت.', ['ألعب', 'كرة القدم', 'السباحة', 'الجري']],
    [9, 'ماذا تأكل في الصباح؟', 'What do you eat in the morning?', 'آكل الخبز وأشرب القهوة.', ['الخبز', 'البيض', 'الشاي', 'عصير البرتقال']],
    [10, 'هل تحب الطبخ؟', 'Do you like cooking?', 'نعم، أحب الطبخ في نهاية الأسبوع.', ['الطبخ', 'الطبق', 'الوصفة', 'نهاية الأسبوع']],
  ]),
  ...questionSet('ar', 'العمل والحياة اليومية', 'A2', [
    [11, 'ما عملك؟', 'What is your job?', 'أنا مبرمج في شركة.', ['أنا', 'أعمل في', 'الشركة', 'المكتب']],
    [12, 'كيف تذهب إلى العمل؟', 'How do you get to work?', 'أذهب بالحافلة، وأحتاج عشرين دقيقة.', ['بالسيارة', 'مشيا', 'بالحافلة', 'دقيقة']],
    [13, 'ماذا فعلت في نهاية الأسبوع الماضي؟', 'What did you do last weekend?', 'ذهبت إلى السينما مع أصدقائي.', ['ذهبت', 'شاهدت', 'أكلت', 'مع أصدقائي']],
    [14, 'أين قضيت عطلتك؟', 'Where did you spend your holiday?', 'سافرت إلى إسبانيا مع عائلتي.', ['سافرت', 'العطلة', 'البحر', 'الجبل']],
    [15, 'منذ متى تدرس العربية؟', 'How long have you been studying Arabic?', 'أدرس العربية منذ سنة.', ['منذ', 'سنة', 'ستة أشهر', 'أدرس']],
    [16, 'ماذا تفعل عندما تكون مريضا؟', 'What do you do when you are ill?', 'أبقى في السرير وأشرب الشاي كثيرا.', ['أبقى', 'الطبيب', 'الدواء', 'أرتاح']],
  ]),
]
