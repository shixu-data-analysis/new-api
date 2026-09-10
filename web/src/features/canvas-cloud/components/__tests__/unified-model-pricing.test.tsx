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
      <UnifiedModelPricing initialModelId={initialModelId} onBack={vi.fn()} {...props} />
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
  mocks.history.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
  })
})

describe('UnifiedModelPricing', () => {
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

  it('retains unsubmitted scope drafts after a partial publication refetch', async () => {
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
      await screen.findByText('Unsubmitted scope drafts remain pending.')
    ).toBeVisible()
    await user.click(screen.getByRole('combobox', { name: 'Pricing scope' }))
    await user.click(screen.getByRole('option', { name: 'Quality: 4K' }))
    expect(screen.getByLabelText('Service provider cost')).toHaveValue('0.15')
  })

  it('retains a different plan draft in the published scope and keeps the leave guard', async () => {
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
      await screen.findByText('Unsubmitted scope drafts remain pending.')
    ).toBeVisible()
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(screen.getByRole('option', { name: 'Premium' }))
    expect(screen.getByLabelText('Proposed price points')).toHaveValue('22')
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
      await user.click(screen.getByRole('button', { name: labels.Leave }))
      await user.click(screen.getByRole('tab', { name: labels['Set prices'] }))
      await user.click(screen.getByRole('button', { name: labels.Leave }))
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

    await userEvent.setup().click(
      screen.getByRole('tab', { name: 'History versions' })
    )
    expect(await screen.findByText('Unsaved changes')).toBeVisible()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Leave' }))
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'History versions' })).toHaveAttribute(
        'aria-selected',
        'true'
      )
    )
  })

  it('leaves a dirty controlled tab to the route guard until its tab prop changes', async () => {
    const onTabChange = vi.fn()
    const { client, rerender } = renderPricing('model-1', {
      tab: 'set',
      onTabChange,
    })
    await screen.findByLabelText('Service provider cost')
    fireEvent.change(screen.getByLabelText('Service provider cost'), {
      target: { value: '0.15' },
    })

    await userEvent.setup().click(
      screen.getByRole('tab', { name: 'History versions' })
    )

    expect(onTabChange).toHaveBeenCalledWith('history')
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Set prices' })).toHaveAttribute(
      'aria-selected',
      'true'
    )

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
  })
})
