const DATE_PATTERNS = [
  /\b(0?[1-9]|[12]\d|3[01])[./-](0?[1-9]|1[0-2])[./-](20\d{2})\b/,
  /\b(0?[1-9]|1[0-2])[./-](20\d{2})\b/,
];

const IGNORE_LINE_PATTERNS = [
  /gtin/i,
  /seri/i,
  /batch/i,
  /lot/i,
  /parti/i,
  /barkod/i,
  /datamatrix/i,
  /karekod/i,
  /skt/i,
  /exp/i,
  /son kullanma/i,
];

const FORM_KEYWORDS = [
  ['Şurup', /şurup|surup/i],
  ['Kapsül', /kapsül|kapsul/i],
  ['Sprey', /sprey/i],
  ['Damla', /damla/i],
  ['Krem', /krem|merhem|jel/i],
  ['Tablet', /tablet|tb/i],
];

const normalizeText = (text = '') =>
  text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

const normalizeDate = (match) => {
  if (!match) return '';

  if (match.length === 4) {
    const [, day, month, year] = match;
    return `${day.padStart(2, '0')}.${month.padStart(2, '0')}.${year}`;
  }

  if (match.length === 3) {
    const [, month, year] = match;
    return `01.${month.padStart(2, '0')}.${year}`;
  }

  return '';
};

const detectForm = (text) => {
  for (const [form, pattern] of FORM_KEYWORDS) {
    if (pattern.test(text)) return form;
  }
  return '';
};

const scoreMedicineLine = (line) => {
  let score = 0;

  if (/\d+\s?(mg|ml|mcg|g|iu)/i.test(line)) score += 4;
  if (/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(line)) score += 3;
  if (/^[A-ZÇĞİÖŞÜ0-9\s.-]+$/.test(line)) score += 2;
  if (line.length >= 4 && line.length <= 50) score += 2;
  if (detectForm(line)) score += 1;

  return score;
};

export const parseMedicineTextFromOCR = (rawText) => {
  const text = normalizeText(rawText);
  if (!text) return null;

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  let expiryDate = '';
  for (const line of lines) {
    for (const pattern of DATE_PATTERNS) {
      const match = line.match(pattern);
      if (match) {
        expiryDate = normalizeDate(match);
        break;
      }
    }
    if (expiryDate) break;
  }

  const candidates = lines.filter(line => {
    if (line.length < 3) return false;
    if (IGNORE_LINE_PATTERNS.some(pattern => pattern.test(line))) return false;
    return /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(line);
  });

  const bestLine = candidates
    .map(line => ({ line, score: scoreMedicineLine(line) }))
    .sort((a, b) => b.score - a.score)[0]?.line || '';

  const name = bestLine.replace(/\s{2,}/g, ' ').trim();
  const form = detectForm(name || text);

  if (!name && !expiryDate) return null;

  return {
    name,
    expiryDate,
    form,
    rawText: text,
  };
};
