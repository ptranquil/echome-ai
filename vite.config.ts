import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { chatApiMiddleware } from './server/devMiddleware.ts'

function chatApi(env: Record<string, string>) {
  const provider = env.CHAT_PROVIDER === 'ollama' ? 'ollama' : 'gemini'
  const model =
    provider === 'ollama'
      ? env.OLLAMA_MODEL || 'llama3.2'
      : env.GEMINI_MODEL || 'gemini-2.5-flash'

  return {
    name: 'chat-api',
    configureServer(server: { middlewares: { use: (handler: ReturnType<typeof chatApiMiddleware>) => void } }) {
      server.middlewares.use(
        chatApiMiddleware({
          knowledgeDir: path.resolve(import.meta.dirname, 'knowledge'),
          root: import.meta.dirname,
          env,
          provider,
          model,
          apiKey: env.GEMINI_API_KEY || undefined,
          ollamaBaseUrl: env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
        }),
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [chatApi(env), react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
