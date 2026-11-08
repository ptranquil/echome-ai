import { canonicalize } from './facts.ts'

export interface SpokenTurn {
  role: string
  content: string
}

const COMPANY = [
  { test: /\b(rigved|isite)\b/i, name: 'Rigved', before: 'Route Mobile' },
  { test: /route mobile/i, name: 'Route Mobile', before: 'Synergy' },
  { test: /\bsynergy\b/i, name: 'Synergy', before: null },
] as const

const PROJECT = [
  { test: /\bondc\b|\bbeckn\b/i, name: 'ONDC' },
  { test: /\bshopify\b/i, name: 'Shopify' },
  { test: /\bserverless\b|\blambda\b/i, name: 'the AWS serverless migration' },
  { test: /\bfleet\b|\btracking dashboard\b|\breal-time tracking\b/i, name: 'the real-time tracking dashboard' },
  { test: /\benterprise workforce\b|\boperations platform\b/i, name: 'the enterprise workforce platform' },
]

const TOOL =
  /\b(graphql|kubernetes|python|react|angular|node|typescript|javascript|docker|aws|gcp|firebase|cypress|redis|rabbitmq|mysql|mongodb|postgresql|postgres|dynamodb|firestore|bigquery|ionic|capacitor|nestjs|express|php|java|ollama|cursor|claude|chatgpt|grok)\b/i

function latestCompany(history: SpokenTurn[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const text = canonicalize(history[index]?.content ?? '')
    const found = COMPANY.find((item) => item.test.test(text))
    if (found) return found
  }
  return null
}

function latestProject(history: SpokenTurn[]) {
  const recent = history.slice(-2)
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const found = PROJECT.find((item) => item.test.test(recent[index]?.content ?? ''))
    if (found) return found
  }
  return null
}

function previousUser(history: SpokenTurn[]) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index]?.role === 'user') return history[index]?.content ?? ''
  }
  return ''
}

function alreadySpecific(text: string) {
  return (
    COMPANY.some((item) => item.test.test(text)) ||
    PROJECT.some((item) => item.test.test(text)) ||
    /\b(college|cgpi|cgpa|qualification|percentage|degree|email|linkedin|github)\b/i.test(text)
  )
}

/**
 * A short follow-up keeps the last company, project, or tool.
 * The visitor's words stay in the thread. Routing uses the filled-in question.
 */
export function resolveFollowUp(message: string, history: SpokenTurn[]) {
  const raw = message.trim()
  if (!raw || history.length === 0) return raw
  const text = canonicalize(raw)
  if (alreadySpecific(text)) return raw

  const company = latestCompany(history)
  const before = /\b(before that|before this|previous (?:company|role|job)|one before|prior (?:company|role))\b/i.test(text)
  if (before) {
    if (!company) return raw
    if (company.before) return `What about ${company.before}?`
    return 'What is your earliest role?'
  }

  if (company && /\b(there|that company|that role|that job|that time|that period|back then)\b/i.test(text)) {
    if (/\bstack\b/i.test(text)) return `What stack do you use at ${company.name}?`
    if (/\bprojects?\b/i.test(text)) return `What projects came out of ${company.name}?`
    if (/\b(build|built|did|do|work)\b/i.test(text)) return `What did you work on at ${company.name}?`
    return `What about ${company.name}?`
  }

  const project = latestProject(history)
  if (project && /\b(was that|that one|that project|about that)\b/i.test(text)) {
    if (/\bstack\b/i.test(text)) return `What stack did ${project.name} use?`
    return `Tell me about ${project.name}`
  }

  const tool = previousUser(history).match(TOOL)?.[0]
  if (tool && /\b(use|used|using) it\b/i.test(text)) return text.replace(/\bit\b/i, tool)

  if (/^(which|what) tools\??$/i.test(text)) {
    const prior = `${previousUser(history)} ${history.at(-1)?.content ?? ''}`
    if (/\b(ai|chatgpt|claude|cursor|ollama|grok)\b/i.test(prior)) return 'Which AI tools do you use?'
    if (company) return `What stack do you use at ${company.name}?`
  }

  if (/^(tell me more|go on|elaborate|more details)\??$/i.test(text)) {
    if (project) return `Tell me about ${project.name}`
    if (company) return `What did you work on at ${company.name}?`
  }

  return raw
}

/** "And before that?" once the chat is already on the earliest written role. */
export function earliestRoleReply(careerBody: string, message: string, history: SpokenTurn[]) {
  const text = canonicalize(message)
  if (!/\b(before that|before this|previous (?:company|role|job)|one before)\b/i.test(text)) return null
  const company = latestCompany(history)
  if (!company || company.before) return null
  const line = careerBody
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('Companies:'))
  const earliest = line?.match(/^Companies:\s*(.+?),\s*([A-Z][a-z]+ \d{4})\b/)
  if (!earliest?.[1] || !earliest[2]) return null
  return `${earliest[1].trim()}, starting ${earliest[2]}, is the earliest role I have written down.`
}
