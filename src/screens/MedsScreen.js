import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, Modal, TextInput, ScrollView, Platform, ActivityIndicator, Switch, StatusBar
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CameraView } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { getMeds, getPersons, addMed, editMed, deleteMed, getBarcodeCatalogEntry, saveBarcodeCatalogEntry } from '../utils/storage';
import { parseITSBarcode } from '../utils/barcodeParser';
import { searchBarcodeFromAPI } from '../utils/api';
import { parseMedicineTextFromOCR } from '../utils/ocrParser';
import { requestNotificationPermissions, scheduleMedReminders, cancelMedReminders } from '../utils/notifications';
import { Plus, Trash2, Edit2, X, Check, Search, Bell, Scan, ScanSearch, Clock, AlertCircle } from 'lucide-react-native';

const defaultBarcodeMeta = { gtin: '', serial: '', batch: '' };
const WEEK_DAY_OPTIONS = [
  { value: 1, label: 'Pzt' },
  { value: 2, label: 'Sal' },
  { value: 3, label: 'Car' },
  { value: 4, label: 'Per' },
  { value: 5, label: 'Cum' },
  { value: 6, label: 'Cmt' },
  { value: 0, label: 'Paz' },
];

export default function MedsScreen() {
  const cameraRef = useRef(null);

  const [meds, setMeds] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMed, setEditingMed] = useState(null);

  const [name, setName] = useState('');
  const [personId, setPersonId] = useState('all');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('Adet');
  const [consumePerUsage, setConsumePerUsage] = useState('1');
  const [dailyDose, setDailyDose] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [formType, setFormType] = useState('Tablet');
  const [scheduleType, setScheduleType] = useState('daily');
  const [weeklyDays, setWeeklyDays] = useState([]);
  const [reminderTimes, setReminderTimes] = useState([]);
  const [isActive, setIsActive] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPerson, setFilterPerson] = useState('all');
  const [barcodeMeta, setBarcodeMeta] = useState(defaultBarcodeMeta);

  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraMode, setCameraMode] = useState('barcode');
  const [ocrLoading, setOcrLoading] = useState(false);

  useEffect(() => {
    const dose = parseInt(dailyDose, 10) || 0;
    setReminderTimes(prev => {
      const next = [...prev];
      if (next.length < dose) {
        for (let i = next.length; i < dose; i++) next.push('');
      } else if (next.length > dose) {
        return next.slice(0, dose);
      }
      return next;
    });
  }, [dailyDose]);

  const loadData = async () => {
    try {
      setLoading(true);
      const m = await getMeds();
      const p = await getPersons();
      setMeds(m);
      setPersons(p);
    } catch (e) {
      console.error('Load Data Error:', e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleTypeChange = (type) => {
    setFormType(type);
    if (type === 'Şurup') {
      setUnit('ml');
      setConsumePerUsage('5');
    } else {
      setUnit('Adet');
      setConsumePerUsage('1');
    }
  };

  const resetForm = () => {
    setEditingMed(null);
    setName('');
    setPersonId('all');
    setQuantity('');
    setUnit('Adet');
    setConsumePerUsage('1');
    setDailyDose('');
    setExpiryDate('');
    setFormType('Tablet');
    setScheduleType('daily');
    setWeeklyDays([]);
    setReminderTimes([]);
    setIsActive(true);
    setBarcodeMeta(defaultBarcodeMeta);
  };

  const openForm = (med = null) => {
    if (med) {
      setEditingMed(med);
      setName(med.name || '');
      setPersonId(med.personId || 'all');
      setQuantity(med.quantity?.toString() || '');
      setUnit(med.unit || 'Adet');
      setConsumePerUsage(med.consumePerUsage?.toString() || '1');
      setDailyDose(med.dailyDose?.toString() || '');
      setExpiryDate(med.expiryDate || '');
      setFormType(med.form || 'Tablet');
      setScheduleType(med.scheduleType === 'weekly' ? 'weekly' : 'daily');
      setWeeklyDays(Array.isArray(med.weeklyDays) ? med.weeklyDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : []);
      setReminderTimes(med.reminderTimes || []);
      setIsActive(med.isActive !== false);
      setBarcodeMeta({
        gtin: med.gtin || '',
        serial: med.serial || '',
        batch: med.batch || '',
      });
    } else {
      resetForm();
    }

    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!name || !quantity) {
      Alert.alert('Hata', 'Gerekli alanları doldurun.');
      return;
    }

    if (scheduleType === 'weekly' && weeklyDays.length === 0) {
      Alert.alert('Hata', 'Haftalık plan için en az bir gun secmelisiniz.');
      return;
    }

    const normalizedWeeklyDays = [...new Set(weeklyDays)]
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b);

    const medData = {
      name,
      personId,
      quantity: quantity.toString(),
      unit,
      consumePerUsage,
      dailyDose: dailyDose || null,
      expiryDate,
      form: formType,
      reminderTimes,
      scheduleType,
      weeklyDays: scheduleType === 'weekly' ? normalizedWeeklyDays : [],
      isActive,
      gtin: barcodeMeta?.gtin || '',
      serial: barcodeMeta?.serial || '',
      batch: barcodeMeta?.batch || '',
    };

    try {
      if (editingMed) {
        await editMed(editingMed.id, medData);
      } else {
        await addMed(medData);
      }

      if (barcodeMeta?.gtin && name.trim()) {
        await saveBarcodeCatalogEntry(barcodeMeta.gtin, {
          name: name.trim(),
          form: formType,
          unit,
          consumePerUsage,
        });
      }

      const hasPerm = await requestNotificationPermissions();
      if (hasPerm && medData.name) {
        const all = await getMeds();
        const current = editingMed
          ? all.find(m => m.id === editingMed.id)
          : [...all].reverse().find(m => m.name === name);
        if (current) {
          if (current.isActive === false) {
            await cancelMedReminders(current);
          } else {
            await scheduleMedReminders(current);
          }
        }
      }

      setModalVisible(false);
      resetForm();
      loadData();
    } catch (e) {
      console.error('Save med failed:', e);
      Alert.alert('Hata', 'İşlem başarısız.');
    }
  };

  const handleDelete = (id) => {
    const performDelete = async () => {
      try {
        const medToDelete = meds.find(m => m.id === id);
        if (medToDelete) {
          await cancelMedReminders(medToDelete);
        }
        const removed = await deleteMed(id);
        if (!removed) throw new Error('Delete failed');
        loadData();
      } catch (e) {
        console.error('Delete med failed:', e);
        Alert.alert('Hata', 'İşlem yapılamadı.');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Bu ilacı dolaptan kaldırmak istiyor musunuz?')) performDelete();
    } else {
      Alert.alert('İlacı Sil', 'Bu ilacı dolaptan kaldırmak istiyor musunuz?', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Sil', style: 'destructive', onPress: performDelete },
      ]);
    }
  };

  const toggleWeeklyDay = (dayValue) => {
    setWeeklyDays((prev) => {
      if (prev.includes(dayValue)) {
        return prev.filter((d) => d !== dayValue);
      }
      return [...prev, dayValue].sort((a, b) => a - b);
    });
  };

  const getScheduleText = (med) => {
    if (med.scheduleType !== 'weekly') return 'Plan: Gunluk';
    const selected = (Array.isArray(med.weeklyDays) ? med.weeklyDays : [])
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (selected.length === 0) return 'Plan: Haftalik (gun secili degil)';
    const dayLabels = WEEK_DAY_OPTIONS.filter((d) => selected.includes(d.value)).map((d) => d.label);
    return `Plan: Haftalik (${dayLabels.join(', ')})`;
  };

  const checkExpiryStatus = (dateStr) => {
    if (!dateStr) return 'ok';

    try {
      const parts = dateStr.split(/[.\-/]/).map(Number);
      let exp;
      if (parts.length === 3) {
        let [d, m, y] = parts;
        if (y < 100) y += 2000;
        exp = new Date(y, m - 1, d);
      } else if (parts.length === 2) {
        let [m, y] = parts;
        if (y < 100) y += 2000;
        exp = new Date(y, m, 0, 23, 59, 59);
      } else {
        return 'ok';
      }
      return exp.getTime() < new Date().getTime() ? 'expired' : 'ok';
    } catch (e) {
      return 'ok';
    }
  };

  const expiredMeds = meds.filter(med => med.isActive !== false && med.expiryDate && checkExpiryStatus(med.expiryDate) === 'expired');

  const openBarcodeScanner = () => {
    setCameraMode('barcode');
    setCameraVisible(true);
  };

  const openOCRScanner = () => {
    setCameraMode('ocr');
    setCameraVisible(true);
  };

  const applyMedicineLookup = (lookup, parsed) => {
    const nextName = lookup?.name || name;
    const nextForm = lookup?.form || formType;
    const nextExpiry = lookup?.expiryDate || parsed?.expiryDate || expiryDate;
    const nextMeta = {
      gtin: lookup?.gtin || parsed?.gtin || '',
      serial: lookup?.serial || parsed?.serial || '',
      batch: lookup?.batch || parsed?.batch || '',
    };

    if (nextName) setName(nextName);
    if (nextExpiry) setExpiryDate(nextExpiry);
    setBarcodeMeta(nextMeta);

    if (nextForm === 'Şurup') {
      handleTypeChange('Şurup');
    } else if (lookup?.form) {
      handleTypeChange('Tablet');
    }

    if (lookup?.unit) setUnit(lookup.unit);
    if (lookup?.consumePerUsage) setConsumePerUsage(String(lookup.consumePerUsage));
  };

  const handleBarcodeScanned = async ({ data }) => {
    setCameraVisible(false);

    try {
      const parsed = parseITSBarcode(data);
      const catalogEntry = parsed?.gtin ? await getBarcodeCatalogEntry(parsed.gtin) : null;
      const lookup = catalogEntry || await searchBarcodeFromAPI(data);

      if (!parsed && !lookup) {
        Alert.alert('Hata', 'Karekod anlaşılamadı. Lütfen tekrar deneyin.');
        return;
      }

      applyMedicineLookup(lookup, parsed);

      const filledFields = [];
      if ((lookup?.name || name)) filledFields.push('ilaç adı');
      if ((lookup?.expiryDate || parsed?.expiryDate || expiryDate)) filledFields.push('son kullanma tarihi');
    } catch (error) {
      console.error('Barcode scan failed:', error);
      Alert.alert('Hata', 'Karekod işlendi ama bilgiler alınamadı.');
    }
  };

  const takeOCRPhoto = async () => {
    try {
      setOcrLoading(true);
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
      setCameraVisible(false);

      if (!photo?.uri) {
        Alert.alert('Hata', 'Fotoğraf alınamadı.');
        return;
      }

      if (Constants.appOwnership === 'expo') {
        Alert.alert(
          'Development Build Gerekli',
          'OCR özelliği Expo Go içinde çalışmaz. Bu özellik için development build ile açmanız gerekir.'
        );
        return;
      }

      let recognizeText;
      try {
        ({ recognizeText } = await import('@infinitered/react-native-mlkit-text-recognition'));
      } catch (error) {
        Alert.alert(
          'Development Build Gerekli',
          'OCR özelliği Expo Go içinde çalışmaz. Bu özellik için development build ile açmanız gerekir.'
        );
        return;
      }

      if (typeof recognizeText !== 'function') {
        Alert.alert(
          'Development Build Gerekli',
          'OCR özelliği Expo Go içinde çalışmaz. Bu özellik için development build ile açmanız gerekir.'
        );
        return;
      }

      const result = await recognizeText(photo.uri);
      const parsed = parseMedicineTextFromOCR(result?.text || '');

      if (!parsed) {
        Alert.alert('Bilgi Bulunamadı', 'Kutudan anlamlı ilaç adı okunamadı. Işığı artırıp kutunun ön yüzünü tekrar çekin.');
        return;
      }

      if (parsed.name) setName(parsed.name);
      if (parsed.expiryDate && !expiryDate) setExpiryDate(parsed.expiryDate);
      if (parsed.form === 'Şurup') handleTypeChange('Şurup');

      const fields = [];
      if (parsed.name) fields.push('ilaç adı');
      if (parsed.expiryDate) fields.push('son kullanma tarihi');

      Alert.alert(
        'OCR Tamamlandı',
        fields.length
          ? `Kutudan şu alanlar okundu: ${fields.join(', ')}.`
          : 'Metin okundu ancak alan doldurulamadı.'
      );
    } catch (error) {
      console.error('OCR failed:', error);
      Alert.alert('Hata', 'OCR işlemi başarısız oldu.');
    } finally {
      setOcrLoading(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;
  }

  const filteredMeds = meds
    .filter(m => {
      const nameMatch = (m.name || '').toLocaleLowerCase('tr-TR').includes(searchTerm.toLocaleLowerCase('tr-TR'));
      const personMatch = filterPerson === 'all' || m.personId === filterPerson || m.personId === 'all';
      return nameMatch && personMatch;
    })
    .sort((a, b) => {
      const aActive = a.isActive !== false ? 1 : 0;
      const bActive = b.isActive !== false ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      return (a.name || '').localeCompare((b.name || ''), 'tr');
    });

  const headerTopInset = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: 12 + headerTopInset }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>İlaç Dolabım</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => openForm()}>
          <Plus color="#fff" size={20} />
          <Text style={styles.addBtnText}>Ekle</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Search color="#9CA3AF" size={20} />
        <TextInput
          style={styles.searchInput}
          placeholder="İlaç ismine göre ara..."
          value={searchTerm}
          onChangeText={setSearchTerm}
        />
      </View>

      {/* Kişi Filtresi */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingRight: 16, alignItems: 'center' }}>
          <TouchableOpacity style={[styles.chip, filterPerson === 'all' && styles.chipActive]} onPress={() => setFilterPerson('all')}>
            <Text style={[styles.chipText, filterPerson === 'all' && styles.chipTextActive]}>Tüm Aile</Text>
          </TouchableOpacity>
          {persons.map(p => (
            <TouchableOpacity key={p.id} style={[styles.chip, filterPerson === p.id && styles.chipActive]} onPress={() => setFilterPerson(p.id)}>
              <Text style={[styles.chipText, filterPerson === p.id && styles.chipTextActive]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {expiredMeds.length > 0 && (
        <View style={styles.alertPanel}>
          <View style={styles.alertHeader}>
            <AlertCircle color="#fff" size={18} />
            <Text style={styles.alertTitle}>SKT'SI GECEN ILACLAR VAR!</Text>
          </View>
          {expiredMeds.map(med => (
            <View key={med.id} style={styles.alertItem}>
              <Text style={styles.alertItemName}>{med.name} - SKT: {med.expiryDate}</Text>
              <TouchableOpacity onPress={() => handleDelete(med.id)} style={styles.alertDeleteBtn}>
                <Text style={styles.alertDeleteText}>Sil</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={filteredMeds}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[styles.card, item.isActive === false && styles.cardInactive]}>
            <View style={styles.content}>
              <View style={styles.medHeader}>
                <Text style={[styles.medName, item.isActive === false && styles.medNameInactive]}>{item.name}</Text>
                <View style={[styles.badge, { backgroundColor: item.form === 'Şurup' ? '#FDF2F8' : '#ECFDF5' }]}>
                  <Text style={[styles.badgeText, { color: item.form === 'Şurup' ? '#DB2777' : '#059669' }]}>{item.form || 'Tablet'}</Text>
                </View>
                <View style={[styles.stateBadge, item.isActive === false ? styles.stateBadgeOff : styles.stateBadgeOn]}>
                  <Text style={[styles.stateBadgeText, item.isActive === false ? styles.stateBadgeTextOff : styles.stateBadgeTextOn]}>
                    {item.isActive === false ? 'Pasif' : 'Aktif'}
                  </Text>
                </View>
              </View>
              <Text style={styles.subText}>Kalan: {item.quantity} {item.unit} | Doz: {item.consumePerUsage}</Text>
              <Text style={styles.ownerLine}>
                Kisi: {item.personId === 'all' ? 'Ortak' : (persons.find(p => p.id === item.personId)?.name || 'Bilinmeyen')}
              </Text>
              <Text style={styles.ownerLine}>{getScheduleText(item)}</Text>

              {Array.isArray(item.reminderTimes) && item.reminderTimes.filter(Boolean).length > 0 && (
                <View style={styles.reminderRow}>
                  {item.reminderTimes.filter(Boolean).map((t, idx) => (
                    <View key={`${item.id}-time-${idx}`} style={styles.timeTag}>
                      <Clock size={11} color="#059669" />
                      <Text style={styles.timeTagText}>{t}</Text>
                    </View>
                  ))}
                </View>
              )}

              {item.expiryDate ? (
                <Text style={[styles.dateText, checkExpiryStatus(item.expiryDate) === 'expired' && styles.expiredText]}>
                  SKT: {item.expiryDate}
                </Text>
              ) : null}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => openForm(item)} style={styles.actionBtn}><Edit2 color="#3B82F6" size={18} /></TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}><Trash2 color="#EF4444" size={18} /></TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <View style={styles.emptyBoxCompact}>
            <Text style={styles.empty}>Seçili filtre için ilaç bulunamadı.</Text>
          </View>
        )}
        contentContainerStyle={{ padding: 12, paddingBottom: 22, flexGrow: 1 }}
      />

      <Modal visible={modalVisible} animationType="slide">
        <SafeAreaView style={styles.modal} edges={['top']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingMed ? 'Düzenle' : 'Yeni İlaç'}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}><X color="#000" size={24} /></TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
            <View style={styles.scanActions}>
              <TouchableOpacity style={styles.scanBtn} onPress={openBarcodeScanner}>
                <Scan color="#fff" size={20} />
                <Text style={styles.scanBtnText}>Karekod Oku</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.scanBtn, styles.ocrBtn]} onPress={openOCRScanner}>
                <ScanSearch color="#fff" size={20} />
                <Text style={styles.scanBtnText}>Kutudan Oku</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>İlaç Adı</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} />

            <View style={styles.row}>
              <TouchableOpacity style={[styles.typeBtn, formType === 'Tablet' && styles.typeBtnActive]} onPress={() => handleTypeChange('Tablet')}>
                <Text style={[styles.typeBtnText, formType === 'Tablet' && styles.typeBtnTextActive]}>Tablet</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.typeBtn, formType === 'Şurup' && styles.typeBtnActive]} onPress={() => handleTypeChange('Şurup')}>
                <Text style={[styles.typeBtnText, formType === 'Şurup' && styles.typeBtnTextActive]}>Şurup</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Stok</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Birim</Text>
                <TextInput style={[styles.input, styles.readonlyInput]} editable={false} value={unit} />
              </View>
            </View>

            <Text style={styles.label}>Kime Ait?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 15 }}>
              <TouchableOpacity style={[styles.chip, personId === 'all' && styles.chipActive]} onPress={() => setPersonId('all')}>
                <Text style={[styles.chipText, personId === 'all' && styles.chipTextActive]}>Ortak</Text>
              </TouchableOpacity>
              {persons.map(p => (
                <TouchableOpacity key={p.id} style={[styles.chip, personId === p.id && styles.chipActive]} onPress={() => setPersonId(p.id)}>
                  <Text style={[styles.chipText, personId === p.id && styles.chipTextActive]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Kullanım Dozu</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="decimal-pad"
                  placeholder="Örn: 0.5"
                  value={consumePerUsage}
                  onChangeText={(val) => setConsumePerUsage(val.replace(',', '.'))}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Günlük Kullanım Adedi</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  placeholder="Örn: 2"
                  value={dailyDose}
                  onChangeText={(val) => setDailyDose(val.replace(/[^0-9]/g, ''))}
                />
              </View>
            </View>

            <Text style={styles.label}>Plan Tipi</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[styles.typeBtn, scheduleType === 'daily' && styles.typeBtnActive]}
                onPress={() => setScheduleType('daily')}
              >
                <Text style={[styles.typeBtnText, scheduleType === 'daily' && styles.typeBtnTextActive]}>Gunluk</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, scheduleType === 'weekly' && styles.typeBtnActive]}
                onPress={() => setScheduleType('weekly')}
              >
                <Text style={[styles.typeBtnText, scheduleType === 'weekly' && styles.typeBtnTextActive]}>Haftalik</Text>
              </TouchableOpacity>
            </View>

            {scheduleType === 'weekly' && (
              <View style={[styles.reminderBox, { marginTop: 2 }]}> 
                <Text style={styles.label}>Kullanim Gunleri</Text>
                <View style={styles.timesWrap}>
                  {WEEK_DAY_OPTIONS.map((day) => {
                    const selected = weeklyDays.includes(day.value);
                    return (
                      <TouchableOpacity
                        key={day.value}
                        style={[styles.weekChip, selected && styles.weekChipActive]}
                        onPress={() => toggleWeeklyDay(day.value)}
                      >
                        <Text style={[styles.weekChipText, selected && styles.weekChipTextActive]}>{day.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.infoSmall}>Ornek: Sali ve Persembe secerek haftalik kullanim plani olusturabilirsiniz.</Text>
              </View>
            )}

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>SKT (GG.AA.YYYY)</Text>
                <TextInput style={[styles.input, styles.compactInput]} placeholder="31.12.2026" value={expiryDate} onChangeText={setExpiryDate} />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Durum</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>{isActive ? 'Aktif' : 'Pasif'}</Text>
                  <Switch
                    value={isActive}
                    onValueChange={setIsActive}
                    trackColor={{ false: '#FCA5A5', true: '#86EFAC' }}
                    thumbColor={isActive ? '#059669' : '#EF4444'}
                  />
                </View>
              </View>
            </View>

            {reminderTimes.length > 0 && (
              <View style={styles.reminderBox}>
                <Text style={styles.label}><Bell size={14} color="#374151" /> Alarm Saatleri</Text>
                <View style={styles.timesWrap}>
                  {reminderTimes.map((time, index) => (
                    <TextInput
                      key={index}
                      style={styles.timeInput}
                      placeholder="09:00"
                      value={time}
                      onChangeText={(val) => {
                        const newTimes = [...reminderTimes];
                        newTimes[index] = val.replace('.', ':');
                        setReminderTimes(newTimes);
                      }}
                      maxLength={5}
                    />
                  ))}
                </View>
                <Text style={styles.infoSmall}>Format: 09:00, 14:30 vb.</Text>
              </View>
            )}

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Check color="#fff" size={24} />
              <Text style={styles.saveBtnText}>Kaydet</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={cameraVisible} animationType="slide">
        <View style={styles.cameraModal}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            onBarcodeScanned={cameraMode === 'barcode' ? handleBarcodeScanned : undefined}
            barcodeScannerSettings={{ barcodeTypes: ['datamatrix', 'qr', 'code128', 'ean13', 'ean8'] }}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerCutout} />
            {cameraMode === 'ocr' ? (
              <TouchableOpacity style={styles.captureBtn} onPress={takeOCRPhoto} disabled={ocrLoading}>
                {ocrLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.captureBtnText}>Fotoğraf Çek</Text>}
              </TouchableOpacity>
            ) : (
              <Text style={styles.overlayHint}>Karekod çerçeveye girince otomatik okunur</Text>
            )}
            <TouchableOpacity style={styles.closeScan} onPress={() => setCameraVisible(false)}>
              <Text style={styles.closeScanText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#111827' },
  addBtn: { marginLeft: 'auto', backgroundColor: '#059669', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 4, fontSize: 14 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 12, marginTop: 12, marginBottom: 0, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', height: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: '#111827' },
  filterBar: { minHeight: 48, justifyContent: 'center' },
  filterScroll: { paddingLeft: 12, marginTop: 8, marginBottom: 4 },
  cardInactive: { opacity: 0.5 },
  medNameInactive: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  compactInput: { height: 40, paddingVertical: 6, marginBottom: 0 },
  switchRow: { height: 40, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 10, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  alertPanel: { backgroundColor: '#EF4444', marginHorizontal: 12, marginTop: 8, borderRadius: 10, overflow: 'hidden' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#DC2626' },
  alertTitle: { color: '#fff', fontWeight: 'bold', marginLeft: 8, fontSize: 12 },
  alertItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.25)' },
  alertItemName: { color: '#fff', fontSize: 12, flex: 1, marginRight: 8 },
  alertDeleteBtn: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  alertDeleteText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  content: { flex: 1 },
  medHeader: { flexDirection: 'row', alignItems: 'center' },
  medName: { fontSize: 16, fontWeight: 'bold', flexShrink: 1, marginRight: 6, color: '#111827' },
  badge: { marginLeft: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  stateBadge: { marginLeft: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  stateBadgeOn: { backgroundColor: '#DCFCE7' },
  stateBadgeOff: { backgroundColor: '#FEE2E2' },
  stateBadgeText: { fontSize: 10, fontWeight: 'bold' },
  stateBadgeTextOn: { color: '#166534' },
  stateBadgeTextOff: { color: '#991B1B' },
  subText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  ownerLine: { fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginTop: 2 },
  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  timeTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 4, marginBottom: 2, borderWidth: 1, borderColor: '#D1D5DB' },
  timeTagText: { fontSize: 10, color: '#059669', fontWeight: 'bold', marginLeft: 3 },
  dateText: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },
  expiredText: { color: '#EF4444', fontWeight: 'bold' },
  actions: { flexDirection: 'row' },
  actionBtn: { padding: 8, marginLeft: 6 },
  emptyBoxCompact: { paddingTop: 24, alignItems: 'center' },
  empty: { textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic' },
  modal: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  scanActions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  scanBtn: { flex: 1, backgroundColor: '#4F46E5', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: 8 },
  ocrBtn: { backgroundColor: '#0F766E' },
  scanBtnText: { color: '#fff', fontWeight: 'bold', marginLeft: 6, fontSize: 13 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#374151', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, marginBottom: 12 },
  readonlyInput: { backgroundColor: '#F3F4F6' },
  row: { flexDirection: 'row', marginBottom: 10 },
  halfField: { flex: 1, marginHorizontal: 3 },
  typeBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', marginRight: 8 },
  typeBtnActive: { backgroundColor: '#059669', borderColor: '#059669' },
  typeBtnText: { fontWeight: 'bold', color: '#4B5563' },
  typeBtnTextActive: { color: '#fff' },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', marginRight: 8, flexShrink: 0 },
  chipActive: { backgroundColor: '#059669' },
  chipText: { fontSize: 13, fontWeight: 'bold', color: '#4B5563' },
  chipTextActive: { color: '#fff' },
  reminderBox: { backgroundColor: '#F3F4F6', padding: 10, borderRadius: 10, marginBottom: 10 },
  timesWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  timeInput: { width: 56, height: 36, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, textAlign: 'center', fontSize: 13, marginRight: 6, marginBottom: 6 },
  infoSmall: { fontSize: 10, color: '#9CA3AF', marginTop: 0 },
  weekChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff', marginRight: 6, marginBottom: 6 },
  weekChipActive: { backgroundColor: '#059669', borderColor: '#059669' },
  weekChipText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  weekChipTextActive: { color: '#fff' },
  saveBtn: { backgroundColor: '#059669', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 10, marginTop: 10, marginBottom: 10 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
  cameraModal: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  scannerCutout: { width: 250, height: 250, borderRadius: 20, borderWidth: 2, borderColor: '#fff' },
  overlayHint: { color: '#fff', marginTop: 20, fontWeight: '600' },
  captureBtn: { marginTop: 20, backgroundColor: '#0F766E', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 },
  captureBtnText: { color: '#fff', fontWeight: 'bold' },
  closeScan: { marginTop: 20, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  closeScanText: { color: '#fff', fontWeight: 'bold' },
});
