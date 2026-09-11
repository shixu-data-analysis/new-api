/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const localeNames = ['zh', 'zh-TW', 'fr', 'ru', 'ja', 'vi']
const activityKeys = [
  'Activity management',
  'Create activity',
  'Activity name',
  'Activity status',
  'Activity created',
  'Grant timing',
  'Scheduled grant',
  'Select all {{count}} matching customers',
  'Eligibility basis',
  'Retry failed customers',
  'Disable activity',
  'Bonus per code: {{points}} points · Valid for {{days}} days after redemption',
  'Valid for {{days}} days after registration credit',
  'Canvas access activated · Bonus points credited: {{points}}',
  'Recharge code redeemed · Purchased {{purchased}} points · Bonus {{bonus}} points',
  'Activity status PENDING',
  'Activity status PARTIAL_FAILED',
  'Activity status STOPPED',
  'Manual grant result PROCESSING',
  'Manual grant result SUCCEEDED',
  'Source model',
  'Source price version',
  'Published base price',
  'Special input token rate',
  'Special output token rate',
  'Token category pricing reference',
  'Base → special',
  'Points per RMB',
  'Pricing cost reference',
  'Special price (RMB)',
  'Difference (RMB)',
  'Below cost reference',
  'This category cannot be evaluated yet.',
  'Historical pricing facts are frozen at publication and may differ from current pricing.',
  'Activity update conflict',
  'Affected customers',
  '{{count}} more affected customers are not shown.',
  'An overlapping activity already applies to this source and period.',
  'View conflicting activity',
] as const

async function readLocale(locale: string): Promise<Record<string, string>> {
  const filename = path.join(
    process.cwd(),
    'src/i18n/locales',
    `${locale}.json`
  )
  const parsed = JSON.parse(await readFile(filename, 'utf8')) as {
    translation: Record<string, string>
  }
  return parsed.translation
}

describe('activity management translations', () => {
  it('provides a non-fallback value for every supported language', async () => {
    const english = await readLocale('en')

    for (const localeName of localeNames) {
      const locale = await readLocale(localeName)
      for (const key of activityKeys) {
        expect(locale[key], `${localeName}: ${key}`).toBeTruthy()
        expect(locale[key], `${localeName}: ${key}`).not.toBe(english[key])
      }
    }
  })
})
