/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { describe, expect, it } from 'vitest'

import {
  pricingLoadErrorTitle,
  pricingPublicationErrorTitle,
} from '../model-pricing-error'

const t = (key: string) => key

describe('model pricing direct-link errors', () => {
  it('distinguishes authentication and authorization failures', () => {
    expect(pricingLoadErrorTitle({ response: { status: 401 } }, t)).toBe(
      'You are not allowed to view this model pricing.'
    )
    expect(pricingLoadErrorTitle({ response: { status: 403 } }, t)).toBe(
      'You are not allowed to view this model pricing.'
    )
  })

  it('distinguishes missing publications from ownership conflicts', () => {
    expect(
      pricingPublicationErrorTitle({ response: { status: 404 } }, t)
    ).toBe('The requested pricing publication is unavailable for this model.')
    expect(
      pricingPublicationErrorTitle(
        { response: { status: 409, data: { code: 'CONFLICT' } } },
        t
      )
    ).toBe('This pricing publication does not belong to the selected model.')
  })

  it('reports server failures without conflating them with direct-link errors', () => {
    expect(pricingLoadErrorTitle({ response: { status: 503 } }, t)).toBe(
      'The pricing service is temporarily unavailable. Please try again.'
    )
  })
})
