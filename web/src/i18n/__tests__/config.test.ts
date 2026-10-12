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
import { describe, expect, it } from 'vitest'

import { INTERFACE_LANGUAGE_OPTIONS } from '../languages'

describe('interface languages', () => {
  it('bundles Simplified Chinese and English and loads every other language on first use', async () => {
    // Imported here so it initializes after the shared test setup.
    const {
      default: i18n,
      i18nReady,
      onDemandLanguages,
      resources,
    } = await import('../config')
    await i18nReady

    expect(Object.keys(resources).sort()).toEqual(['en', 'zhCN'])
    expect(
      [...Object.keys(resources), ...Object.keys(onDemandLanguages)].sort()
    ).toEqual(INTERFACE_LANGUAGE_OPTIONS.map((option) => option.code).sort())
    expect(i18n.hasResourceBundle('fr', 'translation')).toBe(false)

    await i18n.changeLanguage('fr')

    expect(i18n.hasResourceBundle('fr', 'translation')).toBe(true)
    expect(i18n.t('Description updated')).toBe('Description mise à jour')

    for (const load of Object.values(onDemandLanguages)) {
      const locale = await load()
      expect(Object.keys(locale.default.translation ?? {}).length).toBe(
        Object.keys(resources.en.translation).length
      )
    }
  })
})
