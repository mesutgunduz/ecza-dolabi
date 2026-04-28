import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from './firebase';
import { collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, query } from 'firebase/firestore';

export const FAMILY_KEY = 'FAMILY_CODE';

const normalizeFamilyCode = (code) => String(code || '').trim().toUpperCase();

const getFamilyDocRef = (code) => doc(db, 'families', normalizeFamilyCode(code));

const verifyLegacyAdminPin = async (normalizedCode, adminPin) => {
  const personsSnap = await getDocs(query(collection(db, 'families', normalizedCode, 'persons')));
  const admins = personsSnap.docs
    .map((d) => d.data())
    .filter((p) => p?.canSeeAll === true);

  const adminsWithPin = admins.filter((p) => String(p?.pin || '').trim().length > 0);
  if (adminsWithPin.length === 0) {
    return { ok: false, reason: 'admin-pin-not-configured' };
  }

  const entered = String(adminPin || '').trim();
  if (!entered) return { ok: false, reason: 'admin-pin-required' };

  const matched = adminsWithPin.some((p) => String(p.pin).trim() === entered);
  if (!matched) return { ok: false, reason: 'admin-pin-invalid' };

  return { ok: true };
};

const hasLegacyFamilyData = async (code) => {
  const normalized = normalizeFamilyCode(code);
  const checks = ['persons', 'meds', 'logs'];

  for (const key of checks) {
    const snap = await getDocs(query(collection(db, 'families', normalized, key)));
    if (!snap.empty) return true;
  }

  return false;
};

export const createFamily = async (code, password) => {
  const normalized = normalizeFamilyCode(code);
  const pass = String(password || '').trim();

  if (normalized.length < 4) return { ok: false, reason: 'invalid-code' };
  if (pass.length < 4) return { ok: false, reason: 'invalid-password' };

  const familyRef = getFamilyDocRef(normalized);
  const existing = await getDoc(familyRef);
  if (existing.exists()) return { ok: false, reason: 'code-exists' };

  const legacyExists = await hasLegacyFamilyData(normalized);
  if (legacyExists) return { ok: false, reason: 'code-exists' };

  await setDoc(familyRef, {
    familyCode: normalized,
    familyPassword: pass,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { ok: true };
};

export const loginToFamily = async (code, password, adminPin = '') => {
  const normalized = normalizeFamilyCode(code);
  const pass = String(password || '').trim();

  if (normalized.length < 4) return { ok: false, reason: 'invalid-code' };
  if (pass.length < 4) return { ok: false, reason: 'invalid-password' };

  const familyRef = getFamilyDocRef(normalized);
  const existing = await getDoc(familyRef);

  if (existing.exists()) {
    const data = existing.data() || {};
    const storedPassword = String(data.familyPassword || '');

    if (!storedPassword) {
      const pinCheck = await verifyLegacyAdminPin(normalized, adminPin);
      if (!pinCheck.ok) return pinCheck;

      await updateDoc(familyRef, { familyPassword: pass, updatedAt: Date.now() });
      return { ok: true, migratedLegacy: true };
    }

    if (storedPassword !== pass) return { ok: false, reason: 'wrong-password' };
    return { ok: true };
  }

  const legacyExists = await hasLegacyFamilyData(normalized);
  if (!legacyExists) return { ok: false, reason: 'not-found' };

  const pinCheck = await verifyLegacyAdminPin(normalized, adminPin);
  if (!pinCheck.ok) return pinCheck;

  // Legacy migration: existing family data had no root auth doc.
  await setDoc(familyRef, {
    familyCode: normalized,
    familyPassword: pass,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    migratedFromLegacy: true,
  }, { merge: true });

  return { ok: true, migratedLegacy: true };
};

export const changeFamilyPassword = async (currentPassword, newPassword) => {
  const code = await getFamilyCode();
  if (!code) return { ok: false, reason: 'no-family' };

  const current = String(currentPassword || '').trim();
  const next = String(newPassword || '').trim();
  if (next.length < 4) return { ok: false, reason: 'invalid-password' };

  const familyRef = getFamilyDocRef(code);
  const existing = await getDoc(familyRef);
  if (!existing.exists()) return { ok: false, reason: 'not-found' };

  const data = existing.data() || {};
  const storedPassword = String(data.familyPassword || '');

  if (storedPassword && storedPassword !== current) {
    return { ok: false, reason: 'wrong-password' };
  }

  await updateDoc(familyRef, { familyPassword: next, updatedAt: Date.now() });
  return { ok: true };
};

// --- AUTH & CONFIG ---
export const setFamilyCode = async (code) => {
  const normalized = normalizeFamilyCode(code);
  if (normalized) await AsyncStorage.setItem(FAMILY_KEY, normalized);
};

export const getFamilyCode = async () => {
  return await AsyncStorage.getItem(FAMILY_KEY);
};

export const clearFamilyCode = async () => {
  await AsyncStorage.removeItem(FAMILY_KEY);
};

// --- ACTIVE PERSON (Aktif Profil) ---
export const ACTIVE_PERSON_KEY = 'ACTIVE_PERSON_ID';
export const NOTIFICATION_TARGET_PERSON_IDS_KEY = 'NOTIFICATION_TARGET_PERSON_IDS';
export const DAY_ROLLOVER_KEY = 'DAY_ROLLOVER_TIME';
export const SNOOZE_BEFORE_MINUTES_KEY = 'SNOOZE_BEFORE_MINUTES';
export const SNOOZE_AFTER_MINUTES_KEY = 'SNOOZE_AFTER_MINUTES';
const LEGACY_REORDER_CART_KEY = 'REORDER_CART_ITEMS';
const DEFAULT_SNOOZE_BEFORE_MINUTES = 60;
const DEFAULT_SNOOZE_AFTER_MINUTES = 120;

const getReorderCartDocRef = (code) => doc(db, 'families', normalizeFamilyCode(code), 'meta', 'reorderCart');

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
  await AsyncStorage.removeItem(NOTIFICATION_TARGET_PERSON_IDS_KEY);
  await AsyncStorage.removeItem(DAY_ROLLOVER_KEY);
  await AsyncStorage.removeItem(SNOOZE_BEFORE_MINUTES_KEY);
  await AsyncStorage.removeItem(SNOOZE_AFTER_MINUTES_KEY);
};

const sanitizePersonIdList = (personIds) => {
  if (!Array.isArray(personIds)) return [];
  return [...new Set(
    personIds
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )];
};

export const setNotificationTargetPersonIds = async (personIds) => {
  const sanitized = sanitizePersonIdList(personIds);
  await AsyncStorage.setItem(NOTIFICATION_TARGET_PERSON_IDS_KEY, JSON.stringify(sanitized));
  return sanitized;
};

export const getNotificationTargetPersonIds = async (fallbackPersonId = null) => {
  const raw = await AsyncStorage.getItem(NOTIFICATION_TARGET_PERSON_IDS_KEY);

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const sanitized = sanitizePersonIdList(parsed);
      return sanitized;
    } catch (_) {}
  }

  const fallback = String(fallbackPersonId || '').trim();
  return fallback ? [fallback] : [];
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

