import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';
import { collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query } from 'firebase/firestore';

export const FAMILY_KEY = 'FAMILY_CODE';

// --- AUTH & CONFIG ---
export const setFamilyCode = async (code) => {
  if (code) await AsyncStorage.setItem(FAMILY_KEY, code.trim().toUpperCase());
};

export const getFamilyCode = async () => {
  return await AsyncStorage.getItem(FAMILY_KEY);
};

export const clearFamilyCode = async () => {
  await AsyncStorage.removeItem(FAMILY_KEY);
};

// --- ACTIVE PERSON (Aktif Profil) ---
export const ACTIVE_PERSON_KEY = 'ACTIVE_PERSON_ID';
export const DAY_ROLLOVER_KEY = 'DAY_ROLLOVER_TIME';
export const SNOOZE_BEFORE_MINUTES_KEY = 'SNOOZE_BEFORE_MINUTES';
export const SNOOZE_AFTER_MINUTES_KEY = 'SNOOZE_AFTER_MINUTES';
const DEFAULT_SNOOZE_BEFORE_MINUTES = 60;
const DEFAULT_SNOOZE_AFTER_MINUTES = 120;

export const setActivePerson = async (personId) => {
  if (personId) await AsyncStorage.setItem(ACTIVE_PERSON_KEY, personId);
};

export const getActivePerson = async () => {
  return await AsyncStorage.getItem(ACTIVE_PERSON_KEY);
};

export const clearActivePerson = async () => {
  await AsyncStorage.removeItem(ACTIVE_PERSON_KEY);
};

export const clearAllData = async () => {
  await AsyncStorage.removeItem(FAMILY_KEY);
  await AsyncStorage.removeItem(ACTIVE_PERSON_KEY);
  await AsyncStorage.removeItem(DAY_ROLLOVER_KEY);
  await AsyncStorage.removeItem(SNOOZE_BEFORE_MINUTES_KEY);
  await AsyncStorage.removeItem(SNOOZE_AFTER_MINUTES_KEY);
};

export const setDayRolloverTime = async (timeStr) => {
  const valid = /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(timeStr || '').trim())
    ? String(timeStr).trim()
    : '00:00';
  await AsyncStorage.setItem(DAY_ROLLOVER_KEY, valid);
};

export const getDayRolloverTime = async () => {
  const stored = await AsyncStorage.getItem(DAY_ROLLOVER_KEY);
  if (!stored) return '00:00';
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(stored) ? stored : '00:00';
};

const clampSnoozeMinutes = (value, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n);
  if (rounded < 0) return 0;
  if (rounded > 24 * 60) return 24 * 60;
  return rounded;
};

export const setSnoozeWindowSettings = async ({ beforeMinutes, afterMinutes }) => {
  const before = clampSnoozeMinutes(beforeMinutes, DEFAULT_SNOOZE_BEFORE_MINUTES);
  const after = clampSnoozeMinutes(afterMinutes, DEFAULT_SNOOZE_AFTER_MINUTES);
  await AsyncStorage.setItem(SNOOZE_BEFORE_MINUTES_KEY, String(before));
  await AsyncStorage.setItem(SNOOZE_AFTER_MINUTES_KEY, String(after));
  return { beforeMinutes: before, afterMinutes: after };
};

export const getSnoozeWindowSettings = async () => {
  const [beforeRaw, afterRaw] = await Promise.all([
    AsyncStorage.getItem(SNOOZE_BEFORE_MINUTES_KEY),
    AsyncStorage.getItem(SNOOZE_AFTER_MINUTES_KEY),
  ]);

  const beforeMinutes = clampSnoozeMinutes(beforeRaw, DEFAULT_SNOOZE_BEFORE_MINUTES);
  const afterMinutes = clampSnoozeMinutes(afterRaw, DEFAULT_SNOOZE_AFTER_MINUTES);

  return { beforeMinutes, afterMinutes };
};

