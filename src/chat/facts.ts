import { homeHref } from './paths.ts'

/** Spellings that should hit the same note: RouteMobile, linked in, and so on. */
export function canonicalize(text: string) {
  return text
    .replace(/route[\s-]*mobile/gi, 'route mobile')
    .replace(/linked[\s-]*in/gi, 'linkedin')
}

const ROLES: Array<{ test: RegExp; place: string; file: string; label: string }> = [
  { test: /\bisite\b|\brigved\b/i, place: 'iSITE', file: 'experience-rigved.md', label: 'Current role at Rigved' },
  { test: /route mobile/i, place: 'Route Mobile', file: 'experience-route-mobile.md', label: 'Route Mobile' },
  { test: /\bsynergy\b/i, place: 'Synergy', file: 'experience-synergy.md', label: 'Synergy' },
]

const ASKS_EDUCATION =
  /\b(qualification|education|degree|college|university|bhavans|cgpi|cgpa|percentage|marks|gpa|score|grade|b\.?\s*sc)\b/i
const ASKS_SCORE = /\b(cgpi|cgpa|percentage|marks|gpa|score|grade)\b/i
const ASKS_STACK = /\b(stack|tech stack|technologies|tools)\b/i
const ASKS_DATES = /\b(join(?:ed)?|leave|left|when did|from when|till when|until when|tenure)\b/i
const ASKS_ABOUT = /\bwhat about\b|\btell me about\b/i
const ASKS_WORK = /\b(build|built|building|work(?:ed|ing)? on|did there|responsib)\b/i
const ASKS_PROJECTS = /\bprojects?\b/i

function employmentLine(body: string) {
  return (
    body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^I (am|was) a /.test(line))
      ?.replace(/\.$/, '') ?? null
  )
}

function stackList(body: string) {
  const line = body
    .split('\n')
    .map((item) => item.trim())
    .find((item) => /^stack\b/i.test(item))
  if (!line) return null
  return line.replace(/^stack(?:\s+on this role)?\s*:\s*/i, '').replace(/\.$/, '')
}

export function educationReply(body: string, message: string) {
  if (!ASKS_EDUCATION.test(message)) return null
  const degree = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('I did'))
    ?.replace(/\.$/, '')
  const dates = body.match(/[A-Z][a-z]+ \d{4} to [A-Z][a-z]+ \d{4}/)?.[0]
  const cgpi = body.match(/CGPI\s+(\d+(?:\.\d+)?)/i)?.[1]
  if (!degree) return null
  if (ASKS_SCORE.test(message) && cgpi) {
    const lead = /\bpercentage\b/i.test(message)
      ? `It is recorded as a CGPI of ${cgpi}, not a percentage`
      : `My CGPI was ${cgpi}`
    return `${lead}, for the B.Sc. in Information Technology at Bhavans College, Mumbai.`
  }
  return `${degree}${dates ? `, from ${dates}` : ''}${cgpi ? `, with a CGPI of ${cgpi}` : ''}.`
}

export function contactReply(body: string, message: string) {
  message = canonicalize(message)
  const want = [
    { test: /\blinkedin\b/i, label: 'LinkedIn' },
    { test: /\bgithub\b/i, label: 'GitHub' },
    { test: /\bemail\b/i, label: 'email' },
  ].filter((item) => item.test.test(message))
  if (!want.length) return null

  const parts = want
    .map((item) => {
      const line = body.split('\n').find((row) => new RegExp(item.label, 'i').test(row))
      const url = line?.match(/https?:\/\/\S+/)?.[0]
      const email = line?.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0]
      const value = url ?? email
      if (!value) return null
      return `My ${item.label} is ${value}`
    })
    .filter((part): part is string => !!part)

  if (!parts.length) return null
  return `${parts.join('. ')}.`
}

const ASKS_EXPLORING =
  /\bwhat (?:are|r) you (?:currently |now |these days |right now )?exploring\b|\bwhat are you exploring (?:currently|now|these days|right now)\b|\bwhat have you been exploring\b|\bcurrently exploring\b/i

/** Open question about what he is exploring now, not a named tool. */
export function exploringReply(body: string, message: string) {
  if (!ASKS_EXPLORING.test(message)) return null
  const line = body
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('Currently exploring:'))
  if (!line) return null
  return line.replace(/^Currently exploring:\s*/, '')
}

/** The portfolio is a separate site. Answer with the real URL, not a placeholder. */
export function portfolioReply(message: string) {
  if (!/\bportfolio\b/i.test(message)) return null
  const asksWhere =
    /\b(url|link|site|website|address)\b/i.test(message) ||
    /\bwhere\b/i.test(message) ||
    /\bwhat(?:'s| is) (?:your|the) portfolio\b/i.test(message)
  if (!asksWhere) return null
  return `You can find my portfolio at this link: ${homeHref()}`
}

function workDetail(body: string) {
  const bullet = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('- '))
  if (!bullet) return null
  const detail = bullet.replace(/^- /, '').replace(/\.$/, '')
  return detail.charAt(0).toLowerCase() + detail.slice(1)
}