export const getReorderCartItems = async () => {
  try {
    const code = await getFamilyCode();
    if (!code) return [];

    const cartRef = getReorderCartDocRef(code);
    const snap = await getDoc(cartRef);

    if (snap.exists()) {
      const items = snap.data()?.items;
      return Array.isArray(items) ? items : [];
    }

    // One-time migration from old local storage key.
    const legacyRaw = await AsyncStorage.getItem(LEGACY_REORDER_CART_KEY);
    const legacyItems = legacyRaw ? JSON.parse(legacyRaw) : [];
    if (Array.isArray(legacyItems) && legacyItems.length > 0) {
      await setDoc(cartRef, { items: legacyItems, updatedAt: Date.now() }, { merge: true });
      return legacyItems;
    }

    return [];
  } catch (e) {
    console.error('getReorderCartItems failed:', e);
    return [];
  }
};

export const saveReorderCartItems = async (items) => {
  try {
    const code = await getFamilyCode();
    if (!code) return;

    const nextItems = Array.isArray(items) ? items : [];
    const cartRef = getReorderCartDocRef(code);
    await setDoc(cartRef, { items: nextItems, updatedAt: Date.now() }, { merge: true });
  } catch (e) {
    console.error('saveReorderCartItems failed:', e);
    throw e;
  }
};

export const clearReorderCartItems = async () => {
  await saveReorderCartItems([]);
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
    await addDoc(collection(db, "families", code, "persons"), {
      receivesNotifications: true,
      ...person,
    });
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

  const logRef = doc(db, "families", code, "logs", id);
  const logSnap = await getDoc(logRef);
  const logData = logSnap.exists() ? logSnap.data() : null;

  // If a usage log is deleted, return consumed amount back to stock.
  if (logData?.medId) {
    const medRef = doc(db, "families", code, "meds", logData.medId);
    const medSnap = await getDoc(medRef);
    if (medSnap.exists()) {
      const medData = medSnap.data();
      const currentQty = parseFloat(medData?.quantity || 0);
      const consumedQty = parseFloat(logData?.dosage || 1);
      const restoredQty = currentQty + (Number.isFinite(consumedQty) ? consumedQty : 1);
      await updateDoc(medRef, { quantity: restoredQty.toString() });
    }
  }

  await deleteDoc(logRef);
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
