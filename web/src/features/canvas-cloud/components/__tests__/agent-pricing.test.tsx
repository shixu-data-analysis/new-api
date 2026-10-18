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

const apiMocks = vi.hoisted(() => ({
  getCanvasAgentWorkspace: vi.fn(),
  getCanvasAgentInviteCodes: vi.fn(),
  searchCanvasAgentInviteCodes: vi.fn(),
  getCanvasAgentCustomers: vi.fn(),
  getCanvasAgentModelPrices: vi.fn(),
  getCanvasAgentCustomerModelUsage: vi.fn(),
  getCanvasAgents: vi.fn(),
  provisionCanvasAgent: vi.fn(),
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

function modelPrice(overrides: Record<string, unknown> = {}) {
  return {
    customerModelId: 'image-v1',
    modelKey: 'image.model',
    effectiveDisplayName: 'Image Model',
    catalogDefaultName: 'Catalog Image Model',
    description: null,
    capability: 'image.generate',
    tags: [],
    priceGroups: [
      {
        priceGroupId: 'group-v1',
        priceGroupName: 'Standard',
        prices: [
          {
            combinationKey: 'default',
            parameters: {},
            billingUnit: 'REQUEST',
            customerPoints: '5',
            customerTokenRates: null,
            modelPriceCny: '0.25',
          },
        ],
      },
    ],
    ...overrides,
  }
}

function pricePage(items: unknown[]) {
  return {
    page: 1,
    pageSize: 20,
    total: items.length,
    filters: {
      capabilities: ['image.generate'],
      tags: [],
      totalCount: items.length,
      untaggedCount: items.length,
      selectedCapability: 'image.generate',
      selectedTagId: null,
    },
    items,
  }
}

// Inactive tabs stay mounted but hidden, so only the selected panel is in the accessibility tree.
async function openTab(name: string) {
  fireEvent.click(await screen.findByRole('tab', { name }))
  return screen.getByRole('tabpanel')
}

// Current model prices load the first time their tab is opened.
async function openModelPrices() {
  return openTab('Current model prices')
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
        customersWithConsumption: 1,
        rechargedPoints: '1000',
        consumedPoints: '20',
      },
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
          status: 'ACTIVE',
          activatedAt: '2026-08-30T00:00:00.000Z',
          currentPriceGroup: { id: 'group-v1', name: 'Standard' },
          successfulTasks: 2,
          rechargedPoints: '1000',
          consumedPoints: '20',
          activeDays: [],
        },
      ],
      recentDays: [
        '2026-10-10',
        '2026-10-11',
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
        '2026-10-16',
      ],
    })
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
    expect(screen.getByText('Enter a reason')).toBeVisible()
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

  it('opens on the overview and the customer tab without emails or money', async () => {
    renderWithClient(<AgentCenter />)

    const overview = (await screen.findByText('Summary')).closest(
      '[data-slot=card]'
    ) as HTMLElement
    expect(within(overview).getByText('Activated customers')).toBeVisible()
    expect(within(overview).getByText('1,000')).toBeVisible()
    expect(within(overview).getByText('20')).toBeVisible()
    expect(screen.getByRole('tab', { name: 'My customers' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(await screen.findByText('invited-user')).toBeVisible()
    expect(screen.getByText('Valid')).toBeVisible()
    expect(screen.queryByText('ACTIVE')).not.toBeInTheDocument()
    expect(screen.queryByText('Email')).not.toBeInTheDocument()
    expect(screen.queryByText('Price group summary')).not.toBeInTheDocument()
    // Money moved to "My earnings"; My customers shows counts and points only.
    expect(
      screen.queryByText(/Amount incomplete|Model usage amount/u)
    ).not.toBeInTheDocument()
  })

  it('reads the current model prices only once their tab is opened', async () => {
    apiMocks.getCanvasAgentModelPrices.mockResolvedValue(
      pricePage([modelPrice()])
    )
    renderWithClient(<AgentCenter />)
    expect(await screen.findByText('Summary')).toBeVisible()
    expect(apiMocks.getCanvasAgentModelPrices).not.toHaveBeenCalled()

    const panel = await openModelPrices()
    expect(await within(panel).findByText('Image Model')).toBeVisible()
    expect(apiMocks.getCanvasAgentModelPrices).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
      expect.anything()
    )
    // Like the model center: no collapse control and no repeated title over the tab.
    expect(
      within(panel).queryByRole('button', { name: /Collapse|Expand/u })
    ).not.toBeInTheDocument()
    expect(
      within(panel).queryByText(
        'Prices for the price groups of your current customers.'
      )
    ).not.toBeInTheDocument()
  })

  it('writes each price like the model center, with the model price after the points', async () => {
    apiMocks.getCanvasAgentModelPrices.mockResolvedValue(
      pricePage([
        modelPrice({
          priceGroups: [
            {
              priceGroupId: 'group-v1',
              priceGroupName: 'Standard',
              prices: [
                {
                  combinationKey: 'quality=720P',
                  parameters: { quality: '720P' },
                  billingUnit: 'REQUEST',
                  customerPoints: '30',
                  customerTokenRates: null,
                  modelPriceCny: '0.4',
                },
              ],
            },
          ],
        }),
        modelPrice({
          customerModelId: 'text-v1',
          effectiveDisplayName: 'Text Model',
          description: 'Client description',
          capability: 'text.generate',
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
                  customerTokenRates: { input: '2', output: '4' },
                  modelPriceCny: { input: '1', output: '2' },
                },
              ],
            },
          ],
        }),
      ])
    )
    renderWithClient(<AgentCenter />)
    const panel = await openModelPrices()
    expect(await within(panel).findByText('720P')).toBeVisible()
    expect(within(panel).getByText('30')).toBeVisible()
    expect(within(panel).getAllByTitle('Model price')).toHaveLength(2)
    expect(within(panel).getByText(/· ¥0\.4/u)).toBeVisible()
    expect(within(panel).getByText('Input 2 · Output 4')).toBeVisible()
    expect(within(panel).getByText('Input ¥1 · Output ¥2')).toBeVisible()
    // The description shows on the card, as in the model center.
    expect(within(panel).getByText('Client description')).toBeVisible()
  })

  it('shows every price plan on the card under its own name', async () => {
    const prices = (points: string) => [
      {
        combinationKey: 'default',
        parameters: {},
        billingUnit: 'REQUEST',
        customerPoints: points,
        customerTokenRates: null,
        modelPriceCny: '0.25',
      },
    ]
    apiMocks.getCanvasAgentModelPrices.mockResolvedValue(
      pricePage([
        modelPrice({
          priceGroups: [
            {
              priceGroupId: 'g1',
              priceGroupName: 'Standard',
              prices: prices('5'),
            },
            {
              priceGroupId: 'g2',
              priceGroupName: 'Partner plan',
              prices: prices('4'),
            },
          ],
        }),
      ])
    )
    renderWithClient(<AgentCenter />)
    const panel = await openModelPrices()
    expect(await within(panel).findByText('Standard')).toBeVisible()
    expect(within(panel).getByText('Partner plan')).toBeVisible()
    expect(
      within(panel).queryByRole('button', { name: 'View all prices' })
    ).not.toBeInTheDocument()
  })

  it('opens on the default type and category resolved by Cloud, then filters by category, type and name', async () => {
    const user = userEvent.setup()
    apiMocks.getCanvasAgentModelPrices.mockResolvedValue({
      ...pricePage([modelPrice()]),
      filters: {
        capabilities: ['video.generate', 'image.generate'],
        tags: [{ id: 'tag-v1', name: 'Portrait', count: 3 }],
        totalCount: 13,
        untaggedCount: 9,
        selectedCapability: 'image.generate',
        selectedTagId: 'tag-v1',
      },
    })
    renderWithClient(<AgentCenter />)
    const panel = await openModelPrices()
    await within(panel).findByText('Image Model')

    expect(apiMocks.getCanvasAgentModelPrices).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, tagId: 'DEFAULT' }),
      expect.anything()
    )
    expect(apiMocks.getCanvasAgentModelPrices.mock.calls[0]![0]).not.toHaveProperty('capability')
    expect(within(panel).queryByRole('button', { name: 'All types' })).toBeNull()
    expect(within(panel).getByRole('button', { name: 'Image generation' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).getByRole('button', { name: 'Portrait 3' })).toHaveAttribute('aria-pressed', 'true')
    // A category choice keeps the type Cloud resolved for the first page instead of mixing types.
    await user.click(within(panel).getByRole('button', { name: 'All categories 13' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasAgentModelPrices).toHaveBeenLastCalledWith(
        expect.objectContaining({ capability: 'image.generate' }),
        expect.anything()
      )
    )
    expect(apiMocks.getCanvasAgentModelPrices.mock.lastCall![0]).not.toHaveProperty('tagId')
    await user.click(within(panel).getByRole('button', { name: 'No category 9' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasAgentModelPrices).toHaveBeenLastCalledWith(
        expect.objectContaining({ capability: 'image.generate', tagId: 'UNTAGGED' }),
        expect.anything()
      )
    )
    // Choosing a type opens it on its own default category again.
    await user.click(within(panel).getByRole('button', { name: 'Video generation' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasAgentModelPrices).toHaveBeenLastCalledWith(
        expect.objectContaining({ capability: 'video.generate', tagId: 'DEFAULT' }),
        expect.anything()
      )
    )
    await user.type(within(panel).getByRole('textbox', { name: 'Search model name' }), 'img')
    await waitFor(() =>
      expect(apiMocks.getCanvasAgentModelPrices).toHaveBeenLastCalledWith(
        expect.objectContaining({ capability: 'video.generate', search: 'img' }),
        expect.anything()
      )
    )
  })

  it('pages the current model prices through the shared pagination footer', async () => {
    apiMocks.getCanvasAgentModelPrices.mockImplementation(
      async (query: { page: number }) => ({
        ...pricePage([
          modelPrice({
            customerModelId: `image-p${query.page}`,
            effectiveDisplayName: `Image Model page ${query.page}`,
          }),
        ]),
        page: query.page,
        total: 45,
      })
    )
    renderWithClient(<AgentCenter />)
    const panel = await openModelPrices()
    expect(await within(panel).findByText('Image Model page 1')).toBeVisible()
    expect(within(panel).getByText('Page 1 of 3')).toBeVisible()

    fireEvent.click(
      within(panel).getByRole('button', { name: 'Go to next page' })
    )
    expect(await within(panel).findByText('Image Model page 2')).toBeVisible()
    expect(apiMocks.getCanvasAgentModelPrices).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, pageSize: 20 }),
      expect.anything()
    )
  })

  it('tells an agent with no priced models from an empty filter result', async () => {
    renderWithClient(<AgentCenter />)
    await openModelPrices()
    expect(await screen.findByText('No current model prices')).toBeVisible()
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
    await openTab('My invite codes')
    expect(await screen.findByText('CANVAS-U••••••••CRET')).toBeVisible()
    fireEvent.click(
      (await screen.findAllByRole('button', { name: 'Filters' }))[0]
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
    await openTab('My invite codes')
    await user.click(
      (await screen.findAllByRole('button', { name: 'Filters' }))[0]
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

  it('expands task-time model usage with units and the task-time model price', async () => {
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
        },
      ],
    })
    renderWithClient(<AgentCenter />)
    fireEvent.click(await screen.findByRole('button', { name: 'Model usage' }))
    expect((await screen.findAllByText('Previous plan')).length).toBe(2)
    expect(screen.getByText('¥0.25 / times')).toBeVisible()
    expect(screen.getByText('2 times')).toBeVisible()
    expect(screen.getByText('Input — · Output 0 Tokens')).toBeVisible()
    expect(screen.getByText('Image Model / Quality: 4K')).toBeVisible()
    expect(screen.getByText('Text Model / Default scope')).toBeVisible()
    expect(
      screen.getByText('Multiple prices (repriced during the period)')
    ).toBeVisible()
    expect(screen.queryByText('Billing unit')).not.toBeInTheDocument()
    expect(screen.queryByText(/Amount incomplete/u)).not.toBeInTheDocument()
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
    await openTab('My invite codes')

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
})
