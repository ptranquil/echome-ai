import { matchedAreas } from './areas.ts'
import { canonicalize } from './facts.ts'

export type GuardDecision = 'withheld' | 'off_topic' | 'on_topic'

const WITHHELD = [
  /salar/i,
  /\bctc\b/i,
  /compensat/i,
  /notice period/i,
  /last working day/i,
  /\bvisa\b/i,
  /work authorization/i,
  /\bh-?1b\b/i,
  /relocat/i,
  /phone number/i,
  /mobile number/i,
  /\baddress\b/i,
  /why (are you|would you|do you want to) (leave|quit|switch)/i,
  /expected (package|pay|ctc)/i,
]

/** Requests for the visitor's own task, not a question about Prashant. */
const TASK = [
  /^(write|code|build|generate|debug|implement|solve|translate|draw)\b/i,
  /\b(write|code|build|generate|debug|implement|solve)\b.{0,48}\b(me|for me|a |an |my )\b/i,
  /\b(homework|leetcode|recipe)\b/i,
  /\bmy (resume|homework|code|app|project|bug|assignment)\b/i,
]

const ABOUT_ME =
  /\b(you|your|yours|yourself|prashant)\b|\b(rigved|route mobile|synergy|isite|ondc|bhavans|portfolio|shopify|beckn|fleet|serverless|lambda)\b|\b(experience|projects?|stack|skills?|education|qualification|degree|college|cgpi|cgpa|percentage|marks|b\.?\s*sc|resume|background|knowledge|familiar|hands-?on|linkedin|github|email)\b|^(hi|hello|hey|yo|good (morning|evening|afternoon))\b|\b(earliest role|ai tools)\b/i

/**
 * First gate on a message.
 * Withheld and off-topic stop here. On-topic continues to cache and retrieval.
 * This is a keyword gate so those stops work before a model exists.
 */
export function classifyMessage(text: string): GuardDecision {
  text = canonicalize(text)
  if (WITHHELD.some((pattern) => pattern.test(text))) return 'withheld'
  if (TASK.some((pattern) => pattern.test(text))) return 'off_topic'
  if (ABOUT_ME.test(text) || matchedAreas(text).length > 0) return 'on_topic'
  return 'off_topic'
}

/** Words that can appear in a hello and carry no question. */
const GREETING_FILLER = new Set([
  'a',
  'am',
  'and',
  'are',
  'afternoon',
  'day',
  'doing',
  'evening',
  'going',
  'good',
  'greetings',
  'hello',
  'hey',
  'heya',
  'hi',
  'hola',
  'hope',
  'how',
  'howdy',
  'hows',
  'i',
  'im',
  'is',
  'it',
  'meet',
  'morning',
  'my',
  'name',
  'namaskar',
  'namaste',
  'nice',
  'night',
  'please',
  'prashant',
  'r',
  'see',
  'sup',
  'thank',
  'thanks',
  'the',
  'there',
  'this',
  'to',
  'today',
  'too',
  'u',
  'up',
  'wassup',
  'well',
  'whats',
  'yo',
  'you',
  'your',
  'youre',
])

/** A real hello has to include one of these, not only filler like "and" or "there". */
const GREETING_SIGNAL = new Set([
  'afternoon',
  'day',
  'evening',
  'good',
  'greetings',
  'hello',
  'hey',
  'heya',
  'hi',
  'hola',
  'hope',
  'how',
  'howdy',
  'hows',
  'morning',
  'namaskar',
  'namaste',
  'nice',
  'night',
  'sup',
  'wassup',
  'whats',
  'yo',
])

/** Spoken back in the order they arrived. Longer phrases win over the words inside them. */
const GREETING_PHRASES: Array<{ pattern: RegExp; reply: string }> = [
  { pattern: /\bgood morning\b/, reply: 'Good morning' },
  { pattern: /\bgood afternoon\b/, reply: 'Good afternoon' },
  { pattern: /\bgood evening\b/, reply: 'Good evening' },
  { pattern: /\bgood night\b/, reply: 'Good night' },
  { pattern: /\bgood day\b/, reply: 'Good day' },
  { pattern: /\bnice to meet you\b/, reply: 'Nice to meet you' },
  { pattern: /\bhello\b/, reply: 'Hello' },
  { pattern: /\bheya\b/, reply: 'Hey' },
  { pattern: /\bhey\b/, reply: 'Hey' },
  { pattern: /\bhi\b/, reply: 'Hi' },
  { pattern: /\bhowdy\b/, reply: 'Howdy' },
  { pattern: /\bnamaste\b/, reply: 'Namaste' },
  { pattern: /\bnamaskar\b/, reply: 'Namaskar' },
  { pattern: /\bhola\b/, reply: 'Hola' },
  { pattern: /\bwassup\b/, reply: 'Hey' },
  { pattern: /\bsup\b/, reply: 'Hey' },
  { pattern: /\bgreetings\b/, reply: 'Hello' },
  { pattern: /\byo\b/, reply: 'Yo' },
]

function greetingText(text: string) {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleWord(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1)
}

/** A name the visitor gave: "I am Ed", "I'm Ed", "my name is Ed". */
export function introducedName(text: string) {
  const rest = greetingText(text)
  const introduced = rest.match(/\b(?:my name is|i am|im|this is)\s+([a-z]{2,20})(?:\s+([a-z]{2,20}))?/)
  if (!introduced || !introduced[1] || GREETING_FILLER.has(introduced[1])) return null
  const words = [introduced[1]]
  if (introduced[2] && !GREETING_FILLER.has(introduced[2])) words.push(introduced[2])
  return words.map(titleWord).join(' ')
}

