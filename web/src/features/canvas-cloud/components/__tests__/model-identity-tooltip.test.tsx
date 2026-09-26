/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'

import { ModelIdentityTooltip } from '../ModelIdentityTooltip'

const identity = {
  effectiveDisplayName: 'Client Alpha',
  catalogDefaultName: 'Catalog Alpha',
  modelKey: 'canvas.image.alpha',
  upstreamModelId: 'provider-alpha-v2',
  upstreamModelIds: ['provider-alpha-v3', 'provider-alpha-v2'],
}

it('opens the same model identity content by keyboard focus and click', async () => {
  render(<ModelIdentityTooltip {...identity} />)

  const trigger = screen.getByRole('button', { name: 'View model identity' })
  fireEvent.focus(trigger)
  expect(await screen.findByText('Catalog Alpha')).toBeVisible()
  expect(screen.getByText('canvas.image.alpha')).toBeVisible()
  expect(screen.getByText('provider-alpha-v2')).toBeVisible()
  expect(screen.getByText('provider-alpha-v3')).toBeVisible()

  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
})

it('hides the identity control when the effective and catalog names match', () => {
  render(
    <ModelIdentityTooltip
      {...identity}
      effectiveDisplayName='Same model'
      catalogDefaultName='Same model'
    />
  )

  expect(
    screen.queryByRole('button', { name: 'View model identity' })
  ).toBeNull()
})

it('omits technical identities already visible in the surrounding body', async () => {
  render(
    <ModelIdentityTooltip {...identity} modelKeyShown upstreamModelIdShown />
  )

  fireEvent.click(screen.getByRole('button', { name: 'View model identity' }))
  expect(await screen.findByText('Catalog Alpha')).toBeVisible()
  expect(screen.queryByText('canvas.image.alpha')).toBeNull()
  expect(screen.queryByText('provider-alpha-v2')).toBeNull()
  expect(screen.queryByText('provider-alpha-v3')).toBeNull()
})

it('omits only upstream identities already visible in the surrounding body', async () => {
  render(
    <ModelIdentityTooltip
      {...identity}
      upstreamModelIdsShown={['provider-alpha-v2']}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: 'View model identity' }))
  expect(await screen.findByText('provider-alpha-v3')).toBeVisible()
  expect(screen.queryByText('provider-alpha-v2')).toBeNull()
})
