/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useLocation } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  ModelManagementNavigationContext,
  type ModelManagementNavigationValue,
} from './model-management-navigation-context'
import {
  createModelManagementReturnNonce,
  readReturnContexts,
  readReturnNonce,
  readStoredState,
  sameColumnVisibility,
  writeReturnContexts,
  writeStoredState,
} from './model-management-navigation-state'

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
            sameColumnVisibility(
              current.columnVisibility,
              next.columnVisibility
            ) &&
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
        const nonce = createModelManagementReturnNonce()
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
