import { ArrowUp, ChevronDown, PanelRight, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import avatarUrl from '../../avatar.png'
import { Pipeline } from '@/chat/Pipeline'
import type { ChatMessage, PipelineView } from '@/chat/thread'
import { useChatThread } from '@/chat/useChatThread'
import { useModelChoice } from '@/chat/useModelChoice'
import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/utils/cn'

const STARTERS = [
  'Who are you?',
  'Where do you work now?',
  'What stack have you used?',
  'Which projects should I look at?',
]

function EchoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
    >
      <circle cx="9" cy="16" r="2.4" fill="currentColor" />
      <path
        d="M14 11.2a6.2 6.2 0 0 1 0 9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M18 8a11 11 0 0 1 0 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.72"
      />
      <path
        d="M22 5a15.4 15.4 0 0 1 0 22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.4"
      />
    </svg>
  )
}

function Avatar({ size, className, alt = '' }: { size: number; className?: string; alt?: string }) {
  return (
    <img
      src={avatarUrl}
      alt={alt}
      width={size}
      height={size}
      className={cn('rounded-full object-cover', className)}
    />
  )
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-mono text-[13px] tracking-[0.18em] text-ink', className)}>
      EchoMe-AI
    </span>
  )
}

function LinkedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g)
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('http') ? (
          <a
            key={`${part}-${index}`}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
          >
            {part}
          </a>
        ) : (
          <span key={`${index}-${part.slice(0, 12)}`}>{part}</span>
        ),
      )}
    </>
  )
}

