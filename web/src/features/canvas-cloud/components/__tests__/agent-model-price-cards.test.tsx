/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { fireEvent, render, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

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

  it('shows the customer points and the model price the agent pays for a per-request price', () => {
    render(<AgentModelPriceCards models={[model('Per request', {})]} />)
    const card = within(cardOf('Per request'))
    expect(card.getByText('Customer points')).toBeVisible()
    expect(card.getByText('5')).toBeVisible()
    expect(card.getByText('Model price')).toBeVisible()
    expect(card.getByText('¥0.25')).toBeVisible()
    expect(card.getByText('Default scope · Per request')).toBeVisible()
  })

  it('keeps every token category with both its customer rate and its model price', () => {
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
    expect(card.getByText('Input').parentElement).toHaveTextContent('30 / ¥3')
    expect(card.getByText('Output').parentElement).toHaveTextContent(
      '150 / ¥15'
    )
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
    expect(card.getByText('Input').parentElement).toHaveTextContent('30 / ¥3')
    expect(card.getByText('Cache read').parentElement).toHaveTextContent(
      '3 / —'
    )
    expect(card.getByText('Cache write').parentElement).toHaveTextContent(
      '— / ¥4'
    )
  })

  it('shows the customer rates when the model price is unavailable', () => {
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
    expect(card.getByText('Input').parentElement).toHaveTextContent('30 / —')
    expect(card.getByText('Output').parentElement).toHaveTextContent('150 / —')
  })

  it('keeps the joined text when token rates meet a single model price', () => {
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
    expect(card.getByText('Input: 30 · Output: 150')).toBeVisible()
    expect(card.getByText('¥0.25')).toBeVisible()
  })

  it('keeps the joined text when a scalar customer price meets token model prices', () => {
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
    expect(card.getByText('Input: ¥3 · Output: ¥15')).toBeVisible()
  })

  it('reaches prices beyond the card through the full view without losing the card figures', async () => {
    const base = model('Wide', {})
    const [group] = base.priceGroups
    const extra = [1, 2, 3].map((n) => ({
      combinationKey: `scope-${n}`,
      parameters: {},
      billingUnit: 'REQUEST' as const,
      customerPoints: String(10 + n),
      customerTokenRates: null,
      modelPriceCny: `0.${n}`,
    }))
    const wide = {
      ...base,
      priceGroups: [
        { ...group, prices: [...(group?.prices ?? []), ...extra] },
      ] as CanvasAgentModelPrice['priceGroups'],
    }
    render(<AgentModelPriceCards models={[wide]} />)
    const card = within(cardOf('Wide'))
    expect(card.getByText('Price plans: 1 · Prices: 4')).toBeVisible()
    expect(card.getAllByText('Model price')).toHaveLength(2)
    fireEvent.click(card.getByRole('button', { name: 'View all prices' }))
    expect(await screen.findByText('13')).toBeVisible()
    expect(screen.getByText('¥0.3')).toBeVisible()
  })
})
