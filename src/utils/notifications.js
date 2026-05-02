import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MED_REMINDER_CHANNEL_ID = 'med-reminders-v2';
const REMINDER_LOOKAHEAD_DAYS = 14;
export const SNOOZE_10_ACTION_ID = 'med-snooze-10';
export const SNOOZE_30_ACTION_ID = 'med-snooze-30';
export const TAKE_MED_ACTION_ID = 'med-take-now';
export const CLOSE_ACTION_ID = 'med-close';
const MED_REMINDER_CATEGORY_ID = 'med-reminder-actions';
const SNOOZE_STATE_KEY = 'MED_SNOOZE_STATE_V1';

const readSnoozeState = async () => {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
};

const writeSnoozeState = async (state) => {
  try {
    await AsyncStorage.setItem(SNOOZE_STATE_KEY, JSON.stringify(state || {}));
  } catch (_) {}
};

const pruneExpiredSnoozeState = (state) => {
  const now = Date.now();
  const next = {};
  Object.entries(state || {}).forEach(([medId, item]) => {
    const triggerAt = Number(item?.triggerAt || 0);
    if (triggerAt > now) {
      next[medId] = item;
    }
  });
  return next;
};

export const getPersistedSnoozedReminders = async ({ personId = null, includeAll = true } = {}) => {
  const state = pruneExpiredSnoozeState(await readSnoozeState());
  await writeSnoozeState(state);

  const normalizedPersonId = String(personId || '').trim();
  if (!normalizedPersonId) return state;

  const filtered = {};
  Object.entries(state).forEach(([medId, item]) => {
    const targetId = String(item?.targetPersonId || '').trim();
    if (targetId === normalizedPersonId || (includeAll && targetId === 'all')) {
      filtered[medId] = item;
    }
  });
  return filtered;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const requestNotificationPermissions = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(MED_REMINDER_CHANNEL_ID, {
      name: 'İlaç Hatırlatmaları',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 300, 250, 300],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
};

export const configureNotificationCategories = async () => {
  await Notifications.setNotificationCategoryAsync(MED_REMINDER_CATEGORY_ID, [
    {
      identifier: TAKE_MED_ACTION_ID,
      buttonTitle: 'Şimdi Kullan',
    },
    {
      identifier: SNOOZE_10_ACTION_ID,
      buttonTitle: '10 dk ertele',
    },
    {
      identifier: SNOOZE_30_ACTION_ID,
      buttonTitle: '30 dk ertele',
    },
    {
      identifier: CLOSE_ACTION_ID,
      buttonTitle: 'Kapat',
      isDestructive: false,
    },
  ]);
};

const parseReminderTime = (rawTime) => {
  if (!rawTime || typeof rawTime !== 'string') return null;

  const normalized = rawTime.trim().replace('.', ':');
  const parts = normalized.split(':');
  if (parts.length !== 2) return null;

  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);

  if (isNaN(hour) || isNaN(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return { hour, minute };
};

const buildUpcomingDates = (hour, minute, days = REMINDER_LOOKAHEAD_DAYS) => {
  const dates = [];
  const now = new Date();

  const first = new Date(now);
  first.setSeconds(0, 0);
  first.setHours(hour, minute, 0, 0);

  // Saat bugun gecmisse yarindan baslat
  if (first.getTime() <= now.getTime()) {
    first.setDate(first.getDate() + 1);
  }

  for (let i = 0; i < days; i += 1) {
    const dt = new Date(first);
    dt.setDate(first.getDate() + i);
    dates.push(dt);
  }

  return dates;
};

const getScheduleType = (med) => (med?.scheduleType === 'weekly' ? 'weekly' : 'daily');

const getWeeklyDays = (med) => {
  if (!Array.isArray(med?.weeklyDays)) return [];
  return [...new Set(med.weeklyDays)]
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
};

const shouldScheduleOnDate = (med, date) => {
  const type = getScheduleType(med);
  if (type !== 'weekly') return true;

  const selectedDays = getWeeklyDays(med);
  if (selectedDays.length === 0) return false;

  return selectedDays.includes(date.getDay());
};

export const canPersonReceiveReminder = (person) => {
  if (!person) return false;
  return person.receivesNotifications !== false;
};

export const isMedRelevantForPerson = (med, person) => {
  if (!med || med.isActive === false || !person?.id) return false;
  if (!canPersonReceiveReminder(person)) return false;
  const owner = med.personId || 'all';
  return owner === 'all' || owner === person.id;
};

const getTargetPersons = ({ persons, selectedPersonIds, fallbackPerson }) => {
  const allPersons = Array.isArray(persons) ? [...persons] : [];

  if (fallbackPerson?.id && !allPersons.some((person) => person.id === fallbackPerson.id)) {
    allPersons.push(fallbackPerson);
  }

  const normalizedIds = [...new Set(
    (Array.isArray(selectedPersonIds) ? selectedPersonIds : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )];

  if (normalizedIds.length === 0 && fallbackPerson?.id) {
    normalizedIds.push(String(fallbackPerson.id));
  }

  return normalizedIds
    .map((personId) => allPersons.find((person) => String(person?.id) === personId))
    .filter((person) => canPersonReceiveReminder(person));
};

export const cancelAllReminderNotifications = async ({ includeSnooze = false } = {}) => {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    const source = String(notif?.content?.data?.source || '');
    const shouldCancelReminder = source === 'med-reminder';
    const shouldCancelSnooze = includeSnooze && source === 'med-snooze';
    if (shouldCancelReminder || shouldCancelSnooze) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  if (includeSnooze) {
    await writeSnoozeState({});
  }
};

export const rebuildRemindersForPerson = async ({ meds, activePerson, persons = [], selectedPersonIds = [] }) => {
  await cancelAllReminderNotifications();

  if (!Array.isArray(meds) || meds.length === 0) {
    return { scheduledCount: 0 };
  }

  const targets = getTargetPersons({
    persons,
    selectedPersonIds,
    fallbackPerson: activePerson,
  });

  if (targets.length === 0) {
    return { scheduledCount: 0 };
  }

  let scheduledCount = 0;
  for (const person of targets) {
    for (const med of meds) {
      if (!isMedRelevantForPerson(med, person)) continue;
      if (med.notificationsEnabled === false) continue;
      if (!Array.isArray(med.reminderTimes) || med.reminderTimes.length === 0) continue;
      await scheduleMedReminders(med, person);
      scheduledCount += 1;
    }
  }

  return { scheduledCount };
};

export const scheduleMedReminders = async (med, targetPerson = null) => {
  if (!med?.id || !med?.name || !Array.isArray(med.reminderTimes) || med.isActive === false) return;

  // Önce bu ilaca ait eski bildirimleri iptal et
  if (!targetPerson) {
    await cancelMedReminders(med);
  }

  const personName = String(targetPerson?.name || '').trim();
  const notificationTitle = personName ? `${personName} için ilaç zamanı` : 'İlaç Zamanı';
  const notificationBody = personName
    ? `${med.name} kullanma zamanı geldi.`
    : `${med.name} alma zamanı geldi.`;

  for (const timeStr of med.reminderTimes) {
    const parsedTime = parseReminderTime(timeStr);
    if (!parsedTime) continue;

    const { hour, minute } = parsedTime;

    const upcomingDates = buildUpcomingDates(hour, minute);

    for (const scheduleDate of upcomingDates) {
      if (!shouldScheduleOnDate(med, scheduleDate)) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: notificationTitle,
          body: notificationBody,
          data: { 
            medId: med.id, 
            medName: med.name, 
            hour, 
            minute, 
            source: 'med-reminder',
            personId: med.personId || 'all',
            targetPersonId: targetPerson?.id || med.personId || 'all',
            targetPersonName: personName,
            consumeAmt: Number(med.consumePerUsage || 1),
          },
          categoryIdentifier: MED_REMINDER_CATEGORY_ID,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: scheduleDate,
          channelId: MED_REMINDER_CHANNEL_ID,
        },
      });
    }
  }
};

