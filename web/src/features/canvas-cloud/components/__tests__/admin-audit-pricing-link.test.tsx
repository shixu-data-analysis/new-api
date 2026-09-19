/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import type { CanvasAuditEventPage } from '../../types'
import { AdminAuditLog } from '../AdminAuditLog'

const mocks = vi.hoisted(() => ({ audit: vi.fn() }))
vi.mock('../../api', () => ({ getCanvasAuditEvents: mocks.audit }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    search,
    children,
  }: {
    to: string
    params: { modelId: string }
    search: Record<string, string>
    children: ReactNode
  }) => (
    <a
      href={to.replace('$modelId', params.modelId) + `?${new URLSearchParams(search)}`}
    >
      {children}
    </a>
  ),
}))

const modelId = '89000000-0000-7000-8000-000000000007'
const publicationId = '89000000-0000-7000-8000-000000000020'
const event: CanvasAuditEventPage['items'][number] = {
  id: '89000000-0000-7000-8000-000000000021',
  occurredAt: '2026-09-08T12:00:00.000Z',
  service: 'canvas-cloud',
  environment: 'test',
  category: 'PRICING',
  action: 'pricing.model.published',
  outcome: 'SUCCESS',
  severity: 'INFO',
  actorPrincipalId: null,
  actorType: 'PLATFORM_ADMIN',
  actorUsername: 'admin',
  requestId: null,
  traceId: null,
  resourceType: 'MODEL_PRICING_PUBLICATION',
  resourceId: publicationId,
  resourceKey: null,
  reasonCode: 'ADMIN_CONFIRMED',
  publicMetadata: { customerModelId: modelId },
}

function renderLog(record = event) {
  mocks.audit.mockResolvedValue({
    page: 1,
    pageSize: 20,
    total: 1,
    items: [record],
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <AdminAuditLog />
    </QueryClientProvider>
  )
}

describe('unified pricing audit links', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
    await i18next.changeLanguage('en')
  })

  it('links the exact publication and model without selecting a nearby version', async () => {
    renderLog()
    const link = await screen.findByRole('link', { name: 'Model pricing' })
    expect(link.getAttribute('href')).toBe(
      `/canvas-cloud/model-management/${modelId}/pricing?tab=history&publicationId=${publicationId}`
    )
  })

  it('keeps incomplete legacy metadata readable without inventing a destination', async () => {
    renderLog({ ...event, publicMetadata: {} })
    expect(
      await screen.findByRole('cell', { name: /Model pricing/ })
    ).toBeVisible()
    expect(
      screen.queryByRole('link', { name: 'Model pricing' })
    ).not.toBeInTheDocument()
    expect(screen.getByText(publicationId)).toBeVisible()
  })
})
