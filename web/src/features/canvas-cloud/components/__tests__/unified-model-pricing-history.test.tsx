/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import fr from '@/i18n/locales/fr.json'

import type {
  CanvasModelPricingDetail,
  CanvasModelPricingLegacyFacts,
  CanvasModelPricingPublication,
} from '../../types'
import { UnifiedModelPricingHistory } from '../UnifiedModelPricingHistory'

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  publication: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('../../api', () => ({
  getCanvasModelPricingHistory: mocks.history,
  getCanvasModelPricingPublication: mocks.publication,
  cancelCanvasModelPricingSchedule: mocks.cancel,
}))

const detail: CanvasModelPricingDetail = {
  model: {
    id: 'model-1',
    modelKey: 'video',
    name: 'Video',
    capability: 'video.generate',
    status: 'ACTIVE',
    billingUnit: 'SECOND',
    allowedBillingUnits: ['SECOND'],
    tokenCategories: [],
    hasPublishedPricing: true,
    combinations: [
      {
        id: 'combination-1',
        key: 'HD',
        parameters: { quality: 'HD' },
        enabled: false,
      },
    ],
  },
  priceGroups: [
    { id: 'group-1', code: 'STANDARD', internalName: 'Standard' },
    { id: 'group-2', code: 'PREMIUM', internalName: 'Premium' },
  ],
  pricingScopes: [],
}
const questionnaire = {
  targetMarginRate: '0.2',
  successfulTaskCostRmb: '0.02',
  failedUnrecoverableCostRmb: '0.01',
  successProbability: '0.9',
  otherVariableCostRmb: '0.1',
  riskBufferRmb: '0.2',
  decisionSummary: 'Frozen reason',
  evidenceRefs: ['evidence-1'],
}
function legacyFacts(
  values: Partial<CanvasModelPricingLegacyFacts> = {}
): CanvasModelPricingLegacyFacts {
  return {
    id: 'legacy-fact-1',
    version: 1,
    status: 'PUBLISHED',
    billingUnit: 'REQUEST',
    tokenRates: null,
    effectiveAt: '2026-09-09T00:00:00.000Z',
    ...values,
  }
}
const providerRate = {
  billingUnit: 'SECOND' as const,
  nativeAmount: '0.01',
  tokenRates: null,
  currency: 'USD',
  exchangeRateSnapshot: {
    rate: '7.2',
    source: 'FROZEN',
    asOf: '2026-09-09T00:00:00.000Z',
  },
  normalizedAmountMinor: '7',
  normalizedTokenRates: null,
  failureChargePolicy: { mode: 'NONE' as const },
}
const unified = {
  id: 'publication-1',
  customerModelId: 'model-1',
  source: 'UNIFIED',
  version: 2,
  status: 'CURRENT',
  change: 'PRICE',
  effectiveAt: '2026-09-09T00:00:00.000Z',
  createdAt: '2026-09-09T00:00:00.000Z',
  billingUnit: 'SECOND',
  actor: {
    principalId: 'admin',
    displayName: 'Admin',
    principalType: 'PLATFORM_ADMIN',
  },
  decisionSummary: 'Frozen decision',
  scopeSummary: [
    {
      combinationId: 'combination-1',
      priceGroupId: 'group-1',
      changeKind: 'PRICE',
      providerRateVersionId: 'rate-2',
      priceVersionId: 'price-2',
      rateCurrent: true,
      priceCurrent: true,
    },
  ],
  preview: {
    id: 'preview',
    expiresAt: '2026-09-09T00:00:00.000Z',
    customerModelId: 'model-1',
    billingUnit: 'SECOND',
    effectiveAt: '2026-09-09T00:00:00.000Z',
    pointIssuanceRate: { id: 'issuance', version: 1, pointsPerRmb: '100' },
    unitChange: { from: 'SECOND', to: 'SECOND', changed: false },
    conflicts: [],
    canPublish: true,
    scopes: [
      {
        parameterCombinationId: 'combination-1',
        combinationKey: 'HD',
        parameters: { quality: 'HD' },
        currentProviderRate: providerRate,
        proposedProviderRate: {
          ...providerRate,
          nativeAmount: '0.02',
          normalizedAmountMinor: '14',
        },
        costChanged: true,
        prices: [
          {
            priceGroupId: 'group-1',
            action: 'SET',
            current: {
              billingUnit: 'SECOND',
              points: '8',
              tokenRates: null,
              questionnaire,
            },
            proposed: {
              billingUnit: 'SECOND',
              points: '12',
              tokenRates: null,
              questionnaire,
              calculation: {
                baseRatePointsPerRmb: '100',
                kTheoryRmb: '0.02',
                kPricingRmb: '0.03',
                breakEvenPointsCeil: '2',
                targetMarginPointsCeil: '3',
              },
            },
            calculation: {
              baseRatePointsPerRmb: '100',
              kTheoryRmb: '0.02',
              kPricingRmb: '0.03',
              breakEvenPointsCeil: '2',
              targetMarginPointsCeil: '3',
            },
            changed: true,
          },
        ],
      },
    ],
  },
} satisfies CanvasModelPricingPublication

