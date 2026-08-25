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
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import zh from '@/i18n/locales/zh.json'

import { BusinessTerm } from '../BusinessTerm'

describe('Canvas business term', () => {
  beforeAll(() => {
    i18next.addResourceBundle('zh', 'translation', zh.translation, true, true)
  })

  afterEach(async () => {
    await i18next.changeLanguage('en')
  })

  it('localizes a configured value and exposes its explanation to keyboard users', async () => {
    await i18next.changeLanguage('zh')
    render(<BusinessTerm kind='pointLotType' value='BONUS' />)

    const term = screen.getByRole('button', {
      name: '赠送积分. 赠送积分表示这批积分的取得方式及适用的到期规则。',
    })
    expect(term).toHaveTextContent('赠送积分')
    expect(term).toHaveClass('cursor-help')
    term.focus()
    expect(term).toHaveFocus()
  })

  it('keeps an unknown server value visible instead of inventing a translation', () => {
    render(<BusinessTerm kind='ledgerEvent' value='FUTURE_EVENT' />)
    expect(screen.getByText('FUTURE_EVENT')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('centralizes pricing labels and read-only field explanations', async () => {
    await i18next.changeLanguage('zh')
    render(<BusinessTerm kind='pricingField' value='BREAK_EVEN' />)

    expect(
      screen.getByRole('button', {
        name: '保本线. K_pricing 乘以每元 50 积分后的只读向上取整值；发布价必须严格高于它。',
      })
    ).toBeVisible()
  })
})
