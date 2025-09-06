import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";

// UI-строки (не тексты зикров)
const resources = {
  ru: {
    translation: {
      appTitle: "Dhikr",
      today: "Сегодня",
      total: "Всего",
      searchPlaceholder: "Поиск зикра",
      all: "Все",
      morning: "Утро",
      evening: "Вечер",
      tasbih: "Тасбих",
      recording: "Запись идёт…",
      stop: "Стоп",
      start: "Запись",
      finishing: "Завершаем запись…",
      uploading: "Загружаем запись…",
      checking: "Проверяем запись…",
      accepted: "Принято! +1",
      failed: "Не распознано. Попробуй ещё раз.",
      unknown: "Не удалось подтвердить. Повтори попытку.",
      noCategoryList: "Нет зикров в этой категории",
      tryAnotherFilter: "Попробуй выбрать другую или очистить поиск",
      profile: "Профиль",
      level: "Уровень распознавания",
      beginner: "Новичок",
      advanced: "Продвинутый",
      language: "Язык интерфейса",
      resetLocal: "Сбросить прогресс дня (локально)",
    },
  },
  kz: {
    translation: {
      appTitle: "Dhikr",
      today: "Бүгін",
      total: "Барлығы",
      searchPlaceholder: "Зікір іздеу",
      all: "Барлығы",
      morning: "Таң",
      evening: "Кеш",
      tasbih: "Тәсбих",
      recording: "Жазба жүріп жатыр…",
      stop: "Тоқтату",
      start: "Жазу",
      finishing: "Жазбаны аяқтау…",
      uploading: "Жазбаны жіберу…",
      checking: "Тексеру…",
      accepted: "Қабылданды! +1",
      failed: "Танылмады. Қайта көріңіз.",
      unknown: "Растау мүмкін болмады. Қайталап көріңіз.",
      noCategoryList: "Бұл санатта зікір жоқ",
      tryAnotherFilter: "Басқа санатты таңдаңыз немесе іздеуді тазалаңыз",
      profile: "Профиль",
      level: "Тану деңгейі",
      beginner: "Жаңадан бастаушы",
      advanced: "Жетілдірілген",
      language: "Тіл",
      resetLocal: "Күндік прогресті (жергілікті) тазалау",
    },
  },
  en: {
    translation: {
      appTitle: "Dhikr",
      today: "Today",
      total: "Total",
      searchPlaceholder: "Search dhikr",
      all: "All",
      morning: "Morning",
      evening: "Evening",
      tasbih: "Tasbih",
      recording: "Recording…",
      stop: "Stop",
      start: "Record",
      finishing: "Finishing…",
      uploading: "Uploading…",
      checking: "Checking…",
      accepted: "Accepted! +1",
      failed: "Not recognized. Try again.",
      unknown: "Couldn’t verify. Try again.",
      noCategoryList: "No dhikr in this category",
      tryAnotherFilter: "Try another filter or clear search",
      profile: "Profile",
      level: "Recognition level",
      beginner: "Beginner",
      advanced: "Advanced",
      language: "Interface language",
      resetLocal: "Reset today's progress (local)",
    },
  },
};

const detectDefault = () => {
  const sys = Localization.getLocales?.()[0]?.languageCode || "ru";
  if (["ru", "kz", "en"].includes(sys)) return sys;
  // kk -> kz, etc
  if (sys === "kk") return "kz";
  return "ru";
};

i18n.use(initReactI18next).init({
  resources,
  lng: detectDefault(),
  fallbackLng: "ru",
  interpolation: { escapeValue: false },
});

export default i18n;
