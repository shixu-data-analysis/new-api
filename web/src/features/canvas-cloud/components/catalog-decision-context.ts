/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createContext, useContext, useMemo } from 'react'

import type { ModelCatalogDecision } from '../generated/model-catalog-import'

interface CatalogDecisionState {
  decisions: ModelCatalogDecision[]
  busy: boolean
  onToggle: (decision: ModelCatalogDecision, overridden: boolean) => void
}

const CatalogDecisionContext = createContext<CatalogDecisionState>({
  decisions: [],
  busy: false,
  onToggle: () => undefined,
})

export const CatalogDecisionProvider = CatalogDecisionContext.Provider

export function useCatalogDecision(
  resourceType: ModelCatalogDecision['resourceType'],
  key: string
) {
  const state = useContext(CatalogDecisionContext)
  return useMemo(
    () => ({
      ...state,
      decision: state.decisions.find(
        (entry) => entry.resourceType === resourceType && entry.key === key
      ),
    }),
    [state, resourceType, key]
  )
}
