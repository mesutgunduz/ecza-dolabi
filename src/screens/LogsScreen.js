import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Linking, ScrollView, Modal, TextInput, AppState, PanResponder
} from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { getLogs, getMeds, getPersons, deleteLog, editLog, markAsTaken, getDayRolloverTime, getSnoozeWindowSettings, getNotificationTargetPersonIds } from '../utils/storage';
import { parseRolloverToMinutes, parseClockTimeToMinutes, adjustMinutesForRollover, getLogicalDateKeyForNow, getLogicalDateKeyForLog, getLogicalNowMinutes } from '../utils/dayRollover';
import { Clock, User, Trash2, Pill, Share2, Check, BarChart2, ScrollText, Edit2, FileDown } from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';
import { useTranslation } from '../i18n/LanguageContext';

export default function LogsScreen({ activePerson, dataRefreshKey = 0 }) {
  const { t, language } = useTranslation();
  const route = useRoute();
  const listRef = useRef(null);
  const [logs, setLogs] = useState([]);
  const [persons, setPersons] = useState([]);
  const [meds, setMeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rolloverTime, setRolloverTime] = useState('00:00');
  const [activeTab, setActiveTab] = useState('history'); // 'history' | 'stats'
  const [statsPersonFilter, setStatsPersonFilter] = useState('all');
  const [reportRangeType, setReportRangeType] = useState('week');
  const [reportOffset, setReportOffset] = useState(0);
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
    setReportOffset(0);
  }, [reportRangeType, statsPersonFilter]);

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

  const reportPeriodDays = useMemo(() => {
    const periodLength = reportRangeType === 'week' ? 7 : 30;
    const logicalBaseDate = new Date();
    if ((logicalBaseDate.getHours() * 60 + logicalBaseDate.getMinutes()) < rolloverMinutes) {
      logicalBaseDate.setDate(logicalBaseDate.getDate() - 1);
    }
    logicalBaseDate.setHours(12, 0, 0, 0);

    const endDate = new Date(logicalBaseDate);
    endDate.setDate(logicalBaseDate.getDate() - (reportOffset * periodLength));

    const locale = language === 'en' ? 'en-GB' : 'tr-TR';
    const days = [];
    for (let index = 0; index < periodLength; index += 1) {
      const dayDate = new Date(endDate);
      dayDate.setDate(endDate.getDate() - index);
      days.push({
        date: dayDate,
        dateKey: getLogicalDateKeyForNow(dayDate, rolloverMinutes),
        label: dayDate.toLocaleDateString(locale, {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
        }),
        fullLabel: dayDate.toLocaleDateString(locale, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      });
    }
    return days;
  }, [reportRangeType, reportOffset, rolloverMinutes, language]);

  const personalUsageReports = useMemo(() => {
    const personIds = statsPersonFilter !== 'all'
      ? [statsPersonFilter]
      : (activePerson?.canSeeAll
        ? persons.filter((p) => p.id && p.id !== 'all').map((p) => p.id)
        : [activePerson?.id].filter(Boolean));

    return personIds.map((personId) => {
      const person = persons.find((p) => p.id === personId);
      const ownerName = person?.name || t('unknown');

      const dailyRows = reportPeriodDays.map((day) => {
        const dayLogs = logs
          .filter((log) => log.personId === personId && getLogicalDateKeyForLog(log, rolloverMinutes) === day.dateKey)
          .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

        const planned = meds.reduce((sum, med) => {
          const plannedDose = parseInt(med.dailyDose, 10);
          if (!plannedDose || plannedDose <= 0) return sum;

          const isDirect = med.personId === personId;
          const isShared = med.personId === 'all';
          if (!isDirect && !isShared) return sum;

          if (med.scheduleType === 'weekly') {
            const selectedDays = Array.isArray(med.weeklyDays)
              ? med.weeklyDays.map((value) => Number(value)).filter((value) => value >= 0 && value <= 6)
              : [];
            if (!selectedDays.includes(day.date.getDay())) return sum;
          }

          return sum + plannedDose;
        }, 0);

        const taken = dayLogs.length;
        const missed = Math.max(0, planned - taken);

        const takenCountByMed = {};
        for (const log of dayLogs) {
          takenCountByMed[log.medId] = (takenCountByMed[log.medId] || 0) + 1;
        }
        const missedMeds = [];
        for (const med of meds) {
          const isDirect = med.personId === personId;
          const isShared = med.personId === 'all';
          if (!isDirect && !isShared) continue;
          const plannedDose = parseInt(med.dailyDose, 10);
          if (!plannedDose || plannedDose <= 0) continue;
          if (med.scheduleType === 'weekly') {
            const selectedDays = Array.isArray(med.weeklyDays)
              ? med.weeklyDays.map((v) => Number(v)).filter((v) => v >= 0 && v <= 6)
              : [];
            if (!selectedDays.includes(day.date.getDay())) continue;
          }
          const takenForMed = takenCountByMed[med.id] || 0;
          const missedForMed = Math.max(0, plannedDose - takenForMed);
          if (missedForMed > 0) {
            missedMeds.push(med.name + (missedForMed > 1 ? ` (x${missedForMed})` : ''));
          }
        }

        return {
          ...day,
          taken,
          planned,
          missed,
          logs: dayLogs,
          missedMeds,
        };
      }).filter((day) => day.planned > 0 || day.taken > 0);

      const takenTotal = dailyRows.reduce((sum, day) => sum + day.taken, 0);
      const plannedTotal = dailyRows.reduce((sum, day) => sum + day.planned, 0);
      const missedTotal = dailyRows.reduce((sum, day) => sum + day.missed, 0);

      return {
        personId,
        ownerName,
        dailyRows,
        summary: {
          taken: takenTotal,
          planned: plannedTotal,
          missed: missedTotal,
          rate: plannedTotal > 0 ? Math.round((takenTotal / plannedTotal) * 100) : null,
        },
      };
    }).filter((report) => report.dailyRows.length > 0 || statsPersonFilter !== 'all');
  }, [statsPersonFilter, activePerson, persons, reportPeriodDays, logs, rolloverMinutes, meds, t]);

  const reportPeriodLabel = useMemo(() => {
    if (reportPeriodDays.length === 0) return '';
    const oldest = reportPeriodDays[reportPeriodDays.length - 1];
    const newest = reportPeriodDays[0];
    return `${oldest.fullLabel} - ${newest.fullLabel}`;
  }, [reportPeriodDays]);

  const handleExportPDF = useCallback(async () => {
    if (personalUsageReports.length === 0) return;
    const periodTypeLabel = reportRangeType === 'week' ? t('weeklyView') : t('monthlyView');

    // Logo'yu base64'e çevir
    let logoHtml = '';
    try {
      const [asset] = await Asset.loadAsync(require('../../assets/icon.png'));
      const localUri = asset.localUri || asset.uri;
      const base64 = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
      logoHtml = `<img src="data:image/png;base64,${base64}" style="width:48px;height:48px;vertical-align:middle;margin-right:10px;border-radius:10px;" />`;
    } catch (_) {}

    let html = `<html><head><meta charset="utf-8"><style>
      body{font-family:sans-serif;padding:24px;color:#111;}
      .app-header{display:flex;align-items:center;margin-bottom:4px;}
      .app-name{font-size:22px;font-weight:bold;color:#059669;vertical-align:middle;}
      .report-title{font-size:14px;color:#374151;margin:2px 0 2px;}
      h2{font-size:15px;color:#1f2937;margin:20px 0 4px;border-bottom:2px solid #059669;padding-bottom:4px;}
      .period{font-size:12px;color:#6b7280;margin-bottom:16px;}
      .summary{font-size:12px;color:#6b7280;margin-bottom:10px;}
      .day-block{margin-bottom:14px;padding:10px;border:1px solid #e5e7eb;border-radius:6px;page-break-inside:avoid;break-inside:avoid;}
      .day-title{font-size:13px;font-weight:bold;color:#111;margin-bottom:6px;}
      .day-stats{font-size:11px;color:#6b7280;margin-bottom:6px;}
      .taken-list{margin:4px 0 6px 12px;}
      .taken-item{font-size:12px;color:#065f46;margin:2px 0;}
      .missed-list{margin:4px 0 6px 12px;}
      .missed-item{font-size:12px;color:#dc2626;margin:2px 0;}
      .label-taken{font-size:11px;font-weight:bold;color:#059669;}
      .label-missed{font-size:11px;font-weight:bold;color:#dc2626;}
    </style></head><body>`;
    html += `<div class="app-header">${logoHtml}<span class="app-name">Ecza Dolabım</span></div>`;
    html += `<p class="report-title">${t('reportDetails')} — ${periodTypeLabel}</p><p class="period">${reportPeriodLabel}</p>`;

    for (const report of personalUsageReports) {
      html += `<h2>${report.ownerName}</h2>`;
      html += `<p class="summary">${t('takenDoses')}: ${report.summary.taken} &nbsp;|&nbsp; ${t('plannedDoses')}: ${report.summary.planned} &nbsp;|&nbsp; ${t('missedDoses')}: ${report.summary.missed}</p>`;

      for (const day of report.dailyRows) {
        html += `<div class="day-block">`;
        html += `<div class="day-title">${day.fullLabel || day.label}</div>`;
        html += `<div class="day-stats">${t('takenDoses')}: ${day.taken} / ${t('plannedDoses')}: ${day.planned} / ${t('missedDoses')}: ${day.missed}</div>`;

        // Alınan ilaçlar
        if (day.logs && day.logs.length > 0) {
          html += `<div class="label-taken">✓ ${t('takenDoses')}</div><ul class="taken-list">`;
          for (const log of day.logs) {
            html += `<li class="taken-item">${log.time || '--:--'} &nbsp; ${log.medName || '-'} &nbsp; (${log.dosage || 1})</li>`;
          }
          html += `</ul>`;
        }

        // Atlanmış ilaçlar: planlanmış ama log'da olmayan
        if (day.missed > 0) {
          // Her ilaç için bu günde kaç kez planlandığını ve kaç kez log'a girdiğini hesapla
          const takenCountByMed = {};
          for (const log of (day.logs || [])) {
            takenCountByMed[log.medId] = (takenCountByMed[log.medId] || 0) + 1;
          }

          const missedMeds = [];
          for (const med of meds) {
            const isDirect = med.personId === report.personId;
            const isShared = med.personId === 'all';
            if (!isDirect && !isShared) continue;
            const plannedDose = parseInt(med.dailyDose, 10);
            if (!plannedDose || plannedDose <= 0) continue;
            if (med.scheduleType === 'weekly') {
              const selectedDays = Array.isArray(med.weeklyDays)
                ? med.weeklyDays.map((v) => Number(v)).filter((v) => v >= 0 && v <= 6)
                : [];
              if (!selectedDays.includes(day.date.getDay())) continue;
            }
            const takenForMed = takenCountByMed[med.id] || 0;
            const missedForMed = Math.max(0, plannedDose - takenForMed);
            if (missedForMed > 0) {
              missedMeds.push(`${med.name}${missedForMed > 1 ? ` (x${missedForMed})` : ''}`);
            }
          }

          if (missedMeds.length > 0) {
            html += `<div class="label-missed">✗ ${t('missedDoses')}</div><ul class="missed-list">`;
            for (const name of missedMeds) {
              html += `<li class="missed-item">${name}</li>`;
            }
            html += `</ul>`;
          }
        }

        html += `</div>`;
      }
    }
    html += `</body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('exportPDF') });
    } catch (e) {
      Alert.alert(t('error'), e.message);
    }
  }, [personalUsageReports, reportPeriodLabel, reportRangeType, meds, t]);

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
          <View style={styles.reportSection}>
            <Text style={styles.reportSectionTitle}>{t('reportDetails')}</Text>
            <View style={styles.reportTypeRow}>
              <TouchableOpacity
                style={[styles.reportTypeChip, reportRangeType === 'week' && styles.reportTypeChipActive]}
                onPress={() => setReportRangeType('week')}
              >
                <Text style={[styles.reportTypeChipText, reportRangeType === 'week' && styles.reportTypeChipTextActive]}>{t('weeklyView')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reportTypeChip, reportRangeType === 'month' && styles.reportTypeChipActive]}
                onPress={() => setReportRangeType('month')}
              >
                <Text style={[styles.reportTypeChipText, reportRangeType === 'month' && styles.reportTypeChipTextActive]}>{t('monthlyView')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.reportNavRow}>
              <TouchableOpacity style={styles.reportNavBtn} onPress={() => setReportOffset((current) => current + 1)}>
                <Text style={styles.reportNavBtnText}>{t('previousPeriod')}</Text>
              </TouchableOpacity>
              <Text style={styles.reportPeriodLabel}>{reportPeriodLabel}</Text>
              <TouchableOpacity
                style={[styles.reportNavBtn, reportOffset === 0 && styles.reportNavBtnDisabled]}
                disabled={reportOffset === 0}
                onPress={() => setReportOffset((current) => Math.max(0, current - 1))}
              >
                <Text style={[styles.reportNavBtnText, reportOffset === 0 && styles.reportNavBtnTextDisabled]}>{t('nextPeriod')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.exportPdfBtn} onPress={handleExportPDF}>
              <FileDown size={15} color="#fff" />
              <Text style={styles.exportPdfBtnText}>{t('exportPDF')}</Text>
            </TouchableOpacity>
          </View>
          {personalUsageReports.length > 0 ? (
            <View style={styles.reportSection}>
              {personalUsageReports.map((report) => (
                <View key={`report-${report.ownerName}`} style={styles.reportCard}>
                  <Text style={styles.reportOwner}>{report.ownerName}</Text>
                  <View style={styles.reportRow}>
                    <View style={[styles.reportBlock, reportRangeType === 'week' ? styles.reportBlockWeek : styles.reportBlockMonth]}>
                      <Text style={styles.reportLabel}>{reportRangeType === 'week' ? t('weeklyReport') : t('monthlyReport')}</Text>
                      <Text style={styles.reportRate}>{report.summary.rate != null ? `%${report.summary.rate}` : '-'}</Text>
                      <Text style={styles.reportMeta}>{t('takenDoses')}: {report.summary.taken}</Text>
                      <Text style={styles.reportMeta}>{t('plannedDoses')}: {report.summary.planned}</Text>
                      <Text style={styles.reportMeta}>{t('missedDoses')}: {report.summary.missed}</Text>
                      <Text style={styles.dailyUsageTitle}>{t('dailyUsageList')}</Text>
                      {report.dailyRows.map((day) => (
                        <View key={`${report.personId}-${day.dateKey}`} style={styles.dayUsageCard}>
                          <View style={styles.dayUsageHeader}>
                            <Text style={styles.dayUsageDate}>{day.label}</Text>
                            <Text style={styles.dayUsageSummary}>{day.taken}/{day.planned}</Text>
                          </View>
                          <Text style={styles.dayUsageMeta}>{t('takenDoses')}: {day.taken} • {t('missedDoses')}: {day.missed}</Text>
                          {day.logs.length > 0 ? day.logs.map((log) => (
                            <Text key={log.id} style={styles.dayUsageLog}>• {log.time || '--:--'} - {log.medName || t('medicineFallback')} ({log.dosage || 1})</Text>
                          )) : <Text style={styles.dayUsageEmpty}>{t('noUsageOnDay')}</Text>}
                          {day.missedMeds && day.missedMeds.length > 0 && day.missedMeds.map((name, i) => (
                            <Text key={`missed-${i}`} style={styles.dayUsageMissedMed}>✗ {name}</Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : <Text style={styles.empty}>{t('noReportDays')}</Text>}
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
  reportSection: { marginBottom: 16 },
  reportSectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 },
  reportTypeRow: { flexDirection: 'row', marginBottom: 10, gap: 8 },
  reportTypeChip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F3F4F6', borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB' },
  reportTypeChipActive: { backgroundColor: '#ECFDF5', borderColor: '#34D399' },
  reportTypeChipText: { fontSize: 12, fontWeight: '700', color: '#4B5563' },
  reportTypeChipTextActive: { color: '#047857' },
  reportNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 },
  reportNavBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  reportNavBtnDisabled: { opacity: 0.5 },
  reportNavBtnText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  reportNavBtnTextDisabled: { color: '#9CA3AF' },
  reportPeriodLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#111827' },
  exportPdfBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#059669', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, marginTop: 8 },
  exportPdfBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  reportCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#D1FAE5' },
  reportOwner: { fontSize: 14, fontWeight: '700', color: '#065F46', marginBottom: 10 },
  reportRow: { flexDirection: 'row', gap: 10 },
  reportBlock: { flex: 1, borderRadius: 10, padding: 12 },
  reportBlockWeek: { backgroundColor: '#ECFDF5' },
  reportBlockMonth: { backgroundColor: '#EFF6FF' },
  reportLabel: { fontSize: 11, fontWeight: '700', color: '#4B5563', marginBottom: 6 },
  reportRate: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 6 },
  reportMeta: { fontSize: 11, color: '#4B5563', marginBottom: 2 },
  dailyUsageTitle: { fontSize: 12, fontWeight: '800', color: '#111827', marginTop: 10, marginBottom: 8 },
  dayUsageCard: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  dayUsageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayUsageDate: { fontSize: 12, fontWeight: '700', color: '#111827' },
  dayUsageSummary: { fontSize: 12, fontWeight: '800', color: '#059669' },
  dayUsageMeta: { fontSize: 11, color: '#6B7280', marginTop: 2, marginBottom: 6 },
  dayUsageLog: { fontSize: 11, color: '#374151', marginTop: 2 },
  dayUsageEmpty: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' },
  dayUsageMissedMed: { fontSize: 11, color: '#DC2626', marginTop: 1 },
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
