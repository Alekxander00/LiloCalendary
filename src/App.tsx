import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Chess, type Move, type Square } from 'chess.js'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  MessageCircle,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  X,
  Music,
  Sun,
  Moon,
  CheckCircle2,
  Target,
  Radio,
  Play,
  Pause,
  ExternalLink,
} from 'lucide-react'
import {
  createSeedMessages,
  createSeedTasks,
  defaultIdentity,
  migrateStoredTasks,
  paletteOptions,
  personalityOptions,
} from './data/seed'
import {
  addDays,
  buildMonthMatrix,
  buildWeekDates,
  createId,
  formatDateKey,
  formatLongDate,
  formatMonthLabel,
  formatTime,
  formatWeekdayShort,
  getCurrentMinute,
  getDurationInMinutes,
  isMinuteInsideTask,
  isToday,
  parseDateKey,
  sortTasks,
} from './lib/time'
import { probeAssistantBackend, sendAssistantMessage } from './services/assistant'
import type {
  AssistantAction,
  AssistantIdentity,
  ChatMessage,
  PaletteMode,
  TabId,
  Task,
  Goal,
} from './types'

type AssistantConnection = {
  model?: string
  status: 'checking' | 'offline' | 'online' | 'unconfigured'
}

type MemoryCard = {
  emoji: string
  id: string
}

type MinigameSection = 'chess' | 'memory' | 'pet'

type PetAction = 'clean' | 'cuddle' | 'feed' | 'play' | 'rest' | 'talk'

type PetState = {
  bond: number
  energy: number
  message: string
  mood: number
}

type TaskDraft = {
  accent: Task['accent']
  category: string
  date: string
  endTime: string
  notes: string
  startTime: string
  title: string
}

type TaskModalState =
  | {
      draft: TaskDraft
      mode: 'create' | 'edit'
      taskId: null | string
    }
  | null

const tabs: Array<{ icon: typeof CalendarDays; id: TabId; label: string }> = [
  { id: 'day', label: 'Agenda', icon: CalendarDays },
  { id: 'assistant', label: 'Asistente', icon: MessageCircle },
  { id: 'minigames', label: 'Juegos', icon: Gamepad2 },
  { id: 'identity', label: 'Identidad', icon: Palette },
]

const minigameTabs: Array<{ id: MinigameSection; label: string }> = [
  { id: 'pet', label: 'Mascota' },
  { id: 'chess', label: 'Ajedrez' },
  { id: 'memory', label: 'Memoria' },
]

const taskAccentStyles: Record<Task['accent'], { dot: string; soft: string }> = {
  rose: {
    dot: 'bg-rose-500',
    soft: 'bg-rose-100 text-rose-800',
  },
  sky: {
    dot: 'bg-sky-500',
    soft: 'bg-sky-100 text-sky-800',
  },
  amber: {
    dot: 'bg-amber-500',
    soft: 'bg-amber-100 text-amber-800',
  },
  mint: {
    dot: 'bg-emerald-500',
    soft: 'bg-emerald-100 text-emerald-800',
  },
  violet: {
    dot: 'bg-violet-500',
    soft: 'bg-violet-100 text-violet-800',
  },
}

const unicodePieces: Record<string, string> = {
  bb: '\u265D',
  bk: '\u265A',
  bn: '\u265E',
  bp: '\u265F',
  bq: '\u265B',
  br: '\u265C',
  wb: '\u2657',
  wk: '\u2654',
  wn: '\u2658',
  wp: '\u2659',
  wq: '\u2655',
  wr: '\u2656',
}

const memorySymbols = ['🌷', '🪐', '☁️', '🍓', '🧁', '🎀', '⭐', '🌙']
const panelClass = 'lilo-panel rounded-[28px] p-3.5 sm:p-5'
const defaultGoals: Goal[] = [
  { id: 'goal-1', title: 'Rutina de hidratación y pausas', completed: false, linkedTaskIds: [] },
  { id: 'goal-2', title: 'Estudiar/Trabajar enfocado', completed: false, linkedTaskIds: [] },
  { id: 'goal-3', title: 'Desconexión digital nocturna', completed: false, linkedTaskIds: [] }
]

const lofiTracks = [
  { title: "Sunset Dreams", artist: "Lilo Ambient Beats", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { title: "Midnight Chill", artist: "Synth & Rain Lofi", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { title: "Coffee Shop Study", artist: "Chill Cafe Study", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
]

function playPetSound(type: 'happy' | 'eating' | 'sleeping' | 'chirp') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    if (type === 'happy') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08) // A5
      gain.gain.setValueAtTime(0.04, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.2)
    } else if (type === 'eating') {
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(250, ctx.currentTime)
      osc.frequency.setValueAtTime(120, ctx.currentTime + 0.06)
      osc.frequency.setValueAtTime(220, ctx.currentTime + 0.12)
      gain.gain.setValueAtTime(0.05, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.2)
    } else if (type === 'sleeping') {
      osc.type = 'sine'
      osc.frequency.setValueAtTime(180, ctx.currentTime)
      gain.gain.setValueAtTime(0.03, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.35)
    } else {
      osc.frequency.setValueAtTime(783.99, ctx.currentTime) // G5
      gain.gain.setValueAtTime(0.03, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.08)
    }
  } catch (e) {
    console.warn("Sound blocked or not supported:", e)
  }
}

function getSpotifyEmbedUrl(url: string): string {
  if (!url) return ''
  if (url.includes('/embed/')) return url
  const match = url.match(/spotify\.com\/(playlist|album|track|artist)\/([a-zA-Z0-9]+)/)
  if (match) {
    const type = match[1]
    const id = match[2]
    return `https://open.spotify.com/embed/${type}/${id}`
  }
  const uriMatch = url.match(/spotify:(playlist|album|track|artist):([a-zA-Z0-9]+)/)
  if (uriMatch) {
    const type = uriMatch[1]
    const id = uriMatch[2]
    return `https://open.spotify.com/embed/${type}/${id}`
  }
  return url
}

