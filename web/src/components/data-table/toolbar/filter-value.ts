/*
Copyright (C) 2023-2026 QuantumNous
*/

export function getDataTableSelectedFilterValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is string => typeof item === 'string' && item !== 'all'
    )
  }
  if (typeof value === 'string' && value !== 'all') {
    return [value]
  }
  return []
}

export function hasDataTableLegacyAllFilterValue(value: unknown): boolean {
  return Array.isArray(value) ? value.includes('all') : value === 'all'
}

export function isDataTableFilterValueActive(value: unknown): boolean {
  return getDataTableSelectedFilterValues(value).length > 0
}
