import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { CanvasModelCatalogPlanModel } from '../../types'
import { CatalogModelPreview } from '../CatalogModelPreview'

function previewModel(index: number): CanvasModelCatalogPlanModel {
  return {
    productKey: `canvas.image.model-${index}`,
    displayName: `Client model ${index}`,
    channelId: 'channel-with-a-long-identifier',
    providerId: 'provider-with-a-long-identifier',
    capability: 'image.generate',
    action: 'CREATE',
    currentVersion: null,
    proposedVersion: 1,
    customerVisibleAfterPublish: false,
    publicInteraction: {
      defaultParams: {},
      paramSchema: {},
      referenceLimits: {},
    },
    pricing: [
      {
        combinationKey: 'quality=4K',
        label: '4K',
        parameters: { quality: '4K' },
        billingDimensions: {},
        priceGroupId: 'standard',
        priceGroupCode: 'STANDARD',
        priceGroupName: 'Standard long plan name',
        status: 'NEEDS_PRICING',
        reasonCode: 'NEW_SPECIFICATION',
        billingUnit: null,
        points: null,
        tokenRates: null,
        sourcePriceVersionId: null,
        sourceProviderRateVersionId: null,
        sourceModelVersion: null,
        effectiveAt: null,
      },
    ],
    credential: {
      status: 'NEEDS_BINDING',
      reasonCode: 'UNBOUND_SOURCE',
      sourceBindingId: null,
      sourceModelId: null,
      credentialGroupVersionId: null,
      credentialGroupName: null,
    },
  }
}

describe('Catalog model preview', () => {
  it('shows review status in the main row and reveals full pricing detail by keyboard', async () => {
    render(<CatalogModelPreview models={[previewModel(1)]} />)

    expect(screen.getByText(/1 Needs pricing/)).toBeVisible()
    expect(screen.getByText('Existing prices reused: 0')).toBeVisible()
    expect(screen.getByText('Binding required')).toBeVisible()
    expect(
      screen.getByText('Scroll horizontally to view all columns')
    ).toBeVisible()
    const scrollRegion = screen.getByRole('region', {
      name: 'Client model preview',
    })
    expect(scrollRegion).toHaveClass('overflow-x-auto')
    const toggle = screen.getByRole('button', { name: 'View details' })
    expect(toggle).not.toHaveAttribute('aria-controls')
    toggle.focus()
    await userEvent.keyboard('{Enter}')
    expect(
      screen.getByRole('button', { name: 'Hide details' })
    ).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('button', { name: 'Hide details' })
    ).toHaveAttribute(
      'aria-controls',
      'catalog-model-detail-canvas.image.model-1'
    )
    expect(screen.getByText(/Standard long plan name/)).toBeVisible()
    expect(
      screen.getByText('New specification has no matching price')
    ).toBeVisible()
  })

  it('uses standard pagination and returns to the first page after page size or filter changes', async () => {
    render(
      <CatalogModelPreview
        models={Array.from({ length: 21 }, (_, index) =>
          previewModel(index + 1)
        )}
      />
    )

    expect(screen.getByText('Page 1 of 2')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(screen.getByText('Page 2 of 2')).toBeVisible()
    expect(screen.getByText('Client model 21')).toBeVisible()
    await userEvent.click(
      screen.getByRole('combobox', { name: 'Rows per page' })
    )
    await userEvent.click(screen.getByRole('option', { name: '10' }))
    expect(screen.getByText('Page 1 of 3')).toBeVisible()
    expect(screen.getByText('Client model 1')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    const filter = screen.getByPlaceholderText('Client model')
    fireEvent.change(filter, { target: { value: 'Client model 1' } })
    expect(screen.getByText('Page 1 of 2')).toBeVisible()
    expect(screen.queryByText('Client model 21')).not.toBeInTheDocument()
    expect(
      within(
        screen.getByRole('region', { name: 'Client model preview' })
      ).getAllByRole('row')
    ).toHaveLength(11)
  })

  it('keeps the current page valid when the plan loses its last page', () => {
    const models = Array.from({ length: 21 }, (_, index) =>
      previewModel(index + 1)
    )
    const view = render(<CatalogModelPreview models={models} />)

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(screen.getByText('Page 2 of 2')).toBeVisible()

    view.rerender(<CatalogModelPreview models={models.slice(0, 5)} />)
    expect(screen.getByText('Page 1 of 1')).toBeVisible()
    expect(screen.getByText('Client model 1')).toBeVisible()
    expect(screen.queryByText('Client model 21')).not.toBeInTheDocument()
  })
})
