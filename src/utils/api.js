import axios from 'axios';

const TURKISH_MEDICINES = [
  { id: 't1', name: 'Parol', form: 'Tablet', genericName: 'Parasetamol' },
  { id: 't2', name: 'Majezik', form: 'Tablet', genericName: 'Flurbiprofen' },
  { id: 't3', name: 'Arveles', form: 'Tablet', genericName: 'Deksketoprofen' },
  { id: 't4', name: 'Augmentin', form: 'Tablet/Şurup', genericName: 'Amoksisilin' },
  { id: 't5', name: 'Calpol', form: 'Şurup', genericName: 'Parasetamol' },
  { id: 't6', name: 'Dolven', form: 'Şurup', genericName: 'İbuprofen' },
  { id: 't7', name: 'Apranax', form: 'Tablet', genericName: 'Naproksen' },
  { id: 't8', name: 'Aspirin', form: 'Tablet', genericName: 'Asetilsalisilik Asit' },
  { id: 't9', name: 'Nurofen', form: 'Tablet', genericName: 'İbuprofen' },
  { id: 't10', name: 'Lansor', form: 'Kapsül', genericName: 'Lansoprazol' },
  { id: 't11', name: 'Nexium', form: 'Tablet', genericName: 'Esomeprazol' },
  { id: 't12', name: 'Katarin', form: 'Kapsül', genericName: 'Parasetamol/Oksolamin' },
  { id: 't13', name: 'Minoset', form: 'Tablet', genericName: 'Parasetamol' },
  { id: 't14', name: 'Ventolin', form: 'İnhaler (Sprey)', genericName: 'Salbutamol' },
  { id: 't15', name: 'Euthyrox', form: 'Tablet', genericName: 'Levotiroksin' },
  { id: 't16', name: 'Glifor', form: 'Tablet', genericName: 'Metformin' },
  { id: 't17', name: 'Aferin', form: 'Kapsül', genericName: 'Parasetamol/Klorfeniramin' },
  { id: 't18', name: 'Tylolhot', form: 'Saşe (Toz)', genericName: 'Parasetamol' },
  { id: 't19', name: 'Iliadin', form: 'Burun Spreyi', genericName: 'Oksimetazolin' },
  { id: 't20', name: 'Bepanthol', form: 'Krem', genericName: 'Dekspantenol' },
  { id: 't21', name: 'Bricanyl', form: 'Şurup', genericName: 'Terbutalin' },
  { id: 't22', name: 'Voltaren', form: 'Krem/Tablet', genericName: 'Diklofenak' }
];

const translateForm = (engForm) => {
  if (!engForm) return 'Tablet';
  const lower = engForm.toLowerCase();
  if (lower.includes('oral')) return 'Tablet/Şurup';
  if (lower.includes('topical')) return 'Krem/Merhem';
  if (lower.includes('injection')) return 'İğne/Enjeksiyon';
  if (lower.includes('ophthalmic') || lower.includes('drop')) return 'Damla';
  if (lower.includes('nasal')) return 'Burun Spreyi';
  if (lower.includes('dental')) return 'Ağız/Diş';
  return engForm; // fail safe
};

