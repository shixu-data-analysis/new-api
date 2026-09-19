import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useDirectAsync } from '../use-direct-async'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

describe('useDirectAsync', () => {
  it('tracks interleaved calls independently and clears the active envelopes', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const execute = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useDirectAsync({ execute, onSuccess, onError: vi.fn() }))
    act(() => { result.current.mutate('secret-one'); result.current.mutate('secret-two') })
    expect(result.current.activeCount).toBe(2)
    await act(async () => { second.resolve('second'); await second.promise })
    await waitFor(() => expect(result.current.activeCount).toBe(1))
    await act(async () => { first.resolve('first'); await first.promise })
    await waitFor(() => expect(result.current.activeCount).toBe(0))
    expect(onSuccess).toHaveBeenCalledTimes(2)
  })

  it('clears never-settling requests on unmount and ignores delayed callbacks', async () => {
    const pending = deferred<string>()
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const { result, unmount } = renderHook(() => useDirectAsync({
      execute: () => pending.promise,
      onSuccess,
      onError,
    }))
    act(() => result.current.mutate('local-secret'))
    expect(result.current.activeCount).toBe(1)
    expect(result.current.inspectRetainedRequests()).toEqual({ requestCount: 1, valueCount: 0 })
    unmount()
    expect(result.current.inspectRetainedRequests()).toEqual({ requestCount: 0, valueCount: 0 })
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('does not let an old completion decrement a new generation', async () => {
    const oldRequest = deferred<string>()
    const newRequest = deferred<string>()
    const execute = vi.fn().mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise)
    const { result } = renderHook(() => useDirectAsync({ execute, onSuccess: vi.fn(), onError: vi.fn() }))
    act(() => result.current.mutate('old-secret'))
    act(() => { result.current.reset(); result.current.mutate('new-secret') })
    expect(result.current.activeCount).toBe(1)
    await act(async () => { oldRequest.resolve('old'); await oldRequest.promise })
    expect(result.current.activeCount).toBe(1)
    await act(async () => { newRequest.resolve('new'); await newRequest.promise })
    await waitFor(() => expect(result.current.activeCount).toBe(0))
  })

  it('survives StrictMode lifecycle probing without retaining values', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>
    const { result } = renderHook(() => useDirectAsync({
      execute: async () => 'ok',
      onSuccess: vi.fn(),
      onError: vi.fn(),
    }), { wrapper })
    act(() => result.current.mutate('strict-secret'))
    await waitFor(() => expect(result.current.activeCount).toBe(0))
    expect(result.current.inspectRetainedRequests()).toEqual({ requestCount: 0, valueCount: 0 })
  })

  it('settles when execute or callbacks throw', async () => {
    const onError = vi.fn().mockRejectedValue(new Error('error callback failed'))
    const execute = vi.fn().mockRejectedValueOnce(new Error('write failed')).mockResolvedValueOnce('ok')
    const { result } = renderHook(() => useDirectAsync({
      execute,
      onSuccess: () => { throw new Error('success callback failed') },
      onError,
    }))
    act(() => { result.current.mutate('first-secret'); result.current.mutate('second-secret') })
    await waitFor(() => expect(result.current.activeCount).toBe(0))
    expect(onError).toHaveBeenCalledTimes(2)
  })
})