const scopeVariants = [
  { id: 'default-scope', key: 'default', parameters: {} },
  { id: 'quality-scope', key: 'quality', parameters: { quality: 'HD' } },
  { id: 'raw-scope', key: 'legacy-mode', parameters: {} },
  { id: 'pricing-scope', key: 'duration', parameters: { duration: 10 } },
  { id: 'missing-scope', key: 'missing', parameters: {} },
]

function scopeDetail(): CanvasModelPricingDetail {
  return {
    ...detail,
    model: {
      ...detail.model,
      combinations: scopeVariants.slice(0, 3).map((scope) => ({
        ...scope,
        enabled: true,
      })),
    },
    pricingScopes: [
      {
        parameterCombinationId: 'pricing-scope',
        combinationKey: 'duration',
        parameters: { duration: 10 },
        enabled: true,
        currentProviderRate: null,
        prices: [],
      },
    ],
  }
}

function publicationForScopes(): CanvasModelPricingPublication {
  return {
    ...unified,
    scopeSummary: scopeVariants.map((scope) => ({
      ...unified.scopeSummary[0],
      combinationId: scope.id,
    })),
    preview: {
      ...unified.preview,
      scopes: scopeVariants.map((scope) => ({
        ...unified.preview.scopes[0],
        parameterCombinationId: scope.id,
        combinationKey: scope.key,
        parameters: scope.parameters,
      })),
    },
  }
}

function renderHistory(
  initialPublicationId?: string,
  detailOverride: CanvasModelPricingDetail = detail
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <UnifiedModelPricingHistory
        modelId='model-1'
        detail={detailOverride}
        initialPublicationId={initialPublicationId}
      />
    </QueryClientProvider>
  )
}

function useMobileViewport() {
  const originalMatchMedia = window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: query === '(max-width: 640px)',
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
  return () =>
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: originalMatchMedia,
    })
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.history.mockResolvedValue({
    items: [unified],
    total: 1,
    page: 1,
    pageSize: 20,
  })
})

afterEach(async () => {
  await i18next.changeLanguage('en')
})

it('uses the selected French language for frozen rates and status labels', async () => {
  i18next.addResourceBundle('fr', 'translation', fr.translation, true, true)
  await i18next.changeLanguage('fr')
  renderHistory()
  fireEvent.click(
    await screen.findByRole('button', { name: fr.translation.Details })
  )
  expect(screen.getByText(fr.translation.Current)).toBeVisible()
  expect(screen.getAllByText(/0,02/).length).toBeGreaterThan(0)
  expect(screen.queryByText('CURRENT')).not.toBeInTheDocument()
  expect(screen.queryByText(/SECOND/)).not.toBeInTheDocument()
})

