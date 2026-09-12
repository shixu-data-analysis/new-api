import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useNavigate,
} from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'

import {
  InvitationNavigationProtection,
  type InvitationNavigationGuard,
} from '../InvitationManagement'

function renderProtectedRoute(kind: 'invitation' | 'recharge') {
  const discarded = vi.fn()
  function ProtectedPage() {
    const navigate = useNavigate()
    const [when, setWhen] = useState(true)
    const guard: InvitationNavigationGuard = {
      when,
      discard: () => {
        discarded()
        setWhen(false)
      },
    }
    return (
      <>
        {kind === 'invitation' ? (
          <InvitationNavigationProtection guards={[guard]} />
        ) : (
          <FormNavigationGuard when={when} />
        )}
        <button type='button' onClick={() => void navigate({ to: '/404' })}>
          Leave protected page
        </button>
        {kind === 'recharge' ? (
          <button type='button' onClick={() => setWhen(false)}>
            Mark delivery saved
          </button>
        ) : null}
      </>
    )
  }
  const root = createRootRoute({ component: Outlet })
  const protectedRoute = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: ProtectedPage,
  })
  const nextRoute = createRoute({
    getParentRoute: () => root,
    path: '/404',
    component: () => <p>Next page</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([protectedRoute, nextRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(<RouterProvider router={router} />)
  return { discarded, router }
}

describe('Canvas protected navigation', () => {
  it('keeps an invitation draft after Stay and clears it only before confirmed navigation', async () => {
    const { discarded, router } = renderProtectedRoute('invitation')
    await screen.findByRole('button', { name: 'Leave protected page' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave protected page' })
    )
    expect(await screen.findByRole('alertdialog')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(router.state.location.pathname).toBe('/')
    expect(discarded).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Leave protected page' })
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/404'))
    expect(discarded).toHaveBeenCalledOnce()
  })

  it('keeps recharge delivery after Stay and allows navigation after it is explicitly cleared', async () => {
    const { router } = renderProtectedRoute('recharge')
    await screen.findByRole('button', { name: 'Leave protected page' })
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave protected page' })
    )
    expect(await screen.findByRole('alertdialog')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(router.state.location.pathname).toBe('/')

    fireEvent.click(screen.getByRole('button', { name: 'Mark delivery saved' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave protected page' })
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/404'))
  })
})
