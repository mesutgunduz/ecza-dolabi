import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Linking
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getLogs, getMeds, getPersons, deleteLog, markAsTaken, getDayRolloverTime } from '../utils/storage';
import { parseRolloverToMinutes, parseClockTimeToMinutes, adjustMinutesForRollover, getLogicalDateKeyForNow, getLogicalDateKeyForLog, getLogicalNowMinutes } from '../utils/dayRollover';
import { Clock, User, Trash2, Pill, Share2, Check } from 'lucide-react-native';

export default function LogsScreen({ activePerson }) {
  const [logs, setLogs] = useState([]);
  const [persons, setPersons] = useState([]);
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rolloverTime, setRolloverTime] = useState('00:00');

  const rolloverMinutes = useMemo(() => parseRolloverToMinutes(rolloverTime), [rolloverTime]);
  const logicalTodayKey = useMemo(() => getLogicalDateKeyForNow(new Date(), rolloverMinutes), [rolloverMinutes]);

  const loadData = async () => {
    try {
      setLoading(true);
      const l = await getLogs();
      const p = await getPersons();
      const m = await getMeds();
      const rt = await getDayRolloverTime();

      let filtered = l;
      if (activePerson && !activePerson.canSeeAll) {
        filtered = l.filter(log => log.personId === activePerson.id);
      }

      setLogs(filtered);
      setPersons(p);
      setMeds(m.filter(x => x.isActive !== false));
      setRolloverTime(rt);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, [activePerson]));

  const missedDoseItems = useMemo(() => {
    const now = new Date();
    const nowMinutes = getLogicalNowMinutes(now, rolloverMinutes);

    const todayLogs = logs.filter(l => getLogicalDateKeyForLog(l, rolloverMinutes) === logicalTodayKey);
    const counts = {};
    todayLogs.forEach(log => {
      const key = `${log.medId}-${log.personId}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    return meds.reduce((acc, med) => {
      const plannedDose = parseInt(med.dailyDose, 10);
      if (!plannedDose || plannedDose <= 0) return acc;

      const takerId = (med.personId && med.personId !== 'all') ? med.personId : activePerson.id;
      if (activePerson && !activePerson.canSeeAll && takerId !== activePerson.id) return acc;

      const countKey = `${med.id}-${takerId}`;
      const takenCount = counts[countKey] || 0;

      const reminderTimes = Array.isArray(med.reminderTimes) ? med.reminderTimes : [];
      const dueCount = reminderTimes
        .map((t) => {
          const minutes = parseClockTimeToMinutes(t);
          if (minutes == null) return null;
          return adjustMinutesForRollover(minutes, rolloverMinutes);
        })
        .filter((minutes) => minutes !== null && minutes <= nowMinutes).length;

      if (dueCount <= takenCount) return acc;

      const missed = Math.max(0, Math.min(plannedDose, dueCount) - takenCount);
      if (missed <= 0) return acc;

      const ownerName = takerId === 'all'
        ? 'Ortak'
        : (persons.find((p) => p.id === takerId)?.name || 'Bilinmeyen');

      acc.push({
        id: med.id,
        medName: med.name,
        ownerName,
        takerId,
        consumePerUsage: parseFloat(med.consumePerUsage || 1),
        missed,
        takenCount,
        plannedDose,
      });

      return acc;
    }, []);
  }, [logs, meds, persons, activePerson, rolloverMinutes, logicalTodayKey]);

  const getPersonDisplayName = (log) => {
    if (log.takerName) return log.takerName;

    const p = persons.find(x => x.id === log.personId);
    if (p) return p.name;

    if (log.personId === 'all' || !log.personId) return 'Ortak';

    return `Silinmiş Kullanıcı (ID: ${log.personId ? log.personId.substring(0, 6) : '?'})`;
  };

  const handleDelete = (id) => {
    Alert.alert('Kaydı Sil', 'Bu geçmiş kaydını silmek istiyor musunuz?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await deleteLog(id);
          loadData();
        }
      }
    ]);
  };

  const handleShare = async (log) => {
    const personName = getPersonDisplayName(log);
    const message = `💊 ${personName}, ${log.medName || 'İlaç'} ilacından ${log.dosage || 1} birim kullandı.\n📅 Tarih: ${log.date}\n⏰ Saat: ${log.time}`;
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;

    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Hata', 'WhatsApp uygulaması bulunamadı veya açılamıyor. Yüklü olduğundan emin olun.');
    }
  };

  const handleQuickUseMissed = async (item) => {
    try {
      setLoading(true);
      const success = await markAsTaken(
        item.id,
        item.takerId,
        item.consumePerUsage,
        item.medName,
        item.ownerName
      );

      if (!success) {
        Alert.alert('Hata', 'Kullanım kaydı eklenemedi.');
      }
      await loadData();
    } catch (error) {
      Alert.alert('Hata', 'Kullanım kaydı eklenemedi.');
      setLoading(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;

  return (
    <View style={styles.container}>
      {missedDoseItems.length > 0 && (
        <View style={styles.missedPanel}>
          <Text style={styles.missedTitle}>Bugün Kaçırılan Dozlar</Text>
          {missedDoseItems.map(item => (
            <View key={item.id} style={styles.missedItem}>
              <View style={{ flex: 1 }}>
                <Text style={styles.missedItemName}>{item.medName} • {item.ownerName}</Text>
                <Text style={styles.missedItemMeta}>Kaçırılan: {item.missed} | Alınan: {item.takenCount}/{item.plannedDose}</Text>
              </View>
              <TouchableOpacity style={styles.quickUseBtn} onPress={() => handleQuickUseMissed(item)}>
                <Check color="#fff" size={14} />
                <Text style={styles.quickUseBtnText}>Hızlı Kullan</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <FlatList
        data={logs}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Clock color="#059669" size={20} />
            </View>
            <View style={styles.content}>
              <Text style={styles.medName}>{item.medName || 'İlaç'}</Text>
              <Text style={styles.dateText}>{item.date} - {item.time}</Text>
              <View style={styles.tagRow}>
                <View style={styles.tag}>
                  <User color="#4B5563" size={12} />
                  <Text style={styles.tagText}>{getPersonDisplayName(item)}</Text>
                </View>
                <View style={[styles.tag, { backgroundColor: '#FEF2F2' }]}>
                  <Pill color="#EF4444" size={12} />
                  <Text style={[styles.tagText, { color: '#EF4444' }]}>{item.dosage || 1} Birim</Text>
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity onPress={() => handleShare(item)} style={styles.actionBtn}>
                <Share2 color="#25D366" size={20} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionBtn}>
                <Trash2 color="#EF4444" size={20} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Henüz bir kayıt yok.</Text>}
        contentContainerStyle={{ padding: 16, paddingTop: missedDoseItems.length > 0 ? 6 : 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  missedPanel: { margin: 16, marginBottom: 0, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FCD34D', borderRadius: 12, padding: 10 },
  missedTitle: { fontSize: 13, fontWeight: 'bold', color: '#92400E', marginBottom: 6 },
  missedItem: { backgroundColor: '#FFF7ED', borderRadius: 8, padding: 8, marginBottom: 6, borderWidth: 1, borderColor: '#FED7AA', flexDirection: 'row', alignItems: 'center' },
  missedItemName: { fontSize: 12, fontWeight: '700', color: '#7C2D12' },
  missedItemMeta: { fontSize: 11, color: '#9A3412', marginTop: 2 },
  quickUseBtn: { backgroundColor: '#059669', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  quickUseBtnText: { color: '#fff', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  content: { flex: 1 },
  medName: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  dateText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  tagRow: { flexDirection: 'row', marginTop: 8, gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagText: { fontSize: 11, color: '#4B5563', fontWeight: 'bold', marginLeft: 4 },
  actionBtn: { padding: 8, marginLeft: 4 },
  empty: { textAlign: 'center', marginTop: 50, color: '#9CA3AF', fontStyle: 'italic' }
});
