import type { RetrievedNote } from '@/chat/retrieve'

export interface StreamMeta {
  note?: RetrievedNote
  cached?: boolean
  quota?: boolean
  blocked?: 'off_topic' | 'withheld'
  model?: string
}

export interface StreamDone {
  quota?: boolean
  blocked?: 'off_topic' | 'withheld'
}

interface StreamHandlers {
  onMeta: (meta: StreamMeta) => void
  onToken: (text: string) => void
  onDone: (done: StreamDone) => void
  onError: (text: string) => void
}

function parseEvent(block: string) {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  const raw = dataLines.join('\n')
  return { event, data: raw ? (JSON.parse(raw) as Record<string, unknown>) : {} }
}

/** Reads the chat API stream. The browser never talks to Gemini directly. */
export async function streamModelAnswer(
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string; cacheable?: boolean }>,
  modelId: string,
  signal: AbortSignal,
  handlers: StreamHandlers,
) {
  const prior = history
    .filter((turn) => turn.role === 'user' || turn.cacheable !== false)
    .slice(-6)
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 500) }))

  const response = await fetch(`${import.meta.env.BASE_URL}api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history: prior, modelId }),
    signal,
  })

  if (!response.ok || !response.body) {
    handlers.onError('The chat API did not answer. If this is local dev, restart it after saving .env.')
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      if (!block.trim()) continue
      const { event, data } = parseEvent(block)
      if (event === 'meta') handlers.onMeta(data as unknown as StreamMeta)
      if (event === 'token' && typeof data.text === 'string') handlers.onToken(data.text)
      if (event === 'error' && typeof data.text === 'string') handlers.onError(data.text)
      if (event === 'done') handlers.onDone(data as unknown as StreamDone)
    }
  }
}
