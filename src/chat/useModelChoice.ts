import { useEffect, useState } from 'react'

export interface ModelChoice {
  id: string
  label: string
  provider: string
}

const STORAGE_KEY = 'echome-ai.model'

interface ModelList {
  models: ModelChoice[]
  defaultId: string
}

export function useModelChoice() {
  const [models, setModels] = useState<ModelChoice[]>([])
  const [modelId, setModelId] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}api/models`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('models'))))
      .then((data: ModelList) => {
        if (cancelled) return
        const list = Array.isArray(data.models) ? data.models : []
        setModels(list)
        const saved = localStorage.getItem(STORAGE_KEY)
        const next = list.some((item) => item.id === saved) ? saved! : data.defaultId
        if (next) setModelId(next)
      })
      .catch(() => {
        if (!cancelled) setModels([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const choose = (id: string) => {
    setModelId(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  return { models, modelId, choose }
}
