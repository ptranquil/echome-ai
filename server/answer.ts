import fs from 'node:fs'
import path from 'node:path'
import { areaAnswer, stackOverview } from '../src/chat/areas.ts'
import {
  aiToolsReply,
  companyProjectReply,
  contactReply,
  currentRoleReply,
  dayToDayReply,
  educationReply,
  exploringReply,
  portfolioReply,
  projectReply,
  roleReply,
  toolReply,
} from '../src/chat/facts.ts'
import { earliestRoleReply, resolveFollowUp } from '../src/chat/followUp.ts'
import { parseFixedReplies, type FixedReplyId } from '../src/chat/fixedReplyParse.ts'
import { classifyMessage, greetingReply, normalizeQuestion, rememberedName, visitorNameReply } from '../src/chat/guard.ts'
import { matchNote, type RetrievedNote } from '../src/chat/retrieve.ts'

/**
 * Chat API contract. The browser speaks this, not Gemini's own stream.
 *
 * POST { message, history? }
 * Response: text/event-stream
 *   event: meta    { note, cached, quota? }
 *   event: token   { text }          one chunk of the answer
 *   event: done     { quota? }
 *   event: error    { text }
 *
 * The Gemini key is read on the server. It is never written into the page.
 */

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

interface ChatOptions {
  knowledgeDir: string
  /** Name from the model list, such as ollama, gemini, openai, or grok. */
  provider: string
  /** gemini uses Google's API. Every other provider uses the OpenAI chat format. */
  protocol: 'gemini' | 'openai'
  model: string
  apiKey: string | undefined
  baseUrl: string
  ip: string
}

interface CachedAnswer {
  text: string
  note: RetrievedNote
  model: string
}

const answerCache = new Map<string, CachedAnswer>()
const dailyCounts = new Map<string, { day: string; count: number }>()
const DAILY_MODEL_CALLS = 20

function readText(filePath: string) {
  return fs.readFileSync(filePath, 'utf8')
}

function noteBody(knowledgeDir: string, file: string) {
  const raw = readText(path.join(knowledgeDir, file))
  return raw.replace(/^---[\s\S]*?---\n/, '').trim()
}

const FAMILIARITY =
  /\b(do you know|knowledge of|knowledge|familiar|worked with|have you used|hands-?on|proficien|exposure|comfortable with)\b/i

const STOP_WORDS = new Set([
  'you',
  'your',
  'yours',
  'have',
  'has',
  'had',
  'the',
  'and',
  'with',
  'for',
  'any',
  'some',
  'about',
  'from',
  'this',
  'that',
  'what',
  'which',
  'are',
  'was',
  'were',
  'can',
  'could',
  'would',
  'should',
  'know',
  'knowledge',
  'familiar',
  'worked',
  'used',
  'use',
  'using',
  'experience',
  'hands',
  'handson',
  'proficient',
  'expert',
  'exposure',
  'comfortable',
  'work',
  'working',
  'does',
  'did',
  'who',
  'where',
  'when',
  'why',
  'how',
  'tell',
  'please',
  'now',
])

const TERM_ALIASES: Record<string, string[]> = {
  postgres: ['postgresql'],
  mongo: ['mongodb'],
  node: ['node.js', 'nodejs'],
  express: ['express.js'],
  nest: ['nestjs'],
  js: ['javascript'],
  ts: ['typescript'],
}

