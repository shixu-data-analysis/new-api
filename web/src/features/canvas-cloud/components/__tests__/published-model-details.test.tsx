import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { CanvasAdminTestingModel } from '../../types'
import { PublishedModelDetails } from '../PublishedModelDetails'

function model(
  overrides: Partial<CanvasAdminTestingModel> = {}
): CanvasAdminTestingModel {
  return {
    id: '85000000-0000-7000-8000-000000000004',
    modelKey: 'canvas.image.alpha',
    modelIds: [{ quality: null, modelId: 'provider-alpha' }],
    version: 2,
    name: 'Alpha model',
    description: '',
    enabled: true,
    resourceEnabled: true,
    presentationVersion: null,
    status: 'ACTIVE',
    customerVisible: false,
    pricedTargets: 0,
    totalTargets: 1,
    provider: { id: 'provider-official', code: 'official', name: 'Official' },
    binding: {
      status: 'UNBOUND',
      credentialGroupId: null,
      credentialGroupName: null,
      credentialGroupVersionId: null,
      credentialGroupVersion: null,
    },
    billingUnit: null,
    billingUnits: [],
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

describe('Published model details', () => {
  it('opens technical information directly and omits presentation and binding details', () => {
    render(
      <PublishedModelDetails
        model={model({
          description: 'Retained description',
          presentationVersion: 8,
        })}
      />
    )
    const details = screen.getByText('Technical information').closest('details')
    expect(details).not.toHaveAttribute('open')
    expect(screen.queryByText('Model details')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Technical information'))
    expect(screen.getByText('official')).toBeVisible()
    for (const label of [
      'Retained description',
      'Presentation version',
      'Technical version',
      'Supported parameters',
      'API Key group',
      'Manage API Key bindings',
    ]) {
      expect(screen.queryByText(new RegExp(label))).not.toBeInTheDocument()
    }
  })

  it('preserves each quality mapping and full IDs without a table or invented quality', () => {
    const longId = 'upstream-model-'.repeat(30)
    render(
      <PublishedModelDetails
        model={model({
          modelIds: [
            { quality: '1K', modelId: 'gpt-image2-1k' },
            { quality: '2K', modelId: longId },
            { quality: '4K', modelId: 'gpt-image2-4k' },
            { quality: null, modelId: 'direct-model' },
          ],
        })}
      />
    )
    fireEvent.click(screen.getByText('Technical information'))
    expect(screen.getByText('1K →').parentElement).toHaveTextContent(
      'gpt-image2-1k'
    )
    expect(screen.getByText('2K →').parentElement).toHaveTextContent(longId)
    expect(screen.getByText('4K →').parentElement).toHaveTextContent(
      'gpt-image2-4k'
    )
    expect(screen.getByText(longId)).toHaveClass('[overflow-wrap:anywhere]')
    expect(screen.getByText('direct-model').parentElement).toHaveTextContent(
      /^direct-model$/
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('displays IDs directly when there is no quality distinction', () => {
    render(<PublishedModelDetails model={model()} />)
    fireEvent.click(screen.getByText('Technical information'))
    expect(screen.getByText('provider-alpha')).toBeVisible()
    expect(screen.queryByText(/→/)).not.toBeInTheDocument()
  })

  it('keeps the complete unmodified public snapshot in an independently collapsed scroll region', () => {
    const snapshot = {
      capability: 'image.generate',
      nested: {
        zero: 0,
        disabled: false,
        原始字段: '原始值',
        values: ['x'.repeat(500)],
      },
    }
    const selected = model({ publicCatalogSnapshot: snapshot })
    const before = JSON.stringify(selected)
    const { container } = render(<PublishedModelDetails model={selected} />)
    fireEvent.click(screen.getByText('Technical information'))
    expect(
      screen.getByText('Original catalog configuration').closest('details')
    ).not.toHaveAttribute('open')
    fireEvent.click(screen.getByText('Original catalog configuration'))
    const pre = container.querySelector('pre')
    if (!pre) throw new Error('Original catalog configuration is missing')
    expect(pre.textContent).toBe(JSON.stringify(snapshot, null, 2))
    expect(pre).toHaveClass('max-h-64', 'max-w-full', 'overflow-auto')
    expect(pre.textContent).not.toContain('executionSnapshot')
    expect(JSON.stringify(selected)).toBe(before)
  })
})
