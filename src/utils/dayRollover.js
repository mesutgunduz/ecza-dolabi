export const parseRolloverToMinutes = (timeStr = '00:00') => {
  const [h, m] = String(timeStr).split(':').map(Number);
  const hour = Number.isNaN(h) ? 0 : Math.max(0, Math.min(23, h));
  const minute = Number.isNaN(m) ? 0 : Math.max(0, Math.min(59, m));
  return hour * 60 + minute;
};

export const parseClockTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const normalized = String(timeStr).trim().replace('.', ':');
  const [h, m] = normalized.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

export const adjustMinutesForRollover = (minutes, rolloverMinutes) => {
  if (minutes == null) return null;
  return minutes < rolloverMinutes ? minutes + 1440 : minutes;
};

const formatDateKey = (date) => {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
};

export const getLogicalDateKeyForNow = (now, rolloverMinutes) => {
  const dt = new Date(now);
  const nowMinutes = dt.getHours() * 60 + dt.getMinutes();
  if (nowMinutes < rolloverMinutes) {
    dt.setDate(dt.getDate() - 1);
  }
  return formatDateKey(dt);
};

export const getLogicalNowMinutes = (now, rolloverMinutes) => {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return adjustMinutesForRollover(nowMinutes, rolloverMinutes);
};

export const getLogicalDateKeyForLog = (log, rolloverMinutes) => {
  const [d, m, y] = String(log?.date || '').split('.').map(Number);
  const clockMinutes = parseClockTimeToMinutes(log?.time || '00:00');
  if (!y || clockMinutes == null) return '';

  const dt = new Date(y, (m || 1) - 1, d || 1);
  if (clockMinutes < rolloverMinutes) {
    dt.setDate(dt.getDate() - 1);
  }
  return formatDateKey(dt);
};
