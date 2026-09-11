/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { HistoryState } from '@tanstack/history'
import type {
  PaginationState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table'

declare module '@tanstack/history' {
  interface HistoryState {
    canvasModelManagementReturn?: ModelManagementReturnContext
  }
}

export interface ModelManagementListState {
  search: string
  modelId: string
  provider: string
  capability: string
  visibility: string
  pagination: PaginationState
  sorting: SortingState
  columnVisibility: VisibilityState
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
  columnVisibility: {},
  scrollY: 0,
  focusModelId: '',
}
const storageKey = 'canvas.model-management.list-context'
const returnStorageKey = 'canvas.model-management.return-contexts'
const returnStateKey = 'canvasModelManagementReturn'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
function isPaginationState(value: unknown): value is PaginationState {
  if (!isRecord(value)) return false
  const { pageIndex, pageSize } = value
  return (
    typeof pageIndex === 'number' &&
    Number.isInteger(pageIndex) &&
    pageIndex >= 0 &&
    typeof pageSize === 'number' &&
    Number.isInteger(pageSize) &&
    pageSize > 0
  )
}
function isSortingState(value: unknown): value is SortingState {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.desc === 'boolean'
    )
  )
}
function isVisibilityState(value: unknown): value is VisibilityState {
  return (
    isRecord(value) &&
    Object.values(value).every((visible) => typeof visible === 'boolean')
  )
}

export function normalizeModelManagementListState(
  value: unknown,
  options: { retainFocus?: boolean } = {}
): ModelManagementListState {
  if (!isRecord(value)) return { ...initialListState }
  return {
    search:
      typeof value.search === 'string' ? value.search : initialListState.search,
    modelId:
      typeof value.modelId === 'string'
        ? value.modelId
        : initialListState.modelId,
    provider:
      typeof value.provider === 'string'
        ? value.provider
        : initialListState.provider,
    capability:
      typeof value.capability === 'string'
        ? value.capability
        : initialListState.capability,
    visibility:
      typeof value.visibility === 'string'
        ? value.visibility
        : initialListState.visibility,
    pagination: isPaginationState(value.pagination)
      ? value.pagination
      : initialListState.pagination,
    sorting: isSortingState(value.sorting)
      ? value.sorting
      : initialListState.sorting,
    columnVisibility: isVisibilityState(value.columnVisibility)
      ? value.columnVisibility
      : initialListState.columnVisibility,
    scrollY:
      typeof value.scrollY === 'number' && Number.isFinite(value.scrollY)
        ? value.scrollY
        : initialListState.scrollY,
    focusModelId:
      options.retainFocus && typeof value.focusModelId === 'string'
        ? value.focusModelId
        : initialListState.focusModelId,
  }
}
export function readStoredState(): ModelManagementListState {
  if (typeof window === 'undefined') return initialListState
  try {
    const value = window.sessionStorage.getItem(storageKey)
    return value
      ? normalizeModelManagementListState(JSON.parse(value))
      : initialListState
  } catch {
    return initialListState
  }
}
export function readReturnContexts(): Record<string, ModelManagementListState> {
  if (typeof window === 'undefined') return {}
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(returnStorageKey) ?? '{}'
    )
    return isRecord(parsed)
      ? Object.fromEntries(
          Object.entries(parsed)
            .filter(([, state]) => isRecord(state))
            .map(([nonce, state]) => [
              nonce,
              normalizeModelManagementListState(state, { retainFocus: true }),
            ])
        )
      : {}
  } catch {
    return {}
  }
}
export function writeReturnContexts(
  value: Record<string, ModelManagementListState>
) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(returnStorageKey, JSON.stringify(value))
  } catch {
    /* Storage is optional. */
  }
}
export function readReturnNonce(state: unknown) {
  if (!isRecord(state)) return undefined
  const candidate = state[returnStateKey]
  return isRecord(candidate) && typeof candidate.nonce === 'string'
    ? candidate.nonce
    : undefined
}
export function forwardModelManagementReturnState(
  state: unknown
): HistoryState | undefined {
  const nonce = readReturnNonce(state)
  return nonce === undefined ? undefined : { [returnStateKey]: { nonce } }
}
export function sameColumnVisibility(
  left: VisibilityState,
  right: VisibilityState
) {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => left[key] === right[key])
  )
}
export function createModelManagementReturnNonce() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
export function writeStoredState(value: ModelManagementListState) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    /* Storage is optional. */
  }
}
export function getModelManagementReturnContext(
  state: unknown
): ModelManagementReturnContext | null {
  const nonce = readReturnNonce(state)
  return nonce && readReturnContexts()[nonce] ? { nonce } : null
}
export const modelManagementReturnStateKey = returnStateKey
