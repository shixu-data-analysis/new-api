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
  'Immediate grant',
  'Scheduled grant',
  'Scheduled time must be in the future',
  'Select at least one eligible customer',
  'Enter a valid recharge amount',
  'End time must not be earlier than start time',
  'Select current page',
  'Select all {{count}} matching customers',
  'Unable to select matching customers',
  'Eligibility basis',
  'Retry failed customers',
  'Disable activity',
  'Bonus per code: {{points}} points · Valid for {{days}} days after redemption',
  'Valid for {{days}} days after registration credit',
  'Canvas access activated · Bonus points credited: {{points}}',
  'Recharge code redeemed · Purchased {{purchased}} points · Bonus {{bonus}} points',
  'Activity status PENDING',
  'Activity status WAITING',
  'Activity status PARTIAL_FAILED',
  'Activity status STOPPED',
  'Manual grant result PROCESSING',
  'Manual grant result SUCCEEDED',
  'The original plan remains effective until this update is confirmed.',
  'Points per customer: {{before}} → {{after}}',
  'Bonus validity: {{before}} → {{after}} days',
  'Reason changed',
  'Scheduled time changed',
  'Membership before {{before}} · Added {{added}} · Removed {{removed}} · After {{after}}',
  'Confirm publish',
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
  'Binding records',
  'No binding records',
  'No binding records match the current filters',
  'Grant records',
  'No grant records',
  'No grant records match the current filters',
  'Stop activity',
  'Confirm stop',
  'Activity period',
  'Points per million tokens',
  'Participation tasks',
  'No participation tasks',
  'No participation tasks match the current filters',
  'New quotes will use the applicable normal price. Accepted tasks retain their frozen special price.',
  'Redemption status',
  'Redemption status UNREDEEMED',
  'Redemption status REDEEMED',
  'Execution status ACCEPTED',
  'Execution status PROCESSING',
  'Execution status SUCCEEDED',
  'Execution status CONFIRMED_FAILED',
  'Execution status UNKNOWN',
  'Settlement progress FROZEN',
  'Settlement progress SETTLED',
  'Settlement progress RELEASED_FAILED',
  'Settlement progress RELEASED_TIMEOUT',
  'One or more selected customers no longer meet the activity requirements',
  'Customer no longer exists',
  'Customer is no longer active',
  'Customer eligibility changed',
  'Recharge threshold grants use CNY only',
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
