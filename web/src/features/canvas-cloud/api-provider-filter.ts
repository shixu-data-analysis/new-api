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

/** An API provider a model table can be narrowed to. */
export interface ApiProviderOption {
  id: string
  name: string
}

/** The providers of the rows, each once, in the order their first row comes. */
export function providersOf<T>(
  rows: readonly T[],
  providerOf: (row: T) => ApiProviderOption
): ApiProviderOption[] {
  const byId = new Map<string, ApiProviderOption>()
  for (const row of rows) {
    const provider = providerOf(row)
    if (!byId.has(provider.id)) byId.set(provider.id, provider)
  }
  return [...byId.values()]
}

/**
 * The chosen provider while it still has rows; otherwise none. A provider whose last row left (restored, ignored or
 * retired) loses its button, so it stops filtering. The caller keeps the choice: when the provider has rows again after
 * a refresh, the filter applies again, as the model list has always done.
 */
export function listedProviderId(
  providers: readonly ApiProviderOption[],
  chosenId: string
): string {
  return providers.some((provider) => provider.id === chosenId) ? chosenId : ''
}