function App() {
  const todayDateKey = formatDateKey(new Date())
  const [activeTab, setActiveTab] = useStoredState<TabId>('lilo.active-tab', 'day')
  const [direction, setDirection] = useState(1)
  const [selectedDate, setSelectedDate] = useStoredState<string>(
    'lilo.selected-date',
    todayDateKey,
  )
  const [tasks, setTasks] = useStoredState<Task[]>(
    'lilo.tasks',
    () => createSeedTasks(new Date()),
    (rawValue) => migrateStoredTasks(rawValue, new Date()),
  )
  const [messages, setMessages] = useStoredState<ChatMessage[]>(
    'lilo.messages',
    () => createSeedMessages(defaultIdentity),
  )
  const [identity, setIdentity] = useStoredState<AssistantIdentity>(
    'lilo.identity',
    defaultIdentity,
  )
  const [chatDraft, setChatDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [taskModal, setTaskModal] = useState<TaskModalState | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [currentMinute, setCurrentMinute] = useState(() => getCurrentMinute())
  const [petState, setPetState] = useStoredState<PetState>('lilo.pet-state', {
    bond: 62,
    energy: 68,
    mood: 70,
    message: 'Estoy lista para acompañar tu día.',
  })

  // --- NUEVOS ESTADOS DE LILO UPGRADE ---
  const [goals, setGoals] = useStoredState<Goal[]>('lilo.goals', defaultGoals)
  const [time, setTime] = useState(() => new Date())
  const [musicMode, setMusicMode] = useStoredState<'lofi' | 'spotify'>('lilo.music-mode', 'lofi')
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0)
  const [isMusicPlaying, setIsMusicPlaying] = useState(false)
  const [isMusicOpen, setIsMusicOpen] = useState(false)
  const [spotifyUrl, setSpotifyUrl] = useStoredState<string>(
    'lilo.spotify-url',
    'https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui2ExPn',
  )
  const [isDetectingExternal, setIsDetectingExternal] = useState(false)
  const [petExpression, setPetExpression] = useState<'idle' | 'happy' | 'sleep' | 'dizzy' | 'excited'>('idle')
  const [petHearts, setPetHearts] = useState<Array<{ id: number; x: number; r: number; char: string }>>([])
  const [chessFen, setChessFen] = useStoredState<string>(
    'lilo.chess-fen',
    new Chess().fen(),
  )
  const [selectedSquare, setSelectedSquare] = useState<null | Square>(null)
  const [chessMessage, setChessMessage] = useState('Tu turno.')
  const [chessThinking, setChessThinking] = useState(false)
  const [assistantConnection, setAssistantConnection] = useState<AssistantConnection>({
    status: 'checking',
  })
  const [minigameSection, setMinigameSection] = useState<MinigameSection>('pet')
  const [memoryDeck, setMemoryDeck] = useState<MemoryCard[]>(() => buildMemoryDeck())
  const [memoryFlipped, setMemoryFlipped] = useState<number[]>([])
  const [memoryMatched, setMemoryMatched] = useState<number[]>([])
  const [memoryMoves, setMemoryMoves] = useState(0)
  const [memoryLocked, setMemoryLocked] = useState(false)
  const chessReplyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = identity.palette
    document.body.dataset.theme = identity.palette
  }, [identity.palette])

  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setCurrentMinute(getCurrentMinute())
      setTime(new Date())
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    const currentTrack = lofiTracks[currentTrackIndex]
    if (currentTrack) {
      const audio = new Audio(currentTrack.url)
      audio.loop = true
      audioRef.current = audio
      if (isMusicPlaying && musicMode === 'lofi') {
        audio.play().catch((e) => console.log('Audio play blocked:', e))
      }
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [currentTrackIndex])

  useEffect(() => {
    if (audioRef.current) {
      if (isMusicPlaying && musicMode === 'lofi') {
        audioRef.current.play().catch((e) => console.log('Audio play blocked:', e))
      } else {
        audioRef.current.pause()
      }
    }
  }, [isMusicPlaying, musicMode])

  useEffect(() => {
    void refreshAssistantConnection()
  }, [])

  useEffect(() => {
    if (memoryFlipped.length !== 2) {
      return
    }

    const [firstIndex, secondIndex] = memoryFlipped
    const firstCard = memoryDeck[firstIndex]
    const secondCard = memoryDeck[secondIndex]

    if (!firstCard || !secondCard) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setMemoryMoves((previous) => previous + 1)

      if (firstCard.emoji === secondCard.emoji) {
        setMemoryMatched((previous) => [...previous, firstIndex, secondIndex])
      }

      setMemoryFlipped([])
      setMemoryLocked(false)
    }, 680)

    return () => window.clearTimeout(timeoutId)
  }, [memoryDeck, memoryFlipped])

  useEffect(() => {
    return () => {
      if (chessReplyTimerRef.current) {
        window.clearTimeout(chessReplyTimerRef.current)
      }
    }
  }, [])

  const activeTabIndex = tabs.findIndex((tab) => tab.id === activeTab)
  const selectedDateTasks = sortTasks(tasks.filter((task) => task.date === selectedDate))
  const selectedTask = selectedTaskId
    ? tasks.find((task) => task.id === selectedTaskId) ?? null
    : null
  const completedTasks = selectedDateTasks.filter((task) => task.completed).length
  const completionRate =
    selectedDateTasks.length === 0 ? 0 : completedTasks / selectedDateTasks.length
  const monthLabel = capitalizeText(formatMonthLabel(selectedDate))
  const longSelectedDate = capitalizeText(formatLongDate(selectedDate))
  const weekDates = buildWeekDates(selectedDate)
  const monthMatrix = buildMonthMatrix(selectedDate)
  const currentTask = isToday(selectedDate)
    ? selectedDateTasks.find(
        (task) =>
          !task.completed &&
          isMinuteInsideTask(currentMinute, task.startTime, task.endTime),
      ) ?? null
    : null
  const nextTask = isToday(selectedDate)
    ? selectedDateTasks.find(
        (task) => !task.completed && task.startTime > formatTime(currentMinute),
      ) ?? null
    : selectedDateTasks.find((task) => !task.completed) ?? null
  const chess = new Chess(chessFen)
  const recentMoves = chess.history({ verbose: true }).slice(-8)
  const memoryCompleted = memoryMatched.length === memoryDeck.length

  async function refreshAssistantConnection() {
    const nextStatus = await probeAssistantBackend()
    setAssistantConnection(nextStatus)
  }

  const switchTab = (nextTab: TabId) => {
    if (nextTab === activeTab) {
      return
    }

    const nextIndex = tabs.findIndex((tab) => tab.id === nextTab)
    setDirection(nextIndex > activeTabIndex ? 1 : -1)
    setActiveTab(nextTab)
  }

  const persistTasks = (updater: (previous: Task[]) => Task[]) => {
    setTasks((previous) => sortTasks(updater(previous)))
  }

  const [linkToGoalId, setLinkToGoalId] = useState<string | null>(null)

  const handleAddGoal = (title: string) => {
    if (!title.trim()) return
    const newGoal: Goal = {
      id: 'goal-' + Date.now(),
      title: title.trim(),
      completed: false,
      linkedTaskIds: [],
    }
    setGoals((prev) => [...prev, newGoal])
  }

  const handleDeleteGoal = (goalId: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== goalId))
  }

  const handleToggleGoalCompleted = (goalId: string) => {
    setGoals((prev) =>
      prev.map((g) => (g.id === goalId ? { ...g, completed: !g.completed } : g))
    )
  }

  const handleLinkTaskToGoal = (goalId: string, taskId: string) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId
          ? { ...g, linkedTaskIds: [...g.linkedTaskIds.filter((id) => id !== taskId), taskId] }
          : g
      )
    )
  }

  const handleUnlinkTaskFromGoal = (goalId: string, taskId: string) => {
    setGoals((prev) =>
      prev.map((g) =>
        g.id === goalId ? { ...g, linkedTaskIds: g.linkedTaskIds.filter((id) => id !== taskId) } : g
      )
    )
  }

  const handleAddGoalTaskDirect = (goalId: string) => {
    setLinkToGoalId(goalId)
    openCreateTask(selectedDate)
  }

  const openCreateTask = (date = selectedDate) => {
    setTaskModal({
      mode: 'create',
      taskId: null,
      draft: createTaskDraft(date),
    })
    setSelectedTaskId(null)
  }

  const openEditTask = (task: Task) => {
    setSelectedTaskId(task.id)
    setTaskModal({
      mode: 'edit',
      taskId: task.id,
      draft: {
        title: task.title,
        date: task.date,
        category: task.category,
        startTime: task.startTime,
        endTime: task.endTime,
        accent: task.accent,
        notes: task.notes ?? '',
      },
    })
  }

  const closeTaskModal = () => {
    setTaskModal(null)
    setSelectedTaskId(null)
  }

  const saveTaskModal = () => {
    if (!taskModal) {
      return
    }

    const draftTitle = taskModal.draft.title.trim()
    if (!draftTitle) {
      return
    }

    if (taskModal.mode === 'create') {
      const newId = createId()
      const newTask: Task = {
        id: newId,
        title: draftTitle,
        date: taskModal.draft.date,
        category: taskModal.draft.category.trim() || 'General',
        startTime: taskModal.draft.startTime,
        endTime: taskModal.draft.endTime,
        completed: false,
        accent: taskModal.draft.accent,
        createdBy: 'manual',
        notes: taskModal.draft.notes.trim() || undefined,
      }

      persistTasks((previous) => [...previous, newTask])
      setSelectedDate(newTask.date)
      setSelectedTaskId(newTask.id)

      if (linkToGoalId) {
        setGoals((prev) =>
          prev.map((g) =>
            g.id === linkToGoalId ? { ...g, linkedTaskIds: [...g.linkedTaskIds, newId] } : g
          )
        )
        setLinkToGoalId(null)
      }
    }

    if (taskModal.mode === 'edit' && taskModal.taskId) {
      persistTasks((previous) =>
        previous.map((task) =>
          task.id === taskModal.taskId
            ? {
                ...task,
                title: draftTitle,
                date: taskModal.draft.date,
                category: taskModal.draft.category.trim() || 'General',
                startTime: taskModal.draft.startTime,
                endTime: taskModal.draft.endTime,
                accent: taskModal.draft.accent,
                notes: taskModal.draft.notes.trim() || undefined,
              }
            : task,
        ),
      )
      setSelectedDate(taskModal.draft.date)
      setSelectedTaskId(taskModal.taskId)
    }

    setTaskModal(null)
  }

  const deleteTask = (taskId: string) => {
    persistTasks((previous) => previous.filter((task) => task.id !== taskId))
    if (selectedTaskId === taskId) {
      setSelectedTaskId(null)
    }
    setTaskModal(null)
  }

  const toggleTaskCompletion = (taskId: string) => {
    persistTasks((previous) =>
      previous.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: !task.completed,
            }
          : task,
      ),
    )
  }

  const applyAssistantActions = (actions: AssistantAction[]) => {
    if (actions.length === 0) {
      return
    }

    const renameAction = actions.find((action) => action.type === 'RENAME_ASSISTANT')
    if (renameAction) {
      setIdentity((previous) => ({
        ...previous,
        assistantName: renameAction.name,
      }))
    }

    const targetDateAction = actions.find(
      (
        action,
      ): action is Extract<AssistantAction, { type: 'ADD_TASK' | 'UPDATE_TASK' }> =>
        action.type === 'ADD_TASK' || action.type === 'UPDATE_TASK',
    )

    if (targetDateAction?.date) {
      setSelectedDate(targetDateAction.date)
    }

    persistTasks((previous) => {
      let nextTasks = [...previous]

      actions.forEach((action) => {
        if (action.type === 'ADD_TASK') {
          nextTasks = [
            ...nextTasks,
            {
              id: createId(),
              title: action.title,
              date: action.date,
              category: action.category ?? 'General',
              startTime: action.startTime,
              endTime: action.endTime,
              completed: false,
              accent: action.accent ?? 'violet',
              createdBy: 'assistant',
              notes: action.notes,
            },
          ]
        }

        if (action.type === 'UPDATE_TASK') {
          nextTasks = nextTasks.map((task) => {
            const matched =
              task.id === action.taskId ||
              (action.taskTitle
                ? task.title.toLowerCase().includes(action.taskTitle.toLowerCase())
                : false)

            if (!matched) {
              return task
            }

            return {
              ...task,
              date: action.date ?? task.date,
              startTime: action.startTime ?? task.startTime,
              endTime: action.endTime ?? task.endTime,
              category: action.category ?? task.category,
              notes: action.notes ?? task.notes,
            }
          })
        }

        if (action.type === 'COMPLETE_TASK') {
          nextTasks = nextTasks.map((task) => {
            const matched =
              task.id === action.taskId ||
              (action.taskTitle
                ? task.title.toLowerCase().includes(action.taskTitle.toLowerCase())
                : false)

            return matched ? { ...task, completed: true } : task
          })
        }

        if (action.type === 'DELETE_TASK') {
          nextTasks = nextTasks.filter((task) => {
            const matched =
              task.id === action.taskId ||
              (action.taskTitle
                ? task.title.toLowerCase().includes(action.taskTitle.toLowerCase())
                : false)

            return !matched
          })
        }
      })

      return nextTasks
    })
  }

  const submitAssistant = async () => {
    const outgoingText = chatDraft.trim()
    if (!outgoingText || typing) {
      return
    }

    const userMessage: ChatMessage = {
      id: createId(),
      role: 'user',
      text: outgoingText,
      createdAt: new Date().toISOString(),
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setChatDraft('')
    setTyping(true)

    try {
      const result = await sendAssistantMessage({
        identity,
        message: outgoingText,
        recentMessages: nextMessages,
        selectedDate,
        tasks,
      })

      if (result.source === 'gemini') {
        setAssistantConnection((previous) => ({
          ...previous,
          status: 'online',
        }))
      }

      applyAssistantActions(result.actions)
      if (result.focusTab) {
        switchTab(result.focusTab)
      }

      const assistantMessage: ChatMessage = {
        id: createId(),
        role: 'assistant',
        text: result.reply,
        createdAt: new Date().toISOString(),
        actionsApplied: result.actions.length,
        status: result.source,
      }

      setMessages((previous) => [...previous, assistantMessage])
    } catch (error) {
      console.error(error)
      setAssistantConnection((previous) => ({
        ...previous,
        status: previous.status === 'online' ? 'offline' : previous.status,
      }))

      setMessages((previous) => [
        ...previous,
        {
          id: createId(),
          role: 'assistant',
          text: 'No pude procesar eso ahora mismo. Intenta otra vez en un momento.',
          createdAt: new Date().toISOString(),
          status: 'local',
        },
      ])
    } finally {
      setTyping(false)
    }
  }

  const handleChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitAssistant()
    }
  }

  const interactWithPet = (action: PetAction) => {
    // Synth sound and expression updates
    if (action === 'feed') {
      playPetSound('eating')
      setPetExpression('happy')
    } else if (action === 'play') {
      playPetSound('happy')
      setPetExpression('excited')
      // Particle stars
      const newHearts = Array.from({ length: 4 }).map((_, i) => ({
        id: Date.now() + i,
        x: (Math.random() - 0.5) * 60,
        r: (Math.random() - 0.5) * 45,
        char: '✨',
      }))
      setPetHearts((prev) => [...prev, ...newHearts])
      setTimeout(() => {
        setPetHearts((prev) => prev.filter((h) => !newHearts.find((nh) => nh.id === h.id)))
      }, 1000)
    } else if (action === 'rest') {
      playPetSound('sleeping')
      setPetExpression('sleep')
    } else if (action === 'clean') {
      playPetSound('chirp')
      setPetExpression('happy')
    } else if (action === 'cuddle') {
      playPetSound('happy')
      setPetExpression('excited')
      // Hearts!
      const newHearts = Array.from({ length: 4 }).map((_, i) => ({
        id: Date.now() + i,
        x: (Math.random() - 0.5) * 60,
        r: (Math.random() - 0.5) * 45,
        char: '❤️',
      }))
      setPetHearts((prev) => [...prev, ...newHearts])
      setTimeout(() => {
        setPetHearts((prev) => prev.filter((h) => !newHearts.find((nh) => nh.id === h.id)))
      }, 1000)
    } else if (action === 'talk') {
      playPetSound('happy')
      setPetExpression('happy')
    }

    // Set face expression back to idle after 3s
    setTimeout(() => setPetExpression('idle'), 3000)

    setPetState((previous) => {
      if (action === 'feed') {
        return {
          bond: clamp(previous.bond + 4),
          energy: clamp(previous.energy + 8),
          mood: clamp(previous.mood + 6),
          message: 'Ese snack me devolvió energía.',
        }
      }

      if (action === 'play') {
        return {
          bond: clamp(previous.bond + 8),
          energy: clamp(previous.energy - 6),
          mood: clamp(previous.mood + 10),
          message: 'Jugar contigo siempre me anima.',
        }
      }

      if (action === 'rest') {
        return {
          bond: clamp(previous.bond + 2),
          energy: clamp(previous.energy + 12),
          mood: clamp(previous.mood + 4),
          message: 'Una siesta corta y quedo como nueva.',
        }
      }

      if (action === 'clean') {
        return {
          bond: clamp(previous.bond + 5),
          energy: clamp(previous.energy + 2),
          mood: clamp(previous.mood + 7),
          message: 'Gracias. Me siento arregladita y lista.',
        }
      }

      if (action === 'cuddle') {
        return {
          bond: clamp(previous.bond + 10),
          energy: clamp(previous.energy + 1),
          mood: clamp(previous.mood + 8),
          message: 'Un ratito contigo siempre me calma.',
        }
      }

      return {
        bond: clamp(previous.bond + 6),
        energy: clamp(previous.energy + 1),
        mood: clamp(previous.mood + 8),
        message: 'Me gusta cuando me hablas bonito.',
      }
    })
  }

  const handlePetClick = (_e: React.MouseEvent) => {
    playPetSound('happy')
    setPetExpression('happy')
    setTimeout(() => setPetExpression('idle'), 3000)
    
    // Add floating heart/sparkle particles
    const newHearts = Array.from({ length: 4 }).map((_, i) => ({
      id: Date.now() + i,
      x: (Math.random() - 0.5) * 60,
      r: (Math.random() - 0.5) * 45,
      char: ['❤️', '⭐', '✨', '🌸'][Math.floor(Math.random() * 4)],
    }))
    setPetHearts((prev) => [...prev, ...newHearts])
    
    // Clear hearts after animation
    setTimeout(() => {
      setPetHearts((prev) => prev.filter((h) => !newHearts.find((nh) => nh.id === h.id)))
    }, 1000)

    // Cute thoughts dialog
    const cuteThoughts = [
      "¡Jeje, eso hace cosquillas!",
      "¡Lilo te quiere mucho mucho!",
      "¿Hoy nos tomamos un té juntos?",
      "¡Haces un gran trabajo hoy!",
      "¡Miau! Digo... ¡Lilo feliz!",
      "¡Abrazo virtual enviado con éxito!"
    ]
    const randomThought = cuteThoughts[Math.floor(Math.random() * cuteThoughts.length)]
    setPetState(prev => ({
      ...prev,
      bond: Math.min(100, prev.bond + 2),
      mood: Math.min(100, prev.mood + 4),
      message: randomThought
    }))
  }

  const nextTrack = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % lofiTracks.length)
    setIsMusicPlaying(true)
    playPetSound('chirp')
  }

  const prevTrack = () => {
    setCurrentTrackIndex((prev) => (prev - 1 + lofiTracks.length) % lofiTracks.length)
    setIsMusicPlaying(true)
    playPetSound('chirp')
  }

  const toggleLofiPlay = () => {
    setIsMusicPlaying((prev) => !prev)
    playPetSound('happy')
  }

  const scheduleChessReply = (fen: string) => {
    if (chessReplyTimerRef.current) {
      window.clearTimeout(chessReplyTimerRef.current)
    }

    setChessThinking(true)
    chessReplyTimerRef.current = window.setTimeout(() => {
      const game = new Chess(fen)
      const computerMove = chooseComputerMove(game)

      if (!computerMove) {
        setChessThinking(false)
        setChessMessage('No encontré una respuesta para negras.')
        return
      }

      const move = game.move(computerMove)
      if (!move) {
        setChessThinking(false)
        setChessMessage('No pude mover negras.')
        return
      }

      setChessFen(game.fen())
      setChessThinking(false)
      setChessMessage(resolveComputerMoveMessage(game, move))
    }, 620)
  }

  const handleChessSquareClick = (square: Square) => {
    if (chessThinking || chess.turn() !== 'w') {
      return
    }

    const piece = chess.get(square)
    const availableMoves = chess.moves({ square, verbose: true })

    if (selectedSquare) {
      const selectedMove = chess
        .moves({ square: selectedSquare, verbose: true })
        .find((move) => move.to === square)

      if (selectedMove) {
        const move = chess.move({
          from: selectedMove.from,
          to: selectedMove.to,
          promotion: selectedMove.promotion ?? 'q',
        })

        if (move) {
          setChessFen(chess.fen())
          setSelectedSquare(null)

          if (chess.isGameOver()) {
            setChessMessage(resolveChessMessage(chess, move))
            return
          }

          setChessMessage(`${move.san}. Lilo mueve negras...`)
          scheduleChessReply(chess.fen())
          return
        }
      }
    }

    if (piece && piece.color === 'w' && availableMoves.length > 0) {
      setSelectedSquare(square)
      setChessMessage(`Pieza seleccionada: ${square.toUpperCase()}`)
      return
    }

    setSelectedSquare(null)
  }

  const resetChess = () => {
    if (chessReplyTimerRef.current) {
      window.clearTimeout(chessReplyTimerRef.current)
    }

    const freshChess = new Chess()
    setChessFen(freshChess.fen())
    setSelectedSquare(null)
    setChessThinking(false)
    setChessMessage('Tu turno.')
  }

  const flipMemoryCard = (index: number) => {
    if (
      memoryLocked ||
      memoryFlipped.includes(index) ||
      memoryMatched.includes(index) ||
      memoryCompleted
    ) {
      return
    }

    if (memoryFlipped.length === 1) {
      setMemoryLocked(true)
    }

    setMemoryFlipped((previous) => [...previous, index])
  }

  const reshuffleMemoryGame = () => {
    setMemoryDeck(buildMemoryDeck())
    setMemoryFlipped([])
    setMemoryMatched([])
    setMemoryMoves(0)
    setMemoryLocked(false)
  }

  const restoreBaseState = () => {
    if (chessReplyTimerRef.current) {
      window.clearTimeout(chessReplyTimerRef.current)
    }

    setActiveTab('day')
    setSelectedDate(todayDateKey)
    setTasks(createSeedTasks(new Date()))
    setMessages(createSeedMessages(defaultIdentity))
    setIdentity(defaultIdentity)
    setChatDraft('')
    setTaskModal(null)
    setSelectedTaskId(null)
    setPetState({
      bond: 62,
      energy: 68,
      mood: 70,
      message: 'Estoy lista para acompañar tu día.',
    })
    setGoals(defaultGoals)
    setMusicMode('lofi')
    setCurrentTrackIndex(0)
    setIsMusicPlaying(false)
    setSpotifyUrl('https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui2ExPn')
    setIsDetectingExternal(false)
    setPetExpression('idle')
    setPetHearts([])
    setChessFen(new Chess().fen())
    setSelectedSquare(null)
    setChessThinking(false)
    setChessMessage('Tu turno.')
    setMinigameSection('pet')
    reshuffleMemoryGame()
  }

  const dayProgressPercent = Math.min(100, Math.max(0, ((time.getHours() * 3600 + time.getMinutes() * 60 + time.getSeconds()) / 86400) * 100))
  const isDaytime = time.getHours() >= 6 && time.getHours() < 18

  return (
    <div className="relative h-[100svh] overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      {/* Fondo de Luces Ambientales Interactivas */}
      <div className="ambient-bg-container">
        <div className={`ambient-light-orb ambient-light-orb--one ${(isMusicPlaying || isDetectingExternal) ? 'ambient-light-orb--pulsing' : ''}`} />
        <div className={`ambient-light-orb ambient-light-orb--two ${(isMusicPlaying || isDetectingExternal) ? 'ambient-light-orb--pulsing' : ''}`} />
        <div className={`ambient-light-orb ambient-light-orb--three ${(isMusicPlaying || isDetectingExternal) ? 'ambient-light-orb--pulsing' : ''}`} />
      </div>

      <div className="relative z-10 mx-auto grid h-full max-w-[1560px] px-2 py-2 sm:px-3 sm:py-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-4 lg:px-4 lg:py-4">
        <aside className="hidden h-full flex-col gap-4 lg:flex">
          <div className={`${panelClass} flex flex-col gap-6 p-6`}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Lilo
              </p>
              <h1 className="mt-3 font-display text-4xl tracking-[-0.05em] text-[var(--heading)]">
                {identity.assistantName}
              </h1>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Ordena tu día sin sentirlo pesado.
              </p>
            </div>

            <nav className="grid gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const selected = tab.id === activeTab

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => switchTab(tab.id)}
                    className={`lilo-nav-button flex items-center gap-3 rounded-[20px] px-4 py-3 text-left ${selected ? 'is-active' : ''}`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                    <span className="text-sm font-semibold">{tab.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          <div className={`${panelClass} mt-auto`}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Fecha
            </p>
            <p className="mt-2 font-display text-2xl text-[var(--heading)]">
              {capitalizeText(formatLongDate(selectedDate))}
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {selectedDateTasks.length === 1
                ? '1 tarea en este día.'
                : `${selectedDateTasks.length} tareas en este día.`}
            </p>
          </div>
        </aside>

        <div className={`${panelClass} flex min-h-0 flex-col overflow-hidden p-0`}>
          <header className="border-b border-[color:var(--line-soft)] px-3 pb-2.5 pt-3.5 sm:px-5 sm:pb-3 sm:pt-4 lg:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center justify-between gap-4 w-full sm:w-auto">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                    {resolveSectionLabel(activeTab)}
                  </p>
                  <h2 className="mt-1 font-display text-2xl tracking-[-0.03em] text-[var(--heading)] sm:text-4xl">
                    {resolveHeaderTitle(activeTab, identity)}
                  </h2>
                  <p className="hidden sm:block mt-1.5 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                    {resolveSubtitle(activeTab, longSelectedDate)}
                  </p>
                </div>

                {/* NUEVO WIDGET SOLAR Y PROGRESS BAR DEL DÍA */}
                <div className="flex items-center gap-2.5 shrink-0 rounded-[20px] bg-[color:var(--surface-soft)] border border-[color:var(--line-soft)] px-2.5 py-1.5 sm:px-4 sm:py-2.5">
                  <div className="flex items-center justify-center p-1.5 rounded-full bg-[color:var(--surface-strong)] shadow-[var(--shadow-card)]">
                    {isDaytime ? (
                      <Sun className="h-4.5 w-4.5 text-amber-500 solar-lunar-icon solar-icon-spin" />
                    ) : (
                      <Moon className="h-4.5 w-4.5 text-indigo-400 solar-lunar-icon animate-pulse" />
                    )}
                  </div>
                  <div className="flex flex-col text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs sm:text-sm font-bold text-[var(--heading)]">
                        {time.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </span>
                      <span className="text-[9px] uppercase font-semibold text-[var(--muted)] hidden min-[360px]:inline">
                        ({Math.round(dayProgressPercent)}%)
                      </span>
                    </div>
                    <div className="mt-1 w-16 sm:w-28 h-1 rounded-full bg-[color:var(--line-soft)] overflow-hidden relative">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] transition-all duration-300"
                        style={{ width: `${dayProgressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {/* BOTÓN MÚSICA DE ENFOQUE (Siempre visible, con Popover Float) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsMusicOpen(!isMusicOpen)}
                    className={`flex items-center gap-2 rounded-full border border-[color:var(--line-soft)] px-3.5 py-1.5 text-xs font-semibold transition sm:px-4 sm:py-2 sm:text-sm ${
                      (isMusicPlaying || isDetectingExternal) 
                        ? 'bg-[var(--accent)] text-[var(--nav-active-contrast)] border-transparent animate-[pulseAmbient_3s_ease-in-out_infinite]' 
                        : 'bg-[color:var(--surface-strong)] text-[var(--heading)] hover:bg-[color:var(--surface-soft)]'
                    }`}
                  >
                    {(isMusicPlaying || isDetectingExternal) ? (
                      <div className="soundwave-visualizer scale-75 shrink-0 select-none">
                        <span className="soundwave-bar active" style={{ height: '14px', backgroundColor: 'currentColor' }} />
                        <span className="soundwave-bar active" style={{ height: '14px', backgroundColor: 'currentColor' }} />
                        <span className="soundwave-bar active" style={{ height: '14px', backgroundColor: 'currentColor' }} />
                      </div>
                    ) : (
                      <Music className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    )}
                    <span className="max-w-[70px] sm:max-w-[120px] truncate">
                      {isDetectingExternal 
                        ? 'Mic/Equipo' 
                        : (isMusicPlaying 
                            ? (musicMode === 'lofi' ? lofiTracks[currentTrackIndex].title : 'Spotify Sync') 
                            : 'Música')
                      }
                    </span>
                  </button>

                  {isMusicOpen && (
                    <div className="absolute right-0 mt-2.5 z-50 w-[295px] sm:w-[350px] lilo-panel rounded-[24px] p-4 sm:p-5 shadow-[var(--shadow-shell)] bg-[color:var(--surface-strong)] border border-[color:var(--line-soft)] animate-in fade-in slide-in-from-top-3 duration-200">
                      <div className="flex items-center justify-between border-b border-[color:var(--line-soft)] pb-3">
                        <h4 className="font-display text-base text-[var(--heading)] font-bold flex items-center gap-1.5">
                          <Radio className="h-4 w-4 text-[var(--accent)] animate-pulse" />
                          Estación de Enfoque
                        </h4>
                        <button
                          type="button"
                          onClick={() => setIsMusicOpen(false)}
                          className="lilo-icon-button scale-75"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Music Mode Tabs */}
                      <div className="mt-3.5 grid grid-cols-2 gap-1 p-1 rounded-xl bg-[color:var(--surface-soft)] border border-[color:var(--line-soft)]">
                        <button
                          type="button"
                          onClick={() => setMusicMode('lofi')}
                          className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                            musicMode === 'lofi'
                              ? 'bg-[var(--nav-active)] text-[var(--nav-active-contrast)] shadow-sm'
                              : 'text-[var(--muted)] hover:text-[var(--heading)]'
                          }`}
                        >
                          Lilo Lofi
                        </button>
                        <button
                          type="button"
                          onClick={() => setMusicMode('spotify')}
                          className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                            musicMode === 'spotify'
                              ? 'bg-[var(--nav-active)] text-[var(--nav-active-contrast)] shadow-sm'
                              : 'text-[var(--muted)] hover:text-[var(--heading)]'
                          }`}
                        >
                          Spotify Sync
                        </button>
                      </div>

                      {/* Lofi Beats Mode */}
                      {musicMode === 'lofi' ? (
                        <div className="mt-3.5 flex flex-col items-center">
                          {/* Cute Tape/Disc Design */}
                          <div className="w-full rounded-xl bg-[color:var(--surface-soft)] border border-[color:var(--line-soft)] p-3 flex flex-col items-center relative overflow-hidden">
                            <div className="absolute top-2 left-2 flex gap-1 items-center">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                              <span className="text-[8px] uppercase tracking-wider font-bold text-[var(--muted)]">Lilo FM</span>
                            </div>
                            
                            {/* Animated Disk/Tape */}
                            <div className={`mt-2.5 w-14 h-14 rounded-full border-4 border-dashed border-[var(--accent)] flex items-center justify-center ${isMusicPlaying ? 'animate-[slowSpin_12s_linear_infinite]' : ''}`}>
                              <div className="w-7 h-7 rounded-full bg-[color:var(--surface-strong)] border-2 border-[color:var(--line-soft)] flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                              </div>
                            </div>

                            <div className="mt-3 text-center w-full">
                              <p className="text-xs font-bold text-[var(--heading)] truncate px-1">
                                {lofiTracks[currentTrackIndex].title}
                              </p>
                              <p className="text-[10px] text-[var(--muted)] mt-0.5">
                                {lofiTracks[currentTrackIndex].artist}
                              </p>
                            </div>
                          </div>

                          {/* Sound Equalizer bounce block */}
                          <div className="mt-3.5 flex justify-center items-end gap-0.5 h-5">
                            {Array.from({ length: 8 }).map((_, i) => (
                              <span
                                key={i}
                                className={`soundwave-bar ${isMusicPlaying ? 'active' : ''}`}
                                style={{
                                  height: '20px',
                                  animationDelay: `${i * -0.12}s`,
                                }}
                              />
                            ))}
                          </div>

                          {/* Cassette Controls */}
                          <div className="mt-3 flex items-center justify-center gap-3">
                            <button
                              type="button"
                              onClick={prevTrack}
                              className="lilo-icon-button scale-90"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={toggleLofiPlay}
                              className="lilo-action-button rounded-full p-2.5 flex items-center justify-center scale-95"
                            >
                              {isMusicPlaying ? (
                                <Pause className="h-4.5 w-4.5" />
                              ) : (
                                <Play className="h-4.5 w-4.5 fill-current" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={nextTrack}
                              className="lilo-icon-button scale-90"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* Spotify Mode with Embed iframe */
                        <div className="mt-3.5 flex flex-col">
                          {/* Spotify Embed Player */}
                          <div className="w-full h-[80px] rounded-xl overflow-hidden bg-black/5 flex items-center justify-center relative">
                            {spotifyUrl ? (
                              <iframe
                                src={getSpotifyEmbedUrl(spotifyUrl)}
                                width="100%"
                                height="80"
                                frameBorder="0"
                                allowFullScreen={false}
                                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                                loading="lazy"
                                className="rounded-xl border-none"
                              />
                            ) : (
                              <p className="text-xs text-[var(--muted)] p-3 text-center">Inserta una URL de playlist para sincronizar.</p>
                            )}
                          </div>
                          
                          {/* Dynamic Synced Equalizer for Spotify */}
                          {(isMusicPlaying || isDetectingExternal) && (
                            <div className="mt-2.5 flex justify-center items-center gap-2 h-7 bg-[color:var(--surface-soft)] rounded-xl py-1 px-3 border border-[color:var(--line-soft)]/40">
                              <span className="text-[10px] font-semibold text-[var(--muted)] truncate">Spotify Sincronizado</span>
                              <div className="flex justify-center items-end gap-0.5 h-3.5 select-none shrink-0">
                                {Array.from({ length: 6 }).map((_, i) => (
                                  <span
                                    key={i}
                                    className="soundwave-bar active"
                                    style={{
                                      width: '2.5px',
                                      height: '14px',
                                      animationDelay: `${i * -0.15}s`,
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Custom Playlist URL input */}
                          <div className="mt-3.5">
                            <label className="text-[9px] uppercase font-bold tracking-[0.1em] text-[var(--muted)]">
                              Sincronizar playlist o canción:
                            </label>
                            <div className="mt-1 flex gap-2">
                              <input
                                type="text"
                                value={spotifyUrl}
                                onChange={(e) => {
                                  setSpotifyUrl(e.target.value)
                                  setIsMusicPlaying(true)
                                }}
                                placeholder="Pegar enlace de Spotify..."
                                className="flex-1 rounded-xl border border-[color:var(--line-soft)] bg-[color:var(--surface-soft)] px-3.5 py-2 text-xs outline-none text-[var(--heading)] focus:border-[var(--accent)]"
                              />
                              <a
                                href="https://open.spotify.com"
                                target="_blank"
                                rel="noreferrer"
                                className="lilo-icon-button scale-90 shrink-0"
                                title="Abrir Spotify"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                            <p className="mt-1.5 text-[9px] text-[var(--muted)] leading-4">
                              💡 Puedes pegar enlaces de cualquier playlist, álbum o canción (ej. <i>open.spotify.com/...</i>)
                            </p>
                          </div>

                          {/* Mic / Device Audio Sync Toggle */}
                          <div className="mt-4 flex items-center justify-between border-t border-[color:var(--line-soft)]/40 pt-3">
                            <span className="text-[11px] font-semibold text-[var(--heading)] flex items-center gap-1.5">
                              <Radio className={`h-3.5 w-3.5 ${isDetectingExternal ? 'text-[var(--accent)] animate-pulse' : 'text-[var(--muted)]'}`} />
                              Detección ambiental (Mic/Equipo)
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsDetectingExternal(!isDetectingExternal)
                                if (!isDetectingExternal) {
                                  setIsMusicPlaying(true)
                                }
                              }}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
                                isDetectingExternal ? 'bg-[var(--accent)]' : 'bg-[color:var(--line-soft)]'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                  isDetectingExternal ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {activeTab === 'day' ? (
                  <>
                    <div className="rounded-full border border-[color:var(--line-soft)] bg-[color:var(--surface-strong)] px-3 py-1.5 text-xs text-[var(--heading)] sm:px-4 sm:py-2 sm:text-sm">
                      {longSelectedDate}
                    </div>
                    <button
                      type="button"
                      onClick={() => openCreateTask()}
                      className="lilo-action-button rounded-full px-3.5 py-1.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm"
                    >
                      <span className="inline-flex items-center gap-1.5 sm:gap-2">
                        <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        Nueva tarea
                      </span>
                    </button>
                  </>
                ) : null}

                {activeTab === 'assistant' ? (
                  <div className="rounded-full border border-[color:var(--line-soft)] bg-[color:var(--surface-strong)] px-3.5 py-1.5 text-xs text-[var(--heading)] sm:px-4 sm:py-2 sm:text-sm">
                    {resolveAssistantBadge(assistantConnection)}
                  </div>
                ) : null}
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-hidden px-3 pb-[5.6rem] pt-3 sm:px-5 sm:pb-[6.2rem] lg:px-6 lg:pb-6">
            <motion.section
              key={activeTab}
              initial={{ opacity: 0, x: direction > 0 ? 18 : -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="h-full min-h-0"
            >
              {activeTab === 'day' ? (
                <DayView
                  completionRate={completionRate}
                  completedTasks={completedTasks}
                  currentTask={currentTask}
                  monthLabel={monthLabel}
                  monthMatrix={monthMatrix}
                  nextTask={nextTask}
                  onDayShift={(amount) =>
                    setSelectedDate(formatDateKey(addDays(selectedDate, amount)))
                  }
                  onMonthShift={(amount) => {
                    const currentDate = parseDateKey(selectedDate)
                    const nextDate = new Date(
                      currentDate.getFullYear(),
                      currentDate.getMonth() + amount,
                      currentDate.getDate(),
                    )
                    setSelectedDate(formatDateKey(nextDate))
                  }}
                  onOpenTask={openEditTask}
                  onSelectDate={setSelectedDate}
                  onToday={() => setSelectedDate(todayDateKey)}
                  selectedDate={selectedDate}
                  tasks={selectedDateTasks}
                  totalTasks={selectedDateTasks.length}
                  weekDates={weekDates}
                  goals={goals}
                  allTasks={tasks}
                  onAddGoal={handleAddGoal}
                  onDeleteGoal={handleDeleteGoal}
                  onToggleGoalCompleted={handleToggleGoalCompleted}
                  onLinkTaskToGoal={handleLinkTaskToGoal}
                  onUnlinkTaskFromGoal={handleUnlinkTaskFromGoal}
                  onAddGoalTaskDirect={handleAddGoalTaskDirect}
                />
              ) : null}

              {activeTab === 'assistant' ? (
                <AssistantView
                  chatDraft={chatDraft}
                  connection={assistantConnection}
                  identity={identity}
                  messages={messages}
                  onChatDraftChange={setChatDraft}
                  onChatKeyDown={handleChatKeyDown}
                  onRefreshConnection={() => void refreshAssistantConnection()}
                  onSubmit={() => void submitAssistant()}
                  typing={typing}
                />
              ) : null}

              {activeTab === 'minigames' ? (
                <MinigamesView
                  chess={chess}
                  chessMessage={chessMessage}
                  chessThinking={chessThinking}
                  currentTask={currentTask}
                  memoryCompleted={memoryCompleted}
                  memoryDeck={memoryDeck}
                  memoryFlipped={memoryFlipped}
                  memoryMatched={memoryMatched}
                  memoryMoves={memoryMoves}
                  minigameSection={minigameSection}
                  onChessSquareClick={handleChessSquareClick}
                  onMinigameSectionChange={setMinigameSection}
                  onMemoryFlip={flipMemoryCard}
                  onMemoryReset={reshuffleMemoryGame}
                  onPetAction={interactWithPet}
                  onResetChess={resetChess}
                  petState={petState}
                  recentMoves={recentMoves}
                  selectedSquare={selectedSquare}
                  petExpression={petExpression}
                  petHearts={petHearts}
                  onPetClick={handlePetClick}
                />
              ) : null}

              {activeTab === 'identity' ? (
                <IdentityView
                  assistantConnection={assistantConnection}
                  identity={identity}
                  onIdentityChange={setIdentity}
                  onRefreshAssistant={() => void refreshAssistantConnection()}
                  onRestoreBaseState={restoreBaseState}
                />
              ) : null}
            </motion.section>
          </main>
        </div>
      </div>

      <MobileNavigation activeTab={activeTab} onSwitchTab={switchTab} />

      <AnimatePresence>
        {taskModal ? (
          <TaskModal
            draft={taskModal.draft}
            mode={taskModal.mode}
            onClose={closeTaskModal}
            onDelete={taskModal.taskId ? () => deleteTask(taskModal.taskId!) : undefined}
            onDraftChange={(nextDraft) =>
              setTaskModal((previous) =>
                previous
                  ? {
                      ...previous,
                      draft: nextDraft,
                    }
                  : previous,
              )
            }
            onSave={saveTaskModal}
            onToggleComplete={selectedTask ? () => toggleTaskCompletion(selectedTask.id) : undefined}
            task={selectedTask}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function DayView({
  completionRate,
  completedTasks,
  currentTask,
  monthLabel,
  monthMatrix,
  nextTask,
  onDayShift,
  onMonthShift,
  onOpenTask,
  onSelectDate,
  onToday,
  selectedDate,
  tasks,
  totalTasks,
  weekDates,
  goals,
  allTasks,
  onAddGoal,
  onDeleteGoal,
  onToggleGoalCompleted,
  onLinkTaskToGoal,
  onUnlinkTaskFromGoal,
  onAddGoalTaskDirect,
}: {
  completionRate: number
  completedTasks: number
  currentTask: Task | null
  monthLabel: string
  monthMatrix: Array<{ dateKey: string; inCurrentMonth: boolean }>
  nextTask: Task | null
  onDayShift: (amount: number) => void
  onMonthShift: (amount: number) => void
  onOpenTask: (task: Task) => void
  onSelectDate: (dateKey: string) => void
  onToday: () => void
  selectedDate: string
  tasks: Task[]
  totalTasks: number
  weekDates: string[]
  goals: Goal[]
  allTasks: Task[]
  onAddGoal: (title: string) => void
  onDeleteGoal: (goalId: string) => void
  onToggleGoalCompleted: (goalId: string) => void
  onLinkTaskToGoal: (goalId: string, taskId: string) => void
  onUnlinkTaskFromGoal: (goalId: string, taskId: string) => void
  onAddGoalTaskDirect: (goalId: string) => void
}) {
  const [isMonthExpanded, setIsMonthExpanded] = useState(false)
  const [dayTab, setDayTab] = useState<'agenda' | 'metas'>('agenda')

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-y-auto pb-2 lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden">
      <section className="order-2 flex min-h-0 flex-col gap-4 lg:order-1 lg:overflow-hidden">
        <div className={panelClass}>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onMonthShift(-1)}
              className="lilo-icon-button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3 className="min-w-0 truncate text-center font-semibold text-[var(--heading)]">
              {monthLabel}
            </h3>
            <button
              type="button"
              onClick={() => onMonthShift(1)}
              className="lilo-icon-button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onDayShift(-1)}
              className="lilo-secondary-button rounded-full px-3 py-2 text-sm font-medium"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={onToday}
              className="lilo-secondary-button rounded-full px-3 py-2 text-sm font-medium"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => onDayShift(1)}
              className="lilo-secondary-button rounded-full px-3 py-2 text-sm font-medium"
            >
              Siguiente
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2">
            {weekDates.map((dateKey) => {
              const selected = dateKey === selectedDate

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => onSelectDate(dateKey)}
                  className={`rounded-[18px] px-1.5 py-2.5 text-center transition ${
                    selected
                      ? 'bg-[var(--nav-active)] text-[var(--nav-active-contrast)]'
                      : 'bg-[color:var(--surface-strong)] text-[var(--heading)]'
                  }`}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em]">
                    {formatWeekdayShort(dateKey)}
                  </p>
                  <p className="mt-1 text-sm font-semibold">
                    {parseDateKey(dateKey).getDate()}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Botón para expandir/colapsar calendario completo en móviles */}
          <button
            type="button"
            onClick={() => setIsMonthExpanded(!isMonthExpanded)}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full border border-[color:var(--line-soft)] bg-[color:var(--surface-soft)] py-2.5 text-xs font-semibold text-[var(--muted)] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] hover:text-[var(--heading)] lg:hidden"
          >
            {isMonthExpanded ? 'Ocultar mes' : 'Ver mes completo'}
          </button>

          {/* Matriz mensual */}
          <div className={`mt-4 grid grid-cols-7 gap-1.5 transition-all duration-300 ${isMonthExpanded ? 'grid' : 'hidden lg:grid'}`}>
            {monthMatrix.map((day) => {
              const selected = day.dateKey === selectedDate

              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => onSelectDate(day.dateKey)}
                  className={`aspect-square rounded-[14px] text-sm transition ${
                    selected
                      ? 'bg-[var(--nav-active)] text-[var(--nav-active-contrast)]'
                      : day.inCurrentMonth
                        ? 'bg-[color:var(--surface-strong)] text-[var(--heading)]'
                        : 'bg-transparent text-[var(--muted)]'
                  }`}
                >
                  {parseDateKey(day.dateKey).getDate()}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid gap-3 grid-cols-1 min-[450px]:grid-cols-2 lg:grid-cols-1">
          <div className={panelClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Día
            </p>
            <h3 className="mt-2 font-display text-2xl text-[var(--heading)]">
              {capitalizeText(formatLongDate(selectedDate))}
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[var(--heading)]">
                {totalTasks} tareas
              </span>
              <span className="rounded-full bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[var(--heading)]">
                {completedTasks} hechas
              </span>
              <span className="rounded-full bg-[color:var(--surface-strong)] px-3 py-2 text-sm text-[var(--heading)]">
                {Math.round(completionRate * 100)}%
              </span>
            </div>
          </div>

          <div className={panelClass}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Vista rápida
            </p>
            <div className="mt-4 grid gap-3 grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-1">
              <CompactTask label="En curso" task={currentTask} empty="Nada en este momento." />
              <CompactTask label="Siguiente" task={nextTask} empty="No hay nada pendiente." />
            </div>
          </div>
        </div>
      </section>

      <section className="order-1 flex min-h-0 flex-col gap-4 lg:order-2 lg:overflow-hidden">
        <div className={`${panelClass} flex items-center justify-between gap-3 flex-wrap`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDayTab('agenda')}
              className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                dayTab === 'agenda'
                  ? 'bg-[var(--nav-active)] text-[var(--nav-active-contrast)]'
                  : 'bg-[color:var(--surface-soft)] text-[var(--muted)] hover:text-[var(--heading)]'
              }`}
            >
              Agenda
            </button>
            <button
              type="button"
              onClick={() => setDayTab('metas')}
              className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${
                dayTab === 'metas'
                  ? 'bg-[var(--nav-active)] text-[var(--nav-active-contrast)]'
                  : 'bg-[color:var(--surface-soft)] text-[var(--muted)] hover:text-[var(--heading)]'
              }`}
            >
              Mis Metas
            </button>
          </div>
          <button
            type="button"
            onClick={onToday}
            className="lilo-secondary-button rounded-full px-3.5 py-1.5 text-xs font-semibold"
          >
            Ir a hoy
          </button>
        </div>

        <div className={`${panelClass} flex min-h-0 flex-1 flex-col overflow-hidden`}>
          {dayTab === 'agenda' ? (
            <>
              <div className="flex flex-wrap gap-2 border-b border-[color:var(--line-soft)] pb-4">
                <span className="rounded-full bg-[color:var(--surface-strong)] px-3 py-1.5 text-xs text-[var(--heading)]">
                  Toca una tarea para verla mejor
                </span>
              </div>

              <div className="soft-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                {tasks.length === 0 ? (
                  <div className="flex h-full min-h-[18rem] items-center justify-center rounded-[24px] border border-dashed border-[color:var(--line-soft)] bg-[color:var(--surface-soft)] px-6 text-center text-xs sm:text-sm leading-6 text-[var(--muted)]">
                    No hay tareas en este día.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {tasks.map((task) => (
                      <TaskCard key={task.id} task={task} onOpen={onOpenTask} />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <GoalsView
              goals={goals}
              allTasks={allTasks}
              selectedDate={selectedDate}
              onAddGoal={onAddGoal}
              onDeleteGoal={onDeleteGoal}
              onToggleGoalCompleted={onToggleGoalCompleted}
              onLinkTaskToGoal={onLinkTaskToGoal}
              onUnlinkTaskFromGoal={onUnlinkTaskFromGoal}
              onAddGoalTaskDirect={onAddGoalTaskDirect}
            />
          )}
        </div>
      </section>
    </div>
  )
}

function GoalsView({
  goals,
  allTasks,
  selectedDate,
  onAddGoal,
  onDeleteGoal,
  onToggleGoalCompleted,
  onLinkTaskToGoal,
  onUnlinkTaskFromGoal,
  onAddGoalTaskDirect,
}: {
  goals: Goal[]
  allTasks: Task[]
  selectedDate: string
  onAddGoal: (title: string) => void
  onDeleteGoal: (goalId: string) => void
  onToggleGoalCompleted: (goalId: string) => void
  onLinkTaskToGoal: (goalId: string, taskId: string) => void
  onUnlinkTaskFromGoal: (goalId: string, taskId: string) => void
  onAddGoalTaskDirect: (goalId: string) => void
}) {
  const [newGoalText, setNewGoalText] = useState('')

  const handleNewGoalSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGoalText.trim()) return
    onAddGoal(newGoalText)
    setNewGoalText('')
  }

  // General metrics across ALL active goals
  const allLinkedTaskIds = Array.from(new Set(goals.flatMap((g) => g.linkedTaskIds)))
  const totalLinkedTasks = allLinkedTaskIds.length
  const completedLinkedTasks = allLinkedTaskIds.filter((id) => {
    const t = allTasks.find((task) => task.id === id)
    return t?.completed
  }).length
  const generalProgressPercent = totalLinkedTasks === 0 ? 0 : Math.round((completedLinkedTasks / totalLinkedTasks) * 100)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Sleek Gradient Metrics Card */}
      <div className="rounded-[22px] bg-gradient-to-br from-[var(--accent-2)]/10 to-[var(--accent)]/15 border border-[color:var(--line-soft)] p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
              Progreso General de Metas
            </p>
            <h4 className="mt-1 font-display text-lg sm:text-2xl text-[var(--heading)] font-bold">
              {generalProgressPercent}% Completado
            </h4>
          </div>
          <Target className="h-6 w-6 sm:h-8 sm:w-8 text-[var(--accent)] shrink-0" />
        </div>
        <div className="mt-3.5 w-full h-2 rounded-full bg-[color:var(--line-soft)] overflow-hidden relative">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--accent-2)] to-[var(--accent)] transition-all duration-500"
            style={{ width: `${generalProgressPercent}%` }}
          />
        </div>
        <p className="mt-2 text-[10px] sm:text-xs text-[var(--muted)]">
          {totalLinkedTasks === 0
            ? 'Vincula tareas del día a tus metas para ver el progreso real.'
            : `${completedLinkedTasks} de ${totalLinkedTasks} tareas completadas en total.`}
        </p>
      </div>

      {/* New Goal Input */}
      <form onSubmit={handleNewGoalSubmit} className="mt-4 flex gap-2">
        <input
          type="text"
          value={newGoalText}
          onChange={(e) => setNewGoalText(e.target.value)}
          placeholder="Crear nueva meta (ej: Rutina de estiramientos...)"
          className="flex-1 rounded-[16px] border border-[color:var(--line-soft)] bg-[color:var(--surface-soft)] px-3.5 py-2 text-xs outline-none text-[var(--heading)] focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          className="lilo-action-button rounded-[16px] px-4 py-2 text-xs font-semibold flex items-center justify-center shrink-0"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>

      {/* Goals Checklist List */}
      <div className="soft-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1 space-y-3 pb-2">
        {goals.length === 0 ? (
          <div className="flex h-full min-h-[14rem] items-center justify-center rounded-[24px] border border-dashed border-[color:var(--line-soft)] bg-[color:var(--surface-soft)] px-6 text-center text-xs leading-6 text-[var(--muted)]">
            No tienes metas creadas todavía. Crea una arriba.
          </div>
        ) : (
          goals.map((goal) => {
            const goalTasks = allTasks.filter((t) => goal.linkedTaskIds.includes(t.id))
            const goalTotal = goalTasks.length
            const goalCompleted = goalTasks.filter((t) => t.completed).length
            const isCompleted = goalTotal === 0 ? goal.completed : goalCompleted === goalTotal
            const progressPercent = goalTotal === 0 ? (goal.completed ? 100 : 0) : Math.round((goalCompleted / goalTotal) * 100)
            const unlinkedTasks = allTasks.filter((t) => !goal.linkedTaskIds.includes(t.id) && t.date === selectedDate)

            return (
              <div
                key={goal.id}
                className="rounded-[22px] border border-[color:var(--line-soft)] bg-[color:var(--surface-strong)] p-4 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={goalTotal > 0}
                    onClick={() => onToggleGoalCompleted(goal.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
                      isCompleted
                        ? 'bg-[var(--accent)] border-transparent text-[var(--nav-active-contrast)]'
                        : 'border-[color:var(--line-soft)] hover:border-[var(--accent)] bg-[color:var(--surface-soft)]'
                    }`}
                  >
                    {isCompleted && <CheckCircle2 className="h-3 w-3" />}
                  </button>

                  <h5
                    className={`font-semibold text-sm text-[var(--heading)] flex-1 min-w-0 ${
                      isCompleted ? 'line-through opacity-60' : ''
                    }`}
                  >
                    {goal.title}
                  </h5>

                  <button
                    type="button"
                    onClick={() => onDeleteGoal(goal.id)}
                    className="text-[var(--muted)] hover:text-rose-500 transition p-1"
                    title="Eliminar Meta"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Progress bar inside card */}
                <div className="mt-2.5">
                  <div className="flex justify-between text-[10px] text-[var(--muted)] font-bold">
                    <span>Completado</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="mt-1 w-full h-1.5 rounded-full bg-[color:var(--line-soft)] overflow-hidden relative">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--accent-2)] to-[var(--accent)] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                {/* Linked tasks group */}
                {goalTasks.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {goalTasks.map((t) => (
                      <div
                        key={t.id}
                        className={`flex items-center gap-1.5 text-[9px] rounded-full px-2.5 py-1 font-semibold border ${
                          t.completed
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 line-through opacity-75'
                            : 'bg-[color:var(--surface-soft)] border-[color:var(--line-soft)] text-[var(--heading)]'
                        }`}
                      >
                        <span className="truncate max-w-[100px]">{t.title}</span>
                        <button
                          type="button"
                          onClick={() => onUnlinkTaskFromGoal(goal.id, t.id)}
                          className="text-[var(--muted)] hover:text-rose-500 rounded-full flex items-center justify-center w-3 h-3 hover:bg-[color:var(--line-soft)]"
                          title="Desvincular"
                        >
                          <X className="w-2 h-2" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Link Quick Actions */}
                <div className="mt-3.5 pt-3 border-t border-[color:var(--line-soft)]/40 flex flex-wrap gap-2 items-center justify-between">
                  <select
                    onChange={(e) => {
                      const val = e.target.value
                      if (val) {
                        onLinkTaskToGoal(goal.id, val)
                        e.target.value = ''
                      }
                    }}
                    className="text-[10px] font-semibold text-[var(--muted)] hover:text-[var(--heading)] bg-[color:var(--surface-soft)] border border-[color:var(--line-soft)] rounded-lg px-2 py-1 outline-none max-w-[140px] sm:max-w-[180px]"
                  >
                    <option value="">+ Vincular tarea...</option>
                    {unlinkedTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => onAddGoalTaskDirect(goal.id)}
                    className="text-[10px] font-bold text-[var(--accent)] hover:text-[color:var(--heading)] transition flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Nueva tarea
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function AssistantView({
  chatDraft,
  connection,
  identity,
  messages,
  onChatDraftChange,
  onChatKeyDown,
  onRefreshConnection,
  onSubmit,
  typing,
}: {
  chatDraft: string
  connection: AssistantConnection
  identity: AssistantIdentity
  messages: ChatMessage[]
  onChatDraftChange: (value: string) => void
  onChatKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  onRefreshConnection: () => void
  onSubmit: () => void
  typing: boolean
}) {
  const messageEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, typing])

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_240px]">
      <section className={`${panelClass} flex min-h-0 flex-1 flex-col overflow-hidden`}>
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line-soft)] pb-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Chat
            </p>
            <h3 className="mt-1 truncate font-display text-2xl text-[var(--heading)]">
              {identity.assistantName}
            </h3>
          </div>
          <div className="rounded-full bg-[color:var(--surface-strong)] px-3 py-2 text-xs text-[var(--heading)]">
            {resolveAssistantBadge(connection)}
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="soft-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 pb-1">
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: Math.min(index * 0.02, 0.16) }}
                className={`flex ${message.role === 'assistant' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[88%] rounded-[24px] px-4 py-3 shadow-[var(--shadow-card)] ${
                    message.role === 'assistant'
                      ? 'rounded-bl-md bg-[color:var(--surface-strong)] text-[var(--heading)]'
                      : 'rounded-br-md bg-[var(--nav-active)] text-[var(--nav-active-contrast)]'
                  }`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-7">{message.text}</p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] opacity-65">
                    <span>
                      {new Date(message.createdAt).toLocaleTimeString('es-CO', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {message.status ? <span>{message.status}</span> : null}
                  </div>
                </div>
              </motion.div>
            ))}

            {typing ? (
              <div className="flex justify-start">
                <div className="rounded-full bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[var(--heading)]">
                  Lilo está pensando...
                </div>
              </div>
            ) : null}
            <div ref={messageEndRef} />
          </div>

          <form
            className="mt-3 rounded-[24px] border border-[color:var(--line-soft)] bg-[color:var(--surface-soft)] p-3"
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
          >
            <textarea
              value={chatDraft}
              onChange={(event) => onChatDraftChange(event.target.value)}
              onKeyDown={onChatKeyDown}
              placeholder="Escríbele a Lilo..."
              rows={2}
              className="lilo-input min-h-[5rem] w-full resize-none rounded-[20px] px-4 py-3 text-sm leading-7 outline-none sm:min-h-[6rem]"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--muted)]">Enter envía</p>
              <button
                type="submit"
                disabled={typing}
                className="lilo-action-button rounded-full px-4 py-2 text-sm font-semibold"
              >
                Enviar
              </button>
            </div>
          </form>
        </div>
      </section>

      <aside className={`${panelClass} hidden min-h-0 lg:flex lg:flex-col`}>
        <div className="flex items-center gap-3">
          <div className="lilo-mini-orb">
            <span className="lilo-mini-orb__eye" />
            <span className="lilo-mini-orb__eye" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Conexión
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--heading)]">
              {resolveAssistantBadge(connection)}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-[22px] bg-[color:var(--surface-strong)] px-4 py-4 text-sm leading-6 text-[var(--muted)]">
          {resolveAssistantSidebarText(connection)}
        </div>

        <button
          type="button"
          onClick={onRefreshConnection}
          className="lilo-secondary-button mt-auto rounded-full px-4 py-2 text-sm font-semibold"
        >
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Revisar
          </span>
        </button>
      </aside>
    </div>
  )
}

