import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Linking, ScrollView, Modal, TextInput, AppState, PanResponder
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getLogs, getMeds, getPersons, deleteLog, editLog, markAsTaken, getDayRolloverTime, getSnoozeWindowSettings } from '../utils/storage';
import { parseRolloverToMinutes, parseClockTimeToMinutes, adjustMinutesForRollover, getLogicalDateKeyForNow, getLogicalDateKeyForLog, getLogicalNowMinutes } from '../utils/dayRollover';
import { Clock, User, Trash2, Pill, Share2, Check, BarChart2, ScrollText, Edit2 } from 'lucide-react-native';

export default function LogsScreen({ activePerson, dataRefreshKey = 0 }) {
  const [logs, setLogs] = useState([]);
  const [persons, setPersons] = useState([]);
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rolloverTime, setRolloverTime] = useState('00:00');
  const [activeTab, setActiveTab] = useState('history'); // 'history' | 'stats'
  const [snoozeAfterMinutes, setSnoozeAfterMinutes] = useState(120);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [editTimeInput, setEditTimeInput] = useState('');

  const swipeResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => (
        Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
      ),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50 && activeTab === 'history') {
          setActiveTab('stats');
        }
        if (gestureState.dx > 50 && activeTab === 'stats') {
          setActiveTab('history');
        }
      },
    }),
    [activeTab]
  );

  const rolloverMinutes = useMemo(() => parseRolloverToMinutes(rolloverTime), [rolloverTime]);
  const logicalTodayKey = useMemo(() => getLogicalDateKeyForNow(new Date(), rolloverMinutes), [rolloverMinutes]);

  const loadData = async () => {
    try {
      setLoading(true);
      const l = await getLogs();
      const p = await getPersons();
      const m = await getMeds();
      const rt = await getDayRolloverTime();
      const snoozeCfg = await getSnoozeWindowSettings();

      let filtered = l;
      if (activePerson && !activePerson.canSeeAll) {
        filtered = l.filter(log => log.personId === activePerson.id);
      }

      setLogs(filtered);
      setPersons(p);
      setMeds(m.filter(x => x.isActive !== false));
      setRolloverTime(rt);
      setSnoozeAfterMinutes(snoozeCfg.afterMinutes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadData(); }, [activePerson]));

  useEffect(() => {
    loadData();
  }, [dataRefreshKey]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        loadData();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [activePerson, dataRefreshKey]);

  const missedDoseItems = useMemo(() => {
    const now = new Date();
    const nowClockMinutes = now.getHours() * 60 + now.getMinutes();
    const logicalNowDate = new Date(now);
    if (nowClockMinutes < rolloverMinutes) {
      logicalNowDate.setDate(logicalNowDate.getDate() - 1);
    }
    const logicalWeekDay = logicalNowDate.getDay();
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

      if (med.scheduleType === 'weekly') {
        const selectedDays = Array.isArray(med.weeklyDays)
          ? med.weeklyDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
          : [];
        if (!selectedDays.includes(logicalWeekDay)) return acc;
      }

      const isSharedMed = med.personId === 'all';
      const takerId = isSharedMed ? 'all' : med.personId;

      if (!isSharedMed && activePerson && !activePerson.canSeeAll && takerId !== activePerson.id) return acc;

      let takenCount = 0;
      if (isSharedMed) {
        if (activePerson?.canSeeAll) {
          takenCount = Object.entries(counts)
            .filter(([key]) => key.startsWith(`${med.id}-`))
            .reduce((sum, [, value]) => sum + value, 0);
        } else {
          const ownKey = `${med.id}-${activePerson.id}`;
          takenCount = counts[ownKey] || 0;
        }
      } else {
        const countKey = `${med.id}-${takerId}`;
        takenCount = counts[countKey] || 0;
      }

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

      const ownerName = isSharedMed
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
  }, [logs, meds, persons, activePerson, rolloverMinutes, logicalTodayKey, snoozeAfterMinutes]);

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

  const handleEditTime = (log) => {
    setEditingLog(log);
    setEditTimeInput(log?.time || '00:00');
    setEditModalVisible(true);
  };

  const handleSaveEditedTime = async () => {
    const newTime = String(editTimeInput || '').trim();
    if (!newTime || !newTime.match(/^\d{2}:\d{2}$/)) {
      Alert.alert('Hata', 'HH:MM formatında girin (örn: 14:30)');
      return;
    }

    const [hours, minutes] = newTime.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      Alert.alert('Hata', 'Geçerli bir saat girin');
      return;
    }

    if (!editingLog?.id) return;

    try {
      await editLog(editingLog.id, { time: newTime });
      setEditModalVisible(false);
      setEditingLog(null);
      setEditTimeInput('');
      await loadData();
      Alert.alert('Başarılı', 'Saat güncellendi');
    } catch (err) {
      Alert.alert('Hata', 'Saat güncellenemedi');
    }
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

  const statsData = useMemo(() => {
    const now = new Date();
    const results = [];

    const getDayTakenCount = (medId, dateKey, takerId) => {
      return logs.filter((l) => (
        l.medId === medId &&
        l.personId === takerId &&
        getLogicalDateKeyForLog(l, rolloverMinutes) === dateKey
      )).length;
    };

    for (const med of meds) {
      const plannedDose = parseInt(med.dailyDose, 10);
      if (!plannedDose || plannedDose <= 0) continue;

      const calcStats = (days, takerId) => {
        let totalPlanned = 0;
        let totalTaken = 0;

        for (let i = 0; i < days; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dateKey = getLogicalDateKeyForNow(d, rolloverMinutes);

          if (med.scheduleType === 'weekly') {
            const selectedDays = Array.isArray(med.weeklyDays)
              ? med.weeklyDays.map(x => Number(x)).filter(x => x >= 0 && x <= 6)
              : [];
            const wd = d.getDay();
            if (!selectedDays.includes(wd)) continue;
          }

          totalPlanned += plannedDose;
          const dayTaken = getDayTakenCount(med.id, dateKey, takerId);
          totalTaken += Math.min(dayTaken, plannedDose);
        }

        const rate = totalPlanned > 0 ? Math.round((totalTaken / totalPlanned) * 100) : null;
        return { totalPlanned, totalTaken, rate };
      };

      const isSharedMed = med.personId === 'all';
      if (!isSharedMed) {
        const takerId = med.personId;
        if (activePerson && !activePerson.canSeeAll && takerId !== activePerson.id) continue;

        const ownerName = persons.find((p) => p.id === takerId)?.name || 'Bilinmeyen';
        results.push({
          id: `${med.id}-${takerId}`,
          name: med.name,
          ownerName,
          week: calcStats(7, takerId),
          month: calcStats(30, takerId),
        });
        continue;
      }

      let takerIds = [];
      if (activePerson?.canSeeAll) {
        takerIds = [...new Set(
          logs
            .filter((l) => l.medId === med.id && l.personId)
            .map((l) => l.personId)
        )];
      } else if (activePerson?.id) {
        takerIds = [activePerson.id];
      }

      for (const takerId of takerIds) {
        const week = calcStats(7, takerId);
        const month = calcStats(30, takerId);

        // For shared meds, list only users who actually used the med.
        if ((week.totalTaken + month.totalTaken) === 0) continue;

        const ownerName = persons.find((p) => p.id === takerId)?.name || 'Bilinmeyen';
        results.push({
          id: `${med.id}-${takerId}`,
          name: med.name,
          ownerName,
          week,
          month,
        });
      }
    }

    return results.sort((a, b) => (a.week.rate ?? 100) - (b.week.rate ?? 100));
  }, [meds, logs, persons, activePerson, rolloverMinutes]);

  const groupedStatsData = useMemo(() => {
    const order = persons.map((p) => p.name || '').filter(Boolean);
    const groupedMap = new Map();

    for (const item of statsData) {
      const key = item.ownerName || 'Bilinmeyen';
      if (!groupedMap.has(key)) groupedMap.set(key, []);
      groupedMap.get(key).push(item);
    }

    const groups = [...groupedMap.entries()].map(([ownerName, items]) => ({
      ownerName,
      items: items.sort((a, b) => (a.week.rate ?? 100) - (b.week.rate ?? 100)),
    }));

    return groups.sort((a, b) => {
      const ia = order.indexOf(a.ownerName);
      const ib = order.indexOf(b.ownerName);
      if (ia === -1 && ib === -1) return a.ownerName.localeCompare(b.ownerName, 'tr');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [statsData, persons]);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;

  return (
    <View style={styles.container} {...swipeResponder.panHandlers}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
          onPress={() => setActiveTab('history')}
        >
          <ScrollText color={activeTab === 'history' ? '#059669' : '#6B7280'} size={15} />
          <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>Geçmiş</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'stats' && styles.tabBtnActive]}
          onPress={() => setActiveTab('stats')}
        >
          <BarChart2 color={activeTab === 'stats' ? '#059669' : '#6B7280'} size={15} />
          <Text style={[styles.tabBtnText, activeTab === 'stats' && styles.tabBtnTextActive]}>İstatistik</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'stats' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {groupedStatsData.length === 0 ? (
            <Text style={styles.empty}>İstatistik için yeterli veri yok.</Text>
          ) : groupedStatsData.map((group) => (
            <View key={group.ownerName} style={styles.personStatsGroup}>
              <Text style={styles.personStatsTitle}>{group.ownerName}</Text>
              {group.items.map(item => {
            const getRateColor = (r) => r == null ? '#9CA3AF' : r >= 80 ? '#059669' : r >= 50 ? '#D97706' : '#EF4444';
            const getRateLabel = (r) => r == null ? 'Veri yok' : r >= 80 ? 'İyi' : r >= 50 ? 'Orta' : 'Düşük';
            return (
              <View key={item.id} style={styles.statCard}>
                <View style={styles.statHeader}>
                  <Text style={styles.statMedName}>{item.name}</Text>
                  <Text style={styles.statOwner}>{item.ownerName}</Text>
                </View>
                <View style={styles.statRow}>
                  <View style={styles.statBlock}>
                    <Text style={styles.statPeriod}>Son 7 Gün</Text>
                    <Text style={[styles.statRate, { color: getRateColor(item.week.rate) }]}>
                      {item.week.rate != null ? `%${item.week.rate}` : '-'}
                    </Text>
                    <Text style={styles.statDetail}>{item.week.totalTaken}/{item.week.totalPlanned} doz</Text>
                    <View style={styles.statBar}>
                      <View style={[styles.statBarFill, { width: `${item.week.rate ?? 0}%`, backgroundColor: getRateColor(item.week.rate) }]} />
                    </View>
                    <Text style={[styles.statRateLabel, { color: getRateColor(item.week.rate) }]}>{getRateLabel(item.week.rate)}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statBlock}>
                    <Text style={styles.statPeriod}>Son 30 Gün</Text>
                    <Text style={[styles.statRate, { color: getRateColor(item.month.rate) }]}>
                      {item.month.rate != null ? `%${item.month.rate}` : '-'}
                    </Text>
                    <Text style={styles.statDetail}>{item.month.totalTaken}/{item.month.totalPlanned} doz</Text>
                    <View style={styles.statBar}>
                      <View style={[styles.statBarFill, { width: `${item.month.rate ?? 0}%`, backgroundColor: getRateColor(item.month.rate) }]} />
                    </View>
                    <Text style={[styles.statRateLabel, { color: getRateColor(item.month.rate) }]}>{getRateLabel(item.month.rate)}</Text>
                  </View>
                </View>
              </View>
            );
          })}
            </View>
          ))}
        </ScrollView>
      ) : (
        <>
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
              <TouchableOpacity onPress={() => handleEditTime(item)} style={styles.actionBtn}>
                <Edit2 color="#3B82F6" size={20} />
              </TouchableOpacity>
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

      <Modal
        visible={editModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Zamanı Düzelt</Text>
            <Text style={styles.modalSubTitle}>HH:MM formatında saat girin</Text>
            <TextInput
              value={editTimeInput}
              onChangeText={setEditTimeInput}
              placeholder="Örn: 14:30"
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.modalInput}
              maxLength={5}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnCancel]} onPress={() => setEditModalVisible(false)}>
                <Text style={styles.modalBtnCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleSaveEditedTime}>
                <Text style={styles.modalBtnSaveText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
        </>
      )}
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
  empty: { textAlign: 'center', marginTop: 50, color: '#9CA3AF', fontStyle: 'italic' },
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#059669' },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  tabBtnTextActive: { color: '#059669' },
  personStatsGroup: { marginBottom: 12 },
  personStatsTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8, marginLeft: 2 },
  statCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, elevation: 2 },
  statHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statMedName: { fontSize: 14, fontWeight: 'bold', color: '#111827', flex: 1 },
  statOwner: { fontSize: 11, color: '#6B7280', fontStyle: 'italic', marginLeft: 8 },
  statRow: { flexDirection: 'row', alignItems: 'flex-start' },
  statBlock: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, backgroundColor: '#E5E7EB', marginHorizontal: 8, alignSelf: 'stretch' },
  statPeriod: { fontSize: 11, color: '#6B7280', fontWeight: '600', marginBottom: 4 },
  statRate: { fontSize: 24, fontWeight: 'bold' },
  statDetail: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  statBar: { width: '100%', height: 6, backgroundColor: '#F3F4F6', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  statBarFill: { height: 6, borderRadius: 3 },
  statRateLabel: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  modalSubTitle: { marginTop: 4, fontSize: 12, color: '#6B7280' },
  modalInput: { marginTop: 12, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: '#111827' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  modalBtn: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, marginLeft: 8 },
  modalBtnCancel: { backgroundColor: '#F3F4F6' },
  modalBtnSave: { backgroundColor: '#059669' },
  modalBtnCancelText: { color: '#374151', fontWeight: '600' },
  modalBtnSaveText: { color: '#fff', fontWeight: '700' },
});
