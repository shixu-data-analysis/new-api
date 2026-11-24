/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { DisabledModel, MissingModel } from './model-availability-api'

/** The model a row's action changes, with the state the change starts from. */
export interface AvailabilityControl {
  modelKey: string
  displayName: string
  controlVersion: number
  enabled: boolean
}

/** A row of the availability page's model tables: missing and disabled models share one set of columns. */
export type AvailabilityModelRow =
  | { kind: 'missing'; model: MissingModel }
  | { kind: 'disabled'; model: DisabledModel }

/** Models the provider lists again come first: they are the ones that can be restored now. */
/** The table's rows: missing models first, to be handled, then disabled models, the ones the provider lists again first. */
export function availabilityRows(
  missing: MissingModel[],
  disabled: DisabledModel[]
): AvailabilityModelRow[] {
  const listed = disabled.filter(
    (model) => model.upstreamStatus === 'AVAILABLE'
  )
  const others = disabled.filter(
    (model) => model.upstreamStatus !== 'AVAILABLE'
  )
  return [
    ...missing.map((model) => ({ kind: 'missing' as const, model })),
    ...[...listed, ...others].map((model) => ({
      kind: 'disabled' as const,
      model,
    })),
  ]
}

/** The provider's last answer a row shows; a missing model is missing by definition. */
export type AvailabilityUpstreamFilter =
  | 'AVAILABLE'
  | 'SUSPECTED'
  | 'MISSING'
  | 'NOT_PROBED'

export function rowUpstreamStatus(
  row: AvailabilityModelRow
): AvailabilityUpstreamFilter {
  if (row.kind === 'missing') return 'MISSING'
  return row.model.upstreamStatus ?? 'NOT_PROBED'
}

export interface AvailabilityFilters {
  providerId: string
  state: '' | AvailabilityModelRow['kind']
  model: string
  upstreamId: string
  upstream: '' | AvailabilityUpstreamFilter
  reason: string
}

export const emptyAvailabilityFilters: AvailabilityFilters = {
  providerId: '',
  state: '',
  model: '',
  upstreamId: '',
  upstream: '',
  reason: '',
}

const contains = (value: string, query: string) =>
  value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())

/** Every chosen filter must hold; text matches any part, ignoring case. */
export function matchesAvailabilityFilters(
  row: AvailabilityModelRow,
  filters: AvailabilityFilters
): boolean {
  if (filters.providerId && row.model.providerId !== filters.providerId) {
    return false
  }
  if (filters.state && row.kind !== filters.state) return false
  if (filters.model.trim() && !contains(row.model.displayName, filters.model)) {
    return false
  }
  if (
    filters.upstreamId.trim() &&
    !row.model.upstreamIds.some((id) => contains(id, filters.upstreamId))
  ) {
    return false
  }
  if (filters.upstream && rowUpstreamStatus(row) !== filters.upstream) {
    return false
  }
  const reason = row.kind === 'disabled' ? row.model.disabledReason : null
  return !filters.reason || reason === filters.reason
}