function termInText(text: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) return true
  return (TERM_ALIASES[word] ?? []).some((alias) => {
    const aliasPattern = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${aliasPattern}\\b`, 'i').test(text)
  })
}

/** Tools or names in the question that this note actually lists. */
function namedInMemory(message: string, noteText: string) {
  const words = message
    .toLowerCase()
    .replace(/[^a-z0-9.+#\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
  const hits: string[] = []
  for (const word of words) {
    if (!termInText(noteText, word) || hits.includes(word)) continue
    hits.push(word)
  }
  return hits
}

const IDENTITY =
  /\b(who are you|who're you|who r u|who is this|introduce yourself|about yourself)\b/i

/** "Who are you?" is an introduction, not a question about a tool named in the note. */
function identityAnswer(profileBody: string, message: string) {
  if (!IDENTITY.test(message)) return null
  const prose = profileBody.replace(/^#[^\n]*\n+/, '').trim()
  const sentences = prose.match(/[^.!?]+[.!?]+/g) ?? []
  const intro = sentences
    .slice(0, 2)
    .map((sentence) => sentence.trim())
    .join(' ')
  return intro || null
}

function fixedSection(knowledgeDir: string, id: FixedReplyId) {
  return parseFixedReplies(readText(path.join(knowledgeDir, 'replies.md')))[id]
}

function dayKey() {
  return new Date().toISOString().slice(0, 10)
}

function withinBudget(ip: string) {
  const day = dayKey()
  const current = dailyCounts.get(ip)
  if (!current || current.day !== day) {
    dailyCounts.set(ip, { day, count: 1 })
    return true
  }
  if (current.count >= DAILY_MODEL_CALLS) return false
  current.count += 1
  return true
}

function logRoute(route: string, extra: Record<string, string | number | boolean> = {}) {
  console.info(JSON.stringify({ chat: true, route, ...extra }))
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const TOKEN_GAP_MS = 32

function textReply(
  text: string,
  meta: Record<string, unknown>,
  signal?: AbortSignal,
  done: Record<string, unknown> = {},
) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encodeEvent(encoder, 'meta', meta))
        for (const part of text.split(/(\s+)/)) {
          if (signal?.aborted) break
          if (!part) continue
          controller.enqueue(encodeEvent(encoder, 'token', { text: part }))
          if (part.trim()) await wait(TOKEN_GAP_MS, signal)
        }
        if (!signal?.aborted) controller.enqueue(encodeEvent(encoder, 'done', done))
      } catch {
        // The visitor left before the prepared reply finished.
      } finally {
        controller.close()
      }
    },
  })
  return sseResponse(stream)
}

function sseResponse(stream: ReadableStream<Uint8Array>, status = 200) {
  return new Response(stream, {
    status,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

function encodeEvent(encoder: TextEncoder, event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

async function* geminiChunks(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let parsed: {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      }
      try {
        parsed = JSON.parse(payload)
      } catch {
        continue
      }
      const parts = parsed.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        if (part.text) yield part.text
      }
    }
  }
}

/** Drops a reasoning model's <think> block, including when the tag arrives across chunks. */
function createThinkFilter() {
  let pending = ''
  let inThink = false
  return (chunk: string) => {
    pending += chunk
    let visible = ''
    while (pending.length > 0) {
      if (inThink) {
        const end = pending.indexOf('</think>')
        if (end === -1) {
          pending = pending.slice(-8)
          break
        }
        pending = pending.slice(end + '</think>'.length)
        inThink = false
        continue
      }
      const start = pending.indexOf('<think>')
      if (start === -1) {
        const tail = pending.lastIndexOf('<')
        if (tail !== -1 && pending.length - tail < '<think>'.length) {
          visible += pending.slice(0, tail)
          pending = pending.slice(tail)
          break
        }
        visible += pending
        pending = ''
        break
      }
      visible += pending.slice(0, start)
      pending = pending.slice(start + '<think>'.length)
      inThink = true
    }
    return visible
  }
}

async function* ollamaChunks(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  const visible = createThinkFilter()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      let parsed: { choices?: Array<{ delta?: { content?: string } }> }
      try {
        parsed = JSON.parse(payload)
      } catch {
        continue
      }
      const text = parsed.choices?.[0]?.delta?.content
      if (!text) continue
      const shown = visible(text)
      if (shown) yield shown
    }
  }
}

export async function handleChat(
  body: { message?: unknown; history?: unknown },
  options: ChatOptions,
  signal?: AbortSignal,
) {
  const started = Date.now()
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : ''
  if (!message) {
    return Response.json({ error: 'Message is required.' }, { status: 400 })
  }

  const prior = Array.isArray(body.history)
    ? body.history.filter(
        (turn): turn is ChatTurn =>
          !!turn &&
          typeof turn === 'object' &&
          (turn.role === 'user' || turn.role === 'assistant') &&
          typeof turn.content === 'string',
      )
    : []

  const nameAnswer = visitorNameReply(prior, message)
  if (nameAnswer) {
    logRoute('visitor-name', { ms: Date.now() - started })
    return textReply(nameAnswer, { cached: false }, signal)
  }

  const greeting = greetingReply(message, rememberedName(prior))
  if (greeting) {
    logRoute('greeting', { ms: Date.now() - started })
    return textReply(greeting, { cached: false, greeting: true }, signal)
  }

  const earlier = earliestRoleReply(noteBody(options.knowledgeDir, 'career.md'), message, prior)
  if (earlier) {
    logRoute('earliest-role', { ms: Date.now() - started })
    return textReply(earlier, { note: { file: 'career.md', label: 'Companies and what I want next' }, cached: false }, signal)
  }

  const asked = message
  const routed = resolveFollowUp(asked, prior)
  const decision = classifyMessage(routed)
  if (decision === 'off_topic' || decision === 'withheld') {
    const text = fixedSection(options.knowledgeDir, decision)
    logRoute('guardrail', { decision, ms: Date.now() - started })
    return textReply(text, { cached: false, blocked: decision }, signal, { blocked: decision })
  }

  const note = matchNote(routed)
  const profileBody = noteBody(options.knowledgeDir, 'profile.md')
  const intro = identityAnswer(profileBody, routed)
  if (intro) {
    logRoute('intro', { note: 'profile.md', ms: Date.now() - started })
    return textReply(intro, { note: { file: 'profile.md', label: 'Who I am' }, cached: false }, signal)
  }

  const education = educationReply(noteBody(options.knowledgeDir, 'education.md'), routed)
  if (education) {
    logRoute('education', { note: 'education.md', ms: Date.now() - started })
    return textReply(education, { note: { file: 'education.md', label: 'Education' }, cached: false }, signal)
  }

  const role = roleReply(routed, (file) => noteBody(options.knowledgeDir, file))
  if (role) {
    logRoute('role', { note: role.file, ms: Date.now() - started })
    return textReply(role.text, { note: { file: role.file, label: role.label }, cached: false }, signal)
  }

  const contact = contactReply(profileBody, routed)
  if (contact) {
    logRoute('contact', { note: 'profile.md', ms: Date.now() - started })
    return textReply(contact, { note: { file: 'profile.md', label: 'Who I am' }, cached: false }, signal)
  }

  const portfolio = portfolioReply(routed)
  if (portfolio) {
    logRoute('portfolio', { note: 'profile.md', ms: Date.now() - started })
    return textReply(portfolio, { note: { file: 'profile.md', label: 'Who I am' }, cached: false }, signal)
  }

  const exploring = exploringReply(noteBody(options.knowledgeDir, 'ai.md'), routed)
  if (exploring) {
    logRoute('exploring', { note: 'ai.md', ms: Date.now() - started })
    return textReply(exploring, { note: { file: 'ai.md', label: 'How I use AI' }, cached: false }, signal)
  }

  const project = projectReply(noteBody(options.knowledgeDir, 'projects.md'), routed)
  if (project) {
    logRoute('project', { note: 'projects.md', ms: Date.now() - started })
    return textReply(project, { note: { file: 'projects.md', label: 'Projects' }, cached: false }, signal)
  }

  const companyProject = companyProjectReply(noteBody(options.knowledgeDir, 'projects.md'), routed)
  if (companyProject) {
    logRoute('company-project', { ms: Date.now() - started })
    return textReply(companyProject, { note: { file: 'projects.md', label: 'Projects' }, cached: false }, signal)
  }

  const currentRole = currentRoleReply(noteBody(options.knowledgeDir, 'experience-rigved.md'), routed)
  if (currentRole) {
    logRoute('current-role', { note: 'experience-rigved.md', ms: Date.now() - started })
    return textReply(currentRole, { note: { file: 'experience-rigved.md', label: 'Current role at Rigved' }, cached: false }, signal)
  }

  const dayToDay = dayToDayReply(noteBody(options.knowledgeDir, 'experience-rigved.md'), routed)
  if (dayToDay) {
    logRoute('day-to-day', { note: 'experience-rigved.md', ms: Date.now() - started })
    return textReply(dayToDay, { note: { file: 'experience-rigved.md', label: 'Current role at Rigved' }, cached: false }, signal)
  }

  const aiTools = aiToolsReply(noteBody(options.knowledgeDir, 'ai.md'), routed)
  if (aiTools) {
    logRoute('ai-tools', { note: 'ai.md', ms: Date.now() - started })
    return textReply(aiTools, { note: { file: 'ai.md', label: 'How I use AI' }, cached: false }, signal)
  }

  if (note.file === 'skills.md') {
    const skillsBody = noteBody(options.knowledgeDir, 'skills.md')
    const namedTool = namedInMemory(routed, skillsBody).some(
      (word) => !/^(stack|skills?|technolog(?:y|ies)|tools|front|end|back)$/i.test(word),
    )
    const direct = areaAnswer(skillsBody, routed) ?? (namedTool ? null : stackOverview(skillsBody, routed))
    if (direct) {
      logRoute('area', { note: note.file, ms: Date.now() - started })
      return textReply(direct, { note, cached: false }, signal)
    }
  }

  const knownNotes = fs
    .readdirSync(options.knowledgeDir)
    .filter((file) => file.endsWith('.md') && !file.startsWith('replies') && file !== 'policy.md')
    .map((file) => ({ file, body: noteBody(options.knowledgeDir, file) }))
  const tool = toolReply(knownNotes, routed, fixedSection(options.knowledgeDir, 'unknown'))
  if (tool) {
    logRoute('tool', { ms: Date.now() - started })
    return textReply(tool, { note, cached: false }, signal)
  }

  const localModel = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(options.baseUrl)
  const modelLabel = `${options.provider} · ${options.model}`
  const followUp = routed !== asked
  const cacheKey = `replies-v2:${options.provider}:${options.model}:${normalizeQuestion(asked)}`
  const cached = followUp ? undefined : answerCache.get(cacheKey)
  if (cached) {
    logRoute('cache', { note: cached.note.file, ms: Date.now() - started })
    return textReply(cached.text, { note: cached.note, cached: true, model: cached.model }, signal)
  }

  const quotaText = fixedSection(options.knowledgeDir, 'quota')
  const apiKey = options.apiKey
  const needsKey = options.protocol === 'gemini' || !localModel
  if (needsKey && !apiKey) {
    logRoute('missing-key', { note: note.file, ms: Date.now() - started })
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeEvent(encoder, 'meta', { note, cached: false }))
        controller.enqueue(
          encodeEvent(encoder, 'error', {
            text:
              options.protocol === 'gemini'
                ? 'The Gemini key is not on the server. Add GEMINI_API_KEY to a .env file in the project root and restart the dev server. The page never sees that key.'
                : `The ${options.provider} key is not on the server. Set apiKeyEnv for that model, add the key to .env, and restart. The page never sees that key.`,
          }),
        )
        controller.close()
      },
    })
    return sseResponse(stream)
  }

  if (options.protocol === 'gemini' && !withinBudget(options.ip)) {
    logRoute('budget', { ms: Date.now() - started })
    return textReply(quotaText, { note, cached: false, quota: true }, signal, { quota: true })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encodeEvent(encoder, event, data))
      }
      try {
        send('meta', { note, cached: false, model: modelLabel })
        const policy = readText(path.join(options.knowledgeDir, 'policy.md'))
        const noteText = noteBody(options.knowledgeDir, note.file)
        const history = Array.isArray(body.history) ? body.history : []
        const prior = history
          .filter(
            (turn): turn is ChatTurn =>
              !!turn &&
              typeof turn === 'object' &&
              (turn.role === 'user' || turn.role === 'assistant') &&
              typeof turn.content === 'string' &&
              turn.content.trim().length > 0,
          )
          .slice(-6)
          .map((turn) => ({
            role: turn.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: turn.content.slice(0, 500) }],
          }))

        const asksIntro = /\b(who|about|intro|yourself)\b/i.test(routed)
        const asksFuture = /looking for|looking ahead|next role|what do you want|future|ahead/i.test(routed)
        const introLine =
          note.file === 'profile.md' && asksIntro
            ? ' This is an introduction. Start with your name and role. Mention building applications with AI as part of that, not as "I have worked with AI."'
            : note.file === 'career.md' && asksFuture
              ? ' Include that you build applications with AI and want that aimed at real problems. Say it once.'
              : ''
        const named = namedInMemory(routed, noteText)
        const asksWholeStack =
          note.file === 'skills.md' &&
          /\b(stack|skills?|technolog(?:y|ies)|tools)\b/i.test(routed) &&
          named.filter((word) => !/^(stack|skills?|technolog(?:y|ies)|tools)$/i.test(word)).length === 0
        const asksFamiliarity = FAMILIARITY.test(routed)
        const answerShape = asksWholeStack
          ? ' This is a whole-stack question, so skip the two-sentence cap and name the whole stack. Three short sentences, in this order: MERN and MEAN first, then cloud and delivery, then the other tools. Say the words MERN and MEAN. Do not open with only JavaScript and TypeScript, and do not say "a variety of tools."'
          : named.length > 0 && asksFamiliarity
            ? ` They are asking whether you know ${named.join(' and ')}. Say only: Yes. I use ${named.join(' and ')}. Do not open with a long tool list.`
            : asksFamiliarity
              ? ` The memory does not name what they asked about. Say only: ${fixedSection(options.knowledgeDir, 'unknown')} Do not claim you have worked with it.`
              : ' Two short sentences.'
        const unknown = fixedSection(options.knowledgeDir, 'unknown')
        const instructions = `${policy}\n\nMemory:\n${noteText}\n\nAnswer as Prashant, in the first person. Use only the memory that answers this question. Answer the latest question only. If the message opens with a greeting and also asks something, answer the greeting in a few words, then answer the question. Do not repeat a tool from an earlier reply when this question asks about something else. ${answerShape}${introLine} Do not add other tools, companies, or projects. If the memory does not name it, say: ${unknown}`
        let full = ''

        if (options.protocol === 'openai') {
          const base = options.baseUrl.replace(/\/$/, '')
          const chatUrl = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
          const headers: Record<string, string> = { 'Content-Type': 'application/json' }
          if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`
          const ollama = await fetch(chatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              model: options.model,
              stream: true,
              temperature: 0.2,
              // Reasoning models spend this budget before the visible answer. 120 ends inside the think step.
              max_tokens: 800,
              ...(options.provider === 'ollama' ? { think: false } : {}),
              ...(options.provider === 'groq' ? { reasoning_effort: 'low', reasoning_format: 'hidden' } : {}),
              messages: [
                { role: 'system', content: instructions },
                ...prior.map((turn) => ({
                  role: turn.role === 'model' ? 'assistant' : 'user',
                  content: turn.parts[0]?.text ?? '',
                })),
                { role: 'user', content: routed },
              ],
            }),
            signal,
          })
          if (!ollama.ok) {
            logRoute('openai-error', {
              status: ollama.status,
              provider: options.provider,
              model: options.model,
              note: note.file,
              ms: Date.now() - started,
            })
            send('error', {
              text:
                ollama.status === 404
                  ? options.provider === 'ollama'
                    ? `Ollama does not have ${options.model}. Pull that model, or pick another one from the list.`
                    : `${options.provider} does not have a model named ${options.model}.`
                  : options.provider === 'ollama'
                    ? 'Ollama refused the request. Check that it is running, then ask again.'
                    : `${options.provider} refused the request. Check the base URL and key, then ask again.`,
            })
            return
          }
          for await (const chunk of ollamaChunks(ollama)) {
            full += chunk
            send('token', { text: chunk })
          }
          if (full.trim() && !followUp) answerCache.set(cacheKey, { text: full, note, model: modelLabel })
          logRoute('model', {
            provider: options.provider,
            note: note.file,
            model: options.model,
            ms: Date.now() - started,
            chars: full.length,
            stream: true,
          })
          send('done', {})
          return
        }

        const requestBody = {
          systemInstruction: {
            parts: [{ text: instructions }],
          },
          contents: [...prior, { role: 'user', parts: [{ text: routed }] }],
          generationConfig: {
            maxOutputTokens: 160,
            temperature: 0.4,
            // Lite models can think for a long time before the first word. This chat should answer immediately.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }
        const headers = {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey ?? '',
        }
        const geminiRoot = options.baseUrl.replace(/\/$/, '').replace(/\/models$/i, '')
        if (!geminiRoot) {
          send('error', { text: 'This model has no base URL. Set baseUrl for it in models.json.' })
          return
        }
        const modelUrl = `${geminiRoot}/models/${options.model}`

        const postGemini = (path: string) =>
          fetch(`${modelUrl}:${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody),
            signal,
          })

        let gemini = await postGemini('streamGenerateContent?alt=sse')
        if (!gemini.ok && (gemini.status === 503 || gemini.status === 500)) {
          await gemini.arrayBuffer().catch(() => undefined)
          logRoute('gemini-retry', {
            status: gemini.status,
            model: options.model,
            note: note.file,
            ms: Date.now() - started,
          })
          await wait(700, signal)
          gemini = await postGemini('streamGenerateContent?alt=sse')
        }

        if (!gemini.ok) {
          const errBody = await gemini.text()
          const quota = gemini.status === 429 || errBody.includes('RESOURCE_EXHAUSTED')
          logRoute(quota ? 'quota' : 'gemini-error', {
            status: gemini.status,
            model: options.model,
            note: note.file,
            ms: Date.now() - started,
          })
          if (quota) {
            send('token', { text: quotaText })
            send('done', { quota: true })
            return
          }

          if (gemini.status === 404 || gemini.status === 503 || gemini.status === 500) {
            const plain = await fetch(`${modelUrl}:generateContent`, {
              method: 'POST',
              headers,
              body: JSON.stringify(requestBody),
              signal,
            })
            if (plain.ok) {
              const json = (await plain.json()) as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
              }
              const text = (json.candidates?.[0]?.content?.parts ?? [])
                .map((part) => part.text ?? '')
                .join('')
              if (text.trim()) {
                full = text
                send('token', { text })
                if (!followUp) answerCache.set(cacheKey, { text, note, model: modelLabel })
                logRoute('model', {
                  note: note.file,
                  model: options.model,
                  ms: Date.now() - started,
                  chars: text.length,
                  stream: false,
                })
                send('done', {})
                return
              }
            }
          }

          send('error', {
            text:
              gemini.status === 404
                ? `Gemini does not have a model named ${options.model}. The id has to match one from AI Studio, such as gemini-2.5-flash-lite.`
                : gemini.status === 503 || gemini.status === 500
                  ? 'Gemini is busy right now. Ask once more in a moment.'
                  : 'Gemini could not answer just now. Try that question again in a moment.',
          })
          return
        }

        for await (const chunk of geminiChunks(gemini)) {
          full += chunk
          send('token', { text: chunk })
        }
        if (full.trim() && !followUp) {
          answerCache.set(cacheKey, { text: full, note, model: modelLabel })
        }
        logRoute('model', {
          note: note.file,
          model: options.model,
          ms: Date.now() - started,
          chars: full.length,
          stream: true,
        })
        send('done', {})
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        if (name === 'AbortError') return
        if (name === 'TimeoutError') {
          logRoute('timeout', { provider: options.provider, model: options.model, ms: Date.now() - started })
          send('error', {
            text:
              localModel
                ? 'The local model took too long to start. Ask once more.'
                : options.protocol === 'gemini'
                  ? 'Gemini did not start answering in time, so I stopped the call. Ask once more.'
                  : 'The model did not start answering in time. Ask once more.',
          })
          return
        }
        logRoute('failed', { provider: options.provider, model: options.model, ms: Date.now() - started, error: name || 'unknown' })
        send('error', {
          text:
            localModel
              ? 'Ollama did not answer. Confirm it is running on port 11434, then ask again.'
              : 'The model call stopped before an answer came back.',
        })
      } finally {
        controller.close()
      }
    },
  })

  return sseResponse(stream)
}
