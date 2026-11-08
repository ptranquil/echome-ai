# EchoMe-AI

A local chat about Prashant Dwivedi. Answers stay short, first person, and come from the notes in `knowledge/`. The model is only asked when those notes do not already answer the question. Salary, notice period, and other private questions never call a model.

The portfolio stays a separate site at https://ptranquil.github.io/portfolio/. This app is the chat. The header has no portfolio button. The avatar sits on the empty state and beside each reply.

## Run it

```bash
npm install
cp .env.example .env
cp models.example.json models.json
npm run dev
```

Open http://localhost:5173/

`models.json` is read on each request, so saving it does not need a restart. Changing `.env` does. Restart the dev server after you add or edit a key.

## How an answer is chosen

1. A greeting is answered from the hello itself. "Hi" and "Good morning" do not share one canned line. "I'm doing well" is used only when the visitor asks. If they already said their name ("I am Ed"), later greetings reuse it, and "what is my name?" answers from that history.
2. Facts that are already written down are returned directly: who I am, education, role, stack, a named tool, a company, contact, the portfolio link, and what I am exploring. The model is not called for these.
3. Anything else on topic is answered by the selected model, with `knowledge/policy.md` and the matching note in front of it. The last few turns go with the question, so the model can follow the conversation.
4. Off-topic and private questions use the fixed lines in `knowledge/replies.md`.

Direct replies and model replies both stream onto the page word by word. A ready-made answer is not printed as one block.

The thread is kept in the browser. Clear starts a new one.

## Notes

Edit the markdown in `knowledge/`. That is the source of the facts.

| File | What it answers |
| --- | --- |
| `profile.md` | Who I am, contact, portfolio |
| `education.md` | Qualification, college, CGPI |
| `skills.md` | Stack, frontend, backend, cloud, named tools |
| `experience-*.md`, `career.md` | Roles and companies |
| `projects.md` | Project work |
| `ai.md` | How I use AI, and what I am exploring |
| `policy.md` | Tone and what to do when a fact is missing |
| `replies.md` | Greeting shape, off-topic, private, and quota lines |

## Switch the model

The menu in the top left lists `models.json`. If that file is missing, the app uses `models.example.json`. Each entry needs an `id`, a `label`, a `provider`, a `baseUrl`, and a `model`. Mark one entry `"default": true`.

The chat calls the `baseUrl` on that entry. Nothing is hardcoded to one host.

- `provider: "gemini"` uses Google's generateContent API at that base URL.
- Every other provider, including Ollama, Groq, OpenAI, Grok, and OpenRouter, uses the OpenAI chat format at `{baseUrl}/chat/completions`. If the base URL already ends in `/chat/completions`, it is used as written.
- An `openrouter.ai` URL always uses the OpenAI format, even when the model name is a Gemini model. That is the one shared URL that can front Gemini, GPT, Grok, and others.

`models.example.json` already has Llama 3.2, DeepSeek R1, Gemini, Groq, OpenRouter, GPT, and Grok. Add another provider by adding another object. No code change is required.

Ollama must be running for a local model. DeepSeek R1 is told not to spend the reply on a thinking trace (`think: false`). Groq reasoning models are asked for a short hidden trace so the visible answer still comes back.

Keep API keys in `.env` and point at them with `apiKeyEnv`. The page never receives a key. Do not commit `.env`. `models.json` is gitignored, so a key pasted into it stays on this machine. Prefer `apiKeyEnv`.

```
CHAT_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=llama3.2
GEMINI_API_KEY=
GROQ_API_KEY=
```

`CHAT_PROVIDER`, `OLLAMA_BASE_URL`, and `OLLAMA_MODEL` are used only when both model files are missing.

A Gemini `503` means that model is busy on Google's side. Ask again in a moment, or pick another model in the menu.
