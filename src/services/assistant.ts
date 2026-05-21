import {
  addDays,
  addMinutesToTime,
  formatDateKey,
  normalizeText,
  parseFlexibleTime,
  taskMatchesLabel,
} from '../lib/time'
import { resolveAssistantApiUrl } from './runtime'
import type {
  AssistantAction,
  AssistantIdentity,
  AssistantResult,
  ChatMessage,
  TabId,
  Task,
  TaskAccent,
} from '../types'

type AddTaskAction = Extract<AssistantAction, { type: 'ADD_TASK' }>
type AssistantBackendHealth = {
  configured: boolean
  model?: string
  ok: boolean
}
type AssistantContext = {
  identity: AssistantIdentity
  message: string
  recentMessages: ChatMessage[]
  selectedDate: string
  tasks: Task[]
}
type AssistantBackendStatus = 'offline' | 'online' | 'unconfigured'
type UpdateTaskAction = Extract<AssistantAction, { type: 'UPDATE_TASK' }>
type CompleteTaskAction = Extract<AssistantAction, { type: 'COMPLETE_TASK' }>
type RenameAssistantAction = Extract<AssistantAction, { type: 'RENAME_ASSISTANT' }>

export async function probeAssistantBackend(): Promise<{
  model?: string
  status: AssistantBackendStatus
}> {
  try {
    const response = await fetch(resolveAssistantApiUrl('/health'))
    if (!response.ok) {
      return { status: 'offline' }
    }

    const data = (await response.json()) as AssistantBackendHealth
    return {
      model: data.model,
      status: data.configured ? 'online' : 'unconfigured',
    }
  } catch {
    return { status: 'offline' }
  }
}

export async function sendAssistantMessage(
  context: AssistantContext,
): Promise<AssistantResult> {
  const localFirstResult = sendLocalMessage(context)

  if (shouldShortCircuitLocal(context.message, localFirstResult)) {
    return localFirstResult
  }

  try {
    return await sendBackendMessage(context)
  } catch (error) {
    console.error('Assistant backend fallback to local parser:', error)

    if (error instanceof Error) {
      if (error.message.includes('cuota') || error.message.includes('429')) {
        return {
          ...localFirstResult,
          reply:
            localFirstResult.actions.length > 0
              ? localFirstResult.reply
              : 'La IA agotó su cuota por ahora. Puedo seguir con cambios simples mientras tanto.',
          source: 'local',
        }
      }

      if (error.message.includes('no está configurad') || error.message.includes('Ningún proveedor')) {
        return {
          ...localFirstResult,
          reply:
            localFirstResult.actions.length > 0
              ? localFirstResult.reply
              : 'La IA del servidor todavía no está activada. Mientras tanto sigo en modo local.',
          source: 'local',
        }
      }
    }
  }

  return localFirstResult
}

function shouldShortCircuitLocal(message: string, result: AssistantResult) {
  const normalizedMessage = normalizeText(message).trim()

  if (result.actions.length > 0) {
    return true
  }

  // Si contiene palabras clave de desahogo o necesidades complejas, NO hacemos atajo local
  const hasEmotionalOrComplexNeed =
    normalizedMessage.includes('estres') ||
    normalizedMessage.includes('cansad') ||
    normalizedMessage.includes('agotad') ||
    normalizedMessage.includes('triste') ||
    normalizedMessage.includes('abrumad') ||
    normalizedMessage.includes('mal') ||
    normalizedMessage.includes('rutina') ||
    normalizedMessage.includes('pilates') ||
    normalizedMessage.includes('ejercicio')

  if (hasEmotionalOrComplexNeed) {
    return false
  }

  // Solo hacemos atajo si el mensaje es corto y es un saludo simple o pregunta de identidad
  const isSimpleGreeting =
    normalizedMessage === 'hola' ||
    normalizedMessage === 'buenas' ||
    normalizedMessage === 'buenos dias' ||
    normalizedMessage === 'buenas tardes' ||
    normalizedMessage === 'buenas noches' ||
    normalizedMessage === 'tu nombre' ||
    normalizedMessage === 'como te llamas'

  return isSimpleGreeting
}

