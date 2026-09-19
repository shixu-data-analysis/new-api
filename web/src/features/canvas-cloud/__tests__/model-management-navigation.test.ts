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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, Fragment } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { ModelManagementNavigationProvider } from '../model-management-navigation'
import { useModelManagementNavigation } from '../model-management-navigation-hooks'
import {
  forwardModelManagementReturnState,
  modelManagementReturnStateKey,
  normalizeModelManagementListState,
} from '../model-management-navigation-state'

afterEach(() => window.sessionStorage.clear())

function StateProbe() {
  const { listState, updateListState } = useModelManagementNavigation()
  return createElement(
    Fragment,
    null,
    createElement(
      'output',
      { 'data-testid': 'model-management-list-state' },
      JSON.stringify(listState)
    ),
    createElement(
      'button',
      { type: 'button', onClick: () => updateListState({}) },
      'Apply no-op update'
    )
  )
}

function renderProviderWithReturnState(state: Record<string, unknown>) {
  const root = createRootRoute({ component: Outlet })
  const route = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () =>
      createElement(
        ModelManagementNavigationProvider,
        null,
        createElement(StateProbe)
      ),
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  history.replace('/', state)
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history,
  })
  return render(createElement(RouterProvider, { router }))
}

describe('model-management return state forwarding', () => {
  it('preserves the same return context for legacy target redirect, selection, and back navigation', () => {
    const state = {
      [modelManagementReturnStateKey]: { nonce: 'return-to-model-list' },
      unrelated: 'ignored',
    }

    expect(forwardModelManagementReturnState(state)).toEqual({
      [modelManagementReturnStateKey]: { nonce: 'return-to-model-list' },
    })
  })

  it('does not manufacture a return context', () => {
    expect(
      forwardModelManagementReturnState({ unrelated: true })
    ).toBeUndefined()
  })

  it('normalizes missing and malformed persisted fields without discarding valid legacy facts', () => {
    expect(
      normalizeModelManagementListState(
        {
          search: 'image',
          modelId: 'model-1',
          provider: 'provider-1',
          capability: 'IMAGE',
          visibility: 'CUSTOMER',
          pagination: { pageIndex: 2, pageSize: 50 },
          sorting: [{ id: 'provider', desc: true }],
          scrollY: 480,
          focusModelId: 'model-1:monitoring:target-1',
        },
        { retainFocus: true }
      )
    ).toMatchObject({
      search: 'image',
      modelId: 'model-1',
      provider: 'provider-1',
      capability: 'IMAGE',
      visibility: 'CUSTOMER',
      pagination: { pageIndex: 2, pageSize: 50 },
      sorting: [{ id: 'provider', desc: true }],
      columnVisibility: {},
      scrollY: 480,
      focusModelId: 'model-1:monitoring:target-1',
    })
    expect(
      normalizeModelManagementListState({ pagination: 'invalid' })
    ).toMatchObject({
      search: '',
      pagination: { pageIndex: 0, pageSize: 20 },
      columnVisibility: {},
    })
  })

  it('restores an old return context through the Provider with an empty column visibility state', async () => {
    const nonce = 'legacy-return-context'
    window.sessionStorage.setItem(
      'canvas.model-management.return-contexts',
      JSON.stringify({
        [nonce]: {
          search: 'image',
          modelId: 'model-1',
          provider: 'provider-1',
          capability: 'IMAGE',
          visibility: 'CUSTOMER',
          pagination: { pageIndex: 2, pageSize: 50 },
          sorting: [{ id: 'provider', desc: true }],
          scrollY: 480,
          focusModelId: 'model-1:monitoring:target-1',
        },
      })
    )

    renderProviderWithReturnState({
      [modelManagementReturnStateKey]: { nonce },
    })

    await waitFor(() => {
      const state = JSON.parse(
        screen.getByTestId('model-management-list-state').textContent ?? '{}'
      )
      expect(state).toMatchObject({
        search: 'image',
        modelId: 'model-1',
        provider: 'provider-1',
        capability: 'IMAGE',
        visibility: 'CUSTOMER',
        pagination: { pageIndex: 2, pageSize: 50 },
        sorting: [{ id: 'provider', desc: true }],
        columnVisibility: {},
        scrollY: 480,
        focusModelId: 'model-1:monitoring:target-1',
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply no-op update' }))
  })
})
