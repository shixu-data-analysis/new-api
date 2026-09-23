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
import viLocale from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

const locales = { en, fr, ja, ru, vi: viLocale, zh, 'zh-TW': zhTW }
const keys = [
  'Canvas administrator access',
  'Canvas super administrator initialized successfully',
  'Failed to initialize the Canvas super administrator',
  'Canvas platform administrator access granted successfully',
  'Failed to grant Canvas platform administrator access',
  'Customer accounts cannot receive Canvas administrator access. Create a separate administrator account.',
  'Roles are fixed after creation. Only the super administrator can create administrator accounts.',
  'Confirm password',
  'New Password',
  'Confirm New Password',
  'Show password',
  'Hide password',
  'Please confirm your password',
  'Passwords do not match',
  'Loading Canvas administrator status...',
  'Failed to load Canvas administrator status. Retry',
  'Canvas super administrator initialized',
  'Canvas super administrator initialized by another root user',
  'Canvas platform administrator access granted',
  'Enable this user before granting Canvas administrator access',
  'Initialize Canvas super administrator once',
  'Grant Canvas platform administrator access',
  'This one-time action grants your current root account full Canvas administration access. Confirm only if this is the intended account.',
  'Grant {{username}} Canvas platform administrator access? This grants Canvas management privileges but does not change the account role.',
  'Canvas super administrator initialization conflict',
  'The signed-in root identity does not match this user record',
  'Initialize the Canvas super administrator before granting platform administrator access',
  'Resolve the Canvas super administrator conflict before granting platform administrator access',
  'Only the initialized Canvas super administrator can grant platform administrator access',
  'Deleted users cannot receive Canvas administrator access',
  'Complete administrator setup',
  'Complete administrator setup for {{username}}? This grants Canvas platform management access.',
  'Account role',
] as const

describe('canvas administrator provisioning localization', () => {
  it('defines every provisioning message in all supported locales', () => {
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
    for (const key of keys.filter((candidate) =>
      candidate.includes('Canvas')
    )) {
      expect((zh.translation as Record<string, string>)[key]).not.toContain(
        'Canvas'
      )
      expect((zhTW.translation as Record<string, string>)[key]).not.toContain(
        'Canvas'
      )
    }
  })
})
