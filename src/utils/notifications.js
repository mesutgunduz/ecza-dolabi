import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const MED_REMINDER_CHANNEL_ID = 'med-reminders-v2';
const REMINDER_LOOKAHEAD_DAYS = 14;

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

export const scheduleMedReminders = async (med) => {
  if (!med?.id || !med?.name || !Array.isArray(med.reminderTimes) || med.isActive === false) return;

  // Önce bu ilaca ait eski bildirimleri iptal et
  await cancelMedReminders(med);

  for (const timeStr of med.reminderTimes) {
    const parsedTime = parseReminderTime(timeStr);
    if (!parsedTime) continue;

    const { hour, minute } = parsedTime;

    const upcomingDates = buildUpcomingDates(hour, minute);

    for (const scheduleDate of upcomingDates) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Ilac Zamani',
          body: `${med.name} alma zamani geldi.`,
          data: { medId: med.id, hour, minute, source: 'med-reminder' },
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

export const cancelMedReminders = async (med) => {
  if (!med?.id) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const medId = String(med.id);

  for (const notif of scheduled) {
    if (String(notif?.content?.data?.medId) === medId) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
};
