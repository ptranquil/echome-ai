import raw from '../../knowledge/replies.md?raw'
import { parseFixedReplies, type FixedReplyId } from './fixedReplyParse.ts'

export type { FixedReplyId }

const REPLIES = parseFixedReplies(raw)

/** Copy the app speaks by itself. The model is not asked to write these. */
export function fixedReply(id: FixedReplyId) {
  return REPLIES[id]
}
