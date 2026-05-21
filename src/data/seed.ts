import { addDays, createId, formatDateKey, normalizeText } from '../lib/time'
import type { AssistantIdentity, ChatMessage, PersonalityTone, Task } from '../types'

export const defaultIdentity: AssistantIdentity = {
  assistantName: 'Lilo',
  ownerName: 'Nicol',
  personality: 'tierna',
  palette: 'pastel',
  sleepStart: '23:15',
  sleepEnd: '07:00',
}

export function createSeedTasks(referenceDate = new Date()): Task[] {
  const today = formatDateKey(referenceDate)
  const tomorrow = formatDateKey(addDays(referenceDate, 1))

  return [
    {
      id: createId(),
      title: 'Desayuno tranquilo',
      category: 'Rutina',
      date: today,
      startTime: '07:30',
      endTime: '08:00',
      completed: false,
      accent: 'amber',
      createdBy: 'manual',
      notes: 'Sin pantallas. Solo empezar suave.',
    },
    {
      id: createId(),
      title: 'Bloque de estudio',
      category: 'Enfoque',
      date: today,
      startTime: '09:00',
      endTime: '11:00',
      completed: false,
      accent: 'violet',
      createdBy: 'manual',
      notes: 'Avanzar el entregable principal.',
    },
    {
      id: createId(),
      title: 'Llamada con mamá',
      category: 'Personal',
      date: today,
      startTime: '18:30',
      endTime: '19:00',
      completed: false,
      accent: 'rose',
      createdBy: 'assistant',
      notes: 'Preguntarle cómo le fue hoy.',
    },
    {
      id: createId(),
      title: 'Planear la semana',
      category: 'Organización',
      date: tomorrow,
      startTime: '08:30',
      endTime: '09:00',
      completed: false,
      accent: 'sky',
      createdBy: 'manual',
    },
  ]
}

export function createSeedMessages(identity = defaultIdentity): ChatMessage[] {
  return [
    {
      id: createId(),
      role: 'assistant',
      text: `Soy ${identity.assistantName}. Puedo ayudarte a ordenar el día, mover tareas o acompañarte si lo necesitas.`,
      createdAt: new Date().toISOString(),
      status: 'local',
    },
  ]
}

export const personalityOptions: PersonalityTone[] = [
  'tierna',
  'motivadora',
  'sarcastica',
]

export const paletteOptions = [
  {
    id: 'pastel',
    label: 'Algodón',
    swatches: ['#ff7ca8', '#7fd7ff', '#ffe28a'],
  },
  {
    id: 'aurora',
    label: 'Brisa',
    swatches: ['#4cc9f0', '#7d82ff', '#7de2b6'],
  },
  {
    id: 'neon',
    label: 'Medianoche',
    swatches: ['#ff5f9e', '#5ee8ff', '#ffd86b'],
  },
]

export function migrateStoredTasks(rawValue: unknown, referenceDate = new Date()): Task[] {
  if (!Array.isArray(rawValue)) {
    return createSeedTasks(referenceDate)
  }

  const today = referenceDate

  const migratedTasks = rawValue.reduce<Task[]>((collection, rawTask) => {
    if (!rawTask || typeof rawTask !== 'object') {
      return collection
    }

    const task = rawTask as Record<string, unknown>
    const title = typeof task.title === 'string' ? task.title : null
    const startTime = typeof task.startTime === 'string' ? task.startTime : null
    const endTime = typeof task.endTime === 'string' ? task.endTime : null

    if (!title || !startTime || !endTime) {
      return collection
    }

    if (typeof task.date === 'string') {
      collection.push({
        id: typeof task.id === 'string' ? task.id : createId(),
        title,
        category: typeof task.category === 'string' ? task.category : 'General',
        date: task.date,
        startTime,
        endTime,
        completed: Boolean(task.completed),
        accent: isTaskAccent(task.accent) ? task.accent : inferAccent(title),
        createdBy: task.createdBy === 'assistant' ? 'assistant' : 'manual',
        notes: typeof task.notes === 'string' ? task.notes : undefined,
      })
      return collection
    }

    const dayOffset = typeof task.dayOffset === 'number' ? task.dayOffset : 0

    collection.push({
      id: typeof task.id === 'string' ? task.id : createId(),
      title,
      category: typeof task.category === 'string' ? task.category : 'General',
      date: formatDateKey(addDays(today, dayOffset)),
      startTime,
      endTime,
      completed: Boolean(task.completed),
      accent: isTaskAccent(task.accent) ? task.accent : inferAccent(title),
      createdBy: 'manual',
      notes: typeof task.notes === 'string' ? task.notes : undefined,
    })

    return collection
  }, [])

  return migratedTasks.length > 0 ? migratedTasks : createSeedTasks(referenceDate)
}

function isTaskAccent(value: unknown): value is Task['accent'] {
  return (
    value === 'rose' ||
    value === 'sky' ||
    value === 'amber' ||
    value === 'mint' ||
    value === 'violet'
  )
}

function inferAccent(title: string): Task['accent'] {
  const normalizedTitle = normalizeText(title)

  if (normalizedTitle.includes('estudio') || normalizedTitle.includes('trabajo')) {
    return 'violet'
  }

  if (normalizedTitle.includes('plan') || normalizedTitle.includes('organ')) {
    return 'sky'
  }

  if (normalizedTitle.includes('desayuno') || normalizedTitle.includes('comida')) {
    return 'amber'
  }

  return 'rose'
}
