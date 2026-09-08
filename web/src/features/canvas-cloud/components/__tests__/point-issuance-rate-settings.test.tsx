import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'

import { PointIssuanceRateSettings } from '../PointIssuanceRateSettings'

const apiMocks = vi.hoisted(() => ({
  getCanvasPointIssuanceRates: vi.fn(),
  publishConfirmedCanvasPointIssuanceRate: vi.fn(),
}))
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: toastMocks }))

function renderSettings() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <PointIssuanceRateSettings />
    </QueryClientProvider>
  )
}

describe('PointIssuanceRateSettings', () => {
  beforeAll(() => {
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    i18next.addResourceBundle('fr', 'translation', fr.translation, true, true)
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasPointIssuanceRates.mockResolvedValue([
      {
        id: 'rate-v1',
        version: 1,
        status: 'PUBLISHED',
        pointsPerRmb: '50.00000000',
        decisionSummary: 'FROZEN v1.0 baseline',
        evidenceRefs: [],
        createdByPrincipalId: 'platform-admin',
        approvedByPrincipalId: 'platform-admin',
        createdAt: '2026-08-26T00:00:00.000Z',
        approvedAt: '2026-08-26T00:01:00.000Z',
        effectiveAt: '2026-08-26T00:02:00.000Z',
      },
    ])
    apiMocks.publishConfirmedCanvasPointIssuanceRate.mockResolvedValue({
      status: 'PUBLISHED',
    })
  })

  it('prefills the current rate and publishes only after confirmation', async () => {
    renderSettings()
    const form = screen.getByRole('form', {
      name: 'Adjust point issuance rate',
    })
    const rate = within(form).getByRole('textbox', {
      name: /Point issuance rate/,
    })
    await waitFor(() => expect(rate).toHaveValue('50'))
    fireEvent.change(rate, { target: { value: '60' } })
    fireEvent.change(
      within(form).getByRole('textbox', { name: /Decision summary/ }),
      { target: { value: 'Optional administrator context' } }
    )
    fireEvent.submit(form)

    expect(
      apiMocks.publishConfirmedCanvasPointIssuanceRate
    ).not.toHaveBeenCalled()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm change' })
    )
    await waitFor(() =>
      expect(
        apiMocks.publishConfirmedCanvasPointIssuanceRate
      ).toHaveBeenCalledWith({
        pointsPerRmb: '60',
        decisionSummary: 'Optional administrator context',
      })
    )
  })

  it('shows the field error after an invalid review attempt', async () => {
    renderSettings()
    const form = screen.getByRole('form', {
      name: 'Adjust point issuance rate',
    })
    const rate = within(form).getByRole('textbox', {
      name: /Point issuance rate/,
    })
    await waitFor(() => expect(rate).toHaveValue('50'))
    fireEvent.change(rate, { target: { value: '60.123' } })
    fireEvent.submit(form)

    await waitFor(() => expect(rate).toHaveAttribute('aria-invalid', 'true'))
    expect(
      screen.getByText('Enter a positive value with up to 2 decimals')
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Confirm change' })
    ).not.toBeInTheDocument()
  })

  it('keeps optional summary length validation after removing permanent help', async () => {
    renderSettings()
    const summary = screen.getByRole('textbox', {
      name: 'Decision summary (optional)',
    })
    expect(
      screen.queryByText('Optional, up to 2000 characters')
    ).not.toBeInTheDocument()
    fireEvent.change(summary, { target: { value: 'x'.repeat(2001) } })
    fireEvent.blur(summary)
    expect(
      await screen.findByText('Use no more than 2000 characters')
    ).toBeVisible()
    expect(summary).toHaveAttribute('aria-invalid', 'true')
    expect(
      apiMocks.publishConfirmedCanvasPointIssuanceRate
    ).not.toHaveBeenCalled()
  })

  it('shows the required error when the administrator leaves the rate field', async () => {
    renderSettings()
    const form = screen.getByRole('form', {
      name: 'Adjust point issuance rate',
    })
    const rate = within(form).getByRole('textbox', {
      name: /Point issuance rate/,
    })
    await waitFor(() => expect(rate).toHaveValue('50'))
    fireEvent.change(rate, { target: { value: '' } })
    fireEvent.blur(rate)

    await waitFor(() => expect(rate).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('This field is required')).toBeVisible()
  })

  it('does not publish when the administrator cancels the confirmation', async () => {
    renderSettings()
    const form = screen.getByRole('form', {
      name: 'Adjust point issuance rate',
    })
    await waitFor(() =>
      expect(
        within(form).getByRole('textbox', { name: /Point issuance rate/ })
      ).toHaveValue('50')
    )
    fireEvent.submit(form)
    await screen.findByRole('button', { name: 'Confirm change' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(
      apiMocks.publishConfirmedCanvasPointIssuanceRate
    ).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: 'Confirm change' })
    ).not.toBeInTheDocument()
  })

  it('exposes a filterable immutable rate history', async () => {
    renderSettings()
    expect(
      await screen.findByRole('button', { name: 'Rate version' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    expect(screen.getByLabelText('Rate version')).toBeInTheDocument()
  })

  it('normalizes the editable decimal and localizes rate history for French', async () => {
    apiMocks.getCanvasPointIssuanceRates.mockResolvedValue([
      {
        id: 'rate-v2',
        version: 2,
        status: 'PUBLISHED',
        pointsPerRmb: '1000.50000000',
        decisionSummary: '',
        evidenceRefs: [],
        createdByPrincipalId: 'platform-admin',
        approvedByPrincipalId: 'platform-admin',
        createdAt: '2026-08-26T00:00:00.000Z',
        approvedAt: '2026-08-26T00:01:00.000Z',
        effectiveAt: '2026-08-26T00:02:00.000Z',
      },
    ])
    await i18next.changeLanguage('fr')
    renderSettings()

    const form = screen.getByRole('form', {
      name: 'Modifier le taux d’émission des points',
    })
    await waitFor(() =>
      expect(
        within(form).getByRole('textbox', { name: /Taux d’émission/ })
      ).toHaveValue('1000.5')
    )
    expect(screen.getByText(/1.?000,5 points par RMB/)).toBeVisible()
    expect(screen.getAllByText(/26 août 2026/)).toHaveLength(3)
    const rate = within(form).getByRole('textbox', { name: /Taux d’émission/ })
    fireEvent.change(rate, { target: { value: '' } })
    fireEvent.blur(rate)
    await waitFor(() =>
      expect(screen.getByText('Ce champ est obligatoire')).toBeVisible()
    )
  })

  it('shows the server validation reason once publication is rejected', async () => {
    apiMocks.publishConfirmedCanvasPointIssuanceRate.mockRejectedValue({
      response: { data: { code: 'VALIDATION_FAILED' } },
    })
    renderSettings()
    const form = screen.getByRole('form', {
      name: 'Adjust point issuance rate',
    })
    await waitFor(() =>
      expect(
        within(form).getByRole('textbox', { name: /Point issuance rate/ })
      ).toHaveValue('50')
    )
    fireEvent.submit(form)
    fireEvent.click(
      await screen.findByRole('button', { name: 'Confirm change' })
    )

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Point issuance rate publication failed',
        {
          description:
            'The submitted rate change did not pass server validation. Check the field requirements and try again.',
          closeButton: false,
        }
      )
    )
  })
})
