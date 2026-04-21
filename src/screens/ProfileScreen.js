import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, ActivityIndicator
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { getMeds, getLogs, getPersons, markAsTaken, clearActivePerson, clearAllData, getDayRolloverTime, setDayRolloverTime, getFamilyCode } from '../utils/storage';
import { db } from '../utils/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query } from 'firebase/firestore';
import { LogOut, Pill, Clock, CheckCircle, Shield, Users, Check, Download, Upload } from 'lucide-react-native';

export default function ProfileScreen({ activePerson, onPersonChange, onFullLogout }) {
  const [myMeds, setMyMeds] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [familySummary, setFamilySummary] = useState([]);
  const [persons, setPersons] = useState([]);
  const [rolloverTime, setRolloverTime] = useState('00:00');
  const [loading, setLoading] = useState(true);

  const todayStr = (() => {
    const now = new Date();
    return `${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}.${now.getFullYear()}`;
  })();

  const loadData = async () => {
    try {
      if (!activePerson) return;
      setLoading(true);
      const allMeds = await getMeds();
      const allLogs = await getLogs();
      const allPersons = await getPersons();
      const rt = await getDayRolloverTime();
      setPersons(allPersons);
      setRolloverTime(rt);

      const meds = allMeds.filter(m => m.personId === activePerson.id && m.isActive !== false);
      const today = allLogs.filter(l => l.personId === activePerson.id && l.date === todayStr);
      const recent = allLogs
        .filter(l => l.personId === activePerson.id)
        .slice(0, 10);

      setMyMeds(meds);
      setTodayLogs(today);
      setRecentLogs(recent);

      if (activePerson.canSeeAll) {
        const summary = allPersons
          .filter(p => p.id !== activePerson.id)
          .map(p => {
            const pMeds = allMeds.filter(m => m.personId === p.id && m.isActive !== false);
            const pLogs = allLogs.filter(l => l.personId === p.id && l.date === todayStr);
            return { ...p, medCount: pMeds.length, takenToday: pLogs.length };
          });
        setFamilySummary(summary);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, [activePerson]));

  const getLogTakerName = (log) => {
    if (log.takerName) return log.takerName;
    const p = persons.find(x => x.id === log.personId);
    return p ? p.name : (activePerson.id === log.personId ? activePerson.name : 'Bilinmeyen');
  };

  const handleTakeMed = async (med) => {
    try {
      setLoading(true);
      const success = await markAsTaken(med.id, activePerson.id, parseFloat(med.consumePerUsage || 1), med.name, activePerson.name);
      if (success) {
        Alert.alert("Başarılı ✅", `${med.name} içildi.`);
        await loadData();
      }
    } catch (err) {
      Alert.alert("Hata", "İşlem başarısız.");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      const code = await getFamilyCode();
      if (!code) { Alert.alert('Hata', 'Aile kodu bulunamadı.'); return; }

      if (Constants.appOwnership === 'expo') {
        Alert.alert('Development Build Gerekli', 'Dosya paylaşımı için development build ile açmanız gerekir.');
        return;
      }

      const [allMeds, allLogs, allPersons] = await Promise.all([getMeds(), getLogs(), getPersons()]);
      const rollover = await getDayRolloverTime();

      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        familyCode: code,
        rolloverTime: rollover,
        meds: allMeds,
        logs: allLogs,
        persons: allPersons,
      };

      const json = JSON.stringify(backup, null, 2);
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
      const fileName = `ecza-dolabi-yedek-${dateStr}.json`;
      const fileUri = FileSystem.documentDirectory + fileName;

      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: 'utf8' });

      let SharingModRaw;
      try { SharingModRaw = await import('expo-sharing'); } catch { SharingModRaw = null; }

      const SharingMod = SharingModRaw?.default || SharingModRaw;
      const isAvailableAsync = SharingMod?.isAvailableAsync;
      const shareAsync = SharingMod?.shareAsync;

      if (typeof isAvailableAsync === 'function' && typeof shareAsync === 'function' && await isAvailableAsync()) {
        await shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Yedeği Paylaş veya Kaydet' });
      } else {
        Alert.alert('Dışa Aktarıldı', `Dosya kaydedildi:\n${fileUri}`);
      }
    } catch (e) {
      console.error('Export failed:', e);
      Alert.alert('Hata', 'Dışa aktarma başarısız.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    try {
      if (Constants.appOwnership === 'expo') {
        Alert.alert('Development Build Gerekli', 'İçe aktarma için development build ile açmanız gerekir.');
        return;
      }

      let DocumentPicker;
      try { DocumentPicker = await import('expo-document-picker'); } catch {
        Alert.alert('Hata', 'Dosya seçici bu ortamda kullanılamıyor.');
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;

      const fileUri = result.assets?.[0]?.uri;
      if (!fileUri) { Alert.alert('Hata', 'Dosya seçilemedi.'); return; }

      const json = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' });
      const backup = JSON.parse(json);

      if (!backup?.version || !backup?.meds || !backup?.persons) {
        Alert.alert('Hata', 'Geçersiz yedek dosyası.');
        return;
      }

      await new Promise((resolve, reject) => {
        Alert.alert(
          'Veri İçe Aktar',
          `${backup.meds.length} ilaç, ${backup.persons.length} kişi ve ${backup.logs?.length || 0} geçmiş kaydı içe aktarılacak.\n\nMEVCUT VERİLER SİLİNECEK. Devam edilsin mi?`,
          [
            { text: 'Vazgeç', style: 'cancel', onPress: () => reject('cancelled') },
            { text: 'İçe Aktar', style: 'destructive', onPress: resolve },
          ]
        );
      }).catch(() => { return Promise.reject('cancelled'); });

      setLoading(true);
      const code = await getFamilyCode();

      const deleteCollection = async (name) => {
        const snap = await getDocs(query(collection(db, 'families', code, name)));
        await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'families', code, name, d.id))));
      };

      await deleteCollection('meds');
      await deleteCollection('logs');
      await deleteCollection('persons');

      await Promise.all(backup.persons.map(p => { const { id, ...data } = p; return addDoc(collection(db, 'families', code, 'persons'), data); }));
      await Promise.all(backup.meds.map(m => { const { id, ...data } = m; return addDoc(collection(db, 'families', code, 'meds'), data); }));
      await Promise.all((backup.logs || []).map(l => { const { id, ...data } = l; return addDoc(collection(db, 'families', code, 'logs'), data); }));

      if (backup.rolloverTime) await setDayRolloverTime(backup.rolloverTime);

      Alert.alert('Başarılı', 'Veriler içe aktarıldı.');
      await loadData();
    } catch (e) {
      if (e === 'cancelled') return;
      console.error('Import failed:', e);
      Alert.alert('Hata', 'İçe aktarma başarısız: ' + String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const handleRolloverChange = async (delta) => {
    const [h] = String(rolloverTime || '00:00').split(':').map(Number);
    const nextHour = (Number.isNaN(h) ? 0 : h + delta + 24) % 24;
    const next = `${String(nextHour).padStart(2, '0')}:00`;
    setRolloverTime(next);
    await setDayRolloverTime(next);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Profil Özeti */}
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{activePerson.avatar || '🧑'}</Text></View>
        <View style={{flex:1}}>
          <Text style={styles.name}>{activePerson.name}</Text>
          <Text style={styles.role}>{activePerson.canSeeAll ? '👑 Yönetici' : '👤 Üye'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutIcon} onPress={() => onPersonChange()}>
           <Users color="#059669" size={20} />
        </TouchableOpacity>
      </View>

      {/* İlaçlarım */}
      <Text style={styles.sectionTitle}>💊 Aktif İlaçlarım</Text>
      {myMeds.map(med => (
        <View key={med.id} style={styles.miniCard}>
          <Text style={styles.medName}>{med.name}</Text>
          <TouchableOpacity style={styles.miniBtn} onPress={() => handleTakeMed(med)}>
            <Check color="#fff" size={16} />
            <Text style={styles.miniBtnText}>Kullan</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Son Hareketler */}
      <Text style={styles.sectionTitle}>🕒 Son Hareketlerim</Text>
      <View style={styles.logBox}>
        {recentLogs.map(log => (
          <View key={log.id} style={styles.logItem}>
             <Text style={styles.logTime}>{log.time}</Text>
             <View style={{flex:1}}>
                <Text style={styles.logText}>{log.medName || 'İlaç'} kullanıldı</Text>
                <Text style={styles.logTaker}>Kullanan: {getLogTakerName(log)}</Text>
             </View>
          </View>
        ))}
      </View>

      {activePerson?.canSeeAll && (
        <>
          <Text style={styles.sectionTitle}>🕛 Gün Dönümü Saati</Text>
          <View style={styles.rolloverBox}>
            <Text style={styles.rolloverText}>Kaçırılan doz hesapları bu saate göre gün değiştirir.</Text>
            <View style={styles.rolloverControls}>
              <TouchableOpacity style={styles.rolloverBtn} onPress={() => handleRolloverChange(-1)}>
                <Text style={styles.rolloverBtnText}>-1s</Text>
              </TouchableOpacity>
              <Text style={styles.rolloverTime}>{rolloverTime}</Text>
              <TouchableOpacity style={styles.rolloverBtn} onPress={() => handleRolloverChange(1)}>
                <Text style={styles.rolloverBtnText}>+1s</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.rolloverHint}>Varsayılan: 00:00 | Örnek: 03:00</Text>
          </View>
        </>
      )}

      {activePerson?.canSeeAll && (
        <>
          <Text style={styles.sectionTitle}>💾 Veri Yedekleme</Text>
          <View style={styles.backupBox}>
            <Text style={styles.backupDesc}>Tüm ilaç, kişi ve geçmiş verilerini JSON dosyası olarak dışa aktarın veya önceki bir yedeği geri yükleyin.</Text>
            <View style={styles.backupBtns}>
              <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
                <Download color="#fff" size={16} />
                <Text style={styles.backupBtnText}>Dışa Aktar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
                <Upload color="#fff" size={16} />
                <Text style={styles.backupBtnText}>İçe Aktar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      <TouchableOpacity style={styles.fullLogout} onPress={() => onFullLogout()}>
        <LogOut color="#EF4444" size={20} />
        <Text style={styles.logoutText}>Sistemden Çıkış Yap</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 20, elevation: 2 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { fontSize: 24 },
  name: { fontSize: 18, fontWeight: 'bold' },
  role: { fontSize: 12, color: '#6B7280' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: '#374151', marginBottom: 10, marginTop: 10 },
  miniCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8 },
  medName: { fontWeight: 'bold', color: '#111827' },
  miniBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#059669', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  miniBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  logBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  logItem: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 8 },
  logTime: { width: 50, fontSize: 11, color: '#6B7280', fontWeight: 'bold' },
  logText: { fontSize: 13, fontWeight: '500' },
  logTaker: { fontSize: 11, color: '#9CA3AF' },
  rolloverBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 6 },
  rolloverText: { fontSize: 12, color: '#4B5563' },
  rolloverControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  rolloverBtn: { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#10B981' },
  rolloverBtnText: { color: '#047857', fontWeight: 'bold', fontSize: 12 },
  rolloverTime: { marginHorizontal: 16, fontSize: 20, fontWeight: 'bold', color: '#111827' },
  rolloverHint: { marginTop: 8, fontSize: 11, color: '#9CA3AF', textAlign: 'center' },
  fullLogout: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30, padding: 15, backgroundColor: '#FEF2F2', borderRadius: 12 },
  logoutText: { color: '#EF4444', fontWeight: 'bold', marginLeft: 8 },
  backupBox: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 6 },
  backupDesc: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  backupBtns: { flexDirection: 'row', gap: 10 },
  exportBtn: { flex: 1, backgroundColor: '#059669', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },
  importBtn: { flex: 1, backgroundColor: '#3B82F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },
  backupBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12, marginLeft: 6 },
});
