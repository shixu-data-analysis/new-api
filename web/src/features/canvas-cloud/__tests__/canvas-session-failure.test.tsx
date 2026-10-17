import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CanvasCloud } from '../index'

const mocks = vi.hoisted(() => ({ session: vi.fn() }))
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  getRouteApi: () => ({
    useParams: () => ({ section: 'points' }),
    useSearch: () => ({}),
    useNavigate: () => vi.fn(),
  }),
  useLocation: (options?: {
    select?: (location: { state: object }) => unknown
  }) => (options?.select ? options.select({ state: {} }) : { state: {} }),
}))
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  getCanvasSession: mocks.session,
}))

let client: QueryClient
function renderPage() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CanvasCloud />
    </QueryClientProvider>
  )
}

afterEach(() => {
  client.clear()
  mocks.session.mockReset()
})

describe('Canvas session failure', () => {
  it('offers invite activation only when invite registration is required', async () => {
    mocks.session.mockRejectedValue({
      response: { status: 403, data: { code: 'INVITE_REGISTRATION_REQUIRED' } },
    })
    renderPage()

    expect(
      await screen.findByRole('button', { name: 'Activate Canvas access' })
    ).toBeVisible()
    expect(screen.queryByText('Canvas access unavailable')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('shows access denied without retry when access was withdrawn', async () => {
    mocks.session.mockRejectedValue({
      response: { status: 403, data: { code: 'FORBIDDEN' } },
    })
    renderPage()

    expect(await screen.findByText('Access denied')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Activate Canvas access' })
    ).toBeNull()
  })

  it.each([
    ['an unavailable identity provider', { response: { status: 503 } }],
    ['a refresh that could not complete', { response: { status: 401 } }],
  ])(
    'shows a retryable error without invite activation for %s',
    async (_, failure) => {
      mocks.session.mockRejectedValue(failure)
      renderPage()

      // ErrorState fades in, so its opacity depends on animation timing; presence is the contract here.
      expect(
        await screen.findByText('Canvas access unavailable')
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Activate Canvas access' })
      ).toBeNull()
    }
  )
})
