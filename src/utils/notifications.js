import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const MED_REMINDER_CHANNEL_ID = 'med-reminders-v2';

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

export const scheduleMedReminders = async (med) => {
  if (!med?.id || !med?.name || !Array.isArray(med.reminderTimes)) return;

  // Önce bu ilaca ait eski bildirimleri iptal et
  await cancelMedReminders(med);

  for (const timeStr of med.reminderTimes) {
    const parsedTime = parseReminderTime(timeStr);
    if (!parsedTime) continue;

    const { hour, minute } = parsedTime;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Ilac Zamani',
        body: `${med.name} alma zamani geldi.`,
        data: { medId: med.id, hour, minute },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: MED_REMINDER_CHANNEL_ID,
      },
    });
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
