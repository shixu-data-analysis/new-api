/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createContext } from 'react'

import type {
  ModelManagementListState,
  ModelManagementReturnContext,
} from './model-management-navigation-state'

export interface ModelManagementNavigationValue {
  listState: ModelManagementListState
  updateListState: (update: Partial<ModelManagementListState>) => void
  captureReturnContext: (focusModelId: string) => ModelManagementReturnContext
  consumeReturnContext: (nonce: string) => void
}

export const ModelManagementNavigationContext =
  createContext<ModelManagementNavigationValue | null>(null)
