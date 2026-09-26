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
import { beforeAll, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import viLocale from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import { RechargeCodeCard } from '../RechargeCodeCard'

const purchaseCopyKeys = [
  'Need a recharge code?',
  'Purchase a one-time code from the configured store, then return here to redeem it.',
  'Purchase recharge code',
] as const
const purchaseCopyLocales = { en, zh, 'zh-TW': zhTW, fr, ru, ja, vi: viLocale }

describe('Canvas recharge purchase entry', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', {
      'Redeem recharge code': 'Redeem recharge code',
      'Points are issued only after a valid code is redeemed.':
        'Points are issued only after a valid code is redeemed.',
      'Need a recharge code?': 'Need a recharge code?',
      'Purchase a one-time code from the configured store, then return here to redeem it.':
        'Purchase a one-time code from the configured store, then return here to redeem it.',
      'Purchase recharge code': 'Purchase recharge code',
      'Recharge code': 'Recharge code',
      Redeem: 'Redeem',
    })
  })

  it('opens an external configured store safely while preserving redemption', () => {
    const onCodeChange = vi.fn()
    const onRedeem = vi.fn()
    render(
      <RechargeCodeCard
        code='CANVAS-CODE-001'
        onCodeChange={onCodeChange}
        onRedeem={onRedeem}
        purchaseUrl='https://shop.example.com/canvas-codes'
        redeeming={false}
      />
    )

    const purchase = screen.getByRole('link', {
      name: 'Purchase recharge code',
    })
    expect(purchase).toHaveAttribute(
      'href',
      'https://shop.example.com/canvas-codes'
    )
    expect(purchase).toHaveAttribute('target', '_blank')
    expect(purchase).toHaveAttribute('rel', 'noopener noreferrer')
    expect(purchase).toHaveClass(
      'w-full',
      'sm:w-auto',
      'border-transparent',
      'bg-[#f3c969]',
      'text-[#27220f]',
      'hover:bg-[#f7d681]'
    )
    expect(purchase.parentElement).toHaveClass(
      'bg-muted/50',
      'flex-col',
      'sm:flex-row',
      'sm:items-center',
      'sm:justify-between'
    )
    expect(screen.getByLabelText('Recharge code')).toHaveValue(
      'CANVAS-CODE-001'
    )

    const redeem = screen.getByRole('button', { name: 'Redeem' })
    expect(redeem).not.toHaveClass('bg-[#f3c969]')
    fireEvent.click(redeem)
    expect(onRedeem).toHaveBeenCalledOnce()
  })

  it('uses the current tab for an internal store and hides an absent link', () => {
    const rendered = render(
      <RechargeCodeCard
        code=''
        onCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        purchaseUrl='/store/canvas'
        redeeming={false}
      />
    )

    const purchase = screen.getByRole('link', {
      name: 'Purchase recharge code',
    })
    expect(purchase).toHaveAttribute('href', '/store/canvas')
    expect(purchase).not.toHaveAttribute('target')

    rendered.rerender(
      <RechargeCodeCard
        code=''
        onCodeChange={vi.fn()}
        onRedeem={vi.fn()}
        purchaseUrl={null}
        redeeming={false}
      />
    )
    expect(
      screen.queryByRole('link', { name: 'Purchase recharge code' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redeem' })).toBeDisabled()
  })

  it.each(Object.entries(purchaseCopyLocales))(
    'keeps the purchase copy complete in %s',
    (locale, resource) => {
      const translations = resource.translation as Record<string, string>
      for (const key of purchaseCopyKeys) {
        expect(translations[key], `${locale}: ${key}`).toBeTypeOf('string')
        expect(translations[key], `${locale}: ${key}`).not.toBe('')
      }
    }
  )
})
