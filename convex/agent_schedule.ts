export const AGENT_SCHEDULE_KEY = "agent_schedule";
export const CHAT_WINDOWS_PER_DAY = 4;
export const MESSAGES_PER_CHAT_WINDOW = 4;
export const SCHEDULER_INTERVAL_MINUTES = 15;

export type AgentSchedule = {
  enabled: boolean;
  timezone: string;
  times: string[];
  maxChatsPerDay: number;
  messagesPerChat: number;
  maxMessagesPerDay: number;
  schedulerIntervalMinutes: number;
};

type StoredAgentSchedule = {
  enabled?: unknown;
  timezone?: unknown;
  times?: unknown;
};

export const DEFAULT_AGENT_SCHEDULE: AgentSchedule = {
  enabled: true,
  timezone: "Etc/UTC",
  times: ["09:00", "12:00", "15:00", "18:00"],
  maxChatsPerDay: CHAT_WINDOWS_PER_DAY,
  messagesPerChat: MESSAGES_PER_CHAT_WINDOW,
  maxMessagesPerDay: CHAT_WINDOWS_PER_DAY * MESSAGES_PER_CHAT_WINDOW,
  schedulerIntervalMinutes: SCHEDULER_INTERVAL_MINUTES,
};

export function normaliseAgentSchedule(raw: string | undefined): AgentSchedule {
  if (!raw) return DEFAULT_AGENT_SCHEDULE;

  try {
    const parsed = JSON.parse(raw) as StoredAgentSchedule;
    const timezone =
      typeof parsed.timezone === "string" && isValidTimeZone(parsed.timezone)
        ? parsed.timezone
        : DEFAULT_AGENT_SCHEDULE.timezone;
    const parsedTimes = Array.isArray(parsed.times)
      ? normaliseScheduleTimes(parsed.times.filter((time): time is string => typeof time === "string"))
      : DEFAULT_AGENT_SCHEDULE.times;
    const times =
      parsedTimes.length === CHAT_WINDOWS_PER_DAY
        ? parsedTimes
        : DEFAULT_AGENT_SCHEDULE.times;

    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_AGENT_SCHEDULE.enabled,
      timezone,
      times,
      maxChatsPerDay: CHAT_WINDOWS_PER_DAY,
      messagesPerChat: MESSAGES_PER_CHAT_WINDOW,
      maxMessagesPerDay: CHAT_WINDOWS_PER_DAY * MESSAGES_PER_CHAT_WINDOW,
      schedulerIntervalMinutes: SCHEDULER_INTERVAL_MINUTES,
    };
  } catch {
    return DEFAULT_AGENT_SCHEDULE;
  }
}

export function serialiseAgentSchedule(input: {
  enabled: boolean;
  timezone: string;
  times: string[];
}) {
  const timezone = input.timezone.trim();
  if (!isValidTimeZone(timezone)) {
    throw new Error("Use a valid IANA timezone, for example Etc/UTC.");
  }
  const times = normaliseScheduleTimes(input.times);
  if (input.enabled && times.length !== CHAT_WINDOWS_PER_DAY) {
    throw new Error(`Set exactly ${CHAT_WINDOWS_PER_DAY} communication times.`);
  }

  return JSON.stringify({
    enabled: input.enabled,
    timezone,
    times,
  });
}

export function normaliseScheduleTimes(times: string[]) {
  const seen = new Set<string>();
  for (const raw of times) {
    const time = raw.trim();
    const minutes = parseTimeToMinutes(time);
    if (minutes === null) {
      throw new Error("Times must use 24-hour HH:mm format.");
    }
    if (minutes % SCHEDULER_INTERVAL_MINUTES !== 0) {
      throw new Error("Times must be on 15 minute intervals.");
    }
    seen.add(minutesToTime(minutes));
  }
  const normalised = [...seen].sort();
  if (normalised.length > CHAT_WINDOWS_PER_DAY) {
    throw new Error(`Use no more than ${CHAT_WINDOWS_PER_DAY} communication times.`);
  }
  return normalised;
}

export function currentScheduleWindow(
  schedule: AgentSchedule,
  nowMs = Date.now(),
): { localDate: string; time: string } | null {
  if (!schedule.enabled || schedule.times.length === 0) return null;

  const local = localDateTimeParts(nowMs, schedule.timezone);
  const currentMinutes = local.hour * 60 + local.minute;

  for (const time of schedule.times) {
    const scheduledMinutes = parseTimeToMinutes(time);
    if (scheduledMinutes === null) continue;
    const windowEnd = scheduledMinutes + SCHEDULER_INTERVAL_MINUTES;
    if (currentMinutes >= scheduledMinutes && currentMinutes < windowEnd) {
      return { localDate: local.localDate, time };
    }
  }

  return null;
}

export function localDateKey(timezone: string, nowMs = Date.now()) {
  return localDateTimeParts(nowMs, timezone).localDate;
}

function parseTimeToMinutes(time: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function localDateTimeParts(nowMs: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    localDate: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function isValidTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
