import React, { useState, useCallback, useMemo } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  ActivityIndicator, Alert, Platform, TextInput
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getMeds, getPersons, getLogs, markAsTaken, editMed, repairAllMedsData, getDayRolloverTime, getSnoozeWindowSettings } from '../utils/storage';
import { parseRolloverToMinutes, parseClockTimeToMinutes, adjustMinutesForRollover, getLogicalDateKeyForNow, getLogicalDateKeyForLog, getLogicalNowMinutes } from '../utils/dayRollover';
import { scheduleReminderSnooze, cancelMedReminders } from '../utils/notifications';
import { 
  Check, AlertCircle, Pill, Clock, Search
} from 'lucide-react-native';

export default function DashboardScreen({ activePerson }) {
  const [meds, setMeds] = useState([]);
  const [persons, setPersons] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterPerson, setFilterPerson] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [rolloverTime, setRolloverTime] = useState('00:00');
  const [snoozeBeforeMinutes, setSnoozeBeforeMinutes] = useState(60);
  const [snoozeAfterMinutes, setSnoozeAfterMinutes] = useState(120);

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

  const loadData = async () => {
    try {
      const m = await getMeds();
      const p = await getPersons();
      const l = await getLogs();
      const rt = await getDayRolloverTime();
      const snoozeCfg = await getSnoozeWindowSettings();
      
      setMeds(m);
      setPersons(p);
      setLogs(l);
      setRolloverTime(rt);
      setSnoozeBeforeMinutes(snoozeCfg.beforeMinutes);
      setSnoozeAfterMinutes(snoozeCfg.afterMinutes);

      if (activePerson && !activePerson.canSeeAll) {
        setFilterPerson(activePerson.id);
      }
      
      await repairAllMedsData();
    } catch (err) {
      console.error("Load Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, [activePerson]));

  const filteredMeds = useMemo(() => {
    let list = meds.filter(med => med.isActive !== false);
    
    // Eğer arama yapılıyorsa TÜM dolabı tara (Kişi filtresini baypas et)
    if (searchQuery.trim()) {
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

    return filteredMeds.reduce((acc, med) => {
      const plannedDose = parseInt(med.dailyDose, 10);
      if (!plannedDose || plannedDose <= 0) return acc;

      if (med.scheduleType === 'weekly') {
        const selectedDays = Array.isArray(med.weeklyDays)
          ? med.weeklyDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
          : [];
        if (!selectedDays.includes(logicalWeekDay)) return acc;
      }

      const takerId = (med.personId && med.personId !== 'all') ? med.personId : activePerson.id;
      const countKey = `${med.id}-${takerId}`;
      const takenCount = medUsageCounts[countKey] || 0;

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

      const ownerName = takerId === 'all'
        ? 'Ortak'
        : (persons.find((p) => p.id === takerId)?.name || 'Bilinmeyen');

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
  }, [filteredMeds, medUsageCounts, persons, activePerson, rolloverMinutes, snoozeAfterMinutes]);

  const handleDeleteExpired = (medId) => {
    const pDelete = async () => {
       try {
         setLoading(true);
         await editMed(medId, { isActive: false });
         await loadData();
       } catch(e) { 
         Alert.alert("Hata", "İşlem başarısız."); 
         setLoading(false); 
       }
    };
    if (Platform.OS === 'web') {
       if (window.confirm("Bu ilacı imha etmek istiyor musunuz?")) pDelete();
    } else {
      Alert.alert("İlacı Sil", "Bu ilacı dolaptan kaldırmak istiyor musunuz?", [
        { text: "Vazgeç", style: "cancel" },
        { text: "Sil", style: "destructive", onPress: pDelete }
      ]);
    }
  };

  const handleTakeMed = async (med) => {
    try {
      // For shared meds, ask who is taking it
      if (med.personId === 'all') {
        const personOptions = persons.filter(p => p.id !== 'all');
        
        if (personOptions.length === 0) {
          Alert.alert("Hata", "Kişi bulunamadı.");
          return;
        }

        if (Platform.OS === 'web') {
          const personName = window.prompt(
            `${med.name} kimin tarafından kullanılıyor?\n\nKullanılabilir: ${personOptions.map(p => p.name).join(', ')}`
          );
          if (!personName) return;
          const selectedPerson = personOptions.find(p => p.name === personName);
          if (selectedPerson) {
            await processTakeMed(med, selectedPerson.id, selectedPerson.name);
          } else {
            Alert.alert("Hata", "Geçersiz kişi ismi.");
          }
        } else {
          Alert.alert(
            `${med.name} - Kimin kullandığı?`,
            "Lütfen seçin:",
            [
              ...personOptions.map(person => ({
                text: person.name,
                onPress: () => processTakeMed(med, person.id, person.name)
              })),
              { text: "İptal", style: "cancel" }
            ]
          );
        }
        return;
      }

      const takerId = med.personId || activePerson.id;
      const takerObj = persons.find(p => p.id === takerId) || activePerson;
      const takerName = takerObj.name || 'Bilinmeyen';
      
      await processTakeMed(med, takerId, takerName);
    } catch (err) {
      Alert.alert("Hata", "Bir sorun oluştu: " + err.message);
    }
  };

  const processTakeMed = async (med, takerId, takerName) => {
    try {
      const proceed = async () => {
        setLoading(true);
        // Cancel any scheduled notifications for this med
        await cancelMedReminders(med);
        const success = await markAsTaken(med.id, takerId, parseFloat(med.consumePerUsage || 1), med.name, takerName);
        if (success) {
          await loadData();
        } else {
          Alert.alert("Hata", "İşlem kaydedilemedi.");
          setLoading(false);
        }
      };

      const countKey = `${med.id}-${takerId}`;
      const currentCount = medUsageCounts[countKey] || 0;

      if (med.dailyDose && currentCount >= med.dailyDose) {
        if (Platform.OS === 'web') {
          if (window.confirm("Günlük doz sınırına ulaştınız. Yine de devam edilsin mi?")) proceed();
        } else {
          Alert.alert("Doz Sınırı! ⚠️", "Sınıra ulaştınız. Yine de devam edilsin mi?", [
            { text: "Vazgeç", style: "cancel" },
            { text: "Evet", onPress: proceed }
          ]);
        }
      } else {
        await proceed();
      }
    } catch (err) {
      Alert.alert("Hata", "Bir sorun oluştu: " + err.message);
    }
  };

  const handleSnoozeMed = async (med, minutes) => {
    try {
      const result = await scheduleReminderSnooze({
        medId: med.id,
        medName: med.name,
        minutes,
      });
      const formatted = result?.triggerDate
        ? result.triggerDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
        : null;
      Alert.alert(
        'Alarm Ertelendi',
        formatted
          ? `${med.name} için hatırlatma ${formatted} saatine ertelendi.`
          : `${med.name} için hatırlatma ${minutes} dakika sonrasına ertelendi.`
      );
    } catch (err) {
      if (err?.message === 'NOTIFICATION_PERMISSION_DENIED') {
        Alert.alert('İzin Gerekli', 'Alarm ertelemek için bildirim izni gerekli.');
      } else {
        Alert.alert('Hata', 'Alarm ertelenemedi.');
      }
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color="#059669" /></View>;

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        
        {/* Hoşgeldin Paneli */}
        <View style={styles.welcomeBox}>
          <Text style={styles.welcomeTitle}>Merhaba, {activePerson?.name} 👋</Text>
          <Text style={styles.welcomeSub}>Aktif ilaç listesi:</Text>
        </View>

        {/* Arama Çubuğu */}
        <View style={styles.searchBox}>
          <Search color="#9CA3AF" size={20} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="İlaç ara..." 
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Kaçırılan Doz Özeti */}
        {missedDoseItems.length > 0 && (
          <View style={styles.missedSummaryBox}>
            <AlertCircle color="#B45309" size={14} />
            <Text style={styles.missedSummaryText}>Bugün kaçırılan doz: {missedDoseItems.reduce((sum, item) => sum + item.missed, 0)}</Text>
          </View>
        )}

        {/* SKT Uyarısı */}
        {expiredMeds.length > 0 && (
          <View style={styles.alertPanel}>
            <View style={styles.alertHeader}>
              <AlertCircle color="#fff" size={20} />
              <Text style={styles.alertTitle}>SKT'Sİ GEÇEN İLAÇLAR VAR!</Text>
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
               <Text style={[styles.chipText, filterPerson === 'all' && {color: '#fff'}]}>Tüm Aile</Text>
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
          <View style={styles.emptyBox}><Text style={styles.emptyText}>Bu kişi için ilaç bulunamadı.</Text></View>
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

          return (
            <View key={med.id} style={styles.medCard}>
              <View style={styles.medTop}>
                <View style={[styles.iconBox, {backgroundColor: med.form === 'Şurup' ? '#FDF2F8' : '#ECFDF5'}]}>
                  {med.form === 'Şurup' ? <Text style={{fontSize: 20}}>🧪</Text> : <Pill color="#059669" size={24} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{flexDirection:'row', alignItems:'center'}}>
                    <Text style={styles.medName}>{med.name}</Text>
                    <View style={[styles.badge, {backgroundColor: med.form === 'Şurup' ? '#FDF2F8' : '#ECFDF5'}]}>
                      <Text style={[styles.badgeText, {color: med.form === 'Şurup' ? '#DB2777' : '#059669'}]}>{med.form || 'Tablet'}</Text>
                    </View>
                    {/* Sahibi Göster (Özellikle genel aramada faydalı) */}
                    {med.personId && (
                      <Text style={styles.ownerText}>
                        • {med.personId === 'all' ? 'Ortak' : (persons.find(p => p.id === med.personId)?.name || 'Bilinmeyen')}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.medSub}>Stok: {med.quantity} {med.unit} | Bugün: {count}/{med.dailyDose || '-'}</Text>
                  
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

                  {!isScheduledToday && (
                    <View style={styles.notPlannedTag}>
                      <Text style={styles.notPlannedTagText}>Bugun kullanilmayacak</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={styles.medBottom}>
                <Text style={styles.infoText}>{med.consumePerUsage} {med.unit} kullanılacak</Text>
                <View style={styles.actionRow}>
                  {canSnoozeNow && (
                    <TouchableOpacity
                      style={styles.snoozeBtn}
                      onPress={() =>
                        Alert.alert('Alarm Ertele', `${med.name} için alarm ne kadar ertelensin?`, [
                          { text: 'Vazgeç', style: 'cancel' },
                          { text: '10 dk', onPress: () => handleSnoozeMed(med, 10) },
                          { text: '30 dk', onPress: () => handleSnoozeMed(med, 30) },
                        ])
                      }
                    >
                      <Clock color="#B45309" size={16} />
                      <Text style={styles.snoozeBtnText}>Ertele</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity 
                     style={[styles.btn, isLimitReached && {backgroundColor:'#D1D5DB'}]} 
                     onPress={() => handleTakeMed(med)}
                     disabled={isLimitReached}
                  >
                    <Check color="#fff" size={18} />
                    <Text style={styles.btnText}>{isLimitReached ? 'Doz Doldu' : 'Kullan'}</Text>
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
  notPlannedTag: { marginTop: 8, backgroundColor: '#FFEDD5', borderWidth: 1, borderColor: '#FDBA74', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  notPlannedTagText: { fontSize: 11, color: '#9A3412', fontWeight: '700' },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#9CA3AF', fontStyle: 'italic' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB', height: 46 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16, color: '#111827' }
});
