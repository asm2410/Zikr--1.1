export type AppLanguage = 'ar' | 'en';

export const DEFAULT_LANGUAGE: AppLanguage = 'ar';
export const LANGUAGE_STORAGE_KEY = 'appLanguage';

export const isAppLanguage = (value: string | null): value is AppLanguage =>
  value === 'ar' || value === 'en';

export const loadStoredLanguage = (): AppLanguage => {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isAppLanguage(saved) ? saved : DEFAULT_LANGUAGE;
};

export type AzkarCategoryLabels = {
  title: string;
  subtitle: string;
};

export const getCategoryLabel = (
  category: AzkarCategoryLabels,
  language: AppLanguage
): string => (language === 'ar' ? category.subtitle || category.title : category.title || category.subtitle);

export const getCategorySubLabel = (
  category: AzkarCategoryLabels,
  language: AppLanguage
): string | null => {
  if (language === 'ar') return null;
  if (category.subtitle && category.title) return category.subtitle;
  return null;
};

export const getZikrTitleLabel = (title: string | undefined, language: AppLanguage): string | null =>
  language === 'en' && title ? title : null;

export const shouldShowTransliteration = (language: AppLanguage): boolean => language === 'en';

export const shouldShowTranslation = (language: AppLanguage): boolean => language === 'en';

export const formatClockTime = (language: AppLanguage): string => {
  const now = new Date();
  let hours = now.getHours();
  const minutes = now.getMinutes();
  const isPm = hours >= 12;

  hours = hours % 12;
  hours = hours ? hours : 12;

  const time = `${hours}:${minutes.toString().padStart(2, '0')}`;
  if (language === 'ar') {
    return `${time} ${isPm ? 'م' : 'ص'}`;
  }
  return `${time} ${isPm ? 'PM' : 'AM'}`;
};

export const applyDocumentLanguage = (language: AppLanguage) => {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
  document.title = language === 'ar' ? 'تطبيق الأذكار' : 'Azkar Zikr';
};

export type UiStrings = {
  azkarIndex: string;
  settings: string;
  backToIndex: string;
  morningAzkar: string;
  eveningAzkar: string;
  savedAzkar: string;
  category: string;
  searchPlaceholder: string;
  clearSearch: string;
  close: string;
  noSearchResults: string;
  indexSearchResults: string;
  azkarSearchResults: string;
  adhkarCount: string;
  viewAllSaved: string;
  openZikr: string;
  noSavedYet: string;
  countLabel: string;
  showAll: string;
  appTheme: string;
  themeSystem: string;
  themeLight: string;
  themeDark: string;
  themeCurrentSystemDark: string;
  themeCurrentSystemLight: string;
  themeCurrentDark: string;
  themeCurrentLight: string;
  themeCurrentPrefix: string;
  fontSize: string;
  fontSmall: string;
  fontLarge: string;
  historySection: string;
  openHistory: string;
  historyHint: string;
  language: string;
  languageArabic: string;
  languageEnglish: string;
  downloadZikr: string;
  saveZikr: string;
  removeSaved: string;
  reason: string;
  benefit: string;
  fadl: string;
  source: string;
  authenticity: string;
  holdForHadith: string;
  noHadithInfo: string;
  celebration: string;
  historyTitle: string;
  noHistoryYet: string;
  savedSection: string;
  totalRead: string;
  counterRecords: string;
  completedCounters: string;
  noCounterRecords: string;
  tasbeehCount: string;
  targetCount: string;
  nextZikr: string;
  previousZikr: string;
};

