const GS = String.fromCharCode(29);

const FIXED_LENGTH_AIS = {
  '00': 18,
  '01': 14,
  '02': 14,
  '11': 6,
  '15': 6,
  '17': 6,
  '20': 2,
};

const VARIABLE_LENGTH_AIS = new Set(['10', '21']);

const normalizeBarcode = (barcode) => {
  if (!barcode) return '';

  return barcode
    .replace(/\u001d/g, GS)
    .replace(/\(\s*/g, '')
    .replace(/\s*\)/g, '')
    .replace(/[\r\n\t]/g, '')
    .trim();
};

const readVariableValue = (source, startIndex) => {
  let endIndex = source.length;

  const gsIndex = source.indexOf(GS, startIndex);
  if (gsIndex !== -1) {
    endIndex = gsIndex;
  }

  return {
    value: source.slice(startIndex, endIndex),
    nextIndex: endIndex === gsIndex ? endIndex + 1 : endIndex,
  };
};

const readFixedValue = (source, startIndex, length) => ({
  value: source.slice(startIndex, startIndex + length),
  nextIndex: startIndex + length,
});

const inferFormFromName = (name = '') => {
  const lower = name.toLocaleLowerCase('tr-TR');
  if (lower.includes('şurup') || lower.includes('surup')) return 'Şurup';
  if (lower.includes('kapsül') || lower.includes('kapsul')) return 'Kapsül';
  if (lower.includes('sprey')) return 'Sprey';
  if (lower.includes('damla')) return 'Damla';
  if (lower.includes('krem') || lower.includes('merhem')) return 'Krem';
  return 'Tablet';
};

export const parseITSBarcode = (barcode) => {
  const raw = normalizeBarcode(barcode);
  if (!raw) return null;

  const result = {
    raw,
    gtin: '',
    serial: '',
    batch: '',
    expiryDate: '',
  };

  let index = raw.startsWith('01') ? 0 : raw.indexOf('01');
  if (index < 0) index = 0;

  while (index < raw.length - 1) {
    const ai = raw.slice(index, index + 2);
    index += 2;

    if (FIXED_LENGTH_AIS[ai]) {
      const { value, nextIndex } = readFixedValue(raw, index, FIXED_LENGTH_AIS[ai]);
      index = nextIndex;

      if (ai === '01') result.gtin = value;
      if (ai === '17' && /^\d{6}$/.test(value)) {
        const yy = value.slice(0, 2);
        const mm = value.slice(2, 4);
        const dd = value.slice(4, 6);
        result.expiryDate = `${dd}.${mm}.20${yy}`;
      }
      continue;
    }

    if (VARIABLE_LENGTH_AIS.has(ai)) {
      const { value, nextIndex } = readVariableValue(raw, index);
      index = nextIndex;

      if (ai === '10') result.batch = value;
      if (ai === '21') result.serial = value;
      continue;
    }

    index -= 1;
  }

  return (result.gtin || result.expiryDate || result.batch || result.serial) ? result : null;
};

export const buildMedicineFromBarcodeData = (lookup = {}, parsed = null) => {
  const name = lookup.name || '';
  const form = lookup.form || inferFormFromName(name);

  return {
    name,
    form,
    expiryDate: lookup.expiryDate || parsed?.expiryDate || '',
    gtin: lookup.gtin || parsed?.gtin || '',
    serial: lookup.serial || parsed?.serial || '',
    batch: lookup.batch || parsed?.batch || '',
  };
};
