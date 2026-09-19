import { useCallback, useEffect, useRef, useState } from 'react'

type DirectAsyncOptions<TValue, TResult> = {
  execute: (value: TValue, signal: AbortSignal) => Promise<TResult>
  onSuccess: (result: TResult) => void | Promise<void>
  onError: (error: unknown) => void | Promise<void>
}

/** Runs secret-bearing writes outside TanStack's mutation cache. */
export function useDirectAsync<TValue, TResult>(options: DirectAsyncOptions<TValue, TResult>) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const mountedRef = useRef(true)
  const sequenceRef = useRef(0)
  const generationRef = useRef(0)
  const requestsRef = useRef(new Map<number, {
    value: TValue | undefined
    controller: AbortController
    generation: number
  }>())
  const [activeCount, setActiveCount] = useState(0)

  const clearRequests = useCallback(() => {
    for (const envelope of requestsRef.current.values()) {
      envelope.value = undefined
      envelope.controller.abort()
    }
    requestsRef.current.clear()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      clearRequests()
    }
  }, [clearRequests])

  const mutate = useCallback((value: TValue) => {
    const requestId = ++sequenceRef.current
    const generation = generationRef.current
    const envelope = {
      value: value as TValue | undefined,
      controller: new AbortController(),
      generation,
    }
    requestsRef.current.set(requestId, envelope)
    setActiveCount((count) => count + 1)
    void (async () => {
      let result: TResult | undefined
      try {
        const accepted = optionsRef.current.execute(
          envelope.value as TValue,
          envelope.controller.signal
        )
        envelope.value = undefined
        result = await accepted
        if (
          mountedRef.current &&
          generationRef.current === generation &&
          requestsRef.current.has(requestId)
        ) {
          await optionsRef.current.onSuccess(result)
        }
      } catch (error) {
        envelope.value = undefined
        if (
          mountedRef.current &&
          generationRef.current === generation &&
          requestsRef.current.has(requestId)
        ) {
          try {
            await optionsRef.current.onError(error)
          } catch {
            // Callback failures must not keep the secret envelope alive.
          }
        }
      } finally {
        result = undefined
        envelope.value = undefined
        if (
          mountedRef.current &&
          generationRef.current === generation &&
          requestsRef.current.delete(requestId)
        ) {
          setActiveCount((count) => Math.max(0, count - 1))
        }
      }
    })()
  }, [])

  const reset = useCallback(() => {
    generationRef.current += 1
    clearRequests()
    if (mountedRef.current) setActiveCount(0)
  }, [clearRequests])

  const inspectRetainedRequests = useCallback(() => ({
    requestCount: requestsRef.current.size,
    valueCount: [...requestsRef.current.values()].filter(
      (envelope) => envelope.value !== undefined
    ).length,
  }), [])

  return { activeCount, isPending: activeCount > 0, mutate, reset, inspectRetainedRequests }
}