const ar: UiStrings = {
  azkarIndex: 'فهرس الأذكار',
  settings: 'الإعدادات',
  backToIndex: 'رجوع للفهرس الرئيسي',
  morningAzkar: 'أذكار الصباح',
  eveningAzkar: 'أذكار المساء',
  savedAzkar: 'المحفوظات',
  category: 'تصنيف',
  searchPlaceholder: 'ابحث عن ذِكْر ...',
  clearSearch: 'مسح البحث',
  close: 'إغلاق',
  noSearchResults: 'لا توجد نتائج مطابقة.',
  indexSearchResults: 'نتائج في الفهرس',
  azkarSearchResults: 'نتائج في الأذكار',
  adhkarCount: 'عدد الأذكار',
  viewAllSaved: 'عرض كل المحفوظات',
  openZikr: 'فتح الذكر',
  noSavedYet: 'لا توجد أذكار محفوظة بعد.',
  countLabel: 'العدد',
  showAll: 'عرض الكل',
  appTheme: 'مظهر التطبيق',
  themeSystem: 'النظام',
  themeLight: 'فاتح',
  themeDark: 'داكن',
  themeCurrentSystemDark: 'النظام - داكن',
  themeCurrentSystemLight: 'النظام - فاتح',
  themeCurrentDark: 'داكن',
  themeCurrentLight: 'فاتح',
  themeCurrentPrefix: 'الوضع الحالي: ',
  fontSize: 'حجم الخط',
  fontSmall: 'صغير',
  fontLarge: 'كبير',
  historySection: 'السجل',
  openHistory: 'فتح سجل الأذكار',
  historyHint: 'يفتح صفحة السجل (المقروءة + المحفوظات + سجلات العداد).',
  language: 'اللغة',
  languageArabic: 'العربية',
  languageEnglish: 'English',
  downloadZikr: 'تنزيل الذكر',
  saveZikr: 'حفظ الذكر',
  removeSaved: 'إزالة من المحفوظات',
  reason: 'شرح',
  benefit: 'المرجع',
  fadl: 'الفضل',
  source: 'المصدر والتخريج',
  authenticity: 'الصحة',
  holdForHadith: 'اضغط مطولاً لعرض الفضل والمصدر',
  noHadithInfo: 'لا تتوفر بيانات تخريج لهذا الذكر بعد.',
  celebration: 'ما شاء الله! 🎉',
  historyTitle: 'سجل الأذكار',
  noHistoryYet: 'لم تقرأ أي أذكار حتى الآن',
  savedSection: 'الأذكار المحفوظة',
  totalRead: 'إجمالي الأذكار المقروءة',
  counterRecords: 'مرات تسجيل العداد',
  completedCounters: 'سجل العدادات المكتملة',
  noCounterRecords: 'لا يوجد تسجيل عداد بعد.',
  tasbeehCount: 'تسبيحة',
  targetCount: 'الهدف',
  nextZikr: 'الذكر التالي',
  previousZikr: 'الذكر السابق'
};

const en: UiStrings = {
  azkarIndex: 'Azkar index',
  settings: 'Settings',
  backToIndex: 'Back to main index',
  morningAzkar: 'Morning adhkar',
  eveningAzkar: 'Evening adhkar',
  savedAzkar: 'Saved',
  category: 'Category',
  searchPlaceholder: 'Search for a dhikr...',
  clearSearch: 'Clear search',
  close: 'Close',
  noSearchResults: 'No matching results.',
  indexSearchResults: 'Index results',
  azkarSearchResults: 'Adhkar results',
  adhkarCount: 'Adhkar count',
  viewAllSaved: 'View all saved',
  openZikr: 'Open dhikr',
  noSavedYet: 'No saved adhkar yet.',
  countLabel: 'Count',
  showAll: 'View all',
  appTheme: 'App theme',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeCurrentSystemDark: 'System - dark',
  themeCurrentSystemLight: 'System - light',
  themeCurrentDark: 'Dark',
  themeCurrentLight: 'Light',
  themeCurrentPrefix: 'Current mode: ',
  fontSize: 'Font size',
  fontSmall: 'Small',
  fontLarge: 'Large',
  historySection: 'History',
  openHistory: 'Open dhikr history',
  historyHint: 'Opens history (read, saved, and counter records).',
  language: 'Language',
  languageArabic: 'العربية',
  languageEnglish: 'English',
  downloadZikr: 'Download dhikr',
  saveZikr: 'Save dhikr',
  removeSaved: 'Remove from saved',
  reason: 'Note',
  benefit: 'Reference',
  fadl: 'Virtue',
  source: 'Source & grading',
  authenticity: 'Authenticity',
  holdForHadith: 'Press and hold to view virtue and source',
  noHadithInfo: 'No grading or source is available for this dhikr yet.',
  celebration: 'Masha Allah! 🎉',
  historyTitle: 'Dhikr history',
  noHistoryYet: 'You have not read any adhkar yet',
  savedSection: 'Saved adhkar',
  totalRead: 'Total adhkar read',
  counterRecords: 'Counter log entries',
  completedCounters: 'Completed counter log',
  noCounterRecords: 'No counter records yet.',
  tasbeehCount: 'count',
  targetCount: 'target',
  nextZikr: 'Next dhikr',
  previousZikr: 'Previous dhikr'
};

export const getUiStrings = (language: AppLanguage): UiStrings =>
  language === 'ar' ? ar : en;
