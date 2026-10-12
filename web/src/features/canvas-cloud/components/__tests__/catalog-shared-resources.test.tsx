import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  catalogChange,
  catalogDiagnostic,
  catalogPlanModel,
} from '../../__tests__/catalog-plan-fixtures'
import {
  catalogSharedChanges,
  reviewCatalogModel,
} from '../../catalog-plan-review'
import { CatalogSharedResources } from '../CatalogSharedResources'

const channel = catalogChange({
  resourceType: 'PROVIDER_CHANNEL',
  key: 'image-channel',
  action: 'CREATE_VERSION',
  currentVersion: 1,
  proposedVersion: 2,
  detail: { adapterProfile: 'image-profile@2.0.0' },
  definition: {
    current: { code: 'image-channel', adapterProfile: 'image-profile@1.0.0' },
    proposed: { code: 'image-channel', adapterProfile: 'image-profile@2.0.0' },
  },
})
const newProfile = catalogChange({
  resourceType: 'MODEL_DEFINITION_ARTIFACT',
  key: 'image-profile@2.0.0',
  action: 'CREATE',
  detail: { kind: 'ADAPTER_PROFILE' },
  definition: {
    current: { id: 'image-profile', version: '1.0.0' },
    proposed: { id: 'image-profile', version: '2.0.0' },
  },
})
const conflictingProvider = catalogChange({
  resourceType: 'PROVIDER',
  key: 'image-provider',
  action: 'CONFLICT',
  definition: {
    current: { id: 'image-provider', internalName: 'Old' },
    proposed: { id: 'image-provider', internalName: 'New' },
  },
})
const unchangedProvider = catalogChange({
  resourceType: 'PROVIDER',
  key: 'other-provider',
})
const changes = [unchangedProvider, newProfile, channel, conflictingProvider]
const models = [
  catalogPlanModel({
    productKey: 'a',
    displayName: 'Moved model',
    action: 'CREATE_VERSION',
  }),
]
const diagnostics = [
  catalogDiagnostic({
    code: 'PROVIDER_CONFLICT',
    params: { providerId: 'image-provider' },
  }),
]

function renderShared() {
  return render(
    <CatalogSharedResources
      plan={{ changes, models, diagnostics }}
      changes={catalogSharedChanges(changes)}
      reviews={models.map((model) => reviewCatalogModel(model, changes))}
      focus={null}
    />
  )
}

function rowFor(key: string) {
  const row = screen.getByText(key).closest('tr')
  if (!row) throw new Error(`No row for ${key}`)
  return row
}

describe('Catalog shared resources', () => {
  it('puts conflicts first and explains each row impact', () => {
    renderShared()

    const keys = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.querySelectorAll('td')[1]?.textContent)
    expect(keys).toEqual([
      'image-provider',
      'image-channel',
      'image-profile@2.0.0',
      'other-provider',
    ])
    expect(rowFor('image-provider')).toHaveTextContent(
      'Blocks publication: Restore the original internal name, or use a new API provider ID.'
    )
    expect(rowFor('image-channel')).toHaveTextContent(
      'Causes new versions of 1 models: Moved model'
    )
    expect(rowFor('image-profile@2.0.0')).toHaveTextContent(
      'Used by channels image-channel'
    )
    expect(rowFor('other-provider')).toHaveTextContent('—')
  })

  it('starts with every filter set to all', () => {
    renderShared()

    expect(
      screen.queryByRole('button', { name: 'Clear filters' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Column filters/ }))
    expect(
      screen.getByRole('combobox', { name: 'Resource type' })
    ).toHaveTextContent('All resource types')
    expect(
      screen.getByRole('combobox', { name: 'Change in this Bundle' })
    ).toHaveTextContent('All change types')
  })

  it('compares a new file version with the previous version and offers no detail for unchanged rows', () => {
    renderShared()

    expect(rowFor('other-provider')).not.toHaveTextContent('View details')
    fireEvent.click(screen.getAllByRole('button', { name: 'View details' })[2])
    expect(
      screen.getByText('Compared with the previous version image-profile@1.0.0')
    ).toBeInTheDocument()
  })
})
