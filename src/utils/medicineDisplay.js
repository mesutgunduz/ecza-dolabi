const WEEKDAY_LABEL_KEYS = {
  0: 'sundayShort',
  1: 'mondayShort',
  2: 'tuesdayShort',
  3: 'wednesdayShort',
  4: 'thursdayShort',
  5: 'fridayShort',
  6: 'saturdayShort',
};

export function translateMedicineUnit(unit, t) {
  const normalized = String(unit || '').trim().toLocaleLowerCase('tr-TR');
  if (!normalized) return '';
  if (normalized === 'adet' || normalized === 'piece' || normalized === 'pieces') {
    return t('pieceUnit');
  }
  return unit;
}

export function translateMedicineForm(form, t) {
  const normalized = String(form || '').trim().toLocaleLowerCase('tr-TR');
  if (!normalized) return t('tablet');
  if (normalized === 'şurup' || normalized === 'surup' || normalized === 'syrup') {
    return t('syrup');
  }
  if (normalized === 'tablet') {
    return t('tablet');
  }
  return form;
}

export function getWeekdayShortLabel(dayValue, t) {
  const key = WEEKDAY_LABEL_KEYS[dayValue];
  return key ? t(key) : '';
}