function projectStory(body: string) {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const stories = lines.find((line) => /project stories/i.test(line))
  if (stories) return stories.split(/(?<=\.)\s+/)[0] ?? null
  const portfolio = lines.find((line) => /portfolio the case study/i.test(line))
  return portfolio ?? null
}

function bareCompany(message: string, company: RegExp) {
  const stripped = message
    .replace(company, ' ')
    .replace(/\b(what|about|tell|me|the|your|you|please|there|is|of|a)\b/gi, ' ')
    .replace(/[^a-z]/gi, '')
    .trim()
  return stripped.length === 0
}

/** Role dates, "what about <company>", and the stack used on that role. */
export function roleReply(message: string, readRole: (file: string) => string) {
  message = canonicalize(message)
  const role = ROLES.find((item) => item.test.test(message))
  if (!role) return null
  const body = readRole(role.file)
  const asksStack = ASKS_STACK.test(message)
  const asksWork = ASKS_WORK.test(message)
  const asksProjects = ASKS_PROJECTS.test(message)
  const asksDates = ASKS_DATES.test(message)
  const asksAbout = ASKS_ABOUT.test(message) || bareCompany(message, role.test)
  if (!asksStack && !asksWork && !asksProjects && !asksDates && !asksAbout) return null

  const reply = (text: string) => ({ text, file: role.file, label: role.label })

  if (asksStack) {
    const tools = stackList(body)
    if (!tools) return null
    return reply(`On ${role.place} I use ${tools}.`)
  }

  if (asksWork) {
    const detail = workDetail(body)
    if (!detail) return null
    return reply(`On ${role.place} I work on ${detail}.`)
  }

  if (asksProjects) {
    const story = projectStory(body)
    if (!story) return null
    return reply(story.endsWith('.') ? story : `${story}.`)
  }

  const line = employmentLine(body)
  if (!line) return null
  return reply(`${line}.`)
}

const PROJECT_SECTIONS: Array<{ test: RegExp; heading: RegExp }> = [
  { test: /\bondc\b|\bbeckn\b/i, heading: /ondc/i },
  { test: /\bshopify\b/i, heading: /shopify/i },
  { test: /\bserverless\b|\blambda\b/i, heading: /serverless/i },
  { test: /\bfleet\b|\btracking dashboard\b|\breal-time tracking\b/i, heading: /tracking/i },
  { test: /\benterprise workforce\b|\boperations platform\b/i, heading: /enterprise workforce/i },
]

/** A named portfolio project, or the project a company note points at. */
export function projectReply(body: string, message: string) {
  const section = body.split(/\n(?=## )/).find((part) => {
    const title = part.split('\n')[0] ?? ''
    return PROJECT_SECTIONS.some((item) => item.test.test(message) && item.heading.test(title))
  })
  if (!section) return null
  const title = (section.split('\n')[0] ?? '').replace(/^#+\s*/, '').trim()
  if (ASKS_STACK.test(message)) {
    const tools = stackList(section)
    if (tools) return `On the ${title} I use ${tools}.`
  }
  const prose = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !/^stack:/i.test(line) && !line.startsWith('When someone'))
  const sentences = prose.flatMap((line) => line.match(/[^.!?]+[.!?]+/g) ?? [line])
  if (!sentences.length) return null
  return sentences.slice(0, 2).join(' ').trim()
}

