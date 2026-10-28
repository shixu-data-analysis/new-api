/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { fireEvent, render, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import en from '@/i18n/locales/en.json'

import type { CanvasAgentModelPrice } from '../../types'
import { AgentModelPriceCards } from '../AgentModelPriceCards'

type Price = CanvasAgentModelPrice['priceGroups'][number]['prices'][number]

function model(name: string, price: Partial<Price>): CanvasAgentModelPrice {
  return {
    customerModelId: name,
    modelKey: name,
    effectiveDisplayName: name,
    catalogDefaultName: name,
    description: null,
    capability: 'image.generate',
    tags: [],
    iconKey: null,
    iconColor: null,
    badges: [],
    priceGroups: [
      {
        priceGroupId: 'g1',
        priceGroupName: 'Standard',
        prices: [
          {
            combinationKey: 'default',
            parameters: {},
            billingUnit: 'REQUEST',
            customerPoints: '5',
            customerTokenRates: null,
            modelPriceCny: '0.25',
            ...price,
          },
        ],
      },
    ],
  }
}

function cardOf(name: string) {
  return screen.getByText(name).closest('[data-slot=card]') as HTMLElement
}

describe('Agent model price cards', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )
  beforeEach(async () => {
    await i18next.changeLanguage('en')
  })

  afterEach(() => vi.useRealTimers())

  it('lists Token categories one per line at the multiplier now, with the model price of each, and folds plans past two', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-28T02:24:00Z')) // Wednesday 10:24 in Beijing
    const timeOfDaySchedule = {
      schemaVersion: 1 as const,
      timeZone: 'Asia/Shanghai',
      rules: [
        {
          days: [1, 2, 3, 4, 5],
          start: '09:00',
          end: '12:00',
          multiplier: '2',
        },
      ],
    }
    const token = model('DeepSeek', {
      billingUnit: 'MILLION_TOKENS',
      customerTokenRates: { input: '60', output: '240' },
      modelPriceCny: { input: '0.48', output: '1.92' },
      timeOfDaySchedule,
    })
    const plans = ['Standard', 'VIP', 'Enterprise'].map((name, index) => ({
      ...(token.priceGroups[0] as CanvasAgentModelPrice['priceGroups'][number]),
      priceGroupId: `g${index}`,
      priceGroupName: name,
    }))
    render(
      <AgentModelPriceCards
        models={[{ ...token, capability: 'chat.generate', priceGroups: plans }]}
      />
    )
    const card = within(cardOf('DeepSeek'))
    expect(card.getByText('Standard')).toBeVisible()
    expect(card.queryByText('VIP')).toBeNull()
    expect(card.getByText('120')).toBeVisible()
    expect(card.getByText('480')).toBeVisible()
    expect(
      card.getAllByTitle('Model price').map((item) => item.textContent)
    ).toEqual(['· Model price ¥0.96', '· Model price ¥3.84'])
    expect(card.getByText('Now at 2× price, ends 12:00')).toBeVisible()
    fireEvent.click(card.getByRole('button', { name: 'Other 2 price plans' }))
    expect(card.getByText('VIP')).toBeVisible()
    expect(card.getAllByText('Now at 2× price, ends 12:00')).toHaveLength(1)
    fireEvent.click(card.getByRole('button', { name: /All periods/ }))
    expect(card.getByText('Time-of-day pricing (Beijing time)')).toBeVisible()
    expect(card.getByText('Monday to Friday 09:00–12:00')).toBeVisible()
  })

  it('writes a per-request price like the model center, with the model price after the points', () => {
    render(<AgentModelPriceCards models={[model('Per request', {})]} />)
    const card = within(cardOf('Per request'))
    expect(card.getByText('Default')).toBeVisible()
    expect(card.getByText('5')).toBeVisible()
    expect(card.getByText('points per request')).toBeVisible()
    expect(card.getByTitle('Model price')).toHaveTextContent(
      '· Model price ¥0.25'
    )
  })

  it('shows the model icon and badges after the title', () => {
    render(
      <AgentModelPriceCards
        models={[
          {
            ...model('Branded', {}),
            iconKey: 'gemini',
            iconColor: 'blue',
            badges: [{ name: 'Official', color: 'green' }],
          },
        ]}
      />
    )

    const card = cardOf('Branded')
    expect(card.querySelector('.model-icon-tile use')).toHaveAttribute(
      'href',
      '#model-icon-gemini'
    )
    expect(within(card).getByText('Official')).toHaveAttribute(
      'data-model-color',
      'green'
    )
  })

  it('keeps every token category of the customer rates and of the model price', () => {
    render(
      <AgentModelPriceCards
        models={[
          model('Tokens', {
            billingUnit: 'MILLION_TOKENS',
            customerPoints: '0',
            customerTokenRates: { input: '30', output: '150' },
            modelPriceCny: { input: '3', output: '15' },
          }),
        ]}
      />
    )
    const card = within(cardOf('Tokens'))
    expect(card.getByText('30')).toBeVisible()
    expect(card.getByText('150')).toBeVisible()
    expect(
      card.getAllByTitle('Model price').map((item) => item.textContent)
    ).toEqual(['· Model price ¥3', '· Model price ¥15'])
  })

  it('does not drop a category priced on only one side', () => {
    render(
      <AgentModelPriceCards
        models={[
          model('One side', {
            billingUnit: 'MILLION_TOKENS',
            customerTokenRates: { input: '30', cacheRead: '3' },
            modelPriceCny: { input: '3', cacheWrite: '4' },
          }),
        ]}
      />
    )
    const card = within(cardOf('One side'))
    expect(card.getByText('Cache read')).toBeVisible()
    expect(card.getByText('Cache write')).toBeVisible()
    expect(
      card.getAllByTitle('Model price').map((item) => item.textContent)
    ).toEqual(['· Model price ¥3', '· Model price —', '· Model price ¥4'])
  })

  it('shows the customer rates and a dash when the model price is unavailable', () => {
    render(
      <AgentModelPriceCards
        models={[
          model('No cost', {
            billingUnit: 'MILLION_TOKENS',
            customerTokenRates: { input: '30', output: '150' },
            modelPriceCny: null,
          }),
        ]}
      />
    )
    const card = within(cardOf('No cost'))
    expect(card.getByText('150')).toBeVisible()
    expect(card.getByTitle('Model price')).toHaveTextContent('· Model price —')
  })

  it('keeps a single model price after token rates', () => {
    render(
      <AgentModelPriceCards
        models={[
          model('Mixed', {
            billingUnit: 'MILLION_TOKENS',
            customerTokenRates: { input: '30', output: '150' },
            modelPriceCny: '0.25',
          }),
        ]}
      />
    )
    const card = within(cardOf('Mixed'))
    expect(card.getByText('150')).toBeVisible()
    expect(card.getByTitle('Model price')).toHaveTextContent(
      '· Model price ¥0.25'
    )
  })

  it('keeps token model prices under a scalar customer price', () => {
    render(
      <AgentModelPriceCards
        models={[
          model('Scalar', {
            customerPoints: '7',
            modelPriceCny: { input: '3', output: '15' },
          }),
        ]}
      />
    )
    const card = within(cardOf('Scalar'))
    expect(card.getByText('7')).toBeVisible()
    expect(card.getByTitle('Model price')).toHaveTextContent(
      'Model price Input ¥3 · Output ¥15'
    )
  })

  it('shows every price of every plan on the card, like the model center', () => {
    const base = model('Wide', {})
    const [group] = base.priceGroups
    const extra = [1, 2, 3].map((n) => ({
      combinationKey: `scope-${n}`,
      parameters: { quality: `${n}K` },
      billingUnit: 'REQUEST' as const,
      customerPoints: String(10 + n),
      customerTokenRates: null,
      modelPriceCny: `0.${n}`,
    }))
    const wide = {
      ...base,
      description: 'Client description',
      priceGroups: [
        { ...group, prices: [...(group?.prices ?? []), ...extra] },
        { ...group, priceGroupId: 'g2', priceGroupName: 'Partner plan' },
      ] as CanvasAgentModelPrice['priceGroups'],
    }
    render(<AgentModelPriceCards models={[wide]} />)
    const card = within(cardOf('Wide'))
    expect(card.getByText('Standard')).toBeVisible()
    expect(card.getByText('Partner plan')).toBeVisible()
    expect(card.getByText('3K')).toBeVisible()
    expect(card.getByText('13')).toBeVisible()
    expect(card.getAllByTitle('Model price')).toHaveLength(5)
    expect(card.getByText('Client description')).toBeVisible()
  })
})
