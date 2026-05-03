import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  ActivityIndicator, Alert, Platform, TextInput, AppState
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getMeds, getPersons, getLogs, markAsTaken, editMed, repairAllMedsData, getDayRolloverTime, getSnoozeWindowSettings, getNotificationTargetPersonIds, getPendingOfflineOpsCount } from '../utils/storage';
import { parseRolloverToMinutes, parseClockTimeToMinutes, adjustMinutesForRollover, getLogicalDateKeyForNow, getLogicalDateKeyForLog, getLogicalNowMinutes } from '../utils/dayRollover';
import * as Notifications from 'expo-notifications';
import { getPersistedSnoozedReminders, scheduleReminderSnooze } from '../utils/notifications';
import { translateMedicineForm, translateMedicineUnit } from '../utils/medicineDisplay';
import { 
  Check, AlertCircle, Pill, Clock, Search
} from 'lucide-react-native';
import { useTranslation } from '../i18n/LanguageContext';

export default function DashboardScreen({ activePerson, dataRefreshKey = 0 }) {
  const { t, language } = useTranslation();
  const navigation = useNavigation();
  const [meds, setMeds] = useState([]);
  const [persons, setPersons] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPerson, setFilterPerson] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rolloverTime, setRolloverTime] = useState('00:00');
  const [snoozeBeforeMinutes, setSnoozeBeforeMinutes] = useState(60);
  const [snoozeAfterMinutes, setSnoozeAfterMinutes] = useState(120);
  const [notificationTargetIds, setNotificationTargetIds] = useState([]);
  const [snoozedReminderByMed, setSnoozedReminderByMed] = useState({});
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  const loadSnoozedReminderState = useCallback(async () => {
    try {
      const persisted = await getPersistedSnoozedReminders({
        personId: activePerson?.id,
        includeAll: true,
      });
      const nextByMed = {};
      Object.entries(persisted || {}).forEach(([medId, item]) => {
        const triggerDate = new Date(Number(item?.triggerAt || 0));
        if (Number.isNaN(triggerDate.getTime())) return;
        nextByMed[medId] = {
          triggerDate,
          targetPersonName: String(item?.targetPersonName || '').trim(),
        };
      });

      setSnoozedReminderByMed(nextByMed);
    } catch (err) {
      console.error('loadSnoozedReminderState failed:', err);
      setSnoozedReminderByMed({});
    }
  }, [activePerson]);

  const rolloverMinutes = useMemo(() => parseRolloverToMinutes(rolloverTime), [rolloverTime]);
  const logicalTodayKey = useMemo(() => getLogicalDateKeyForNow(new Date(), rolloverMinutes), [rolloverMinutes]);
  const logicalWeekDay = useMemo(() => {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const logicalNow = new Date(now);
    if (nowMinutes < rolloverMinutes) {
      logicalNow.setDate(logicalNow.getDate() - 1);
    }
    return logicalNow.getDay();
  }, [rolloverMinutes]);

  const loadData = useCallback(async () => {
    try {
      const m = await getMeds();
      const p = await getPersons();
      const l = await getLogs();
      const rt = await getDayRolloverTime();
      const snoozeCfg = await getSnoozeWindowSettings();
      const targetIds = await getNotificationTargetPersonIds(activePerson?.id);
      const pendingCount = await getPendingOfflineOpsCount();
      
      setMeds(m);
      setPersons(p);
      setLogs(l);
      setRolloverTime(rt);
      setSnoozeBeforeMinutes(snoozeCfg.beforeMinutes);
      setSnoozeAfterMinutes(snoozeCfg.afterMinutes);
      setNotificationTargetIds(targetIds);
      setPendingSyncCount(pendingCount);
      await loadSnoozedReminderState();

      if (activePerson && !activePerson.canSeeAll) {
        setFilterPerson(activePerson.id);
      }
      
      await repairAllMedsData();
    } catch (err) {
      console.error("Load Error:", err);
    } finally {
      setLoading(false);
    }
  }, [activePerson, loadSnoozedReminderState]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData, dataRefreshKey]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadData();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [loadData]);

  const filteredMeds = useMemo(() => {
    const searching = searchQuery.trim().length > 0;
    let list = searching ? [...meds] : meds.filter((med) => med.isActive !== false);
    
    // Eğer arama yapılıyorsa TÜM dolabı tara (Kişi filtresini baypas et)
    if (searching) {
      const q = searchQuery.toLocaleLowerCase('tr-TR').trim();
      return list.filter(med => {
        const medName = (med.name || '').toLocaleLowerCase('tr-TR');
        return medName.includes(q);
      });
    }

    // Arama yoksa sadece seçili kişinin (veya adminin seçtiği kişinin) ilaçlarını göster
    if (filterPerson !== 'all') {
      list = list.filter(med => med.personId === filterPerson || med.personId === 'all');
    }

    return list;
  }, [meds, filterPerson, searchQuery]);

  const medUsageCounts = useMemo(() => {
    const counts = {};
    const todayLogs = logs.filter(l => getLogicalDateKeyForLog(l, rolloverMinutes) === logicalTodayKey);
    todayLogs.forEach(log => {
      const key = `${log.medId}-${log.personId}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [logs, rolloverMinutes, logicalTodayKey]);

  const expiredMeds = useMemo(() => {
    return meds.filter(med => {
      if (!med.expiryDate || med.isActive === false) return false;
      try {
        const parts = med.expiryDate.split(/[\.\-\/]/).map(Number);
        let expDate;
        if (parts.length === 3) {
          let [d, m, y] = parts;
          if (y < 100) y += 2000;
          expDate = new Date(y, m - 1, d, 23, 59, 59);
        } else if (parts.length === 2) {
          let [m, y] = parts;
          if (y < 100) y += 2000;
          expDate = new Date(y, m, 0, 23, 59, 59);
        } else { return false; }
        return expDate.getTime() < new Date().getTime();
      } catch(e) { return false; }
    });
  }, [meds]);

  const missedDoseItems = useMemo(() => {
    const now = new Date();
    const nowClockMinutes = now.getHours() * 60 + now.getMinutes();
    const logicalNowDate = new Date(now);
    if (nowClockMinutes < rolloverMinutes) {
      logicalNowDate.setDate(logicalNowDate.getDate() - 1);
    }
    const logicalWeekDay = logicalNowDate.getDay();
    const nowMinutes = getLogicalNowMinutes(now, rolloverMinutes);

    const personById = new Map(persons.map((p) => [p.id, p]));
    const eligiblePersonIds = activePerson?.canSeeAll
      ? [...new Set(notificationTargetIds)].filter((id) => personById.get(id)?.receivesNotifications !== false)
      : (personById.get(activePerson?.id)?.receivesNotifications === false ? [] : [activePerson?.id].filter(Boolean));

    return filteredMeds.reduce((acc, med) => {
      const plannedDose = parseInt(med.dailyDose, 10);
      if (!plannedDose || plannedDose <= 0) return acc;

      if (med.scheduleType === 'weekly') {
        const selectedDays = Array.isArray(med.weeklyDays)
          ? med.weeklyDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
          : [];
        if (!selectedDays.includes(logicalWeekDay)) return acc;
      }

      const isSharedMed = med.personId === 'all';
      const candidateIds = isSharedMed
        ? eligiblePersonIds
        : [med.personId || activePerson?.id].filter(Boolean);

      const targetIds = candidateIds.filter((id) => eligiblePersonIds.includes(id));
      if (targetIds.length === 0) return acc;

      const takenCount = targetIds.reduce((sum, id) => sum + (medUsageCounts[`${med.id}-${id}`] || 0), 0);

      const reminderTimes = Array.isArray(med.reminderTimes) ? med.reminderTimes : [];
      const reminderSlots = reminderTimes
        .map((t) => {
          const minutes = parseClockTimeToMinutes(t);
          if (minutes == null) return null;
          return adjustMinutesForRollover(minutes, rolloverMinutes);
        })
        .filter((minutes) => minutes !== null)
        .sort((a, b) => a - b)
        .slice(0, plannedDose);

      const pendingSlots = reminderSlots.slice(takenCount);
      const missed = pendingSlots.filter((slot) => nowMinutes > slot + snoozeAfterMinutes).length;
      if (missed <= 0) return acc;

      const ownerName = targetIds.length === 1
        ? (persons.find((p) => p.id === targetIds[0])?.name || 'Bilinmeyen')
        : 'Ortak';

      acc.push({
        id: med.id,
        name: med.name,
        ownerName,
        missed,
        takenCount,
        plannedDose,
      });

      return acc;
    }, []);
  }, [filteredMeds, medUsageCounts, persons, activePerson, rolloverMinutes, snoozeAfterMinutes, notificationTargetIds]);

  const handleDeleteExpired = (medId) => {
    const pDelete = async () => {
       try {
         setLoading(true);
         await editMed(medId, { isActive: false });
         await loadData();
       } catch(e) { 
           Alert.alert(t('error'), t('opFailed')); 
         setLoading(false); 
       }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(t('removeMedConfirm'))) pDelete();
    } else {
      Alert.alert(t('deleteMed'), t('removeMedConfirm'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: pDelete }
      ]);
    }
  };

  const handleTakeMed = async (med) => {
    try {
      // For shared meds, ask who is taking it
      if (med.personId === 'all') {
        const personOptions = persons.filter(p => p.id !== 'all');
        
        if (personOptions.length === 0) {
          Alert.alert(t('error'), t('errPersonNotFound'));
          return;
        }

        if (Platform.OS === 'web') {
          const personName = window.prompt(
            `${med.name} ${t('whoUsesQuestion')}\n\n${t('available')}: ${personOptions.map(p => p.name).join(', ')}`
          );
          if (!personName) return;
          const selectedPerson = personOptions.find(p => p.name === personName);
          if (selectedPerson) {
            await processTakeMed(med, selectedPerson.id, selectedPerson.name);
          } else {
            Alert.alert(t('error'), t('errInvalidPerson'));
          }
        } else {
          Alert.alert(
            `${med.name} - ${t('whoTookTitle')}`,
            t('whoTook'),
            [
              ...personOptions.map(person => ({
                text: person.name,
                onPress: () => processTakeMed(med, person.id, person.name)
              })),
              { text: t('cancel'), style: 'cancel' }
            ]
          );
        }
        return;
      }

      const takerId = med.personId || activePerson.id;
      const takerObj = persons.find(p => p.id === takerId) || activePerson;
      const takerName = takerObj.name || t('unknown');
      
      await processTakeMed(med, takerId, takerName);
    } catch (err) {
      Alert.alert(t('error'), `${t('errGenericOp')} ${err.message}`);
    }
  };

  const processTakeMed = async (med, takerId, takerName) => {
    try {
      const consumeAmount = parseFloat(med.consumePerUsage || 1);

      const proceed = async () => {
        // Dismiss currently shown notifications for this med
        // Expo notifications expose data under request.content.data
        try {
          const presented = await Notifications.getPresentedNotificationsAsync();
          const toRemove = presented.filter(
            (n) => String(n?.request?.content?.data?.medId || '') === String(med.id)
          );
          if (toRemove.length > 0) {
            for (const notif of toRemove) {
              const notifId = notif?.request?.identifier || notif?.identifier;
              if (notifId) {
                await Notifications.dismissNotificationAsync(notifId);
              }
            }
          } else {
            // Fallback for edge cases where presented list is empty but last response exists.
            const lastResponse = await Notifications.getLastNotificationResponseAsync();
            const lastMedId = String(lastResponse?.notification?.request?.content?.data?.medId || '');
            const lastNotifId = lastResponse?.notification?.request?.identifier;
            if (lastNotifId && lastMedId === String(med.id)) {
              await Notifications.dismissNotificationAsync(lastNotifId);
            }
          }
        } catch (_) {}

        // Optimistic UI update for immediate feedback on dashboard
        setMeds((prev) => prev.map((item) => {
          if (item.id !== med.id) return item;
          const currentQty = parseFloat(item.quantity || 0);
          const nextQty = Math.max(0, currentQty - consumeAmount);
          return { ...item, quantity: String(nextQty) };
        }));

        setLogs((prev) => [
          {
            id: `tmp-${Date.now()}`,
            medId: med.id,
            medName: med.name,
            personId: takerId,
            takerName,
            date: new Date().toLocaleDateString('tr-TR'),
            time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
            timestamp: Date.now(),
            dosage: String(consumeAmount),
          },
          ...prev,
        ]);

        const success = await markAsTaken(med.id, takerId, consumeAmount, med.name, takerName);
        if (success) {
          await loadData();
        } else {
          Alert.alert(t('error'), t('errSaveFailed'));
          await loadData();
        }
      };

      const countKey = `${med.id}-${takerId}`;
      const currentCount = medUsageCounts[countKey] || 0;

      if (med.dailyDose && currentCount >= med.dailyDose) {
        if (Platform.OS === 'web') {
          if (window.confirm(t('doseLimitConfirm'))) proceed();
        } else {
          Alert.alert(t('doseLimitReached'), t('doseLimitConfirm'), [
            { text: t('cancel'), style: 'cancel' },
            { text: t('yes'), onPress: proceed }
          ]);
        }
      } else {
        await proceed();
      }
    } catch (err) {
      Alert.alert(t('error'), `${t('errGenericOp')} ${err.message}`);
    }
  };

  const handleSnoozeMed = async (med, minutes) => {
    try {
      const result = await scheduleReminderSnooze({
        medId: med.id,
        medName: med.name,
        minutes,
        targetPersonId: activePerson?.id,
        targetPersonName: activePerson?.name,
      });
      const formatted = result?.triggerDate
        ? result.triggerDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : null;

      if (result?.triggerDate) {
        setSnoozedReminderByMed((prev) => ({
          ...prev,
          [med.id]: {
            triggerDate: result.triggerDate,
            targetPersonName: activePerson?.name || '',
          },
        }));
      }

      Alert.alert(
        t('alarmSnoozed'),
        formatted
          ? `${med.name} ${t('alarmSnoozedAt')} ${formatted}.`
          : `${med.name} ${minutes} ${t('alarmSnoozedMin')}`
      );
    } catch (err) {
      if (err?.message === 'NOTIFICATION_PERMISSION_DENIED') {
        Alert.alert(t('permRequired'), t('notifPermForSnooze'));
      } else {
        Alert.alert(t('error'), t('opFailed'));
      }
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>;

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        
        {/* Hoşgeldin Paneli */}
        <View style={styles.welcomeBox}>
          <Text style={styles.welcomeTitle}>{t('hello')}, {activePerson?.name} 👋</Text>
          <Text style={styles.welcomeSub}>{t('activeMeds')}</Text>
          <View style={[styles.syncBadge, pendingSyncCount > 0 ? styles.syncBadgePending : styles.syncBadgeOk]}>
            <Text style={[styles.syncBadgeText, pendingSyncCount > 0 ? styles.syncBadgeTextPending : styles.syncBadgeTextOk]}>
              {pendingSyncCount > 0 ? `${t('syncPending')}: ${pendingSyncCount}` : t('syncUpToDate')}
            </Text>
          </View>
        </View>

        {/* Arama Çubuğu */}
        <View style={styles.searchBox}>
          <Search color="#9CA3AF" size={20} />
          <TextInput 
            style={styles.searchInput} 
            placeholder={t('searchMed')} 
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Kaçırılan Doz Özeti */}
        {missedDoseItems.length > 0 && (
          <TouchableOpacity
            style={styles.missedSummaryBox}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('logs', { focusMissedDosesKey: Date.now() })}
          >
            <AlertCircle color="#B45309" size={14} />
            <Text style={styles.missedSummaryText}>{t('missedDose')} {missedDoseItems.reduce((sum, item) => sum + item.missed, 0)}</Text>
          </TouchableOpacity>
        )}

        {/* SKT Uyarısı */}
        {expiredMeds.length > 0 && (
          <View style={styles.alertPanel}>
            <View style={styles.alertHeader}>
              <AlertCircle color="#fff" size={20} />
              <Text style={styles.alertTitle}>{t('expiredMedsAlert')}</Text>
            </View>
            {expiredMeds.map(med => (
              <View key={med.id} style={styles.alertItem}>
                <Text style={styles.alertItemName}>{med.name}</Text>
                <TouchableOpacity onPress={() => handleDeleteExpired(med.id)} style={styles.alertDeleteBtn}>
                  <Text style={{color: '#fff', fontSize: 11, fontWeight: 'bold'}}>Sil</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Kişi Filtreleri (Chips) - Sadece Yöneticiye Görünür */}
        {activePerson?.canSeeAll && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
             <TouchableOpacity 
               style={[styles.chip, filterPerson === 'all' && styles.chipActive]} 
               onPress={() => setFilterPerson('all')}
             >
               <Text style={[styles.chipText, filterPerson === 'all' && {color: '#fff'}]}>{t('allFamily')}</Text>
             </TouchableOpacity>
             {persons.map(p => (
               <TouchableOpacity 
                 key={p.id} 
                 style={[styles.chip, filterPerson === p.id && styles.chipActive]} 
                 onPress={() => setFilterPerson(p.id)}
               >
                 <Text style={[styles.chipText, filterPerson === p.id && {color: '#fff'}]}>{p.name}</Text>
               </TouchableOpacity>
             ))}
          </ScrollView>
        )}

        {/* İlaç Kartları */}
        {filteredMeds.length === 0 ? (
          <View style={styles.emptyBox}><Text style={styles.emptyText}>{t('noMedFound')}</Text></View>
        ) : filteredMeds.map(med => {
          const takerId = (med.personId && med.personId !== 'all') ? med.personId : activePerson.id;
          const count = medUsageCounts[`${med.id}-${takerId}`] || 0;
          const isLimitReached = med.dailyDose && count >= med.dailyDose;
          const reminderTimes = Array.isArray(med.reminderTimes) ? med.reminderTimes.filter(Boolean) : [];
          const nowLogicalMinutes = getLogicalNowMinutes(new Date(), rolloverMinutes);
          const selectedWeekDays = Array.isArray(med.weeklyDays)
            ? med.weeklyDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
            : [];
          const isScheduledToday = med.scheduleType !== 'weekly' || selectedWeekDays.includes(logicalWeekDay);
          const reminderSlots = reminderTimes
            .map((t) => {
              const minutes = parseClockTimeToMinutes(t);
              if (minutes == null) return null;
              return adjustMinutesForRollover(minutes, rolloverMinutes);
            })
            .filter((minutes) => minutes !== null)
            .sort((a, b) => a - b);
          const pendingSlots = reminderSlots.slice(count, Math.max(count, parseInt(med.dailyDose, 10) || reminderSlots.length));
          const canSnoozeNow = isScheduledToday && !isLimitReached && pendingSlots.some(
            (slot) => nowLogicalMinutes >= (slot - snoozeBeforeMinutes) && nowLogicalMinutes <= (slot + snoozeAfterMinutes)
          );
          const snoozeInfo = snoozedReminderByMed[med.id];
          const nextReminderDate = snoozeInfo?.triggerDate;
          const nextReminderLabel = nextReminderDate
            ? nextReminderDate.toLocaleString(language === 'en' ? 'en-GB' : 'tr-TR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
            : null;

          return (
            <View key={med.id} style={styles.medCard}>
              <View style={styles.medTop}>
                <View style={[styles.iconBox, {backgroundColor: med.form === 'Şurup' ? '#FDF2F8' : '#ECFDF5'}]}>
                  {med.form === 'Şurup' ? <Text style={{fontSize: 20}}>🥤</Text> : <Pill color="#059669" size={24} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Text style={styles.medName}>{med.name}</Text>
                    <View style={[styles.badge, {backgroundColor: med.form === 'Şurup' ? '#FDF2F8' : '#ECFDF5'}]}>
                      <Text style={[styles.badgeText, {color: med.form === 'Şurup' ? '#DB2777' : '#059669'}]}>{translateMedicineForm(med.form, t)}</Text>
                    </View>
                  {med.personId && (
                      <Text style={styles.ownerText}>
                        • {med.personId === 'all' ? t('shared') : (persons.find(p => p.id === med.personId)?.name || t('unknown'))}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.medSub}>{t('stock')} {med.quantity} {translateMedicineUnit(med.unit, t)} | {t('today')} {count}/{med.dailyDose || '-'}</Text>
                  
                  {/* Alarm Saatleri */}
                  {reminderTimes.length > 0 && (
                    <View style={styles.reminderRow}>
                      {reminderTimes.map((t, idx) => (
                        <View key={idx} style={styles.timeTag}>
                          <Clock size={10} color="#059669" />
                          <Text style={styles.timeTagText}>{t}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {nextReminderLabel && (
                    <View style={styles.snoozedInfoTag}>
                      <Clock size={11} color="#92400E" />
                      <Text style={styles.snoozedInfoText}>
                        {t('snoozedNextReminder')}: {nextReminderLabel}
                      </Text>
                    </View>
                  )}

                  {!isScheduledToday && (
                    <View style={styles.notPlannedTag}>
                      <Text style={styles.notPlannedTagText}>{t('notScheduledToday')}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.medBottom}>
                <Text style={styles.infoText}>{med.consumePerUsage} {translateMedicineUnit(med.unit, t)} {t('willUse')}</Text>
                <View style={styles.actionRow}>
                  {canSnoozeNow && (
                    <TouchableOpacity
                      style={styles.snoozeBtn}
                      onPress={() =>
                        Alert.alert(t('snoozeAlarm'), `${med.name} ${t('snoozeFor')}?`, [
                          { text: t('cancel'), style: 'cancel' },
                          { text: t('alarm10'), onPress: () => handleSnoozeMed(med, 10) },
                          { text: t('alarm30'), onPress: () => handleSnoozeMed(med, 30) },
                        ])
                      }
                    >
                      <Clock color="#B45309" size={16} />
                      <Text style={styles.snoozeBtnText}>{t('snooze')}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                     style={[styles.btn, isLimitReached && {backgroundColor:'#D1D5DB'}]} 
                     onPress={() => handleTakeMed(med)}
                     disabled={isLimitReached}
                  >
                    <Check color="#fff" size={18} />
                    <Text style={styles.btnText}>{isLimitReached ? t('doseFull') : t('use')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  welcomeBox: { marginBottom: 20 },
  welcomeTitle: { fontSize: 22, fontWeight: 'bold', color: '#111827' },
  welcomeSub: { fontSize: 14, color: '#6B7280' },
  syncBadge: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  syncBadgePending: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  syncBadgeOk: { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
  syncBadgeText: { fontSize: 11, fontWeight: '700' },
  syncBadgeTextPending: { color: '#92400E' },
  syncBadgeTextOk: { color: '#065F46' },
  alertPanel: { backgroundColor: '#EF4444', borderRadius: 16, padding: 12, marginBottom: 20 },
  alertHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  alertTitle: { color: '#fff', fontWeight: 'bold', fontSize: 12, marginLeft: 8 },
  alertItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 8, marginBottom: 4 },
  alertItemName: { color: '#fff', fontSize: 13 },
  alertDeleteBtn: { backgroundColor: '#000', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  missedSummaryBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12, borderWidth: 1, borderColor: '#FCD34D' },
  missedSummaryText: { fontSize: 12, color: '#92400E', fontWeight: '700', marginLeft: 6 },
  chipScroll: { flexDirection: 'row', marginBottom: 20 },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', marginRight: 10, borderWidth: 1, borderColor: '#D1D5DB' },
  chipActive: { backgroundColor: '#059669', borderColor: '#059669' },
  chipText: { fontSize: 13, fontWeight: 'bold', color: '#4B5563' },
  medCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2 },
  medTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  medName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  ownerText: { fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginLeft: 8 },
  badge: { marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  medSub: { fontSize: 12, color: '#6B7280' },
  medBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 12 },
  infoText: { fontSize: 12, color: '#4B5563' },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  snoozeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, marginRight: 8 },
  snoozeBtnText: { color: '#92400E', fontWeight: '700', fontSize: 12, marginLeft: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#059669', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13, marginLeft: 5 },
  reminderRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 5 },
  timeTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 5, marginBottom: 2, borderWidth: 1, borderColor: '#D1D5DB' },
  timeTagText: { fontSize: 10, color: '#059669', fontWeight: 'bold', marginLeft: 3 },
  snoozedInfoTag: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  snoozedInfoText: { marginLeft: 5, fontSize: 11, color: '#92400E', fontWeight: '700' },
  notPlannedTag: { marginTop: 8, backgroundColor: '#FFEDD5', borderWidth: 1, borderColor: '#FDBA74', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  notPlannedTagText: { fontSize: 11, color: '#9A3412', fontWeight: '700' },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#9CA3AF', fontStyle: 'italic' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB', height: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: '#111827' }
});
