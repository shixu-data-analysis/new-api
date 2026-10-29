/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  formatAgentTaskTimePrice,
  formatAgentUsage,
} from '../agent-usage-format'
import type { CanvasAgentModelUsageRow } from '../types'

const t = ((key: string) => key) as never
const row = (usage: Partial<CanvasAgentModelUsageRow['usage']>) =>
  ({
    billingUnit: 'MILLION_TOKENS',
    usage: {
      requests: '0',
      seconds: '0',
      inputTokens: '0',
      outputTokens: '0',
      cacheReadTokens: '0',
      cacheWriteTokens: '0',
      imageInputTokens: '0',
      ...usage,
    },
  }) as unknown as CanvasAgentModelUsageRow

describe('agent usage of a Token-billed image (IMAGE-TOKEN-BILLING-001)', () => {
  it('lists text input, image input and output as the model is priced', () => {
    const price = { input: '29', imageInput: '47', output: '176' }
    expect(
      formatAgentUsage(
        row({
          inputTokens: '36',
          imageInputTokens: '2048',
          outputTokens: '3512',
        }),
        price,
        t,
        'en-US'
      )
    ).toBe('Text input 36 · Image input 2,048 · Output 3,512 Tokens')
    expect(
      formatAgentTaskTimePrice(row({}), price, 'CURRENT' as never, t, 'en-US')
    ).toBe('Text input ¥29 · Image input ¥47 · Output ¥176 / million Tokens')
  })

  it('keeps "Input" for a model without image input', () => {
    expect(
      formatAgentUsage(
        row({ inputTokens: '1130', outputTokens: '1292' }),
        { input: '4', output: '90' },
        t,
        'en-US'
      )
    ).toBe('Input 1,130 · Output 1,292 Tokens')
  })
})
