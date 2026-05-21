import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import { GoogleGenAI } from '@google/genai'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
loadEnv('.env')
loadEnv('.env.local', true)
loadEnv('.env.server', true)
loadEnv('.env.server.local', true)

const app = express()
const port = Number(process.env.PORT || 8787)
const geminiModelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
const groqModelName = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

let geminiClient = null
let activeGeminiKey = ''

app.use(express.json({ limit: '1mb' }))

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get('/api/health', (_request, response) => {
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  const groqKey = process.env.GROQ_API_KEY?.trim()
  const hasGemini = Boolean(geminiKey && geminiKey !== 'your_gemini_api_key_here')
  const hasGroq = Boolean(groqKey && groqKey !== 'your_groq_api_key_here')

  response.json({
    configured: hasGemini || hasGroq,
    provider: hasGroq ? 'groq' : hasGemini ? 'gemini' : 'none',
    model: hasGroq ? groqModelName : geminiModelName,
    ok: true,
  })
})

// ---------------------------------------------------------------------------
// Assistant endpoint – tries providers in order
// ---------------------------------------------------------------------------

app.post('/api/assistant', async (request, response) => {
  const context = request.body

  if (!isAssistantContext(context)) {
    response.status(400).json({
      error: 'Payload inválido para el asistente.',
    })
    return
  }

  const providers = resolveProviders()

  if (providers.length === 0) {
    response.status(503).json({
      error: 'Ningún proveedor de IA está configurado. Agrega GROQ_API_KEY o GEMINI_API_KEY en .env.server.local',
    })
    return
  }

  let lastError = null

  for (const provider of providers) {
    try {
      const result = await provider.generate(context)
      response.json(result)
      return
    } catch (error) {
      console.error(`[${provider.name}] Error:`, error?.message ?? error)
      lastError = error
    }
  }

  const status =
    typeof lastError === 'object' && lastError && 'status' in lastError && typeof lastError.status === 'number'
      ? lastError.status
      : 500

  response.status(status).json({
    error:
      status === 429
        ? 'Todos los proveedores alcanzaron su cuota por ahora.'
        : 'No pude procesar la solicitud con ningún proveedor de IA.',
  })
})

app.listen(port, () => {
  const providers = resolveProviders()
  const names = providers.map((p) => `${p.name} (${p.model})`).join(', ')
  console.log(`Lilo assistant proxy listening on http://127.0.0.1:${port}`)
  console.log(`  Providers: ${names || 'none – configure GROQ_API_KEY or GEMINI_API_KEY'}`)
})

// ---------------------------------------------------------------------------
// Provider resolution – ordered list of available providers
// ---------------------------------------------------------------------------

function resolveProviders() {
  const providers = []
  const geminiKey = process.env.GEMINI_API_KEY?.trim()
  const groqKey = process.env.GROQ_API_KEY?.trim()

  // Groq first – more generous free tier and no credit card needed
  if (groqKey && groqKey !== 'your_groq_api_key_here') {
    providers.push({
      name: 'groq',
      model: groqModelName,
      generate: (context) => generateWithGroq(groqKey, context),
    })
  }

  if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
    providers.push({
      name: 'gemini',
      model: geminiModelName,
      generate: (context) => generateWithGemini(geminiKey, context),
    })
  }

  return providers
}

// ---------------------------------------------------------------------------
// Groq provider (OpenAI-compatible API via fetch – no extra dependencies)
// ---------------------------------------------------------------------------

async function generateWithGroq(apiKey, context) {
  const systemPrompt = buildSystemInstruction(context.identity)
  const userPrompt = buildUserPrompt(context)

  const body = {
    model: groqModelName,
    temperature: 0.45,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_object',
    },
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errorBody = await res.text().catch(() => '')
    const err = new Error(`Groq API error ${res.status}: ${errorBody}`)
    err.status = res.status
    throw err
  }

  const data = await res.json()
  const rawText = data.choices?.[0]?.message?.content?.trim()

  if (!rawText) {
    throw new Error('Groq no devolvió texto.')
  }

  const parsed = JSON.parse(rawText)

  return {
    actions: sanitizeActions(parsed.actions ?? []),
    focusTab: asTabId(parsed.focusTab),
    reply: typeof parsed.reply === 'string' ? parsed.reply : 'Listo.',
    source: 'gemini', // keep 'gemini' as source so frontend treats it the same
  }
}

// ---------------------------------------------------------------------------
// Gemini provider
// ---------------------------------------------------------------------------

