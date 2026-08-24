// Road-sign reference catalog, ported from the Claude Design prototype.
//
// This is the one screen with no backend behind it, deliberately: it is static
// reference content, identical for every learner, and putting it in the bundle
// means it works offline and costs no query. The prototype shipped uz + en;
// the English has been replaced with Russian to match the app's locales.
//
// Categories follow the Vienna Convention, which Uzbekistan uses.

export const CATEGORY_TINTS = {
  warning: { dot: '#F6B23A', label: 'signs.catWarning' },
  priority: { dot: '#E2A33C', label: 'signs.catPriority' },
  prohibitory: { dot: '#D9241F', label: 'signs.catProhibitory' },
  mandatory: { dot: '#1B4FC4', label: 'signs.catMandatory' },
  information: { dot: '#1A8A4A', label: 'signs.catInformation' },
};

export const CATEGORY_ORDER = ['warning', 'priority', 'prohibitory', 'mandatory', 'information'];

/// Each entry carries its own uz/ru copy rather than pointing at the i18n
/// dictionaries: this is content, not interface, and keeping the four fields of
/// a sign together is what makes the set reviewable by a content person.
export const SIGN_CATALOG = [
  // ── Warning ───────────────────────────────────────────────
  {
    kind: 'warn-curve', cat: 'warning',
    uz: { name: 'Xavfli burilish', meaning: 'Oldinda keskin burilish bor.', when: "Tog' yo'llari va cheklangan ko'rinishli uchastkalarda.", action: "Tezlikni oldindan kamaytiring, quvib o'tmang." },
    ru: { name: 'Опасный поворот', meaning: 'Впереди крутой поворот.', when: 'На горных дорогах и участках с ограниченной видимостью.', action: 'Заранее снизьте скорость, не обгоняйте.' },
  },
  {
    kind: 'crossing', cat: 'warning',
    uz: { name: "Piyodalar o'tish joyi", meaning: "Oldinda piyodalar o'tish joyi bor.", when: "O'tish joyidan 50–100 m oldin.", action: "Sekinlashing, piyodalarga yo'l bering." },
    ru: { name: 'Пешеходный переход', meaning: 'Впереди пешеходный переход.', when: 'За 50–100 м до перехода.', action: 'Снизьте скорость, уступите пешеходам.' },
  },
  {
    kind: 'children', cat: 'warning',
    uz: { name: 'Bolalar', meaning: "Yo'lga bolalar chiqishi mumkin.", when: 'Maktab va bolalar muassasalari yonida.', action: "Tezlikni kamaytiring, har qanday harakatga tayyor bo'ling." },
    ru: { name: 'Дети', meaning: 'На дорогу могут выйти дети.', when: 'Рядом со школами и детскими учреждениями.', action: 'Снизьте скорость, будьте готовы к внезапному движению.' },
  },
  {
    kind: 'slippery', cat: 'warning',
    uz: { name: "Sirpanchiq yo'l", meaning: "Yo'l qoplamasi sirpanchiq bo'lishi mumkin.", when: "Yomg'ir, muz yoki namlik ko'p uchastkalarda.", action: 'Tezlikni pasaytiring, keskin tormozlamang.' },
    ru: { name: 'Скользкая дорога', meaning: 'Покрытие может быть скользким.', when: 'На мокрых, обледенелых или замасленных участках.', action: 'Снизьте скорость, избегайте резкого торможения.' },
  },
  {
    kind: 'animals', cat: 'warning',
    uz: { name: 'Hayvonlar', meaning: "Yo'lga hayvonlar chiqishi mumkin.", when: 'Qishloq joylari va yaylovlar yonida.', action: "Sekin haydab, hushyor bo'ling." },
    ru: { name: 'Животные', meaning: 'Животные могут выйти на дорогу.', when: 'В сельской местности и рядом с пастбищами.', action: 'Двигайтесь медленно и внимательно.' },
  },
  {
    kind: 'roadworks', cat: 'warning',
    uz: { name: "Yo'l ishlari", meaning: "Oldinda ta'mirlash ishlari olib borilmoqda.", when: 'Ish uchastkasidan oldin.', action: 'Sekinlashing, ishchilar va texnikaga ehtiyot bo\'ling.' },
    ru: { name: 'Дорожные работы', meaning: 'Впереди ремонтные работы.', when: 'Перед участком работ.', action: 'Снизьте скорость, следите за рабочими и техникой.' },
  },

  // ── Priority ──────────────────────────────────────────────
  {
    kind: 'priority', cat: 'priority',
    uz: { name: "Bosh yo'l", meaning: "Siz imtiyozli yo'ldasiz.", when: "Bosh yo'l boshlanishida.", action: "Chorrahalarda sizga yo'l berishadi, lekin hushyor qoling." },
    ru: { name: 'Главная дорога', meaning: 'Вы на дороге с преимуществом.', when: 'В начале главной дороги.', action: 'Вам уступают на перекрёстках, но сохраняйте внимание.' },
  },
  {
    kind: 'main-road-end', cat: 'priority',
    uz: { name: "Bosh yo'l tugashi", meaning: "Imtiyozli yo'l tugadi.", when: "Bosh yo'l oxirida.", action: "Endi umumiy qoidalar bo'yicha yo'l bering." },
    ru: { name: 'Конец главной дороги', meaning: 'Ваше преимущество здесь заканчивается.', when: 'В конце главной дороги.', action: 'Далее уступайте по общим правилам.' },
  },
  {
    kind: 'yield', cat: 'priority',
    uz: { name: "Yo'l bering", meaning: "Kesishayotgan yo'ldagi transportga yo'l berish shart.", when: "Ikkinchi darajali yo'l chorraha oldida.", action: "Sekinlashing, kerak bo'lsa to'liq to'xtang." },
    ru: { name: 'Уступите дорогу', meaning: 'Необходимо уступить пересекающему транспорту.', when: 'На второстепенной дороге перед перекрёстком.', action: 'Снизьте скорость, при необходимости остановитесь.' },
  },
  {
    kind: 'stop', cat: 'priority',
    uz: { name: 'STOP', meaning: "To'xtamasdan harakatlanish taqiqlanadi.", when: "Xavfli chorrahalar va temir yo'l kesishmalarida.", action: "Stop chizig'i oldida to'liq to'xtang, keyin yo'l bering." },
    ru: { name: 'STOP', meaning: 'Движение без остановки запрещено.', when: 'На опасных перекрёстках и ж/д переездах.', action: 'Полностью остановитесь у стоп-линии, затем уступите.' },
  },

  // ── Prohibitory ───────────────────────────────────────────
  {
    kind: 'no-entry', cat: 'prohibitory',
    uz: { name: 'Kirish taqiqlangan', meaning: "Bu yo'nalishda kirish mumkin emas.", when: "Bir tomonlama yo'lning qarshi kirishida.", action: "Boshqa yo'nalish tanlang." },
    ru: { name: 'Въезд запрещён', meaning: 'Въезд в этом направлении запрещён.', when: 'Со встречной стороны улицы с односторонним движением.', action: 'Выберите другой маршрут.' },
  },
  {
    kind: 'speed', cat: 'prohibitory',
    uz: { name: 'Tezlik chegarasi', meaning: "Ko'rsatilgandan yuqori tezlik taqiqlanadi.", when: 'Xavfli uchastkalar va aholi punktlarida.', action: "Tezlikni ko'rsatilgan qiymatgacha kamaytiring." },
    ru: { name: 'Ограничение скорости', meaning: 'Движение быстрее указанного запрещено.', when: 'На опасных участках и в населённых пунктах.', action: 'Снизьте скорость до указанной.' },
  },
  {
    kind: 'no-overtake', cat: 'prohibitory',
    uz: { name: "Quvib o'tish taqiqlangan", meaning: "Barcha transportni quvib o'tish taqiqlanadi.", when: 'Ko\'rinish cheklangan uchastkalarda.', action: "O'z bo'lagingizda qoling." },
    ru: { name: 'Обгон запрещён', meaning: 'Обгон всех транспортных средств запрещён.', when: 'На участках с ограниченной видимостью.', action: 'Оставайтесь в своей полосе.' },
  },
  {
    kind: 'no-stopping', cat: 'prohibitory',
    uz: { name: "To'xtash taqiqlangan", meaning: "To'xtash va to'xtab turish taqiqlanadi.", when: 'Harakat jadal uchastkalarda.', action: "Bu zonada umuman to'xtamang." },
    ru: { name: 'Остановка запрещена', meaning: 'Остановка и стоянка запрещены.', when: 'На участках с интенсивным движением.', action: 'Не останавливайтесь в этой зоне вообще.' },
  },
  {
    kind: 'no-parking', cat: 'prohibitory',
    uz: { name: "To'xtab turish taqiqlangan", meaning: "Uzoq to'xtab turish taqiqlanadi, qisqa to'xtash mumkin.", when: 'Tor ko\'chalar va yuklash zonalarida.', action: "Faqat yo'lovchi tushirish uchun to'xtang." },
    ru: { name: 'Стоянка запрещена', meaning: 'Стоянка запрещена, кратковременная остановка разрешена.', when: 'На узких улицах и в зонах погрузки.', action: 'Останавливайтесь только для высадки пассажиров.' },
  },

  // ── Mandatory ─────────────────────────────────────────────
  {
    kind: 'turn-right', cat: 'mandatory',
    uz: { name: "O'ngga harakat", meaning: "Faqat o'ngga burilish mumkin.", when: 'Chorraha yoki kirish oldida.', action: "O'ng burilishga tayyorlaning." },
    ru: { name: 'Движение направо', meaning: 'Разрешён только поворот направо.', when: 'Перед перекрёстком или въездом.', action: 'Подготовьтесь к повороту направо.' },
  },
  {
    kind: 'turn-left', cat: 'mandatory',
    uz: { name: 'Chapga harakat', meaning: 'Faqat chapga burilish mumkin.', when: 'Chorraha oldida.', action: 'Chap burilishga tayyorlaning.' },
    ru: { name: 'Движение налево', meaning: 'Разрешён только поворот налево.', when: 'Перед перекрёстком.', action: 'Подготовьтесь к повороту налево.' },
  },
  {
    kind: 'go-straight', cat: 'mandatory',
    uz: { name: "To'g'riga harakat", meaning: "Faqat to'g'riga harakatlanish mumkin.", when: 'Burilish taqiqlangan chorrahalarda.', action: "Burilmasdan to'g'riga davom eting." },
    ru: { name: 'Движение прямо', meaning: 'Разрешено движение только прямо.', when: 'На перекрёстках, где повороты запрещены.', action: 'Продолжайте прямо, не поворачивая.' },
  },
  {
    kind: 'roundabout', cat: 'mandatory',
    uz: { name: 'Aylanma harakat', meaning: "Aylanma bo'ylab strelka yo'nalishida harakatlaning.", when: 'Aylanma chorraha kirishida.', action: "Aylanadagilarga yo'l berib, soat miliga qarshi harakatlaning." },
    ru: { name: 'Круговое движение', meaning: 'Двигайтесь по кругу в направлении стрелок.', when: 'На въезде на круговой перекрёсток.', action: 'Уступите транспорту на круге, двигайтесь против часовой стрелки.' },
  },

  // ── Information ───────────────────────────────────────────
  {
    kind: 'parking', cat: 'information',
    uz: { name: "To'xtash joyi", meaning: "Ruxsat etilgan to'xtash joyi.", when: 'Parkovka hududlari kirishida.', action: "Belgi qoidalariga rioya qilib to'xtang." },
    ru: { name: 'Парковка', meaning: 'Разрешённое место стоянки.', when: 'На въезде на парковочные зоны.', action: 'Паркуйтесь по указанным правилам.' },
  },
  {
    kind: 'pedestrian', cat: 'information',
    uz: { name: "O'tish joyi", meaning: "Piyodalar uchun belgilangan o'tish joyi.", when: "Zebra chizig'i ustida.", action: "O'tayotgan piyodalarga doim yo'l bering." },
    ru: { name: 'Пешеходный переход', meaning: 'Обозначенное место перехода для пешеходов.', when: 'На самой зебре.', action: 'Всегда уступайте переходящим пешеходам.' },
  },
  {
    kind: 'hospital', cat: 'information',
    uz: { name: 'Kasalxona', meaning: 'Yaqin atrofda tibbiy yordam punkti bor.', when: 'Kasalxona va poliklinikalar yonida.', action: "Shovqin solmaslik va ehtiyot bo'lish tavsiya etiladi." },
    ru: { name: 'Больница', meaning: 'Поблизости медицинское учреждение.', when: 'Рядом с больницами и поликлиниками.', action: 'Не шумите и двигайтесь осторожно.' },
  },
  {
    kind: 'fuel', cat: 'information',
    uz: { name: "Yoqilg'i quyish shoxobchasi", meaning: 'Oldinda AYOQSH bor.', when: 'Shoxobchadan bir necha km oldin.', action: "Kerak bo'lsa yoqilg'i quyib oling." },
    ru: { name: 'Заправочная станция', meaning: 'Впереди АЗС.', when: 'За несколько км до станции.', action: 'При необходимости заправьтесь.' },
  },
  {
    kind: 'one-way', cat: 'information',
    uz: { name: "Bir tomonlama yo'l", meaning: "Harakat faqat ko'rsatilgan yo'nalishda.", when: "Bir tomonlama ko'cha boshlanishida.", action: "Qarshi yo'nalishga burilmang." },
    ru: { name: 'Дорога с односторонним движением', meaning: 'Движение только в указанном направлении.', when: 'В начале улицы с односторонним движением.', action: 'Не поворачивайте против потока.' },
  },
  {
    kind: 'highway', cat: 'information',
    uz: { name: 'Avtomagistral', meaning: "Tezyurar yo'l boshlandi — maxsus qoidalar amal qiladi.", when: 'Magistral kirishida.', action: "Minimal tezlikka rioya qiling, to'xtash taqiqlanadi." },
    ru: { name: 'Автомагистраль', meaning: 'Начинается автомагистраль — действуют особые правила.', when: 'На въезде на магистраль.', action: 'Соблюдайте минимальную скорость, остановка запрещена.' },
  },
];
