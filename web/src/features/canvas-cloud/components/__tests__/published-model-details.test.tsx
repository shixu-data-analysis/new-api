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
    executionTargets: [],
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
    publicCatalogSnapshot: { capability: 'image.generate' },
    parameterCombinations: [],
    pricingTargets: [],
    createdAt: '2026-08-27T00:00:00.000Z',
    effectiveAt: '2026-08-27T00:00:00.000Z',
    ...overrides,
  }
}

describe('Published model details', () => {
  it('keeps the complete unmodified public snapshot in a collapsed scroll region', () => {
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
    fireEvent.click(screen.getByText('Original catalog configuration'))
    const pre = container.querySelector('pre')
    if (!pre) throw new Error('Original catalog configuration is missing')
    expect(pre.textContent).toBe(JSON.stringify(snapshot, null, 2))
    expect(pre).toHaveClass('max-h-64', 'max-w-full', 'overflow-auto')
    expect(JSON.stringify(selected)).toBe(before)
  })
})
