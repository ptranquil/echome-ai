export type FixedReplyId = 'off_topic' | 'quota' | 'withheld' | 'unknown'

const SECTIONS: Record<FixedReplyId, RegExp> = {
  off_topic: /(?:^|\n)\d+\.\s*Off-topic Questions\b/,
  withheld: /(?:^|\n)\d+\.\s*Private and Confidential Information\b/,
  unknown: /(?:^|\n)\d+\.\s*Unknown Information\b/,
  quota: /(?:^|\n)\d+\.\s*Usage Limit\b/,
}

function sectionBody(source: string, heading: RegExp) {
  const start = source.search(heading)
  if (start < 0) return ''
  const rest = source.slice(start)
  const next = rest.slice(1).search(/\n\d+\.\s+\S/)
  return next < 0 ? rest : rest.slice(0, next + 1)
}

function fixedParagraph(body: string) {
  const match = body.match(/(?:Fixed response|Response):\s*\n+([\s\S]*?)(?:\n\n|\n(?:Do not|Never|For )\b|$)/)
  return match?.[1]?.trim().replace(/\s+/g, ' ') ?? ''
}

/** The fixed lines in knowledge/replies.md. Greeting examples stay in the greeting function. */
export function parseFixedReplies(source: string): Record<FixedReplyId, string> {
  const replies = {} as Record<FixedReplyId, string>
  for (const id of Object.keys(SECTIONS) as FixedReplyId[]) {
    const text = fixedParagraph(sectionBody(source, SECTIONS[id]))
    if (!text) throw new Error(`Missing fixed reply: ${id}`)
    replies[id] = text
  }
  return replies
}