async function sendBackendMessage(context: AssistantContext): Promise<AssistantResult> {
  const response = await fetch(resolveAssistantApiUrl('/assistant'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(context),
  })

  if (!response.ok) {
    const errorText = await response.text()

    try {
      const parsed = JSON.parse(errorText) as { error?: string }
      throw new Error(parsed.error || `Assistant backend failed with ${response.status}`)
    } catch {
      throw new Error(errorText || `Assistant backend failed with ${response.status}`)
    }
  }

  const data = (await response.json()) as AssistantResult

  return {
    actions: sanitizeActions(data.actions ?? []),
    focusTab: asTabId(data.focusTab),
    reply: data.reply ?? 'Listo.',
    source: data.source === 'gemini' ? 'gemini' : 'local',
  }
}

function sendLocalMessage(context: AssistantContext): AssistantResult {
  const normalizedMessage = normalizeText(context.message)

  const addTaskAction = parseAddTask(context.message, context.selectedDate)
  if (addTaskAction) {
    return {
      reply: `Listo. Dejé "${addTaskAction.title}" para ${readableDateForReply(addTaskAction.date)} de ${addTaskAction.startTime} a ${addTaskAction.endTime}.`,
      actions: [addTaskAction],
      source: 'local',
      focusTab: 'day',
    }
  }

  const updateTaskAction = parseUpdateTask(
    context.message,
    context.tasks,
    context.selectedDate,
  )
  if (updateTaskAction) {
    return {
      reply: 'Hecho. Ya lo acomodé en tu agenda.',
      actions: [updateTaskAction],
      source: 'local',
      focusTab: 'day',
    }
  }

  const completeTaskAction = parseCompleteTask(
    context.message,
    context.tasks,
    context.selectedDate,
  )
  if (completeTaskAction) {
    return {
      reply: 'Perfecto. Ya quedó marcada como hecha.',
      actions: [completeTaskAction],
      source: 'local',
      focusTab: 'day',
    }
  }

  const deleteTaskAction = parseDeleteTask(
    context.message,
    context.tasks,
    context.selectedDate,
  )
  if (deleteTaskAction) {
    const taskTitle = deleteTaskAction.taskTitle ?? 'la tarea'
    return {
      reply: `Hecho. Ya eliminé "${taskTitle}" de tu agenda.`,
      actions: [deleteTaskAction],
      source: 'local',
      focusTab: 'day',
    }
  }

  const renameAction = parseRenameAssistant(context.message)
  if (renameAction) {
    return {
      reply: `Me gusta. Desde ahora puedes llamarme ${renameAction.name}.`,
      actions: [renameAction],
      source: 'local',
      focusTab: 'identity',
    }
  }



  if (
    normalizedMessage.includes('hola') ||
    normalizedMessage.includes('buenos dias') ||
    normalizedMessage.includes('buenas')
  ) {
    return {
      reply: `Hola ${context.identity.ownerName}. Soy ${context.identity.assistantName}. Si quieres, vemos tu agenda o solo platicamos un rato.`,
      actions: [],
      source: 'local',
      focusTab: 'assistant',
    }
  }

  if (
    normalizedMessage.includes('tu nombre') ||
    normalizedMessage.includes('como te llamas')
  ) {
    return {
      reply: `Soy ${context.identity.assistantName}, tu asistente.`,
      actions: [],
      source: 'local',
      focusTab: 'assistant',
    }
  }

  return {
    reply:
      'Puedo agregar tareas, moverlas, marcarlas como hechas y seguir el contexto reciente del chat.',
    actions: [],
    source: 'local',
    focusTab: 'assistant',
  }
}

