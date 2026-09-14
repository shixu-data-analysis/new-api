/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { useState } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { customerRedeemOrderSearch } from '../../customer-points-navigation'
import { CustomerPointHistory } from '../CustomerPointHistory'
import {
  CustomerPointsCenter,
  type CustomerPointsView,
} from '../CustomerPointsCenter'

const apiMocks = vi.hoisted(() => ({
  getCanvasCustomerPointSummary: vi.fn(),
  getCanvasCustomerRechargeRedemptions: vi.fn(),
  getCanvasCustomerPointLots: vi.fn(),
  getCanvasCustomerPointLedger: vi.fn(),
  getCanvasRechargePurchaseLink: vi.fn(),
  redeemCanvasRechargeCode: vi.fn(),
}))

vi.mock('../../api', () => apiMocks)

function fixtureSummary() {
  return {
    availablePoints: '479',
    paidAvailablePoints: '400',
    bonusAvailablePoints: '79',
    debtPoints: '0',
  }
}

function renderCenter(initialView: CustomerPointsView = 'redeem') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  function ControlledCenter() {
    const [view, setView] = useState(initialView)
    return <CustomerPointsCenter view={view} onViewChange={setView} />
  }
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ControlledCenter />
      </QueryClientProvider>
    ),
  }
}

