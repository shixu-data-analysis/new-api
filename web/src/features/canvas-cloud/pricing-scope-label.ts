/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

/** Whether a model is priced by the video totals only, named by their video input in prices. */
export function videoTotalPricing(categories: readonly string[]): boolean {
  return (
    categories.length > 0 &&
    categories.every(
      (category) => category === 'total' || category === 'totalWithVideoInput'
    )
  )
}

export function pricingScopeLabel(
  scope: { key: string; parameters: Record<string, unknown> } | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (!scope) return t('Not recorded')
  const entries = Object.entries(scope.parameters)
  if (entries.length > 0) {
    return entries
      .map(
        ([key, value]) =>
          `${t('{{label}}: ', { label: key === 'quality' ? t('Quality') : key })}${String(value)}`
      )
      .join(' · ')
  }
  return scope.key === 'default' ? t('Default scope') : scope.key
}
