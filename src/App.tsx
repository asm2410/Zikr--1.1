import { useState, useEffect, useRef, useCallback, type CSSProperties, type SVGProps } from 'react';
import { ChevronRight, Settings, X, Menu, Heart } from 'lucide-react';
import azkarData from './azkar.json';
import {
  applyDocumentLanguage,
  formatClockTime,
  getCategoryLabel,
  getCategorySubLabel,
  getUiStrings,
  getZikrTitleLabel,
  loadStoredLanguage,
  shouldShowTranslation,
  shouldShowTransliteration,
  type AppLanguage,
  LANGUAGE_STORAGE_KEY
} from './i18n';
import ElectricBorder from './ElectricBorder';

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M11.5 21C16.7467 21 21 16.7467 21 11.5C21 6.25329 16.7467 2 11.5 2C6.25329 2 2 6.25329 2 11.5C2 16.7467 6.25329 21 11.5 21Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 22L20 20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}


interface Zikr {
  id?: number;
  categoryId?: number;
  orderIndex?: number;
  title?: string;
  arabic: string;
  transliteration: string;
  translation: string;
  count?: number;
  preferredTime?: 'friday' | 'morning' | 'afternoon' | 'evening' | 'night' | 'any';
  reason?: string;
  benefit?: string;
  fadl?: string;
  tags?: string[];
}

interface AzkarCategory {
  id: number;
  title: string;
  subtitle: string;
  orderIndex: number;
}

interface AdhkarItem {
  id: number;
  categoryId: number;
  title: string;
  arabicText: string;
  transliteration: string | null;
  translation: string;
  repeatCount: number;
  notes: string | null;
  sourceReference: string | null;
  fadl: string | null;
  orderIndex: number;
  tags: string[];
}

interface Particle {
  id: number;
  x: number;
  y: number;
  delay: number;
}

interface CountRecord {
  id: number;
  zikrArabic: string;
  count: number;
  target: number | null;
  recordedAt: string;
}

type PlatformType = 'ios' | 'android';
type ThemeMode = 'system' | 'light' | 'dark';

const azkarCategories = (azkarData as unknown as { categories: AzkarCategory[] }).categories ?? [];
const adhkarItems = (azkarData as unknown as { adhkar: AdhkarItem[] }).adhkar ?? [];

const MORNING_CATEGORY_ID = 1;
const EVENING_CATEGORY_ID = 2;

const ADHKAR_RESET_STORAGE_KEY = 'adhkarCounterResetDates';
const ZIKR_SESSION_STORAGE_KEY = 'zikrAppSessionActive';
const MORNING_AZKAR_READ_ID = 'morning-azkar';
const EVENING_AZKAR_READ_ID = 'evening-azkar';

type AdhkarCounterPeriod = 'morning' | 'evening';

interface AdhkarResetDates {
  morning?: string;
  evening?: string;
}

/** نفس منطق بطاقة أذكار الصباح/المساء: صباح 5–14، مساء 15–4 */
const getAdhkarCounterPeriod = (date = new Date()): AdhkarCounterPeriod => {
  const hours = date.getHours();
  return hours >= 5 && hours < 15 ? 'morning' : 'evening';
};

