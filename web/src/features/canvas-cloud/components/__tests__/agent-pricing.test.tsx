/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'

import { AgentCenter } from '../AgentCenter'
import { AgentManagement } from '../AgentManagement'
import { ProviderPricingMatrix } from '../ProviderPricingMatrix'

const apiMocks = vi.hoisted(() => ({
  getCanvasAgentWorkspace: vi.fn(),
  getCanvasAgentInviteCodes: vi.fn(),
  searchCanvasAgentInviteCodes: vi.fn(),
  getCanvasAgentCustomers: vi.fn(),
  getCanvasAgentModelPrices: vi.fn(),
  getCanvasAgentCustomerModelUsage: vi.fn(),
  getCanvasAgents: vi.fn(),
  provisionCanvasAgent: vi.fn(),
  getCanvasProviderPricingMatrix: vi.fn(),
  publishCanvasProviderRate: vi.fn(),
  resolveCanvasProviderRateRisk: vi.fn(),
  revealCanvasCode: vi.fn(),
}))
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: toastMocks }))

function renderWithClient(element: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      {element}
    </QueryClientProvider>
  )
}

async function renderAgentManagement() {
  const result = renderWithClient(<AgentManagement />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Enable agent role' })
  )
  return result
}

describe('Canvas Agent and provider pricing governance', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasAgents.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasAgentWorkspace.mockResolvedValue({
      profile: {
        principalId: 'agent-v1',
        username: 'tokyo-agent',
        status: 'ACTIVE',
      },
      summary: {
        activatedCustomers: 1,
        customersWithSuccessfulTasks: 1,
        successfulTasks: 2,
        settledPoints: '20',
        modelUsageAmount: null,
        amountIncomplete: true,
      },
      priceGroups: [
        {
          priceGroupId: 'group-v1',
          priceGroupName: 'Standard',
          currentCustomers: 1,
          successfulTasks: 2,
          settledPoints: '20',
          modelUsageAmount: null,
          amountIncomplete: true,
        },
      ],
    })
    apiMocks.getCanvasAgentInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
      filters: { priceGroups: [{ id: 'group-v1', name: 'Standard' }] },
    })
    apiMocks.getCanvasAgentModelPrices.mockResolvedValue({
      page: 1,
      pageSize: 10,
      total: 0,
      items: [],
      filters: { capabilities: [], tags: [] },
    })
    apiMocks.getCanvasAgentCustomerModelUsage.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasAgentCustomers.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'customer-v1',
          username: 'invited-user',
          emailMasked: 'i***@example.com',
          status: 'ACTIVE',
          activatedAt: '2026-08-30T00:00:00.000Z',
          currentPriceGroup: { id: 'group-v1', name: 'Standard' },
          successfulTasks: 2,
          settledPoints: '20',
          modelUsageAmount: null,
          amountIncomplete: true,
        },
      ],
    })
    apiMocks.getCanvasProviderPricingMatrix.mockResolvedValue([
      {
        providerId: 'provider-v1',
        providerCode: 'HFSY',
        providerName: 'HFSY API',
        channelId: 'channel-v1',
        channelCode: 'image',
        customerModelId: 'model-v1',
        modelKey: 'image.model',
        effectiveDisplayName: 'Image Model',
        catalogDefaultName: 'Catalog Image Model',
        combinationId: 'combination-v1',
        combinationKey: 'quality=4K',
        parameters: { quality: '4K' },
        billingDimensions: { billingUnit: 'REQUEST', dimensions: ['quality'] },
        upstreamModelId: 'image-4k',
        rateId: 'rate-v1',
        rateVersion: 2,
        rateStatus: 'PUBLISHED',
        billingUnit: 'REQUEST',
        nativeAmount: '0.40',
        currency: 'CNY',
        normalizedAmountMinor: '0.40',
        rateEffectiveAt: '2026-08-30T00:00:00.000Z',
        prices: [
          {
            id: 'price-v1',
            groupId: 'group-v1',
            groupName: 'Standard',
            points: '20',
            version: 1,
            status: 'PUBLISHED',
            providerRateVersionId: 'rate-old',
            effectiveAt: '2026-08-29T00:00:00.000Z',
            breakEvenPoints: '10',
            newBreakEvenPoints: '24',
            belowBreakEven: true,
          },
        ],
        riskDecision: null,
      },
    ])
  })

  it('confirms that invitation ability preserves the existing customer boundary', async () => {
    await renderAgentManagement()
    fireEvent.change(await screen.findByLabelText('Customer username'), {
      target: { value: 'tokyo-agent' },
    })
    fireEvent.change(screen.getByLabelText('Enable reason'), {
      target: { value: 'Approved partner onboarding' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enable agent role' }))
    expect(await screen.findByText(/keeps all customer pages/)).toBeVisible()
    expect(apiMocks.provisionCanvasAgent).not.toHaveBeenCalled()
  })

  it('shows field-level validation instead of silently disabling creation', async () => {
    await renderAgentManagement()

    const createButton = await screen.findByRole('button', {
      name: 'Enable agent role',
    })
    expect(createButton).toBeEnabled()
    fireEvent.click(createButton)

    expect(await screen.findByText('Enter a username')).toBeVisible()
    expect(screen.getByText('Enter an approval reason')).toBeVisible()
    expect(screen.getByLabelText('Customer username')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect(apiMocks.provisionCanvasAgent).not.toHaveBeenCalled()
  })

  it('explains the server reason when inviter creation fails', async () => {
    apiMocks.provisionCanvasAgent.mockRejectedValueOnce({
      response: { data: { code: 'INVITER_CAPABILITY_ALREADY_GRANTED' } },
    })
    await renderAgentManagement()
    fireEvent.change(await screen.findByLabelText('Customer username'), {
      target: { value: 'tokyo-agent' },
    })
    fireEvent.change(screen.getByLabelText('Enable reason'), {
      target: { value: 'Approved partner onboarding' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enable agent role' }))
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm creation' })
    )

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Agent role could not be enabled',
        {
          description: 'This customer already has invitation ability.',
        }
      )
    )
  })

  it('adds invitation ability to a customer without a provider association', async () => {
    await renderAgentManagement()

    fireEvent.change(await screen.findByLabelText('Customer username'), {
      target: { value: 'tokyo-inviter' },
    })
    fireEvent.change(screen.getByLabelText('Enable reason'), {
      target: { value: 'Approved customer referral program' },
    })
    const createButton = screen.getByRole('button', {
      name: 'Enable agent role',
    })
    expect(createButton).toBeEnabled()
    fireEvent.click(createButton)
    expect(
      await screen.findByText('Enable agent role for this customer?')
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm creation' }))
    await waitFor(() =>
      expect(apiMocks.provisionCanvasAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'tokyo-inviter',
          status: 'ACTIVE',
          reason: 'Approved customer referral program',
          idempotencyKey: expect.stringMatching(/^web-agent-create-/u),
        })
      )
    )
  })

  it('guards a dirty inviter drawer before discarding its draft', async () => {
    await renderAgentManagement()

    fireEvent.change(await screen.findByLabelText('Customer username'), {
      target: { value: 'tokyo-inviter' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText('Discard this draft?')).toBeVisible()
    expect(
      screen.getByText('Leaving will discard the unpublished agent draft.')
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))
    await waitFor(() =>
      expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
    )
  })

  it('shows only customers attributed to the inviter', async () => {
    renderWithClient(<AgentCenter />)

    expect(await screen.findByText('My customers')).toBeVisible()
    expect(screen.getByText('invited-user')).toBeVisible()
    expect(screen.getByText('i***@example.com')).toBeVisible()
    expect(screen.getByText('Valid')).toBeVisible()
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument()
    expect(screen.queryByText('My models')).not.toBeInTheDocument()
    expect(screen.getByText('Cumulative overview')).toBeVisible()
    expect(screen.getAllByText(/Amount incomplete/u).length).toBeGreaterThan(0)
  })

  it('localizes the current model specification and billing unit', async () => {
    apiMocks.getCanvasAgentModelPrices.mockResolvedValue({
      page: 1,
      pageSize: 10,
      total: 1,
      filters: { capabilities: ['TEXT'], tags: [] },
      items: [
        {
          customerModelId: 'text-v1',
          modelKey: 'text.model',
          effectiveDisplayName: 'Text Model',
          catalogDefaultName: 'Catalog Text Model',
          description: 'Client description',
          capability: 'TEXT',
          tags: [],
          priceGroups: [
            {
              priceGroupId: 'group-v1',
              priceGroupName: 'Standard',
              prices: [
                {
                  combinationKey: 'default',
                  parameters: {},
                  billingUnit: 'MILLION_TOKENS',
                  customerPoints: '0',
                  customerTokenRates: { input: '0', output: '1' },
                  modelPriceCny: { input: '0', output: '0.25' },
                },
              ],
            },
          ],
        },
      ],
    })
    renderWithClient(<AgentCenter />)
    expect(
      await screen.findByText('Default scope · Per million tokens')
    ).toBeVisible()
    expect(screen.getByText('Client description')).toBeVisible()
    expect(screen.getByText(/Input: 0/u)).toBeVisible()
  })

  it('keeps a short exact invite code local and sends a complete code in the POST body', async () => {
    const user = userEvent.setup()
    apiMocks.getCanvasAgentInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      filters: { priceGroups: [{ id: 'group-v1', name: 'Standard' }] },
      items: [
        {
          id: 'invite-v1',
          maskedCode: 'CANVAS-U••••••••CRET',
          status: 'ACTIVE',
          priceGroupId: 'group-v1',
          priceGroupName: 'Standard',
          maxRegistrations: '10',
          reservedCount: '0',
          consumedCount: '1',
          remainingCount: '9',
          validFrom: '2026-08-30T00:00:00.000Z',
          expiresAt: '2027-08-30T00:00:00.000Z',
          activatedCustomers: '1',
          createdAt: '2026-08-30T00:00:00.000Z',
        },
      ],
    })
    apiMocks.searchCanvasAgentInviteCodes.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
      filters: { priceGroups: [{ id: 'group-v1', name: 'Standard' }] },
    })
    renderWithClient(<AgentCenter />)
    expect(await screen.findByText('CANVAS-U••••••••CRET')).toBeVisible()
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Column filters' }))[0]
    )
    const code = await screen.findByRole('textbox', {
      name: 'Exact invite code',
    })
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(await screen.findByRole('option', { name: 'Standard' }))
    fireEvent.change(code, { target: { value: 'ABC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(apiMocks.searchCanvasAgentInviteCodes).not.toHaveBeenCalled()
    expect(screen.queryByText('CANVAS-U••••••••CRET')).not.toBeInTheDocument()
    expect(
      screen.getByRole('combobox', { name: 'Price plan' })
    ).toHaveTextContent('Standard')
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    expect(
      await screen.findByRole('option', { name: 'Standard' })
    ).toBeVisible()
    fireEvent.change(code, { target: { value: 'ABCD-SECRET' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(apiMocks.searchCanvasAgentInviteCodes).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ABCD-SECRET' }),
        expect.anything()
      )
    )
  })

  it('filters owned invite codes by the selected price plan', async () => {
    const user = userEvent.setup()
    renderWithClient(<AgentCenter />)
    await user.click(
      (await screen.findAllByRole('button', { name: 'Column filters' }))[0]
    )
    await user.click(screen.getByRole('combobox', { name: 'Price plan' }))
    await user.click(await screen.findByRole('option', { name: 'Standard' }))

    await waitFor(() =>
      expect(apiMocks.getCanvasAgentInviteCodes).toHaveBeenCalledWith(
        expect.objectContaining({ priceGroupId: 'group-v1' }),
        expect.anything()
      )
    )
    expect(
      screen.getByRole('combobox', { name: 'Price plan' })
    ).toHaveTextContent('Standard')
  })

  it('expands task-time model usage with a frozen price snapshot and missing amount', async () => {
    apiMocks.getCanvasAgentCustomerModelUsage.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 2,
      items: [
        {
          priceGroupId: 'old-group',
          priceGroupName: 'Previous plan',
          customerModelId: 'model-v1',
          modelKey: 'image.model',
          effectiveDisplayName: 'Image Model',
          combinationKey: 'quality=4K',
          parameters: { quality: '4K' },
          billingUnit: 'REQUEST',
          usage: {
            requests: '2',
            seconds: '0',
            inputTokens: '0',
            outputTokens: '0',
            cacheReadTokens: '0',
            cacheWriteTokens: '0',
          },
          successfulTasks: 2,
          settledPoints: '20',
          agentPriceSnapshot: '0.25',
          agentPriceSnapshotStatus: 'SINGLE',
          modelUsageAmount: null,
          amountIncomplete: true,
        },
        {
          priceGroupId: 'old-group',
          priceGroupName: 'Previous plan',
          customerModelId: 'text-v1',
          modelKey: 'text.model',
          effectiveDisplayName: 'Text Model',
          combinationKey: 'default',
          parameters: {},
          billingUnit: 'MILLION_TOKENS',
          usage: {
            requests: '1',
            seconds: '0',
            inputTokens: null,
            outputTokens: '0',
            cacheReadTokens: '0',
            cacheWriteTokens: '0',
          },
          successfulTasks: 1,
          settledPoints: '0',
          agentPriceSnapshot: null,
          agentPriceSnapshotStatus: 'VARIES',
          modelUsageAmount: null,
          amountIncomplete: true,
        },
      ],
    })
    renderWithClient(<AgentCenter />)
    fireEvent.click(await screen.findByRole('button', { name: 'Model usage' }))
    expect((await screen.findAllByText('Previous plan')).length).toBe(2)
    expect(screen.getByText('¥0.25')).toBeVisible()
    expect(screen.getByText('Image Model / Quality: 4K')).toBeVisible()
    expect(screen.getByText('Text Model / Default scope')).toBeVisible()
    expect(screen.getByText('Multiple historical prices')).toBeVisible()
    expect(screen.getByText('Per million tokens')).toBeVisible()
    expect(screen.getAllByText(/Amount incomplete/u).length).toBeGreaterThan(0)
  })

  it('reveals and hides an owned invite code without decrypting twice', async () => {
    apiMocks.getCanvasAgentInviteCodes.mockResolvedValueOnce({
      page: 1,
      pageSize: 20,
      total: 1,
      filters: { priceGroups: [{ id: 'group-v1', name: 'Standard' }] },
      items: [
        {
          id: 'invite-v1',
          maskedCode: 'CANVAS-U••••••••CRET',
          status: 'ACTIVE',
          priceGroupId: 'group-v1',
          priceGroupName: 'Standard',
          maxRegistrations: '10',
          reservedCount: '0',
          consumedCount: '1',
          remainingCount: '9',
          validFrom: '2026-08-30T00:00:00.000Z',
          expiresAt: '2027-08-30T00:00:00.000Z',
          activatedCustomers: '1',
          createdAt: '2026-08-30T00:00:00.000Z',
        },
      ],
    })
    apiMocks.revealCanvasCode.mockResolvedValueOnce({
      id: 'invite-v1',
      code: 'CANVAS-SECRET',
    })
    const { container } = renderWithClient(<AgentCenter />)

    const show = await screen.findByRole('button', {
      name: 'Show invite code',
    })
    expect(show).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(show)
    expect(await screen.findByText('CANVAS-SECRET')).toBeVisible()

    const hide = screen.getByRole('button', { name: 'Hide invite code' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    expect(hide.querySelector('.lucide-eye-off')).toBeInTheDocument()
    fireEvent.click(hide)

    expect(await screen.findByText('CANVAS-U••••••••CRET')).toBeVisible()
    expect(apiMocks.revealCanvasCode).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.lucide-eye')).toBeInTheDocument()
  })

  it('shows the new cost floor and requires an explicit risk action', async () => {
    renderWithClient(<ProviderPricingMatrix />)
    fireEvent.change(
      await screen.findByRole('combobox', { name: /^Model and quality/ }),
      { target: { value: 'combination-v1' } }
    )
    const modelRow = screen.getByText('Image Model').closest('tr')
    if (!modelRow) throw new Error('Expected the model pricing table row')
    expect(within(modelRow).getByText('Below break-even')).toBeVisible()
    fireEvent.change(screen.getByRole('combobox', { name: /^Risk action/ }), {
      target: { value: 'MANUAL_PAUSE' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Record risk decision' })
    )
    expect(await screen.findByText('Enter at least 8 characters')).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', { name: /^Reason/ }), {
      target: { value: 'Pause this quality until safe pricing is published' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Record risk decision' })
    )
    expect(
      await screen.findByText('Confirm pricing risk decision?')
    ).toBeVisible()
    expect(apiMocks.resolveCanvasProviderRateRisk).not.toHaveBeenCalled()
  })

  it('wraps long model and quality values inside their table columns', async () => {
    renderWithClient(<ProviderPricingMatrix />)

    const modelCell = (await screen.findByText('Image Model')).closest('td')
    expect(modelCell).toHaveClass('whitespace-normal', 'break-words')

    const qualityCell = screen
      .getAllByText('4K')
      .map((element) => element.closest('td'))
      .find(Boolean)
    expect(qualityCell).toHaveClass('whitespace-normal', 'break-all')
    expect(screen.getByRole('button', { name: 'Column filters' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'View' })).toBeVisible()
    expect(
      screen.getByRole('combobox', { name: 'Rows per page' })
    ).toBeVisible()
  })

  it('localizes every upstream cost table heading in Chinese', async () => {
    await i18next.changeLanguage('zh')
    renderWithClient(<ProviderPricingMatrix />)

    expect(
      await screen.findByRole('columnheader', { name: '提供商' })
    ).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '模型' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '质量' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '计费单位' })).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: '提供商费率版本' })
    ).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '当前成本' })).toBeVisible()
    expect(screen.getByRole('columnheader', { name: '定价风险' })).toBeVisible()
    expect(
      screen.getByRole('columnheader', { name: '客户价格对比' })
    ).toBeVisible()
    expect(screen.queryByText('Provider rate version')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Customer price comparison')
    ).not.toBeInTheDocument()
  })
})
