/**
 * Türkiye İlaç Takip Sistemi (İTS) / GS1-128 Karekod Çözümleyici
 * Format: (01)GTIN (21)Serial (17)Expiry (10)Lot
 * Örnek: 0108699508012015211234567890121725123110ABC123
 */

export const parseITSBarcode = (barcode) => {
  if (!barcode) return null;

  const result = {
    gtin: null,
    expiryDate: null,
    lot: null,
    serial: null,
    raw: barcode
  };

  const cleaned = barcode.replace(/[^\x20-\x7E]/g, '');

  const gtinIndex = cleaned.indexOf('01');
  if (gtinIndex !== -1) {
    const rawGtin = cleaned.substring(gtinIndex + 2, gtinIndex + 16);
    result.gtin = rawGtin.startsWith('0') ? rawGtin.substring(1) : rawGtin;
    
    // expiry aramaya GTIN'den sonra başla
    const searchAfterIndex = gtinIndex + 16;
    const expiryIndex = cleaned.indexOf('17', searchAfterIndex);
    
    if (expiryIndex !== -1) {
      const yy = cleaned.substring(expiryIndex + 2, expiryIndex + 4);
      const mm = cleaned.substring(expiryIndex + 4, expiryIndex + 6);
      const dd = cleaned.substring(expiryIndex + 6, expiryIndex + 8);
      
      const numDd = parseInt(dd, 10);
      const numMm = parseInt(mm, 10);
      
      if (!isNaN(numDd) && !isNaN(numMm) && numDd <= 31 && numMm <= 12) {
         result.expiryDate = `${dd}.${mm}.20${yy}`;
      }
    }
  }
  
  return (result.gtin || result.expiryDate) ? result : null;
};