function parseAddTask(message: string, selectedDate: string): AddTaskAction | null {
  const match = message.match(
    /\b(?:agrega(?:me)?|añade(?:me)?|anade(?:me)?|crea(?:me)?|pon(?:me)?)\b([\s\S]*?)(?:\b(hoy|mañana|manana)\b)?\s*(?:de|a las)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:a|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  )

  if (!match) {
    return null
  }

  const [, rawTitle, dayToken, rawStart, rawEnd] = match
  const timeRange = resolveTimeRange(rawStart, rawEnd)
  if (!timeRange) {
    return null
  }

  const cleanedTitle = rawTitle
    .replace(/\bhoy\b/gi, '')
    .replace(/\bmañana\b/gi, '')
    .replace(/\bmanana\b/gi, '')
    .replace(/\buna\b|\bun\b/gi, '')
    .trim()

  const title = cleanedTitle.length > 0 ? toTitle(cleanedTitle) : 'Nueva tarea'
  const category = inferCategory(title)

  return {
    type: 'ADD_TASK',
    title,
    date: resolveDateFromToken(selectedDate, dayToken),
    startTime: timeRange.startTime,
    endTime: timeRange.endTime,
    category,
    accent: inferAccent(category),
  }
}

function parseUpdateTask(
  message: string,
  tasks: Task[],
  selectedDate: string,
): UpdateTaskAction | null {
  const normalizedMessage = normalizeText(message)
  const matchedTask = findTaskFromMessage(message, tasks, selectedDate)

  if (!matchedTask) {
    return null
  }

  if (
    normalizedMessage.includes('manana') &&
    (normalizedMessage.includes('mueve') ||
      normalizedMessage.includes('reprograma') ||
      normalizedMessage.includes('pasa'))
  ) {
    return {
      type: 'UPDATE_TASK',
      taskId: matchedTask.id,
      date: formatDateKey(addDays(matchedTask.date, 1)),
    }
  }

  const newRangeMatch = message.match(
    /\b(?:a|de)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:a|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i,
  )

  if (
    newRangeMatch &&
    (normalizedMessage.includes('mueve') ||
      normalizedMessage.includes('cambia') ||
      normalizedMessage.includes('reprograma'))
  ) {
    const timeRange = resolveTimeRange(newRangeMatch[1], newRangeMatch[2])
    if (!timeRange) {
      return null
    }

    return {
      type: 'UPDATE_TASK',
      taskId: matchedTask.id,
      startTime: timeRange.startTime,
      endTime: timeRange.endTime,
    }
  }

  const delayMatch = normalizedMessage.match(/\b(15|30|45|60)\b/)
  if (
    delayMatch &&
    (normalizedMessage.includes('retrasa') ||
      normalizedMessage.includes('aplaza') ||
      normalizedMessage.includes('pospon'))
  ) {
    const minutes = Number(delayMatch[1])
    return {
      type: 'UPDATE_TASK',
      taskId: matchedTask.id,
      startTime: addMinutesToTime(matchedTask.startTime, minutes),
      endTime: addMinutesToTime(matchedTask.endTime, minutes),
    }
  }

  return null
}

function parseCompleteTask(
  message: string,
  tasks: Task[],
  selectedDate: string,
): CompleteTaskAction | null {
  const normalizedMessage = normalizeText(message)
  if (
    !normalizedMessage.includes('complet') &&
    !normalizedMessage.includes('termine') &&
    !normalizedMessage.includes('ya hice')
  ) {
    return null
  }

  const matchedTask = findTaskFromMessage(message, tasks, selectedDate)
  if (!matchedTask) {
    return null
  }

  return {
    type: 'COMPLETE_TASK',
    taskId: matchedTask.id,
  }
}

function parseDeleteTask(
  message: string,
  tasks: Task[],
  selectedDate: string,
): Extract<AssistantAction, { type: 'DELETE_TASK' }> | null {
  const normalizedMessage = normalizeText(message)
  if (
    !normalizedMessage.includes('eliminar') &&
    !normalizedMessage.includes('borra') &&
    !normalizedMessage.includes('quita') &&
    !normalizedMessage.includes('cancela')
  ) {
    return null
  }

  const matchedTask = findTaskFromMessage(message, tasks, selectedDate)
  if (!matchedTask) {
    return null
  }

  return {
    type: 'DELETE_TASK',
    taskId: matchedTask.id,
    taskTitle: matchedTask.title,
  }
}

