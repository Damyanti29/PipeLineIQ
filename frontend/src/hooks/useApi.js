import { useCallback, useEffect, useRef, useState } from 'react'

// Runs `fetcher` on mount and whenever `deps` change. Returns { data, loading, error, reload, setData }.
// `deps` must be serializable (ids, filter strings); `fetcher` itself is not a dependency.
export function useApi(fetcher, deps = []) {
  const [reloadCount, setReloadCount] = useState(0)
  const [result, setResult] = useState({ key: null, data: null, error: null })
  const requestKey = JSON.stringify([...deps, reloadCount])

  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    let active = true
    fetcherRef.current().then(
      (data) => active && setResult({ key: requestKey, data, error: null }),
      (error) => active && setResult({ key: requestKey, data: null, error }),
    )
    return () => {
      active = false
    }
  }, [requestKey])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])
  const setData = useCallback(
    (updater) => setResult((current) => ({ ...current, data: typeof updater === 'function' ? updater(current.data) : updater })),
    [],
  )

  return { data: result.data, error: result.error, loading: result.key !== requestKey, reload, setData }
}