describe('Canvas customer point center', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasCustomerPointSummary.mockResolvedValue(fixtureSummary())
    apiMocks.getCanvasCustomerRechargeRedemptions.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 21,
      items: [
        {
          redeemedAt: '2026-09-14T09:20:00.000Z',
          orderNumber: 'RC-20260914-001',
          currency: 'CNY',
          listedAmountMinor: '5000',
          issuedPaidPoints: '500',
          issuedBonusPoints: '50',
          status: 'REDEEMED',
        },
      ],
    })
    apiMocks.getCanvasCustomerPointLots.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasCustomerPointLedger.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasRechargePurchaseLink.mockResolvedValue(null)
    apiMocks.redeemCanvasRechargeCode.mockResolvedValue({
      orderNumber: 'RC-NEW-002',
      purchasedPoints: '500',
      bonusPoints: '50',
    })
  })

  it('restores the deep-linked tab and requests no unopened list', async () => {
    renderCenter('ledger')
    expect(
      await screen.findByRole('tab', { name: 'Point changes' })
    ).toHaveAttribute('aria-selected', 'true')
    await waitFor(() =>
      expect(apiMocks.getCanvasCustomerPointLedger).toHaveBeenCalledTimes(1)
    )
    expect(apiMocks.getCanvasCustomerPointLots).not.toHaveBeenCalled()
    expect(apiMocks.getCanvasCustomerRechargeRedemptions).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('tab', { name: 'Point lots' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasCustomerPointLots).toHaveBeenCalledTimes(1)
    )
    expect(apiMocks.getCanvasCustomerRechargeRedemptions).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: 'Redeem points' }))
    await waitFor(() =>
      expect(
        apiMocks.getCanvasCustomerRechargeRedemptions
      ).toHaveBeenCalledTimes(1)
    )
  })

  it('keeps a loaded redemption table visible when the summary fails', async () => {
    apiMocks.getCanvasCustomerPointSummary.mockRejectedValueOnce(
      new Error('summary unavailable')
    )
    renderCenter()
    expect(await screen.findByText('RC-20260914-001')).toBeVisible()
    expect(screen.getByText('Unable to load point summary')).toBeVisible()
  })

  it('keeps the loaded summary visible when the active list fails', async () => {
    apiMocks.getCanvasCustomerRechargeRedemptions.mockRejectedValueOnce(
      new Error('redemptions unavailable')
    )
    renderCenter()
    expect(await screen.findByText('479')).toBeVisible()
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeVisible()
  })

  it('refreshes only the summary and active list', async () => {
    renderCenter('lots')
    await waitFor(() =>
      expect(apiMocks.getCanvasCustomerPointLots).toHaveBeenCalledTimes(1)
    )
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(apiMocks.getCanvasCustomerPointSummary).toHaveBeenCalledTimes(2)
    )
    expect(apiMocks.getCanvasCustomerPointLots).toHaveBeenCalledTimes(2)
    expect(apiMocks.getCanvasCustomerPointLedger).not.toHaveBeenCalled()
    expect(apiMocks.getCanvasCustomerRechargeRedemptions).not.toHaveBeenCalled()
  })

  it('clears a successful redemption and invalidates unopened point lists without fetching them', async () => {
    let redeemed = false
    apiMocks.getCanvasCustomerRechargeRedemptions.mockImplementation(
      async () => ({
        page: 1,
        pageSize: 20,
        total: 21,
        items: [
          ...(redeemed
            ? [
                {
                  redeemedAt: '2026-09-14T09:21:00.000Z',
                  orderNumber: 'RC-NEW-002',
                  currency: 'CNY',
                  listedAmountMinor: '5000',
                  issuedPaidPoints: '500',
                  issuedBonusPoints: '50',
                  status: 'REDEEMED' as const,
                },
              ]
            : []),
          {
            redeemedAt: '2026-09-14T09:20:00.000Z',
            orderNumber: 'RC-OLD-001',
            currency: 'CNY',
            listedAmountMinor: '5000',
            issuedPaidPoints: '500',
            issuedBonusPoints: '50',
            status: 'REDEEMED' as const,
          },
        ],
      })
    )
    apiMocks.redeemCanvasRechargeCode.mockImplementation(async () => {
      redeemed = true
      return {
        orderNumber: 'RC-NEW-002',
        purchasedPoints: '500',
        bonusPoints: '50',
      }
    })
    const timeoutSpy = vi.spyOn(window, 'setTimeout')
    const { client, container } = renderCenter()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await screen.findByText('RC-OLD-001')
    const tableRowCount = container.querySelectorAll('tr').length
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await waitFor(() =>
      expect(
        apiMocks.getCanvasCustomerRechargeRedemptions
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal)
      )
    )
    const input = await screen.findByLabelText('Recharge code')
    fireEvent.change(input, { target: { value: 'VALID-CODE-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))
    await waitFor(() =>
      expect(apiMocks.redeemCanvasRechargeCode).toHaveBeenCalledWith(
        'VALID-CODE-123',
        expect.anything()
      )
    )
    await waitFor(() => expect(input).toHaveValue(''))
    expect(apiMocks.getCanvasCustomerPointLots).not.toHaveBeenCalled()
    expect(apiMocks.getCanvasCustomerPointLedger).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['canvas-cloud', 'customer', 'point-lots'],
      refetchType: 'none',
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['canvas-cloud', 'customer', 'point-ledger'],
      refetchType: 'none',
    })
    await waitFor(() =>
      expect(
        apiMocks.getCanvasCustomerRechargeRedemptions
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 }),
        expect.any(AbortSignal)
      )
    )
    expect(screen.getByText('RC-NEW-002').closest('tr')).toHaveClass(
      'bg-primary/10'
    )
    expect(screen.getByText('RC-OLD-001').closest('tr')).not.toHaveClass(
      'bg-primary/10'
    )
    expect(container.querySelectorAll('tr')).toHaveLength(tableRowCount + 1)
    const timer = timeoutSpy.mock.calls.find((call) => call[1] === 3_000)?.[0]
    expect(timer).toBeTypeOf('function')
    act(() => (timer as TimerHandler)())
    expect(screen.getByText('RC-NEW-002').closest('tr')).not.toHaveClass(
      'bg-primary/10'
    )
  })

  it('does not highlight a stale filtered row when the redeemed order is absent', async () => {
    apiMocks.redeemCanvasRechargeCode.mockResolvedValue({
      orderNumber: 'RC-NOT-IN-FILTER',
      purchasedPoints: '500',
      bonusPoints: '50',
    })
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    render(
      <QueryClientProvider client={client}>
        <CustomerPointsCenter
          view='redeem'
          initialOrderNumber='RC-20260914-001'
          onViewChange={vi.fn()}
        />
      </QueryClientProvider>
    )
    const input = await screen.findByLabelText('Recharge code')
    fireEvent.change(input, { target: { value: 'VALID-CODE-123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Redeem' }))
    await waitFor(() =>
      expect(apiMocks.redeemCanvasRechargeCode).toHaveBeenCalled()
    )
    expect(screen.getByText('RC-20260914-001').closest('tr')).not.toHaveClass(
      'bg-primary/10'
    )
  })

  it('navigates a ledger order through URL and query state and restores the ledger with one back', async () => {
    apiMocks.getCanvasCustomerPointLedger.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'ledger-recharge',
          pointLotId: 'lot-recharge',
          eventType: 'ISSUE',
          eventPoints: '500',
          remainingDelta: '500',
          reservedDelta: '0',
          availableDelta: '500',
          taskId: null,
          taskOutputId: null,
          outputIndex: null,
          pointReturnId: null,
          refundLinkId: null,
          rechargeOrderId: 'order-recharge',
          rechargeOrderNumber: 'RC-LINK-001',
          reason: 'RechargeCode redemption',
          occurredAt: '2026-09-14T09:20:00.000Z',
        },
      ],
    })

    const rootRoute = createRootRoute({ component: Outlet })
    const pointsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/canvas-cloud/points',
      validateSearch: (search: Record<string, unknown>) => ({
        view:
          search.view === 'lots' || search.view === 'ledger'
            ? search.view
            : ('redeem' as CustomerPointsView),
        orderNumber:
          typeof search.orderNumber === 'string'
            ? search.orderNumber
            : undefined,
      }),
      component: function PointRouteHarness() {
        const search = pointsRoute.useSearch()
        const navigate = pointsRoute.useNavigate()
        if (search.view === 'ledger') {
          return (
            <CustomerPointHistory
              view='ledger'
              onOpenOrder={(_orderId, orderNumber) =>
                void navigate({
                  to: '/canvas-cloud/points',
                  search: (previous) =>
                    customerRedeemOrderSearch(previous, orderNumber),
                })
              }
            />
          )
        }
        return (
          <CustomerPointsCenter
            view={search.view}
            initialOrderNumber={search.orderNumber}
            onViewChange={(view) => void navigate({ search: { view } })}
            onOrderNumberChange={(orderNumber) =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  view: 'redeem',
                  orderNumber,
                }),
              })
            }
          />
        )
      },
    })
    const history = createMemoryHistory({
      initialEntries: ['/canvas-cloud/points?view=ledger'],
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([pointsRoute]),
      history,
    })
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    const orderButtons = await screen.findAllByRole('button', {
      name: 'RC-LINK-001',
    })
    const orderButton = orderButtons.at(-1)
    if (!orderButton) throw new Error('Expected a recharge order button')
    fireEvent.click(orderButton)
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        view: 'redeem',
        orderNumber: 'RC-LINK-001',
      })
    )
    await waitFor(() =>
      expect(
        apiMocks.getCanvasCustomerRechargeRedemptions
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ rechargeOrderNumber: 'RC-LINK-001' }),
        expect.any(AbortSignal)
      )
    )

    act(() => history.back())
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ view: 'ledger' })
    )
    expect(router.state.location.search).not.toHaveProperty('orderNumber')
    expect(
      await screen.findAllByRole('button', { name: 'RC-LINK-001' })
    ).not.toHaveLength(0)
  })

  it('enforces the confirmed 8 through 191 character redemption boundary', async () => {
    renderCenter()
    const input = await screen.findByLabelText('Recharge code')
    const button = screen.getByRole('button', { name: 'Redeem' })
    fireEvent.change(input, { target: { value: '1234567' } })
    expect(button).toBeDisabled()
    fireEvent.change(input, { target: { value: '12345678' } })
    expect(button).toBeEnabled()
    fireEvent.change(input, { target: { value: 'a'.repeat(191) } })
    expect(button).toBeEnabled()
    fireEvent.change(input, { target: { value: 'a'.repeat(192) } })
    expect(button).toBeDisabled()
    expect(screen.getByText('Use no more than 191 characters')).toBeVisible()
  })

  it('prevents duplicate submission and keeps input with an actionable known failure', async () => {
    let rejectRedemption: (reason: unknown) => void = () => undefined
    apiMocks.redeemCanvasRechargeCode.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRedemption = reject
      })
    )
    renderCenter()
    const input = await screen.findByLabelText('Recharge code')
    fireEvent.change(input, { target: { value: 'USED-CODE-123' } })
    const button = screen.getByRole('button', { name: 'Redeem' })
    fireEvent.click(button)
    await waitFor(() => expect(button).toBeDisabled())
    fireEvent.click(button)
    expect(apiMocks.redeemCanvasRechargeCode).toHaveBeenCalledTimes(1)
    rejectRedemption({
      response: { data: { code: 'RECHARGE_CODE_ALREADY_REDEEMED' } },
    })
    expect(
      await screen.findByText('This recharge code has already been used.')
    ).toBeVisible()
    expect(input).toHaveValue('USED-CODE-123')
  })

  it('hydrates a legacy order filter and sends it to the redemption query', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={client}>
        <CustomerPointsCenter
          view='redeem'
          initialOrderNumber='RC-LEGACY-001'
          onViewChange={vi.fn()}
        />
      </QueryClientProvider>
    )
    await waitFor(() =>
      expect(
        apiMocks.getCanvasCustomerRechargeRedemptions
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({ rechargeOrderNumber: 'RC-LEGACY-001' }),
        expect.any(AbortSignal)
      )
    )
  })
})