/** Latest name from earlier visitor messages. The current question is not included. */
export function rememberedName(history: Array<{ role: string; content: string }>) {
  let name: string | null = null
  for (const turn of history) {
    if (turn.role !== 'user') continue
    const found = introducedName(turn.content)
    if (found) name = found
  }
  return name
}

const ASKS_VISITOR_NAME =
  /\b(?:what(?:s| is) my name|who am i|do you know my name|do you remember my name)\b/

/** "What is my name?" uses the name from earlier in this chat. */
export function visitorNameReply(history: Array<{ role: string; content: string }>, message: string) {
  if (!ASKS_VISITOR_NAME.test(greetingText(message))) return null
  const name = rememberedName([...history, { role: 'user', content: message }])
  if (!name) return "You haven't told me your name yet."
  return `Your name is ${name}.`
}

/**
 * Mirrors the greeting that arrived.
 * "I'm doing well" is added only when the visitor actually asks.
 * A name from earlier in the chat is used when this hello does not give one.
 * A question after the hello is left for the rest of the pipeline.
 */
export function greetingReply(text: string, remembered?: string | null) {
  const rest = greetingText(text)
  if (!rest || rest.length > 80) return null

  const named = new Set<string>()
  let name = introducedName(text)
  if (name) {
    for (const word of name.toLowerCase().split(' ')) named.add(word)
  }

  if (!name) {
    const called = rest.match(/\b(?:hi|hello|hey|heya)\s+([a-z]{2,20})\b/)
    if (called && !GREETING_FILLER.has(called[1])) {
      name = titleWord(called[1])
      named.add(called[1])
    }
  }

  if (!name && remembered) name = remembered

  const tokens = rest.split(/\s+/).filter(Boolean)
  if (tokens.length === 0 || tokens.some((token) => !GREETING_FILLER.has(token) && !named.has(token))) return null
  if (!tokens.some((token) => GREETING_SIGNAL.has(token))) return null

  const spoken: Array<{ at: number; reply: string }> = []
  for (const phrase of GREETING_PHRASES) {
    const match = phrase.pattern.exec(rest)
    if (match?.index === undefined) continue
    spoken.push({ at: match.index, reply: phrase.reply })
  }
  spoken.sort((a, b) => a.at - b.at)
  const mirrored = spoken.filter((item, index) => spoken.findIndex((other) => other.reply === item.reply) === index)

  const askedDay = /\b(?:hows|how is) (?:your|the) day\b/.test(rest)
  const askedHow =
    askedDay ||
    /\bhow (?:are|r) (?:you|u)\b/.test(rest) ||
    /\b(?:hows|how is) it going\b/.test(rest) ||
    /\bwhats up\b/.test(rest)

  const hopesWell = /\bhope youre(?: doing)? well\b/.test(rest)
  const [primary, ...extras] = mirrored.map((item) => item.reply)
  return spokenGreeting(primary, extras, name, askedHow, askedDay, hopesWell)
}

function spokenGreeting(
  primary: string | undefined,
  extras: string[],
  name: string | null,
  askedHow: boolean,
  askedDay: boolean,
  hopesWell: boolean,
) {
  const named = name ? ` ${name}` : ''
  const extra = extras.length > 0 ? ` ${extras.join('. ')}.` : ''
  const well = askedDay
    ? "My day is going well, thank you for asking."
    : askedHow
      ? "I'm doing well, thank you for asking."
      : ''

  if (!primary) {
    if (askedDay) return "My day is going well, thank you for asking. Hope you're having a great day too!"
    if (askedHow || hopesWell) {
      return "I'm doing well, thank you for asking. Hope you're doing well too! What can I help you with today?"
    }
    return `Hey${named}! Great to hear from you. What would you like to know about my work or experience?`
  }

  if (primary === 'Nice to meet you') {
    return `Nice to meet you too${name ? `, ${name}` : ''}! Feel free to ask me about my experience, projects, or technical background.`
  }

  if (primary === 'Good morning' || primary === 'Good afternoon') {
    const when = primary === 'Good morning' ? 'morning' : 'afternoon'
    const wish =
      primary === 'Good morning' ? "Hope you're having a great day." : 'Hope your afternoon is going well.'
    return clean(`Good ${when}${named}!${extra} ${well} ${wish} What would you like to know about my professional background?`)
  }

  if (primary === 'Good evening' || primary === 'Good night') {
    const when = primary === 'Good night' ? 'night' : 'evening'
    if (well || hopesWell) {
      return clean(`Good ${when}${named}!${extra} Thank you, hope you're doing well too. Happy to chat!`)
    }
    return clean(`Good ${when}${named}!${extra} Happy to chat. What would you like to know?`)
  }

  if (primary === 'Good day') {
    return clean(
      `Good day${named}!${extra} ${well} What would you like to know about my work or experience?`,
    )
  }

  if (primary === 'Hello') {
    if (well) {
      return clean(
        `Hello${named}!${extra} ${well} Hope you're doing well too! What can I help you with today?`,
      )
    }
    return clean(`Hello${named}!${extra} What can I help you with today?`)
  }

  if (well) {
    return clean(`Hey${named}!${extra} ${well} What would you like to know about my work or experience?`)
  }
  return clean(`Hey${named}!${extra} Great to hear from you. What would you like to know about my work or experience?`)
}

function clean(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

/** True when the message is only a greeting, not a question hiding after one. */
export function isGreeting(text: string) {
  return greetingReply(text) !== null
}

export function normalizeQuestion(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