function MessageRow({
  message,
  streaming,
}: {
  message: ChatMessage
  streaming: boolean
}) {
  const mine = message.role === 'user'

  if (mine) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl border border-line bg-user px-4 py-2.5 text-[15px] leading-7 text-ink whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    )
  }

  const waiting = streaming && !message.content

  return (
    <div className="flex gap-3">
      <Avatar size={36} alt="" className="mt-1 h-9 w-9 shrink-0 border border-accent/40" />
      <div className="min-w-0 flex-1 font-serif text-[17px] leading-8 text-ink whitespace-pre-wrap">
        {waiting ? (
          <span className="inline-flex items-center gap-1 py-2" aria-label="Preparing a reply">
            <span className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-pulse [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-accent/70 animate-pulse [animation-delay:240ms]" />
          </span>
        ) : (
          <>
            <LinkedText text={message.content} />
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-accent align-middle" />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PathPanel({ pipeline }: { pipeline: PipelineView | null }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-2.5">
        <span className="text-accent">
          <EchoMark size={16} />
        </span>
        <div>
          <Wordmark className="text-sm" />
          <p className="font-mono text-[10px] tracking-[0.18em] text-accent/80 uppercase">Signal path</p>
        </div>
      </div>
      {pipeline ? (
        <>
          <p className="mb-6 text-xs leading-relaxed text-muted">
            Guardrail, cache, retrieval, then the model.
          </p>
          <Pipeline pipeline={pipeline} />
        </>
      ) : (
        <p className="text-sm leading-relaxed text-muted">
          Each answer leaves a path here: guardrail, cache, retrieval, then the model.
        </p>
      )}
    </div>
  )
}

export function ChatPage() {
  const { models, modelId, choose } = useModelChoice()
  const { messages, busy, send, clear } = useChatThread(modelId)
  const [draft, setDraft] = useState('')
  const [pathOpen, setPathOpen] = useState(false)
  const isMobile = useIsMobile()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const empty = messages.length === 0

  useEffect(() => {
    document.title = 'EchoMe-AI'
  }, [])

  useEffect(() => {
    const field = fieldRef.current
    if (!field) return
    field.style.height = '0px'
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`
  }, [draft])

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy && !isMobile && document.activeElement === document.body) {
      fieldRef.current?.focus()
    }
    wasBusy.current = busy
  }, [busy, isMobile])

  const latestPipeline =
    [...messages].reverse().find((message) => message.role === 'assistant')?.pipeline ?? null

  const submit = () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    void send(text)
    if (!isMobile) fieldRef.current?.focus()
  }

  return (
    <div className="chamber fixed inset-0 flex bg-paper text-ink">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3 md:px-5">
          <div className="flex items-center">
            {models.length > 0 && (
              <label className="relative inline-flex items-center">
                <span className="sr-only">Model</span>
                <select
                  value={modelId}
                  disabled={busy || !modelId}
                  onChange={(event) => choose(event.target.value)}
                  aria-label="Model"
                  className="h-9 max-w-[46vw] appearance-none truncate rounded-lg border border-line bg-surface py-0 pr-9 pl-3 text-[12px] text-ink outline-none transition-colors hover:border-accent/50 focus:border-accent/60 disabled:opacity-50 sm:max-w-[13rem]"
                >
                  {models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-3 text-muted"
                  aria-hidden
                />
              </label>
            )}
          </div>
          <h1 className="flex items-center gap-2 px-2">
            <EchoMark size={18} className="text-accent" />
            <Wordmark className="text-[15px]" />
          </h1>
          <div className="flex items-center justify-end gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-ink"
              >
                <Trash2 size={15} />
                <span className="hidden sm:inline">Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setPathOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-white/5 hover:text-ink lg:hidden"
              aria-expanded={pathOpen}
            >
              <PanelRight size={16} />
              Path
            </button>
          </div>
        </header>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto">
          <div
            className={cn(
              'mx-auto flex w-full max-w-[740px] flex-col px-4 md:px-6',
              empty ? 'min-h-full justify-center py-10' : 'gap-6 py-8'
            )}
          >
            {empty && (
              <div className="mx-auto w-full max-w-[680px] text-center">
                <div className="mb-6 flex justify-center">
                  <Avatar
                    size={148}
                    alt="Prashant Dwivedi"
                    className="halo h-36 w-36 border border-accent/50"
                  />
                </div>
                <p className="font-mono text-[11px] tracking-[0.28em] text-accent">EchoMe-AI</p>
                <h2 className="mt-3 font-serif text-[2.1rem] font-normal leading-tight tracking-tight text-ink md:text-[2.6rem]">
                  I am listening.
                </h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted md:text-[15px]">
                  Ask about the work, the stack, and what comes next.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  {STARTERS.map((starter) => (
                    <button
                      key={starter}
                      type="button"
                      disabled={busy}
                      onClick={() => void send(starter)}
                      className="rounded-full border border-line bg-transparent px-3.5 py-2 font-mono text-[12px] tracking-wide text-ink/90 transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-50"
                    >
                      {starter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!empty && (
              <div className="flex flex-col gap-6" aria-live="polite">
                {messages.map((message, index) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    streaming={busy && index === messages.length - 1 && message.role === 'assistant'}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 px-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-2 md:px-6">
          <form
            className="relative mx-auto w-full max-w-[740px] rounded-2xl border border-accent/25 bg-composer shadow-[0_0_0_1px_rgba(127,212,255,0.04),0_18px_50px_rgba(0,0,0,0.35)] transition-colors focus-within:border-accent/60"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <textarea
              id="chat-draft"
              ref={fieldRef}
              aria-label="Message"
              rows={1}
              maxLength={500}
              value={draft}
              placeholder="Speak to EchoMe-AI"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              className="max-h-40 w-full resize-none bg-transparent px-5 pt-4 text-[16px] leading-6 outline-none placeholder:text-muted/80 disabled:opacity-60"
            />
            <div className="flex items-center justify-end px-3 pb-3">
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                onMouseDown={(event) => event.preventDefault()}
                className="grid h-8 w-8 place-items-center rounded-full bg-accent text-[#061018] transition-opacity disabled:bg-white/10 disabled:text-white/30"
                aria-label="Send"
              >
                <ArrowUp size={16} strokeWidth={2.4} />
              </button>
            </div>
          </form>
          <p className="mx-auto mt-2 max-w-[740px] text-center text-[11px] text-muted">
            Answers come from the public notes. They can be wrong.
          </p>
        </div>
      </div>

      <aside className="relative hidden w-[280px] shrink-0 flex-col border-l border-line bg-surface/80 px-5 py-6 lg:flex">
        <PathPanel pipeline={latestPipeline} />
      </aside>

      {pathOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close answer path"
            onClick={() => setPathOpen(false)}
          />
          <aside className="absolute top-0 right-0 flex h-full w-[min(100%,320px)] flex-col border-l border-line bg-surface px-5 py-5 shadow-xl">
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => setPathOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-white/5 hover:text-ink"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <PathPanel pipeline={latestPipeline} />
          </aside>
        </div>
      )}
    </div>
  )
}
