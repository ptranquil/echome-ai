import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleChat } from './answer.ts'
import { loadModels, pickModel, type ModelFallback } from './models.ts'

interface ChatDevOptions extends ModelFallback {
  knowledgeDir: string
  root: string
  env: Record<string, string | undefined>
}

function requestPath(url: string | undefined) {
  return url?.split('?')[0]
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function catalog(options: ChatDevOptions) {
  return loadModels(options.root, options.env, options)
}

/** Dev-only route. GitHub Pages cannot run this. Keys stay in this process. */
export function chatApiMiddleware(options: ChatDevOptions) {
  return async (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    const pathname = requestPath(req.url)
    if (pathname !== '/api/chat' && pathname !== '/api/models') {
      next()
      return
    }

    if (pathname === '/api/models') {
      if (req.method !== 'GET') {
        res.statusCode = 405
        res.end('GET only')
        return
      }
      const { models, defaultId } = catalog(options)
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          defaultId,
          models: models.map(({ id, label, provider }) => ({ id, label, provider })),
        }),
      )
      return
    }

    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('POST only')
      return
    }

    try {
      const raw = await readBody(req)
      let parsed: { message?: unknown; history?: unknown; modelId?: unknown } = {}
      try {
        parsed = raw ? JSON.parse(raw) : {}
      } catch {
        res.statusCode = 400
        res.end('Invalid JSON')
        return
      }

      const { models, defaultId } = catalog(options)
      const chosen = pickModel(models, parsed.modelId, defaultId)
      if (!chosen) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'Unknown model.' }))
        return
      }

      const ip = req.socket.remoteAddress ?? 'local'
      const response = await handleChat(
        parsed,
        {
          knowledgeDir: options.knowledgeDir,
          provider: chosen.provider,
          protocol: chosen.protocol,
          model: chosen.model,
          apiKey: chosen.apiKey,
          baseUrl: chosen.baseUrl || options.ollamaBaseUrl,
          ip,
        },
        AbortSignal.timeout(90000),
      )
      res.statusCode = response.status
      response.headers.forEach((value, key) => {
        res.setHeader(key, value)
      })
      res.flushHeaders()
      if (!response.body) {
        res.end()
        return
      }
      const reader = response.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    } catch (error) {
      next(error)
    }
  }
}
