/**
 * Merges fadl + Arabic takhrij from ar.json and hisn_almuslim-2.json into src/azkar.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const azkarPath = path.join(root, 'src', 'azkar.json');
const hisnPath = path.join(root, '..', 'hisn_almuslim-2.json');
const arPath = path.join(root, '..', 'ar.json');

const az = JSON.parse(fs.readFileSync(azkarPath, 'utf8'));
const hisn = JSON.parse(fs.readFileSync(hisnPath, 'utf8'));
const arItems = JSON.parse(fs.readFileSync(arPath, 'utf8'));

const norm = (s) =>
  (s ?? '')
    .toString()
    .replace(/[\u0640\u064B-\u065F\u0670\u06D6-\u06ED\sًٌٍَُِّّْ۞*{}«»﴿﴾()[\].,:،؛؟!؟\-]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي');

const isExplanationFootnote = (text) =>
  /^\*/.test(text.trim()) || /^أي\s/.test(text.trim()) || text.includes('يعني');

const buildCategoryMap = () => {
  const map = { 1: 'أذكار الصباح والمساء', 2: 'أذكار الصباح والمساء' };
  for (const c of az.categories) {
    if (map[c.id]) continue;
    const n = norm(c.subtitle);
    const key = Object.keys(hisn).find((k) => {
      if (!hisn[k]?.text) return false;
      const nk = norm(k);
      return nk === n || nk.includes(n.slice(0, 12)) || n.includes(nk.slice(0, 12));
    });
    if (key) map[c.id] = key;
  }
  return map;
};

const catToHisn = buildCategoryMap();

const findHisnMatch = (arabicText, categoryId) => {
  const key = catToHisn[categoryId];
  if (!key || !hisn[key]?.text) return null;
  const texts = hisn[key].text;
  const foots = hisn[key].footnote ?? [];
  const na = norm(arabicText);
  if (!na) return null;

  let bestIdx = -1;
  let bestScore = 0;
  texts.forEach((t, i) => {
    const nt = norm(t);
    if (nt.length < 8) return;
    let score = 0;
    const probe = Math.min(50, nt.length, na.length);
    if (probe >= 20 && (na.includes(nt.slice(0, probe)) || nt.includes(na.slice(0, probe)))) {
      score += 80;
    }
    const min = Math.min(na.length, nt.length, 100);
    for (let j = 0; j < min; j++) {
      if (na[j] === nt[j]) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  });

  if (bestIdx < 0 || bestScore < 45) return null;
  return { footnote: foots[bestIdx] ?? null, score: bestScore };
};

const findArMatch = (arabicText) => {
  const na = norm(arabicText);
  if (!na) return null;
  let best = null;
  let bestScore = 0;
  for (const item of arItems) {
    const nc = norm(item.content);
    if (nc.length < 12) continue;
    let score = 0;
    const probe = Math.min(45, nc.length, na.length);
    if (probe >= 15 && (na.includes(nc.slice(0, probe)) || nc.includes(na.slice(0, probe)))) {
      score += 90;
    }
    const min = Math.min(na.length, nc.length, 80);
    for (let j = 0; j < min; j++) {
      if (na[j] === nc[j]) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 50 ? best : null;
};

const mergeSource = (existing, arSource, hisnFootnote) => {
  const parts = [];
  if (arSource?.trim()) parts.push(arSource.trim());
  if (hisnFootnote?.trim() && !isExplanationFootnote(hisnFootnote)) {
    const foot = hisnFootnote.trim();
    if (!parts.some((p) => p.includes(foot.slice(0, 30)))) parts.push(foot);
  }
  if (parts.length === 0 && existing?.trim()) return existing.trim();
  return parts.length ? parts.join('\n') : null;
};

let stats = { fadl: 0, source: 0, notes: 0 };

for (const item of az.adhkar) {
  const arMatch = item.categoryId <= 2 ? findArMatch(item.arabicText) : null;
  const hisnMatch = findHisnMatch(item.arabicText, item.categoryId);

  const hisnFoot = hisnMatch?.footnote ?? null;
  let footFadl = null;
  let footSource = null;
  if (hisnFoot && !isExplanationFootnote(hisnFoot)) {
    const splitAt = hisnFoot.search(/(?:رواه|أخرجه|روى|انظر|عن\s|سورة\s)/);
    if (splitAt > 24) {
      footFadl = hisnFoot.slice(0, splitAt).trim();
      footSource = hisnFoot.slice(splitAt).trim();
    } else {
      footSource = hisnFoot.trim();
    }
  }

  if (arMatch?.fadl?.trim()) {
    item.fadl = arMatch.fadl.trim();
    stats.fadl++;
  } else if (footFadl) {
    item.fadl = footFadl;
    stats.fadl++;
  } else if (!('fadl' in item)) {
    item.fadl = null;
  }
  if (hisnFoot && isExplanationFootnote(hisnFoot)) {
    const expl = hisnFoot.replace(/^\*\s*/, '').trim();
    item.notes = item.notes ? `${item.notes}\n${expl}` : expl;
    stats.notes++;
  }

  const mergedSource = mergeSource(item.sourceReference, arMatch?.source, footSource ?? hisnFoot);
  if (mergedSource) {
    const looksArabic = /[\u0600-\u06FF]/.test(mergedSource);
    if (looksArabic || !item.sourceReference) {
      item.sourceReference = mergedSource;
      stats.source++;
    }
  }
}

az.seedVersion = (az.seedVersion ?? 0) + 1;
fs.writeFileSync(azkarPath, JSON.stringify(az, null, 2) + '\n', 'utf8');
console.log('Updated azkar.json — seedVersion:', az.seedVersion);
console.log('fadl filled:', stats.fadl, '| Arabic source:', stats.source, '| notes:', stats.notes);
console.log(
  'with sourceReference:',
  az.adhkar.filter((x) => x.sourceReference).length,
  '/',
  az.adhkar.length
);
console.log('with fadl:', az.adhkar.filter((x) => x.fadl).length, '/', az.adhkar.length);
