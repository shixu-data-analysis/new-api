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

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { canvasBusinessTermConfig } from '../business-terms'

const localizedResources = { fr, ja, ru, vi, 'zh-TW': zhTW, zh }
const canvasKeys = Object.keys(en.translation).filter((key) =>
  key.includes('Canvas')
)
const businessTermKeys = Object.values(canvasBusinessTermConfig).flatMap(
  (group) => [group.helpKey, ...Object.values(group.labels)]
)

describe('Canvas interface localization', () => {
  it.each(Object.entries(localizedResources))(
    'translates every Canvas label in %s without retaining the English word',
    (_locale, resource) => {
      for (const key of canvasKeys) {
        const value =
          resource.translation[key as keyof typeof resource.translation]
        expect(value, key).toBeTypeOf('string')
        expect(value, key).not.toMatch(/Canvas/i)
      }
    }
  )

  it.each(Object.entries({ en, ...localizedResources }))(
    'defines every configured business term in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of businessTermKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe('')
      }
    }
  )

  it('uses customer-facing Chinese instead of raw point codes', () => {
    expect(zh.translation.Points).toBe('积分')
    expect(zh.translation['Bonus points']).toBe('赠送积分')
    expect(zh.translation.Issued).toBe('发放')
    expect(zh.translation['Invite registration']).toBe('邀请注册')
  })
})
