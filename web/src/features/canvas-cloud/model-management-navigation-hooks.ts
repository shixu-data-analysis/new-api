/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useContext } from 'react'

import { ModelManagementNavigationContext } from './model-management-navigation-context'

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