function parseRenameAssistant(message: string): RenameAssistantAction | null {
  const match = message.match(
    /\b(?:llamarte|te llamaras|te llamarás|quiero llamarte)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ ]{2,24})/i,
  )

  if (!match) {
    return null
  }

  return {
    type: 'RENAME_ASSISTANT',
    name: toTitle(match[1].trim()),
  }
}

function findTaskFromMessage(message: string, tasks: Task[], selectedDate?: string) {
  const normalizedMessage = normalizeText(message)
  const scopedTasks = selectedDate
    ? tasks.filter((task) => task.date === selectedDate)
    : tasks

  const timeHint = message.match(/\b(?:las|la)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i)
  if (timeHint) {
    const parsedTime = parseFlexibleTime(timeHint[1])
    if (parsedTime !== null) {
      const exactInScope = scopedTasks.find(
        (task) => parseFlexibleTime(task.startTime) === parsedTime,
      )
      if (exactInScope) {
        return exactInScope
      }

      const exactGlobal = tasks.find((task) => parseFlexibleTime(task.startTime) === parsedTime)
      if (exactGlobal) {
        return exactGlobal
      }
    }
  }

  return (
    scopedTasks.find((task) => taskMatchesLabel(task, normalizedMessage)) ??
    tasks.find((task) => taskMatchesLabel(task, normalizedMessage))
  )
}

function sanitizeActions(actions: AssistantAction[]) {
  return actions.filter(Boolean)
}

function resolveTimeRange(rawStart: string, rawEnd: string) {
  const startMeridian = rawStart.match(/\b(am|pm)\b/i)?.[1]?.toLowerCase()
  const endMeridian = rawEnd.match(/\b(am|pm)\b/i)?.[1]?.toLowerCase()

  const hydratedStart = startMeridian
    ? rawStart
    : endMeridian
      ? `${rawStart} ${endMeridian}`
      : rawStart
  const hydratedEnd = endMeridian
    ? rawEnd
    : startMeridian
      ? `${rawEnd} ${startMeridian}`
      : rawEnd

  const start = parseFlexibleTime(hydratedStart)
  const end = parseFlexibleTime(hydratedEnd)

  if (start === null || end === null) {
    return null
  }

  return {
    startTime: toTimeString(start),
    endTime: toTimeString(end),
  }
}

function resolveDateFromToken(selectedDate: string, token?: string) {
  const normalizedToken = normalizeText(token ?? '')

  if (normalizedToken === 'manana') {
    return formatDateKey(addDays(selectedDate, 1))
  }

  return selectedDate
}

function inferCategory(title: string) {
  const normalizedTitle = normalizeText(title)

  if (
    normalizedTitle.includes('dentista') ||
    normalizedTitle.includes('doctor') ||
    normalizedTitle.includes('medic')
  ) {
    return 'Cuidado'
  }

  if (
    normalizedTitle.includes('junta') ||
    normalizedTitle.includes('reunion') ||
    normalizedTitle.includes('estudio') ||
    normalizedTitle.includes('proyecto')
  ) {
    return 'Enfoque'
  }

  if (
    normalizedTitle.includes('comer') ||
    normalizedTitle.includes('descanso') ||
    normalizedTitle.includes('break')
  ) {
    return 'Pausa'
  }

  return 'Personal'
}

function inferAccent(category: string): TaskAccent {
  const normalizedCategory = normalizeText(category)

  if (normalizedCategory.includes('enfoque')) {
    return 'violet'
  }

  if (normalizedCategory.includes('cuidado')) {
    return 'sky'
  }

  if (normalizedCategory.includes('pausa')) {
    return 'amber'
  }

  if (normalizedCategory.includes('rutina')) {
    return 'mint'
  }

  return 'rose'
}

function toTimeString(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

function toTitle(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function asTabId(value: TabId | undefined): TabId | undefined {
  if (value === 'day' || value === 'assistant' || value === 'minigames' || value === 'identity') {
    return value
  }

  return undefined
}

function readableDateForReply(dateKey: string) {
  const today = formatDateKey(new Date())
  const tomorrow = formatDateKey(addDays(today, 1))

  if (dateKey === today) {
    return 'hoy'
  }

  if (dateKey === tomorrow) {
    return 'mañana'
  }

  return dateKey
}
