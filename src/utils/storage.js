import AsyncStorage from '@react-native-async-storage/async-storage';

export const KEYS = {
  PERSONS: '@persons',
  MEDS: '@meds',
  SCHEDULES: '@schedules',
  LOGS: '@logs' // Daily consumption logs
};

const getData = async (key) => {
  try {
    const json = await AsyncStorage.getItem(key);
    return json ? JSON.parse(json) : [];
  } catch (e) {
    console.error('Storage get error', e);
    return [];
  }
};

const storeData = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Storage set error', e);
  }
};

export const generateId = () => Math.random().toString(36).substring(2, 9);

// Persons
export const getPersons = () => getData(KEYS.PERSONS);
export const addPerson = async (personData) => {
  const persons = await getPersons();
  const newPerson = { id: generateId(), ...personData };
  await storeData(KEYS.PERSONS, [...persons, newPerson]);
  return newPerson;
};
export const editPerson = async (id, updatedData) => {
  const persons = await getPersons();
  const index = persons.findIndex(p => p.id === id);
  if (index !== -1) {
    persons[index] = { ...persons[index], ...updatedData };
    await storeData(KEYS.PERSONS, persons);
  }
};
export const deletePerson = async (id) => {
  const persons = await getPersons();
  await storeData(KEYS.PERSONS, persons.filter(p => p.id !== id));
};

// Medicines
export const getMeds = () => getData(KEYS.MEDS);
export const addMed = async (medData) => {
  const meds = await getMeds();
  const newMed = { id: generateId(), ...medData };
  await storeData(KEYS.MEDS, [...meds, newMed]);
  return newMed;
};
export const editMed = async (id, updatedData) => {
  const meds = await getMeds();
  const index = meds.findIndex(m => m.id === id);
  if (index !== -1) {
    meds[index] = { ...meds[index], ...updatedData };
    await storeData(KEYS.MEDS, meds);
  }
};
export const updateMedQuantity = async (id, decreaseAmount) => {
  const meds = await getMeds();
  const index = meds.findIndex(m => m.id === id);
  if (index !== -1) {
    const currentQ = parseFloat(meds[index].quantity) || 0;
    meds[index].quantity = Math.max(0, currentQ - decreaseAmount).toString();
    await storeData(KEYS.MEDS, meds);
  }
};
export const deleteMed = async (id) => {
  const meds = await getMeds();
  await storeData(KEYS.MEDS, meds.filter(m => m.id !== id));
};

// Logs & Tracking
export const getLogs = () => getData(KEYS.LOGS);
export const markAsTaken = async (medId, personId, dose) => {
  const logs = await getLogs();
  const today = new Date().toISOString().split('T')[0];
  const newLog = {
    id: generateId(),
    date: today,
    medId,
    personId,
    timestamp: new Date().getTime(),
    dose: dose || 1
  };
  await storeData(KEYS.LOGS, [...logs, newLog]);
  
  // Decrease stock
  await updateMedQuantity(medId, dose || 1);
};
export const editLog = async (id, personId, dose, newTimestamp) => {
  const logs = await getLogs();
  const index = logs.findIndex(l => l.id === id);
  if (index !== -1) {
    logs[index].personId = personId;
    logs[index].dose = dose;
    if (newTimestamp) {
      logs[index].timestamp = newTimestamp;
      const tDate = new Date(newTimestamp);
      logs[index].date = tDate.toISOString().split('T')[0];
    }
    await storeData(KEYS.LOGS, logs);
  }
};
export const deleteLog = async (logId) => {
  const logs = await getLogs();
  await storeData(KEYS.LOGS, logs.filter(l => l.id !== logId));
};
