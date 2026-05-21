export type TabId = 'day' | 'assistant' | 'minigames' | 'identity'

export type PaletteMode = 'pastel' | 'aurora' | 'neon'

export type PersonalityTone = 'tierna' | 'motivadora' | 'sarcastica'

export type TaskAccent = 'rose' | 'sky' | 'amber' | 'mint' | 'violet'

export interface Task {
  id: string
  title: string
  date: string
  category: string
  startTime: string
  endTime: string
  completed: boolean
  accent: TaskAccent
  createdBy: 'assistant' | 'manual'
  notes?: string
}

export interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  createdAt: string
  actionsApplied?: number
  status?: 'local' | 'gemini'
}

export interface AssistantIdentity {
  assistantName: string
  ownerName: string
  personality: PersonalityTone
  palette: PaletteMode
  sleepStart: string
  sleepEnd: string
}

export type AssistantAction =
  | {
      type: 'ADD_TASK'
      title: string
      date: string
      startTime: string
      endTime: string
      category?: string
      accent?: TaskAccent
      notes?: string
    }
  | {
      type: 'UPDATE_TASK'
      taskId?: string
      taskTitle?: string
      date?: string
      startTime?: string
      endTime?: string
      category?: string
      notes?: string
    }
  | {
      type: 'COMPLETE_TASK'
      taskId?: string
      taskTitle?: string
    }
  | {
      type: 'DELETE_TASK'
      taskId?: string
      taskTitle?: string
    }
  | {
      type: 'RENAME_ASSISTANT'
      name: string
    }

export interface AssistantResult {
  reply: string
  actions: AssistantAction[]
  source: 'local' | 'gemini'
  focusTab?: TabId
}

export interface Goal {
  id: string
  title: string
  completed: boolean
  linkedTaskIds: string[]
}

