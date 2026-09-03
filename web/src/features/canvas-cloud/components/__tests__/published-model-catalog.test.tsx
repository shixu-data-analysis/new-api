import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CanvasAdminTestingModel } from '../../types'
import { PublishedModelCatalog } from '../PublishedModelCatalog'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  publish: vi.fn(),
}))

vi.mock('../../api', () => ({
  getCanvasAdminTestingModels: mocks.list,
  publishCanvasModelPresentation: mocks.publish,
}))

function model(
  overrides: Partial<CanvasAdminTestingModel>
): CanvasAdminTestingModel {
  return {
    id: '85000000-0000-7000-8000-000000000004',
    modelKey: 'canvas.image.alpha',
    modelIds: [{ quality: null, modelId: 'provider-alpha' }],
    version: 2,
    name: 'Alpha model',
    description: 'Client description',
    enabled: true,
    resourceEnabled: true,
    presentationVersion: null,
    status: 'ACTIVE',
    customerVisible: false,
    pricedTargets: 0,
    totalTargets: 1,
    provider: { code: 'official', name: 'Official' },
    channel: {
      code: 'official.primary',
      version: 1,
      status: 'ACTIVE',
      protocolAdapter: 'openai',
      upstreamModel: 'alpha',
      executionSnapshot: {},
    },
    publicCatalogSnapshot: { capability: 'image.generate' },
    parameterCombinations: [],
    pricingTargets: [],
    createdAt: '2026-08-27T00:00:00.000Z',
    effectiveAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  }
}

function renderCatalog() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <PublishedModelCatalog />
    </QueryClientProvider>
  )
}

describe('Published model catalog', () => {
  beforeEach(() => {
    mocks.list.mockReset()
    mocks.publish.mockReset()
    mocks.publish.mockResolvedValue({ status: 'PUBLISHED' })
    mocks.list.mockResolvedValue([
      model({
        modelIds: [
          { quality: '1K', modelId: 'provider-alpha-1k' },
          { quality: '2K', modelId: 'provider-alpha-2k' },
        ],
      }),
      model({
        id: '85000000-0000-7000-8000-000000000005',
        modelKey: 'canvas.video.zeta',
        modelIds: [{ quality: null, modelId: 'provider-zeta' }],
        name: 'Zeta model',
        version: 1,
        publicCatalogSnapshot: { capability: 'video.generate' },
      }),
    ])
  })

  it('sorts the whole result set by each selected column before pagination', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    expect(screen.getAllByText('Model ID:')).toHaveLength(2)
    expect(screen.getByText('1K: provider-alpha-1k')).toHaveClass('break-all')
    expect(screen.getByText('2K: provider-alpha-2k')).toHaveClass('break-all')
    expect(
      screen.queryByText('85000000-0000-7000-8000-000000000004')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('canvas.image.alpha')).not.toBeInTheDocument()
    let rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Alpha model')
    expect(rows[2]).toHaveTextContent('Zeta model')

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Version' }))
    rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Zeta model')
    expect(rows[2]).toHaveTextContent('Alpha model')
  })

  it('searches published models by provider model ID instead of internal identifiers', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    const search = screen.getByPlaceholderText('Model ID')

    fireEvent.change(search, { target: { value: 'provider-zeta' } })
    expect(screen.queryByText('Alpha model')).not.toBeInTheDocument()
    expect(screen.getByText('Zeta model')).toBeVisible()

    fireEvent.change(search, { target: { value: 'canvas.image.alpha' } })
    expect(screen.queryByText('Alpha model')).not.toBeInTheDocument()
    expect(screen.queryByText('Zeta model')).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: '000000000004' } })
    expect(screen.queryByText('Alpha model')).not.toBeInTheDocument()
    expect(screen.queryByText('Zeta model')).not.toBeInTheDocument()
  })

  it('publishes client display edits without sending Bundle or pricing fields', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'Modify basic information',
      })[0]
    )
    fireEvent.change(screen.getByLabelText('Client display name'), {
      target: { value: '阿尔法模型' },
    })
    fireEvent.change(screen.getByLabelText('Client description'), {
      target: { value: '面向客户端的新说明' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and publish' }))

    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith(
        {
          modelKey: 'canvas.image.alpha',
          displayName: '阿尔法模型',
          description: '面向客户端的新说明',
          enabled: true,
        },
        expect.anything()
      )
    )
  })

  it('requires confirmation and publishes only an operational disable version', async () => {
    renderCatalog()
    await screen.findByText('Alpha model')
    fireEvent.click(screen.getAllByRole('button', { name: 'Disable' })[0])
    expect(screen.getByText('Disable this model?')).toBeInTheDocument()
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Disable',
      })
    )

    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith(
        {
          modelKey: 'canvas.image.alpha',
          displayName: 'Alpha model',
          description: 'Client description',
          enabled: false,
        },
        expect.anything()
      )
    )
  })
})
