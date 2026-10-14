/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/

/**
 * Search and options of a model-pricing tab change. The tabs share one page and its unpublished prices, so the
 * leave guard does not apply.
 */
export function modelPricingTabNavigation(
  tab: 'current' | 'history',
  publicationId?: string
) {
  return {
    ignoreBlocker: true,
    search:
      tab === 'history' && publicationId ? { tab, publicationId } : { tab },
  }
}
