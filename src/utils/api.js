import axios from 'axios';
import { buildMedicineFromBarcodeData, parseITSBarcode } from './barcodeParser';

const TITLE_CLEANUPS = [
  /barkod/gi,
  /numarası/gi,
  /barkodoku\.com/gi,
  /ürün bilgileri/gi,
  /ilac/gi,
  /ilaç/gi,
  /eczane/gi,
  /[-|:]/g,
];

const inferForm = (name = '') => {
  const lower = name.toLocaleLowerCase('tr-TR');
  if (lower.includes('şurup') || lower.includes('surup')) return 'Şurup';
  if (lower.includes('kapsül') || lower.includes('kapsul')) return 'Kapsül';
  if (lower.includes('ampul') || lower.includes('enjeksiyon')) return 'Enjeksiyon';
  if (lower.includes('sprey')) return 'Sprey';
  if (lower.includes('damla')) return 'Damla';
  if (lower.includes('krem') || lower.includes('merhem') || lower.includes('jel')) return 'Krem';
  return 'Tablet';
};

const cleanProductName = (text = '', barcode = '') => {
  let cleaned = text.replace(/<[^>]+>/g, ' ').trim();

  TITLE_CLEANUPS.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, ' ');
  });

  if (barcode) {
    cleaned = cleaned.replace(new RegExp(barcode, 'g'), ' ');
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned.length >= 3 ? cleaned : '';
};

const parseHtmlTitle = (html) => {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/is);
  return match?.[1]?.trim() || '';
};

const findProductByBarcode = async (barcode) => {
  const encodedBarcode = encodeURIComponent(barcode);

  const sources = [
    `https://barkodoku.com/${encodedBarcode}`,
    `https://html.duckduckgo.com/html/?q=${encodedBarcode}%20ilac`,
  ];

  for (const url of sources) {
    try {
      const response = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 8000,
      });

      const title = cleanProductName(parseHtmlTitle(response.data), barcode);
      if (title) {
        return {
          name: title,
          form: inferForm(title),
        };
      }
    } catch (error) {
      console.error('Barcode lookup failed:', error.message);
    }
  }

  return null;
};

export const searchBarcodeFromAPI = async (barcode) => {
  if (!barcode) return null;

  const parsed = parseITSBarcode(barcode);
  const normalizedBarcode = parsed?.gtin || barcode.replace(/\D/g, '');
  const lookup = normalizedBarcode ? await findProductByBarcode(normalizedBarcode) : null;

  const medicine = buildMedicineFromBarcodeData(lookup || {}, parsed);
  if (!medicine.name && !medicine.expiryDate && !medicine.gtin) return null;

  return {
    ...medicine,
    name: medicine.name || `İlaç ${medicine.gtin || ''}`.trim(),
  };
};
