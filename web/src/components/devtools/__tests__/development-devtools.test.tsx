/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DevelopmentDevtools } from '../development-devtools'

vi.mock('@tanstack/react-query-devtools', () => ({
  ReactQueryDevtoolsPanel: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid='query-devtools-panel'>
      <button type='button' onClick={onClose}>
        Query panel close
      </button>
    </div>
  ),
}))

vi.mock('@tanstack/react-router-devtools', () => ({
  TanStackRouterDevtoolsPanel: ({
    setIsOpen,
  }: {
    setIsOpen?: (open: boolean) => void
  }) => (
    <div data-testid='router-devtools-panel'>
      <button type='button' onClick={() => setIsOpen?.(false)}>
        Router panel close
      </button>
    </div>
  ),
}))

describe('DevelopmentDevtools', () => {
  it('opens and collapses the controlled Query panel', async () => {
    const user = userEvent.setup()
    render(<DevelopmentDevtools />)

    await user.click(
      screen.getByRole('button', { name: 'Open TanStack Query Devtools' })
    )
    expect(screen.getByTestId('query-devtools-panel')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Collapse TanStack Query Devtools',
      })
    )
    expect(screen.queryByTestId('query-devtools-panel')).not.toBeInTheDocument()
  })

  it('opens Router and honors its panel-provided close action', async () => {
    const user = userEvent.setup()
    render(<DevelopmentDevtools />)

    await user.click(
      screen.getByRole('button', { name: 'Open TanStack Router Devtools' })
    )
    expect(screen.getByTestId('router-devtools-panel')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Router panel close' }))

    expect(screen.queryByTestId('router-devtools-panel')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open TanStack Query Devtools' })
    ).toBeInTheDocument()
  })
})
