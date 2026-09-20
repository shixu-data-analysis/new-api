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

import { getCanvasPrincipalRoleLabelKey } from '@/features/canvas-cloud/access'
import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import viLocale from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

const locales = { en, fr, ja, ru, vi: viLocale, zh, 'zh-TW': zhTW }
const keys = [
  'Guest',
  'User',
  'Admin',
  'Super Admin',
  'Canvas Customer',
  'Canvas Platform Administrator',
  'Canvas Super Administrator',
] as const

describe('canvas profile localization', () => {
  it('defines canvas identity labels in all supported locales', () => {
    for (const [locale, messages] of Object.entries(locales)) {
      for (const key of keys) {
        expect(
          (messages.translation as Record<string, string>)[key],
          `${locale}: ${key}`
        ).toBeTruthy()
      }
    }
  })

  it('uses the localized product name in Chinese interfaces', () => {
    expect(zh.translation['Canvas Platform Administrator']).toBe(
      '画布平台管理员'
    )
    expect(zh.translation['Canvas Customer']).toBe('画布客户')
    expect(zhTW.translation['Canvas Platform Administrator']).toBe(
      '畫布平台管理員'
    )
    expect(zhTW.translation['Canvas Customer']).toBe('畫布客戶')
    expect(zh.translation['Canvas Super Administrator']).toBe('画布超级管理员')
    expect(zhTW.translation['Canvas Super Administrator']).toBe(
      '畫布超級管理員'
    )
  })

  it('maps every canvas principal type to its distinct role label', () => {
    expect(getCanvasPrincipalRoleLabelKey('CUSTOMER')).toBe('Canvas Customer')
    expect(getCanvasPrincipalRoleLabelKey('PLATFORM_ADMIN')).toBe(
      'Canvas Platform Administrator'
    )
    expect(getCanvasPrincipalRoleLabelKey('SUPER_ADMIN')).toBe(
      'Canvas Super Administrator'
    )
  })
})
