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
/**
 * Models disabled by hand stay out of the list until asked for. A search shows them anyway: someone looking for a
 * model by name must not conclude it has vanished.
 */
export function visibleInList<T extends { modelDisabled: boolean }>(
  models: T[],
  options: { showDisabled: boolean; searching: boolean }
): T[] {
  if (options.showDisabled || options.searching) return models
  return models.filter((model) => !model.modelDisabled)
}
