import type { Task } from '../types'

const dayLengthInMinutes = 24 * 60

export function parseTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

export function formatTime(totalMinutes: number) {
  const normalizedMinutes =
    ((Math.round(totalMinutes) % dayLengthInMinutes) + dayLengthInMinutes) %
    dayLengthInMinutes
  const hours = Math.floor(normalizedMinutes / 60)
  const minutes = normalizedMinutes % 60

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

export function parseFlexibleTime(rawValue: string) {
  const cleanedValue = rawValue.trim().toLowerCase()
  const match = cleanedValue.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)

  if (!match) {
    return null
  }

  let hours = Number(match[1])
  const minutes = Number(match[2] ?? '0')
  const meridian = match[3]

  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes > 59) {
    return null
  }

  if (meridian) {
    if (hours < 1 || hours > 12) {
      return null
    }

    if (meridian === 'pm' && hours !== 12) {
      hours += 12
    }

    if (meridian === 'am' && hours === 12) {
      hours = 0
    }
  } else if (hours > 23) {
    return null
  }

  return hours * 60 + minutes
}

export function getDurationInMinutes(startTime: string, endTime: string) {
  const start = parseTime(startTime)
  const end = parseTime(endTime)

  if (end >= start) {
    return end - start
  }

  return end + dayLengthInMinutes - start
}

export function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(dateInput: Date | string, amount: number) {
  const baseDate = typeof dateInput === 'string' ? parseDateKey(dateInput) : new Date(dateInput)
  const nextDate = new Date(baseDate)
  nextDate.setDate(nextDate.getDate() + amount)
  return nextDate
}

export function addMinutesToTime(time: string, amount: number) {
  return formatTime(parseTime(time) + amount)
}

export function compareTasks(left: Task, right: Task) {
  const leftDateTime = `${left.date}T${left.startTime}`
  const rightDateTime = `${right.date}T${right.startTime}`
  return leftDateTime.localeCompare(rightDateTime)
}

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort(compareTasks)
}

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function taskMatchesLabel(task: Task, label: string) {
  return normalizeText(task.title).includes(normalizeText(label))
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2, 10)}`
}

export function formatLongDate(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function formatMonthLabel(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString('es-CO', {
    month: 'long',
    year: 'numeric',
  })
}

export function formatWeekdayShort(dateKey: string) {
  return parseDateKey(dateKey)
    .toLocaleDateString('es-CO', { weekday: 'short' })
    .replace('.', '')
}

export function isToday(dateKey: string) {
  return dateKey === formatDateKey(new Date())
}

export function buildWeekDates(dateKey: string) {
  const selectedDate = parseDateKey(dateKey)
  const weekday = (selectedDate.getDay() + 6) % 7
  const weekStart = addDays(selectedDate, -weekday)

  return Array.from({ length: 7 }, (_, index) => formatDateKey(addDays(weekStart, index)))
}

export function buildMonthMatrix(dateKey: string) {
  const selectedDate = parseDateKey(dateKey)
  const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  const startWeekday = (startOfMonth.getDay() + 6) % 7
  const gridStart = addDays(startOfMonth, -startWeekday)

  return Array.from({ length: 35 }, (_, index) => {
    const date = addDays(gridStart, index)
    return {
      dateKey: formatDateKey(date),
      inCurrentMonth: date.getMonth() === selectedDate.getMonth(),
    }
  })
}

export function getCurrentMinute() {
  const now = new Date()
  return now.getHours() * 60 + now.getMinutes()
}

export function isMinuteInsideTask(currentMinute: number, startTime: string, endTime: string) {
  const start = parseTime(startTime)
  const end = parseTime(endTime)

  if (end >= start) {
    return currentMinute >= start && currentMinute < end
  }

  return currentMinute >= start || currentMinute < end
}