export const searchMedicineFromAPI = async (query) => {
  if (!query || query.length < 2) return [];
  const lowerQuery = query.toLocaleLowerCase('tr-TR');

  try {
    // 1. U.S. FDA ARAMASI (Ücretsiz Global Ağ)
    const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:*${query}*&limit=10`;
    const response = await axios.get(url);
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      return response.data.results.map((item, index) => {
        const brandName = item.openfda?.brand_name?.[0] || query;
        const genericName = item.openfda?.generic_name?.[0] || 'Bilinmiyor';
        const route = item.openfda?.route?.[0] || ''; 
        
        return {
          id: `fda-${index}`,
          name: brandName,
          genericName: genericName,
          form: translateForm(route) // İngilizce -> Türkçe
        };
      });
    }
  } catch (error) {
    // Bulamazsa lokal'e düş
  }

  // 2. Lokal Türkiye Listesi Kurtarıcısı
  return TURKISH_MEDICINES.filter(med => 
    med.name.toLocaleLowerCase('tr-TR').includes(lowerQuery) || 
    (med.genericName && med.genericName.toLocaleLowerCase('tr-TR').includes(lowerQuery))
  );
};

const getDrugDetailsFromName = async (scrapedName) => {
  // Örn scrapedName: "PAROL 500 MG 30 TABLET"
  const cleanName = scrapedName.split(' ')[0]; // "PAROL"
  
  // Önce Lokal'de var mı bak (Kesin Türkçe için)
  const lowerQuery = cleanName.toLocaleLowerCase('tr-TR');
  const found = TURKISH_MEDICINES.find(med => med.name.toLocaleLowerCase('tr-TR').includes(lowerQuery));
  if (found) return found;

  // Lokal'de yoksa OpenFDA üzerinden İngilizce etken ara
  try {
     const url = `https://api.fda.gov/drug/label.json?search=openfda.brand_name:*${cleanName}*&limit=1`;
     const response = await axios.get(url);
     if (response.data && response.data.results) {
        const item = response.data.results[0];
        return {
          id: `fda-scraped-${Date.now()}`,
          name: scrapedName, // Tam uzun ismini gösterelim
          genericName: item.openfda?.generic_name?.[0] || 'Web Tarama Sonucu',
          form: translateForm(item.openfda?.route?.[0] || '')
        };
     }
  } catch(e){}

  // İkisinde de yoksa bile, "Web Kazımasından" bulduğumuz ham (raw) veriyi verelim! Kullanıcı çok sevecek.
  return {
    id: `scraped-${Date.now()}`,
    name: scrapedName,
    genericName: 'Barkod Tarama Sonucu',
    form: scrapedName.toLowerCase().includes('şurup') ? 'Şurup' : 'Tablet'
  };
}

export const searchBarcodeFromAPI = async (barcode) => {
  if (!barcode) return null;

  // HACKER MODE: Halka Açık Web Sitelerini Görünmez Olarak Kazıma (Scraping)
  try {
    // Yöntem 1: barkodoku.com Kazıması
    const res = await axios.get(`https://barkodoku.com/${barcode}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    
    // HTML İçindeki <title>Barkod: 869.. - İLAÇ ADI | ... </title> tagını sök
    const titleMatch = res.data.match(/<title>(.*?)<\/title>/is);
    if (titleMatch && titleMatch[1]) {
      let title = titleMatch[1].trim();
      // Barkodoku kelimelerini atıp sadece ilaç ismini bırakıyoruz
      title = title.replace(/Barkod|Numarası|:|Barkodoku\.com|-|[0-9]{10,13}/gi, '').trim();
      
      if (title.length > 2) {
         return getDrugDetailsFromName(title);
      }
    }
  } catch(e) {
    console.error("Barkodoku scraping fail:", e.message);
  }

  try {
    // Yöntem 2: Hızlı DuckDuckGo HTML Kazıması
    const res2 = await axios.get(`https://html.duckduckgo.com/html/?q=${barcode} ilac`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    // Arama sonucu özetlerini sök
    const snippetMatch = res2.data.match(/class="result__snippet[^>]*>(.*?)<\/a>/is);
    if(snippetMatch && snippetMatch[1]) {
       // Tagleri temizle, ilk kelimeleri al
       const cleanText = snippetMatch[1].replace(/<\/?[^>]+(>|$)/g, "");
       if (cleanText.length > 2) {
          // Çok karmaşık olmasın diye ilk 4 kelimeyi çekiyoruz (Örn: Parol 500mg 20 tb)
          const words = cleanText.split(' ').slice(0, 4).join(' ');
          return getDrugDetailsFromName(words);
       }
    }
  } catch(e) {
    console.error("DuckDuckGo scraping fail:", e.message);
  }

  return null;
};
