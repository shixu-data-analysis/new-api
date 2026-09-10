/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { PaginationState, SortingState } from '@tanstack/react-table'
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from '@tanstack/react-router'

export interface ModelManagementListState {
  search: string
  modelId: string
  provider: string
  capability: string
  visibility: string
  pagination: PaginationState
  sorting: SortingState
  scrollY: number
  focusModelId: string
}

export interface ModelManagementReturnContext {
  nonce: string
}

const initialListState: ModelManagementListState = {
  search: '',
  modelId: '',
  provider: '',
  capability: '',
  visibility: 'ALL',
  pagination: { pageIndex: 0, pageSize: 20 },
  sorting: [{ id: 'name', desc: false }],
  scrollY: 0,
  focusModelId: '',
}

const storageKey = 'canvas.model-management.list-context'
const returnStorageKey = 'canvas.model-management.return-contexts'
const returnStateKey = 'canvasModelManagementReturn'

function readStoredState(): ModelManagementListState {
  if (typeof window === 'undefined') return initialListState
  try {
    const value = window.sessionStorage.getItem(storageKey)
    if (!value) return initialListState
    const parsed = JSON.parse(value) as Partial<ModelManagementListState>
    if (!parsed.pagination || !parsed.sorting) return initialListState
    // A focus target is only valid when a matching nonce accompanies the
    // current history entry.  Do not replay a stale focus after a direct visit.
    return { ...initialListState, ...parsed, focusModelId: '' }
  } catch {
    return initialListState
  }
}

function readReturnContexts(): Record<string, ModelManagementListState> {
  if (typeof window === 'undefined') return {}
  try {
    const value = window.sessionStorage.getItem(returnStorageKey)
    return value ? (JSON.parse(value) as Record<string, ModelManagementListState>) : {}
  } catch {
    return {}
  }
}

function writeReturnContexts(value: Record<string, ModelManagementListState>) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(returnStorageKey, JSON.stringify(value))
  } catch {
    // Browser storage is optional. A same-session history state remains usable.
  }
}

function readReturnNonce(state: unknown) {
  if (!state || typeof state !== 'object') return undefined
  const candidate = (state as Record<string, unknown>)[returnStateKey]
  if (!candidate || typeof candidate !== 'object') return undefined
  const nonce = (candidate as Record<string, unknown>).nonce
  return typeof nonce === 'string' ? nonce : undefined
}

function createNonce() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function writeStoredState(value: ModelManagementListState) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // Browser storage is optional. The mounted route context remains usable.
  }
}

interface ModelManagementNavigationValue {
  listState: ModelManagementListState
  updateListState: (update: Partial<ModelManagementListState>) => void
  captureReturnContext: (focusModelId: string) => ModelManagementReturnContext
  consumeReturnContext: (nonce: string) => void
}

const ModelManagementNavigationContext =
  createContext<ModelManagementNavigationValue | null>(null)

export function ModelManagementNavigationProvider(props: {
  children: ReactNode
}) {
  const [listState, setListState] = useState(readStoredState)
  const locationState = useLocation({ select: (location) => location.state })
  const returnNonce = readReturnNonce(locationState)
  useEffect(() => {
    if (!returnNonce) return
    const stored = readReturnContexts()[returnNonce]
    if (!stored) return
    setListState(stored)
  }, [returnNonce])
  const value = useMemo<ModelManagementNavigationValue>(
    () => ({
      listState,
      updateListState: (update) => {
        setListState((current) => {
          const next = { ...current, ...update }
          if (
            current.search === next.search &&
            current.modelId === next.modelId &&
            current.provider === next.provider &&
            current.capability === next.capability &&
            current.visibility === next.visibility &&
            current.scrollY === next.scrollY &&
            current.focusModelId === next.focusModelId &&
            current.pagination.pageIndex === next.pagination.pageIndex &&
            current.pagination.pageSize === next.pagination.pageSize &&
            current.sorting.length === next.sorting.length &&
            current.sorting.every(
              (item, index) =>
                item.id === next.sorting[index]?.id &&
                item.desc === next.sorting[index]?.desc
            )
          ) {
            return current
          }
          writeStoredState(next)
          return next
        })
      },
      captureReturnContext: (focusModelId) => {
        const nonce = createNonce()
        setListState((current) => {
          const next = {
            ...current,
            focusModelId,
            scrollY: window.scrollY,
          }
          writeStoredState(next)
          writeReturnContexts({ ...readReturnContexts(), [nonce]: next })
          return next
        })
        return { nonce }
      },
      consumeReturnContext: (nonce) => {
        const contexts = readReturnContexts()
        if (!contexts[nonce]) return
        delete contexts[nonce]
        writeReturnContexts(contexts)
        setListState((current) => {
          if (!current.focusModelId) return current
          const next = { ...current, focusModelId: '' }
          writeStoredState(next)
          return next
        })
      },
    }),
    [listState]
  )
  return (
    <ModelManagementNavigationContext.Provider value={value}>
      {props.children}
    </ModelManagementNavigationContext.Provider>
  )
}

export function useModelManagementNavigation() {
  const value = useContext(ModelManagementNavigationContext)
  if (!value) {
    throw new Error('Model management navigation context is unavailable')
  }
  return value
}

export function useOptionalModelManagementNavigation() {
  return useContext(ModelManagementNavigationContext)
}

export function getModelManagementReturnContext(
  state: unknown
): ModelManagementReturnContext | null {
  const nonce = readReturnNonce(state)
  return nonce && readReturnContexts()[nonce] ? { nonce } : null
}

export const modelManagementReturnStateKey = returnStateKey