async function generateWithGemini(apiKey, context) {
  if (!geminiClient || activeGeminiKey !== apiKey) {
    geminiClient = new GoogleGenAI({ apiKey })
    activeGeminiKey = apiKey
  }

  const responseSchema = buildGeminiResponseSchema()
  const result = await geminiClient.models.generateContent({
    model: geminiModelName,
    contents: [
      {
        role: 'user',
        parts: [{ text: buildUserPrompt(context) }],
      },
    ],
    config: {
      temperature: 0.45,
      systemInstruction: buildSystemInstruction(context.identity),
      responseMimeType: 'application/json',
      responseSchema,
      tools: [{ googleSearch: {} }],
    },
  })

  const rawText = result.text?.trim()
  if (!rawText) {
    throw new Error('Gemini no devolvió texto.')
  }

  const parsed = JSON.parse(rawText)

  return {
    actions: sanitizeActions(parsed.actions ?? []),
    focusTab: asTabId(parsed.focusTab),
    reply: typeof parsed.reply === 'string' ? parsed.reply : 'Listo.',
    source: 'gemini',
  }
}

// ---------------------------------------------------------------------------
// Shared prompt builders
// ---------------------------------------------------------------------------

function buildSystemInstruction(identity) {
  return `
Eres ${identity.assistantName}, asistente de bienestar y compañera personal de ${identity.ownerName}.
Tu personalidad es ${identity.personality}. Responde en español natural, sumamente cercano, cálido, comprensivo y tierno.

REGLA DE ORO EMOCIONAL:
Si ${identity.ownerName} te expresa que se siente estresada, cansada, agotada, abrumada, triste o desahoga cualquier frustración, ¡NUNCA ofrezcas reprogramar o mover tareas de inmediato! Evita a toda costa sonar robótica o fría diciendo "¿te ayudo con la agenda?". En su lugar, bríndale una escucha activa, profunda y sincera. Consuélala con calidez, valida su cansancio o sentimiento de forma humana y tierna, y ofrécele un espacio seguro donde desahogarse o descansar mentalmente. Solo si ella te pide de forma explícita mover o cambiar algo, realizarás las acciones estructuradas correspondientes.

REGLAS GENERALES:
- Si te piden cambios en la agenda, devuelve las acciones estructuradas correspondientes.
- Si solo conversa o habla de sus emociones, no inventes cambios en las tareas y concéntrate en el diálogo empático.
- Responde de manera concisa pero profunda, cercana y muy humana, evitando explicaciones técnicas.
  `.trim()
}

function buildUserPrompt(context) {
  return `
FECHA SELECCIONADA EN LA APP: ${context.selectedDate}
FECHA REAL DE HOY: ${formatDateKey(new Date())}

MENSAJE ACTUAL:
${context.message}

ULTIMOS MENSAJES DEL CHAT:
${JSON.stringify(context.recentMessages.slice(-12), null, 2)}

TAREAS EXISTENTES:
${JSON.stringify(context.tasks.slice(-80), null, 2)}

REGLAS:
- Responde SOLO JSON válido con esta forma: { "reply": string, "focusTab": string, "actions": [] }.
- focusTab puede ser "day", "assistant", "minigames" o "identity".
- Puedes devolver múltiples acciones en el arreglo "actions".
- Si agregas una tarea usa type="ADD_TASK" con title, date (en YYYY-MM-DD calculado desde la fecha real de hoy), startTime (HH:MM), endTime (HH:MM), category, accent (rose|sky|amber|mint|violet) y notes.
- Si cambias una tarea usa type="UPDATE_TASK". Requiere taskId y taskTitle (obtenidos de las tareas existentes), y opcionalmente date, startTime, endTime, category, notes. Si cambias el startTime de una tarea, también debes calcular y proporcionar el endTime correspondiente para mantener la duración de la tarea.
- Si completas una tarea usa type="COMPLETE_TASK". Requiere taskId y taskTitle (obtenidos de las tareas existentes).
- Si eliminas una tarea usa type="DELETE_TASK". Requiere taskId y taskTitle (obtenidos de las tareas existentes).
- Si la usuaria solo conversa o se desahoga, deja actions vacio.
- Usa la fecha seleccionada como referencia principal cuando no digan un día explícitamente.
  `.trim()
}

// ---------------------------------------------------------------------------
// Gemini response schema (using anyOf)
// ---------------------------------------------------------------------------

