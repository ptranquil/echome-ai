import { fixedReply } from '@/chat/fixedReplies'
import { resolveFollowUp } from '@/chat/followUp'
import { classifyMessage, greetingReply, normalizeQuestion, rememberedName, visitorNameReply } from '@/chat/guard'
import { streamModelAnswer } from '@/chat/modelStream'
import type { RetrievedNote } from '@/chat/retrieve'

export type StepStatus =
  | 'idle'
  | 'running'
  | 'passed'
  | 'blocked'
  | 'hit'
  | 'miss'
  | 'skipped'
  | 'waiting'

export interface PipelineView {
  guardrail: StepStatus
  cache: StepStatus
  retrieval: StepStatus
  model: StepStatus
  note?: RetrievedNote
  modelDetail?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  pipeline?: PipelineView
  /** False for quota, missing-key, and failed calls so a retry is not replayed from cache. */
  cacheable?: boolean
  /** Model that produced a generated answer. Direct replies omit it. */
  modelId?: string
}

export const EMPTY_PIPELINE: PipelineView = {
  guardrail: 'idle',
  cache: 'idle',
  retrieval: 'idle',
  model: 'idle',
}

interface RunTurnInput {
  text: string
  history: ChatMessage[]
  modelId: string
  signal: AbortSignal
  onPipeline: (pipeline: PipelineView) => void
  onText: (content: string) => void
  onCacheable: (cacheable: boolean) => void
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function streamText(text: string, onText: (content: string) => void, signal: AbortSignal) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduceMotion) {
    onText(text)
    return
  }

  const tokens = text.split(/(\s+)/)
  let full = ''
  for (const token of tokens) {
    if (signal.aborted) throw new DOMException('aborted', 'AbortError')
    full += token
    onText(full)
    if (token.trim()) await sleep(32, signal)
  }
}

function cachedAnswer(history: ChatMessage[], question: string, modelId: string) {
  const key = normalizeQuestion(question)
  for (let i = 0; i < history.length - 1; i += 1) {
    const current = history[i]
    const next = history[i + 1]
    if (!current || !next) continue
    if (current.role !== 'user' || next.role !== 'assistant') continue
    if (normalizeQuestion(current.content) !== key) continue
    if (next.cacheable === false) continue
    if (!next.content.trim()) continue
    if (next.pipeline?.model === 'passed' && current.modelId !== modelId) continue
    return next.content
  }
  return null
}

/**
 * One visitor turn, in order:
 * guardrail → cache → retrieval → Gemini stream.
 * Guardrail and the browser cache finish before any request.
 * The request goes to our API. That API holds the Gemini key.
 */
export async function runTurn({ text, history, modelId, signal, onPipeline, onText, onCacheable }: RunTurnInput) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const pause = () => (reduceMotion ? Promise.resolve() : sleep(240, signal))

  onPipeline({ ...EMPTY_PIPELINE, guardrail: 'running' })
  await pause()

  const nameAnswer = visitorNameReply(history, text)
  if (nameAnswer) {
    onPipeline({
      guardrail: 'passed',
      cache: 'skipped',
      retrieval: 'skipped',
      model: 'skipped',
    })
    await streamText(nameAnswer, onText, signal)
    onCacheable(true)
    return
  }

  const greeting = greetingReply(text, rememberedName(history))
  if (greeting) {
    onPipeline({
      guardrail: 'passed',
      cache: 'skipped',
      retrieval: 'skipped',
      model: 'skipped',
    })
    await streamText(greeting, onText, signal)
    onCacheable(true)
    return
  }

  const decision = classifyMessage(resolveFollowUp(text, history))
  if (decision === 'withheld' || decision === 'off_topic') {
    onPipeline({
      guardrail: 'blocked',
      cache: 'skipped',
      retrieval: 'skipped',
      model: 'skipped',
    })
    await streamText(fixedReply(decision), onText, signal)
    onCacheable(true)
    return
  }

  onPipeline({ ...EMPTY_PIPELINE, guardrail: 'passed', cache: 'running' })
  await pause()

  const cached = cachedAnswer(history, text, modelId)
  if (cached) {
    onPipeline({
      guardrail: 'passed',
      cache: 'hit',
      retrieval: 'skipped',
      model: 'skipped',
    })
    await streamText(cached, onText, signal)
    onCacheable(true)
    return
  }

  onPipeline({
    ...EMPTY_PIPELINE,
    guardrail: 'passed',
    cache: 'miss',
    retrieval: 'running',
  })

  let full = ''
  let failed = false
  let shown: PipelineView = {
    guardrail: 'passed',
    cache: 'miss',
    retrieval: 'running',
    model: 'idle',
  }
  const show = (pipeline: PipelineView) => {
    shown = pipeline
    onPipeline(pipeline)
  }

  try {
    await streamModelAnswer(text, history, modelId, signal, {
      onMeta: (meta) => {
        if (meta.blocked) return
        show({
          guardrail: 'passed',
          cache: meta.cached ? 'hit' : 'miss',
          retrieval: meta.cached ? 'skipped' : 'passed',
          model: meta.cached ? 'skipped' : 'running',
          note: meta.note,
          modelDetail: meta.quota ? 'Quota' : meta.model,
        })
      },
      onToken: (chunk) => {
        full += chunk
        onText(full)
      },
      onError: (message) => {
        failed = true
        full = message
        onText(message)
        show({
          ...shown,
          model: 'blocked',
          modelDetail: message.includes('GEMINI_API_KEY') ? 'No key' : 'Stopped',
        })
      },
      onDone: (done) => {
        if (done.quota) {
          failed = true
          show({
            ...shown,
            retrieval: shown.note ? 'passed' : 'skipped',
            model: 'blocked',
            modelDetail: 'Quota',
          })
          return
        }
        if (shown.model === 'running') {
          show({ ...shown, model: 'passed' })
        }
      },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    failed = true
    onText('The chat API did not answer. Restart the dev server if you just added the key.')
    onPipeline({
      guardrail: 'passed',
      cache: 'miss',
      retrieval: 'skipped',
      model: 'blocked',
      modelDetail: 'Stopped',
    })
  }

  onCacheable(!failed && full.trim().length > 0)
}
