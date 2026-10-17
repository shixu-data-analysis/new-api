import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { CanvasRouteFailure } from '../../route-access'
import { CanvasRouteError } from '../CanvasRouteStates'

const mocks = vi.hoisted(() => ({ invalidate: vi.fn() }))
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useRouter: () => ({ invalidate: mocks.invalidate }),
}))
vi.mock('@/features/errors/general-error', () => ({
  GeneralError: () => <div>General error page</div>,
}))

function renderError(error: unknown) {
  render(
    <CanvasRouteError
      error={error as Error}
      reset={vi.fn()}
      info={{ componentStack: '' }}
    />
  )
}

describe('Canvas route failures', () => {
  // ErrorState fades in, so its opacity depends on animation timing; presence is the contract here.
  it('shows access denied inside the layout without a retry', () => {
    renderError(new CanvasRouteFailure('forbidden'))

    expect(screen.getByText('Access denied')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('reloads the route when an unavailable session is retried', () => {
    renderError(
      new CanvasRouteFailure('unavailable', { cause: new Error('timeout') })
    )

    expect(screen.getByText('Canvas access unavailable')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.invalidate).toHaveBeenCalledTimes(1)
  })

  it('keeps the general error page for failures unrelated to the Canvas session', () => {
    renderError(new TypeError('render failed'))

    expect(screen.getByText('General error page')).toBeInTheDocument()
    expect(screen.queryByText('Canvas access unavailable')).toBeNull()
  })
})