describe('UnifiedModelPricingHistory', () => {
  it('labels an empty default scope for the history list', async () => {
    const defaultDetail: CanvasModelPricingDetail = {
      ...detail,
      model: {
        ...detail.model,
        combinations: [
          {
            id: 'default-scope',
            key: 'default',
            parameters: {},
            enabled: true,
          },
        ],
      },
    }
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          scopeSummary: [
            { ...unified.scopeSummary[0], combinationId: 'default-scope' },
          ],
          preview: {
            ...unified.preview,
            scopes: [
              {
                ...unified.preview.scopes[0],
                parameterCombinationId: 'default-scope',
                combinationKey: 'default',
                parameters: {},
              },
            ],
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })

    renderHistory(undefined, defaultDetail)
    expect(await screen.findByText('Default scope')).toBeVisible()
  })

  it('uses factual fallback labels in the list and its expanded scope details', async () => {
    mocks.history.mockResolvedValue({
      items: [publicationForScopes()],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory(undefined, scopeDetail())

    expect(
      await screen.findByText(
        /Default scope, Quality: HD, legacy-mode, duration: 10, Not recorded/
      )
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByText('Default scope')).toBeVisible()
    expect(screen.getByText('duration: 10')).toBeVisible()
  })

  it('keeps the selected default-scope filter value as its ID', async () => {
    renderHistory(undefined, scopeDetail())
    await waitFor(() => expect(mocks.history).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    const combination = await screen.findByLabelText('Combination')
    expect(screen.getByRole('option', { name: 'Default scope' })).toHaveValue(
      'default-scope'
    )
    fireEvent.change(combination, { target: { value: 'default-scope' } })
    await waitFor(() =>
      expect(mocks.history).toHaveBeenLastCalledWith(
        'model-1',
        expect.objectContaining({ combinationId: 'default-scope', page: 1 })
      )
    )
  })

  it('uses the same default-scope label for a focused publication', async () => {
    mocks.history.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
    })
    mocks.publication.mockResolvedValue(publicationForScopes())
    renderHistory('publication-1', scopeDetail())

    expect(await screen.findByText('Default scope')).toBeVisible()
    expect(screen.getByText('duration: 10')).toBeVisible()
  })

  it('updates the details control when a history row expands and collapses', async () => {
    renderHistory()
    const details = await screen.findByRole('button', { name: 'Details' })
    expect(details).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(details)
    const collapse = screen.getByRole('button', { name: 'Collapse' })
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(collapse)
    expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })
  it('shows only actual frozen changes and folds their basis', async () => {
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect((await screen.findAllByText('Customer price'))[0]).toBeVisible()
    expect(screen.getByText('12 Points / per second')).toBeVisible()
    expect(screen.getByText('Frozen decision')).toBeVisible()
    expect(screen.queryByText('rate-2')).not.toBeInTheDocument()
    expect(screen.queryByText('price-2')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Pricing basis'))
    expect(await screen.findByText(/Frozen reason/)).toBeVisible()
    expect(
      screen.getByText('Questionnaire summary: Frozen reason')
    ).toBeVisible()
    expect(
      screen.getByText('Point issuance rate: 100 points / RMB')
    ).toBeVisible()
    expect(
      screen.getByText('Pricing conversion rate: 100 points / RMB')
    ).toBeVisible()
    expect(screen.getByText('Break-even price: 2 points')).toBeVisible()
  })
  it('shows legacy price facts from the recorded price version', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          id: 'legacy-price-publication',
          source: 'LEGACY_PRICE',
          preview: null,
          before: null,
          after: legacyFacts({
            id: 'legacy-price-v1',
            billingUnit: 'REQUEST',
            points: '60',
            questionnaire,
          }),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(
      screen.getByRole('columnheader', { name: 'Pricing change field' })
    ).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Before adjustment' })
    ).toBeVisible()
    expect(screen.getAllByText('Not recorded')[0]).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'After adjustment' })
    ).toBeVisible()
    expect(screen.getByText('60 Points / per request')).toBeVisible()
    fireEvent.click(screen.getByText('Pricing basis'))
    expect(screen.queryByText('legacy-price-v1')).not.toBeInTheDocument()
    expect(screen.getByText(/Frozen reason/)).toBeVisible()
  })
  it('hides nullable legacy questionnaire fields', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          id: 'legacy-price-null-costs',
          source: 'LEGACY_PRICE',
          preview: null,
          before: null,
          after: legacyFacts({
            id: 'legacy-price-v1',
            billingUnit: 'REQUEST',
            points: '60',
            questionnaire: {
              ...questionnaire,
              successfulTaskCostRmb: null,
              failedUnrecoverableCostRmb: null,
              otherVariableCostRmb: null,
            },
          }),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByText('Pricing basis'))
    expect(
      await screen.findByText(/Questionnaire summary: Frozen reason/)
    ).toBeVisible()
    expect(screen.queryByText(/Successful task cost:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Failure cost:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Other variable cost:/)).not.toBeInTheDocument()
    expect(screen.getByText(/Risk buffer:/)).toBeVisible()
  })
  it('shows legacy provider cost snapshots without inventing a customer price', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          id: 'legacy-provider-publication',
          source: 'LEGACY_PROVIDER_RATE',
          preview: null,
          before: null,
          after: legacyFacts({
            id: 'legacy-rate-v1',
            billingUnit: 'REQUEST',
            nativeAmount: '0.03',
            currency: 'USD',
            tokenRates: null,
            exchangeRateSnapshot: {
              rate: '7.2',
              source: 'FROZEN',
              asOf: '2026-09-09T00:00:00.000Z',
            },
            normalizedAmountMinor: '22',
            normalizedTokenRates: null,
            failureChargePolicy: { mode: 'NONE' },
          }),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(
      screen.getByRole('columnheader', { name: 'Before adjustment' })
    ).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'After adjustment' })
    ).toBeVisible()
    expect(screen.getByText('0.03 USD / per request')).toBeVisible()
    expect(screen.queryByText('Customer price · After')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Pricing basis'))
    expect(screen.queryByText('legacy-rate-v1')).not.toBeInTheDocument()
    expect(screen.getByText(/Exchange rate snapshot: 7.2/)).toBeVisible()
  })
  it('shows frozen Token assumptions for every category per million tokens', async () => {
    const tokenQuestionnaire = {
      ...questionnaire,
      tokenCategoryAssumptions: {
        input: { otherVariableCostRmb: '0.11', riskBufferRmb: '0.12' },
        output: { otherVariableCostRmb: '0.21', riskBufferRmb: '0.22' },
        cacheRead: { otherVariableCostRmb: '0.31', riskBufferRmb: '0.32' },
        cacheWrite: { otherVariableCostRmb: '0.41', riskBufferRmb: '0.42' },
      },
    }
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          preview: {
            ...unified.preview,
            scopes: unified.preview?.scopes.map((scope) => ({
              ...scope,
              prices: scope.prices.map((price) => ({
                ...price,
                proposed: {
                  ...price.proposed,
                  billingUnit: 'MILLION_TOKENS' as const,
                  tokenRates: { input: '1', output: '2' },
                  questionnaire: tokenQuestionnaire,
                  assumptions: {
                    tokenCategoryRisks: [
                      {
                        category: 'input',
                        providerRateRmb: '0.05',
                        customerRatePoints: '11',
                        breakEvenPointsCeil: '5',
                        belowBreakEven: false,
                        failedUnrecoverableCostRmb: '0.06',
                        kTheoryRmb: '0.07',
                        kPricingRmb: '0.08',
                        pricingBreakEvenPointsCeil: '8',
                        targetMarginPointsCeil: '9',
                        recommendedCustomerRatePoints: '10',
                      },
                    ],
                  },
                },
              })),
            })),
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByText('Pricing basis'))
    for (const [category, cost, buffer] of [
      ['Input tokens', '0.11', '0.12'],
      ['Output tokens', '0.21', '0.22'],
      ['Cache read', '0.31', '0.32'],
      ['Cache write', '0.41', '0.42'],
    ]) {
      const label = await screen.findByText(category, { exact: true })
      const group = label.parentElement
      if (!group) throw new Error('Token basis group missing')
      expect(group).toHaveTextContent(
        `Other variable cost: ${cost} RMB / per million tokens`
      )
      expect(group).toHaveTextContent(
        `Risk buffer: ${buffer} RMB / per million tokens`
      )
    }
    expect(
      screen.getByText('Provider rate: 0.05 RMB / per million tokens')
    ).toBeVisible()
    expect(
      screen.getByText('Customer price: 11 points / per million tokens')
    ).toBeVisible()
    expect(
      screen.getByText(
        'Provider-cost break-even points: 5 points / per million tokens'
      )
    ).toBeVisible()
    expect(screen.queryByText(/K_theory|K pricing/)).not.toBeInTheDocument()
    expect(
      screen.queryByText('Other variable cost: 0.1')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Base rate: 100')).not.toBeInTheDocument()
  })
  it('hides missing legacy Token assumptions without inventing values', async () => {
    const tokenQuestionnaire = {
      ...questionnaire,
      tokenCategoryAssumptions: {
        input: { otherVariableCostRmb: '0.1', riskBufferRmb: '0.2' },
      },
    }
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          preview: {
            ...unified.preview,
            scopes: unified.preview?.scopes.map((scope) => ({
              ...scope,
              prices: scope.prices.map((price) => ({
                ...price,
                proposed: {
                  ...price.proposed,
                  billingUnit: 'MILLION_TOKENS' as const,
                  tokenRates: { input: '1', output: '2' },
                  questionnaire: tokenQuestionnaire,
                },
              })),
            })),
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByText('Pricing basis'))
    expect(
      await screen.findByText(
        'Other variable cost: 0.10 RMB / per million tokens'
      )
    ).toBeVisible()
    expect(
      screen.getByText('Risk buffer: 0.20 RMB / per million tokens')
    ).toBeVisible()
    expect(
      screen.queryByText(
        'Output tokens: Other variable cost: Not recorded · Risk buffer: Not recorded'
      )
    ).not.toBeInTheDocument()
  })
  it('renders the selected history details below its mobile card', async () => {
    const restoreViewport = useMobileViewport()
    try {
      renderHistory()
      expect(screen.queryByText('Admin')).not.toBeInTheDocument()
      fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
      expect(await screen.findByText('Admin')).toBeVisible()
    } finally {
      restoreViewport()
    }
  })
  it('does not call a missing before snapshot initial pricing without its semantic code', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          scopeSummary: unified.scopeSummary?.map((scope) => ({
            ...scope,
            changeKind: 'PRICE',
          })),
          preview: {
            ...unified.preview,
            scopes: unified.preview?.scopes.map((scope) => ({
              ...scope,
              currentProviderRate: null,
              prices: scope.prices.map((price) => ({
                ...price,
                current: null,
                changed: true,
              })),
            })),
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.queryByText('Initial pricing')).not.toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', {
        name: 'Before adjustment',
      })
    ).toBeVisible()
  })
  it('shows only the saved after price for a legacy record explicitly marked initial', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          source: 'LEGACY_PRICE',
          change: 'INITIAL',
          preview: null,
          before: null,
          after: legacyFacts({ billingUnit: 'REQUEST', points: '60' }),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.getByText('60 Points / per request')).toBeVisible()
    expect(
      screen.queryByRole('columnheader', { name: 'Before adjustment' })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Not recorded')).not.toBeInTheDocument()
  })
  it('renders an initial scope with after values only', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          change: 'INITIAL',
          scopeSummary: unified.scopeSummary?.map((scope) => ({
            ...scope,
            changeKind: 'PRICE',
          })),
          preview: {
            ...unified.preview,
            scopes: unified.preview?.scopes.map((scope) => ({
              ...scope,
              currentProviderRate: null,
              prices: scope.prices.map((price) => ({
                ...price,
                current: null,
                changed: true,
              })),
            })),
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(
      [...document.querySelectorAll('dt')].some(
        (element) => element.textContent === 'Changes'
      )
    ).toBe(false)
    expect(
      screen.queryByText('Customer price · Before')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('columnheader', { name: 'Before adjustment' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('12 Points / per second')).toBeVisible()
  })
  it('does not render an unchanged customer price for a cost-only scope', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          scopeSummary: unified.scopeSummary?.map((scope) => ({
            ...scope,
            changeKind: 'COST',
          })),
          preview: {
            ...unified.preview,
            scopes: unified.preview?.scopes.map((scope) => ({
              ...scope,
              costChanged: true,
              prices: scope.prices.map((price) => ({
                ...price,
                changed: false,
                current: price.current
                  ? { ...price.current, points: '0' }
                  : null,
                proposed: price.proposed
                  ? { ...price.proposed, points: '0' }
                  : null,
              })),
            })),
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.getAllByText('Provider cost').length).toBeGreaterThan(0)
    expect(
      screen.queryByText('Customer price · Before')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Customer price · After')).not.toBeInTheDocument()
  })
  it('preserves a zero-valued changed customer price', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          preview: {
            ...unified.preview,
            scopes: unified.preview?.scopes.map((scope) => ({
              ...scope,
              prices: scope.prices.map((price) => ({
                ...price,
                changed: true,
                current: price.current
                  ? { ...price.current, points: '0' }
                  : null,
                proposed: price.proposed
                  ? { ...price.proposed, points: '0' }
                  : null,
              })),
            })),
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.getAllByText('0 Points / per second').length).toBe(2)
  })
  it('shows the explicit no-basis state when a unified record has no frozen preview', async () => {
    mocks.history.mockResolvedValue({
      items: [{ ...unified, preview: null }],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.getByText('No change snapshot recorded')).toBeVisible()
  })
  it('does not present CNY legacy provider facts as a foreign-currency basis', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          source: 'LEGACY_PROVIDER_RATE',
          preview: null,
          after: legacyFacts({
            billingUnit: 'REQUEST',
            nativeAmount: '0',
            currency: 'CNY',
            exchangeRateSnapshot: {
              rate: '1',
              source: 'FROZEN',
              asOf: '2026-09-09T00:00:00.000Z',
            },
          }),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByText('Pricing basis'))
    expect(screen.getAllByText('No pricing basis recorded').length).toBe(1)
    expect(screen.queryByText(/Exchange rate snapshot/)).not.toBeInTheDocument()
  })
  it('shows a first unified price as after-only', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          change: 'INITIAL',
          preview: {
            ...unified.preview,
            scopes: unified.preview?.scopes.map((scope) => ({
              ...scope,
              currentProviderRate: null,
              prices: scope.prices.map((price) => ({
                ...price,
                current: null,
                changed: true,
              })),
            })),
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(
      screen.queryByRole('columnheader', {
        name: 'Before adjustment',
      })
    ).not.toBeInTheDocument()
    expect(screen.getByText('12 Points / per second')).toBeVisible()
  })
  it('marks a missing old price as not recorded when the publication is not initial', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          change: 'PRICE',
          preview: {
            ...unified.preview,
            scopes: unified.preview?.scopes.map((scope) => ({
              ...scope,
              prices: scope.prices.map((price) => ({
                ...price,
                current: null,
                changed: true,
              })),
            })),
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(
      screen.getByRole('columnheader', {
        name: 'Before adjustment',
      })
    ).toBeVisible()
    expect(screen.getByText('Not recorded')).toBeVisible()
  })
  it('shows unified provider-cost before and after when costChanged is recorded', async () => {
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.getByText('Provider cost')).toBeVisible()
    expect(screen.getByText('0.01 USD / per second')).toBeVisible()
    expect(screen.getByText('0.02 USD / per second')).toBeVisible()
  })
  it('renders the provider-cost row once when plans share one changed scope', async () => {
    const firstScope = unified.scopeSummary?.[0]
    const firstPrice = unified.preview?.scopes[0]?.prices[0]
    if (!firstScope || !firstPrice) {
      throw new Error('missing base scope fixture')
    }
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          scopeSummary: [
            firstScope,
            {
              ...firstScope,
              priceGroupId: 'group-2',
              priceVersionId: 'price-3',
            },
          ],
          preview: {
            ...unified.preview,
            scopes: unified.preview?.scopes.map((scope) => ({
              ...scope,
              prices: [
                ...scope.prices,
                {
                  ...firstPrice,
                  priceGroupId: 'group-2',
                  changed: true,
                },
              ],
            })),
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    expect(screen.getAllByText('Provider cost', { exact: true })).toHaveLength(
      1
    )
    expect(screen.getByText('Standard')).toBeVisible()
    expect(screen.getByText('Premium')).toBeVisible()
  })
  it('shows a legacy calculation snapshot even when questionnaire facts are absent', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          source: 'LEGACY_PRICE',
          preview: null,
          before: null,
          after: legacyFacts({
            billingUnit: 'REQUEST',
            points: '60',
            calculation: {
              baseRatePointsPerRmb: '100',
              kTheoryRmb: '0.02',
              kPricingRmb: '0.03',
              breakEvenPointsCeil: '2',
              targetMarginPointsCeil: '3',
            },
          }),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByText('Pricing basis'))
    expect(screen.getByText(/100/)).toBeVisible()
    expect(screen.getByText(/0\.02/)).toBeVisible()
  })
  it('does not show ordinary questionnaire scalars for Token pricing', async () => {
    const tokenQuestionnaire = {
      ...questionnaire,
      tokenCategoryAssumptions: {
        input: { otherVariableCostRmb: '0', riskBufferRmb: '0' },
      },
    }
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          preview: {
            ...unified.preview,
            scopes: unified.preview?.scopes.map((scope) => ({
              ...scope,
              prices: scope.prices.map((price) => ({
                ...price,
                proposed: {
                  ...price.proposed,
                  billingUnit: 'MILLION_TOKENS' as const,
                  tokenRates: { input: '1' },
                  questionnaire: tokenQuestionnaire,
                },
              })),
            })),
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByText('Pricing basis'))
    expect(
      screen.getByText('Other variable cost: 0.00 RMB / per million tokens')
    ).toBeVisible()
    expect(screen.queryByText(/Successful task cost:/)).not.toBeInTheDocument()
    expect(screen.getByText(/Success probability:/)).toBeVisible()
    expect(screen.getByText(/Target margin rate:/)).toBeVisible()
  })
  it('identifies a frozen basis that predates a change and records when its replacement is absent', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          source: 'LEGACY_PRICE',
          preview: null,
          before: legacyFacts({
            billingUnit: 'REQUEST',
            points: '8',
            questionnaire,
          }),
          after: legacyFacts({
            billingUnit: 'REQUEST',
            points: '12',
          }),
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    fireEvent.click(await screen.findByRole('button', { name: 'Details' }))
    fireEvent.click(screen.getByText('Pricing basis'))
    expect(screen.getByText('Pricing basis before change')).toBeVisible()
    expect(screen.getByText('No pricing basis recorded')).toBeVisible()
  })
  it('sends the selected combination filter to the paginated history API', async () => {
    renderHistory()
    await screen.findByText('Quality: HD')
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    fireEvent.change(await screen.findByLabelText('Combination'), {
      target: { value: 'combination-1' },
    })
    await waitFor(() =>
      expect(mocks.history).toHaveBeenLastCalledWith(
        'model-1',
        expect.objectContaining({ combinationId: 'combination-1', page: 1 })
      )
    )
  })
  it('requests history in effective-time order from the server', async () => {
    renderHistory()
    await waitFor(() =>
      expect(mocks.history).toHaveBeenLastCalledWith(
        'model-1',
        expect.objectContaining({
          sortBy: 'effectiveAt',
          sortDirection: 'desc',
        })
      )
    )
  })
  it('does not render a focused publication from a different model', async () => {
    mocks.publication.mockResolvedValue({
      ...unified,
      customerModelId: 'other-model',
    })
    renderHistory('publication-1')
    await waitFor(() =>
      expect(mocks.publication).toHaveBeenCalledWith('publication-1')
    )
    expect(
      screen.queryByLabelText('Model pricing history details')
    ).not.toBeInTheDocument()
  })
  it('does not fetch an exact publication or offer cancel for cancelled and legacy history', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          id: 'legacy',
          source: 'LEGACY_PRICE',
          status: 'CANCELLED',
          preview: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    await screen.findByText('Cancelled')
    expect(mocks.publication).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: 'Cancel schedule' })
    ).not.toBeInTheDocument()
  })
  it('does not offer cancellation for a scheduled legacy record', async () => {
    mocks.history.mockResolvedValue({
      items: [
        {
          ...unified,
          id: 'legacy-scheduled',
          source: 'LEGACY_PRICE',
          status: 'SCHEDULED',
          preview: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    renderHistory()
    await screen.findByText('Scheduled')
    expect(
      screen.queryByRole('button', { name: 'Cancel schedule' })
    ).not.toBeInTheDocument()
  })
  it('requires confirmation before cancelling a scheduled unified publication', async () => {
    mocks.history.mockResolvedValue({
      items: [{ ...unified, status: 'SCHEDULED' }],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    mocks.cancel.mockResolvedValue({ ...unified, status: 'CANCELLED' })
    renderHistory()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel schedule' })
    )
    expect(mocks.cancel).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('alertdialog')
    const confirm = dialog.querySelector('button:last-child')
    if (!confirm) throw new Error('missing cancel confirmation')
    fireEvent.click(confirm)
    await waitFor(() =>
      expect(mocks.cancel).toHaveBeenCalledWith('publication-1')
    )
  })
})
