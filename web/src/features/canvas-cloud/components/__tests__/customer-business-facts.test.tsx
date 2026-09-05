/* Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import viLocale from '@/i18n/locales/vi.json'
import tw from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import {
  factFieldLabels,
  factKindLabels,
  factValueLabels,
  factStatusValues,
  factStatusTerms,
} from '../../business-facts'
import { getCanvasBusinessTerm } from '../../business-terms'
import { AdminCustomerOperations } from '../AdminCustomerOperations'
import { CustomerBusinessFacts } from '../CustomerBusinessFacts'

const getFacts = vi.hoisted(() => vi.fn())
const getOrders = vi.hoisted(() => vi.fn())
vi.mock('../../api', () => ({
  getCanvasCustomerBusinessFacts: getFacts,
  getCanvasAdminRechargeOrders: getOrders,
}))
const at = '2026-09-05T12:00:00Z'
const task = {
  kind: 'task',
  id: 'task-a',
  name: 'Portrait render',
  status: 'SUCCEEDED',
  at,
}
const quote = {
  kind: 'quote',
  id: 'quote-a',
  name: 'Original quote',
  status: 'CONSUMED',
  at,
}
function mount(customerId = 'customer-a') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <CustomerBusinessFacts key={customerId} customerId={customerId} />
    </QueryClientProvider>
  )
}
beforeAll(async () => {
  await i18next.init({ lng: 'en', resources: { en, ru }, fallbackLng: 'en' })
})
beforeEach(async () => {
  vi.clearAllMocks()
  await i18next.changeLanguage('en')
  getFacts.mockImplementation(async (_customer, query, root) => ({
    ...query,
    total: 1,
    items: root?.id === 'task-a' ? [quote] : [task],
    ...(root
      ? {
          fact: {
            ...(root.id === 'task-a' ? task : quote),
            fields:
              root.id === 'task-a'
                ? {
                    quotedPoints: '9007199254740993',
                    billingStatus: 'SETTLED',
                    executionStatus: 'SUCCEEDED',
                    reconciliationStatus: 'COST_CONFIRMED',
                    paidSettledPoints: '7',
                    bonusSettledPoints: '18',
                  }
                : { quotedPoints: '25', expiresAt: at },
          },
        }
      : {}),
  }))
})
describe('customer business facts', () => {
  it('follows business names and returns through the original customer scope', async () => {
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Portrait render' })
    )
    expect(await screen.findByText('9,007,199,254,740,993')).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Customer billing' })
    ).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Provider reconciliation' })
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Original quote' }))
    await waitFor(() =>
      expect(getFacts).toHaveBeenLastCalledWith(
        'customer-a',
        expect.objectContaining({ page: 1 }),
        { kind: 'quote', id: 'quote-a' },
        expect.any(AbortSignal)
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('9,007,199,254,740,993')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'All business facts' }))
    await waitFor(() =>
      expect(screen.queryByText('9,007,199,254,740,993')).toBeNull()
    )
  })
  it('shows a scoped error and retries without retaining another fact', async () => {
    mount()
    await screen.findByRole('button', { name: 'Portrait render' })
    getFacts.mockRejectedValueOnce(new Error('404'))
    fireEvent.click(screen.getByRole('button', { name: 'Portrait render' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load business facts for this customer.'
    )
    expect(
      screen.queryByRole('heading', { name: 'Customer billing' })
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('9,007,199,254,740,993')).toBeTruthy()
  })
  it('formats nonempty Russian facts and keeps absent values distinct from zero', async () => {
    await i18next.changeLanguage('ru')
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Portrait render' })
    )
    expect(
      await screen.findByRole('heading', {
        name: ru.translation['Customer billing'],
      })
    ).toBeTruthy()
    expect(
      screen.getAllByText(ru.translation['Not recorded']).length
    ).toBeGreaterThan(0)
    expect(
      screen.getByText(new Intl.NumberFormat('ru').format(9007199254740993n), {
        normalizer: (text) => text,
      })
    ).toBeTruthy()
  })
  it('sends type and status filters together through the paged query', async () => {
    mount()
    await screen.findByRole('button', { name: 'Portrait render' })
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'cost' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'CONFIRMED' },
    })
    await waitFor(() =>
      expect(getFacts).toHaveBeenLastCalledWith(
        'customer-a',
        expect.objectContaining({ kind: 'cost', status: 'CONFIRMED', page: 1 }),
        undefined,
        expect.any(AbortSignal)
      )
    )
    getFacts.mockClear()
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'task' },
    })
    await waitFor(() => expect(getFacts).toHaveBeenCalled())
    for (const [, query] of getFacts.mock.calls) {
      expect(query.kind).toBe('task')
      expect(query).not.toHaveProperty('status')
    }
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('')
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'lot' },
    })
    expect(
      screen.getByRole('option', { name: 'Grace bonus points' })
    ).toHaveValue('GRACE_BONUS')
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'GRACE_BONUS' },
    })
    await waitFor(() =>
      expect(getFacts).toHaveBeenLastCalledWith(
        'customer-a',
        expect.objectContaining({
          kind: 'lot',
          status: 'GRACE_BONUS',
          page: 1,
        }),
        undefined,
        expect.any(AbortSignal)
      )
    )
  })
  it('opens an existing order and clears its target when the selected customer changes', async () => {
    getOrders.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          id: 'order-a',
          orderNumber: 'RECHARGE-001',
          status: 'CODE_ACTIVATED',
          expectedPaidPoints: '100',
          issuedPaidPoints: '100',
          availablePaidPoints: '80',
          createdAt: at,
          redeemedAt: at,
        },
      ],
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const view = (customerId: string) => (
      <QueryClientProvider client={client}>
        <AdminCustomerOperations customerId={customerId} />
      </QueryClientProvider>
    )
    const rendered = render(view('customer-a'))
    fireEvent.click(await screen.findByRole('button', { name: 'RECHARGE-001' }))
    await waitFor(() =>
      expect(getFacts).toHaveBeenLastCalledWith(
        'customer-a',
        expect.any(Object),
        { kind: 'order', id: 'order-a' },
        expect.any(AbortSignal)
      )
    )
    rendered.rerender(view('customer-b'))
    await waitFor(() =>
      expect(getFacts).toHaveBeenLastCalledWith(
        'customer-b',
        expect.any(Object),
        undefined,
        expect.any(AbortSignal)
      )
    )
    expect(
      getFacts.mock.calls.some(
        ([customer, , root]) => customer === 'customer-b' && root
      )
    ).toBe(false)
  })
  it('renders upstream cost decimals in Russian without converting currency or losing the negative sign', async () => {
    await i18next.changeLanguage('ru')
    const cost = {
      kind: 'cost',
      id: 'cost-a',
      name: 'Invoice adjustment',
      status: 'CONFIRMED',
      at,
    }
    getFacts.mockImplementation(async (_customer, query, root) => ({
      ...query,
      total: root ? 0 : 1,
      items: root ? [] : [cost],
      ...(root
        ? {
            fact: {
              ...cost,
              fields: {
                signedAmount: '-0.12345678',
                currency: 'USD',
                exchangeRate: '7.10000000',
                normalizedAmountMinor: '-87.65431380',
              },
            },
          }
        : {}),
    }))
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Invoice adjustment' })
    )
    expect(await screen.findByText('-0,12345678')).toBeVisible()
    expect(screen.getByText('USD')).toBeVisible()
    expect(screen.getByText('7,1')).toBeVisible()
    expect(screen.getByText('-87,6543138')).toBeVisible()
  })

  it.each([
    ['refund', ['pointsRequested', 'pointsClawedBack', 'pointsOutstanding']],
    ['recovery', ['pointsDue', 'pointsRecovered', 'pointsOutstanding']],
  ])('formats exact %s point amounts in Russian', async (kind, keys) => {
    await i18next.changeLanguage('ru')
    const record = {
      kind,
      id: 'record-a',
      name: 'Recovery reference',
      status: kind === 'refund' ? 'PARTIAL_RECOVERY' : 'PARTIALLY_RECOVERED',
      at,
    }
    const amounts = ['9007199254740993', '9007199254740973', '20']
    getFacts.mockImplementation(async (_customer, query, root) => ({
      ...query,
      total: root ? 0 : 1,
      items: root ? [] : [record],
      ...(root
        ? {
            fact: {
              ...record,
              fields: Object.fromEntries(
                (keys as string[]).map((key, index) => [key, amounts[index]])
              ),
            },
          }
        : {}),
    }))
    mount()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Recovery reference' })
    )
    for (const amount of amounts) {
      const expected = new Intl.NumberFormat('ru').format(BigInt(amount))
      expect(
        await screen.findByText(
          (content) =>
            content.replaceAll(/\s/gu, ' ') ===
            expected.replaceAll(/\s/gu, ' '),
          { selector: 'dd' }
        )
      ).toBeVisible()
    }
  })

  it('defines every detail label and supported state in all seven languages', () => {
    const keys = [
      ...Object.values(factFieldLabels),
      ...Object.values(factKindLabels),
      ...Object.values(factValueLabels),
    ]
    for (const locale of [en, zh, tw, fr, ru, ja, viLocale]) {
      const dictionary = locale.translation as Record<string, string>
      for (const key of keys) expect(dictionary[key], key).toBeTruthy()
    }
    for (const [kind, statuses] of Object.entries(factStatusValues)) {
      const term = factStatusTerms[kind as keyof typeof factStatusTerms]
      for (const status of statuses) {
        expect(
          term ? getCanvasBusinessTerm(term, status) : factValueLabels[status],
          `${kind}:${status}`
        ).toBeTruthy()
      }
    }
  })
})
