/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { TFunction } from 'i18next'

/** A Profile stores the workflow as an identifier; pages show this name. */
export function workflowLabel(t: TFunction, workflow: unknown): string {
  if (workflow === 'sync') return t('Synchronous (result returned directly)')
  if (workflow === 'async') return t('Asynchronous (query after submit)')
  if (workflow === 'asset-async') {
    return t('Upload materials, then asynchronous')
  }
  return String(workflow ?? '')
}

export function workflowShortLabel(t: TFunction, workflow: unknown): string {
  if (workflow === 'sync') return t('Synchronous')
  if (workflow === 'async') return t('Asynchronous')
  return workflowLabel(t, workflow)
}
