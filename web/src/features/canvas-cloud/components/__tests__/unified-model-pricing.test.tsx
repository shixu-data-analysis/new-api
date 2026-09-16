/*
Copyright (C) 2023-2026 QuantumNous
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { toIntlLocale } from '@/i18n/languages'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import viLocale from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { UnifiedModelPricing } from '../UnifiedModelPricing'

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  detail: vi.fn(),
  issuance: vi.fn(),
  calculateCny: vi.fn(),
  preview: vi.fn(),
  publish: vi.fn(),
  history: vi.fn(),
  cancel: vi.fn(),
  blocker: vi.fn(),
}))

vi.mock('../../api', () => ({
  getCanvasModelPricingWorkspace: mocks.workspace,
  getCanvasModelPricingModel: mocks.detail,
  getCanvasPointIssuanceRates: mocks.issuance,
  calculateCanvasModelPricingCny: mocks.calculateCny,
  previewCanvasModelPricing: mocks.preview,
  publishCanvasModelPricing: mocks.publish,
  getCanvasModelPricingHistory: mocks.history,
  cancelCanvasModelPricingSchedule: mocks.cancel,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    to,
  }: {
    children: React.ReactNode
    className?: string
    to: string
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useBlocker: (...args: unknown[]) => mocks.blocker(...args),
}))

function renderPricing(
  initialModelId?: string,
  props: Partial<React.ComponentProps<typeof UnifiedModelPricing>> = {}
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <UnifiedModelPricing
        initialModelId={initialModelId}
        onBack={vi.fn()}
        {...props}
      />
    </QueryClientProvider>
  )
  return { client, ...view }
}

async function openPricing() {
  await userEvent
    .setup()
    .click((await screen.findAllByTestId('adjust-pricing'))[0])
}

const model = {
  id: 'model-1',
  modelKey: 'canvas.video.alpha',
  name: 'Video Alpha',
  capability: 'video.generate',
  status: 'ACTIVE',
  billingUnit: 'SECOND',
  allowedBillingUnits: ['REQUEST', 'SECOND'],
  tokenCategories: [],
  combinations: [
    {
      id: 'scope-1',
      key: 'standard',
      parameters: { quality: 'HD' },
      enabled: true,
    },
  ],
  hasPublishedPricing: true,
  hasScheduledPricing: false,
}

const calculationIdentity = {
  requestHash: 'request-hash-1',
  calculationVersion: '1',
  customerModelId: 'model-1',
  customerModelVersion: 1,
  pointIssuanceRateConfigVersionId: 'issuance-1',
  pointIssuanceRateVersion: 1,
  scopes: [
    {
      parameterCombinationId: 'scope-1',
      providerRateVersionId: 'rate-1',
      providerRateVersion: 1,
      prices: [
        {
          priceGroupId: 'group-1',
          sourcePriceVersionId: 'price-1',
          sourcePriceVersion: 1,
        },
      ],
    },
  ],
}

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset())
  mocks.blocker.mockReturnValue({
    status: 'idle',
    proceed: vi.fn(),
    reset: vi.fn(),
  })
  mocks.workspace.mockResolvedValue({
    models: [model],
    priceGroups: [
      { id: 'group-1', code: 'STANDARD', internalName: 'Standard' },
    ],
  })
  mocks.detail.mockResolvedValue({
    model,
    priceGroups: [
      { id: 'group-1', code: 'STANDARD', internalName: 'Standard' },
    ],
    pricingScopes: [
      {
        parameterCombinationId: 'scope-1',
        combinationKey: 'standard',
        parameters: { quality: 'HD' },
        enabled: true,
        currentProviderRate: {
          id: 'rate-1',
          version: 1,
          status: 'PUBLISHED',
          billingUnit: 'SECOND',
          nativeAmount: '0.02',
          currency: 'USD',
          exchangeRateSnapshot: {
            rate: '7.2',
            source: 'manual',
            asOf: '2026-09-08T00:00:00.000Z',
          },
          failureChargePolicy: { mode: 'NONE' },
          normalizedAmountMinor: '0.14400000',
          decisionSummary: 'previous',
          effectiveAt: '2026-09-08T00:00:00.000Z',
        },
        prices: [
          {
            priceGroupId: 'group-1',
            priceGroupCode: 'STANDARD',
            priceGroupName: 'Standard',
            current: {
              inputMode: 'POINTS',
              id: 'price-1',
              version: 1,
              status: 'PUBLISHED',
              billingUnit: 'SECOND',
              points: '8',
              effectiveAt: null,
              providerRateVersionId: 'rate-1',
              questionnaire: {
                targetMarginRate: '0.4',
                successProbability: '0.9',
                successfulTaskCostRmb: '0',
                failedUnrecoverableCostRmb: '0',
                otherVariableCostRmb: '0',
                riskBufferRmb: '0',
                decisionSummary: 'previous',
                evidenceRefs: [],
              },
              originalInput: null,
              restorationError: null,
            },
          },
        ],
      },
    ],
  })
  mocks.issuance.mockResolvedValue([
    { status: 'PUBLISHED', pointsPerRmb: '100' },
  ])
  mocks.preview.mockResolvedValue({
    id: 'preview-1',
    expiresAt: '2026-09-08T00:15:00.000Z',
    customerModelId: 'model-1',
    billingUnit: 'SECOND',
    effectiveAt: '2026-09-08T00:00:00.000Z',
    pointIssuanceRate: { id: 'issuance-1', version: 1, pointsPerRmb: '100' },
    unitChange: { from: 'SECOND', to: 'SECOND', changed: false },
    scopes: [
      {
        parameterCombinationId: 'scope-1',
        combinationKey: 'standard',
        parameters: { quality: 'HD' },
        enabled: true,
        currentProviderRate: null,
        proposedProviderRate: {},
        costChanged: true,
        prices: [],
      },
    ],
    conflicts: [],
    canPublish: true,
  })
  mocks.calculateCny.mockResolvedValue({
    customerModelId: 'model-1',
    billingUnit: 'SECOND',
    inputMode: 'CNY',
    calculatedAt: '2026-09-08T00:00:00.000Z',
    inputIdentity: calculationIdentity,
    effectiveMode: 'IMMEDIATE',
    effectiveAt: '2026-09-08T00:00:00.000Z',
    pointIssuanceRate: { id: 'issuance-1', version: 1, pointsPerRmb: '100' },
    unitChange: { from: 'SECOND', to: 'SECOND', changed: false },
    scopes: [
      {
        parameterCombinationId: 'scope-1',
        providerRateVersionId: 'rate-1',
        providerRateVersion: 1,
        prices: [
          {
            priceGroupId: 'group-1',
            sourcePriceVersionId: 'price-1',
            sourcePriceVersion: 1,
            normalizedPoints: '240',
            normalizedTokenRates: null,
            fullCostCny: '1.20',
            actualMarginRate: '0.5',
            canPublish: true,
            fieldErrors: [],
          },
        ],
      },
    ],
    conflicts: [],
    fieldErrors: [],
    canPublish: true,
  })
  mocks.history.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
})

describe('UnifiedModelPricing', () => {
  it('restores every non-empty POINTS original input, including provider and token facts', async () => {
    const detail = await mocks.detail()
    const current = detail.pricingScopes[0].prices[0].current
    mocks.detail.mockResolvedValue({
      ...detail,
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          currentProviderRate: {
            ...detail.pricingScopes[0].currentProviderRate,
            billingUnit: 'SECOND',
            nativeAmount: '99',
            tokenRates: {
              input: '1',
              output: '2',
              cacheRead: '3',
              cacheWrite: '4',
            },
            exchangeRateSnapshot: {
              rate: '6.8',
              source: 'ecb',
              asOf: '2026-09-01T00:00:00.000Z',
            },
            failureChargePolicy: { mode: 'FIXED', nativeAmount: '7.5' },
          },
          prices: [
            {
              ...detail.pricingScopes[0].prices[0],
              current: {
                ...current,
                originalInput: {
                  inputMode: 'POINTS',
                  billingUnit: 'SECOND',
                  priceVersionId: 'price-1',
                  priceVersion: 4,
                  providerRateVersionId: 'rate-1',
                  providerRateVersion: 8,
                  providerRate: {
                    nativeAmount: '12.34',
                    currency: 'USD',
                    exchangeRateSnapshot: {
                      rate: '6.9',
                      source: 'snapshot',
                      asOf: '2026-08-01T00:00:00.000Z',
                    },
                    failureChargePolicy: {
                      mode: 'FIXED',
                      nativeAmount: '0.75',
                    },
                    tokenRates: {
                      input: '0.11',
                      output: '0.22',
                      cacheRead: '0.33',
                      cacheWrite: '0.44',
                    },
                  },
                  points: '123',
                  tokenRates: {
                    input: '10',
                    output: '20',
                    cacheRead: '30',
                    cacheWrite: '40',
                  },
                  targetMarginRate: '0.37',
                  successProbability: '0.83',
                  otherVariableCostRmb: '0.12',
                  riskBufferRmb: '0.08',
                  tokenCategoryAssumptions: null,
                },
                restorationError: null,
              },
            },
          ],
        },
      ],
    })
    renderPricing('model-1', { tab: 'set' })
    expect(
      await screen.findByRole('radio', { name: 'Points pricing' })
    ).toBeChecked()
    expect(screen.getByLabelText('Service provider cost')).toHaveValue('12.34')
    expect(screen.getByLabelText('Failed call cost')).toHaveValue('0.75')
    expect(screen.getByLabelText('Target margin rate')).toHaveValue('37')
    expect(screen.getByLabelText('Expected success rate')).toHaveValue('83')
    expect(
      screen.getByLabelText('Other variable cost for every attempt')
    ).toHaveValue('0.12')
    expect(screen.getByLabelText('Risk buffer')).toHaveValue('0.08')
    expect(screen.getByLabelText('Proposed price points')).toHaveValue('123')
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '12.35' },
    })
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '12.34' },
    })
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'restore all points facts' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce())
    expect(mocks.preview.mock.calls[0][0].scopes[0].providerRate).toEqual({
      nativeAmount: '12.34',
      currency: 'USD',
      exchangeRateSnapshot: {
        rate: '6.9',
        source: 'snapshot',
        asOf: '2026-08-01T00:00:00.000Z',
      },
      failureChargePolicy: { mode: 'FIXED', nativeAmount: '0.75' },
    })
  })

  it('restores non-empty CNY original input for the selected scope and price group', async () => {
    const detail = await mocks.detail()
    mocks.detail.mockResolvedValue({
      ...detail,
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          prices: [
            {
              ...detail.pricingScopes[0].prices[0],
              current: {
                ...detail.pricingScopes[0].prices[0].current,
                inputMode: 'CNY',
                originalInput: {
                  inputMode: 'CNY',
                  billingUnit: 'SECOND',
                  priceVersionId: 'price-1',
                  priceVersion: 2,
                  providerRateVersionId: 'rate-1',
                  providerRateVersion: 3,
                  providerSuccessPriceCny: '1.25',
                  customerPriceCny: '2.75',
                },
                restorationError: null,
              },
            },
          ],
        },
      ],
    })
    renderPricing('model-1', { tab: 'set' })
    expect(
      await screen.findByRole('radio', { name: 'CNY pricing' })
    ).toBeChecked()
    expect(
      await screen.findByLabelText(/Provider successful price/)
    ).toHaveValue('1.25')
    expect(screen.getByLabelText(/Customer CNY price/)).toHaveValue('2.75')
  })

  it('restores all applicable POINTS scalar facts for REQUEST pricing', async () => {
    const detail = await mocks.detail()
    const requestModel = {
      ...model,
      billingUnit: 'REQUEST',
      allowedBillingUnits: ['REQUEST', 'SECOND'],
    }
    const original = {
      inputMode: 'POINTS',
      billingUnit: 'REQUEST',
      priceVersionId: 'price-1',
      priceVersion: 9,
      providerRateVersionId: 'rate-1',
      providerRateVersion: 9,
      providerRate: {
        nativeAmount: '3.21',
        currency: 'JPY',
        exchangeRateSnapshot: {
          rate: '0.048',
          source: 'fx-snapshot',
          asOf: '2026-08-15T00:00:00.000Z',
        },
        failureChargePolicy: { mode: 'FIXED', nativeAmount: '0.12' },
        tokenRates: null,
      },
      points: '456',
      tokenRates: null,
      targetMarginRate: '0.51',
      successProbability: '0.77',
      otherVariableCostRmb: '0.09',
      riskBufferRmb: '0.06',
      tokenCategoryAssumptions: {
        input: { otherVariableCostRmb: '0.07', riskBufferRmb: '0.05' },
        output: { otherVariableCostRmb: '0.08', riskBufferRmb: '0.06' },
        cacheRead: { otherVariableCostRmb: '0.09', riskBufferRmb: '0.07' },
        cacheWrite: { otherVariableCostRmb: '0.10', riskBufferRmb: '0.08' },
      },
    }
    mocks.workspace.mockResolvedValue({
      models: [requestModel],
      priceGroups: detail.priceGroups,
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      model: requestModel,
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          currentProviderRate: {
            ...detail.pricingScopes[0].currentProviderRate,
            billingUnit: 'REQUEST',
          },
          prices: [
            {
              ...detail.pricingScopes[0].prices[0],
              current: {
                ...detail.pricingScopes[0].prices[0].current,
                inputMode: 'POINTS',
                originalInput: original,
                restorationError: null,
              },
            },
          ],
        },
      ],
    })
    renderPricing('model-1', { tab: 'set' })
    expect(await screen.findByLabelText('Service provider cost')).toHaveValue(
      '3.21'
    )
    expect(screen.getByLabelText('Failed call cost')).toHaveValue('0.12')
    expect(screen.getByLabelText('Target margin rate')).toHaveValue('51')
    expect(screen.getByLabelText('Expected success rate')).toHaveValue('77')
    expect(
      screen.getByLabelText('Other variable cost for every attempt')
    ).toHaveValue('0.09')
    expect(screen.getByLabelText('Risk buffer')).toHaveValue('0.06')
    expect(screen.getByLabelText('Proposed price points')).toHaveValue('456')
    fireEvent.change(screen.getByLabelText('Proposed price points'), {
      target: { value: '457' },
    })
    fireEvent.change(screen.getByLabelText('Proposed price points'), {
      target: { value: '456' },
    })
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '3.22' },
    })
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'request restore' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce())
    expect(mocks.preview.mock.calls[0][0].billingUnit).toBe('REQUEST')
    expect(mocks.preview.mock.calls[0][0].scopes[0].providerRate).toMatchObject(
      {
        nativeAmount: '3.22',
        currency: 'JPY',
        exchangeRateSnapshot: original.providerRate.exchangeRateSnapshot,
        failureChargePolicy: original.providerRate.failureChargePolicy,
      }
    )
    expect(mocks.preview.mock.calls[0][0].scopes[0].prices[0]).toMatchObject({
      points: '456',
      targetMarginRate: '0.51',
      successProbability: '0.77',
      otherVariableCostRmb: '0.09',
      riskBufferRmb: '0.06',
    })
  })

  it('restores POINTS Token provider and customer vectors without filling defaults', async () => {
    const detail = await mocks.detail()
    const tokenModel = {
      ...model,
      billingUnit: 'MILLION_TOKENS',
      allowedBillingUnits: ['MILLION_TOKENS'],
      tokenCategories: ['input', 'output', 'cacheRead', 'cacheWrite'],
    }
    const original = {
      inputMode: 'POINTS',
      billingUnit: 'MILLION_TOKENS',
      priceVersionId: 'price-1',
      priceVersion: 7,
      providerRateVersionId: 'rate-1',
      providerRateVersion: 7,
      providerRate: {
        nativeAmount: '0',
        currency: 'USD',
        exchangeRateSnapshot: {
          rate: '7.1',
          source: 'token-fx',
          asOf: '2026-08-20T00:00:00.000Z',
        },
        failureChargePolicy: { mode: 'NONE' },
        tokenRates: {
          input: '0.11',
          output: '0.22',
          cacheRead: '0.33',
          cacheWrite: '0.44',
        },
      },
      points: '0',
      tokenRates: {
        input: '11',
        output: '22',
        cacheRead: '33',
        cacheWrite: '44',
      },
      targetMarginRate: '0.41',
      successProbability: '0.86',
      otherVariableCostRmb: '0.07',
      riskBufferRmb: '0.05',
      tokenCategoryAssumptions: {
        input: { otherVariableCostRmb: '0.07', riskBufferRmb: '0.05' },
        output: { otherVariableCostRmb: '0.08', riskBufferRmb: '0.06' },
        cacheRead: { otherVariableCostRmb: '0.09', riskBufferRmb: '0.07' },
        cacheWrite: { otherVariableCostRmb: '0.10', riskBufferRmb: '0.08' },
      },
    }
    mocks.workspace.mockResolvedValue({
      models: [tokenModel],
      priceGroups: detail.priceGroups,
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      model: tokenModel,
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          currentProviderRate: {
            ...detail.pricingScopes[0].currentProviderRate,
            billingUnit: 'MILLION_TOKENS',
            normalizedTokenRates: {
              input: '9.11',
              output: '9.22',
              cacheRead: '9.33',
              cacheWrite: '9.44',
            },
          },
          prices: [
            {
              ...detail.pricingScopes[0].prices[0],
              current: {
                ...detail.pricingScopes[0].prices[0].current,
                billingUnit: 'MILLION_TOKENS',
                inputMode: 'POINTS',
                tokenRates: {
                  input: '91',
                  output: '92',
                  cacheRead: '93',
                  cacheWrite: '94',
                },
                questionnaire: {
                  ...detail.pricingScopes[0].prices[0].current.questionnaire,
                  tokenCategoryAssumptions: {
                    input: {
                      otherVariableCostRmb: '9.07',
                      riskBufferRmb: '9.05',
                    },
                    output: {
                      otherVariableCostRmb: '9.08',
                      riskBufferRmb: '9.06',
                    },
                    cacheRead: {
                      otherVariableCostRmb: '9.09',
                      riskBufferRmb: '9.07',
                    },
                    cacheWrite: {
                      otherVariableCostRmb: '9.10',
                      riskBufferRmb: '9.08',
                    },
                  },
                },
                originalInput: original,
                restorationError: null,
              },
            },
          ],
        },
      ],
    })
    renderPricing('model-1', { tab: 'set' })
    expect(
      await screen.findByLabelText('input · RMB / per million tokens')
    ).toHaveValue('0.11')
    expect(
      screen.getByLabelText('output · RMB / per million tokens')
    ).toHaveValue('0.22')
    expect(
      screen.getByLabelText('cacheRead · RMB / per million tokens')
    ).toHaveValue('0.33')
    expect(
      screen.getByLabelText('cacheWrite · RMB / per million tokens')
    ).toHaveValue('0.44')
    expect(
      screen.getByLabelText('Customer price per million tokens · input')
    ).toHaveValue('11')
    expect(
      screen.getByLabelText('Customer price per million tokens · output')
    ).toHaveValue('22')
    expect(
      screen.getByLabelText('Customer price per million tokens · cacheRead')
    ).toHaveValue('33')
    expect(
      screen.getByLabelText('Customer price per million tokens · cacheWrite')
    ).toHaveValue('44')
    expect(screen.getByLabelText('Target margin rate')).toHaveValue('41')
    expect(screen.getByLabelText('Expected success rate')).toHaveValue('86')
    expect(
      screen.getByLabelText('Additional cost per million tokens · input')
    ).toHaveValue('0.07')
    expect(
      screen.getByLabelText('Risk buffer per successful million tokens · input')
    ).toHaveValue('0.05')
    fireEvent.change(
      screen.getByLabelText('input · RMB / per million tokens'),
      {
        target: { value: '0.12' },
      }
    )
    fireEvent.change(
      screen.getByLabelText('input · RMB / per million tokens'),
      {
        target: { value: '0.11' },
      }
    )
    fireEvent.change(
      screen.getByLabelText('Customer price per million tokens · input'),
      { target: { value: '11.1' } }
    )
    fireEvent.change(
      screen.getByLabelText('Customer price per million tokens · input'),
      { target: { value: '11' } }
    )
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'token restore' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce())
    expect(
      mocks.preview.mock.calls[0][0].scopes[0].providerRate.tokenRates
    ).toEqual(original.providerRate.tokenRates)
    expect(
      mocks.preview.mock.calls[0][0].scopes[0].prices[0].tokenRates
    ).toEqual(original.tokenRates)
    expect(
      mocks.preview.mock.calls[0][0].scopes[0].prices[0]
        .tokenCategoryAssumptions
    ).toEqual(original.tokenCategoryAssumptions)
  })

  it('restores each current mode independently across scopes and price groups', async () => {
    const detail = await mocks.detail()
    const premium = { id: 'group-2', code: 'PREMIUM', internalName: 'Premium' }
    const pointsCurrent = detail.pricingScopes[0].prices[0].current
    const cnyCurrent = {
      ...pointsCurrent,
      inputMode: 'CNY',
      originalInput: {
        inputMode: 'CNY',
        billingUnit: 'SECOND',
        priceVersionId: 'price-2',
        priceVersion: 2,
        providerRateVersionId: 'rate-1',
        providerRateVersion: 2,
        providerSuccessPriceCny: '1.50',
        customerPriceCny: '3.50',
      },
      restorationError: null,
    }
    const cnyCurrent2 = {
      ...cnyCurrent,
      originalInput: {
        ...cnyCurrent.originalInput,
        providerSuccessPriceCny: '1.75',
        customerPriceCny: '3.75',
      },
    }
    const scope2 = {
      ...detail.pricingScopes[0],
      parameterCombinationId: 'scope-2',
      combinationKey: 'quality-4k',
      parameters: { quality: '4K' },
      prices: [
        { ...detail.pricingScopes[0].prices[0], current: cnyCurrent2 },
        {
          ...detail.pricingScopes[0].prices[0],
          priceGroupId: 'group-2',
          current: pointsCurrent,
        },
      ],
    }
    mocks.workspace.mockResolvedValue({
      models: [
        {
          ...model,
          combinations: [
            ...model.combinations,
            {
              id: 'scope-2',
              key: 'quality-4k',
              parameters: { quality: '4K' },
              enabled: true,
            },
          ],
        },
      ],
      priceGroups: [detail.priceGroups[0], premium],
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      priceGroups: [detail.priceGroups[0], premium],
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          prices: [
            detail.pricingScopes[0].prices[0],
            {
              ...detail.pricingScopes[0].prices[0],
              priceGroupId: 'group-2',
              current: cnyCurrent,
            },
          ],
        },
        {
          ...scope2,
          prices: [
            {
              ...scope2.prices[0],
            },
            {
              ...scope2.prices[1],
              current: {
                ...scope2.prices[1].current,
                restorationError: {
                  code: 'INCOMPLETE_PRICING_INPUT_SNAPSHOT',
                  missingFields: ['points'],
                },
              },
            },
          ],
        },
      ],
    })
    const user = userEvent.setup()
    renderPricing('model-1', { tab: 'set' })
    expect(
      await screen.findByRole('radio', { name: 'Points pricing' })
    ).toBeChecked()
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Premium' }))
    expect(
      await screen.findByRole('radio', { name: 'CNY pricing' })
    ).toBeChecked()
    expect(screen.getByLabelText(/Provider successful price/)).toHaveValue(
      '1.50'
    )
    expect(screen.getByLabelText(/Customer CNY price/)).toHaveValue('3.50')
    await user.click(screen.getByRole('combobox', { name: 'Pricing scope' }))
    await user.click(screen.getByRole('option', { name: 'Quality: 4K' }))
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Premium' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pricing is incomplete'
    )
    expect(
      screen.getByRole('button', { name: 'Preview and publish' })
    ).toBeDisabled()
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Standard' }))
    expect(
      await screen.findByRole('radio', { name: 'CNY pricing' })
    ).toBeChecked()
    expect(screen.getByLabelText(/Provider successful price/)).toHaveValue(
      '1.75'
    )
    expect(screen.getByLabelText(/Customer CNY price/)).toHaveValue('3.75')
    expect(
      screen.getByRole('button', { name: 'Preview and publish' })
    ).not.toBeDisabled()
    await user.click(screen.getByRole('combobox', { name: 'Pricing scope' }))
    await user.click(screen.getByRole('option', { name: 'Quality: HD' }))
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Premium' }))
    expect(screen.getByLabelText(/Provider successful price/)).toHaveValue(
      '1.50'
    )
    expect(screen.getByLabelText(/Customer CNY price/)).toHaveValue('3.50')
  })

  it('restores every CNY Token category from its original snapshot', async () => {
    const detail = await mocks.detail()
    const tokenModel = {
      ...model,
      billingUnit: 'MILLION_TOKENS',
      allowedBillingUnits: ['MILLION_TOKENS'],
      tokenCategories: ['input', 'output', 'cacheRead', 'cacheWrite'],
    }
    const cnyInput = {
      inputMode: 'CNY',
      billingUnit: 'MILLION_TOKENS',
      priceVersionId: 'price-1',
      priceVersion: 2,
      providerRateVersionId: 'rate-1',
      providerRateVersion: 2,
      providerSuccessPriceCny: {
        input: '1.01',
        output: '1.02',
        cacheRead: '1.03',
        cacheWrite: '1.04',
      },
      customerPriceCny: {
        input: '2.01',
        output: '2.02',
        cacheRead: '2.03',
        cacheWrite: '2.04',
      },
    }
    mocks.workspace.mockResolvedValue({
      models: [tokenModel],
      priceGroups: detail.priceGroups,
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      model: tokenModel,
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          currentProviderRate: {
            ...detail.pricingScopes[0].currentProviderRate,
            billingUnit: 'MILLION_TOKENS',
            normalizedTokenRates: {
              input: '0.1',
              output: '0.2',
              cacheRead: '0.3',
              cacheWrite: '0.4',
            },
          },
          prices: [
            {
              ...detail.pricingScopes[0].prices[0],
              current: {
                ...detail.pricingScopes[0].prices[0].current,
                billingUnit: 'MILLION_TOKENS',
                inputMode: 'CNY',
                originalInput: cnyInput,
                restorationError: null,
              },
            },
          ],
        },
      ],
    })
    renderPricing('model-1', { tab: 'set' })
    expect(
      await screen.findByRole('radio', { name: 'CNY pricing' })
    ).toBeChecked()
    for (const value of [
      '1.01',
      '1.02',
      '1.03',
      '1.04',
      '2.01',
      '2.02',
      '2.03',
      '2.04',
    ]) {
      expect(await screen.findByDisplayValue(value)).toBeVisible()
    }
  })

  it.each([
    [
      'incomplete',
      {
        inputMode: 'POINTS',
        restorationError: {
          code: 'INCOMPLETE_PRICING_INPUT_SNAPSHOT',
          missingFields: ['points'],
        },
      },
    ],
    [
      'invalid',
      {
        inputMode: 'BROKEN',
        restorationError: {
          code: 'INVALID_PRICING_INPUT_MODE',
          missingFields: [],
        },
      },
    ],
  ])(
    'shows a safe blocked state for %s restoration data',
    async (_name, currentPatch) => {
      const detail = await mocks.detail()
      mocks.detail.mockResolvedValue({
        ...detail,
        pricingScopes: [
          {
            ...detail.pricingScopes[0],
            prices: [
              {
                ...detail.pricingScopes[0].prices[0],
                current: {
                  ...detail.pricingScopes[0].prices[0].current,
                  ...currentPatch,
                },
              },
            ],
          },
        ],
      })
      renderPricing('model-1', { tab: 'set' })
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Pricing is incomplete'
      )
      expect(
        screen.getByRole('button', { name: 'Preview and publish' })
      ).toBeDisabled()
    }
  )

  it.each(['success', 'failure'])(
    'ignores a late CNY calculation %s for an older revision',
    async (outcome) => {
      const result = await mocks.calculateCny()
      const pending: Array<{
        resolve: (value: unknown) => void
        reject: (error: Error) => void
      }> = []
      mocks.calculateCny.mockImplementation(
        () =>
          new Promise((resolve, reject) => pending.push({ resolve, reject }))
      )
      const user = userEvent.setup()
      renderPricing('model-1', { tab: 'set' })
      await user.click(
        await screen.findByRole('radio', { name: 'CNY pricing' })
      )
      fireEvent.change(
        await screen.findByLabelText(/Provider successful price/),
        { target: { value: '1.20' } }
      )
      fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
        target: { value: '2.40' },
      })
      await waitFor(() => expect(pending).toHaveLength(1))
      fireEvent.change(screen.getByLabelText(/Provider successful price/), {
        target: { value: '1.30' },
      })
      fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
        target: { value: '2.60' },
      })
      await waitFor(() => expect(pending).toHaveLength(2))
      if (outcome === 'success') {
        pending[0].resolve(result)
      } else {
        pending[0].reject(new Error('late failure'))
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(
        screen.queryByText('Calculated customer points')
      ).not.toBeInTheDocument()
      if (outcome === 'failure') {
        expect(
          screen.queryByText('Pricing preview could not be created')
        ).not.toBeInTheDocument()
        expect(
          screen.queryByRole('button', { name: 'Retry' })
        ).not.toBeInTheDocument()
      }
      pending[1].resolve(result)
      expect(
        await screen.findByText('Calculated customer points')
      ).toBeVisible()
    }
  )

  it('keeps CNY inputs visible and retryable when final preview calculation rejects', async () => {
    const calculation = await mocks.calculateCny()
    mocks.calculateCny
      .mockRejectedValueOnce(new Error('final calculation unavailable'))
      .mockResolvedValue(calculation)
    const user = userEvent.setup()
    renderPricing('model-1', { tab: 'set' })
    await user.click(await screen.findByRole('radio', { name: 'CNY pricing' }))
    const provider = await screen.findByLabelText(/Provider successful price/)
    const customer = screen.getByLabelText(/Customer CNY price/)
    fireEvent.change(provider, { target: { value: '1.20' } })
    fireEvent.change(customer, { target: { value: '2.40' } })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    expect(
      await screen.findByText('Pricing preview could not be created')
    ).toBeVisible()
    expect(provider).toHaveValue('1.20')
    expect(customer).toHaveValue('2.40')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Calculated customer points')).toBeVisible()
  })
  it('keeps POINTS target margin to an integer from 1 through 99', async () => {
    renderPricing('model-1')
    await openPricing()
    const margin = screen.getByLabelText(/Target margin/)
    fireEvent.change(margin, { target: { value: '1.5' } })
    fireEvent.blur(margin)
    expect(
      screen.getByText('Enter an integer percentage from 1 to 99')
    ).toBeVisible()
  })

  it('submits only the CNY branch and resets its independent metadata after a confirmed mode switch', async () => {
    const user = userEvent.setup()
    renderPricing('model-1', { tab: 'set' })
    await user.click(await screen.findByRole('radio', { name: 'CNY pricing' }))
    expect(
      screen.queryByLabelText('Expected success rate')
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '1.20' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '2.40' },
    })
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'direct CNY price' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview).toHaveBeenCalledWith({
      customerModelId: 'model-1',
      billingUnit: 'SECOND',
      inputMode: 'CNY',
      calculationIdentity,
      effectiveMode: 'IMMEDIATE',
      decisionSummary: 'direct CNY price',
      scopes: [
        {
          parameterCombinationId: 'scope-1',
          providerSuccessPriceCny: '1.20',
          prices: [
            {
              priceGroupId: 'group-1',
              sourcePriceVersionId: 'price-1',
              customerPriceCny: '2.40',
            },
          ],
        },
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('radio', { name: 'Points pricing' }))
    await user.click(screen.getByRole('button', { name: 'Discard and switch' }))
    expect(screen.getByLabelText('Change reason (optional)')).toHaveValue('')
    expect(screen.getByLabelText('Expected success rate')).toBeVisible()
  })

  it('automatically calculates a complete CNY draft without creating a preview', async () => {
    renderPricing('model-1', { tab: 'set' })
    fireEvent.click(await screen.findByRole('radio', { name: 'CNY pricing' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '1.20' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '2.40' },
    })

    await waitFor(() => expect(mocks.calculateCny).toHaveBeenCalledOnce())
    expect(mocks.calculateCny).toHaveBeenCalledWith({
      customerModelId: 'model-1',
      billingUnit: 'SECOND',
      scopes: [
        expect.objectContaining({
          parameterCombinationId: 'scope-1',
          providerSuccessPriceCny: '1.20',
        }),
      ],
    })
    expect(await screen.findByText('Calculated customer points')).toBeVisible()
    expect(screen.getByText(/240 points/)).toBeVisible()
    expect(screen.getByText('50.00%')).toBeVisible()
    expect(screen.getByText(/1\.20 RMB/)).toBeVisible()
    expect(screen.getByText(/100 points per RMB/)).toBeVisible()
    expect(screen.getByText('Can publish')).toBeVisible()
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('includes every currently priced group in an automatic CNY calculation', async () => {
    const detail = await mocks.detail()
    const premium = { id: 'group-2', code: 'PREMIUM', internalName: 'Premium' }
    const current = detail.pricingScopes[0].prices[0].current
    mocks.workspace.mockResolvedValue({
      models: [model],
      priceGroups: [...detail.priceGroups, premium],
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      priceGroups: [...detail.priceGroups, premium],
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          prices: [
            ...detail.pricingScopes[0].prices,
            {
              priceGroupId: 'group-2',
              priceGroupCode: 'PREMIUM',
              priceGroupName: 'Premium',
              current: {
                ...current,
                id: 'price-2',
                inputMode: 'CNY',
                originalInput: {
                  inputMode: 'CNY',
                  billingUnit: 'SECOND',
                  priceVersionId: 'price-2',
                  priceVersion: 1,
                  providerRateVersionId: 'rate-1',
                  providerRateVersion: 1,
                  providerSuccessPriceCny: '0.08',
                  customerPriceCny: '0.48',
                },
                restorationError: null,
              },
            },
          ],
        },
      ],
    })
    renderPricing('model-1', { tab: 'set' })
    fireEvent.click(await screen.findByRole('radio', { name: 'CNY pricing' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '0.08' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '0.32' },
    })

    await waitFor(() => expect(mocks.calculateCny).toHaveBeenCalledOnce())
    expect(mocks.calculateCny.mock.calls[0][0].scopes).toEqual([
      {
        parameterCombinationId: 'scope-1',
        providerSuccessPriceCny: '0.08',
        prices: [
          {
            priceGroupId: 'group-1',
            sourcePriceVersionId: 'price-1',
            customerPriceCny: '0.32',
          },
          {
            priceGroupId: 'group-2',
            sourcePriceVersionId: 'price-2',
            customerPriceCny: '0.48',
          },
        ],
      },
    ])
  })

  it('treats initial CNY pricing as the active scope instead of a unit switch', async () => {
    const detail = await mocks.detail()
    const initialModel = {
      ...model,
      billingUnit: null,
      combinations: [
        ...model.combinations,
        {
          id: 'scope-2',
          key: 'quality-4k',
          parameters: { quality: '4K' },
          enabled: true,
        },
      ],
    }
    mocks.workspace.mockResolvedValue({
      models: [initialModel],
      priceGroups: detail.priceGroups,
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      model: initialModel,
      pricingScopes: [
        ...detail.pricingScopes.map(
          (scope: (typeof detail.pricingScopes)[number]) => ({
            ...scope,
            currentProviderRate: null,
            prices: scope.prices.map(
              (price: (typeof scope.prices)[number]) => ({
                ...price,
                current: null,
              })
            ),
          })
        ),
        {
          ...detail.pricingScopes[0],
          parameterCombinationId: 'scope-2',
          combinationKey: 'quality-4k',
          parameters: { quality: '4K' },
          currentProviderRate: null,
          prices: detail.pricingScopes[0].prices.map(
            (
              price: (typeof detail.pricingScopes)[number]['prices'][number]
            ) => ({
              ...price,
              current: null,
            })
          ),
        },
      ],
    })
    const user = userEvent.setup()
    renderPricing('model-1', { tab: 'set' })
    fireEvent.click(await screen.findByRole('radio', { name: 'CNY pricing' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '0.08' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '0.32' },
    })

    await waitFor(() => expect(mocks.calculateCny).toHaveBeenCalledOnce())
    expect(mocks.calculateCny.mock.calls[0][0].scopes).toEqual([
      {
        parameterCombinationId: 'scope-1',
        providerSuccessPriceCny: '0.08',
        prices: [
          {
            priceGroupId: 'group-1',
            customerPriceCny: '0.32',
          },
        ],
      },
    ])
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledOnce())
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        billingUnit: 'REQUEST',
        inputMode: 'CNY',
        scopes: [
          {
            parameterCombinationId: 'scope-1',
            providerSuccessPriceCny: '0.08',
            prices: [
              {
                priceGroupId: 'group-1',
                customerPriceCny: '0.32',
              },
            ],
          },
        ],
      })
    )
  })

  it('defaults to the first enabled scope when a disabled current scope sorts first', async () => {
    const detail = await mocks.detail()
    mocks.detail.mockResolvedValue({
      ...detail,
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          parameterCombinationId: 'scope-disabled',
          combinationKey: 'disabled',
          enabled: false,
        },
        detail.pricingScopes[0],
      ],
    })
    renderPricing('model-1', { tab: 'set' })
    fireEvent.click(await screen.findByRole('radio', { name: 'CNY pricing' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '0.08' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '0.32' },
    })

    await waitFor(() => expect(mocks.calculateCny).toHaveBeenCalledOnce())
    expect(mocks.calculateCny.mock.calls[0][0].scopes[0]).toEqual(
      expect.objectContaining({ parameterCombinationId: 'scope-1' })
    )
  })

  it('keeps a failed CNY calculation editable and retries the current draft', async () => {
    mocks.calculateCny.mockRejectedValueOnce(
      new Error('calculation unavailable')
    )
    const user = userEvent.setup()
    renderPricing('model-1', { tab: 'set' })
    await user.click(await screen.findByRole('radio', { name: 'CNY pricing' }))
    const provider = screen.getByLabelText(/Provider successful price/)
    const customer = screen.getByLabelText(/Customer CNY price/)
    fireEvent.change(provider, { target: { value: '1.20' } })
    fireEvent.change(customer, { target: { value: '2.40' } })

    expect(
      (await screen.findByText('Pricing preview could not be created')).closest(
        '[role="alert"]'
      )
    ).toBeVisible()
    expect(provider).toHaveValue('1.20')
    expect(customer).toHaveValue('2.40')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mocks.calculateCny).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Calculated customer points')).toBeVisible()
  })

  it('submits one provider price with independent CNY prices for every priced group', async () => {
    const detail = await mocks.detail()
    const premium = { id: 'group-2', code: 'PREMIUM', internalName: 'Premium' }
    mocks.workspace.mockResolvedValue({
      models: [model],
      priceGroups: [...detail.priceGroups, premium],
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      priceGroups: [...detail.priceGroups, premium],
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          prices: [
            ...detail.pricingScopes[0].prices,
            {
              ...detail.pricingScopes[0].prices[0],
              priceGroupId: 'group-2',
              priceGroupCode: 'PREMIUM',
              priceGroupName: 'Premium',
              current: {
                ...detail.pricingScopes[0].prices[0].current,
                id: 'price-2',
              },
            },
          ],
        },
      ],
    })
    const user = userEvent.setup()
    renderPricing('model-1')
    await openPricing()
    await user.click(screen.getByRole('radio', { name: 'CNY pricing' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '1.00' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '2.00' },
    })
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Premium' }))
    expect(screen.getByLabelText(/Provider successful price/)).toHaveValue(
      '1.00'
    )
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '3.00' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0].scopes).toEqual([
      {
        parameterCombinationId: 'scope-1',
        providerSuccessPriceCny: '1.00',
        prices: [
          {
            priceGroupId: 'group-1',
            sourcePriceVersionId: 'price-1',
            customerPriceCny: '2.00',
          },
          {
            priceGroupId: 'group-2',
            sourcePriceVersionId: 'price-2',
            customerPriceCny: '3.00',
          },
        ],
      },
    ])
  })

  it('submits every relevant scope when CNY pricing changes the billing unit', async () => {
    const detail = await mocks.detail()
    const scope2 = {
      ...detail.pricingScopes[0],
      parameterCombinationId: 'scope-2',
      combinationKey: 'quality-4k',
      parameters: { quality: '4K' },
      currentProviderRate: {
        ...detail.pricingScopes[0].currentProviderRate,
        id: 'rate-2',
      },
      prices: [
        {
          ...detail.pricingScopes[0].prices[0],
          current: {
            ...detail.pricingScopes[0].prices[0].current,
            id: 'price-scope-2',
          },
        },
      ],
    }
    const providerOnlyScope = {
      ...scope2,
      parameterCombinationId: 'scope-provider-only',
      combinationKey: 'provider-only',
      parameters: { quality: 'legacy' },
      enabled: false,
      currentProviderRate: {
        ...scope2.currentProviderRate,
        id: 'rate-provider-only',
        normalizedAmountMinor: '0.14',
      },
      prices: scope2.prices.map((price: (typeof scope2.prices)[number]) => ({
        ...price,
        current: null,
      })),
    }
    const twoScopeModel = {
      ...model,
      combinations: [
        ...model.combinations,
        {
          id: 'scope-2',
          key: 'quality-4k',
          parameters: { quality: '4K' },
          enabled: true,
        },
        {
          id: 'scope-provider-only',
          key: 'provider-only',
          parameters: { quality: 'legacy' },
          enabled: false,
        },
      ],
    }
    mocks.workspace.mockResolvedValue({
      models: [twoScopeModel],
      priceGroups: detail.priceGroups,
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      model: twoScopeModel,
      pricingScopes: [...detail.pricingScopes, scope2, providerOnlyScope],
    })
    const user = userEvent.setup()
    renderPricing('model-1', { tab: 'set' })
    await user.click(await screen.findByRole('radio', { name: 'CNY pricing' }))
    await user.click(screen.getByRole('combobox', { name: 'Billing unit' }))
    await user.click(screen.getByRole('option', { name: 'per request' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '1.00' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '2.00' },
    })
    await user.click(screen.getByRole('combobox', { name: 'Pricing scope' }))
    await user.click(screen.getByRole('option', { name: 'Quality: 4K' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '3.00' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '4.00' },
    })
    await waitFor(() => expect(mocks.calculateCny).toHaveBeenCalled())
    expect(mocks.calculateCny.mock.calls.at(-1)?.[0].scopes).toHaveLength(3)
    expect(mocks.calculateCny.mock.calls.at(-1)?.[0].scopes[2]).toEqual({
      parameterCombinationId: 'scope-provider-only',
      providerSuccessPriceCny: '0.14',
      prices: [],
    })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0].scopes).toHaveLength(3)
    expect(mocks.preview.mock.calls[0][0].scopes[1]).toEqual(
      expect.objectContaining({
        parameterCombinationId: 'scope-2',
        providerSuccessPriceCny: '3.00',
      })
    )
    expect(mocks.preview.mock.calls[0][0].scopes[2]).toEqual({
      parameterCombinationId: 'scope-provider-only',
      providerSuccessPriceCny: '0.14',
      prices: [],
    })
  })

  it('includes priced and unpriced published groups for an enabled scope during a CNY unit change', async () => {
    const detail = await mocks.detail()
    const premium = { id: 'group-2', code: 'PREMIUM', internalName: 'Premium' }
    mocks.workspace.mockResolvedValue({
      models: [model],
      priceGroups: [...detail.priceGroups, premium],
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      priceGroups: [...detail.priceGroups, premium],
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          enabled: true,
          prices: [
            ...detail.pricingScopes[0].prices,
            {
              priceGroupId: 'group-2',
              priceGroupCode: 'PREMIUM',
              priceGroupName: 'Premium',
              current: null,
            },
          ],
        },
      ],
    })
    const user = userEvent.setup()
    renderPricing('model-1')
    await openPricing()
    await user.click(screen.getByRole('radio', { name: 'CNY pricing' }))
    await user.click(screen.getByRole('combobox', { name: 'Billing unit' }))
    await user.click(screen.getByRole('option', { name: 'per request' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '1.00' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '2.00' },
    })
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Premium' }))
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '3.00' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0].scopes[0].prices).toEqual([
      expect.objectContaining({ priceGroupId: 'group-1' }),
      expect.objectContaining({
        priceGroupId: 'group-2',
        customerPriceCny: '3.00',
      }),
    ])
  })

  it('keeps only current groups for a disabled scope during a CNY unit change', async () => {
    const detail = await mocks.detail()
    const premium = { id: 'group-2', code: 'PREMIUM', internalName: 'Premium' }
    mocks.workspace.mockResolvedValue({
      models: [model],
      priceGroups: [...detail.priceGroups, premium],
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      priceGroups: [...detail.priceGroups, premium],
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          enabled: false,
          prices: [
            ...detail.pricingScopes[0].prices,
            {
              priceGroupId: 'group-2',
              priceGroupCode: 'PREMIUM',
              priceGroupName: 'Premium',
              current: null,
            },
          ],
        },
      ],
    })
    const user = userEvent.setup()
    renderPricing('model-1', { tab: 'set' })
    await user.click(await screen.findByRole('radio', { name: 'CNY pricing' }))
    await user.click(screen.getByRole('combobox', { name: 'Billing unit' }))
    await user.click(screen.getByRole('option', { name: 'per request' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '1.00' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '2.00' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0].scopes[0].prices).toHaveLength(1)
    expect(mocks.preview.mock.calls[0][0].scopes[0].prices[0]).toEqual(
      expect.objectContaining({ priceGroupId: 'group-1' })
    )
  })

  it('maps exact-conversion failures back to the unchanged CNY field and focuses it', async () => {
    mocks.preview.mockRejectedValueOnce({
      response: {
        data: {
          code: 'VALIDATION_FAILED',
          details: {
            field: 'scopes.0.prices.0.customerPriceCny',
            reason: 'exactPointConversionRequired',
            parameterCombinationId: 'scope-1',
            priceGroupId: 'group-1',
          },
        },
      },
    })
    const user = userEvent.setup()
    renderPricing('model-1')
    await openPricing()
    await user.click(screen.getByRole('radio', { name: 'CNY pricing' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '1.00' },
    })
    const customer = screen.getByLabelText(/Customer CNY price/)
    fireEvent.change(customer, { target: { value: '1.23' } })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    expect(
      await screen.findByText(
        'This CNY price cannot be converted to an exact point value. Adjust the price.'
      )
    ).toBeVisible()
    expect(customer).toHaveValue('1.23')
    expect(customer).toHaveFocus()
    expect(customer).toHaveAttribute('aria-invalid', 'true')
    expect(customer).toHaveAccessibleDescription(
      'RMB / per second This CNY price cannot be converted to an exact point value. Adjust the price.'
    )
  })

  it('maps a Token exact-conversion failure to the affected category field', async () => {
    const detail = await mocks.detail()
    const tokenModel = {
      ...model,
      billingUnit: 'MILLION_TOKENS',
      allowedBillingUnits: ['MILLION_TOKENS'],
      tokenCategories: ['input', 'output'],
    }
    mocks.workspace.mockResolvedValue({
      models: [tokenModel],
      priceGroups: detail.priceGroups,
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      model: tokenModel,
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          currentProviderRate: {
            ...detail.pricingScopes[0].currentProviderRate,
            billingUnit: 'MILLION_TOKENS',
            normalizedTokenRates: { input: '1.00', output: '2.00' },
          },
          prices: [
            {
              ...detail.pricingScopes[0].prices[0],
              current: {
                ...detail.pricingScopes[0].prices[0].current,
                billingUnit: 'MILLION_TOKENS',
                tokenRates: { input: '100', output: '200' },
              },
            },
          ],
        },
      ],
    })
    mocks.preview.mockRejectedValueOnce({
      response: {
        data: {
          code: 'VALIDATION_FAILED',
          details: {
            reason: 'exactPointConversionRequired',
            parameterCombinationId: 'scope-1',
            priceGroupId: 'group-1',
            tokenCategory: 'output',
          },
        },
      },
    })
    const user = userEvent.setup()
    renderPricing('model-1')
    await openPricing()
    await user.click(screen.getByRole('radio', { name: 'CNY pricing' }))
    const providers = screen.getAllByLabelText(/Provider successful price/)
    const customers = screen.getAllByLabelText(/Customer CNY price/)
    fireEvent.change(providers[0], { target: { value: '1.00' } })
    fireEvent.change(providers[1], { target: { value: '2.00' } })
    fireEvent.change(customers[0], { target: { value: '3.00' } })
    fireEvent.change(customers[1], { target: { value: '4.01' } })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    expect(
      await screen.findByText(
        'This CNY price cannot be converted to an exact point value. Adjust the price.'
      )
    ).toBeVisible()
    expect(customers[1]).toHaveFocus()
    expect(customers[1]).toHaveAttribute('aria-invalid', 'true')
    expect(customers[0]).toHaveAttribute('aria-invalid', 'false')
  })

  it('localizes a CNY price-at-cost conflict and disables confirmation', async () => {
    const basePreview = await mocks.preview()
    mocks.preview.mockReset()
    mocks.preview.mockResolvedValueOnce({
      ...basePreview,
      inputMode: 'CNY',
      effectiveMode: 'IMMEDIATE',
      conflicts: [
        {
          code: 'CUSTOMER_PRICE_NOT_ABOVE_COST',
          parameterCombinationId: 'scope-1',
          priceGroupId: 'group-1',
          categories: ['input'],
          message: 'raw server message',
        },
      ],
      canPublish: false,
    })
    const user = userEvent.setup()
    renderPricing('model-1')
    await openPricing()
    await user.click(screen.getByRole('radio', { name: 'CNY pricing' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '1.00' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '1.00' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    expect(
      await screen.findByText(/Customer CNY price must be above/)
    ).toHaveTextContent('input')
    expect(
      screen.getByRole('button', { name: 'Confirm and publish' })
    ).toBeDisabled()
  })

  it('selects CNY when the current version was entered in CNY', async () => {
    const detail = await mocks.detail()
    mocks.detail.mockResolvedValue({
      ...detail,
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          prices: [
            {
              ...detail.pricingScopes[0].prices[0],
              current: {
                ...detail.pricingScopes[0].prices[0].current,
                inputMode: 'CNY',
                points: '987',
                questionnaire: {
                  ...detail.pricingScopes[0].prices[0].current.questionnaire,
                  targetMarginRate: null,
                  successProbability: '1',
                },
              },
            },
          ],
        },
      ],
    })
    renderPricing('model-1')
    await openPricing()
    expect(screen.getByRole('radio', { name: 'CNY pricing' })).toBeChecked()
    expect(screen.getByLabelText(/Provider successful price/)).toHaveValue('')
    expect(screen.getByLabelText(/Customer CNY price/)).toHaveValue('')
  })

  it('clears the published CNY draft and navigation warning after success', async () => {
    const basePreview = await mocks.preview()
    mocks.preview.mockReset()
    mocks.preview.mockResolvedValue({
      ...basePreview,
      inputMode: 'CNY',
      effectiveMode: 'IMMEDIATE',
    })
    mocks.publish.mockResolvedValue({
      id: 'publication-1',
      status: 'PUBLISHED',
      inputMode: 'CNY',
      effectiveMode: 'IMMEDIATE',
    })
    const user = userEvent.setup()
    renderPricing('model-1')
    await openPricing()
    await user.click(screen.getByRole('radio', { name: 'CNY pricing' }))
    fireEvent.change(screen.getByLabelText(/Provider successful price/), {
      target: { value: '1.00' },
    })
    fireEvent.change(screen.getByLabelText(/Customer CNY price/), {
      target: { value: '2.00' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Preview and publish' })
    )
    await user.click(
      await screen.findByRole('button', { name: 'Confirm and publish' })
    )
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(
      screen.queryByText('Current changes have not been published.')
    ).not.toBeInTheDocument()
  })

  it.each(['field', 'unit', 'metadata'] as const)(
    'does not send a stale CNY preview when %s changes while validation is pending',
    async (change) => {
      const user = userEvent.setup()
      renderPricing('model-1')
      await openPricing()
      await user.click(screen.getByRole('radio', { name: 'CNY pricing' }))
      fireEvent.change(screen.getByLabelText(/Provider successful price/), {
        target: { value: '1.00' },
      })
      const customer = screen.getByLabelText(/Customer CNY price/)
      fireEvent.change(customer, { target: { value: '2.00' } })
      fireEvent.click(
        screen.getByRole('button', { name: 'Preview and publish' })
      )
      if (change === 'field') {
        fireEvent.change(customer, { target: { value: '2.50' } })
      } else if (change === 'metadata') {
        fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
          target: { value: 'new metadata' },
        })
      } else {
        fireEvent.click(screen.getByRole('combobox', { name: 'Billing unit' }))
        fireEvent.click(screen.getByRole('option', { name: 'per request' }))
      }
      await Promise.resolve()
      await Promise.resolve()
      expect(mocks.preview).not.toHaveBeenCalled()
      expect(
        screen.queryByRole('button', { name: 'Confirm and publish' })
      ).not.toBeInTheDocument()
    }
  )

  it('uses questionnaire labels in Chinese formulas and rounds the target only after dividing by margin', async () => {
    i18next.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
    await i18next.changeLanguage('zhCN')
    try {
      renderPricing('model-1')
      await openPricing()
      fireEvent.change(screen.getByLabelText('服务商成本'), {
        target: { value: '0.01' },
      })
      await userEvent.setup().click(screen.getByText('查看计算依据'))
      const formula = screen.getByText((text) =>
        text.startsWith('目标毛利底价 ≈')
      )
      expect(formula).toHaveTextContent(/→ 2 积分/)
      expect(
        screen.queryByText(/K_theory|C_success|P_break|ceil\(/)
      ).not.toBeInTheDocument()
      expect(
        screen.getByText((text) => text.startsWith('每个成功任务成本 ='))
      ).toHaveTextContent('预计成功率')
    } finally {
      await i18next.changeLanguage('en')
    }
  })
  it('shows a retry action when the model workspace cannot load', async () => {
    mocks.workspace.mockRejectedValueOnce(new Error('unavailable'))
    renderPricing('model-1')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Model pricing could not be loaded'
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByTestId('adjust-pricing')).toBeVisible()
  })
  it('keeps Current pricing as a five-column table with one action per row', async () => {
    renderPricing('model-1')
    const table = await screen.findByRole('table')
    const bindings = screen.getByRole('link', {
      name: 'Manage API Key bindings',
    })
    expect(bindings).toHaveClass('border-border')
    expect(bindings).not.toHaveClass('border-transparent')
    expect(table).toHaveClass('table-fixed')
    expect(screen.getAllByRole('columnheader')).toHaveLength(5)
    expect(screen.getByRole('columnheader', { name: 'Quality' })).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: 'Price plan' })
    ).toBeVisible()
    expect(screen.getAllByTestId('adjust-pricing')).toHaveLength(1)
    expect(screen.getByTestId('adjust-pricing')).toHaveClass(
      'h-8',
      'border-border'
    )
    expect(
      screen.queryByRole('button', { name: 'Details' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Collapse' })
    ).not.toBeInTheDocument()
  })

  it('opens at Current pricing and puts provider costs inside the first pricing questionnaire', async () => {
    renderPricing('model-1')
    expect(
      await screen.findByRole('tab', { name: 'Current pricing' })
    ).toHaveAttribute('aria-selected', 'true')
    await openPricing()
    expect(screen.getByLabelText('Service provider cost')).toHaveValue(
      '0.14400000'
    )
    expect(screen.getByLabelText('Failed-attempt cost')).toBeVisible()
    expect(screen.getByLabelText('Expected success rate')).toBeVisible()
    expect(screen.getByText(/Cost per successful task =/)).not.toBeVisible()
    fireEvent.click(screen.getByText('Show calculation details'))
    expect(screen.getAllByText(/Cost per successful task =/)[0]).toBeVisible()
  })

  it('validates provider cost amounts beside one field without a duplicate summary', async () => {
    const user = userEvent.setup()
    renderPricing('model-1')
    await openPricing()
    const successfulCost = screen.getByLabelText('Service provider cost')

    fireEvent.change(successfulCost, { target: { value: '' } })
    fireEvent.blur(successfulCost)
    expect(screen.getByText('Enter the successful call cost.')).toBeVisible()
    expect(screen.getAllByRole('alert')).toHaveLength(1)

    fireEvent.change(successfulCost, { target: { value: '-1' } })
    fireEvent.blur(successfulCost)
    expect(screen.getByText('Enter a non-negative amount.')).toBeVisible()

    fireEvent.change(successfulCost, { target: { value: '0.001' } })
    fireEvent.blur(successfulCost)
    expect(
      screen.getByText('Amounts support at most two decimal places.')
    ).toBeVisible()

    fireEvent.change(successfulCost, { target: { value: '0' } })
    fireEvent.blur(successfulCost)
    expect(successfulCost).toHaveAttribute('aria-invalid', 'false')

    await user.click(
      screen.getByRole('combobox', { name: 'Failed-attempt cost' })
    )
    await user.click(
      screen.getByRole('option', { name: 'Fixed failed-attempt cost' })
    )
    const failedCost = screen.getByRole('textbox', {
      name: 'Failed call cost',
    })
    expect(failedCost).toHaveAttribute('aria-invalid', 'false')
    expect(
      screen.queryByText('Enter the failed call cost.')
    ).not.toBeInTheDocument()
    expect(failedCost).toHaveAccessibleDescription('RMB / per second')
    fireEvent.change(failedCost, { target: { value: '' } })
    fireEvent.blur(failedCost)
    expect(screen.getByText('Enter the failed call cost.')).toBeVisible()
  })

  it('retains the exact normalized RMB cost instead of reusing the foreign-currency amount', async () => {
    renderPricing('model-1')
    await openPricing()
    expect(screen.getByLabelText('Service provider cost')).toHaveValue(
      '0.14400000'
    )
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.14' },
    })
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'vendor rate correction' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: [
          expect.objectContaining({
            providerRate: expect.objectContaining({
              nativeAmount: '0.14',
              currency: 'CNY',
            }),
          }),
        ],
      })
    )
  })

  it('carries the recommendation into the price step and explicitly retains the current version', async () => {
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.20' },
    })
    expect(screen.getByRole('button', { name: 'Use recommended' })).toHaveClass(
      'h-8',
      'border-border'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use recommended' }))
    expect(screen.getByLabelText('Proposed price points')).toHaveValue('34')
    fireEvent.click(screen.getByRole('button', { name: /Keep current/ }))
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'retain the current customer price' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0].scopes[0].prices[0]).toMatchObject({
      action: 'KEEP',
      sourcePriceVersionId: 'price-1',
    })
  })

  it('shows monetary precision and probability errors beside the questionnaire fields', async () => {
    renderPricing('model-1')
    await openPricing()
    const other = screen.getByLabelText('Other variable cost for every attempt')
    fireEvent.change(other, { target: { value: '0.001' } })
    fireEvent.blur(other)
    expect(other).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByText('Enter a non-negative value with up to 2 decimals')
    ).toBeVisible()
    const probability = screen.getByLabelText('Expected success rate')
    fireEvent.change(probability, { target: { value: '0' } })
    fireEvent.blur(probability)
    expect(probability).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Change reason (optional)')).toBeVisible()
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('allows a blank ordinary change reason when the pricing draft is valid', async () => {
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.14' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({
      decisionSummary: '',
    })
  })

  it('omits effectiveAt for immediate preview, sends it only when scheduled, and clears it when switched back', async () => {
    const preview = await mocks.preview()
    mocks.preview.mockClear()
    mocks.preview.mockResolvedValue({
      ...preview,
      pointIssuanceRate: {
        ...preview.pointIssuanceRate,
        pointsPerRmb: '50.00000000',
      },
    })
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.14' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0]).not.toHaveProperty('effectiveAt')
    const immediateConfirmation = await screen.findByRole('alertdialog')
    const formattedPreviewTime = new Date(preview.effectiveAt).toLocaleString(
      toIntlLocale(i18next.resolvedLanguage ?? i18next.language)
    )
    expect(immediateConfirmation).toHaveTextContent(
      'Confirm pricing publication'
    )
    expect(immediateConfirmation).toHaveTextContent(
      'Review the changes and their effective schedule.'
    )
    expect(immediateConfirmation).toHaveTextContent('Immediately')
    expect(immediateConfirmation).toHaveTextContent('50 points per RMB')
    expect(immediateConfirmation).not.toHaveTextContent('50.00000000')
    expect(immediateConfirmation).not.toHaveTextContent('Effective at')
    expect(immediateConfirmation).not.toHaveTextContent(formattedPreviewTime)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('radio', { name: 'Schedule for later' }))
    const effectiveAt = screen.getByLabelText(/^Effective at/)
    expect(effectiveAt).toHaveAttribute('id', 'model-pricing-effective')
    fireEvent.change(effectiveAt, { target: { value: '2099-01-01T12:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(2))
    expect(mocks.preview.mock.calls[1][0].effectiveAt).toMatch(/^2099-01-01T/)
    const scheduledConfirmation = await screen.findByRole('alertdialog')
    expect(scheduledConfirmation).toHaveTextContent('Effective mode:')
    expect(scheduledConfirmation).toHaveTextContent(formattedPreviewTime)
    expect(scheduledConfirmation).toHaveTextContent(
      Intl.DateTimeFormat().resolvedOptions().timeZone
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    fireEvent.click(screen.getByRole('radio', { name: 'Immediately' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(3))
    expect(mocks.preview.mock.calls[2][0]).not.toHaveProperty('effectiveAt')
  })

  it('returns focus to an invalid required price field before requesting a preview', async () => {
    renderPricing('model-1')
    await openPricing()
    const providerCost = screen.getByLabelText('Service provider cost')
    fireEvent.change(providerCost, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))

    await waitFor(() => expect(document.activeElement).toBe(providerCost))
    expect(providerCost).toHaveAttribute('aria-invalid', 'true')
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('invalidates a scheduled preview when its time passes before confirmation and focuses its effective time', async () => {
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2099-01-01T00:00:00.000Z').getTime())
    try {
      renderPricing('model-1')
      await openPricing()
      fireEvent.change(screen.getByLabelText('Service provider cost'), {
        target: { value: '0.14' },
      })
      fireEvent.click(screen.getByRole('radio', { name: 'Schedule for later' }))
      const effectiveAt = await screen.findByLabelText(/^Effective at/)
      fireEvent.change(effectiveAt, { target: { value: '2099-01-01T12:00' } })
      fireEvent.click(
        screen.getByRole('button', { name: 'Preview and publish' })
      )
      await screen.findByRole('button', { name: 'Confirm and publish' })

      now.mockReturnValue(new Date('2099-01-02T00:00:00.000Z').getTime())
      fireEvent.click(
        screen.getByRole('button', { name: 'Confirm and publish' })
      )

      await waitFor(() => expect(document.activeElement).toBe(effectiveAt))
      expect(
        screen.getByText(
          'The scheduled time has passed. Choose a new time and preview again.'
        )
      ).toBeVisible()
      expect(mocks.publish).not.toHaveBeenCalled()
    } finally {
      now.mockRestore()
    }
  })

  it('preserves an unchanged foreign token cost by its stored version', async () => {
    const tokenModel = {
      ...model,
      id: 'token-model',
      billingUnit: 'MILLION_TOKENS',
      allowedBillingUnits: ['MILLION_TOKENS'],
      tokenCategories: ['input', 'output', 'cacheRead'],
    }
    const baseDetail = await mocks.detail()
    mocks.workspace.mockResolvedValue({
      models: [tokenModel],
      priceGroups: [
        { id: 'group-1', code: 'STANDARD', internalName: 'Standard' },
      ],
    })
    mocks.detail.mockResolvedValue({
      ...baseDetail,
      model: tokenModel,
      pricingScopes: [
        {
          ...baseDetail.pricingScopes[0],
          currentProviderRate: {
            ...baseDetail.pricingScopes[0].currentProviderRate,
            billingUnit: 'MILLION_TOKENS',
            nativeAmount: '99',
            tokenRates: { input: '99', output: '88', cacheRead: '77' },
            normalizedTokenRates: {
              input: '0.12345678',
              output: '0.23456789',
              cacheRead: '0',
            },
            normalizedAmountMinor: '0',
          },
        },
      ],
    })
    renderPricing('token-model')
    await openPricing()
    expect(
      screen.queryByLabelText('Service provider cost')
    ).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('input · RMB / per million tokens')
    ).toHaveValue('0.12345678')
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'token vector correction' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0]).toMatchObject({
      customerModelId: 'token-model',
      billingUnit: 'MILLION_TOKENS',
    })
    expect(mocks.preview.mock.calls[0][0].scopes[0].providerRate).toEqual({
      action: 'KEEP',
      sourceProviderRateVersionId: 'rate-1',
    })
  })
  it('requires and submits each Token category assumptions with separate recommended rates', async () => {
    const tokenModel = {
      ...model,
      billingUnit: 'MILLION_TOKENS',
      allowedBillingUnits: ['MILLION_TOKENS'],
      tokenCategories: ['input', 'output', 'cacheRead'],
    }
    const baseline = await mocks.detail()
    mocks.workspace.mockResolvedValue({
      models: [tokenModel],
      priceGroups: baseline.priceGroups,
    })
    mocks.detail.mockResolvedValue({
      ...baseline,
      model: tokenModel,
      pricingScopes: [
        {
          ...baseline.pricingScopes[0],
          currentProviderRate: {
            ...baseline.pricingScopes[0].currentProviderRate,
            billingUnit: 'MILLION_TOKENS',
            normalizedAmountMinor: '0.20',
            normalizedTokenRates: {
              input: '0.20',
              output: '0.60',
              cacheRead: '0',
            },
            failureChargePolicy: { mode: 'NONE' },
          },
          prices: [{ ...baseline.pricingScopes[0].prices[0], current: null }],
        },
      ],
    })
    const tokenPreview = await mocks.preview()
    mocks.preview.mockClear()
    mocks.preview.mockResolvedValue({
      ...tokenPreview,
      billingUnit: 'MILLION_TOKENS',
      scopes: [
        {
          ...tokenPreview.scopes[0],
          prices: [
            {
              priceGroupId: 'group-1',
              action: 'SET',
              changed: true,
              current: null,
              proposed: {
                billingUnit: 'MILLION_TOKENS',
                points: '59',
                tokenRates: { input: '59', output: '150', cacheRead: '0' },
                questionnaire: {
                  ...baseline.pricingScopes[0].prices[0].current.questionnaire,
                  tokenCategoryAssumptions: {
                    input: {
                      otherVariableCostRmb: '0.10',
                      riskBufferRmb: '0.05',
                    },
                    output: {
                      otherVariableCostRmb: '0.20',
                      riskBufferRmb: '0.10',
                    },
                    cacheRead: {
                      otherVariableCostRmb: '0',
                      riskBufferRmb: '0',
                    },
                  },
                },
              },
              calculation: null,
            },
          ],
        },
      ],
    })
    renderPricing('model-1')
    await openPricing()
    expect(
      screen.queryByRole('textbox', { name: 'Billing unit' })
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Change reason (optional)')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Expected success rate'), {
      target: { value: '100' },
    })
    for (const [category, other, buffer] of [
      ['input', '0.10', '0.05'],
      ['output', '0.20', '0.10'],
      ['cacheRead', '0', '0'],
    ]) {
      fireEvent.change(
        screen.getByLabelText(
          `Additional cost per million tokens · ${category}`
        ),
        { target: { value: other } }
      )
      fireEvent.change(
        screen.getByLabelText(
          `Risk buffer per successful million tokens · ${category}`
        ),
        { target: { value: buffer } }
      )
    }
    for (const category of ['input', 'output', 'cacheRead']) {
      fireEvent.click(
        screen.getByRole('button', { name: `Use recommended · ${category}` })
      )
    }
    expect(
      screen.getByLabelText('Customer price per million tokens · input')
    ).toHaveValue('59')
    expect(
      screen.getByLabelText('Customer price per million tokens · output')
    ).toHaveValue('150')
    expect(
      screen.getByLabelText('Customer price per million tokens · cacheRead')
    ).toHaveValue('0')
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'Category cost basis and initial token pricing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    const payload = mocks.preview.mock.calls[0][0].scopes[0].prices[0]
    expect(payload).toMatchObject({
      action: 'SET',
      tokenRates: { input: '59', output: '150', cacheRead: '0' },
      tokenCategoryAssumptions: {
        input: { otherVariableCostRmb: '0.10', riskBufferRmb: '0.05' },
        output: { otherVariableCostRmb: '0.20', riskBufferRmb: '0.10' },
        cacheRead: { otherVariableCostRmb: '0', riskBufferRmb: '0' },
      },
    })
    expect(payload).not.toHaveProperty('otherVariableCostRmb')
    expect(payload).not.toHaveProperty('riskBufferRmb')
    expect(
      await screen.findByRole('heading', { name: 'Quality: HD' })
    ).toBeVisible()
    expect(screen.getByText('Price plan: Standard')).toBeVisible()
    expect(
      screen.getAllByRole('columnheader', { name: 'Changed field' })
    ).toHaveLength(2)
    expect(
      screen.getByRole('cell', { name: '59 points per million tokens' })
    ).toBeVisible()
    expect(
      screen.getByRole('cell', { name: '150 points per million tokens' })
    ).toBeVisible()
  })
  it.each(Object.entries({ zhCN: zh, zhTW, ja, fr, ru, vi: viLocale }))(
    'uses translated current-to-adjust workflow in %s',
    async (locale, resource) => {
      const labels = resource.translation as Record<string, string>
      i18next.addResourceBundle(locale, 'translation', labels, true, true)
      await i18next.changeLanguage(locale)
      renderPricing('model-1')
      expect(
        await screen.findByRole('tab', { name: labels['Current pricing'] })
      ).toHaveAttribute('aria-selected', 'true')
      await openPricing()
      expect(
        screen.getByLabelText(labels['Change reason (optional)'])
      ).toBeVisible()
      await i18next.changeLanguage('en')
    }
  )

  it('shows normalized provider cost in Current before editing', async () => {
    renderPricing('model-1')
    expect(await screen.findByText(/0.14 RMB/)).toBeVisible()
  })

  it('does not silently round a normalized cost with more than two RMB decimals', async () => {
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.145' },
    })
    fireEvent.blur(screen.getByLabelText('Service provider cost'))
    expect(
      (
        await screen.findAllByText(/Amounts support at most two decimal places/)
      )[0]
    ).toBeVisible()
    expect(mocks.preview).not.toHaveBeenCalled()
  })

  it('invalidates a prior preview when the cost draft changes', async () => {
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.15' },
    })
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'first cost review' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.queryByRole('button', { name: 'Confirm and publish' })
    ).not.toBeInTheDocument()
  })

  it('uses the existing route navigation guard when the draft is dirty', async () => {
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.15' },
    })
    expect(screen.getByText('Current pricing')).toBeVisible()
  })

  it('allows a selected scope to retain its current customer version', async () => {
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.15' },
    })
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'provider-only change' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0].scopes[0].prices[0]).toMatchObject({
      action: 'KEEP',
      sourcePriceVersionId: 'price-1',
    })
  })

  it('keeps the published point issuance rate available in the pricing basis', async () => {
    renderPricing('model-1')
    await openPricing()
    fireEvent.click(screen.getByText('Show calculation details'))
    expect(screen.getByText(/100.*points per RMB/)).toBeVisible()
  })

  it('ignores a late preview after its review reason changes', async () => {
    let resolvePreview: (value: unknown) => void = () => undefined
    mocks.preview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve
        })
    )
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.15' },
    })
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'first reason' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'changed reason' },
    })
    resolvePreview({
      id: 'late-preview',
      billingUnit: 'SECOND',
      effectiveAt: '2026-09-08T00:00:00.000Z',
      pointIssuanceRate: { pointsPerRmb: '100' },
      scopes: [],
      conflicts: [],
      canPublish: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(
      screen.queryByRole('button', { name: 'Confirm and publish' })
    ).not.toBeInTheDocument()
  })

  it('preserves a SET price and KEEP source while switching price groups', async () => {
    const detail = await mocks.detail()
    const group2 = { id: 'group-2', code: 'PREMIUM', internalName: 'Premium' }
    const secondPrice = {
      ...detail.pricingScopes[0].prices[0],
      priceGroupId: 'group-2',
      priceGroupCode: 'PREMIUM',
      priceGroupName: 'Premium',
      current: {
        ...detail.pricingScopes[0].prices[0].current,
        id: 'price-2',
        points: '12',
      },
    }
    mocks.workspace.mockResolvedValue({
      models: [model],
      priceGroups: [
        { id: 'group-1', code: 'STANDARD', internalName: 'Standard' },
        group2,
      ],
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      priceGroups: [
        { id: 'group-1', code: 'STANDARD', internalName: 'Standard' },
        group2,
      ],
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          prices: [...detail.pricingScopes[0].prices, secondPrice],
        },
      ],
    })
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.14' },
    })
    fireEvent.change(screen.getByLabelText('Proposed price points'), {
      target: { value: '15' },
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Premium' }))
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Standard' }))
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'group review' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0].scopes[0].prices).toEqual([
      expect.objectContaining({
        priceGroupId: 'group-1',
        action: 'SET',
        sourcePriceVersionId: 'price-1',
        points: '15',
      }),
      expect.objectContaining({
        priceGroupId: 'group-2',
        action: 'KEEP',
        sourcePriceVersionId: 'price-2',
      }),
    ])
  })

  it('blocks publication when preview cannot publish and resubmits a bounded loss resolution', async () => {
    mocks.preview.mockResolvedValueOnce({
      id: 'blocked',
      billingUnit: 'SECOND',
      effectiveAt: '2026-09-08T00:00:00.000Z',
      pointIssuanceRate: { pointsPerRmb: '100' },
      scopes: [],
      canPublish: false,
      conflicts: [{ code: 'BELOW_BREAK_EVEN' }],
    })
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.14' },
    })
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'loss resolution review' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    expect(
      await screen.findByRole('button', { name: 'Confirm and publish' })
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview with risk resolution' })
    )
    expect(
      await screen.findByText('Loss deadline must be in the future')
    ).toBeVisible()
    expect(
      screen.getByLabelText('Maximum expected loss points')
    ).toHaveAttribute('aria-invalid', 'true')
    expect(mocks.preview).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Loss deadline'), {
      target: { value: '2099-09-10T00:00' },
    })
    fireEvent.change(screen.getByLabelText('Maximum expected loss points'), {
      target: { value: '100' },
    })
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'temporary capped exception' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview with risk resolution' })
    )
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(2))
    expect(mocks.preview.mock.calls[1][0].costRiskResolution).toMatchObject({
      type: 'TEMPORARY_LOSS',
      maxExpectedLossPoints: '100',
    })
  })

  it('clears unpublished scope changes after a publication succeeds', async () => {
    const detail = await mocks.detail()
    const scope2 = {
      ...detail.pricingScopes[0],
      parameterCombinationId: 'scope-2',
      combinationKey: 'premium',
      enabled: true,
      currentProviderRate: {
        ...detail.pricingScopes[0].currentProviderRate,
        id: 'rate-2',
        normalizedAmountMinor: '0.14',
      },
      prices: [
        {
          ...detail.pricingScopes[0].prices[0],
          current: {
            ...detail.pricingScopes[0].prices[0].current,
            id: 'price-2',
          },
        },
      ],
    }
    const twoScopeModel = {
      ...model,
      combinations: [
        ...model.combinations,
        {
          id: 'scope-2',
          key: 'premium',
          parameters: { quality: '4K' },
          enabled: true,
        },
      ],
    }
    mocks.workspace.mockResolvedValue({
      models: [twoScopeModel],
      priceGroups: [
        { id: 'group-1', code: 'STANDARD', internalName: 'Standard' },
      ],
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      model: twoScopeModel,
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          currentProviderRate: {
            ...detail.pricingScopes[0].currentProviderRate,
            normalizedAmountMinor: '0.14',
          },
        },
        scope2,
      ],
    })
    mocks.publish.mockResolvedValue({ id: 'publication', status: 'PUBLISHED' })
    renderPricing('model-1')
    await openPricing()
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Pricing scope' }))
    await user.click(screen.getByRole('option', { name: 'Quality: 4K' }))
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.15' },
    })
    await user.click(screen.getByRole('combobox', { name: 'Pricing scope' }))
    await user.click(screen.getByRole('option', { name: 'Quality: HD' }))
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'publish the first scope' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await screen.findByRole('button', { name: 'Confirm and publish' })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish' }))
    await waitFor(() => expect(mocks.publish).toHaveBeenCalledTimes(1))
    expect(
      await screen.findByRole('tab', { name: 'Set prices' })
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('clears unpublished plan changes after a publication succeeds', async () => {
    const detail = await mocks.detail()
    const groups = [
      ...detail.priceGroups,
      { id: 'group-2', code: 'PREMIUM', internalName: 'Premium' },
    ]
    const secondPrice = {
      ...detail.pricingScopes[0].prices[0],
      priceGroupId: 'group-2',
      priceGroupName: 'Premium',
      current: null,
    }
    mocks.workspace.mockResolvedValue({ models: [model], priceGroups: groups })
    mocks.detail.mockResolvedValue({
      ...detail,
      priceGroups: groups,
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          prices: [...detail.pricingScopes[0].prices, secondPrice],
        },
      ],
    })
    const preview = await mocks.preview()
    mocks.preview.mockClear()
    mocks.preview.mockResolvedValue({
      ...preview,
      scopes: [
        {
          ...preview.scopes[0],
          prices: [
            {
              priceGroupId: 'group-1',
              action: 'SET',
              current: null,
              proposed: null,
              calculation: null,
              changed: true,
            },
          ],
        },
      ],
    })
    mocks.publish.mockResolvedValue({ id: 'publication', status: 'PUBLISHED' })
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Proposed price points'), {
      target: { value: '15' },
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Premium' }))
    fireEvent.change(screen.getByLabelText('Proposed price points'), {
      target: { value: '22' },
    })
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Standard' }))
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'publish only standard plan' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await screen.findByRole('button', { name: 'Confirm and publish' })
    expect(mocks.preview.mock.calls[0][0].scopes[0].prices).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish' }))
    expect(
      await screen.findByRole('tab', { name: 'Set prices' })
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('submits only the selected unpriced scope without inventing another scope', async () => {
    const unpricedModel = {
      ...model,
      id: 'initial-model',
      billingUnit: null,
      combinations: [
        { id: 'scope-1', key: 'default', parameters: {}, enabled: true },
        { id: 'scope-2', key: 'premium', parameters: {}, enabled: true },
      ],
    }
    const detail = await mocks.detail()
    const unpriced = (id: string, key: string) => ({
      parameterCombinationId: id,
      combinationKey: key,
      parameters: {},
      enabled: true,
      currentProviderRate: null,
      prices: [
        {
          priceGroupId: 'group-1',
          priceGroupCode: 'STANDARD',
          priceGroupName: 'Standard',
          current: null,
        },
      ],
    })
    mocks.workspace.mockResolvedValue({
      models: [unpricedModel],
      priceGroups: [
        { id: 'group-1', code: 'STANDARD', internalName: 'Standard' },
      ],
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      model: unpricedModel,
      pricingScopes: [
        unpriced('scope-1', 'default'),
        unpriced('scope-2', 'premium'),
      ],
    })
    renderPricing('initial-model')
    await openPricing()
    expect(screen.getByText('Default scope')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '1' },
    })
    fireEvent.change(screen.getByLabelText('Proposed price points'), {
      target: { value: '20' },
    })
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'initial selected scope' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    expect(mocks.preview.mock.calls[0][0].scopes).toHaveLength(1)
    expect(
      mocks.preview.mock.calls[0][0].scopes[0].parameterCombinationId
    ).toBe('scope-1')
  })

  it('requires every scope and price group, including a disabled scope, for a billing-unit conversion', async () => {
    const detail = await mocks.detail()
    const group2 = { id: 'group-2', code: 'PREMIUM', internalName: 'Premium' }
    const scope2 = {
      ...detail.pricingScopes[0],
      parameterCombinationId: 'scope-2',
      combinationKey: 'premium',
      enabled: false,
      prices: [
        {
          ...detail.pricingScopes[0].prices[0],
          current: {
            ...detail.pricingScopes[0].prices[0].current,
            id: 'price-2',
          },
        },
        {
          ...detail.pricingScopes[0].prices[0],
          priceGroupId: 'group-2',
          priceGroupCode: 'PREMIUM',
          priceGroupName: 'Premium',
          current: {
            ...detail.pricingScopes[0].prices[0].current,
            id: 'price-3',
          },
        },
      ],
    }
    const twoScopeModel = {
      ...model,
      combinations: [
        ...model.combinations,
        {
          id: 'scope-2',
          key: 'premium',
          parameters: { quality: '4K' },
          enabled: false,
        },
      ],
    }
    mocks.workspace.mockResolvedValue({
      models: [twoScopeModel],
      priceGroups: [
        { id: 'group-1', code: 'STANDARD', internalName: 'Standard' },
        group2,
      ],
    })
    mocks.detail.mockResolvedValue({
      ...detail,
      model: twoScopeModel,
      priceGroups: [
        { id: 'group-1', code: 'STANDARD', internalName: 'Standard' },
        group2,
      ],
      pricingScopes: [
        {
          ...detail.pricingScopes[0],
          currentProviderRate: {
            ...detail.pricingScopes[0].currentProviderRate,
            normalizedAmountMinor: '0.14',
          },
          prices: [
            detail.pricingScopes[0].prices[0],
            {
              ...detail.pricingScopes[0].prices[0],
              priceGroupId: 'group-2',
              priceGroupCode: 'PREMIUM',
              priceGroupName: 'Premium',
              current: {
                ...detail.pricingScopes[0].prices[0].current,
                id: 'price-4',
              },
            },
          ],
        },
        scope2,
      ],
    })
    renderPricing('model-1')
    await openPricing()
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Billing unit' }))
    await user.click(screen.getByRole('option', { name: 'per request' }))
    expect(screen.getAllByLabelText(/Service provider cost/)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    expect(
      (await screen.findAllByText(/Enter the successful call cost/))[0]
    ).toBeVisible()
    const summaryLink = screen
      .getByText('Review the required pricing values')
      .closest('[role=alert]')
      ?.querySelector('button')
    expect(summaryLink).not.toBeNull()
    if (!summaryLink) throw new Error('Missing cost validation summary link')
    await user.click(summaryLink)
    expect(document.activeElement).toHaveAttribute('aria-invalid', 'true')
    expect(mocks.preview).not.toHaveBeenCalled()
    for (const input of screen.getAllByLabelText(/Service provider cost/)) {
      fireEvent.change(input, { target: { value: '0.20' } })
    }
    const prices = screen.getAllByLabelText('Proposed price points')
    expect(prices).toHaveLength(4)
    for (const input of prices) {
      expect(input).toHaveValue('')
      fireEvent.change(input, { target: { value: '40' } })
    }
    fireEvent.change(screen.getByLabelText('Change reason (optional)'), {
      target: { value: 'unit conversion all scopes' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Preview and publish' }))
    await waitFor(() => expect(mocks.preview).toHaveBeenCalledTimes(1))
    const scopes = mocks.preview.mock.calls[0][0].scopes
    expect(scopes).toHaveLength(2)
    expect(
      scopes.every(
        (scope: { prices: Array<{ action: string; points: string }> }) =>
          scope.prices.length === 2 &&
          scope.prices.every(
            (price) => price.action === 'SET' && price.points === '40'
          )
      )
    ).toBe(true)
  })

  it.each(Object.entries({ zhCN: zh, zhTW, ja, fr, ru, vi: viLocale }))(
    'localizes known conflicts and hides unknown server messages in %s',
    async (locale, resource) => {
      const labels = resource.translation as Record<string, string>
      i18next.addResourceBundle(locale, 'translation', labels, true, true)
      await i18next.changeLanguage(locale)
      mocks.preview.mockResolvedValueOnce({
        id: 'conflict',
        billingUnit: 'SECOND',
        effectiveAt: '2026-09-08T00:00:00.000Z',
        pointIssuanceRate: { pointsPerRmb: '100' },
        scopes: [],
        canPublish: false,
        conflicts: [
          { code: 'SCHEDULED_PRICE', message: 'raw server conflict' },
          { code: 'FUTURE_CONFLICT', message: 'raw future conflict' },
        ],
      })
      renderPricing('model-1')
      await openPricing()
      fireEvent.change(screen.getByLabelText(labels['Service provider cost']), {
        target: { value: '0.14' },
      })
      fireEvent.change(
        screen.getByLabelText(labels['Change reason (optional)']),
        {
          target: { value: 'localized conflict review' },
        }
      )
      fireEvent.click(
        screen.getByRole('button', { name: labels['Preview and publish'] })
      )
      expect(
        await screen.findByText(
          labels[
            'Cancel the scheduled customer price before publishing a new change.'
          ]
        )
      ).toBeVisible()
      expect(screen.getByText(labels.Unknown)).toBeVisible()
      expect(screen.queryByText(/raw .* conflict/i)).not.toBeInTheDocument()
      const user = userEvent.setup()
      await user.click(
        screen.getByRole('button', { name: labels['History versions'] })
      )
      await user.click(
        screen.getByRole('button', { name: labels['Keep editing'] })
      )
      expect(
        screen.getByLabelText(labels['Change reason (optional)'])
      ).toHaveValue('localized conflict review')
      await i18next.changeLanguage('en')
    }
  )

  it('updates the mounted workspace when the interface language changes', async () => {
    i18next.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
    await i18next.changeLanguage('en')
    renderPricing('model-1')
    expect(
      await screen.findByRole('tab', { name: 'Current pricing' })
    ).toBeVisible()
    await i18next.changeLanguage('zhCN')
    expect(
      await screen.findByRole('tab', {
        name: zh.translation['Current pricing'],
      })
    ).toBeVisible()
    await i18next.changeLanguage('en')
  })

  it('binds the route blocker to a real dirty pricing draft', async () => {
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.15' },
    })
    await waitFor(() =>
      expect(mocks.blocker).toHaveBeenLastCalledWith(
        expect.objectContaining({ condition: true })
      )
    )
  })

  it('asks before switching away from a dirty pricing tab and only switches after confirmation', async () => {
    renderPricing('model-1')
    await openPricing()
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.15' },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('tab', { name: 'History versions' }))
    expect(
      await screen.findByText('Leave unpublished pricing changes?')
    ).toBeVisible()

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Discard changes and leave' }))
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'History versions' })
      ).toHaveAttribute('aria-selected', 'true')
    )
  })

  it('confirms before requesting a controlled tab change', async () => {
    const onTabChange = vi.fn()
    const { client, rerender } = renderPricing('model-1', {
      tab: 'set',
      onTabChange,
    })
    await screen.findByLabelText('Service provider cost')
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.15' },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('tab', { name: 'History versions' }))

    expect(onTabChange).not.toHaveBeenCalledWith('history')
    expect(screen.getByText('Leave unpublished pricing changes?')).toBeVisible()
    expect(
      screen.getByRole('tab', { name: 'Set prices', hidden: true })
    ).toHaveAttribute('aria-selected', 'true')

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Discard changes and leave' }))
    expect(onTabChange).toHaveBeenCalledWith('history')

    rerender(
      <QueryClientProvider client={client}>
        <UnifiedModelPricing
          initialModelId='model-1'
          onBack={vi.fn()}
          onTabChange={onTabChange}
          tab='history'
        />
      </QueryClientProvider>
    )
    await waitFor(() =>
      expect(
        screen.getByRole('tab', { name: 'History versions' })
      ).toHaveAttribute('aria-selected', 'true')
    )
    rerender(
      <QueryClientProvider client={client}>
        <UnifiedModelPricing
          initialModelId='model-1'
          onBack={vi.fn()}
          onTabChange={onTabChange}
          tab='set'
        />
      </QueryClientProvider>
    )
    expect(
      await screen.findByLabelText('Change reason (optional)')
    ).toHaveValue('')
    expect(
      screen.queryByText('Current changes have not been published.')
    ).not.toBeInTheDocument()
  })
})