function MinigamesView(props: {
  chess: Chess
  chessMessage: string
  chessThinking: boolean
  currentTask: Task | null
  memoryCompleted: boolean
  memoryDeck: MemoryCard[]
  memoryFlipped: number[]
  memoryMatched: number[]
  memoryMoves: number
  minigameSection: MinigameSection
  onChessSquareClick: (square: Square) => void
  onMemoryFlip: (index: number) => void
  onMemoryReset: () => void
  onMinigameSectionChange: (section: MinigameSection) => void
  onPetAction: (action: PetAction) => void
  onResetChess: () => void
  petState: PetState
  recentMoves: Move[]
  selectedSquare: null | Square
  petExpression?: 'idle' | 'happy' | 'sleep' | 'dizzy' | 'excited'
  petHearts?: Array<{ id: number; x: number; r: number; char: string }>
  onPetClick?: (e: React.MouseEvent) => void
}) {
  const petMood = resolvePetMood(props.petState)

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-y-auto pb-2 lg:grid-cols-[300px_minmax(0,1fr)] lg:overflow-hidden">
      <section className="order-2 grid min-h-0 gap-4 sm:grid-cols-[minmax(0,1fr)_220px] lg:order-1 lg:grid-cols-1">
        <div className={`${panelClass} overflow-hidden`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Mascota
              </p>
              <h3 className="mt-2 font-display text-2xl text-[var(--heading)]">{petMood.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{props.petState.message}</p>
            </div>
            <Sparkles className="h-5 w-5 text-[var(--accent)]" />
          </div>

          <motion.div
            className="mt-5 flex justify-center cursor-pointer select-none relative"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3.2, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
            onClick={props.onPetClick}
          >
            <PetBubble expression={props.petExpression} hearts={props.petHearts} />
          </motion.div>

          <div className="mt-5 grid gap-3">
            <PetMeter label="Vínculo" value={props.petState.bond} />
            <PetMeter label="Energía" value={props.petState.energy} />
            <PetMeter label="Ánimo" value={props.petState.mood} />
          </div>
        </div>

        <div className={panelClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Ahora mismo
          </p>
          <p className="mt-2 text-sm text-[var(--heading)]">
            {props.currentTask ? props.currentTask.title : 'Sin bloque activo.'}
          </p>
        </div>
      </section>

      <section className={`${panelClass} order-1 flex min-h-0 flex-col overflow-hidden lg:order-2`}>
        <div className="flex flex-wrap gap-2 border-b border-[color:var(--line-soft)] pb-4">
          {minigameTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => props.onMinigameSectionChange(tab.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                props.minigameSection === tab.id
                  ? 'bg-[var(--nav-active)] text-[var(--nav-active-contrast)]'
                  : 'bg-[color:var(--surface-strong)] text-[var(--heading)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="soft-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
          {props.minigameSection === 'pet' ? (
            <PetSection onPetAction={props.onPetAction} />
          ) : null}

          {props.minigameSection === 'chess' ? (
            <ChessSection
              chess={props.chess}
              chessMessage={props.chessMessage}
              chessThinking={props.chessThinking}
              onChessSquareClick={props.onChessSquareClick}
              onResetChess={props.onResetChess}
              recentMoves={props.recentMoves}
              selectedSquare={props.selectedSquare}
            />
          ) : null}

          {props.minigameSection === 'memory' ? (
            <MemorySection
              memoryCompleted={props.memoryCompleted}
              memoryDeck={props.memoryDeck}
              memoryFlipped={props.memoryFlipped}
              memoryMatched={props.memoryMatched}
              memoryMoves={props.memoryMoves}
              onMemoryFlip={props.onMemoryFlip}
              onMemoryReset={props.onMemoryReset}
            />
          ) : null}
        </div>
      </section>
    </div>
  )
}

function IdentityView(props: {
  assistantConnection: AssistantConnection
  identity: AssistantIdentity
  onIdentityChange: React.Dispatch<React.SetStateAction<AssistantIdentity>>
  onRefreshAssistant: () => void
  onRestoreBaseState: () => void
}) {
  return (
    <div className="grid h-full min-h-0 gap-4 overflow-y-auto pb-2 lg:grid-cols-[minmax(0,1fr)_320px] lg:overflow-hidden">
      <section className="flex min-h-0 flex-col gap-4">
        <div className={panelClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Nombres
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Asistente">
              <input
                value={props.identity.assistantName}
                onChange={(event) =>
                  props.onIdentityChange((previous) => ({
                    ...previous,
                    assistantName: event.target.value,
                  }))
                }
                className="lilo-input w-full rounded-[20px] px-4 py-3 text-sm outline-none"
              />
            </Field>
            <Field label="Tu nombre">
              <input
                value={props.identity.ownerName}
                onChange={(event) =>
                  props.onIdentityChange((previous) => ({
                    ...previous,
                    ownerName: event.target.value,
                  }))
                }
                className="lilo-input w-full rounded-[20px] px-4 py-3 text-sm outline-none"
              />
            </Field>
          </div>
        </div>

        <div className={panelClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Personalidad
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {personalityOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() =>
                  props.onIdentityChange((previous) => ({
                    ...previous,
                    personality: option,
                  }))
                }
                className={`rounded-[18px] px-3 py-3 text-sm font-medium transition ${
                  props.identity.personality === option
                    ? 'bg-[var(--nav-active)] text-[var(--nav-active-contrast)]'
                    : 'bg-[color:var(--surface-strong)] text-[var(--heading)]'
                }`}
              >
                {capitalizeText(option)}
              </button>
            ))}
          </div>
        </div>

        <div className={panelClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Tema
          </p>
          <div className="mt-4 grid gap-3">
            {paletteOptions.map((palette) => (
              <button
                key={palette.id}
                type="button"
                onClick={() =>
                  props.onIdentityChange((previous) => ({
                    ...previous,
                    palette: palette.id as PaletteMode,
                  }))
                }
                className={`flex items-center justify-between rounded-[20px] px-4 py-4 transition ${
                  props.identity.palette === palette.id
                    ? 'bg-[var(--nav-active)] text-[var(--nav-active-contrast)]'
                    : 'bg-[color:var(--surface-strong)] text-[var(--heading)]'
                }`}
              >
                <span className="font-medium">{palette.label}</span>
                <span className="flex gap-2">
                  {palette.swatches.map((swatch) => (
                    <span
                      key={swatch}
                      className="h-5 w-5 rounded-full border border-white/30"
                      style={{ background: swatch }}
                    />
                  ))}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className={panelClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Sueño
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Dormir">
              <input
                type="time"
                value={props.identity.sleepStart}
                onChange={(event) =>
                  props.onIdentityChange((previous) => ({
                    ...previous,
                    sleepStart: event.target.value,
                  }))
                }
                className="lilo-input w-full rounded-[20px] px-4 py-3 text-sm outline-none"
              />
            </Field>
            <Field label="Despertar">
              <input
                type="time"
                value={props.identity.sleepEnd}
                onChange={(event) =>
                  props.onIdentityChange((previous) => ({
                    ...previous,
                    sleepEnd: event.target.value,
                  }))
                }
                className="lilo-input w-full rounded-[20px] px-4 py-3 text-sm outline-none"
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-4">
        <div className={panelClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            IA
          </p>
          <div className="mt-4 rounded-[20px] bg-[color:var(--surface-strong)] px-4 py-4">
            <p className="text-sm font-semibold text-[var(--heading)]">
              {resolveAssistantBadge(props.assistantConnection)}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {resolveAssistantSidebarText(props.assistantConnection)}
            </p>
          </div>
          <button
            type="button"
            onClick={props.onRefreshAssistant}
            className="lilo-secondary-button mt-4 rounded-full px-4 py-2 text-sm font-semibold"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Probar conexión
            </span>
          </button>
        </div>

        <div className={panelClass}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Reinicio
          </p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Vuelve al estado inicial si quieres empezar de cero.
          </p>
          <button
            type="button"
            onClick={props.onRestoreBaseState}
            className="lilo-secondary-button mt-4 rounded-full px-4 py-2 text-sm font-semibold"
          >
            Restaurar base
          </button>
        </div>
      </section>
    </div>
  )
}

function MobileNavigation(props: {
  activeTab: TabId
  onSwitchTab: (tab: TabId) => void
}) {
  return (
    <nav className="lilo-mobile-nav fixed inset-x-0 bottom-2 z-50 px-2 lg:hidden">
      <div className="mx-auto max-w-[20rem] rounded-[22px] border border-[color:var(--line-soft)] bg-[color:var(--surface-strong)] p-1 shadow-[var(--shadow-shell)]">
        <div className="grid grid-cols-4 gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const selected = tab.id === props.activeTab

            return (
              <button
                key={tab.id}
                type="button"
                aria-label={tab.label}
                onClick={() => props.onSwitchTab(tab.id)}
                className={`lilo-nav-button rounded-[16px] px-2 py-2.5 text-center ${selected ? 'is-active' : ''}`}
              >
                <Icon className="mx-auto h-4.5 w-4.5" />
                <p className="sr-only">{tab.label}</p>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

function TaskCard(props: {
  onOpen: (task: Task) => void
  task: Task
}) {
  const accent = taskAccentStyles[props.task.accent]

  return (
    <button
      type="button"
      onClick={() => props.onOpen(props.task)}
      className={`w-full rounded-[24px] border border-[color:var(--line-soft)] bg-[color:var(--surface-strong)] px-4 py-4 text-left shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 ${
        props.task.completed ? 'opacity-70' : ''
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} />
            <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              {props.task.startTime} - {props.task.endTime}
            </p>
          </div>
          <h4
            className={`mt-3 text-lg font-semibold tracking-[-0.02em] text-[var(--heading)] ${
              props.task.completed ? 'line-through' : ''
            }`}
          >
            {props.task.title}
          </h4>
          {props.task.notes ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
              {props.task.notes}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:max-w-[11rem] sm:flex-col sm:items-end sm:text-right">
          <span
            className={`max-w-full rounded-full px-3 py-1 text-xs font-semibold whitespace-normal ${accent.soft}`}
          >
            {props.task.category}
          </span>
          <span className="text-xs text-[var(--muted)]">
            {getDurationInMinutes(props.task.startTime, props.task.endTime)} min
          </span>
        </div>
      </div>
    </button>
  )
}

function TaskModal(props: {
  draft: TaskDraft
  mode: 'create' | 'edit'
  onClose: () => void
  onDelete?: () => void
  onDraftChange: (draft: TaskDraft) => void
  onSave: () => void
  onToggleComplete?: () => void
  task: Task | null
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end bg-black/35 p-2 sm:items-center sm:justify-center sm:p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 350, damping: 28 }}
        className="max-h-[92svh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-[var(--surface-strong)] p-5 shadow-[var(--shadow-shell)] soft-scrollbar"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              {props.mode === 'create' ? 'Nueva tarea' : 'Detalle'}
            </p>
            <h3 className="mt-1 font-display text-2xl text-[var(--heading)]">
              {props.mode === 'create' ? 'Agregar al horario' : 'Editar tarea'}
            </h3>
          </div>
          <button type="button" onClick={props.onClose} className="lilo-icon-button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <Field label="Título">
            <input
              value={props.draft.title}
              onChange={(event) =>
                props.onDraftChange({
                  ...props.draft,
                  title: event.target.value,
                })
              }
              className="lilo-input w-full rounded-[18px] px-4 py-3 text-sm outline-none"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha">
              <input
                type="date"
                value={props.draft.date}
                onChange={(event) =>
                  props.onDraftChange({
                    ...props.draft,
                    date: event.target.value,
                  })
                }
                className="lilo-input w-full rounded-[18px] px-4 py-3 text-sm outline-none"
              />
            </Field>
            <Field label="Categoría">
              <input
                value={props.draft.category}
                onChange={(event) =>
                  props.onDraftChange({
                    ...props.draft,
                    category: event.target.value,
                  })
                }
                className="lilo-input w-full rounded-[18px] px-4 py-3 text-sm outline-none"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Empieza">
              <input
                type="time"
                value={props.draft.startTime}
                onChange={(event) =>
                  props.onDraftChange({
                    ...props.draft,
                    startTime: event.target.value,
                  })
                }
                className="lilo-input w-full rounded-[18px] px-4 py-3 text-sm outline-none"
              />
            </Field>
            <Field label="Termina">
              <input
                type="time"
                value={props.draft.endTime}
                onChange={(event) =>
                  props.onDraftChange({
                    ...props.draft,
                    endTime: event.target.value,
                  })
                }
                className="lilo-input w-full rounded-[18px] px-4 py-3 text-sm outline-none"
              />
            </Field>
          </div>

          <Field label="Color">
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(taskAccentStyles) as Array<Task['accent']>).map((accent) => (
                <button
                  key={accent}
                  type="button"
                  onClick={() =>
                    props.onDraftChange({
                      ...props.draft,
                      accent,
                    })
                  }
                  className={`rounded-[16px] border px-2 py-3 text-xs font-semibold uppercase tracking-[0.12em] ${
                    props.draft.accent === accent
                      ? 'border-transparent bg-[var(--nav-active)] text-[var(--nav-active-contrast)]'
                      : 'border-[color:var(--line-soft)] bg-[color:var(--surface-soft)] text-[var(--heading)]'
                  }`}
                >
                  {accent}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Notas">
            <textarea
              value={props.draft.notes}
              onChange={(event) =>
                props.onDraftChange({
                  ...props.draft,
                  notes: event.target.value,
                })
              }
              rows={4}
              className="lilo-input w-full resize-none rounded-[18px] px-4 py-3 text-sm leading-6 outline-none"
            />
          </Field>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {props.onDelete ? (
              <button
                type="button"
                onClick={props.onDelete}
                className="lilo-secondary-button rounded-full px-4 py-2 text-sm font-semibold"
              >
                <span className="inline-flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Eliminar
                </span>
              </button>
            ) : null}

            {props.onToggleComplete && props.task ? (
              <button
                type="button"
                onClick={props.onToggleComplete}
                className="lilo-secondary-button rounded-full px-4 py-2 text-sm font-semibold"
              >
                {props.task.completed ? 'Marcar pendiente' : 'Marcar hecha'}
              </button>
            ) : null}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={props.onClose}
              className="lilo-secondary-button rounded-full px-4 py-2 text-sm font-semibold"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={props.onSave}
              className="lilo-action-button rounded-full px-4 py-2 text-sm font-semibold"
            >
              <span className="inline-flex items-center gap-2">
                <Save className="h-4 w-4" />
                Guardar
              </span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function PetSection(props: { onPetAction: (action: PetAction) => void }) {
  return (
    <div className="grid gap-4">
      <div className="rounded-[24px] bg-[color:var(--surface-strong)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Interacciones
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => props.onPetAction('feed')}
            className="lilo-secondary-button rounded-[18px] px-3 py-3 text-sm font-medium"
          >
            Dar snack
          </button>
          <button
            type="button"
            onClick={() => props.onPetAction('cuddle')}
            className="lilo-secondary-button rounded-[18px] px-3 py-3 text-sm font-medium"
          >
            Acariciar
          </button>
          <button
            type="button"
            onClick={() => props.onPetAction('play')}
            className="lilo-secondary-button rounded-[18px] px-3 py-3 text-sm font-medium"
          >
            Jugar
          </button>
          <button
            type="button"
            onClick={() => props.onPetAction('rest')}
            className="lilo-secondary-button rounded-[18px] px-3 py-3 text-sm font-medium"
          >
            Descansar
          </button>
          <button
            type="button"
            onClick={() => props.onPetAction('clean')}
            className="lilo-secondary-button rounded-[18px] px-3 py-3 text-sm font-medium"
          >
            Arreglarla
          </button>
          <button
            type="button"
            onClick={() => props.onPetAction('talk')}
            className="lilo-secondary-button rounded-[18px] px-3 py-3 text-sm font-medium"
          >
            Hablarle
          </button>
        </div>
      </div>

      <div className="rounded-[24px] bg-[color:var(--surface-strong)] p-4 text-sm leading-6 text-[var(--muted)]">
        La burbujita cambia contigo mientras juegas, descansas o avanzas en tu día.
      </div>
    </div>
  )
}

function ChessSection(props: {
  chess: Chess
  chessMessage: string
  chessThinking: boolean
  onChessSquareClick: (square: Square) => void
  onResetChess: () => void
  recentMoves: Move[]
  selectedSquare: null | Square
}) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Ajedrez
          </p>
          <h3 className="mt-1 font-display text-2xl text-[var(--heading)]">Pausa táctica</h3>
        </div>
        <button
          type="button"
          onClick={props.onResetChess}
          className="lilo-secondary-button rounded-full px-3 py-2 text-sm font-medium"
        >
          <span className="inline-flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Reiniciar
          </span>
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="rounded-[24px] bg-[color:var(--surface-strong)] p-2.5 sm:p-3">
          <div className="mx-auto w-full max-w-[18.5rem] sm:max-w-[24rem] xl:max-w-none">
            <div className="chess-grid-container">
            {props.chess.board().flat().map((square, index) => {
              const file = index % 8
              const rank = Math.floor(index / 8)
              const isDark = (file + rank) % 2 === 1
              const squareName = `${'abcdefgh'[file]}${8 - rank}` as Square
              const pieceKey = square ? `${square.color}${square.type}` : null
              const selected = props.selectedSquare === squareName
              const canMove = props.selectedSquare
                ? props.chess
                    .moves({ square: props.selectedSquare, verbose: true })
                    .some((move) => move.to === squareName)
                : false

              return (
                <button
                  key={squareName}
                  type="button"
                  onClick={() => props.onChessSquareClick(squareName)}
                    className={`relative h-full w-full font-serif text-[1.35rem] sm:text-[2rem] ${
                      isDark ? 'bg-[#8e6d4f] text-white' : 'bg-[#f3e6d6] text-[#2f2236]'
                    } ${selected ? 'ring-4 ring-inset ring-[var(--accent)]' : ''}`}
                >
                  {canMove ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="h-4 w-4 rounded-full bg-[var(--accent)]/70" />
                    </span>
                  ) : null}
                  <span className="relative z-10">
                    {pieceKey ? unicodePieces[pieceKey] : ''}
                  </span>
                </button>
              )
            })}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <div className="rounded-[22px] bg-[color:var(--surface-strong)] px-4 py-4 text-sm leading-6 text-[var(--heading)]">
            {props.chessMessage}
          </div>
          <div className="rounded-[22px] bg-[color:var(--surface-strong)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Estado
            </p>
            <p className="mt-2 text-sm text-[var(--heading)]">
              {props.chessThinking
                ? 'Lilo está moviendo negras.'
                : `Turno de ${props.chess.turn() === 'w' ? 'blancas' : 'negras'}`}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {props.chess.isGameOver()
                ? 'La partida terminó.'
                : 'Tú juegas con blancas.'}
            </p>
          </div>
          <div className="rounded-[22px] bg-[color:var(--surface-strong)] px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
              Últimos movimientos
            </p>
            <div className="mt-3 space-y-2">
              {props.recentMoves.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Aún no hay movimientos.</p>
              ) : (
                props.recentMoves.map((move) => (
                  <div
                    key={`${move.from}-${move.to}-${move.san}`}
                    className="rounded-[16px] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[var(--heading)]"
                  >
                    {move.san} · {move.from.toUpperCase()} → {move.to.toUpperCase()}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MemorySection(props: {
  memoryCompleted: boolean
  memoryDeck: MemoryCard[]
  memoryFlipped: number[]
  memoryMatched: number[]
  memoryMoves: number
  onMemoryFlip: (index: number) => void
  onMemoryReset: () => void
}) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Memoria
          </p>
          <h3 className="mt-1 font-display text-2xl text-[var(--heading)]">Parejas suaves</h3>
        </div>
        <button
          type="button"
          onClick={props.onMemoryReset}
          className="lilo-secondary-button rounded-full px-3 py-2 text-sm font-medium"
        >
          <span className="inline-flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            Mezclar
          </span>
        </button>
      </div>

      <div className="rounded-[24px] bg-[color:var(--surface-strong)] p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[var(--heading)]">
            Movimientos: {props.memoryMoves}
          </span>
          <span className="rounded-full bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[var(--heading)]">
            {props.memoryMatched.length / 2} parejas
          </span>
          {props.memoryCompleted ? (
            <span className="rounded-full bg-[var(--nav-active)] px-3 py-2 text-sm text-[var(--nav-active-contrast)]">
              Completado
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {props.memoryDeck.map((card, index) => {
            const revealed =
              props.memoryMatched.includes(index) || props.memoryFlipped.includes(index)

            return (
              <button
                key={card.id}
                type="button"
                onClick={() => props.onMemoryFlip(index)}
                className={`memory-card h-20 rounded-[20px] border border-[color:var(--line-soft)] text-2xl sm:h-24 ${
                  revealed
                    ? 'bg-[var(--nav-active)] text-[var(--nav-active-contrast)]'
                    : 'bg-[color:var(--surface-soft)] text-transparent'
                }`}
              >
                <span className={revealed ? 'opacity-100' : 'opacity-0'}>{card.emoji}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function PetBubble({
  expression = 'idle',
  hearts = [],
}: {
  expression?: 'idle' | 'happy' | 'sleep' | 'dizzy' | 'excited'
  hearts?: Array<{ id: number; x: number; r: number; char: string }>
}) {
  return (
    <div className="lilo-orb relative">
      <div className="lilo-orb__glow" />
      <div className="lilo-orb__spark lilo-orb__spark--one" />
      <div className="lilo-orb__spark lilo-orb__spark--two" />
      
      {/* Floating Particles/Hearts */}
      {hearts.map((heart) => (
        <span
          key={heart.id}
          className="bubble-heart"
          style={{
            '--x': `${heart.x}px`,
            '--r': `${heart.r}deg`,
            left: '50%',
            top: '30%',
            transform: 'translate(-50%, -50%)',
          } as React.CSSProperties}
        >
          {heart.char}
        </span>
      ))}

      {/* Face rendering depending on expression */}
      {expression === 'happy' && (
        <>
          <div className="absolute inset-[44%_0_auto] flex justify-center gap-7">
            {/* Curved upward happy eyes */}
            <span className="w-3 h-2.5 bg-transparent border-t-3 border-[#2b2440] rounded-t-full relative top-[2px]" />
            <span className="w-3 h-2.5 bg-transparent border-t-3 border-[#2b2440] rounded-t-full relative top-[2px]" />
          </div>
          {/* Smiling round pink mouth */}
          <div className="absolute bottom-[20%] left-[50%] -translate-x-1/2 w-4 h-4 rounded-full bg-rose-400 border border-[#2b2440]" />
        </>
      )}

      {expression === 'sleep' && (
        <>
          <div className="absolute inset-[44%_0_auto] flex justify-center gap-7">
            {/* Sleepy closed eyes */}
            <span className="w-3 h-2.5 bg-transparent border-b-3 border-[#2b2440] rounded-b-full relative top-[5px]" />
            <span className="w-3 h-2.5 bg-transparent border-b-3 border-[#2b2440] rounded-b-full relative top-[5px]" />
          </div>
          {/* Small sleepy mouth "o" */}
          <div className="absolute bottom-[22%] left-[50%] -translate-x-1/2 w-2 h-2 rounded-full border border-[#2b2440] bg-transparent" />
        </>
      )}

      {expression === 'dizzy' && (
        <>
          <div className="absolute inset-[40%_0_auto] flex justify-center gap-6 text-sm font-bold text-[#2b2440] select-none">
            <span>×</span>
            <span>×</span>
          </div>
          {/* Flat line mouth */}
          <div className="absolute bottom-[24%] left-[50%] -translate-x-1/2 w-3.5 h-[2px] bg-[#2b2440]" />
        </>
      )}

      {expression === 'excited' && (
        <>
          <div className="absolute inset-[43%_0_auto] flex justify-center gap-6">
            {/* Cute wide circular eyes */}
            <span className="w-3 h-3 rounded-full bg-[#2b2440] animate-pulse" />
            <span className="w-3 h-3 rounded-full bg-[#2b2440] animate-pulse" />
          </div>
          {/* Laughing open mouth */}
          <div className="absolute bottom-[16%] left-[50%] -translate-x-1/2 w-4.5 h-3 rounded-b-full bg-[#2b2440]" />
        </>
      )}

      {expression === 'idle' && (
        <>
          <div className="absolute inset-[44%_0_auto] flex justify-center gap-6">
            <span className="lilo-orb__eye" />
            <span className="lilo-orb__eye" />
          </div>
          <div className="lilo-orb__mouth" />
        </>
      )}
    </div>
  )
}

function Field(props: {
  children: ReactNode
  className?: string
  label: string
}) {
  return (
    <label className={props.className ?? ''}>
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
        {props.label}
      </span>
      <div className="mt-2">{props.children}</div>
    </label>
  )
}

function CompactTask(props: { empty: string; label: string; task: Task | null }) {
  return (
    <div className="rounded-[18px] bg-[color:var(--surface-strong)] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
        {props.label}
      </p>
      {props.task ? (
        <>
          <p className="mt-2 font-semibold text-[var(--heading)]">{props.task.title}</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {props.task.startTime} - {props.task.endTime}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-[var(--muted)]">{props.empty}</p>
      )}
    </div>
  )
}

function PetMeter(props: { label: string; value: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
        <span>{props.label}</span>
        <span>{props.value}%</span>
      </div>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-[color:var(--surface-strong)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent),var(--accent-2))]"
          style={{ width: `${props.value}%` }}
        />
      </div>
    </div>
  )
}

function createTaskDraft(date: string): TaskDraft {
  return {
    title: '',
    date,
    category: 'General',
    startTime: '09:00',
    endTime: '10:00',
    accent: 'violet',
    notes: '',
  }
}

function buildMemoryDeck() {
  return shuffle(
    memorySymbols.flatMap((emoji, index) => [
      { emoji, id: `${index}-a` },
      { emoji, id: `${index}-b` },
    ]),
  )
}

function shuffle<T>(items: T[]) {
  const nextItems = [...items]

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1))
    ;[nextItems[index], nextItems[randomIndex]] = [nextItems[randomIndex], nextItems[index]]
  }

  return nextItems
}

function clamp(value: number) {
  return Math.min(100, Math.max(0, value))
}

function resolvePetMood(petState: PetState) {
  if (petState.mood >= 82 && petState.energy >= 60) {
    return { title: 'Despierta' }
  }

  if (petState.energy < 35) {
    return { title: 'Somnolienta' }
  }

  if (petState.bond > 70) {
    return { title: 'Cariñosa' }
  }

  return { title: 'Tranquila' }
}

function chooseComputerMove(game: Chess) {
  const moves = game.moves({ verbose: true })

  if (moves.length === 0) {
    return null
  }

  let bestMove = moves[0]
  let bestScore = Number.POSITIVE_INFINITY

  moves.forEach((move) => {
    const simulation = new Chess(game.fen())
    simulation.move(move)
    const score = evaluateBoard(simulation) - (move.captured ? pieceValue(move.captured) * 0.25 : 0)

    if (score < bestScore) {
      bestScore = score
      bestMove = move
    }
  })

  return bestMove
}

function evaluateBoard(game: Chess) {
  return game.board().reduce((score, row) => {
    return (
      score +
      row.reduce((rowScore, piece) => {
        if (!piece) {
          return rowScore
        }

        const value = pieceValue(piece.type)
        return rowScore + (piece.color === 'w' ? value : -value)
      }, 0)
    )
  }, 0)
}

function pieceValue(piece: string) {
  if (piece === 'p') {
    return 1
  }

  if (piece === 'n') {
    return 3
  }

  if (piece === 'b') {
    return 3.2
  }

  if (piece === 'r') {
    return 5
  }

  if (piece === 'q') {
    return 9
  }

  return 0
}

function resolveChessMessage(chess: Chess, move: Move) {
  if (chess.isCheckmate()) {
    return `Jaque mate con ${move.san}.`
  }

  if (chess.isDraw()) {
    return `Tablas después de ${move.san}.`
  }

  if (chess.isCheck()) {
    return `${move.san}. Hay jaque.`
  }

  return `${move.san}. Sigue ${chess.turn() === 'w' ? 'blancas' : 'negras'}.`
}

function resolveComputerMoveMessage(chess: Chess, move: Move) {
  if (chess.isCheckmate()) {
    return `${move.san}. Jaque mate.`
  }

  if (chess.isDraw()) {
    return `${move.san}. Tablas.`
  }

  if (chess.isCheck()) {
    return `${move.san}. Jaque para ti.`
  }

  return `${move.san}. Tu turno otra vez.`
}

function resolveAssistantBadge(connection: AssistantConnection) {
  if (connection.status === 'online') {
    return 'IA lista'
  }

  if (connection.status === 'checking') {
    return 'Conectando'
  }

  if (connection.status === 'unconfigured') {
    return 'Activa IA'
  }

  return 'Modo local'
}

function resolveAssistantSidebarText(connection: AssistantConnection) {
  if (connection.status === 'online') {
    return connection.model
      ? `Lilo ya está conectada con ${connection.model}.`
      : 'Lilo ya está conectada y respondiendo.'
  }

  if (connection.status === 'unconfigured') {
    return 'El servidor ya está listo. Solo falta poner la clave de Gemini.'
  }

  if (connection.status === 'checking') {
    return 'Estoy revisando la conexión.'
  }

  return 'No encontré el servidor. Puedes levantarlo con npm run dev:full.'
}

function resolveHeaderTitle(activeTab: TabId, identity: AssistantIdentity) {
  if (activeTab === 'day') {
    return 'El día'
  }

  if (activeTab === 'assistant') {
    return identity.assistantName
  }

  if (activeTab === 'minigames') {
    return 'Break'
  }

  return 'Ajustes'
}

function resolveSectionLabel(activeTab: TabId) {
  if (activeTab === 'day') {
    return 'Agenda'
  }

  if (activeTab === 'assistant') {
    return 'Asistente'
  }

  if (activeTab === 'minigames') {
    return 'Minijuegos'
  }

  return 'Identidad'
}

function resolveSubtitle(activeTab: TabId, selectedDateLabel: string) {
  if (activeTab === 'day') {
    return `Tu agenda para ${selectedDateLabel}.`
  }

  if (activeTab === 'assistant') {
    return 'Habla con Lilo y deja que acomode tu agenda.'
  }

  if (activeTab === 'minigames') {
    return 'Un break corto con tu mascota y juegos ligeros.'
  }

  return 'Personaliza a Lilo a tu ritmo.'
}

function capitalizeText(value: string) {
  return value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value
}

function useStoredState<T>(
  key: string,
  initialValue: T | (() => T),
  migrate?: (rawValue: unknown) => T,
) {
  const [state, setState] = useState<T>(() => {
    try {
      const rawStoredValue = window.localStorage.getItem(key)
      if (rawStoredValue === null) {
        return typeof initialValue === 'function'
          ? (initialValue as () => T)()
          : initialValue
      }

      const parsedValue = JSON.parse(rawStoredValue) as unknown
      return migrate ? migrate(parsedValue) : (parsedValue as T)
    } catch {
      return typeof initialValue === 'function'
        ? (initialValue as () => T)()
        : initialValue
    }
  })

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(state))
  }, [key, state])

  return [state, setState] as const
}

export default App
