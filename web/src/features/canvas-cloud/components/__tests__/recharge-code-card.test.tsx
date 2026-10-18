/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import viLocale from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { formatCanvasDateTimeMinutes } from '../../formatters'
import type { CanvasRechargeCodeRedemptionResult } from '../../types'
import { RechargeCodeCard } from '../RechargeCodeCard'

const expiryCopyKeys = [
  '<b>{{points}} points will expire within 30 days</b>. Please use them soon.',
  'View point lots',
  'No recharge code? Purchase one',
  '(expires {{date}})',
  '<ok>Redeemed successfully</ok>: <b>{{paid}}</b> paid points <b>{{paidExpiry}}</b> have been credited.',
  '<ok>Redeemed successfully</ok>: <b>{{paid}}</b> paid points <b>{{paidExpiry}}</b> and <b>{{bonus}}</b> bonus points <b>{{bonusExpiry}}</b> have been credited.',
  'Paid points are <b>valid for {{days}} days</b> after redemption; any unused part expires automatically. Each recharge code can be used only once.',
  'Each recharge code can be used only once. Check it before redeeming.',
] as const
const locales = { en, zh, 'zh-TW': zhTW, fr, ru, ja, vi: viLocale }

const summary = {
  availablePoints: '3000',
  paidAvailablePoints: '2500',
  bonusAvailablePoints: '500',
  debtPoints: '0',
  paidExpiryDays: 90,
  expiringSoonPoints: '1200',
}

function redemption(bonusPoints: string): CanvasRechargeCodeRedemptionResult {
  return {
    rechargeCodeId: 'code-1',
    orderNumber: 'RC-1',
    redeemedAt: '2026-10-18T02:12:00.000Z',
    purchasedPoints: '2500',
    bonusPoints,
    issuedLots: [
      { id: 'lot-1', type: 'PAID', expiresAt: '2027-01-16T02:12:00.000Z' },
      ...(bonusPoints === '0'
        ? []
        : [
            {
              id: 'lot-2',
              type: 'BONUS' as const,
              expiresAt: '2026-11-17T02:12:00.000Z',
            },
          ]),
    ],
  }
}

function renderCard(
  props: Partial<Parameters<typeof RechargeCodeCard>[0]> = {}
) {
  return render(
    <RechargeCodeCard
      code=''
      onCodeChange={vi.fn()}
      onRedeem={vi.fn()}
      purchaseUrl={null}
      redeeming={false}
      onViewLots={vi.fn()}
      {...props}
    />
  )
}

describe('Canvas recharge point expiry notice', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
  })

  afterEach(async () => {
    await i18next.changeLanguage('en')
  })

  it('shows the expiring points and opens the point lots', () => {
    const onViewLots = vi.fn()
    renderCard({ summary, onViewLots })

    expect(screen.getByRole('status')).toHaveTextContent(
      '1,200 points will expire within 30 days. Please use them soon.'
    )
    fireEvent.click(screen.getByRole('button', { name: 'View point lots' }))
    expect(onViewLots).toHaveBeenCalledOnce()
    expect(
      screen.getByText(/after redemption; any unused part expires/)
    ).toHaveTextContent('Paid points are valid for 90 days after redemption')
  })

  it('hides the notice without expiring points and keeps the one-time rule without a summary', () => {
    const rendered = renderCard({
      summary: { ...summary, expiringSoonPoints: '0' },
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    rendered.rerender(
      <RechargeCodeCard
        code=''
        onCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        purchaseUrl={null}
        redeeming={false}
        onViewLots={vi.fn()}
      />
    )
    expect(
      screen.getByText(
        'Each recharge code can be used only once. Check it before redeeming.'
      )
    ).toBeInTheDocument()
  })

  it('replaces the rule with the redemption result in both point types', async () => {
    await i18next.changeLanguage('zh')
    const paidExpiry = formatCanvasDateTimeMinutes('2027-01-16T02:12:00.000Z')
    const bonusExpiry = formatCanvasDateTimeMinutes('2026-11-17T02:12:00.000Z')
    const rendered = renderCard({ summary, redemption: redemption('500') })

    expect(screen.queryByText(/天内有效/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')[1]).toHaveTextContent(
      `兑换成功，已到账 2,500 充值积分（${paidExpiry} 到期）和 500 赠送积分（${bonusExpiry} 到期）。`
    )

    rendered.rerender(
      <RechargeCodeCard
        code=''
        onCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        purchaseUrl={null}
        redeeming={false}
        onViewLots={vi.fn()}
        summary={summary}
        redemption={redemption('0')}
      />
    )
    expect(screen.getAllByRole('status')[1]).toHaveTextContent(
      `兑换成功，已到账 2,500 充值积分（${paidExpiry} 到期）。`
    )
  })

  it.each(Object.entries(locales))(
    'keeps the expiry copy complete in %s',
    (locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of expiryCopyKeys) {
        const value = translations[key]
        expect(value, `${locale}: ${key}`).toBeTypeOf('string')
        expect(value, `${locale}: ${key}`).not.toBe('')
        for (const token of key.match(/{{\w+}}|<\/?\w+>/g) ?? []) {
          expect(value, `${locale}: ${key}`).toContain(token)
        }
      }
    }
  )
})
