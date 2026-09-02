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
const guidedPricingKeys = [
  'Published point issuance rate',
  'How often do you expect this task to succeed?',
  'What does one attempt cost?',
  'Service provider cost when successful',
  'Unrecoverable service provider cost when failed',
  'How many points should the customer pay?',
  'Pricing recommendation',
] as const
const modelIdentityKeys = ['Search model name or ID', 'Model ID'] as const
const inviteBonusKeys = [
  'Bonus promotion',
  'Initial Bonus points',
  'Bonus validity days',
  'Initial Bonus',
  'Optional',
] as const
const inviteStatusKeys = [
  'Invite status DRAFT',
  'Invite status ACTIVE',
  'Invite status PAUSED',
  'Invite status REVOKED',
  'Invite status EXPIRED',
] as const
const paidExpiryKeys = [
  'Task and point policy settings',
  'Paid points validity',
  'Whole days from 1 to 3650. Default: 90 days (3 months).',
  'This applies only to Paid points issued by recharge-code redemption after publication. Existing Paid points without an expiry remain valid, and Bonus points keep their separate validity.',
  'Enter a whole number from 1 to 3650',
  'Published settings are versioned. Paid validity applies only to newly redeemed Paid points; Bonus keeps its own independent validity and failure-grace rules.',
] as const
const pointAdjustmentKeys = [
  'Customer name',
  'Search customer name',
  'Record externally confirmed refund',
  'Refund point recovery',
  'Open refund point recovery',
  'Prefilled customer',
  'Canvas recharge order number or customer',
  'Fuzzy matches the Canvas recharge order number or customer name. A customer opened from Customers & Points remains scoped to that customer.',
  'Canvas recharge order',
  'Customer confirmation reference',
  'Calculated points',
  'Grant Bonus points',
  'Correct Paid points',
  'Deduct from a Point Lot',
  'Unknown status',
  'In review',
  'Recovered',
  'Waived',
  'CONFIGURATION',
  'PAYMENT',
  'TASK_EXECUTION',
  'Unknown category',
  'Unknown action',
  'Unknown outcome',
  'Unknown actor',
  'Unknown resource',
  'Unknown reason',
] as const

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
    expect(zh.translation['Provider channel']).toBe('服务商渠道')
    expect(
      zh.translation[
        'The reviewed RMB Provider cost of one successful chargeable attempt. A confirmed change creates a new immutable published version.'
      ]
    ).not.toMatch(/Provider/i)
  })

  it.each(Object.entries(localizedResources))(
    'translates every guided pricing label in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of guidedPricingKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )

  it.each(Object.entries(localizedResources))(
    'translates model identity labels in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of modelIdentityKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )

  it.each(Object.entries(localizedResources))(
    'localizes invite promotional-point labels in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of inviteBonusKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
        expect(translations[key], key).not.toMatch(/Bonus|Optional/i)
      }
    }
  )

  it.each(Object.entries(localizedResources))(
    'localizes Paid expiry policy in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of paidExpiryKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )

  it.each(Object.entries(localizedResources))(
    'localizes administrator point adjustment and recovery states in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of pointAdjustmentKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )

  it.each(Object.entries(localizedResources))(
    'localizes every invite status in %s',
    (_locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of inviteStatusKeys) {
        expect(translations[key], key).toBeTypeOf('string')
        expect(translations[key], key).not.toBe(key)
      }
    }
  )

  it('distinguishes valid code states from activation actions in Chinese', () => {
    expect(zh.translation['Invite status ACTIVE']).toBe('有效')
    expect(zh.translation.Valid).toBe('有效')
    expect(zh.translation['Activation time']).toBe('生效时间')
    expect(zhTW.translation['Invite status ACTIVE']).toBe('有效')
    expect(zhTW.translation.Valid).toBe('有效')
    expect(zhTW.translation['Activation time']).toBe('生效時間')
  })

  it('uses display wording for the Chinese column visibility control', () => {
    expect(zh.translation.View).toBe('显示')
    expect(zhTW.translation.View).toBe('顯示')
  })
})