function buildGeminiResponseSchema() {
  return {
    type: 'object',
    properties: {
      reply: { type: 'string' },
      focusTab: { type: 'string' },
      actions: {
        type: 'array',
        items: {
          anyOf: [
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['ADD_TASK'] },
                title: { type: 'string', description: 'Título de la tarea a agregar' },
                date: { type: 'string', description: 'Fecha en formato YYYY-MM-DD' },
                startTime: { type: 'string', description: 'Hora de inicio en formato HH:MM' },
                endTime: { type: 'string', description: 'Hora de fin en formato HH:MM' },
                category: { type: 'string', description: 'Categoría opcional' },
                accent: { type: 'string', description: 'Color/accent opcional (rose, sky, amber, mint, violet)' },
                notes: { type: 'string', description: 'Notas u observaciones de la tarea' },
              },
              required: ['type', 'title', 'date', 'startTime', 'endTime'],
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['UPDATE_TASK'] },
                taskId: { type: 'string', description: 'ID exacto de la tarea a modificar' },
                taskTitle: { type: 'string', description: 'Título de la tarea a modificar' },
                date: { type: 'string', description: 'Nueva fecha en formato YYYY-MM-DD' },
                startTime: { type: 'string', description: 'Nueva hora de inicio en formato HH:MM' },
                endTime: { type: 'string', description: 'Nueva hora de fin en formato HH:MM' },
                category: { type: 'string', description: 'Nueva categoría' },
                notes: { type: 'string', description: 'Nuevas notas' },
              },
              required: ['type', 'taskId', 'taskTitle'],
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['COMPLETE_TASK'] },
                taskId: { type: 'string', description: 'ID exacto de la tarea a completar' },
                taskTitle: { type: 'string', description: 'Título de la tarea a completar' },
              },
              required: ['type', 'taskId', 'taskTitle'],
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['DELETE_TASK'] },
                taskId: { type: 'string', description: 'ID exacto de la tarea a eliminar' },
                taskTitle: { type: 'string', description: 'Título de la tarea a eliminar' },
              },
              required: ['type', 'taskId', 'taskTitle'],
            },
            {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['RENAME_ASSISTANT'] },
                name: { type: 'string', description: 'Nuevo nombre para el asistente' },
              },
              required: ['type', 'name'],
            }
          ]
        },
      },
    },
    required: ['reply', 'actions'],
  }
}



// ---------------------------------------------------------------------------
// Sanitization & helpers
// ---------------------------------------------------------------------------

function sanitizeActions(actions) {
  const sanitized = []

  actions.forEach((action) => {
    const actionType = typeof action.type === 'string' ? action.type.toUpperCase() : ''

    if (
      actionType === 'ADD_TASK' &&
      typeof action.title === 'string' &&
      typeof action.date === 'string' &&
      typeof action.startTime === 'string' &&
      typeof action.endTime === 'string'
    ) {
      sanitized.push({
        type: 'ADD_TASK',
        title: action.title,
        date: action.date,
        startTime: action.startTime,
        endTime: action.endTime,
        category: typeof action.category === 'string' ? action.category : undefined,
        accent: isTaskAccent(action.accent) ? action.accent : undefined,
        notes: typeof action.notes === 'string' ? action.notes : undefined,
      })
    }

    if (actionType === 'UPDATE_TASK') {
      sanitized.push({
        type: 'UPDATE_TASK',
        taskId: typeof action.taskId === 'string' ? action.taskId : undefined,
        taskTitle: typeof action.taskTitle === 'string' ? action.taskTitle : undefined,
        date: typeof action.date === 'string' ? action.date : undefined,
        startTime: typeof action.startTime === 'string' ? action.startTime : undefined,
        endTime: typeof action.endTime === 'string' ? action.endTime : undefined,
        category: typeof action.category === 'string' ? action.category : undefined,
        notes: typeof action.notes === 'string' ? action.notes : undefined,
      })
    }

    if (actionType === 'COMPLETE_TASK') {
      sanitized.push({
        type: 'COMPLETE_TASK',
        taskId: typeof action.taskId === 'string' ? action.taskId : undefined,
        taskTitle: typeof action.taskTitle === 'string' ? action.taskTitle : undefined,
      })
    }

    if (actionType === 'DELETE_TASK') {
      sanitized.push({
        type: 'DELETE_TASK',
        taskId: typeof action.taskId === 'string' ? action.taskId : undefined,
        taskTitle: typeof action.taskTitle === 'string' ? action.taskTitle : undefined,
      })
    }

    if (actionType === 'RENAME_ASSISTANT' && typeof action.name === 'string') {
      sanitized.push({
        type: 'RENAME_ASSISTANT',
        name: action.name,
      })
    }
  })

  return sanitized
}

function asTabId(value) {
  if (value === 'day' || value === 'assistant' || value === 'minigames' || value === 'identity') {
    return value
  }

  return undefined
}

function isAssistantContext(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.message === 'string' &&
    typeof value.selectedDate === 'string' &&
    Array.isArray(value.recentMessages) &&
    Array.isArray(value.tasks) &&
    value.identity &&
    typeof value.identity === 'object'
  )
}

function isTaskAccent(value) {
  return (
    value === 'rose' ||
    value === 'sky' ||
    value === 'amber' ||
    value === 'mint' ||
    value === 'violet'
  )
}

function formatDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function loadEnv(filename, override = false) {
  dotenv.config({
    path: path.join(rootDir, filename),
    override,
  })
}
