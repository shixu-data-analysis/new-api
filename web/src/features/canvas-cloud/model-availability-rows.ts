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
export function disabledRows(models: DisabledModel[]): AvailabilityModelRow[] {
  const listed = models.filter((model) => model.upstreamStatus === 'AVAILABLE')
  const others = models.filter((model) => model.upstreamStatus !== 'AVAILABLE')
  return [...listed, ...others].map((model) => ({ kind: 'disabled', model }))
}
