/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

import type { CanvasTokenCategory } from '../types'

/** Token categories in display order, with their translation keys. */
export const tokenCategoryLabel: Record<CanvasTokenCategory, string> = {
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
}

/** "Input 2 · Output 4": the priced categories in display order. */
export function tokenRateSummary(
  rates: Partial<Record<CanvasTokenCategory, string>>,
  t: (key: string) => string
) {
  return (Object.keys(tokenCategoryLabel) as CanvasTokenCategory[])
    .filter((category) => typeof rates[category] === 'string')
    .map((category) => `${t(tokenCategoryLabel[category])} ${rates[category]}`)
    .join(' · ')
}
