import fs from 'node:fs'
import path from 'node:path'

export type ModelProtocol = 'openai' | 'gemini'

export interface PublicModel {
  id: string
  label: string
  provider: string
}

export interface ResolvedModel extends PublicModel {
  /** gemini uses Google's API. Everything else speaks the OpenAI chat format. */
  protocol: ModelProtocol
  model: string
  baseUrl: string
  apiKey?: string
}

interface ModelFileEntry {
  id?: unknown
  label?: unknown
  provider?: unknown
  model?: unknown
  baseUrl?: unknown
  apiKey?: unknown
  apiKeyEnv?: unknown
  protocol?: unknown
  default?: unknown
}

export interface ModelFallback {
  provider: string
  model: string
  apiKey: string | undefined
  ollamaBaseUrl: string
}

const DEFAULT_OLLAMA = 'http://localhost:11434/v1'

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function protocolFor(entry: ModelFileEntry, baseUrl: string): ModelProtocol {
  // OpenRouter serves many models through one OpenAI-style URL.
  if (/openrouter\.ai/i.test(baseUrl)) return 'openai'
  const explicit = asString(entry.protocol)
  if (explicit === 'gemini' || explicit === 'openai') return explicit
  return asString(entry.provider) === 'gemini' ? 'gemini' : 'openai'
}

function readEntries(root: string): { entries: ModelFileEntry[]; defaultId: string } | null {
  const local = path.join(root, 'models.json')
  const example = path.join(root, 'models.example.json')
  const file = fs.existsSync(local) ? local : fs.existsSync(example) ? example : ''
  if (!file) return null
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(parsed)) return null
    const marked = parsed.find((entry) => !!entry && typeof entry === 'object' && (entry as ModelFileEntry).default === true) as
      | ModelFileEntry
      | undefined
    return { entries: parsed as ModelFileEntry[], defaultId: asString(marked?.id) }
  } catch {
    return null
  }
}

/** Public list for the picker, plus the resolved config the server uses. Keys stay here. */
export function loadModels(root: string, env: Record<string, string | undefined>, fallback: ModelFallback) {
  const fromFile = readEntries(root)
  const resolved: ResolvedModel[] = []

  for (const entry of fromFile?.entries ?? []) {
    const id = asString(entry.id)
    const model = asString(entry.model)
    const provider = asString(entry.provider)
    const baseUrl = asString(entry.baseUrl) || (provider === 'ollama' ? env.OLLAMA_BASE_URL || DEFAULT_OLLAMA : '')
    const protocol = protocolFor(entry, baseUrl)
    if (!id || !model || !provider || !baseUrl || resolved.some((item) => item.id === id)) continue
    const apiKeyEnv = asString(entry.apiKeyEnv)
    const apiKey = asString(entry.apiKey) || (apiKeyEnv ? env[apiKeyEnv] : undefined) || (provider === 'gemini' ? env.GEMINI_API_KEY : undefined)
    resolved.push({
      id,
      label: asString(entry.label) || model,
      provider,
      protocol,
      model,
      baseUrl,
      apiKey: apiKey || undefined,
    })
  }

  if (resolved.length === 0) {
    resolved.push({
      id: 'default',
      label: fallback.model,
      provider: fallback.provider,
      protocol: fallback.provider === 'gemini' ? 'gemini' : 'openai',
      model: fallback.model,
      baseUrl: fallback.provider === 'ollama' ? fallback.ollamaBaseUrl : '',
      apiKey: fallback.apiKey,
    })
  }

  const defaultId = resolved.some((item) => item.id === fromFile?.defaultId) ? fromFile!.defaultId : resolved[0]!.id
  return { models: resolved, defaultId }
}

export function pickModel(models: ResolvedModel[], requested: unknown, defaultId: string) {
  if (typeof requested === 'string' && requested.trim()) {
    return models.find((item) => item.id === requested.trim()) ?? null
  }
  return models.find((item) => item.id === defaultId) ?? models[0] ?? null
}
