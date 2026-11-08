/**
 * Areas of the stack, including split spellings such as "front end".
 * A question can name an area without naming a tool. The tools themselves stay in skills.md.
 */
const AREAS: Array<{ id: string; test: RegExp }> = [
  { id: 'frontend', test: /\b(front[\s-]?end|client[\s-]?side)\b|\bui\b/i },
  { id: 'backend', test: /\b(back[\s-]?end|server[\s-]?side|server)\b/i },
  { id: 'mobile', test: /\b(?<!route\s)mobile\b|\bios\b|\bandroid\b/i },
  { id: 'cloud', test: /\b(cloud|devops|infrastructure)\b/i },
  { id: 'data', test: /\b(databases?|sql|data store|storage)\b/i },
  { id: 'testing', test: /\b(testing|tests|qa|e2e)\b/i },
  { id: 'languages', test: /\blanguages?\b/i },
  { id: 'queues', test: /\b(queues?|messaging)\b/i },
]

export function matchedAreas(text: string) {
  return AREAS
    .map((area) => ({ id: area.id, index: text.search(area.test) }))
    .filter((area) => area.index >= 0)
    .sort((a, b) => a.index - b.index)
    .map((area) => area.id)
}

const WHOLE_STACK = /\b(stack|skills?|technolog(?:y|ies)|tools)\b/i

/** The full stack paragraph, when they ask for the stack and not one area. */
export function stackOverview(skillsBody: string, message: string) {
  if (matchedAreas(message).length > 0 || !WHOLE_STACK.test(message)) return null
  const paragraph = skillsBody
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('I work with the MERN'))
  return paragraph ?? null
}

const ROLE_QUESTION = /\b(are you|developer|engineer)\b/i
const ASKS_TOOLS = /\b(stack|knowledge|know|familiar|tools|technolog|which|what do you use)\b/i

/** Spoken answer for an area question. Null when the question does not name an area in the note. */
export function areaAnswer(skillsBody: string, message: string) {
  const wanted = matchedAreas(message)
  if (
    ROLE_QUESTION.test(message) &&
    !ASKS_TOOLS.test(message) &&
    (wanted.length > 0 || /\b(full[\s-]?stack|developer|engineer)\b/i.test(message))
  ) {
    const role = skillsBody
      .split('\n')
      .map((line) => line.trim())
      .find((line) => /^role:/i.test(line))
    if (role) return role.replace(/^role:\s*/i, '')
  }

  if (!wanted.length) return null

  const lines = new Map<string, string>()
  for (const line of skillsBody.split('\n')) {
    const match = line.match(/^(frontend|backend|mobile|cloud|data|testing|languages|queues):\s*(.+)$/i)
    if (!match) continue
    lines.set(match[1].toLowerCase(), match[2].trim().replace(/\.$/, ''))
  }

  const parts = wanted
    .map((id) => {
      const tools = lines.get(id)
      if (!tools) return null
      return `For ${id} I use ${tools}.`
    })
    .filter((part): part is string => !!part)

  if (!parts.length) return null
  return `Yes. ${parts.join(' ')}`
}
