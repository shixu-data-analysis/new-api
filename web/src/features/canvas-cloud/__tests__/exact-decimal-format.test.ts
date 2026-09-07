/* Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later. */
import { describe, expect, it } from 'vitest'

import { formatExactRmbReference } from '../point-conversion-types'

describe('exact decimal display', () => {
  it.each(['en-US', 'zh-CN', 'zh-TW', 'fr', 'ru', 'ja', 'vi'])(
    'preserves large integer and fractional precision in %s',
    (locale) => {
      const separator = new Intl.NumberFormat(locale)
        .formatToParts(1.1)
        .find((part) => part.type === 'decimal')?.value
      expect(separator).toBeDefined()
      const integer = new Intl.NumberFormat(locale).format(9007199254740993n)
      expect(formatExactRmbReference('9007199254740993.12345678', locale)).toBe(
        `${integer}${separator}12345678`
      )
      expect(formatExactRmbReference('-0.12345678', locale)).toBe(
        `-0${separator}12345678`
      )
    }
  )
  it('keeps the existing insignificant-zero convention without losing negative amounts', () => {
    expect(formatExactRmbReference('87.65431380', 'en-US')).toBe('87.6543138')
    expect(formatExactRmbReference('-1234.50000000', 'en-US')).toBe('-1,234.5')
    expect(formatExactRmbReference('0.00000000', 'en-US')).toBe('0')
  })

  it.each(['en-US', 'zh-CN', 'zh-TW', 'fr', 'ru', 'ja', 'vi'])(
    'rounds to a fixed two-decimal display without converting through Number in %s',
    (locale) => {
      const decimal = new Intl.NumberFormat(locale)
        .formatToParts(1.1)
        .find((part) => part.type === 'decimal')?.value
      const integer = new Intl.NumberFormat(locale).format(9007199254740993n)
      expect(formatExactRmbReference('9007199254740993.126', locale, 2)).toBe(
        `${integer}${decimal}13`
      )
      expect(formatExactRmbReference('-0.005', locale, 2)).toBe(
        `-0${decimal}01`
      )
      expect(formatExactRmbReference('0', locale, 2)).toBe(`0${decimal}00`)
    }
  )
})
