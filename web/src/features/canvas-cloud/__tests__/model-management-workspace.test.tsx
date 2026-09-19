import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AdminContent } from '../index'

const mocks = vi.hoisted(() => ({ workspace: vi.fn() }))
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  getCanvasAdminWorkspace: mocks.workspace,
}))
vi.mock('../components/AdminModelCatalog', () => ({
  AdminModelCatalog: (props: { initialPricingModelId?: string }) => (
    <div>Model management: {props.initialPricingModelId ?? 'model list'}</div>
  ),
}))

describe('Model management entry', () => {
  it.each(['catalog', 'pricing'] as const)(
    'opens %s without waiting for unrelated administrative workspace data',
    (section) => {
      mocks.workspace
        .mockReset()
        .mockImplementation(() => new Promise(() => {}))
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      render(
        <QueryClientProvider client={client}>
          <AdminContent
            section={section}
            providerTarget={{}}
            initialPricingModelId='selected-model'
          />
        </QueryClientProvider>
      )
      expect(screen.getByText('Model management: selected-model')).toBeVisible()
      expect(mocks.workspace).not.toHaveBeenCalled()
      client.clear()
    }
  )
})
