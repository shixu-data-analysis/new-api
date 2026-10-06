import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
  catalogChange,
  catalogPlanModel,
  catalogPriceItem,
} from '../../__tests__/catalog-plan-fixtures'
import {
  reviewCatalogModel,
  type CatalogPlanModel,
} from '../../catalog-plan-review'
import type { ModelCatalogChange } from '../../generated/model-catalog-import'
import { CatalogModelPreview } from '../CatalogModelPreview'

vi.mock('@tanstack/react-router', () => ({
  Link: (props: { children: ReactNode; params: { modelId: string } }) => (
    <a href={`/canvas-cloud/model-management/${props.params.modelId}/pricing`}>
      {props.children}
    </a>
  ),
}))

function renderPreview(
  models: CatalogPlanModel[],
  changes: ModelCatalogChange[] = [],
  onViewChannel = vi.fn()
) {
  return render(
    <CatalogModelPreview
      reviews={models.map((model) => reviewCatalogModel(model, changes))}
      changes={changes}
      focus={null}
      onViewChannel={onViewChannel}
    />
  )
}

function rowFor(name: string) {
  const row = screen.getByText(name).closest('tr')
  if (!row) throw new Error(`No row for ${name}`)
  return row
}

describe('Catalog model preview', () => {
  it('names a model by its administrator-set name and keeps the Bundle name and model key', () => {
    renderPreview([
      catalogPlanModel({ displayName: 'Bundle name', presentationDisplayName: 'Admin name' }),
    ])

    const row = rowFor('Admin name')
    expect(row).toHaveTextContent('Name in Bundle: Bundle name')
    expect(row).toHaveTextContent('Model key canvas.image.model')
  })

  it('shows the full administrator-set name, Bundle name and model key in the detail', () => {
    const longName = `Admin name ${'very long '.repeat(20)}end`
    renderPreview([
      catalogPlanModel({ displayName: 'Bundle name', presentationDisplayName: longName }),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'View details' }))

    const detail = screen.getByRole('button', { name: 'Collapse' }).closest('tr')?.nextElementSibling
    if (!detail) throw new Error('No detail row')
    expect(within(detail as HTMLElement).getByText(longName)).not.toHaveClass('truncate')
    expect(detail).toHaveTextContent('Name in Bundle: Bundle name')
    expect(detail).toHaveTextContent('Model key canvas.image.model')
  })

  it('shows each change kind with its version text', () => {
    renderPreview(
      [
        catalogPlanModel({ productKey: 'a', displayName: 'New one', action: 'CREATE', currentVersion: null, proposedVersion: 1 }),
        catalogPlanModel({ productKey: 'b', displayName: 'Versioned', action: 'CREATE_VERSION', currentVersion: 2, proposedVersion: 3 }),
        catalogPlanModel({ productKey: 'c', displayName: 'Described', currentVersion: 4, proposedVersion: 4 }),
        catalogPlanModel({ productKey: 'd', displayName: 'Same', currentVersion: 5, proposedVersion: 5 }),
      ],
      [catalogChange({ resourceType: 'MODEL_DESCRIPTION_DEFAULT', key: 'c', action: 'CREATE_VERSION' })]
    )

    expect(rowFor('New one')).toHaveTextContent('Newv1')
    expect(rowFor('Versioned')).toHaveTextContent('New versionv2 → v3')
    expect(rowFor('Described')).toHaveTextContent('Description updatedv4')
    expect(rowFor('Same')).toHaveTextContent('Unchangedv5')
  })

  it('lists pricing and binding work in the attention column and blockers in red text', () => {
    renderPreview([
      catalogPlanModel({
        productKey: 'a',
        displayName: 'Needs work',
        pricing: [
          catalogPriceItem({ status: 'NEEDS_PRICING', reasonCode: 'NEW_MODEL' }),
          catalogPriceItem({ priceGroupId: 'premium', status: 'NEEDS_PRICING', reasonCode: 'NEW_MODEL' }),
        ],
        credential: { ...catalogPlanModel().credential, status: 'NEEDS_BINDING', reasonCode: 'UNBOUND_SOURCE' },
      }),
      catalogPlanModel({
        productKey: 'b',
        displayName: 'Blocked',
        credential: { ...catalogPlanModel().credential, status: 'BLOCKED', reasonCode: 'PROVIDER_CHANGED' },
      }),
      catalogPlanModel({ productKey: 'c', displayName: 'Ready', customerVisibleAfterPublish: false }),
    ])

    expect(rowFor('Needs work')).toHaveTextContent('Pricing: 2 items, Bind API Key')
    expect(within(rowFor('Blocked')).getByText('Blocks publication: API provider changed')).toHaveClass('text-destructive')
    expect(rowFor('Ready')).toHaveTextContent('—')
    expect(rowFor('Ready')).toHaveTextContent('Not visible yet')
  })

  it('puts blocked and pending models before new and unchanged ones', () => {
    renderPreview([
      catalogPlanModel({ productKey: 'a', displayName: 'Unchanged model' }),
      catalogPlanModel({ productKey: 'b', displayName: 'New model', action: 'CREATE' }),
      catalogPlanModel({ productKey: 'c', displayName: 'Pending model', pricing: [catalogPriceItem({ status: 'NEEDS_PRICING', reasonCode: 'UNPRICED_SOURCE' })] }),
      catalogPlanModel({ productKey: 'd', displayName: 'Blocked model', pricing: [catalogPriceItem({ status: 'NEEDS_PRICING', reasonCode: 'SCHEDULED_PRICE_CONFLICT' })] }),
    ])

    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelector('td .font-medium')?.textContent)
    expect(names).toEqual(['Blocked model', 'Pending model', 'New model', 'Unchanged model'])
  })

  it('filters by capability, API provider, change and attention state, and clears every filter', async () => {
    const user = userEvent.setup()
    renderPreview([
      catalogPlanModel({ productKey: 'a', displayName: 'Image new', action: 'CREATE' }),
      catalogPlanModel({ productKey: 'b', displayName: 'Video same', capability: 'video.generate', providerId: 'video-provider' }),
      catalogPlanModel({
        productKey: 'c',
        displayName: 'Image unbound',
        credential: { ...catalogPlanModel().credential, status: 'NEEDS_BINDING', reasonCode: 'UNBOUND_SOURCE' },
      }),
    ])

    fireEvent.click(screen.getByRole('button', { name: /Column filters/ }))
    for (const [filter, option] of [
      ['Capability', 'video.generate'],
      ['API provider', 'video-provider'],
      ['Change in this Bundle', 'Unchanged'],
      ['To handle', 'Nothing to handle'],
    ]) {
      expect(screen.getByRole('combobox', { name: filter })).toBeInTheDocument()
      await user.click(screen.getByRole('combobox', { name: filter }))
      await user.click(await screen.findByRole('option', { name: option }))
    }
    expect(screen.getByText('Video same')).toBeInTheDocument()
    expect(screen.queryByText('Image new')).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'To handle' }))
    await user.click(await screen.findByRole('option', { name: 'Needs API Key binding' }))
    expect(screen.queryByText('Video same')).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('Image new')).toBeInTheDocument()
    expect(screen.getByText('Video same')).toBeInTheDocument()
    expect(screen.getByText('Image unbound')).toBeInTheDocument()
  })

  it('pages 20 models at a time', () => {
    renderPreview(
      Array.from({ length: 21 }, (_, index) =>
        catalogPlanModel({ productKey: `m-${String(index).padStart(2, '0')}`, displayName: `Model ${index}` })
      )
    )

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.queryByText('Model 20')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    expect(screen.getByText('Model 20')).toBeInTheDocument()
  })

  it('opens a detail with pricing, binding, source Bundle and a pricing link', () => {
    renderPreview([
      catalogPlanModel({
        displayName: 'Priced model',
        currentModelId: '11111111-1111-4111-8111-111111111111',
        currentBundleVersion: '2026.10.01.1',
        pricing: [
          catalogPriceItem({ priceGroupName: 'Standard' }),
          catalogPriceItem({ combinationKey: 'quality=4K', label: '4K', priceGroupName: 'Standard', status: 'NEEDS_PRICING', reasonCode: 'NEW_SPECIFICATION' }),
        ],
        credential: { ...catalogPlanModel().credential, status: 'NEEDS_BINDING', reasonCode: 'CREDENTIAL_GROUP_UNAVAILABLE', credentialGroupName: 'Archived group' },
      }),
    ])

    const toggle = screen.getByRole('button', { name: 'View details' })
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Current version comes from Bundle 2026.10.01.1')).toBeInTheDocument()
    expect(screen.getByText('Pricing (2 specifications × 1 price plans, 1 need pricing)')).toBeInTheDocument()
    expect(screen.getByText('Default · Price kept')).toBeInTheDocument()
    expect(screen.getByText('4K · Needs pricing (New specification)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to pricing' })).toHaveAttribute(
      'href',
      '/canvas-cloud/model-management/11111111-1111-4111-8111-111111111111/pricing'
    )
    expect(
      screen.getByText(/The previous API Key group is archived or unavailable/)
    ).toBeInTheDocument()
    expect(
      screen.getByText('Binding does not depend on this publication and can be done at any time.')
    ).toBeInTheDocument()
    expect(screen.getByText('API Key group Archived group')).toBeInTheDocument()
  })

  it.each([
    [
      'a model moved to a new channel of the same API provider',
      catalogPlanModel({
        action: 'CREATE_VERSION',
        definition: {
          current: { release: { channelId: 'old-channel' } },
          proposed: { release: { channelId: 'image-channel' } },
        },
      }),
      ['Moved to a new channel of the same API provider; the binding is kept'],
    ],
    [
      'a new model',
      catalogPlanModel({
        action: 'CREATE',
        credential: { ...catalogPlanModel().credential, status: 'NEEDS_BINDING', reasonCode: 'UNBOUND_SOURCE' },
      }),
      ['New models have no binding to keep; bind an API Key group after publication'],
    ],
    [
      'an existing model without a binding',
      catalogPlanModel({
        credential: { ...catalogPlanModel().credential, status: 'NEEDS_BINDING', reasonCode: 'UNBOUND_SOURCE' },
      }),
      ['No previous binding', 'Binding does not depend on this publication and can be done at any time.'],
    ],
    [
      'a binding that cannot be kept',
      catalogPlanModel({
        credential: { ...catalogPlanModel().credential, status: 'BLOCKED', reasonCode: 'CREDENTIAL_SCHEME_MISMATCH' },
      }),
      ['Authentication scheme mismatch', 'Make this API Key group support the required authentication first.'],
    ],
  ])('explains the API Key binding of %s', (_name, model, lines) => {
    renderPreview([model])

    fireEvent.click(screen.getByRole('button', { name: 'View details' }))

    for (const line of lines) expect(screen.getByText(line)).toBeInTheDocument()
    expect(screen.getByText('API Key group Image group')).toBeInTheDocument()
  })

  it('says no model matches when the filters leave no rows', async () => {
    const user = userEvent.setup()
    renderPreview([catalogPlanModel()])

    fireEvent.click(screen.getByRole('button', { name: /Column filters/ }))
    await user.click(screen.getByRole('combobox', { name: 'Change in this Bundle' }))
    await user.click(await screen.findByRole('option', { name: 'New' }))

    expect(screen.getByText('No models match the filters.')).toBeInTheDocument()
  })

  it('shows and expands a located row without clearing the filters', async () => {
    const user = userEvent.setup()
    const models = [
      catalogPlanModel({ productKey: 'a', displayName: 'New model', action: 'CREATE' }),
      catalogPlanModel({ productKey: 'b', displayName: 'Same model' }),
    ]
    const reviews = models.map((model) => reviewCatalogModel(model, []))
    const view = render(
      <CatalogModelPreview reviews={reviews} changes={[]} focus={null} onViewChannel={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /Column filters/ }))
    await user.click(screen.getByRole('combobox', { name: 'Change in this Bundle' }))
    await user.click(await screen.findByRole('option', { name: 'New' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByText('Same model')).not.toBeInTheDocument()

    view.rerender(
      <CatalogModelPreview reviews={reviews} changes={[]} focus={{ key: 'b', nonce: 1 }} onViewChannel={vi.fn()} />
    )

    expect(await screen.findAllByText('Same model')).toHaveLength(2) // row and its expanded detail
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('explains a version caused only by a channel and opens that channel', () => {
    const onViewChannel = vi.fn()
    renderPreview(
      [catalogPlanModel({ displayName: 'Channel moved', action: 'CREATE_VERSION', currentVersion: 1, proposedVersion: 2 })],
      [catalogChange({ resourceType: 'PROVIDER_CHANNEL', key: 'image-channel', action: 'CREATE_VERSION', currentVersion: 1, proposedVersion: 2 })],
      onViewChannel
    )

    fireEvent.click(screen.getByRole('button', { name: 'View details' }))

    expect(screen.getByText('Model definition is the same as the current version')).toBeInTheDocument()
    expect(
      screen.getByText('Model definition is unchanged; the new version comes only from the new version of channel image-channel')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View this channel' }))
    expect(onViewChannel).toHaveBeenCalledWith('image-channel')
  })
})