// --- GETTERS ---
export const getMeds = async () => {
  try {
    const code = await getFamilyCode();
    if (!code) return [];
    const q = query(collection(db, "families", code, "meds"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('getMeds failed:', e);
    return [];
  }
};

export const getPersons = async () => {
  try {
    const code = await getFamilyCode();
    if (!code) return [];
    const q = query(collection(db, "families", code, "persons"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('getPersons failed:', e);
    return [];
  }
};

export const getLogs = async () => {
  try {
    const code = await getFamilyCode();
    if (!code) return [];
    const q = query(collection(db, "families", code, "logs"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => {
      const parseDateTime = (dStr, tStr) => {
        const [d, m, y] = (dStr || '').split('.');
        if (!y) return 0;
        return new Date(y, m-1, d).getTime();
      };
      return (b.timestamp || 0) - (a.timestamp || 0) || parseDateTime(b.date, b.time) - parseDateTime(a.date, a.time);
    });
  } catch (e) {
    console.error('getLogs failed:', e);
    return [];
  }
};

export const getBarcodeCatalogEntry = async (gtin) => {
  try {
    const code = await getFamilyCode();
    if (!code || !gtin) return null;

    const ref = doc(db, 'families', code, 'barcodeCatalog', gtin);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    return { id: snap.id, ...snap.data() };
  } catch (e) {
    console.error('getBarcodeCatalogEntry failed:', e);
    return null;
  }
};

export const saveBarcodeCatalogEntry = async (gtin, data) => {
  try {
    const code = await getFamilyCode();
    if (!code || !gtin) return;

    const ref = doc(db, 'families', code, 'barcodeCatalog', gtin);
    await setDoc(ref, {
      gtin,
      ...data,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (e) {
    console.error('saveBarcodeCatalogEntry failed:', e);
    throw e;
  }
};

// --- ADDERS ---
export const addMed = async (med) => {
  try {
    const code = await getFamilyCode();
    if (!code) return;
    await addDoc(collection(db, "families", code, "meds"), { isActive: true, ...med });
  } catch (e) {
    console.error('addMed failed:', e);
    throw e;
  }
};

export const addPerson = async (person) => {
  try {
    const code = await getFamilyCode();
    if (!code) return;
    await addDoc(collection(db, "families", code, "persons"), person);
  } catch (e) {
    console.error('addPerson failed:', e);
    throw e;
  }
};

export const addLog = async (log) => {
  try {
    const code = await getFamilyCode();
    if (!code) return;
    await addDoc(collection(db, "families", code, "logs"), log);
  } catch (e) {
    console.error('addLog failed:', e);
    throw e;
  }
};

// --- EDITORS ---
export const editMed = async (id, data) => {
  try {
    const code = await getFamilyCode();
    if (!code) return;
    await updateDoc(doc(db, "families", code, "meds", id), data);
  } catch (e) {
    console.error('editMed failed:', e);
    throw e;
  }
};

export const editPerson = async (id, data) => {
  try {
    const code = await getFamilyCode();
    if (!code) return;
    await updateDoc(doc(db, "families", code, "persons", id), data);
  } catch (e) {
    console.error('editPerson failed:', e);
    throw e;
  }
};

export const editLog = async (id, data) => {
  try {
    const code = await getFamilyCode();
    if (!code) return;
    await updateDoc(doc(db, "families", code, "logs", id), data);
  } catch (e) {
    console.error('editLog failed:', e);
    throw e;
  }
};

// --- DELETERS ---
export const deleteMed = async (id) => {
  try {
    const code = await getFamilyCode();
    if (!code) return false;
    await deleteDoc(doc(db, "families", code, "meds", id));
    return true;
  } catch (err) {
    console.error("Delete Med Error:", err);
    return false;
  }
};

export const deletePerson = async (id) => {
  const code = await getFamilyCode();
  if (!code) return;
  await deleteDoc(doc(db, "families", code, "persons", id));
};

export const deleteLog = async (id) => {
  const code = await getFamilyCode();
  if (!code) return;
  await deleteDoc(doc(db, "families", code, "logs", id));
};

// --- ACTIONS ---
export const markAsTaken = async (medId, takerId, consumeAmt = 1, medName = null, takerName = null) => {
  try {
    const code = await getFamilyCode();
    if (!code) throw new Error("Aile kodu bulunamadı.");

    const medsData = await getMeds();
    const med = medsData.find(m => m.id === medId);
    
    let finalTakerName = takerName;
    let finalMedName = medName || med?.name || 'İlaç';

    if (!finalTakerName) {
      const persons = await getPersons();
      const taker = persons.find(p => p.id === takerId);
      finalTakerName = taker ? taker.name : 'Bilinmeyen Kullanıcı';
    }

    if (med) {
      let currentQty = parseFloat(med.quantity || 0);
      let newQty = currentQty - consumeAmt;
      if (newQty < 0) newQty = 0;
      await editMed(medId, { quantity: newQty.toString() });
    }

    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getFullYear()}`;
    const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    
    await addLog({
       medId,
       medName: finalMedName,
       personId: takerId,
       takerName: finalTakerName,
       date: dateStr,
       time: timeStr,
       timestamp: now.getTime(),
       dosage: consumeAmt.toString()
    });
    
    return true;
  } catch (error) {
    console.error("MarkAsTaken Error:", error);
    return false;
  }
};

export const repairAllMedsData = async () => {
  try {
    const meds = await getMeds();
    for (const med of meds) {
      let updates = {};
      if (med.unit === 'ml' && med.form === 'Tablet') updates.form = 'Şurup';
      if ((med.unit === 'Adet' || med.unit === 'adet') && med.form === 'Şurup') updates.form = 'Tablet';
      if (!med.form) updates.form = (med.unit === 'ml') ? 'Şurup' : 'Tablet';

      if (Object.keys(updates).length > 0) {
        await editMed(med.id, updates);
      }
    }
  } catch (e) {
    console.error("Repair Error:", e);
  }
};
