import type { PipelineView, StepStatus } from '@/chat/thread'
import { cn } from '@/utils/cn'

const STEPS = [
  { key: 'guardrail', label: 'Guardrail' },
  { key: 'cache', label: 'Cache' },
  { key: 'retrieval', label: 'Retrieval' },
  { key: 'model', label: 'Model' },
] as const

const STATUS_LABEL: Record<StepStatus, string> = {
  idle: 'Waiting',
  running: 'Running',
  passed: 'Passed',
  blocked: 'Stopped',
  hit: 'Hit',
  miss: 'Miss',
  skipped: 'Skipped',
  waiting: 'Not connected',
}

function dotClass(status: StepStatus) {
  if (status === 'running') return 'bg-accent border-accent'
  if (status === 'passed' || status === 'hit') return 'bg-emerald-300 border-emerald-300'
  if (status === 'blocked') return 'bg-amber-300 border-amber-300'
  if (status === 'waiting' || status === 'miss') return 'bg-slate-400 border-slate-400'
  return 'bg-transparent border-line'
}

function textClass(status: StepStatus) {
  if (status === 'running') return 'text-accent'
  if (status === 'passed' || status === 'hit') return 'text-emerald-200'
  if (status === 'blocked') return 'text-amber-200'
  if (status === 'idle' || status === 'skipped') return 'text-muted'
  return 'text-ink'
}

export function Pipeline({ pipeline }: { pipeline: PipelineView | null }) {
  return (
    <ol className="flex flex-col" aria-label="Answer pipeline">
      {STEPS.map((step, index) => {
        const status = pipeline?.[step.key] ?? 'idle'
        const detail =
          step.key === 'retrieval' && pipeline?.note && status === 'passed'
            ? pipeline.note.file
            : step.key === 'model' && pipeline?.modelDetail
              ? pipeline.modelDetail
              : STATUS_LABEL[status]
        const last = index === STEPS.length - 1

        return (
          <li key={step.key} className="relative pl-8">
            {!last && (
              <span
                className="absolute left-[7px] top-4 bottom-0 w-px bg-line"
                aria-hidden
              />
            )}
            <span
              className={cn(
                'absolute left-0 top-1 h-4 w-4 rounded-full border-2',
                dotClass(status),
                status === 'running' && 'animate-pulse'
              )}
              aria-hidden
            />
            <div className={cn('pb-7', last && 'pb-0')}>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                {step.label}
              </p>
              <p className={cn('mt-1 text-sm leading-snug break-words', textClass(status))}>
                {detail}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
