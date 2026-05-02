import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Linking, ScrollView, Modal, TextInput, AppState, PanResponder
} from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { getLogs, getMeds, getPersons, deleteLog, editLog, markAsTaken, getDayRolloverTime, getSnoozeWindowSettings, getNotificationTargetPersonIds } from '../utils/storage';
import { parseRolloverToMinutes, parseClockTimeToMinutes, adjustMinutesForRollover, getLogicalDateKeyForNow, getLogicalDateKeyForLog, getLogicalNowMinutes } from '../utils/dayRollover';
import { Clock, User, Trash2, Pill, Share2, Check, BarChart2, ScrollText, Edit2 } from 'lucide-react-native';
import { useTranslation } from '../i18n/LanguageContext';

export default function LogsScreen({ activePerson, dataRefreshKey = 0 }) {
  const { t } = useTranslation();
  const route = useRoute();
  const listRef = useRef(null);
  const [logs, setLogs] = useState([]);
  const [persons, setPersons] = useState([]);
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rolloverTime, setRolloverTime] = useState('00:00');
  const [activeTab, setActiveTab] = useState('history'); // 'history' | 'stats'
  const [statsPersonFilter, setStatsPersonFilter] = useState('all');
  const [snoozeAfterMinutes, setSnoozeAfterMinutes] = useState(120);
  const [notificationTargetIds, setNotificationTargetIds] = useState([]);
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const l = await getLogs();
      const p = await getPersons();
      const m = await getMeds();
      const rt = await getDayRolloverTime();
      const snoozeCfg = await getSnoozeWindowSettings();
      const targetIds = await getNotificationTargetPersonIds(activePerson?.id);

      let filtered = l;
      if (activePerson && !activePerson.canSeeAll) {
        filtered = l.filter(log => log.personId === activePerson.id);
      }

      setLogs(filtered);
      setPersons(p);
      setMeds(m.filter(x => x.isActive !== false));
      setRolloverTime(rt);
      setSnoozeAfterMinutes(snoozeCfg.afterMinutes);
      setNotificationTargetIds(targetIds);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activePerson]);

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

  useEffect(() => {
    if (!activePerson) return;
    if (activePerson.canSeeAll) {
      setStatsPersonFilter('all');
    } else {
      setStatsPersonFilter(activePerson.id);
    }
  }, [activePerson]);

  useEffect(() => {
    if (!route.params?.focusMissedDosesKey) return;
    setActiveTab('history');
  }, [route.params?.focusMissedDosesKey]);

  useEffect(() => {
    if (activeTab !== 'history' || !route.params?.focusMissedDosesKey) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [activeTab, route.params?.focusMissedDosesKey]);

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
    const personById = new Map(persons.map((p) => [p.id, p]));
    const eligiblePersonIds = activePerson?.canSeeAll
      ? [...new Set(notificationTargetIds)].filter((id) => personById.get(id)?.receivesNotifications !== false)
      : (personById.get(activePerson?.id)?.receivesNotifications === false ? [] : [activePerson?.id].filter(Boolean));

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
      const candidateIds = isSharedMed
        ? eligiblePersonIds
        : [med.personId].filter(Boolean);
      const targetIds = candidateIds.filter((id) => eligiblePersonIds.includes(id));
      if (targetIds.length === 0) return acc;

      const takenCount = targetIds.reduce((sum, id) => sum + (counts[`${med.id}-${id}`] || 0), 0);

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
        ? (persons.find((p) => p.id === targetIds[0])?.name || t('unknown'))
        : t('shared');

      acc.push({
        id: med.id,
        medName: med.name,
        ownerName,
        takerId: targetIds.length === 1 ? targetIds[0] : (activePerson?.id || targetIds[0]),
        consumePerUsage: parseFloat(med.consumePerUsage || 1),
        missed,
        takenCount,
        plannedDose,
      });

      return acc;
    }, []);
  }, [logs, meds, persons, activePerson, rolloverMinutes, logicalTodayKey, snoozeAfterMinutes, notificationTargetIds, t]);

  const getPersonDisplayName = (log) => {
    if (log.takerName) return log.takerName;

    const p = persons.find(x => x.id === log.personId);
    if (p) return p.name;

    if (log.personId === 'all' || !log.personId) return t('shared');

    return `${t('deletedUser')} (ID: ${log.personId ? log.personId.substring(0, 6) : '?'})`;
  };

  const handleDelete = (id) => {
    Alert.alert(t('deleteLog'), t('deleteLogConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
          text: t('delete'),
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
      Alert.alert(t('error'), t('timeFormatError'));
      return;
    }

    const [hours, minutes] = newTime.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      Alert.alert(t('error'), t('timeInvalidError'));
      return;
    }

    if (!editingLog?.id) return;

    try {
      await editLog(editingLog.id, { time: newTime });
      setEditModalVisible(false);
      setEditingLog(null);
      setEditTimeInput('');
      await loadData();
      Alert.alert(t('success'), t('timeUpdated'));
    } catch (err) {
      Alert.alert(t('error'), t('timeUpdateError'));
    }
  };

  const handleShare = async (log) => {
    const personName = getPersonDisplayName(log);
    const message = `💊 ${personName}, ${log.medName || t('medicineFallback')} ${t('sharedUsedMedicineMessage')} ${log.dosage || 1}.\n📅 ${t('dateLabel')}: ${log.date}\n⏰ ${t('timeLabel')}: ${log.time}`;
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;

    try {
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert(t('error'), t('whatsappError'));
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
        Alert.alert(t('error'), t('logAddError'));
      }
      await loadData();
    } catch (error) {
      Alert.alert(t('error'), t('logAddError'));
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
        if (statsPersonFilter !== 'all' && takerId !== statsPersonFilter) continue;
        if (activePerson && !activePerson.canSeeAll && takerId !== activePerson.id) continue;

        const ownerName = persons.find((p) => p.id === takerId)?.name || t('unknown');
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
      if (statsPersonFilter !== 'all') {
        takerIds = [statsPersonFilter];
      } else if (activePerson?.canSeeAll) {
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
  }, [meds, logs, persons, activePerson, rolloverMinutes, statsPersonFilter, t]);

  const groupedStatsData = useMemo(() => {
    const order = persons.map((p) => p.name || '').filter(Boolean);
    const groupedMap = new Map();

    for (const item of statsData) {
      const key = item.ownerName || t('unknown');
      if (!groupedMap.has(key)) groupedMap.set(key, []);
      groupedMap.get(key).push(item);
    }

    const groups = [...groupedMap.entries()].map(([ownerName, items]) => {
      const sortedItems = items.sort((a, b) => (a.week.rate ?? 100) - (b.week.rate ?? 100));
      const weekTaken = sortedItems.reduce((sum, item) => sum + (item.week.totalTaken || 0), 0);
      const weekPlanned = sortedItems.reduce((sum, item) => sum + (item.week.totalPlanned || 0), 0);
      const monthTaken = sortedItems.reduce((sum, item) => sum + (item.month.totalTaken || 0), 0);
      const monthPlanned = sortedItems.reduce((sum, item) => sum + (item.month.totalPlanned || 0), 0);

      return {
        ownerName,
        items: sortedItems,
        summary: {
          weekTaken,
          weekPlanned,
          weekRate: weekPlanned > 0 ? Math.round((weekTaken / weekPlanned) * 100) : null,
          monthTaken,
          monthPlanned,
          monthRate: monthPlanned > 0 ? Math.round((monthTaken / monthPlanned) * 100) : null,
        },
      };
    });

    return groups.sort((a, b) => {
      const ia = order.indexOf(a.ownerName);
      const ib = order.indexOf(b.ownerName);
      if (ia === -1 && ib === -1) return a.ownerName.localeCompare(b.ownerName, 'tr');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [statsData, persons, t]);

  const statsPersonOptions = useMemo(() => {
    if (!activePerson?.canSeeAll) return [];
    const selectable = persons
      .filter((p) => p.id && p.id !== 'all')
      .map((p) => ({ id: p.id, name: p.name || t('unknown') }));
    return [{ id: 'all', name: t('allPersons') }, ...selectable];
  }, [persons, activePerson, t]);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#059669" /></View>;

  return (
    <View style={styles.container} {...swipeResponder.panHandlers}>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
          onPress={() => setActiveTab('history')}
        >
          <ScrollText color={activeTab === 'history' ? '#059669' : '#6B7280'} size={15} />
          <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>{t('logs')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'stats' && styles.tabBtnActive]}
          onPress={() => setActiveTab('stats')}
        >
          <BarChart2 color={activeTab === 'stats' ? '#059669' : '#6B7280'} size={15} />
          <Text style={[styles.tabBtnText, activeTab === 'stats' && styles.tabBtnTextActive]}>{t('stats')}</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'stats' ? (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          {statsPersonOptions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.statsFilterRow}
            >
              {statsPersonOptions.map((option) => {
                const isActive = statsPersonFilter === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.statsFilterChip, isActive && styles.statsFilterChipActive]}
                    onPress={() => setStatsPersonFilter(option.id)}
                  >
                    <Text style={[styles.statsFilterChipText, isActive && styles.statsFilterChipTextActive]}>
                      {option.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
          {groupedStatsData.length === 0 ? (
            <Text style={styles.empty}>{t('noStats')}</Text>
          ) : groupedStatsData.map((group) => (
            <View key={group.ownerName} style={styles.personStatsGroup}>
              <Text style={styles.personStatsTitle}>{group.ownerName}</Text>
              <View style={styles.personSummaryCard}>
                <View style={styles.personSummaryBlock}>
                  <Text style={styles.personSummaryLabel}>{t('rate7')}</Text>
                  <Text style={styles.personSummaryRate}>{group.summary.weekRate != null ? `%${group.summary.weekRate}` : '-'}</Text>
                  <Text style={styles.personSummaryDetail}>{group.summary.weekTaken}/{group.summary.weekPlanned}</Text>
                </View>
                <View style={styles.personSummaryDivider} />
                <View style={styles.personSummaryBlock}>
                  <Text style={styles.personSummaryLabel}>{t('rate30')}</Text>
                  <Text style={styles.personSummaryRate}>{group.summary.monthRate != null ? `%${group.summary.monthRate}` : '-'}</Text>
                  <Text style={styles.personSummaryDetail}>{group.summary.monthTaken}/{group.summary.monthPlanned}</Text>
                </View>
              </View>
              {group.items.map(item => {
            const getRateColor = (r) => r == null ? '#9CA3AF' : r >= 80 ? '#059669' : r >= 50 ? '#D97706' : '#EF4444';
            const getRateLabel = (r) => r == null ? t('rateNoData') : r >= 80 ? t('rateGood') : r >= 50 ? t('rateMedium') : t('rateLow');
            return (
              <View key={item.id} style={styles.statCard}>
                <View style={styles.statHeader}>
                  <Text style={styles.statMedName}>{item.name}</Text>
                  <Text style={styles.statOwner}>{item.ownerName}</Text>
                </View>
                <View style={styles.statRow}>
                  <View style={styles.statBlock}>
                    <Text style={styles.statPeriod}>{t('rate7')}</Text>
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
                    <Text style={styles.statPeriod}>{t('rate30')}</Text>
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
        ref={listRef}
        data={logs}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Clock color="#059669" size={20} />
            </View>
            <View style={styles.content}>
              <Text style={styles.medName}>{item.medName || t('medicineFallback')}</Text>
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
  statsFilterRow: { paddingBottom: 10, paddingRight: 6 },
  statsFilterChip: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  statsFilterChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#34D399',
  },
  statsFilterChipText: { color: '#4B5563', fontSize: 12, fontWeight: '600' },
  statsFilterChipTextActive: { color: '#047857' },
  personStatsGroup: { marginBottom: 12 },
  personStatsTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8, marginLeft: 2 },
  personSummaryCard: { backgroundColor: '#ECFDF5', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#A7F3D0', flexDirection: 'row', alignItems: 'center' },
  personSummaryBlock: { flex: 1, alignItems: 'center' },
  personSummaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#A7F3D0', marginHorizontal: 10 },
  personSummaryLabel: { fontSize: 11, color: '#047857', fontWeight: '700' },
  personSummaryRate: { fontSize: 22, color: '#065F46', fontWeight: '800', marginTop: 4 },
  personSummaryDetail: { fontSize: 11, color: '#047857', marginTop: 2 },
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