const getLocalDateKey = (date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getArabicKeysForCategory = (categoryId: number): Set<string> =>
  new Set(
    adhkarItems.filter((item) => item.categoryId === categoryId).map((item) => item.arabicText)
  );

const getOtherAdhkarArabicKeys = (): Set<string> =>
  new Set(
    adhkarItems
      .filter(
        (item) =>
          item.categoryId !== MORNING_CATEGORY_ID && item.categoryId !== EVENING_CATEGORY_ID
      )
      .map((item) => item.arabicText)
  );

const isNewAppSession = (): boolean => {
  try {
    return sessionStorage.getItem(ZIKR_SESSION_STORAGE_KEY) !== '1';
  } catch {
    return true;
  }
};

const markAppSessionActive = (): void => {
  try {
    sessionStorage.setItem(ZIKR_SESSION_STORAGE_KEY, '1');
  } catch {
    /* sessionStorage unavailable */
  }
};

/** تصفير أذكار باقي التصنيفات عند كل فتح جديد بعد إغلاق التطبيق */
const applySessionOtherAdhkarResets = (
  progress: Record<string, number>
): { progress: Record<string, number>; didReset: boolean } => {
  if (!isNewAppSession()) {
    return { progress, didReset: false };
  }

  const otherKeys = getOtherAdhkarArabicKeys();
  const nextProgress = Object.fromEntries(
    Object.entries(progress).filter(([arabic]) => !otherKeys.has(arabic))
  );
  markAppSessionActive();

  return {
    progress: nextProgress,
    didReset: Object.keys(nextProgress).length !== Object.keys(progress).length
  };
};

const applyDailyAdhkarCounterResets = (
  progress: Record<string, number>,
  readAzkarIds: Set<string>,
  now = new Date()
): { progress: Record<string, number>; readAzkarIds: Set<string>; didReset: boolean } => {
  const period = getAdhkarCounterPeriod(now);
  const today = getLocalDateKey(now);

  let stored: AdhkarResetDates = {};
  try {
    const raw = localStorage.getItem(ADHKAR_RESET_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) as AdhkarResetDates;
  } catch {
    stored = {};
  }

  let nextProgress = progress;
  let nextRead = readAzkarIds;
  let didReset = false;

  const resetForPeriod = (
    periodKey: AdhkarCounterPeriod,
    categoryId: number,
    readId: string
  ) => {
    if (period !== periodKey || stored[periodKey] === today) return;

    const keys = getArabicKeysForCategory(categoryId);
    nextProgress = Object.fromEntries(
      Object.entries(nextProgress).filter(([arabic]) => !keys.has(arabic))
    );
    nextRead = new Set(nextRead);
    nextRead.delete(readId);
    stored = { ...stored, [periodKey]: today };
    didReset = true;
  };

  resetForPeriod('morning', MORNING_CATEGORY_ID, MORNING_AZKAR_READ_ID);
  resetForPeriod('evening', EVENING_CATEGORY_ID, EVENING_AZKAR_READ_ID);

  if (didReset) {
    localStorage.setItem(ADHKAR_RESET_STORAGE_KEY, JSON.stringify(stored));
  }

  return { progress: nextProgress, readAzkarIds: nextRead, didReset };
};

const hydrateAdhkarCountersFromStorage = (): {
  progress: Record<string, number>;
  readAzkar: Set<string>;
} => {
  let progress: Record<string, number> = {};
  let readAzkar = new Set<string>();

  try {
    const savedProgress = localStorage.getItem('zikrProgress');
    progress = savedProgress ? JSON.parse(savedProgress) : {};
    const savedRead = localStorage.getItem('readAzkar');
    readAzkar = savedRead ? new Set(JSON.parse(savedRead) as string[]) : new Set();
  } catch {
    progress = {};
    readAzkar = new Set();
  }

  const dailyResult = applyDailyAdhkarCounterResets(progress, readAzkar);
  progress = dailyResult.progress;
  readAzkar = dailyResult.readAzkarIds;
  let didReset = dailyResult.didReset;

  const sessionResult = applySessionOtherAdhkarResets(progress);
  progress = sessionResult.progress;
  didReset = didReset || sessionResult.didReset;

  if (didReset) {
    localStorage.setItem('zikrProgress', JSON.stringify(progress));
    localStorage.setItem('readAzkar', JSON.stringify([...readAzkar]));
  }

  return { progress, readAzkar };
};

let cachedInitialAdhkarState: ReturnType<typeof hydrateAdhkarCountersFromStorage> | null = null;
const getInitialAdhkarState = () => {
  if (!cachedInitialAdhkarState) {
    cachedInitialAdhkarState = hydrateAdhkarCountersFromStorage();
  }
  return cachedInitialAdhkarState;
};

const getCategoryIdForTime = (timeOfDay: ReturnType<typeof getCurrentTimeOfDay>): number | null => {
  if (timeOfDay === 'morning') return MORNING_CATEGORY_ID;
  if (timeOfDay === 'evening' || timeOfDay === 'night') return EVENING_CATEGORY_ID;
  return null;
};

const getPreferredTimeFromCategoryId = (
  categoryId: number
): NonNullable<Zikr['preferredTime']> => {
  if (categoryId === MORNING_CATEGORY_ID) return 'morning';
  if (categoryId === EVENING_CATEGORY_ID) return 'evening';
  return 'any';
};

const getDrawerFilterForTime = (
  timeOfDay: ReturnType<typeof getCurrentTimeOfDay>
): 'index' | 'morning' | 'evening' => {
  if (timeOfDay === 'morning') return 'morning';
  if (timeOfDay === 'evening' || timeOfDay === 'night') return 'evening';
  return 'index';
};

/** خطوط خلفية التصدير (مائية): Fascinate Inline + Madinet Al Bat — الملفات في public/fonts */
const ZIKR_WATERMARK_FONT_SPECS: { family: string; files: string }[] = [
  {
    family: 'Fascinate Inline',
    files: `url('/fonts/FascinateInline-Regular.ttf') format('truetype')`
  },
  {
    family: 'Madinet Al Bat',
    files: `url('/fonts/MadinetAlBat.ttf') format('truetype')`
  }
];

/** خطوط نص الذكر والتوقيع (اختيارية إن وُجدت الملفات) */
const ZIKR_EXPORT_FONT_SPECS: { family: string; files: string }[] = [
  {
    family: 'NAJAH',
    files: `url('/fonts/NAJAH.woff2') format('woff2'), url('/fonts/NAJAH.ttf') format('truetype')`
  },
  {
    family: 'Souq El Balad',
    files: `url('/fonts/SouqElBalad.woff2') format('woff2'), url('/fonts/SouqElBalad.ttf') format('truetype')`
  }
];

let zikrExportFontsLoaded = false;

const ensureZikrExportFonts = async () => {
  if (zikrExportFontsLoaded) return;
  zikrExportFontsLoaded = true;
  const loadOne = async (family: string, files: string) => {
    try {
      const face = new FontFace(family, files);
      await face.load();
      document.fonts.add(face);
    } catch {
      /* ملف الخط غير موجود */
    }
  };
  for (const spec of ZIKR_WATERMARK_FONT_SPECS) {
    await loadOne(spec.family, spec.files);
  }
  await Promise.all(ZIKR_EXPORT_FONT_SPECS.map((s) => loadOne(s.family, s.files)));
  await document.fonts.ready;
};

const parseHexColor = (hex: string): { r: number; g: number; b: number } | null => {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (full.length !== 6) return null;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const rgbaFromHex = (hex: string, a: number): string => {
  const rgb = parseHexColor(hex);
  if (!rgb) return `rgba(0,0,0,${a})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
};

const roundRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

const ZIKR_EXPORT_ARABIC_FONT = "'NAJAH', 'Cairo', 'Segoe UI', sans-serif";

const SACRED_PHRASES_NORMALIZED = [
  'اعوذ بالله من الشيطان الرجيم',
  'بسم الله الرحمن الرحيم'
] as const;

const normalizeSacredMatchChar = (ch: string): string | null => {
  if (/[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/.test(ch)) return null;
  if (/[إأآٱ]/.test(ch)) return 'ا';
  if (ch === 'ى') return 'ي';
  if (ch === 'ؤ') return 'و';
  if (ch === 'ئ') return 'ي';
  if (/\s/.test(ch)) return ' ';
  return ch;
};

const buildSacredNormalizedMap = (text: string): { norm: string; map: number[] } => {
  let norm = '';
  const map: number[] = [];
  let lastWasSpace = false;

  for (let i = 0; i < text.length; i++) {
    const normalized = normalizeSacredMatchChar(text[i]);
    if (normalized === null) continue;

    if (normalized === ' ') {
      if (lastWasSpace || norm.length === 0) continue;
      norm += ' ';
      map.push(i);
      lastWasSpace = true;
      continue;
    }

    norm += normalized;
    map.push(i);
    lastWasSpace = false;
  }

  return { norm, map };
};

const findSacredPhraseSpans = (text: string, phraseNorm: string): { start: number; end: number }[] => {
  const { norm, map } = buildSacredNormalizedMap(text);
  if (!norm || map.length === 0) return [];

  const spans: { start: number; end: number }[] = [];
  let searchFrom = 0;

  while (searchFrom <= norm.length - phraseNorm.length) {
    const found = norm.indexOf(phraseNorm, searchFrom);
    if (found === -1) break;

    const start = map[found] ?? 0;
    const endMapIndex = found + phraseNorm.length - 1;
    let end = (map[endMapIndex] ?? text.length - 1) + 1;

    while (end < text.length && /[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/.test(text[end])) {
      end++;
    }

    spans.push({ start, end });
    searchFrom = found + phraseNorm.length;
  }

  return spans;
};

/** البسملة والاستعاذة دائماً في سطر مستقل */
const enforceSacredLineBreaks = (text: string): string => {
  const spans: { start: number; end: number }[] = [];

  for (const phrase of SACRED_PHRASES_NORMALIZED) {
    spans.push(...findSacredPhraseSpans(text, phrase));
  }

  if (!spans.length) return text.trim();

  spans.sort((a, b) => a.start - b.start);

  const isolated: { start: number; end: number }[] = [];
  for (const span of spans) {
    const last = isolated[isolated.length - 1];
    if (last && span.start < last.end) continue;
    isolated.push(span);
  }

  const parts: string[] = [];
  let cursor = 0;

  for (const { start, end } of isolated) {
    if (start > cursor) {
      const before = text.slice(cursor, start).trim();
      if (before) parts.push(before);
    }
    parts.push(text.slice(start, end).trim());
    cursor = end;
  }

  if (cursor < text.length) {
    const after = text.slice(cursor).trim();
    if (after) parts.push(after);
  }

  return parts.join('\n');
};

const isSacredArabicLine = (line: string): boolean => {
  const { norm } = buildSacredNormalizedMap(line.trim());
  return (SACRED_PHRASES_NORMALIZED as readonly string[]).includes(norm);
};

const formatZikrArabicDisplayLines = (text: string): string[] => {
  const prepared = enforceSacredLineBreaks(text.trim());
  if (!prepared) return [];
  return prepared.split('\n').map((line) => line.trim()).filter(Boolean);
};

const getAdaptiveFontSize = (text: string, baseFontSize: number): number => {
  const lines = formatZikrArabicDisplayLines(text);
  const totalLength = lines.reduce((sum, line) => sum + line.length, 0);
  const lineCount = lines.length;

  // Short text (<= 50 chars, <= 2 lines): full size
  // Medium text (51-150 chars or 3-4 lines): 90% size
  // Long text (> 150 chars or > 4 lines): 80% size
  if (totalLength <= 50 && lineCount <= 2) {
    return baseFontSize;
  } else if (totalLength <= 150 && lineCount <= 4) {
    return baseFontSize * 0.9;
  } else {
    return baseFontSize * 0.78;
  }
};

const wrapCanvasArabicLine = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
};

const wrapCanvasArabicText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] => {
  const paragraphs = text.split('\n').map((p) => p.trim()).filter(Boolean);
  if (!paragraphs.length) return [''];

  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    if (isSacredArabicLine(paragraph)) {
      lines.push(paragraph);
      continue;
    }
    const wrapped = wrapCanvasArabicLine(ctx, paragraph, maxWidth);
    if (wrapped.length) {
      lines.push(...wrapped);
    } else {
      lines.push(paragraph);
    }
  }
  return lines.length ? lines : [''];
};

const measureExportSectionHeight = (
  ctx: CanvasRenderingContext2D,
  body: string | undefined,
  maxWidth: number,
  titleSize: number,
  bodySize: number,
  hasTitle: boolean
): number => {
  let height = hasTitle ? titleSize * 1.35 : 0;
  const trimmed = body?.trim();
  if (!trimmed) return height;
  const prevFont = ctx.font;
  ctx.font = `500 ${bodySize}px ${ZIKR_EXPORT_ARABIC_FONT}`;
  const lines = wrapCanvasArabicText(ctx, trimmed, maxWidth);
  ctx.font = prevFont;
  return height + lines.length * bodySize * 1.55;
};

const EXPORT_CARD_RADIUS = 22;
const EXPORT_BLOCK_GAP = 28;

const drawExportAccentWash = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string
) => {
  const wash = ctx.createLinearGradient(x, y, x + w, y + h);
  wash.addColorStop(0, rgbaFromHex(accent, 0.07));
  wash.addColorStop(0.55, rgbaFromHex(accent, 0.03));
  wash.addColorStop(1, rgbaFromHex(accent, 0.09));
  ctx.fillStyle = wash;
  ctx.fillRect(x, y, w, h);
};

const fitZikrExportLayout = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxTextWidth: number,
  maxTextHeight: number,
  preferredSize: number
): { fontSize: number; lines: string[]; lineHeight: number } => {
  const minSize = 40;
  const maxSize = Math.min(preferredSize, 96);
  let bestSize = minSize;
  let bestLines: string[] = [''];

  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `700 ${size}px ${ZIKR_EXPORT_ARABIC_FONT}`;
    const lines = wrapCanvasArabicText(ctx, text, maxTextWidth);
    const lineHeight = size * 1.72;
    const blockHeight = lines.length * lineHeight;
    const blockWidth = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    if (blockHeight <= maxTextHeight && blockWidth <= maxTextWidth) {
      bestSize = size;
      bestLines = lines;
      break;
    }
  }

  if (bestLines[0] === '' && text) {
    ctx.font = `700 ${bestSize}px ${ZIKR_EXPORT_ARABIC_FONT}`;
    bestLines = wrapCanvasArabicText(ctx, text, maxTextWidth);
  }

  return { fontSize: bestSize, lines: bestLines, lineHeight: bestSize * 1.72 };
};

const drawExportCornerSection = (
  ctx: CanvasRenderingContext2D,
  title: string,
  body: string | undefined,
  x: number,
  y: number,
  maxWidth: number,
  titleSize: number,
  bodySize: number,
  accent: string,
  cardColor: string,
  textColor: string,
  textLightColor: string,
  darkMode: boolean
): number => {
  const trimmed = body?.trim();
  if (!trimmed) return 0;

  const boxPadX = 18;
  const boxPadY = 16;
  const blockH = measureExportSectionHeight(
    ctx,
    trimmed,
    maxWidth,
    titleSize,
    bodySize,
    true
  );
  const boxW = maxWidth + boxPadX * 2;
  const boxH = blockH + boxPadY * 2;

  ctx.save();
  roundRectPath(ctx, x - boxPadX, y - boxPadY, boxW, boxH, EXPORT_CARD_RADIUS);
  ctx.fillStyle = darkMode ? rgbaFromHex(cardColor, 0.6) : 'rgba(255, 255, 255, 0.94)';
  ctx.fill();
  ctx.strokeStyle = rgbaFromHex(accent, 0.42);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - boxPadX + 14, y - boxPadY + 12);
  ctx.lineTo(x - boxPadX + 14, y - boxPadY + boxH - 12);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.direction = 'rtl';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.font = `700 ${titleSize}px ${ZIKR_EXPORT_ARABIC_FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText(title, x, y);

  const underlineY = y + titleSize * 1.15;
  const titleW = ctx.measureText(title).width;
  ctx.strokeStyle = rgbaFromHex(accent, 0.35);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, underlineY);
  ctx.lineTo(x + Math.min(titleW, maxWidth), underlineY);
  ctx.stroke();

  let cursorY = y + titleSize * 1.42;
  ctx.font = `500 ${bodySize}px ${ZIKR_EXPORT_ARABIC_FONT}`;
  ctx.fillStyle = darkMode ? textLightColor : '#2C2C2E';
  const lines = wrapCanvasArabicText(ctx, trimmed, maxWidth);
  const lineHeight = bodySize * 1.55;
  for (const textLine of lines) {
    ctx.fillText(textLine, x, cursorY);
    cursorY += lineHeight;
  }

  ctx.restore();
  return boxH;
};

const drawExportMainZikrBlock = (
  ctx: CanvasRenderingContext2D,
  lines: string[],
  fontSize: number,
  lineHeight: number,
  blockX: number,
  blockY: number,
  blockW: number,
  blockH: number,
  accent: string,
  repeatCount?: number,
  cardColor?: string,
  textColor?: string,
  darkMode?: boolean
) => {
  const isDark = darkMode ?? false;

  ctx.save();
  ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(0, 0, 0, 0.1)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 8;
  roundRectPath(ctx, blockX, blockY, blockW, blockH, EXPORT_CARD_RADIUS);
  ctx.fillStyle = isDark ? (cardColor ?? '#2C2C2E') : '#FFFFFF';
  ctx.fill();
  ctx.restore();

  roundRectPath(ctx, blockX, blockY, blockW, blockH, EXPORT_CARD_RADIUS);
  ctx.strokeStyle = rgbaFromHex(accent, 0.55);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (typeof repeatCount === 'number' && repeatCount > 1) {
    const badge = `×${repeatCount}`;
    ctx.font = `700 38px ${ZIKR_EXPORT_ARABIC_FONT}`;
    const badgeW = ctx.measureText(badge).width + 44;
    const badgeH = 56;
    const badgeX = blockX + blockW - badgeW - 16;
    const badgeY = blockY + 16;
    roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 12);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.direction = 'ltr';
    ctx.fillText(badge, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);
  }

  ctx.save();
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isDark ? (textColor ?? '#E6E1E5') : '#121212';
  ctx.font = `700 ${fontSize}px ${ZIKR_EXPORT_ARABIC_FONT}`;
  const textBlockH = lines.length * lineHeight;
  const zikrStartY = blockY + (blockH - textBlockH) / 2 + lineHeight / 2;
  lines.forEach((textLine, index) => {
    ctx.fillText(textLine, blockX + blockW / 2, zikrStartY + index * lineHeight);
  });
  ctx.restore();
};

const toZikr = (item: AdhkarItem): Zikr => ({
  id: item.id,
  categoryId: item.categoryId,
  orderIndex: item.orderIndex,
  title: item.title ?? undefined,
  arabic: item.arabicText,
  transliteration: item.transliteration ?? '',
  translation: item.translation ?? '',
  count: item.repeatCount ?? undefined,
  preferredTime: getPreferredTimeFromCategoryId(item.categoryId),
  reason: item.notes ?? undefined,
  benefit: item.sourceReference ?? undefined,
  fadl: item.fadl ?? undefined,
  tags: item.tags ?? undefined
});

const extractAuthenticity = (source?: string): string | null => {
  if (!source?.trim()) return null;
  const snippets: string[] = [];
  const patterns = [
    /إسناد[ه\u0647\s]*[^.\n،]{0,80}(?:صحيح|حسن|ضعيف|جيد|لا\s*بأس)/gi,
    /(?:و)?(?:إسناده|سنده)\s+[^.\n،]{0,60}(?:صحيح|حسن|ضعيف|جيد)/gi,
    /(?:صححه|حسنه|ضعفه|أقره|وثقه|صحّحه|حسّنه)[^.\n،]{0,120}/gi,
    /(?:صحيح|حسن|ضعيف|موقوف|مرفوع|لا\s*بأس\s*به)[^.\n،]{0,80}/gi
  ];
  for (const pattern of patterns) {
    const matches = source.match(pattern);
    if (matches) {
      for (const match of matches) {
        const trimmed = match.trim();
        if (trimmed && !snippets.includes(trimmed)) snippets.push(trimmed);
      }
    }
  }
  return snippets.length ? snippets.slice(0, 3).join(' — ') : null;
};

const hasHadithMetadata = (zikr: Zikr): boolean =>
  Boolean(zikr.fadl?.trim() || zikr.benefit?.trim() || zikr.reason?.trim());

const normalizeArabicForSearch = (input: string): string => {
  const s = (input ?? '').toString();
  // Remove Arabic diacritics / Quranic marks + tatweel
  // Harakat: 064B-065F, superscript alef: 0670, Quranic marks: 06D6-06ED, tatweel: 0640
  const withoutMarks = s.replace(/[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
  // Normalize common letter variants for forgiving search
  const normalizedLetters = withoutMarks
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');
  return normalizedLetters.trim().toLowerCase();
};

// قائمة الأذكار العامة المستخدمة للاختيار العشوائي (مع تفضيل حسب الوقت)
const azkarList: Zikr[] = adhkarItems
  .slice()
  .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
  .map(toZikr);

const getHijriDate = () => {
  const gregorianDate = new Date();
  const year = gregorianDate.getFullYear();
  const month = gregorianDate.getMonth() + 1;
  const day = gregorianDate.getDate();

  // Convert Gregorian to Julian Day Number (accurate algorithm)
  let jdn: number;
  if (month <= 2) {
    jdn = Math.floor(365.25 * (year - 1)) + Math.floor(30.6001 * (month + 12 + 1)) + day + 1720994.5;
  } else {
    jdn = Math.floor(365.25 * year) + Math.floor(30.6001 * (month + 1)) + day + 1720994.5;
  }
  
  // Adjust for Gregorian calendar
  const a = Math.floor(year / 100);
  const b = 2 - a + Math.floor(a / 4);
  jdn += b;

  // Hijri epoch: July 16, 622 CE = Julian Day 1948439.5
  const hijriEpoch = 1948439.5;
  const daysSinceEpoch = Math.floor(jdn - hijriEpoch);
  
  // Calculate Hijri year
  let hijriYear = Math.floor((daysSinceEpoch * 30 + 10646) / 10631) + 1;
  
  // Calculate exact days from epoch to start of this Hijri year
  let totalDays = 0;
  for (let hy = 1; hy < hijriYear; hy++) {
    // Leap years in 30-year cycle: years 2, 5, 7, 10, 13, 16, 18, 21, 24, 26, 29
    const cyclePos = (hy - 1) % 30;
    const leapPositions = [1, 4, 6, 9, 12, 15, 17, 20, 23, 25, 28];
    const isLeap = leapPositions.includes(cyclePos);
    totalDays += isLeap ? 355 : 354;
  }
  
  // Binary search to find correct year
  let low = 1;
  let high = hijriYear + 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    let days = 0;
    for (let hy = 1; hy < mid; hy++) {
      const cyclePos = (hy - 1) % 30;
      const leapPositions = [1, 4, 6, 9, 12, 15, 17, 20, 23, 25, 28];
      const isLeap = leapPositions.includes(cyclePos);
      days += isLeap ? 355 : 354;
    }
    if (days <= daysSinceEpoch) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  hijriYear = low - 1;
  
  // Recalculate totalDays for correct year
  totalDays = 0;
  for (let hy = 1; hy < hijriYear; hy++) {
    const cyclePos = (hy - 1) % 30;
    const leapPositions = [1, 4, 6, 9, 12, 15, 17, 20, 23, 25, 28];
    const isLeap = leapPositions.includes(cyclePos);
    totalDays += isLeap ? 355 : 354;
  }
  
  // Calculate remaining days in current Hijri year
  const remainingDays = daysSinceEpoch - totalDays;
  
  // Determine if current year is leap
  const cyclePos = (hijriYear - 1) % 30;
  const leapPositions = [1, 4, 6, 9, 12, 15, 17, 20, 23, 25, 28];
  const isLeapYear = leapPositions.includes(cyclePos);
  
  // Month lengths: 30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, (29 or 30)
  const monthLengths = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, isLeapYear ? 30 : 29];
  
  // Find the month
  let hijriMonth = 1;
  let monthDays = 0;
  for (let i = 0; i < 12; i++) {
    if (monthDays + monthLengths[i] > remainingDays) {
      hijriMonth = i + 1;
      break;
    }
    monthDays += monthLengths[i];
  }
  
  // Calculate day
  let hijriDay = remainingDays - monthDays + 1;
  
  // Ensure valid day range
  if (hijriDay < 1) hijriDay = 1;
  const maxDay = monthLengths[hijriMonth - 1];
  if (hijriDay > maxDay) hijriDay = maxDay;

  const monthNames = [
    'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
    'جمادى الأولى', 'جمادى الثانية', 'رجب', 'شعبان',
    'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
  ];

  const hijriMonthName = monthNames[hijriMonth - 1] || monthNames[0];
  return `${Math.floor(hijriDay)} ${hijriMonthName} ${hijriYear} هـ`;
};

const getCurrentTimeOfDay = (): 'morning' | 'afternoon' | 'evening' | 'night' | 'friday' => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday
  const hours = now.getHours();

  if (dayOfWeek === 5) {
    return 'friday';
  }

  if (hours >= 5 && hours < 12) {
    return 'morning';
  } else if (hours >= 12 && hours < 17) {
    return 'afternoon';
  } else if (hours >= 17 && hours < 20) {
    return 'evening';
  } else {
    return 'night';
  }
};

const detectPlatform = (): PlatformType => {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouchPoints = navigator.maxTouchPoints || 0;
  const isiOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (platform === 'MacIntel' && maxTouchPoints > 1);

  return isiOS ? 'ios' : 'android';
};

const getSettingsGliderStyle = (
  selectedIndex: number,
  optionCount: number,
  accent: string,
  variant: 'default' | 'soft' | 'strong' = 'default'
): CSSProperties => {
  const widthPercent = 100 / optionCount;
  const gradientByVariant = {
    default: `linear-gradient(135deg, ${rgbaFromHex(accent, 0.55)}, ${accent})`,
    soft: `linear-gradient(135deg, ${rgbaFromHex(accent, 0.35)}, ${rgbaFromHex(accent, 0.92)})`,
    strong: `linear-gradient(135deg, ${accent}, ${rgbaFromHex(accent, 0.72)})`
  };

  return {
    width: `${widthPercent}%`,
    transform: `translate3d(${selectedIndex * 100}%, 0, 0)`,
    background: gradientByVariant[variant],
    boxShadow: `0 0 18px ${rgbaFromHex(accent, 0.45)}, 0 0 10px ${rgbaFromHex(accent, 0.28)} inset`
  };
};

const getAdaptiveTheme = (platform: PlatformType, isDarkMode: boolean) => {
  if (platform === 'ios') {
    if (isDarkMode) {
      return {
        background: '#000000',
        header: '#1C1C1E',
        card: '#2C2C2E',
        accent: '#0A84FF',
        text: '#F2F2F7',
        textLight: '#8E8E93'
      };
    }

    return {
      background: '#F2F2F7',
      header: '#FFFFFF',
      card: '#FFFFFF',
      accent: '#007AFF',
      text: '#1C1C1E',
      textLight: '#8E8E93'
    };
  }

  if (isDarkMode) {
    return {
      background: '#121212',
      header: '#1E1E1E',
      card: '#242424',
      accent: '#BB86FC',
      text: '#E6E1E5',
      textLight: '#B0A8B9'
    };
  }

  return {
    background: '#FFFBFE',
    header: '#F3EDF7',
    card: '#FFFFFF',
    accent: '#6750A4',
    text: '#1C1B1F',
    textLight: '#6F6A73'
  };
};

const MoonIcon = ({ color }: { color: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={color}>
    <path d="M12.4599 22.7501C12.2899 22.7501 12.1199 22.7501 11.9499 22.7401C6.34995 22.4901 1.66995 17.9801 1.27995 12.4801C0.939948 7.76011 3.66995 3.35011 8.06995 1.50011C9.31995 0.980114 9.97995 1.38011 10.2599 1.67011C10.5399 1.95011 10.9299 2.60011 10.4099 3.79011C9.94995 4.85011 9.71995 5.98011 9.72995 7.14011C9.74995 11.5701 13.4299 15.3301 17.9199 15.5101C18.5699 15.5401 19.2099 15.4901 19.8299 15.3801C21.1499 15.1401 21.6999 15.6701 21.9099 16.0101C22.1199 16.3501 22.3599 17.0801 21.5599 18.1601C19.4399 21.0601 16.0699 22.7501 12.4599 22.7501ZM2.76995 12.3701C3.10995 17.1301 7.16995 21.0301 12.0099 21.2401C15.2999 21.4001 18.4199 19.9001 20.3399 17.2801C20.4899 17.0701 20.5599 16.9201 20.5899 16.8401C20.4999 16.8301 20.3399 16.8201 20.0899 16.8701C19.3599 17.0001 18.5999 17.0501 17.8499 17.0201C12.5699 16.8101 8.24995 12.3801 8.21995 7.16011C8.21995 5.78011 8.48995 4.45011 9.03995 3.20011C9.13995 2.98011 9.15995 2.83011 9.16995 2.75011C9.07995 2.75011 8.91995 2.77011 8.65995 2.88011C4.84995 4.48011 2.48995 8.30011 2.76995 12.3701Z" />
  </svg>
);

const SunIcon = ({ color }: { color: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={color}>
    <path d="M12 19.25C8 19.25 4.75 16 4.75 12C4.75 8 8 4.75 12 4.75C16 4.75 19.25 8 19.25 12C19.25 16 16 19.25 12 19.25ZM12 6.25C8.83 6.25 6.25 8.83 6.25 12C6.25 15.17 8.83 17.75 12 17.75C15.17 17.75 17.75 15.17 17.75 12C17.75 8.83 15.17 6.25 12 6.25Z" />
    <path d="M12 22.96C11.45 22.96 11 22.55 11 22V21.92C11 21.37 11.45 20.92 12 20.92C12.55 20.92 13 21.37 13 21.92C13 22.47 12.55 22.96 12 22.96ZM19.14 20.14C18.88 20.14 18.63 20.04 18.43 19.85L18.3 19.72C17.91 19.33 17.91 18.7 18.3 18.31C18.69 17.92 19.32 17.92 19.71 18.31L19.84 18.44C20.23 18.83 20.23 19.46 19.84 19.85C19.65 20.04 19.4 20.14 19.14 20.14ZM4.86 20.14C4.6 20.14 4.35 20.04 4.15 19.85C3.76 19.46 3.76 18.83 4.15 18.44L4.28 18.31C4.67 17.92 5.3 17.92 5.69 18.31C6.08 18.7 6.08 19.33 5.69 19.72L5.56 19.85C5.37 20.04 5.11 20.14 4.86 20.14ZM22 13H21.92C21.37 13 20.92 12.55 20.92 12C20.92 11.45 21.37 11 21.92 11C22.47 11 22.96 11.45 22.96 12C22.96 12.55 22.55 13 22 13ZM2.08 13H2C1.45 13 1 12.55 1 12C1 11.45 1.45 11 2 11C2.55 11 3.04 11.45 3.04 12C3.04 12.55 2.63 13 2.08 13ZM19.01 5.99C18.75 5.99 18.5 5.89 18.3 5.7C17.91 5.31 17.91 4.68 18.3 4.29L18.43 4.16C18.82 3.77 19.45 3.77 19.84 4.16C20.23 4.55 20.23 5.18 19.84 5.57L19.71 5.7C19.52 5.89 19.27 5.99 19.01 5.99ZM4.99 5.99C4.73 5.99 4.48 5.89 4.28 5.7L4.15 5.56C3.76 5.17 3.76 4.54 4.15 4.15C4.54 3.76 5.17 3.76 5.56 4.15L5.69 4.28C6.08 4.67 6.08 5.3 5.69 5.69C5.5 5.89 5.24 5.99 4.99 5.99ZM12 3.04C11.45 3.04 11 2.63 11 2.08V2C11 1.45 11.45 1 12 1C12.55 1 13 1.45 13 2C13 2.55 12.55 3.04 12 3.04Z" />
  </svg>
);

const DownloadIcon = ({ color }: { color: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
    <path d="M8.73998 21.5002C4.26998 21.5002 2.47998 19.7102 2.47998 15.2402V15.1102C2.47998 11.0902 3.92998 9.24016 7.46998 8.91016" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16.44 8.90039C20.04 9.21039 21.51 11.0604 21.51 15.1104V15.2404C21.51 19.7104 19.72 21.5004 15.25 21.5004H13.01" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 2V14.88" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15.35 12.6504L12 16.0004L8.64999 12.6504" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function App() {
  const [platformTheme, setPlatformTheme] = useState<PlatformType>(() => detectPlatform());
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const savedMode = localStorage.getItem('themeMode');
    if (savedMode === 'light' || savedMode === 'dark' || savedMode === 'system') {
      return savedMode;
    }
    return 'system';
  });
  const [currentZikr, setCurrentZikr] = useState<Zikr>(azkarList[0]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [count, setCount] = useState(0);
  const [hijriDate, setHijriDate] = useState('');
  const [dayName, setDayName] = useState('');
  const [hijriDay, setHijriDay] = useState('');
  const [hijriMonth, setHijriMonth] = useState('');
  const [hijriYear, setHijriYear] = useState('');
  const [gregorianDate, setGregorianDate] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [particleId, setParticleId] = useState(0);
  const [zikrHistory, setZikrHistory] = useState<Zikr[]>([]);
  const [zikrProgress, setZikrProgress] = useState<Record<string, number>>(
    () => getInitialAdhkarState().progress
  );
  const [countRecords, setCountRecords] = useState<CountRecord[]>(() => {
    const saved = localStorage.getItem('zikrCountRecords');
    return saved ? JSON.parse(saved) : [];
  });
  const [savedAzkar, setSavedAzkar] = useState<Zikr[]>(() => {
    const saved = localStorage.getItem('savedAzkar');
    return saved ? JSON.parse(saved) : [];
  });
  const [showSettings, setShowSettings] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>(() => loadStoredLanguage());
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('zikrFontSize');
    return saved ? parseInt(saved) : 48;
  });
  const [pullDistance, setPullDistance] = useState(0);
  const [showHadithInfo, setShowHadithInfo] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextZikrClickRef = useRef(false);
  const [isPulling, setIsPulling] = useState(false);
  const [startY, setStartY] = useState(0);
  const [horizontalSwipe, setHorizontalSwipe] = useState(0);
  const [isSwipingHorizontal, setIsSwipingHorizontal] = useState(false);
  const [startX, setStartX] = useState(0);
  const [swipeFromRightEdge, setSwipeFromRightEdge] = useState(false);
  const [currentPage, setCurrentPage] = useState('main');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerFilter, setDrawerFilter] = useState<'index' | 'category' | 'saved' | 'morning' | 'evening'>(() => {
    const saved = localStorage.getItem('drawerLastFilter');
    return saved === 'index' || saved === 'category' || saved === 'saved' ? saved : 'index';
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(() => {
    const saved = localStorage.getItem('drawerLastCategoryId');
    if (!saved) return null;
    const n = Number(saved);
    return Number.isFinite(n) ? n : null;
  });
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [readAzkar, setReadAzkar] = useState<Set<string>>(
    () => getInitialAdhkarState().readAzkar
  );

  const pushAppNavState = useCallback(() => {
    window.history.pushState({ zikrAppNav: true }, '', window.location.href);
  }, []);

  const handleAndroidBack = useCallback((): boolean => {
    if (showHadithInfo) {
      setShowHadithInfo(false);
      skipNextZikrClickRef.current = true;
      return true;
    }
    if (showSettings) {
      setShowSettings(false);
      return true;
    }
    if (isDrawerOpen && searchQuery.trim()) {
      setSearchQuery('');
      return true;
    }
    if (isDrawerOpen && drawerFilter !== 'index') {
      setDrawerFilter('index');
      setSelectedCategoryId(null);
      setSearchQuery('');
      return true;
    }
    if (isDrawerOpen) {
      setIsDrawerOpen(false);
      return true;
    }
    if (currentPage === 'history') {
      setCurrentPage('main');
      return true;
    }
    return false;
  }, [
    showHadithInfo,
    showSettings,
    isDrawerOpen,
    drawerFilter,
    searchQuery,
    currentPage
  ]);

  useEffect(() => {
    window.history.replaceState({ zikrRoot: true }, '', window.location.href);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      handleAndroidBack();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [handleAndroidBack]);

  const prevDrawerOpenRef = useRef(false);
  useEffect(() => {
    if (isDrawerOpen && !prevDrawerOpenRef.current) {
      pushAppNavState();
    }
    prevDrawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen, pushAppNavState]);

  const prevDrawerFilterRef = useRef(drawerFilter);
  useEffect(() => {
    if (
      isDrawerOpen &&
      drawerFilter !== 'index' &&
      prevDrawerFilterRef.current === 'index'
    ) {
      pushAppNavState();
    }
    prevDrawerFilterRef.current = drawerFilter;
  }, [drawerFilter, isDrawerOpen, pushAppNavState]);

  const prevSearchQueryRef = useRef(searchQuery);
  useEffect(() => {
    if (
      isDrawerOpen &&
      searchQuery.trim() &&
      !prevSearchQueryRef.current.trim()
    ) {
      pushAppNavState();
    }
    prevSearchQueryRef.current = searchQuery;
  }, [searchQuery, isDrawerOpen, pushAppNavState]);

  const prevSettingsRef = useRef(showSettings);
  useEffect(() => {
    if (showSettings && !prevSettingsRef.current) {
      pushAppNavState();
    }
    prevSettingsRef.current = showSettings;
  }, [showSettings, pushAppNavState]);

  const prevHadithInfoRef = useRef(showHadithInfo);
  useEffect(() => {
    if (showHadithInfo && !prevHadithInfoRef.current) {
      pushAppNavState();
    }
    prevHadithInfoRef.current = showHadithInfo;
  }, [showHadithInfo, pushAppNavState]);

  const prevPageRef = useRef(currentPage);
  useEffect(() => {
    if (currentPage === 'history' && prevPageRef.current !== 'history') {
      pushAppNavState();
    }
    prevPageRef.current = currentPage;
  }, [currentPage, pushAppNavState]);

  useEffect(() => {
    // Save font size to localStorage
    localStorage.setItem('zikrFontSize', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    localStorage.setItem('zikrProgress', JSON.stringify(zikrProgress));
  }, [zikrProgress]);

  useEffect(() => {
    localStorage.setItem('zikrCountRecords', JSON.stringify(countRecords));
  }, [countRecords]);

  useEffect(() => {
    localStorage.setItem('savedAzkar', JSON.stringify(savedAzkar));
  }, [savedAzkar]);

  useEffect(() => {
    localStorage.setItem('themeMode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    applyDocumentLanguage(language);
  }, [language]);

  useEffect(() => {
    // Persist last drawer location so reopening stays there
    if (drawerFilter === 'index' || drawerFilter === 'saved') {
      localStorage.setItem('drawerLastFilter', drawerFilter);
      localStorage.removeItem('drawerLastCategoryId');
      return;
    }
    if (drawerFilter === 'category' && selectedCategoryId) {
      localStorage.setItem('drawerLastFilter', 'category');
      localStorage.setItem('drawerLastCategoryId', String(selectedCategoryId));
    }
  }, [drawerFilter, selectedCategoryId]);

  useEffect(() => {
    setCount(zikrProgress[currentZikr.arabic] ?? 0);
    setShowHadithInfo(false);
  }, [currentZikr, zikrProgress]);

  useEffect(() => {
    const runDailyAdhkarResets = () => {
      setZikrProgress((prevProgress) => {
        const readRaw = localStorage.getItem('readAzkar');
        const readPrev = readRaw
          ? new Set<string>(JSON.parse(readRaw) as string[])
          : new Set<string>();
        const result = applyDailyAdhkarCounterResets(prevProgress, readPrev);
        if (result.didReset) {
          localStorage.setItem('zikrProgress', JSON.stringify(result.progress));
          localStorage.setItem('readAzkar', JSON.stringify([...result.readAzkarIds]));
          setReadAzkar(result.readAzkarIds);
        }
        return result.progress;
      });
    };

    runDailyAdhkarResets();
    const interval = setInterval(runDailyAdhkarResets, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Get Hijri date using API for accuracy
    const fetchHijriDate = async () => {
      try {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');

        // Get day name in Arabic
        const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const dayName = dayNames[today.getDay()];

        // Using Aladhan API for accurate Hijri date
        const response = await fetch(`https://api.aladhan.com/v1/gToH/${day}-${month}-${year}`);
        const data = await response.json();

        if (data.code === 200 && data.data) {
          const hijri = data.data.hijri;
          const monthNames = [
            'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني',
            'جمادى الأولى', 'جمادى الثانية', 'رجب', 'شعبان',
            'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'
          ];
          const monthName = monthNames[parseInt(hijri.month.number) - 1] || hijri.month.ar;
          setHijriDate(`${dayName} ${hijri.day} ${monthName} ${hijri.year} هـ`);
          setDayName(dayName);
          setHijriDay(hijri.day);
          setHijriMonth(monthName);
          setHijriYear(`${hijri.year} هـ`);
        } else {
          // Fallback to calculated date if API fails
          const fallbackDate = getHijriDate();
          setHijriDate(`${dayName} ${fallbackDate}`);
          setDayName(dayName);
          // Parse fallback date (format: "DD MonthName YYYY هـ")
          const parts = fallbackDate.split(' ');
          if (parts.length >= 3) {
            setHijriDay(parts[0]);
            setHijriMonth(parts.slice(1, -1).join(' '));
            setHijriYear(parts[parts.length - 1]);
          }
        }

        // Set Gregorian date
        const gregorianMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 
                                  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const gregorianMonth = gregorianMonths[today.getMonth()];
        setGregorianDate(`${day} ${gregorianMonth} ${year}`);
      } catch {
        // Fallback to calculated date if API fails
        const today = new Date();
        const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const dayName = dayNames[today.getDay()];
        const fallbackDate = getHijriDate();
        setHijriDate(`${dayName} ${fallbackDate}`);
        setDayName(dayName);
        // Parse fallback date
        const parts = fallbackDate.split(' ');
        if (parts.length >= 3) {
          setHijriDay(parts[0]);
          setHijriMonth(parts.slice(1, -1).join(' '));
          setHijriYear(parts[parts.length - 1]);
        }
        // Set Gregorian date
        const gregorianMonths = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 
                                  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const gregorianMonth = gregorianMonths[today.getMonth()];
        const year = today.getFullYear();
        const day = String(today.getDate()).padStart(2, '0');
        setGregorianDate(`${day} ${gregorianMonth} ${year}`);
      }
    };

    fetchHijriDate();

    // Select time-appropriate dhikr
    const timeOfDay = getCurrentTimeOfDay();
    const initialCategoryId = getCategoryIdForTime(timeOfDay);
    setDrawerFilter(getDrawerFilterForTime(timeOfDay));
    setActiveCategoryId(initialCategoryId);
    if (initialCategoryId !== null) {
      const firstItem = adhkarItems
        .filter((a) => a.categoryId === initialCategoryId)
        .slice()
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))[0];
      if (firstItem) {
        setCurrentZikr(toZikr(firstItem));
      }
    }

  }, []);

  useEffect(() => {
    setCurrentTime(formatClockTime(language));
    const timeInterval = setInterval(() => {
      setCurrentTime(formatClockTime(language));
    }, 1000);
    return () => clearInterval(timeInterval);
  }, [language]);

  const getZikrSequenceForCategory = (categoryId: number | null): Zikr[] => {
    if (categoryId === null) return azkarList;
    return adhkarItems
      .filter((a) => a.categoryId === categoryId)
      .slice()
      .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
      .map(toZikr);
  };

  const getNavigationCategory = (): number | null => {
    const timeBasedCategory = getCategoryIdForTime(getCurrentTimeOfDay());
    // In morning/evening/night, always keep navigation in that time-specific adhkar.
    if (timeBasedCategory !== null) return timeBasedCategory;
    return activeCategoryId;
  };

  useEffect(() => {
    setPlatformTheme(detectPlatform());
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches);
    };

    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleThemeChange);

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
    };
  }, []);

  const getRandomZikr = () => {
    setIsAnimating(true);
    saveCurrentProgressIfAny();
    setCount(0);
    setShowCelebration(false);
    setParticles([]);

    // Save current zikr to history
    if (currentZikr) {
      setZikrHistory(prev => [...prev, currentZikr]);
    }

    setTimeout(() => {
      // "التالي" داخل نفس التصنيف النشط (أو صباح/مساء حسب الوقت لو مفيش تصنيف نشط)
      const categoryToUse = getNavigationCategory();
      if (categoryToUse !== activeCategoryId) {
        setActiveCategoryId(categoryToUse);
      }

      const seq = getZikrSequenceForCategory(categoryToUse);
      if (seq.length === 0) {
        setIsAnimating(false);
        return;
      }

      const currentIndex = seq.findIndex((z) =>
        currentZikr?.id ? z.id === currentZikr.id : z.arabic === currentZikr?.arabic
      );
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % seq.length : 0;
      setCurrentZikr(seq[nextIndex]);
      setIsAnimating(false);
    }, 200);
  };

  const getPreviousZikr = () => {
    setIsAnimating(true);
    saveCurrentProgressIfAny();
    setCount(0);
    setShowCelebration(false);
    setParticles([]);

    setTimeout(() => {
      // "السابق" داخل نفس التصنيف النشط (أو صباح/مساء حسب الوقت لو مفيش تصنيف نشط)
      const categoryToUse = getNavigationCategory();
      if (categoryToUse !== activeCategoryId) {
        setActiveCategoryId(categoryToUse);
      }

      const seq = getZikrSequenceForCategory(categoryToUse);
      if (seq.length === 0) {
        setIsAnimating(false);
        return;
      }

      const currentIndex = seq.findIndex((z) =>
        currentZikr?.id ? z.id === currentZikr.id : z.arabic === currentZikr?.arabic
      );
      const prevIndex =
        currentIndex >= 0 ? (currentIndex - 1 + seq.length) % seq.length : 0;
      setCurrentZikr(seq[prevIndex]);
      setIsAnimating(false);
    }, 200);
  };

  const vibrate = (pattern: number | number[] = 50) => {
    // Check if vibration API is supported
    if ('vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  };

  const selectZikrFromDrawer = (zikr: Zikr) => {
    // Vibrate on selection
    vibrate([50, 30, 50]);
    
    setIsAnimating(true);
    saveCurrentProgressIfAny();
    setCount(0);
    setShowCelebration(false);
    setParticles([]);

    // Save current zikr to history if different
    if (currentZikr && currentZikr.arabic !== zikr.arabic) {
      setZikrHistory(prev => [...prev, currentZikr]);
    }

    setTimeout(() => {
      setCurrentZikr(zikr);
      if (drawerFilter === 'morning') setActiveCategoryId(MORNING_CATEGORY_ID);
      else if (drawerFilter === 'evening') setActiveCategoryId(EVENING_CATEGORY_ID);
      else if (drawerFilter === 'category' && selectedCategoryId) setActiveCategoryId(selectedCategoryId);
      else if (zikr.categoryId) setActiveCategoryId(zikr.categoryId);
      setIsAnimating(false);
      setCurrentPage('main');
      setIsDrawerOpen(false);
    }, 200);
  };

  const selectZikrFromDrawerKeepIndexOpen = (zikr: Zikr) => {
    // Same as selectZikrFromDrawer, but keep the drawer open (useful for browsing saved list)
    vibrate([50, 30, 50]);

    setIsAnimating(true);
    saveCurrentProgressIfAny();
    setCount(0);
    setShowCelebration(false);
    setParticles([]);

    if (currentZikr && currentZikr.arabic !== zikr.arabic) {
      setZikrHistory((prev) => [...prev, currentZikr]);
    }

    setTimeout(() => {
      setCurrentZikr(zikr);
      if (drawerFilter === 'morning') setActiveCategoryId(MORNING_CATEGORY_ID);
      else if (drawerFilter === 'evening') setActiveCategoryId(EVENING_CATEGORY_ID);
      else if (drawerFilter === 'category' && selectedCategoryId) setActiveCategoryId(selectedCategoryId);
      else if (zikr.categoryId) setActiveCategoryId(zikr.categoryId);
      setIsAnimating(false);
      setCurrentPage('main');
      // intentionally keep drawer open
    }, 200);
  };

  const isZikrSaved = (zikr: Zikr) => {
    return savedAzkar.some((saved) => saved.arabic === zikr.arabic);
  };

  const toggleSaveZikr = (zikr: Zikr) => {
    setSavedAzkar((prev) => {
      const exists = prev.some((saved) => saved.arabic === zikr.arabic);
      if (exists) {
        return prev.filter((saved) => saved.arabic !== zikr.arabic);
      }
      return [zikr, ...prev];
    });
  };

  const openSavedZikr = (zikr: Zikr) => {
    setCurrentZikr(zikr);
    if (zikr.categoryId) {
      setActiveCategoryId(zikr.categoryId);
    }
    setCurrentPage('main');
  };

  const openDrawerWithFilter = (filter: 'morning' | 'evening') => {
    setDrawerFilter(filter);
    setSearchQuery('');
    setIsDrawerOpen(true);
    setActiveCategoryId(filter === 'morning' ? MORNING_CATEGORY_ID : EVENING_CATEGORY_ID);
  };

  const openDrawerByCurrentTime = () => {
    setSearchQuery('');
    setSelectedCategoryId(null);
    const savedFilter = localStorage.getItem('drawerLastFilter');
    const savedCategoryIdRaw = localStorage.getItem('drawerLastCategoryId');
    const savedCategoryId = savedCategoryIdRaw ? Number(savedCategoryIdRaw) : NaN;

    if (savedFilter === 'category' && Number.isFinite(savedCategoryId)) {
      setDrawerFilter('category');
      setSelectedCategoryId(savedCategoryId);
      setIsDrawerOpen(true);
      return;
    }

    if (savedFilter === 'saved') {
      setDrawerFilter('saved');
      setIsDrawerOpen(true);
      return;
    }

    const timeOfDay = getCurrentTimeOfDay();
    const timeFilter = getDrawerFilterForTime(timeOfDay);
    setDrawerFilter(timeFilter);
    if (timeFilter === 'morning') setActiveCategoryId(MORNING_CATEGORY_ID);
    if (timeFilter === 'evening') setActiveCategoryId(EVENING_CATEGORY_ID);
    setIsDrawerOpen(true);
  };

  const getTargetCount = (currentCount: number): number | null => {
    if (currentCount < 10) {
      return 10;
    } else if (currentCount < 100) {
      return 100;
    } else {
      return null; // Unlimited
    }
  };

  const getZikrTarget = (zikr: Zikr, currentCount: number): number | null => {
    if (typeof zikr.count === 'number' && Number.isFinite(zikr.count) && zikr.count > 0) {
      return Math.floor(zikr.count);
    }
    return getTargetCount(currentCount);
  };

  const saveCountRecord = (reachedCount: number, target: number | null) => {
    setCountRecords((prev) => [
      ...prev,
      {
        id: Date.now(),
        zikrArabic: currentZikr.arabic,
        count: reachedCount,
        target,
        recordedAt: new Date().toISOString()
      }
    ]);
  };

  const saveCurrentProgressIfAny = () => {
    if (count <= 0) return;
    saveCountRecord(count, getZikrTarget(currentZikr, count));
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startZikrLongPress = () => {
    clearLongPressTimer();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      skipNextZikrClickRef.current = true;
      vibrate(35);
      setShowHadithInfo(true);
    }, 550);
  };

  const endZikrLongPress = () => {
    clearLongPressTimer();
  };

  useEffect(() => () => clearLongPressTimer(), []);

  const handleZikrClick = () => {
    if (skipNextZikrClickRef.current) {
      skipNextZikrClickRef.current = false;
      return;
    }
    const target = getZikrTarget(currentZikr, count);
    if (typeof target === 'number' && count >= target) {
      // Reached required repeats for this zikr
      return;
    }

    // Vibrate on each valid increment (until completion)
    vibrate(25);

    const newCount = count + 1;
    setCount(newCount);
    setZikrProgress((prev) => ({
      ...prev,
      [currentZikr.arabic]: newCount
    }));

    const reachedTarget = typeof target === 'number' && newCount === target;
    // Fallback celebration at milestones: 10, 100, and every 50 after 100 (150, 200, 250, etc.)
    const reachedMilestone = newCount === 10 || newCount === 100 || (newCount > 100 && newCount % 50 === 0);

    if (reachedTarget || (target === null && reachedMilestone)) {
      setShowCelebration(true);
      triggerCelebration();
      // Slightly longer vibration when completing the zikr
      vibrate(reachedTarget ? [60, 40, 80] : [50, 30, 50, 30, 50]);
      setTimeout(() => {
        setShowCelebration(false);
      }, 2000);
    }

    if (reachedTarget) {
      saveCountRecord(newCount, target);
    }
  };

  const triggerCelebration = () => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < 30; i++) {
      newParticles.push({
        id: particleId + i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 0.3
      });
    }
    setParticles(newParticles);
    setParticleId(particleId + 30);
  };

  const targetCount = getZikrTarget(currentZikr, count);
  
  const downloadCurrentZikr = async () => {
    const rawZikr = currentZikr?.arabic?.trim();
    if (!rawZikr) return;
    const zikrText = enforceSacredLineBreaks(rawZikr);

    await ensureZikrExportFonts();
    await document.fonts.ready;

    const canvas = document.createElement('canvas');
    const scale = Math.max(2, window.devicePixelRatio || 1);
    const width = 1080;
    const height = 1350;
    canvas.width = width * scale;
    canvas.height = height * scale;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(scale, scale);

    const exportAccent = colors.accent;
    const exportBackground = colors.background;
    const exportCard = colors.card;
    const exportText = colors.text;
    const exportTextLight = colors.textLight;
    const darkMode = isDarkMode;

    const pad = 48;
    const cardR = 36;
    const x0 = pad;
    const y0 = pad;
    const w0 = width - pad * 2;
    const h0 = height - pad * 2;
    const innerPad = 44;
    const sectionTitleSize = 34;
    const sectionBodySize = 24;

    const whenHowText = currentZikr.reason?.trim();
    const fadlText = currentZikr.fadl?.trim();
    const sectionBoxExtra = 32;

    ctx.fillStyle = exportBackground;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.shadowColor = darkMode ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.14)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    roundRectPath(ctx, x0, y0, w0, h0, cardR);
    ctx.fillStyle = exportCard;
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, x0, y0, w0, h0, cardR);
    ctx.clip();

    const cardGrad = ctx.createLinearGradient(x0, y0, x0, y0 + h0);
    cardGrad.addColorStop(0, exportCard);
    cardGrad.addColorStop(1, exportCard);
    ctx.fillStyle = cardGrad;
    ctx.fillRect(x0, y0, w0, h0);

    const cx = x0 + w0 / 2;
    const cy = y0 + h0 / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 4);
    const wm = 'zikr ذِكْر ';
    const wmSize = 32;
    ctx.direction = 'ltr';
    ctx.font = `normal ${wmSize}px 'Fascinate Inline', 'Madinet Al Bat', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.05)';
    const wmGap = '   ';
    const stepX = ctx.measureText(wm + wmGap).width;
    const stepY = wmSize * 2.35;
    for (let row = -16; row <= 16; row++) {
      for (let col = -16; col <= 16; col++) {
        ctx.fillText(wm + wmGap, col * stepX, row * stepY);
      }
    }
    ctx.restore();

    const contentX = x0 + innerPad;
    const contentW = w0 - innerPad * 2;

    const bottomSectionH = fadlText
      ? measureExportSectionHeight(
          ctx,
          fadlText,
          contentW,
          sectionTitleSize,
          sectionBodySize,
          true
        ) + sectionBoxExtra
      : 0;

    drawExportAccentWash(ctx, x0, y0, w0, h0, exportAccent);
    const mainPadX = 32;
    const mainPadY = 32;
    let layoutY = y0 + innerPad;

    if (whenHowText) {
      const drawnH = drawExportCornerSection(
        ctx,
        'متى وكيفيته',
        whenHowText,
        contentX,
        layoutY,
        contentW,
        sectionTitleSize,
        sectionBodySize,
        exportAccent,
        exportCard,
        exportText,
        exportTextLight,
        darkMode
      );
      layoutY += drawnH + EXPORT_BLOCK_GAP;
    }

    const footerReserve = 44;
    const bottomReserve = fadlText ? bottomSectionH + EXPORT_BLOCK_GAP : 0;
    const availableMainH = y0 + h0 - layoutY - bottomReserve - footerReserve - innerPad;
    const preferredZikrSize = Math.min(Math.max(Math.round(fontSize * 0.62), 48), 88);
    const { fontSize: exportFontSize, lines: zikrLines, lineHeight: zikrLineHeight } =
      fitZikrExportLayout(
        ctx,
        zikrText,
        contentW - mainPadX * 2,
        Math.max(availableMainH - mainPadY * 2, 100),
        preferredZikrSize
      );

    ctx.font = `700 ${exportFontSize}px ${ZIKR_EXPORT_ARABIC_FONT}`;
    const mainTextH = zikrLines.length * zikrLineHeight;
    const mainBlockH = mainTextH + mainPadY * 2;

    drawExportMainZikrBlock(
      ctx,
      zikrLines,
      exportFontSize,
      zikrLineHeight,
      contentX,
      layoutY,
      contentW,
      mainBlockH,
      exportAccent,
      currentZikr.count,
      exportCard,
      exportText,
      darkMode
    );

    layoutY += mainBlockH + EXPORT_BLOCK_GAP;

    if (fadlText) {
      drawExportCornerSection(
        ctx,
        'فضل الذكر',
        fadlText,
        contentX,
        layoutY,
        contentW,
        sectionTitleSize,
        sectionBodySize,
        exportAccent,
        exportCard,
        exportText,
        exportTextLight,
        darkMode
      );
    }

    ctx.font = `600 26px 'Madinet Al Bat', 'Cairo', ${ZIKR_EXPORT_ARABIC_FONT}`;
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgbaFromHex(exportAccent, 0.75);
    ctx.fillText('ذِكْر', x0 + w0 / 2, y0 + h0 - 20);

    ctx.restore();

    roundRectPath(ctx, x0, y0, w0, h0, cardR);
    ctx.strokeStyle = exportAccent;
    ctx.lineWidth = 4;
    ctx.stroke();

    roundRectPath(ctx, x0 + 10, y0 + 10, w0 - 20, h0 - 20, Math.max(8, cardR - 10));
    ctx.strokeStyle = rgbaFromHex(exportAccent, 0.22);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `zikr-${timestamp}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const isDarkMode = themeMode === 'system' ? systemPrefersDark : themeMode === 'dark';
  const colors = getAdaptiveTheme(platformTheme, isDarkMode);
  const t = getUiStrings(language);
  const currentAuthenticity = extractAuthenticity(currentZikr.benefit);
  const showTransliteration = shouldShowTransliteration(language);
  const showTranslation = shouldShowTranslation(language);
  const appFontFamily = platformTheme === 'ios'
    ? "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif"
    : "Roboto, 'Noto Sans', 'Droid Sans', 'Segoe UI', sans-serif";

  return (
    <>
    <div
      className="min-h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: colors.background, fontFamily: appFontFamily }}
      onTouchStart={(e) => {
        const clientX = e.touches[0].clientX;
        const clientY = e.touches[0].clientY;
        const screenWidth = window.innerWidth;

        // Check if touch starts from right edge (within 50px from right edge)
        const isFromRightEdge = clientX > screenWidth - 50;
        setSwipeFromRightEdge(isFromRightEdge);

        if (clientY > window.innerHeight * 0.7) {
          setStartY(clientY);
          setIsPulling(true);
        }
        setStartX(clientX);
        setIsSwipingHorizontal(false);
      }}
      onTouchMove={(e) => {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;

        if (isPulling && startY > 0) {
          const distance = Math.max(0, currentY - startY);
          if (distance > 0 && distance < 150) {
            setPullDistance(distance);
          }
        }

        if (Math.abs(currentX - startX) > 10 && !isPulling) {
          setIsSwipingHorizontal(true);
          const swipeDistance = currentX - startX;
          if (Math.abs(swipeDistance) < 150) {
            setHorizontalSwipe(swipeDistance);
          }
        }
      }}
      onTouchEnd={() => {
        if (pullDistance > 80) {
          getRandomZikr();
        }
        setPullDistance(0);
        setIsPulling(false);
        setStartY(0);

        // Handle drawer opening from right edge swipe
        if (swipeFromRightEdge && horizontalSwipe < -50) {
          // Swipe from right edge to left (opening drawer)
          if (!isDrawerOpen) {
            openDrawerByCurrentTime();
          }
        } else if (isDrawerOpen && horizontalSwipe > 50) {
          // Swipe right to close drawer
          setIsDrawerOpen(false);
        } else if (!isDrawerOpen && horizontalSwipe < -80) {
          // Swipe left to go to history (only if drawer is closed)
          setCurrentPage('history');
        } else if (horizontalSwipe > 80 && !swipeFromRightEdge) {
          // Swipe right from anywhere else goes to main
          setCurrentPage('main');
        }

        setHorizontalSwipe(0);
        setIsSwipingHorizontal(false);
        setStartX(0);
        setSwipeFromRightEdge(false);
      }}
    >
      <style>{`
        .container input {
          position: absolute;
          opacity: 0;
          cursor: pointer;
          height: 0;
          width: 0;
        }

        .container {
          display: block;
          position: relative;
          cursor: pointer;
          font-size: 25px;
          user-select: none;
        }

        .checkmark {
          position: relative;
          top: 0;
          left: 0;
          height: 1.3em;
          width: 1.3em;
          background: ${colors.text};
          border-radius: 50px;
          transition: all 0.7s;
          --spread: 20px;
          flex-shrink: 0;
        }

        .container input:checked ~ .checkmark {
          background: ${colors.text};
          box-shadow: -10px -10px var(--spread) 0px ${colors.accent}, 
                      0 -10px var(--spread) 0px ${colors.accent}, 
                      10px -10px var(--spread) 0px ${colors.accent}, 
                      10px 0 var(--spread) 0px ${colors.accent}, 
                      10px 10px var(--spread) 0px ${colors.accent}, 
                      0 10px var(--spread) 0px ${colors.accent}, 
                      -10px 10px var(--spread) 0px ${colors.accent};
        }

        .checkmark:after {
          content: "";
          position: absolute;
          display: none;
        }

        .container input:checked ~ .checkmark:after {
          display: block;
        }

        .container .checkmark:after {
          left: 0.45em;
          top: 0.25em;
          width: 0.25em;
          height: 0.5em;
          border: solid ${colors.card};
          border-width: 0 0.15em 0.15em 0;
          transform: rotate(45deg);
        }

        .container input {
          position: absolute;
          opacity: 0;
          cursor: pointer;
          height: 0;
          width: 0;
        }

        .container {
          display: block;
          position: relative;
          cursor: pointer;
          font-size: 25px;
          user-select: none;
        }

        .checkmark {
          position: relative;
          top: 0;
          left: 0;
          height: 1.3em;
          width: 1.3em;
          background: ${colors.text};
          border-radius: 50px;
          transition: all 0.7s;
          --spread: 20px;
          flex-shrink: 0;
        }

        .container input:checked ~ .checkmark {
          background: ${colors.text};
          box-shadow: -10px -10px var(--spread) 0px ${colors.accent}, 
                      0 -10px var(--spread) 0px ${colors.accent}, 
                      10px -10px var(--spread) 0px ${colors.accent}, 
                      10px 0 var(--spread) 0px ${colors.accent}, 
                      10px 10px var(--spread) 0px ${colors.accent}, 
                      0 10px var(--spread) 0px ${colors.accent}, 
                      -10px 10px var(--spread) 0px ${colors.accent};
        }

        .checkmark:after {
          content: "";
          position: absolute;
          display: none;
        }

        .container input:checked ~ .checkmark:after {
          display: block;
        }

        .container .checkmark:after {
          left: 0.45em;
          top: 0.25em;
          width: 0.25em;
          height: 0.5em;
          border: solid ${colors.card};
          border-width: 0 0.15em 0.15em 0;
          transform: rotate(45deg);
        }

        @keyframes celebrationFloat {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) scale(0);
            opacity: 0;
          }
        }
        .celebration-particle {
          animation: celebrationFloat 2s ease-in forwards;
        }
      `}</style>

      {showCelebration && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {particles.map((particle) => (
            <div
              key={particle.id}
              className="celebration-particle absolute text-3xl"
              style={{
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                animationDelay: `${particle.delay}s`
              }}
            >
              ✨
            </div>
          ))}
        </div>
      )}

      <div
        className="fixed top-0 left-0 right-0 z-30"
        style={{
          backgroundColor: colors.header,
          boxShadow: '0 10px 25px -15px rgba(0, 0, 0, 0.45)'
        }}
      >
        <div className="px-6 py-3 flex justify-between items-center gap-3" title={hijriDate || undefined}>
          <button
            onClick={() => {
              if (isDrawerOpen) {
                setIsDrawerOpen(false);
                return;
              }
              if (currentZikr && isZikrSaved(currentZikr)) {
                setSearchQuery('');
                setSelectedCategoryId(null);
                setDrawerFilter('saved');
                setIsDrawerOpen(true);
                return;
              }
              const lastFilter = localStorage.getItem('drawerLastFilter');
              if (lastFilter === 'saved') {
                setSearchQuery('');
                setSelectedCategoryId(null);
                setDrawerFilter('saved');
                setIsDrawerOpen(true);
                return;
              }
              if (currentZikr?.categoryId) {
                setSearchQuery('');
                setSelectedCategoryId(currentZikr.categoryId);
                setDrawerFilter('category');
                setActiveCategoryId(currentZikr.categoryId);
                setIsDrawerOpen(true);
                return;
              }
              openDrawerByCurrentTime();
            }}
            className="p-2 rounded-lg transition-all duration-300 hover:opacity-80 active:scale-95"
            style={{ 
              backgroundColor: colors.accent,
              color: colors.text
            }}
            title={t.azkarIndex}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 text-center px-2">
            <p
              className="font-bold text-lg leading-relaxed"
              style={{ color: colors.text, fontFamily: "'MadinetAlBat', 'Cairo', 'Segoe UI', sans-serif" }}
            >
              {dayName} {hijriDay} {hijriMonth} {hijriYear}
            </p>
          </div>
          <button
            onClick={() => {
              if (showSettings) {
                window.history.back();
              } else {
                setShowSettings(true);
              }
            }}
            className="p-2 rounded-lg transition-all duration-300 hover:opacity-80 active:scale-95"
            style={{ 
              backgroundColor: colors.accent,
              color: colors.text
            }}
            title={t.settings}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Overlay backdrop for Drawer */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity duration-300"
          onClick={() => window.history.back()}
        />
      )}

      {/* Drawer for Zikr Index */}
      <div
        className={`fixed inset-y-0 right-0 w-full max-w-md z-50 transition-transform duration-300 ease-in-out ${
          isDrawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          backgroundColor: colors.background,
          boxShadow: isDrawerOpen ? '-4px 0 20px rgba(0, 0, 0, 0.3)' : 'none'
        }}
      >
        
        <div className="h-full flex flex-col overflow-hidden">
          {/* Drawer Header */}
          <div
            className="p-4 border-b"
            style={{
              backgroundColor: colors.header,
              borderColor: colors.accent
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2
                  className="text-2xl font-bold flex items-center gap-2"
                  style={{ color: colors.text }}
                >
                  {drawerFilter !== 'index' && (
                    <button
                      onClick={() => window.history.back()}
                      className="p-2 rounded-lg transition-all duration-300 hover:opacity-80 active:scale-95"
                      style={{
                        backgroundColor: colors.accent,
                        color: colors.text
                      }}
                      title={t.backToIndex}
                      aria-label={t.backToIndex}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                  {drawerFilter === 'morning' && (
                    <>
                      <SunIcon color={colors.text} />
                      <span>{t.morningAzkar}</span>
                    </>
                  )}
                  {drawerFilter === 'evening' && (
                    <>
                      <MoonIcon color={colors.text} />
                      <span>{t.eveningAzkar}</span>
                    </>
                  )}
                  {drawerFilter === 'index' && <span>{t.azkarIndex}</span>}
                  {drawerFilter === 'saved' && <span>{t.savedAzkar}</span>}
                  {drawerFilter === 'category' && (
                    <span>
                      {selectedCategoryId
                        ? getCategoryLabel(
                            azkarCategories.find(c => c.id === selectedCategoryId) ?? {
                              title: '',
                              subtitle: ''
                            },
                            language
                          ) || t.category
                        : t.category}
                    </span>
                  )}
                </h2>
              </div>
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2 min-w-[160px] max-w-[200px]"
                style={{ backgroundColor: colors.card }}
              >
                <SearchIcon className="w-4 h-4" style={{ color: colors.textLight }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="w-full text-sm bg-transparent outline-none"
                  style={{ color: colors.text }}
                />
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  className="p-1 rounded-lg transition-all duration-300 hover:opacity-80 active:scale-95"
                  style={{ color: colors.textLight }}
                  title={searchQuery.trim() ? t.clearSearch : t.close}
                  aria-label={searchQuery.trim() ? t.clearSearch : t.close}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Drawer Content - Scrollable List */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {(() => {
                if (searchQuery.trim()) {
                  const normalizedQuery = normalizeArabicForSearch(searchQuery);
                  const matchedCategories = azkarCategories
                    .slice()
                    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                    .filter((c) => {
                      const haystack = normalizeArabicForSearch(`${c.subtitle ?? ''} ${c.title ?? ''}`);
                      return haystack.includes(normalizedQuery);
                    });

                  const matchedAzkar = adhkarItems
                    .slice()
                    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                    .map(toZikr)
                    .filter((zikr) => {
                      const category = zikr.categoryId
                        ? azkarCategories.find((c) => c.id === zikr.categoryId)
                        : undefined;
                      const categoryText = category ? `${category.subtitle ?? ''} ${category.title ?? ''}` : '';
                      const tagsText = Array.isArray(zikr.tags) ? zikr.tags.join(' ') : '';
                      const target = normalizeArabicForSearch(
                        `${zikr.title ?? ''} ${categoryText} ${zikr.arabic} ${zikr.transliteration} ${zikr.translation} ${zikr.reason ?? ''} ${zikr.fadl ?? ''} ${zikr.benefit ?? ''} ${tagsText}`
                      );
                      return target.includes(normalizedQuery);
                    });

                  if (matchedCategories.length === 0 && matchedAzkar.length === 0) {
                    return (
                      <p className="text-sm text-center py-6" style={{ color: colors.textLight }}>
                        {t.noSearchResults}
                      </p>
                    );
                  }

                  return (
                    <>
                      {matchedCategories.length > 0 && (
                        <>
                          <p className="text-xs mb-2" style={{ color: colors.textLight, opacity: 0.85 }}>
                            {t.indexSearchResults}
                          </p>
                          <div className="space-y-3">
                            {matchedCategories.map((category) => (
                              <div
                                key={`cat-search-${category.id}`}
                                onClick={() => {
                                  setSelectedCategoryId(category.id);
                                  setDrawerFilter('category');
                                  setSearchQuery('');
                                }}
                                className="p-4 rounded-2xl cursor-pointer transition-all duration-200 active:scale-95"
                                style={{
                                  backgroundColor: colors.card,
                                  borderRight: `4px solid ${colors.accent}`,
                                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                                }}
                              >
                                <p
                                  className="font-bold mb-1 text-lg"
                                  style={{
                                    color: colors.text,
                                    fontFamily: "'Cairo', 'Segoe UI', sans-serif"
                                  }}
                                >
                                  {getCategoryLabel(category, language)}
                                </p>
                                {getCategorySubLabel(category, language) && (
                                  <p className="text-xs" style={{ color: colors.textLight }}>
                                    {getCategorySubLabel(category, language)}
                                  </p>
                                )}
                                <p className="text-xs mt-2" style={{ color: colors.textLight }}>
                                  {t.adhkarCount}: {adhkarItems.filter(a => a.categoryId === category.id).length}
                                </p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {matchedAzkar.length > 0 && (
                        <>
                          <p
                            className="text-xs mt-4 mb-2"
                            style={{ color: colors.textLight, opacity: 0.85 }}
                          >
                            {t.azkarSearchResults}
                          </p>
                          {matchedAzkar.map((zikr, index) => (
                            <div
                              key={`search-${index}-${zikr.arabic.slice(0, 12)}`}
                              onClick={() => selectZikrFromDrawer(zikr)}
                              className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 active:scale-95 ${
                                currentZikr.arabic === zikr.arabic ? 'ring-2' : ''
                              }`}
                              style={{
                                backgroundColor: currentZikr.arabic === zikr.arabic ? colors.accent : colors.card,
                                borderRight: `4px solid ${currentZikr.arabic === zikr.arabic ? colors.text : colors.accent}`,
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p
                                  className="font-semibold mb-2 text-lg flex-1"
                                  dir="rtl"
                                  style={{
                                    color: colors.text,
                                    fontFamily: "'Cairo', 'Segoe UI', sans-serif",
                                    direction: 'rtl',
                                    textAlign: 'right'
                                  }}
                                >
                                  {zikr.arabic}
                                </p>
                                {typeof zikr.count === 'number' && zikr.count > 1 && (
                                  <span
                                    className="text-xs px-2 py-1 rounded-full whitespace-nowrap"
                                    style={{
                                      backgroundColor: colors.accent,
                                      color: colors.text,
                                      opacity: 0.85
                                    }}
                                  >
                                    ×{zikr.count}
                                  </span>
                                )}
                              </div>
                              {(() => {
                                const category = zikr.categoryId
                                  ? azkarCategories.find((c) => c.id === zikr.categoryId)
                                  : undefined;
                                const label = category ? getCategoryLabel(category, language).trim() : '';
                                return label ? (
                                  <p className="text-xs mb-1" style={{ color: colors.textLight, opacity: 0.9 }}>
                                    {label}
                                  </p>
                                ) : null;
                              })()}
                              {getZikrTitleLabel(zikr.title, language) && (
                                <p className="text-xs mb-1" style={{ color: colors.textLight, opacity: 0.9 }}>
                                  {getZikrTitleLabel(zikr.title, language)}
                                </p>
                              )}
                              {showTransliteration && zikr.transliteration && (
                                <p className="text-sm italic mb-1" style={{ color: colors.textLight }}>
                                  {zikr.transliteration}
                                </p>
                              )}
                              {showTranslation && zikr.translation && (
                                <p className="text-xs" style={{ color: colors.textLight }}>
                                  {zikr.translation}
                                </p>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  );
                }

                if (drawerFilter === 'saved') {
                  if (savedAzkar.length === 0) {
                    return (
                      <p className="text-sm text-center py-6" style={{ color: colors.textLight }}>
                        {t.noSavedYet}
                      </p>
                    );
                  }

                  return savedAzkar.map((zikr, index) => (
                    <div
                      key={`${zikr.arabic}-${index}`}
                      onClick={() => {
                        selectZikrFromDrawerKeepIndexOpen(zikr);
                      }}
                      className="p-3 rounded-xl cursor-pointer transition-all duration-200 active:scale-95"
                      style={{
                        backgroundColor: colors.card,
                        borderRight: `4px solid ${colors.accent}`,
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                      }}
                    >
                      <p
                        className="text-sm font-semibold"
                        dir="rtl"
                        style={{
                          color: colors.text,
                          fontFamily: "'Cairo', 'Segoe UI', sans-serif",
                          direction: 'rtl',
                          textAlign: 'right'
                        }}
                      >
                        {zikr.arabic}
                      </p>
                    </div>
                  ));
                }

                if (drawerFilter === 'index') {
                  const orderedCategories = azkarCategories
                    .slice()
                    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

                  return (
                    <>
                      <div
                        className="p-4 rounded-2xl"
                        style={{
                          backgroundColor: colors.card,
                          borderRight: `4px solid ${colors.accent}`,
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p
                            className="font-bold text-lg"
                            style={{
                              color: colors.text,
                              fontFamily: "'Cairo', 'Segoe UI', sans-serif"
                            }}
                          >
                            {t.savedSection}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setDrawerFilter('saved');
                              setSelectedCategoryId(null);
                              setSearchQuery('');
                            }}
                            className="text-xs px-3 py-1 rounded-full transition-all duration-200 hover:opacity-90 active:scale-95"
                            style={{
                              backgroundColor: colors.accent,
                              color: colors.text
                            }}
                            title={t.viewAllSaved}
                            aria-label={t.viewAllSaved}
                          >
                            {t.showAll}
                          </button>
                        </div>
                        <p className="text-xs mb-3" style={{ color: colors.textLight }}>
                          {t.countLabel}: {savedAzkar.length}
                        </p>

                        {savedAzkar.length === 0 ? (
                          <p className="text-sm text-center py-2" style={{ color: colors.textLight }}>
                            {t.noSavedYet}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {savedAzkar.slice(0, 6).map((zikr, index) => (
                              <div
                                key={`saved-in-index-${zikr.arabic}-${index}`}
                                onClick={() => selectZikrFromDrawer(zikr)}
                                className="p-3 rounded-xl cursor-pointer transition-all duration-200 active:scale-95"
                                style={{
                                  backgroundColor: colors.background,
                                  borderRight: `3px solid ${colors.accent}`
                                }}
                                title={t.openZikr}
                                aria-label={t.openZikr}
                              >
                                <p
                                  className="text-sm font-semibold"
                                  dir="rtl"
                                  style={{
                                    color: colors.text,
                                    fontFamily: "'Cairo', 'Segoe UI', sans-serif",
                                    direction: 'rtl',
                                    textAlign: 'right'
                                  }}
                                >
                                  {zikr.arabic}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {orderedCategories.map((category) => (
                        <div
                          key={category.id}
                          onClick={() => {
                            setSelectedCategoryId(category.id);
                            setSearchQuery('');
                            setDrawerFilter('category');
                          }}
                          className="p-4 rounded-2xl cursor-pointer transition-all duration-200 active:scale-95"
                          style={{
                            backgroundColor: colors.card,
                            borderRight: `4px solid ${colors.accent}`,
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                          }}
                        >
                          <p
                            className="font-bold mb-1 text-lg"
                            style={{
                              color: colors.text,
                              fontFamily: "'Cairo', 'Segoe UI', sans-serif"
                            }}
                          >
                            {getCategoryLabel(category, language)}
                          </p>
                          {getCategorySubLabel(category, language) && (
                            <p className="text-xs" style={{ color: colors.textLight }}>
                              {getCategorySubLabel(category, language)}
                            </p>
                          )}
                          <p className="text-xs mt-2" style={{ color: colors.textLight }}>
                            {t.adhkarCount}: {adhkarItems.filter(a => a.categoryId === category.id).length}
                          </p>
                        </div>
                      ))}
                    </>
                  );
                }

                const getCategoryItems = (categoryId: number) =>
                  adhkarItems
                    .filter((a) => a.categoryId === categoryId)
                    .slice()
                    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

                let listToShow: AdhkarItem[] = [];
                if (drawerFilter === 'morning') {
                  listToShow = getCategoryItems(MORNING_CATEGORY_ID);
                } else if (drawerFilter === 'evening') {
                  listToShow = getCategoryItems(EVENING_CATEGORY_ID);
                } else if (drawerFilter === 'category' && selectedCategoryId) {
                  listToShow = getCategoryItems(selectedCategoryId);
                }

                const filteredZikr = listToShow.map(toZikr);

                return filteredZikr.map((zikr, index) => (
                  <div
                    key={`${drawerFilter}-${index}-${zikr.arabic.slice(0, 12)}`}
                    onClick={() => selectZikrFromDrawer(zikr)}
                    className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 active:scale-95 ${
                      currentZikr.arabic === zikr.arabic ? 'ring-2' : ''
                    }`}
                    style={{
                      backgroundColor: currentZikr.arabic === zikr.arabic ? colors.accent : colors.card,
                      borderRight: `4px solid ${currentZikr.arabic === zikr.arabic ? colors.text : colors.accent}`,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className="font-semibold mb-2 text-lg flex-1"
                        dir="rtl"
                        style={{
                          color: colors.text,
                          fontFamily: "'Cairo', 'Segoe UI', sans-serif",
                          direction: 'rtl',
                          textAlign: 'right'
                        }}
                      >
                        {zikr.arabic}
                      </p>
                      {typeof zikr.count === 'number' && zikr.count > 1 && (
                        <span
                          className="text-xs px-2 py-1 rounded-full whitespace-nowrap"
                          style={{
                            backgroundColor: colors.accent,
                            color: colors.text,
                            opacity: 0.85
                          }}
                        >
                          ×{zikr.count}
                        </span>
                      )}
                    </div>
                    {showTransliteration && zikr.transliteration && (
                      <p className="text-sm italic mb-1" style={{ color: colors.textLight }}>
                        {zikr.transliteration}
                      </p>
                    )}
                    {showTranslation && zikr.translation && (
                      <p className="text-xs" style={{ color: colors.textLight }}>
                        {zikr.translation}
                      </p>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => window.history.back()}
        >
          <style>{`
            .settings-card {
              width: min(94vw, 430px);
              border-radius: 24px;
              padding: 1.25rem;
              backdrop-filter: blur(10px);
              border: 1px solid ${colors.accent}55;
              background: linear-gradient(160deg, ${colors.header}EE, ${colors.card}EE);
              box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
            }

            .settings-title {
              color: ${colors.text};
              font-size: 1.2rem;
              font-weight: 700;
            }

            .settings-line {
              height: 1px;
              border: none;
              background: ${colors.accent}66;
              margin: 0.85rem 0;
            }

            .settings-label {
              color: ${colors.text};
              font-size: 0.92rem;
              font-weight: 600;
              margin-bottom: 0.7rem;
              display: block;
            }

            .glass-radio-group {
              --bg: ${isDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'};
              --text: ${colors.textLight};

              display: flex;
              flex-direction: row;
              direction: ltr;
              position: relative;
              background: var(--bg);
              border-radius: 1rem;
              backdrop-filter: blur(12px);
              box-shadow:
                inset 1px 1px 4px ${rgbaFromHex(colors.text, isDarkMode ? 0.08 : 0.12)},
                inset -1px -1px 6px ${rgbaFromHex('#000000', isDarkMode ? 0.35 : 0.08)},
                0 4px 12px ${rgbaFromHex('#000000', isDarkMode ? 0.28 : 0.12)};
              overflow: hidden;
              width: 100%;
            }

            .glass-radio-group input {
              display: none;
            }

            .glass-radio-group label {
              flex: 1;
              display: flex;
              align-items: center;
              justify-content: center;
              min-width: 80px;
              font-size: 14px;
              padding: 0.8rem 1rem;
              cursor: pointer;
              font-weight: 600;
              letter-spacing: 0.3px;
              color: var(--text);
              position: relative;
              z-index: 2;
              transition: color 0.3s ease-in-out;
            }

            .glass-radio-group label:hover {
              color: ${colors.text};
            }

            .glass-radio-group input:checked + label {
              color: ${colors.text};
              text-shadow: 0 0 12px ${rgbaFromHex(colors.accent, 0.55)};
            }

            .glass-glider {
              position: absolute;
              top: 0;
              bottom: 0;
              left: 0;
              border-radius: 1rem;
              z-index: 1;
              transition:
                transform 0.5s cubic-bezier(0.37, 1.95, 0.66, 0.56),
                background 0.4s ease-in-out,
                box-shadow 0.4s ease-in-out,
                width 0.4s ease-in-out;
            }
          `}</style>
          <div
            className="settings-card mx-4"
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            style={{
              fontFamily:
                language === 'ar'
                  ? "'Cairo', 'Segoe UI', sans-serif"
                  : appFontFamily
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center">
              <h2 className="settings-title">{t.settings}</h2>
              <button
                onClick={() => window.history.back()}
                className="p-1 rounded-lg hover:opacity-80 transition-all"
                style={{ color: colors.text }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <hr className="settings-line" />

            <div>
              <span className="settings-label">{t.language}</span>
              <div className="glass-radio-group lang-group">
                <input
                  type="radio"
                  id="glass-ar"
                  name="app-language"
                  checked={language === 'ar'}
                  onChange={() => setLanguage('ar')}
                />
                <label htmlFor="glass-ar">{t.languageArabic}</label>

                <input
                  type="radio"
                  id="glass-en"
                  name="app-language"
                  checked={language === 'en'}
                  onChange={() => setLanguage('en')}
                />
                <label htmlFor="glass-en">{t.languageEnglish}</label>
                <div
                  className="glass-glider"
                  style={getSettingsGliderStyle(language === 'ar' ? 0 : 1, 2, colors.accent)}
                />
              </div>
            </div>

            <hr className="settings-line" />

            <div>
              <span className="settings-label">{t.appTheme}</span>
              <div className="glass-radio-group">
                <input
                  type="radio"
                  id="glass-system"
                  name="theme-mode"
                  checked={themeMode === 'system'}
                  onChange={() => setThemeMode('system')}
                />
                <label htmlFor="glass-system">{t.themeSystem}</label>

                <input
                  type="radio"
                  id="glass-light"
                  name="theme-mode"
                  checked={themeMode === 'light'}
                  onChange={() => setThemeMode('light')}
                />
                <label htmlFor="glass-light">{t.themeLight}</label>

                <input
                  type="radio"
                  id="glass-dark"
                  name="theme-mode"
                  checked={themeMode === 'dark'}
                  onChange={() => setThemeMode('dark')}
                />
                <label htmlFor="glass-dark">{t.themeDark}</label>
                <div
                  className="glass-glider"
                  style={getSettingsGliderStyle(
                    themeMode === 'system' ? 0 : themeMode === 'light' ? 1 : 2,
                    3,
                    colors.accent,
                    themeMode === 'light' ? 'soft' : themeMode === 'dark' ? 'strong' : 'default'
                  )}
                />
              </div>
              <p className="text-xs mt-2" style={{ color: colors.textLight }}>
                {t.themeCurrentPrefix}
                {themeMode === 'system'
                  ? isDarkMode
                    ? t.themeCurrentSystemDark
                    : t.themeCurrentSystemLight
                  : themeMode === 'dark'
                    ? t.themeCurrentDark
                    : t.themeCurrentLight}
              </p>
            </div>

            <hr className="settings-line" />

            <div>
              <span className="settings-label">{t.fontSize}</span>
              <div className="flex items-center gap-3">
                <span style={{ color: colors.text, fontSize: '0.75rem' }}>{t.fontSmall}</span>
                <input
                  type="range"
                  min="32"
                  max="64"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  style={{
                    flex: 1,
                    accentColor: colors.accent,
                    cursor: 'pointer'
                  }}
                />
                <span style={{ color: colors.text, fontSize: '0.75rem' }}>{t.fontLarge}</span>
              </div>
              <div style={{ color: colors.textLight, fontSize: '0.65rem', marginTop: '0.5rem', textAlign: 'center' }}>
                {fontSize}px
              </div>
            </div>

            <hr className="settings-line" />

            <div>
              <span className="settings-label">{t.historySection}</span>
              <button
                onClick={() => {
                  setShowSettings(false);
                  setIsDrawerOpen(false);
                  setCurrentPage('history');
                }}
                className="w-full p-3 rounded-2xl transition-all duration-300 hover:opacity-90 active:scale-[0.99]"
                style={{
                  backgroundColor: colors.accent,
                  color: colors.text,
                  fontFamily: "'Cairo', 'Segoe UI', sans-serif",
                  fontWeight: 700
                }}
                title={t.openHistory}
                aria-label={t.openHistory}
              >
                {t.historyTitle}
              </button>
              <p className="text-xs mt-2" style={{ color: colors.textLight }}>
                {t.historyHint}
              </p>
            </div>
          </div>
        </div>
      )}

      {showHadithInfo && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          onClick={() => window.history.back()}
          role="dialog"
          aria-modal="true"
          aria-label={t.source}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl p-5 shadow-2xl"
            style={{ backgroundColor: colors.card, color: colors.text }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <h3 className="text-lg font-bold" style={{ fontFamily: "'Cairo', 'Segoe UI', sans-serif" }}>
                {getZikrTitleLabel(currentZikr.title, language) ?? currentZikr.arabic.slice(0, 48)}
              </h3>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="p-1 rounded-lg shrink-0"
                style={{ color: colors.textLight }}
                aria-label={t.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {hasHadithMetadata(currentZikr) ? (
              <div className="space-y-4 text-sm leading-relaxed" style={{ fontFamily: "'Cairo', 'Segoe UI', sans-serif" }}>
                {currentZikr.fadl && (
                  <div>
                    <p className="font-semibold mb-1" style={{ color: colors.accent }}>{t.fadl}</p>
                    <p>{currentZikr.fadl}</p>
                  </div>
                )}
                {currentAuthenticity && (
                  <div>
                    <p className="font-semibold mb-1" style={{ color: colors.accent }}>{t.authenticity}</p>
                    <p>{currentAuthenticity}</p>
                  </div>
                )}
                {currentZikr.benefit && (
                  <div>
                    <p className="font-semibold mb-1" style={{ color: colors.accent }}>{t.source}</p>
                    <p className="whitespace-pre-wrap">{currentZikr.benefit}</p>
                  </div>
                )}
                {currentZikr.reason && (
                  <div>
                    <p className="font-semibold mb-1" style={{ color: colors.accent }}>{t.reason}</p>
                    <p>{currentZikr.reason}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm" style={{ color: colors.textLight }}>{t.noHadithInfo}</p>
            )}
          </div>
        </div>
      )}

      {pullDistance > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 flex items-center justify-center z-40 transition-all duration-200 pointer-events-none p-4"
          style={{
            transform: `translateY(${Math.min(pullDistance, 100)}px)`,
            opacity: Math.min(pullDistance / 80, 1)
          }}
        >
          <div
            className="rounded-2xl p-4 max-w-sm w-full"
            style={{
              backgroundColor: colors.accent,
              color: colors.text,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)'
            }}
          >
            {currentZikr.fadl && (
              <p className="text-xs mb-2 leading-relaxed">
                <span className="font-semibold">{t.fadl}: </span>
                {currentZikr.fadl}
              </p>
            )}
            {currentAuthenticity && (
              <p className="text-xs mb-2 leading-relaxed">
                <span className="font-semibold">{t.authenticity}: </span>
                {currentAuthenticity}
              </p>
            )}
            {currentZikr.benefit && (
              <p className="text-xs mb-2 leading-relaxed whitespace-pre-wrap">
                <span className="font-semibold">{t.source}: </span>
                {currentZikr.benefit}
              </p>
            )}
            {currentZikr.reason && (
              <p className="text-xs leading-relaxed">
                <span className="font-semibold">{t.reason}: </span>
                {currentZikr.reason}
              </p>
            )}
          </div>
        </div>
      )}

      <div
        className={`flex-1 flex items-center justify-center p-4 overflow-auto relative pt-28 pb-36 ${
          isSwipingHorizontal ? 'transition-none' : 'transition-transform duration-300'
        }`}
        style={{
          transform: `translateX(${isDrawerOpen ? horizontalSwipe * 0.3 : horizontalSwipe * 0.5}px)`,
        }}
      >
        {currentPage === 'main' && (
        <div className="w-full max-w-2xl space-y-4">
          {/* Morning/Evening Azkar Box */}
          {(() => {
            const now = new Date();
            const hours = now.getHours();
            const isMorning = hours >= 5 && hours < 15;
            const isEvening = hours >= 15 || hours < 5;

            if (!isMorning && !isEvening) {
              return null;
            }

            const timeOfDay = isMorning ? 'morning' : 'evening';
            const boxId = timeOfDay === 'morning' ? MORNING_AZKAR_READ_ID : EVENING_AZKAR_READ_ID;
            const boxTitle = timeOfDay === 'morning' ? t.morningAzkar : t.eveningAzkar;

            return (
              <div
                className="rounded-3xl shadow-2xl p-6 cursor-pointer"
                style={{
                  backgroundColor: colors.card,
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
                }}
                onClick={() => openDrawerWithFilter(timeOfDay)}
              >
                <label className="container flex items-center gap-4 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={readAzkar.has(boxId)}
                    onChange={(e) => {
                      const newReadAzkar = new Set(readAzkar);
                      if (e.target.checked) {
                        newReadAzkar.add(boxId);
                      } else {
                        newReadAzkar.delete(boxId);
                      }
                      setReadAzkar(newReadAzkar);
                      localStorage.setItem('readAzkar', JSON.stringify([...newReadAzkar]));
                    }}
                  />
                  <span className="checkmark"></span>
                </label>
                <h3 
                  className="text-xl font-bold flex-1 cursor-pointer flex items-center gap-2" 
                  style={{ color: colors.text }}
                  onClick={() => openDrawerWithFilter(timeOfDay)}
                >
                  {timeOfDay === 'morning' ? (
                    <SunIcon color={colors.text} />
                  ) : (
                    <MoonIcon color={colors.text} />
                  )}
                  <span>{boxTitle}</span>
                </h3>
              </div>
            );
          })()}

          {/* Main Zikr Box */}
          {/* Counter above the box */}
          <div className="flex justify-center mb-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ backgroundColor: colors.card }}>
              <p
                className={`font-bold transition-all duration-300 text-lg ${showCelebration ? 'scale-125' : ''}`}
                style={{ color: showCelebration ? colors.accent : colors.textLight }}
              >
                {count}
              </p>
              {targetCount !== null && (
                <p className="text-xs" style={{ color: colors.textLight }}>/ {targetCount}</p>
              )}
              {targetCount === null && count >= 100 && (
                <p className="text-xs" style={{ color: colors.textLight }}>∞</p>
              )}
            </div>
          </div>

          <ElectricBorder
            color={colors.accent}
            borderRadius={24}
            speed={1}
            chaos={showCelebration ? 0.16 : 0.12}
            className={`w-full transition-all duration-300 ${isDarkMode ? 'electric-border--dark' : 'electric-border--light'} ${showCelebration ? 'scale-[1.02]' : ''}`}
            style={{
              transform: pullDistance > 0 ? `translateY(${Math.min(pullDistance * 0.5, 50)}px)` : undefined
            }}
          >
          <div
            onClick={handleZikrClick}
            onTouchStart={(e) => {
              if (e.touches.length === 1) startZikrLongPress();
            }}
            onTouchEnd={endZikrLongPress}
            onTouchCancel={endZikrLongPress}
            onMouseDown={startZikrLongPress}
            onMouseUp={endZikrLongPress}
            onMouseLeave={endZikrLongPress}
            className="p-8 flex flex-col justify-center transition-all duration-300 cursor-pointer active:scale-[0.99] relative"
            style={{
              backgroundColor: colors.card,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)'
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadCurrentZikr();
              }}
              className="absolute top-4 left-4 p-1 rounded-lg transition-all duration-300 hover:opacity-80 active:scale-95"
              style={{
                color: colors.textLight,
                backgroundColor: 'transparent'
              }}
              title={t.downloadZikr}
              aria-label={t.downloadZikr}
            >
              <DownloadIcon color={colors.textLight} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleSaveZikr(currentZikr);
              }}
              className="absolute top-4 left-16 p-1 rounded-lg transition-all duration-300 hover:opacity-80 active:scale-95"
              style={{
                color: isZikrSaved(currentZikr) ? colors.accent : colors.textLight,
                backgroundColor: 'transparent'
              }}
              title={isZikrSaved(currentZikr) ? t.removeSaved : t.saveZikr}
              aria-label={isZikrSaved(currentZikr) ? t.removeSaved : t.saveZikr}
            >
              <Heart className="w-6 h-6" fill={isZikrSaved(currentZikr) ? 'currentColor' : 'none'} />
            </button>

            <div className={`transition-opacity duration-200 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
              {language === 'ar' && (
                <div className="mb-6 mt-4 space-y-4" dir="rtl" style={{ direction: 'rtl' }}>
                  {formatZikrArabicDisplayLines(currentZikr.arabic).map((line, index) => (
                    <p
                      key={`${line.slice(0, 12)}-${index}`}
                      className={`leading-relaxed font-semibold ${isSacredArabicLine(line) ? 'whitespace-nowrap' : ''}`}
                      style={{
                        color: colors.text,
                        fontFamily: "'Cairo', 'Segoe UI', sans-serif",
                        lineHeight: '1.8',
                        fontSize: `${Math.round(getAdaptiveFontSize(currentZikr.arabic, fontSize) * 0.42)}px`,
                        transition: 'font-size 0.3s ease',
                        direction: 'rtl',
                        textAlign: 'right'
                      }}
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-3 text-center">
                {language === 'en' && currentZikr.transliteration && (
                  <p
                    className="text-lg italic"
                    style={{ color: colors.textLight }}
                  >
                    {currentZikr.transliteration}
                  </p>
                )}
                {language === 'en' && currentZikr.translation && (
                  <p
                    className="text-base"
                    style={{ color: colors.textLight }}
                  >
                    {currentZikr.translation}
                  </p>
                )}
              </div>
              {hasHadithMetadata(currentZikr) && (
                <p className="text-center text-xs mt-4" style={{ color: colors.textLight }}>
                  {t.holdForHadith}
                </p>
              )}
            </div>

            {showCelebration && (
              <div
                className="text-center mt-4 text-lg font-bold animate-bounce"
                style={{ color: colors.accent }}
              >
                {t.celebration}
              </div>
            )}
          </div>
          </ElectricBorder>
        </div>
        )}

        {currentPage === 'history' && (
        <div className="w-full max-w-2xl">
          <div
            className="rounded-3xl shadow-2xl p-8"
            style={{
              backgroundColor: colors.card,
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)'
            }}
          >
            <h2 className="text-3xl font-bold mb-6" style={{ color: colors.text }}>
              {t.historyTitle}
            </h2>

            {zikrHistory.length === 0 ? (
              <p className="text-center py-8" style={{ color: colors.textLight }}>
                {t.noHistoryYet}
              </p>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {[...zikrHistory].reverse().map((zikr, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-2xl"
                    style={{
                      backgroundColor: colors.background,
                      borderRight: `4px solid ${colors.accent}`
                    }}
                  >
                    <p
                      className="font-semibold mb-2"
                      dir="rtl"
                      style={{
                        color: colors.text,
                        fontSize: '18px',
                        fontFamily: "'Cairo', 'Segoe UI', sans-serif",
                        direction: 'rtl',
                        textAlign: 'right'
                      }}
                    >
                      {zikr.arabic}
                    </p>
                    {showTransliteration && zikr.transliteration && (
                      <p className="text-sm italic" style={{ color: colors.textLight }}>
                        {zikr.transliteration}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3" style={{ color: colors.text }}>
                {t.savedSection}
              </h3>
              {savedAzkar.length === 0 ? (
                <p className="text-sm" style={{ color: colors.textLight }}>
                  {t.noSavedYet}
                </p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {savedAzkar.map((zikr, index) => (
                    <div
                      key={`${zikr.arabic}-${index}`}
                      onClick={() => openSavedZikr(zikr)}
                      className="p-3 rounded-xl cursor-pointer transition-all duration-200 active:scale-95"
                      style={{
                        backgroundColor: colors.background,
                        borderRight: `4px solid ${colors.accent}`
                      }}
                    >
                      <p
                        className="text-sm font-semibold"
                        dir="rtl"
                        style={{
                          color: colors.text,
                          fontFamily: "'Cairo', 'Segoe UI', sans-serif",
                          direction: 'rtl',
                          textAlign: 'right'
                        }}
                      >
                        {zikr.arabic}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 pt-6 border-t" style={{ borderColor: colors.accent }}>
              <p style={{ color: colors.textLight }} className="text-sm">
                {t.totalRead}: {zikrHistory.length}
              </p>
              <p style={{ color: colors.textLight }} className="text-sm mt-1">
                {t.counterRecords}: {countRecords.length}
              </p>
            </div>

            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-3" style={{ color: colors.text }}>
                {t.completedCounters}
              </h3>
              {countRecords.length === 0 ? (
                <p className="text-sm" style={{ color: colors.textLight }}>
                  {t.noCounterRecords}
                </p>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {[...countRecords].reverse().slice(0, 20).map((record) => (
                    <div
                      key={record.id}
                      className="p-3 rounded-xl"
                      style={{
                        backgroundColor: colors.background,
                        borderRight: `4px solid ${colors.accent}`
                      }}
                    >
                      <p className="text-sm font-semibold" style={{ color: colors.text }}>
                        {record.count} {t.tasbeehCount}
                        {record.target !== null ? ` (${t.targetCount} ${record.target})` : ''}
                      </p>
                      <p
                        className="text-xs mt-1 truncate"
                        style={{ color: colors.textLight, fontFamily: "'Cairo', 'Segoe UI', sans-serif" }}
                        title={record.zikrArabic}
                      >
                        {record.zikrArabic}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        )}
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-30 p-4"
        style={{
          backgroundColor: colors.header,
          boxShadow: '0 -10px 25px -15px rgba(0, 0, 0, 0.45)'
        }}
      >
        <div className="flex gap-3">
          <button
            onClick={getRandomZikr}
            className="font-semibold py-4 px-6 rounded-2xl shadow-lg transition-all duration-300 flex items-center justify-center gap-3 active:scale-95 hover:opacity-90"
            style={{
              backgroundColor: colors.accent,
              color: colors.text,
              flex: '3'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12.9 7.94043L15.52 10.5604C16.29 11.3304 16.29 12.5904 15.52 13.3604L9 19.8704" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 4.04004L10.04 5.08004" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.nextZikr}
          </button>
          <button
            onClick={getPreviousZikr}
            className="font-semibold py-4 px-6 rounded-2xl shadow-lg transition-all duration-300 flex items-center justify-center gap-3 active:scale-95 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: colors.accent,
              color: colors.text,
              border: 'none',
              flex: '1'
            }}
          >
            {t.previousZikr}
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ transform: 'scaleX(-1)' }}>
              <path d="M12.9 7.94043L15.52 10.5604C16.29 11.3304 16.29 12.5904 15.52 13.3604L9 19.8704" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M9 4.04004L10.04 5.08004" stroke="currentColor" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
  }
  
export default App;