export const scheduleReminderSnooze = async ({
  medId,
  medName,
  minutes,
  targetPersonId = null,
  targetPersonName = '',
  personId = null,
  consumeAmt = null,
}) => {
  if (!medId || !minutes || minutes <= 0) {
    throw new Error('INVALID_SNOOZE_INPUT');
  }

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    throw new Error('NOTIFICATION_PERMISSION_DENIED');
  }

  const triggerDate = new Date(Date.now() + minutes * 60 * 1000);
  const personName = String(targetPersonName || '').trim();
  const parsedConsumeAmt = Number(consumeAmt);
  const normalizedConsumeAmt = Number.isFinite(parsedConsumeAmt) && parsedConsumeAmt > 0
    ? parsedConsumeAmt
    : null;

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: personName ? `${personName} için ilaç zamanı` : 'İlaç Zamanı',
      body: `${medName || 'İlaç'} için ertelenen hatırlatma.`,
      data: {
        medId,
        medName,
        source: 'med-snooze',
        snoozeMinutes: minutes,
        personId: personId || 'all',
        targetPersonId: targetPersonId || 'all',
        targetPersonName: personName,
        consumeAmt: normalizedConsumeAmt,
      },
      categoryIdentifier: MED_REMINDER_CATEGORY_ID,
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: MED_REMINDER_CHANNEL_ID,
    },
  });

  if (!identifier) {
    throw new Error('SNOOZE_SCHEDULE_FAILED');
  }

  const state = await readSnoozeState();
  state[String(medId)] = {
    triggerAt: triggerDate.getTime(),
    targetPersonId: targetPersonId || personId || 'all',
    targetPersonName: personName,
  };
  await writeSnoozeState(pruneExpiredSnoozeState(state));

  return { identifier, triggerDate };
};

export const cancelMedReminders = async (med) => {
  if (!med?.id) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const medId = String(med.id);

  for (const notif of scheduled) {
    if (String(notif?.content?.data?.medId) === medId) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  const state = await readSnoozeState();
  if (state[medId]) {
    delete state[medId];
    await writeSnoozeState(state);
  }
};
