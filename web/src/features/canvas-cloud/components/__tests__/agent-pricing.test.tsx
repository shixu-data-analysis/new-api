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
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { AgentCenter } from '../AgentCenter'
import { AgentManagement } from '../AgentManagement'
import { ProviderPricingMatrix } from '../ProviderPricingMatrix'

const apiMocks = vi.hoisted(() => ({
  getCanvasAgentWorkspace: vi.fn(),
  getCanvasAgentInviteCodes: vi.fn(),
  getCanvasAgentCustomers: vi.fn(),
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

describe('Canvas Agent and provider pricing governance', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
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
        displayName: 'Tokyo Agent',
        internalName: 'Tokyo Agent',
        status: 'ACTIVE',
      },
    })
    apiMocks.getCanvasAgentInviteCodes.mockResolvedValue({
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
          newApiUserId: '86',
          username: 'invited-user',
          emailMasked: 'i***@example.com',
          status: 'ACTIVE',
          activatedAt: '2026-08-30T00:00:00.000Z',
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
        modelName: 'Image Model',
        combinationId: 'combination-v1',
        combinationKey: 'quality=4K',
        parameters: { quality: '4K' },
        billingDimensions: { billingUnit: 'REQUEST', dimensions: ['quality'] },
        resolvedProviderModelId: 'image-4k',
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
    renderWithClient(<AgentManagement />)
    fireEvent.change(await screen.findByLabelText('New API user ID'), {
      target: { value: '42' },
    })
    fireEvent.change(screen.getByLabelText('Inviter name'), {
      target: { value: 'Tokyo Agent' },
    })
    fireEvent.change(screen.getByLabelText('Approval reason'), {
      target: { value: 'Approved partner onboarding' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable invitation ability' })
    )
    expect(await screen.findByText(/keeps all customer pages/)).toBeVisible()
    expect(apiMocks.provisionCanvasAgent).not.toHaveBeenCalled()
  })

  it('shows field-level validation instead of silently disabling creation', async () => {
    renderWithClient(<AgentManagement />)

    const createButton = await screen.findByRole('button', {
      name: 'Enable invitation ability',
    })
    expect(createButton).toBeEnabled()
    fireEvent.click(createButton)

    expect(await screen.findByText('Enter a New API user ID')).toBeVisible()
    expect(screen.getByText('Enter an inviter name')).toBeVisible()
    expect(screen.getByText('Enter an approval reason')).toBeVisible()
    expect(screen.getByLabelText('New API user ID')).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    expect(apiMocks.provisionCanvasAgent).not.toHaveBeenCalled()
  })

  it('explains the server reason when inviter creation fails', async () => {
    apiMocks.provisionCanvasAgent.mockRejectedValueOnce({
      response: { data: { code: 'INVITER_CAPABILITY_ALREADY_GRANTED' } },
    })
    renderWithClient(<AgentManagement />)
    fireEvent.change(await screen.findByLabelText('New API user ID'), {
      target: { value: '42' },
    })
    fireEvent.change(screen.getByLabelText('Inviter name'), {
      target: { value: 'Tokyo Agent' },
    })
    fireEvent.change(screen.getByLabelText('Approval reason'), {
      target: { value: 'Approved partner onboarding' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable invitation ability' })
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm creation' })
    )

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Invitation ability could not be enabled',
        {
          description: 'This customer already has invitation ability.',
        }
      )
    )
  })

  it('adds invitation ability to a customer without a provider association', async () => {
    renderWithClient(<AgentManagement />)

    fireEvent.change(await screen.findByLabelText('New API user ID'), {
      target: { value: '43' },
    })
    fireEvent.change(screen.getByLabelText('Inviter name'), {
      target: { value: 'Tokyo Inviter' },
    })
    fireEvent.change(screen.getByLabelText('Approval reason'), {
      target: { value: 'Approved customer referral program' },
    })
    const createButton = screen.getByRole('button', {
      name: 'Enable invitation ability',
    })
    expect(createButton).toBeEnabled()
    fireEvent.click(createButton)
    expect(
      await screen.findByText('Enable invitation ability for this customer?')
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm creation' }))
    await waitFor(() =>
      expect(apiMocks.provisionCanvasAgent).toHaveBeenCalledWith({
        newApiUserId: '43',
        internalName: 'Tokyo Inviter',
        status: 'ACTIVE',
        reason: 'Approved customer referral program',
      })
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
  })

  it('reveals and hides an owned invite code without decrypting twice', async () => {
    apiMocks.getCanvasAgentInviteCodes.mockResolvedValueOnce({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'invite-v1',
          maskedCode: 'CANVAS-U••••••••CRET',
          status: 'ACTIVE',
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
    fireEvent.change(await screen.findByLabelText('Model and quality'), {
      target: { value: 'combination-v1' },
    })
    expect(screen.getByText('Below break-even')).toBeVisible()
    expect(screen.getByText(/Safe floor >24/)).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Record risk decision' })
    ).toBeDisabled()
    expect(apiMocks.resolveCanvasProviderRateRisk).not.toHaveBeenCalled()
  })
})
