/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  inputTiersIssue,
  reasoningIssue,
} from '../catalog-edit/text-model-fields'

const t = (value: string, options?: Record<string, unknown>) =>
  Object.entries(options ?? {}).reduce(
    (text, [key, item]) => text.replace(`{{${key}}}`, String(item)),
    value
  )

describe('text model JSON fields', () => {
  it('says what is wrong with typed input tiers', () => {
    expect(inputTiersIssue('', 1_050_000, t)).toBe('')
    expect(inputTiersIssue('[128000, 272000]', 1_050_000, t)).toBe('')
    expect(inputTiersIssue('[272000, 5, 1]', 1_050_000, t)).toBe(
      'Bounds go from small to large, without repeats'
    )
    expect(inputTiersIssue('[272000', 1_050_000, t)).toMatch(/^Not valid JSON/)
    expect(inputTiersIssue('["272k"]', 1_050_000, t)).toMatch(/whole number/)
    expect(inputTiersIssue('272000', 1_050_000, t)).toMatch(/bracketed list/)
    expect(inputTiersIssue('[2000000]', 1_050_000, t)).toBe(
      'Bounds stay below the context length 1,050,000'
    )
  })

  it('says what is wrong with typed reasoning levels, the Channel mapping included', () => {
    const mapped = ['none', 'low', 'high']
    expect(
      reasoningIssue(
        '{"default":"low","levels":[{"value":"none","label":"不思考","thinking":false},{"value":"low","label":"低"}]}',
        mapped,
        t
      )
    ).toBe('')
    expect(
      reasoningIssue(
        '{"default":"x","levels":[{"value":"low","label":"低"}]}',
        mapped,
        t
      )
    ).toBe('default is the value of one level: low')
    expect(
      reasoningIssue(
        '{"default":"max","levels":[{"value":"max","label":"极高"}]}',
        mapped,
        t
      )
    ).toBe(
      'The Channel sends no fields for max; its levels are none, low, high'
    )
    expect(
      reasoningIssue(
        '{"default":"low","levels":[{"value":"Low","label":"低"}]}',
        mapped,
        t
      )
    ).toMatch(/lowercase/)
    expect(
      reasoningIssue(
        '{"default":"none","levels":[{"value":"none","label":"x","thinking":true}]}',
        mapped,
        t
      )
    ).toMatch(/can only be false/)
  })
})