/** Projects named from a company, when that company's note does not list them itself. */
export function companyProjectReply(projectsBody: string, message: string) {
  message = canonicalize(message)
  if (!ASKS_PROJECTS.test(message)) return null
  const role = ROLES.find((item) => item.test.test(message))
  if (!role) return null
  const section = projectsBody.split(/\n(?=## )/).find((part) => role.test.test(part))
  if (!section) return null
  const prose = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !/^stack:/i.test(line))
  return prose[0] ?? null
}

/** "Where do you work now?" is the current role line, including the start date. */
export function currentRoleReply(body: string, message: string) {
  if (!/\b(where do you work|current (?:job|role|company)|who do you work for)\b/i.test(message)) return null
  const line = employmentLine(body)
  return line ? `${line}.` : null
}

/** Day to day is the current iSITE role, not the general introduction. */
export function dayToDayReply(body: string, message: string) {
  if (!/\bday[\s-]to[\s-]day\b/i.test(message)) return null
  const role = ROLES[0]
  if (!role) return null
  const line = employmentLine(body)
  const detail = workDetail(body)
  if (!line || !detail) return null
  return `${line}. On ${role.place} I work on ${detail}.`
}

const FAMILIARITY =
  /\b(do you know|do you use|have you (?:used|explored)|knowledge of|familiar with|worked with|hands-?on)\b/i
const WHERE_USED = /\bwhere (?:did|do) you (?:use|used)\b/i
const TOOL_SKIP = new Set([
  'about',
  'ai',
  'and',
  'any',
  'are',
  'backend',
  'been',
  'can',
  'cloud',
  'company',
  'could',
  'currently',
  'daily',
  'data',
  'day',
  'did',
  'does',
  'don',
  'dont',
  'every',
  'experience',
  'explored',
  'exploring',
  'familiar',
  'for',
  'from',
  'frontend',
  'had',
  'hands',
  'has',
  'have',
  'how',
  'into',
  'know',
  'knowledge',
  'mobile',
  'more',
  'not',
  'now',
  'please',
  'project',
  'projects',
  'really',
  'right',
  'role',
  'should',
  'some',
  'stack',
  'tell',
  'that',
  'the',
  'there',
  'this',
  'tool',
  'tools',
  'use',
  'used',
  'using',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'work',
  'worked',
  'working',
  'would',
  'you',
  'your',
  'yours',
])

const TOOL_ALIASES: Record<string, string[]> = {
  postgres: ['postgresql'],
  mongo: ['mongodb'],
  node: ['node.js', 'nodejs'],
  express: ['express.js'],
  nest: ['nestjs'],
  js: ['javascript'],
  ts: ['typescript'],
}

function toolMentioned(corpus: string, word: string) {
  const names = [word, ...(TOOL_ALIASES[word] ?? [])]
  return names.some((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(corpus))
}

function toolLabel(corpus: string, word: string) {
  for (const name of [word, ...(TOOL_ALIASES[word] ?? [])]) {
    const found = corpus.match(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'))
    if (found?.[0]) return found[0]
  }
  return word
}

function toolWords(message: string) {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9.+#\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !TOOL_SKIP.has(word))
}

const TOOL_PLACE: Record<string, string> = {
  'experience-rigved.md': 'iSITE',
  'experience-route-mobile.md': 'Route Mobile',
  'experience-synergy.md': 'Synergy',
}

/** Yes only when a note names the tool. A missing tool stays the unknown line. */
export function toolReply(
  notes: Array<{ file: string; body: string }>,
  message: string,
  unknown: string,
) {
  const asking = FAMILIARITY.test(message) || WHERE_USED.test(message)
  if (!asking || /\bwhat are you exploring\b/i.test(message)) return null
  const words = toolWords(message)
  if (!words.length) return null
  const corpus = notes.map((note) => note.body).join('\n')
  const known = words.filter((word) => toolMentioned(corpus, word))
  const missing = words.filter((word) => !toolMentioned(corpus, word))
  if (!known.length) return unknown
  const labels = known.map((word) => toolLabel(corpus, word))
  if (!WHERE_USED.test(message)) {
    const yes = `Yes. I use ${labels.join(' and ')}.`
    if (!missing.length) return yes
    return `${yes} ${unknown}`
  }

  const places: string[] = []
  for (const note of notes) {
    const place = TOOL_PLACE[note.file]
    if (place && known.some((word) => toolMentioned(note.body, word))) places.push(place)
    if (note.file !== 'projects.md') continue
    for (const section of note.body.split(/\n(?=## )/)) {
      if (!known.some((word) => toolMentioned(section, word))) continue
      const title = (section.split('\n')[0] ?? '').replace(/^#+\s*/, '').trim()
      if (title) places.push(`the ${title}`)
    }
  }
  const unique = places.filter((place, index) => places.indexOf(place) === index)
  if (!unique.length) return `Yes. I use ${labels.join(' and ')}.`
  if (unique.length === 1) return `I use ${labels.join(' and ')} on ${unique[0]}.`
  const last = unique[unique.length - 1]
  return `I use ${labels.join(' and ')} on ${unique.slice(0, -1).join(', ')} and on ${last}.`
}

/** The AI tool list, including a follow-up that only says "which tools?". */
export function aiToolsReply(body: string, message: string) {
  if (!/\b(which|what) (?:ai )?tools\b/i.test(message)) return null
  if (/\btools\b/i.test(message) && !/\bai\b/i.test(message) && !/\b(chatgpt|claude|cursor|ollama|grok)\b/i.test(message)) {
    return null
  }
  const line = body
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith('Tools I use:'))
  if (!line) return null
  const sentence = line.replace(/^Tools I use:\s*/, 'I use ')
  return sentence.endsWith('.') ? sentence : `${sentence}.`
}
