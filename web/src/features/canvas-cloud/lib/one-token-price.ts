/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { CanvasBillingUnit } from '../types'

type PricedSpec = {
  parameters: Record<string, unknown>
  billingUnit: CanvasBillingUnit
  tokenRates: unknown
  timeOfDaySchedule?: unknown
  categories?: unknown
  /** What else must agree for specs to share one price block (the agent's model price). */
  priceIdentity?: string
}

/**
 * Specs that all bill the same Token rates (a Token-billed image: 1K, 2K and 4K only change the Tokens) show one price
 * block without a spec name (IMAGE-TOKEN-BILLING-001).
 */
export function oneTokenPrice<T extends PricedSpec>(prices: T[]): T[] {
  const [first] = prices
  if (!first || prices.length < 2) return prices
  const identity = (price: T) =>
    price.billingUnit === 'MILLION_TOKENS' && price.tokenRates
      ? JSON.stringify([
          price.tokenRates,
          price.timeOfDaySchedule ?? null,
          price.categories ?? null,
          price.priceIdentity ?? null,
        ])
      : null
  const shared = identity(first)
  if (shared === null || prices.some((price) => identity(price) !== shared)) {
    return prices
  }
  return [{ ...first, parameters: {} }]
}
