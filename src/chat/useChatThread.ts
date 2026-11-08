import { useEffect, useRef, useState } from 'react'
import { EMPTY_PIPELINE, runTurn, type ChatMessage } from '@/chat/thread'

const STORAGE_KEY = 'echome-ai.thread.v12'

function loadThread(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is ChatMessage =>
        !!item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.content === 'string'
    )
  } catch {
    return []
  }
}

export function useChatThread(modelId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>(loadThread)
  const [busy, setBusy] = useState(false)
  const generation = useRef(0)
  const busyRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef(messages)
  const modelRef = useRef(modelId)
  messagesRef.current = messages
  modelRef.current = modelId

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
  }, [messages])

  const send = async (raw: string) => {
    const text = raw.trim()
    if (!text || busyRef.current) return

    abortRef.current?.abort()
    const turn = generation.current + 1
    generation.current = turn
    busyRef.current = true
    const history = messagesRef.current
    const assistantId = crypto.randomUUID()
    const controller = new AbortController()
    abortRef.current = controller

    const chosenModel = modelRef.current
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'user', content: text, modelId: chosenModel },
      { id: assistantId, role: 'assistant', content: '', pipeline: EMPTY_PIPELINE },
    ])
    setBusy(true)

    const stillCurrent = () => generation.current === turn

    const patchAssistant = (patch: Partial<ChatMessage>) => {
      if (!stillCurrent()) return
      setMessages((prev) =>
        prev.map((message) => (message.id === assistantId ? { ...message, ...patch } : message))
      )
    }

    try {
      await runTurn({
        text,
        history,
        modelId: chosenModel,
        signal: controller.signal,
        onPipeline: (pipeline) => patchAssistant({ pipeline }),
        onText: (content) => patchAssistant({ content }),
        onCacheable: (cacheable) => patchAssistant({ cacheable }),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      patchAssistant({
        content: 'The page stopped before a model was called. Ask that again.',
      })
    } finally {
      if (stillCurrent()) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }

  const clear = () => {
    generation.current += 1
    abortRef.current?.abort()
    busyRef.current = false
    setBusy(false)
    setMessages([])
    localStorage.removeItem(STORAGE_KEY)
  }

  return { messages, busy, send, clear }
}
