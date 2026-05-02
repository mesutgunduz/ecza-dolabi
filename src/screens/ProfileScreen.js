import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, ActivityIndicator, TextInput
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { getMeds, getLogs, getPersons, markAsTaken, clearActivePerson, clearAllData, getDayRolloverTime, setDayRolloverTime, getFamilyCode, getSnoozeWindowSettings, setSnoozeWindowSettings, changeFamilyPassword } from '../utils/storage';
import { db } from '../utils/firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query } from 'firebase/firestore';
import { LogOut, Pill, Clock, CheckCircle, Shield, Users, Check, Download, Upload } from 'lucide-react-native';
import { useTranslation } from '../i18n/LanguageContext';

const RECENT_ACTIVITY_LIMIT = 10;

export default function ProfileScreen({ activePerson, onPersonChange, onFullLogout }) {
  const { t, language, setLanguage } = useTranslation();
  const [myMeds, setMyMeds] = useState([]);
  const [todayLogs, setTodayLogs] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [familySummary, setFamilySummary] = useState([]);
  const [cabinetSummary, setCabinetSummary] = useState({
    total: 0,
    active: 0,
    passive: 0,
    sharedTotal: 0,
  });
  const [persons, setPersons] = useState([]);
  const [rolloverTime, setRolloverTime] = useState('00:00');
  const [snoozeBeforeMinutes, setSnoozeBeforeMinutes] = useState(60);
  const [snoozeAfterMinutes, setSnoozeAfterMinutes] = useState(120);
  const [currentFamilyPassword, setCurrentFamilyPassword] = useState('');
  const [newFamilyPassword, setNewFamilyPassword] = useState('');
  const [newFamilyPasswordAgain, setNewFamilyPasswordAgain] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
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
      const snoozeCfg = await getSnoozeWindowSettings();
      setPersons(allPersons);
      setRolloverTime(rt);
      setSnoozeBeforeMinutes(snoozeCfg.beforeMinutes);
      setSnoozeAfterMinutes(snoozeCfg.afterMinutes);

      const meds = allMeds.filter(m => m.personId === activePerson.id && m.isActive !== false);
      const today = allLogs.filter(l => l.personId === activePerson.id && l.date === todayStr);
      const recent = allLogs
        .filter(l => l.personId === activePerson.id)
        .sort((a, b) => getLogTimestamp(b) - getLogTimestamp(a))
        .slice(0, RECENT_ACTIVITY_LIMIT);

      setMyMeds(meds);
      setTodayLogs(today);
      setRecentLogs(recent);

      if (activePerson.canSeeAll) {
        const total = allMeds.length;
        const activeCount = allMeds.filter((m) => m.isActive !== false).length;
        const passiveCount = Math.max(0, total - activeCount);
        const sharedTotal = allMeds.filter((m) => m.personId === 'all').length;

        setCabinetSummary({
          total,
          active: activeCount,
          passive: passiveCount,
          sharedTotal,
        });

        const summary = allPersons
          .filter((p) => p.id && p.id !== 'all')
          .map(p => {
            const pMeds = allMeds.filter(m => m.personId === p.id);
            const pActiveMeds = pMeds.filter((m) => m.isActive !== false);
            const pLogs = allLogs.filter(l => l.personId === p.id && l.date === todayStr);
            return {
              ...p,
              medCount: pMeds.length,
              activeCount: pActiveMeds.length,
              passiveCount: Math.max(0, pMeds.length - pActiveMeds.length),
              takenToday: pLogs.length,
            };
          });
        setFamilySummary(summary);
      } else {
        setCabinetSummary({ total: 0, active: 0, passive: 0, sharedTotal: 0 });
        setFamilySummary([]);
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

  const getLogTimestamp = (log) => {
    const rawTs = log?.timestamp;
    if (typeof rawTs === 'number') return rawTs;
    if (rawTs && typeof rawTs.seconds === 'number') return rawTs.seconds * 1000;

    const datePart = String(log?.date || '').trim();
    const timePart = String(log?.time || '').trim() || '00:00';
    const dateMatch = datePart.match(/^(\d{2})[.\-/](\d{2})[.\-/](\d{4})$/);
    if (!dateMatch) return 0;

    const [, day, month, year] = dateMatch;
    const isoDateTime = `${year}-${month}-${day}T${timePart.length === 5 ? `${timePart}:00` : timePart}`;
    const parsed = new Date(isoDateTime).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const handleTakeMed = async (med) => {
    try {
      setLoading(true);
      const success = await markAsTaken(med.id, activePerson.id, parseFloat(med.consumePerUsage || 1), med.name, activePerson.name);
      if (success) {
        Alert.alert(t('success'), `${med.name} ${t('usedMed')}.`);
        await loadData();
      }
    } catch (err) {
      Alert.alert(t('error'), t('opFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      const code = await getFamilyCode();
      if (!code) { Alert.alert(t('error'), t('familyCodeNotFound')); return; }

      if (Constants.appOwnership === 'expo') {
        Alert.alert(t('devBuildRequired'), t('exportDevBuildMsg'));
        return;
      }

      const [allMeds, allLogs, allPersons] = await Promise.all([getMeds(), getLogs(), getPersons()]);
      const rollover = await getDayRolloverTime();
      const snoozeWindow = await getSnoozeWindowSettings();

      const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        familyCode: code,
        rolloverTime: rollover,
        snoozeWindow,
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
        await shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: t('backupShareDialogTitle') });
      } else {
        Alert.alert(t('export'), `${t('exportedSaved')}\n${fileUri}`);
      }
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (/ExpoSharing|native module/i.test(msg)) {
        Alert.alert(t('sharingUnavailable'), t('sharingUnavailableMsg'));
      } else {
        Alert.alert(t('error'), t('exportFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    try {
      if (Constants.appOwnership === 'expo') {
        Alert.alert(t('devBuildRequired'), t('importDevBuildMsg'));
        return;
      }

      let DocumentPicker;
      try { DocumentPicker = await import('expo-document-picker'); } catch {
        Alert.alert(t('error'), t('filePickerUnavailable'));
        return;
      }

      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;

      const fileUri = result.assets?.[0]?.uri;
      if (!fileUri) { Alert.alert(t('error'), t('fileNotSelected')); return; }

      const json = await FileSystem.readAsStringAsync(fileUri, { encoding: 'utf8' });
      const backup = JSON.parse(json);

      if (!backup?.version || !backup?.meds || !backup?.persons) {
        Alert.alert(t('error'), t('invalidBackup'));
        return;
      }

      await new Promise((resolve, reject) => {
        Alert.alert(
          t('importConfirmTitle'),
          `${backup.meds.length} ilaç, ${backup.persons.length} kişi ve ${backup.logs?.length || 0} geçmiş kaydı içe aktarılacak.\n\nMEVCUT VERİLER SİLİNECEK. Devam edilsin mi?`,
          [
            { text: t('cancel'), style: 'cancel', onPress: () => reject('cancelled') },
            { text: t('import'), style: 'destructive', onPress: resolve },
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
      if (backup.snoozeWindow) {
        await setSnoozeWindowSettings({
          beforeMinutes: backup.snoozeWindow.beforeMinutes,
          afterMinutes: backup.snoozeWindow.afterMinutes,
        });
      }

      Alert.alert(t('success'), t('importSuccess'));
      await loadData();
    } catch (e) {
      if (e === 'cancelled') return;
      Alert.alert(t('error'), `${t('importFailed')} ${String(e?.message || e)}`);
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

  const formatDuration = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0 && m > 0) return `${h}s ${m}dk`;
    if (h > 0) return `${h}s`;
    return `${m}dk`;
  };

  const formatLogDateTime = (log) => {
    const datePart = String(log?.date || '').trim();
    const timePart = String(log?.time || '').trim();
    if (datePart && timePart) return `${datePart} ${timePart}`;
    if (datePart) return datePart;
    if (timePart) return timePart;

    const rawTs = log?.timestamp;
    const ts = typeof rawTs === 'number'
      ? rawTs
      : (rawTs && typeof rawTs.seconds === 'number' ? rawTs.seconds * 1000 : null);

    if (!ts) return '-';
    const locale = language === 'en' ? 'en-GB' : 'tr-TR';
    return new Date(ts).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSnoozeWindowChange = async (key, delta) => {
    const current = key === 'before' ? snoozeBeforeMinutes : snoozeAfterMinutes;
    const next = Math.max(0, Math.min(24 * 60, current + delta));

    if (key === 'before') setSnoozeBeforeMinutes(next);
    else setSnoozeAfterMinutes(next);

    await setSnoozeWindowSettings({
      beforeMinutes: key === 'before' ? next : snoozeBeforeMinutes,
      afterMinutes: key === 'after' ? next : snoozeAfterMinutes,
    });
  };

  const handleFamilyPasswordUpdate = async () => {
    if (!activePerson?.canSeeAll) return;

    if (newFamilyPassword.trim().length < 4) {
      Alert.alert(t('error'), t('errPasswordShort2'));
      return;
    }

    if (newFamilyPassword !== newFamilyPasswordAgain) {
      Alert.alert(t('error'), t('errPasswordMismatch'));
      return;
    }

    const result = await changeFamilyPassword(currentFamilyPassword, newFamilyPassword);
    if (!result?.ok) {
      if (result?.reason === 'wrong-password') {
        Alert.alert(t('error'), t('errCurrentPasswordWrong'));
        return;
      }
      Alert.alert(t('error'), t('errPasswordUpdateFailed'));
      return;
    }

    setCurrentFamilyPassword('');
    setNewFamilyPassword('');
    setNewFamilyPasswordAgain('');
    setShowPasswordForm(false);
    Alert.alert(t('success'), t('passwordUpdated'));
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Profil Özeti */}
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{activePerson.avatar || '🧑'}</Text></View>
        <View style={{flex:1}}>
          <Text style={styles.name}>{activePerson.name}</Text>
          <Text style={styles.role}>{activePerson.canSeeAll ? `👑 ${t('admin')}` : `👤 ${t('member')}`}</Text>
        </View>
        <TouchableOpacity style={styles.logoutIcon} onPress={() => onPersonChange()}>
           <Users color="#059669" size={20} />
        </TouchableOpacity>
      </View>

      {/* İlaçlarım */}
      {activePerson?.canSeeAll && (
        <>
          <Text style={styles.sectionTitle}>{t('cabinetSummaryTitle')}</Text>
          <View style={styles.summaryBox}>
            <View style={styles.summaryStatsRow}>
              <View style={styles.summaryStatCard}>
                <Text style={styles.summaryStatValue}>{cabinetSummary.total}</Text>
                <Text style={styles.summaryStatLabel}>{t('totalMedsCount')}</Text>
              </View>
              <View style={styles.summaryStatCard}>
                <Text style={styles.summaryStatValue}>{cabinetSummary.active}</Text>
                <Text style={styles.summaryStatLabel}>{t('active')}</Text>
              </View>
              <View style={styles.summaryStatCard}>
                <Text style={styles.summaryStatValue}>{cabinetSummary.passive}</Text>
                <Text style={styles.summaryStatLabel}>{t('passive')}</Text>
              </View>
            </View>

            <Text style={styles.summarySubLine}>{t('sharedMedsCount')}: {cabinetSummary.sharedTotal}</Text>

            <Text style={styles.summaryListTitle}>{t('personMedsBreakdown')}</Text>
            {familySummary.length > 0 ? familySummary.map((item) => (
              <View key={item.id} style={styles.summaryPersonRow}>
                <Text style={styles.summaryPersonName}>{item.name}</Text>
                <Text style={styles.summaryPersonMeta}>
                  {item.medCount} {t('totalMedsCount').toLocaleLowerCase(language === 'en' ? 'en-GB' : 'tr-TR')} • {t('active')}: {item.activeCount} • {t('passive')}: {item.passiveCount}
                </Text>
              </View>
            )) : <Text style={styles.summaryEmpty}>{t('noPersonData')}</Text>}
          </View>
        </>
      )}

      {/* İlaçlarım */}
      <Text style={styles.sectionTitle}>{t('myActiveMeds')}</Text>
      {myMeds.map(med => (
        <View key={med.id} style={styles.miniCard}>
          <Text style={styles.medName}>{med.name}</Text>
          <TouchableOpacity style={styles.miniBtn} onPress={() => handleTakeMed(med)}>
            <Check color="#fff" size={16} />
            <Text style={styles.miniBtnText}>{t('use')}</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Son Hareketler */}
      <Text style={styles.sectionTitle}>{t('recentActivity')}</Text>
      <Text style={styles.sectionHint}>{t('recentActivityHint')}</Text>
      <View style={styles.logBox}>
        {recentLogs.map(log => (
          <View key={log.id} style={styles.logItem}>
             <Text style={styles.logTime}>{formatLogDateTime(log)}</Text>
             <View style={{flex:1}}>
                <Text style={styles.logText}>{log.medName || t('unknown')} {t('usedMed')}</Text>
                <Text style={styles.logTaker}>{t('usedBy')} {getLogTakerName(log)}</Text>
             </View>
          </View>
        ))}
      </View>

      {activePerson?.canSeeAll && (
        <>
          <Text style={styles.sectionTitle}>{t('familyPasswordTitle')}</Text>
          <View style={styles.backupBox}>
            <Text style={styles.backupDesc}>{t('familyPasswordDesc')}</Text>
            <TouchableOpacity
              style={[styles.exportBtn, styles.inlineActionBtn]}
              onPress={() => setShowPasswordForm((prev) => !prev)}
            >
              <Shield color="#fff" size={16} />
              <Text style={styles.backupBtnText}>{showPasswordForm ? t('hidePasswordForm') : t('changePassword')}</Text>
            </TouchableOpacity>

            {showPasswordForm && (
              <>
                <TextInput
                  style={styles.passwordInput}
                  placeholder={t('currentPassword')}
                  value={currentFamilyPassword}
                  onChangeText={setCurrentFamilyPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.passwordInput}
                  placeholder={t('newPassword')}
                  value={newFamilyPassword}
                  onChangeText={setNewFamilyPassword}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <TextInput
                  style={styles.passwordInput}
                  placeholder={t('newPasswordAgain')}
                  value={newFamilyPasswordAgain}
                  onChangeText={setNewFamilyPasswordAgain}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <TouchableOpacity style={styles.exportBtn} onPress={handleFamilyPasswordUpdate}>
                  <Shield color="#fff" size={16} />
                  <Text style={styles.backupBtnText}>{t('updatePassword')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      )}

      {activePerson?.canSeeAll && (
        <>
          <Text style={styles.sectionTitle}>{t('backupTitle')}</Text>
          <View style={styles.backupBox}>
            <Text style={styles.backupDesc}>{t('backupDesc')}</Text>
            <View style={styles.backupBtns}>
              <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
                <Download color="#fff" size={16} />
                <Text style={styles.backupBtnText}>{t('export')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
                <Upload color="#fff" size={16} />
                <Text style={styles.backupBtnText}>{t('import')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Dil Seçici */}
      <View style={[styles.backupBox, { marginTop: 16, marginBottom: 8 }]}>
        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 12 }]}>{t('language')}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            style={[styles.exportBtn, language !== 'tr' && { backgroundColor: '#D1D5DB' }]}
            onPress={() => setLanguage('tr')}
          >
            <Text style={styles.backupBtnText}>{t('languageTR')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportBtn, language !== 'en' && { backgroundColor: '#D1D5DB' }]}
            onPress={() => setLanguage('en')}
          >
            <Text style={styles.backupBtnText}>{t('languageEN')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {activePerson?.canSeeAll && (
        <>
          <Text style={styles.sectionTitle}>{t('dayRollover')}</Text>
          <View style={styles.rolloverBox}>
            <Text style={styles.rolloverText}>{t('dayRolloverDesc')}</Text>
            <View style={styles.rolloverControls}>
              <TouchableOpacity style={styles.rolloverBtn} onPress={() => handleRolloverChange(-1)}>
                <Text style={styles.rolloverBtnText}>-1s</Text>
              </TouchableOpacity>
              <Text style={styles.rolloverTime}>{rolloverTime}</Text>
              <TouchableOpacity style={styles.rolloverBtn} onPress={() => handleRolloverChange(1)}>
                <Text style={styles.rolloverBtnText}>+1s</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.rolloverHint}>{t('dayRolloverDefault')}</Text>
          </View>

          <Text style={styles.sectionTitle}>{t('snoozeWindow')}</Text>
          <View style={styles.rolloverBox}>
            <Text style={styles.rolloverText}>{t('snoozeWindowDesc')}</Text>

            <View style={styles.windowRow}>
              <Text style={styles.windowLabel}>{t('beforeDoseTime')}</Text>
              <View style={styles.rolloverControls}>
                <TouchableOpacity style={styles.rolloverBtn} onPress={() => handleSnoozeWindowChange('before', -30)}>
                  <Text style={styles.rolloverBtnText}>-30dk</Text>
                </TouchableOpacity>
                <Text style={styles.rolloverTimeSmall}>{formatDuration(snoozeBeforeMinutes)}</Text>
                <TouchableOpacity style={styles.rolloverBtn} onPress={() => handleSnoozeWindowChange('before', 30)}>
                  <Text style={styles.rolloverBtnText}>+30dk</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.windowRow}>
              <Text style={styles.windowLabel}>{t('afterDoseTime')}</Text>
              <View style={styles.rolloverControls}>
                <TouchableOpacity style={styles.rolloverBtn} onPress={() => handleSnoozeWindowChange('after', -30)}>
                  <Text style={styles.rolloverBtnText}>-30dk</Text>
                </TouchableOpacity>
                <Text style={styles.rolloverTimeSmall}>{formatDuration(snoozeAfterMinutes)}</Text>
                <TouchableOpacity style={styles.rolloverBtn} onPress={() => handleSnoozeWindowChange('after', 30)}>
                  <Text style={styles.rolloverBtnText}>+30dk</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.rolloverHint}>{t('snoozeWindowExample')}</Text>
          </View>
        </>
      )}

      <TouchableOpacity style={styles.fullLogout} onPress={() => onFullLogout()}>
        <LogOut color="#EF4444" size={20} />
        <Text style={styles.logoutText}>{t('logout')}</Text>
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
  sectionHint: { fontSize: 12, color: '#6B7280', marginTop: -4, marginBottom: 10 },
  miniCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8 },
  medName: { fontWeight: 'bold', color: '#111827' },
  miniBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#059669', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  miniBtnText: { color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 4 },
  logBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12 },
  logItem: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingVertical: 8 },
  logTime: { width: 110, fontSize: 11, color: '#6B7280', fontWeight: 'bold', marginRight: 10 },
  logText: { fontSize: 13, fontWeight: '500' },
  logTaker: { fontSize: 11, color: '#9CA3AF' },
  rolloverBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 6 },
  rolloverText: { fontSize: 12, color: '#4B5563' },
  rolloverControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  rolloverBtn: { backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#10B981' },
  rolloverBtnText: { color: '#047857', fontWeight: 'bold', fontSize: 12 },
  rolloverTime: { marginHorizontal: 16, fontSize: 20, fontWeight: 'bold', color: '#111827' },
  rolloverTimeSmall: { marginHorizontal: 16, fontSize: 16, fontWeight: 'bold', color: '#111827', minWidth: 72, textAlign: 'center' },
  rolloverHint: { marginTop: 8, fontSize: 11, color: '#9CA3AF', textAlign: 'center' },
  windowRow: { marginTop: 10 },
  windowLabel: { fontSize: 12, color: '#4B5563', fontWeight: '600' },
  fullLogout: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30, padding: 15, backgroundColor: '#FEF2F2', borderRadius: 12 },
  logoutText: { color: '#EF4444', fontWeight: 'bold', marginLeft: 8 },
  backupBox: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 6 },
  backupDesc: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  passwordInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, color: '#111827' },
  backupBtns: { flexDirection: 'row', gap: 10 },
  exportBtn: { flex: 1, backgroundColor: '#059669', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },
  inlineActionBtn: { marginBottom: 10 },
  importBtn: { flex: 1, backgroundColor: '#3B82F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8 },
  backupBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 12, marginLeft: 6 },
  summaryBox: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 6, marginBottom: 6 },
  summaryStatsRow: { flexDirection: 'row', gap: 8 },
  summaryStatCard: { flex: 1, backgroundColor: '#ECFDF5', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  summaryStatValue: { fontSize: 18, fontWeight: '800', color: '#065F46' },
  summaryStatLabel: { fontSize: 11, fontWeight: '700', color: '#047857', marginTop: 2 },
  summarySubLine: { marginTop: 10, fontSize: 12, color: '#4B5563', fontWeight: '600' },
  summaryListTitle: { marginTop: 10, marginBottom: 6, fontSize: 12, fontWeight: '700', color: '#374151' },
  summaryPersonRow: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  summaryPersonName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  summaryPersonMeta: { marginTop: 2, fontSize: 11, color: '#6B7280' },
  summaryEmpty: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
});
