import { matchedAreas } from './areas.ts'
import { canonicalize } from './facts.ts'

export interface RetrievedNote {
  file: string
  label: string
}

/**
 * Picks one public note by keywords.
 * Order is most specific first. A later step will rank chunks instead of using this list.
 */
const NOTES: Array<RetrievedNote & { test: RegExp }> = [
  {
    file: 'ai.md',
    label: 'How I use AI',
    test: /\b(ai|chatgpt|chat gpt|cursor|claude|grok|ollama|llm|copilot|artificial intelligence)\b/i,
  },
  {
    file: 'career.md',
    label: 'Companies and what I want next',
    test: /compan(?:y|ies)|domain|industry|looking for|looking ahead|next role|career|where do you see|what do you want/i,
  },
  {
    file: 'experience-route-mobile.md',
    label: 'Route Mobile',
    test: /route mobile|cloudwatch|dynamodb|\bec2\b/i,
  },
  {
    file: 'experience-synergy.md',
    label: 'Synergy',
    test: /synergy/i,
  },
  {
    file: 'experience-rigved.md',
    label: 'Current role at Rigved',
    test: /rigved|isite|current (job|role|company)|where do you work|what are you (building|working)|day[\s-]to[\s-]day/i,
  },
  {
    file: 'education.md',
    label: 'Education',
    test: /college|education|qualification|degree|bhavans|cgpi|cgpa|percentage|marks|university|b\.?\s*sc/i,
  },
  {
    file: 'projects.md',
    label: 'Projects',
    test: /project|ondc|shopify|beckn|fleet|dashboard|serverless/i,
  },
  {
    file: 'skills.md',
    label: 'Stack',
    test: /stack|skill|technolog|node|react|angular|aws|firebase|typescript|docker|graphql|postgres/i,
  },
  {
    file: 'profile.md',
    label: 'Who I am',
    test: /who are you|who is this|about yourself|about you|introduce|open to|contact|email|resume|linkedin|github|years|how long|experience/i,
  },
]

export function matchNote(text: string): RetrievedNote {
  text = canonicalize(text)
  const found = NOTES.find((note) => note.test.test(text))
  if (found) {
    return { file: found.file, label: found.label }
  }
  if (matchedAreas(text).length > 0) {
    return { file: 'skills.md', label: 'Stack' }
  }
  return { file: 'profile.md', label: 'Who I am' }
}

export function pendingModelReply(note: RetrievedNote) {
  return `This is about my work, so it stays on the path. I would answer from the note “${note.label}” (${note.file}) once Gemini is connected. I won’t invent that answer before then.`
}
