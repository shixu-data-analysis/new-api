import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { PriceGroupManagement } from '../PriceGroupManagement'

const api = vi.hoisted(() => ({
  getCanvasPriceGroups: vi.fn(),
  publishConfirmedCanvasPriceGroup: vi.fn(),
}))
vi.mock('../../api', () => api)
beforeEach(async () => {
  vi.clearAllMocks()
  i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  await i18next.changeLanguage('en')
  api.getCanvasPriceGroups.mockResolvedValue([])
})
it('keeps the name error inline and requires review after removing permanent help', async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PriceGroupManagement />
    </QueryClientProvider>
  )
  const name = screen.getByRole('textbox', {
    name: new RegExp(en.translation['Price group name']),
  })
  expect(
    screen.queryByText('Any language, up to 128 characters')
  ).not.toBeInTheDocument()
  expect(name).not.toHaveAttribute('aria-describedby')
  fireEvent.change(name, { target: { value: 'x'.repeat(129) } })
  fireEvent.blur(name)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Use no more than 128 characters'
  )
  expect(name).toHaveAttribute('aria-describedby', 'price-group-name-error')
  fireEvent.change(name, { target: { value: 'Customer tier' } })
  fireEvent.click(
    screen.getByRole('button', {
      name: en.translation['Review new price group'],
    })
  )
  expect(
    await screen.findByRole('button', { name: 'Confirm change' })
  ).toBeVisible()
  expect(api.publishConfirmedCanvasPriceGroup).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(name).toHaveValue('Customer tier')
})
