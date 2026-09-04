/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import { RuntimeConfiguration } from '../RuntimeConfiguration'

const apiMocks = vi.hoisted(() => ({
  bindCanvasProviderCredentials: vi.fn(),
  checkCanvasProviderCredentialGroup: vi.fn(),
  checkCanvasRuntimeStorage: vi.fn(),
  getCanvasRuntimeConfiguration: vi.fn(),
  publishCanvasProviderCredentialGroup: vi.fn(),
  publishCanvasRuntimeStorage: vi.fn(),
}))
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('../../api', () => apiMocks)
vi.mock('sonner', () => ({ toast: toastMocks }))

const runtime = {
  providers: [
    {
      id: '85000000-0000-7000-8000-000000000001',
      code: 'provider-a',
      name: 'Provider A',
    },
  ],
  storage: [
    {
      id: '85000000-0000-7000-8000-000000000002',
      environment: 'UAT',
      version: 1,
      status: 'PUBLISHED',
      endpoint: 'https://account.r2.cloudflarestorage.com',
      mediaBucket: 'canvas-uat-task-media',
      backupBucket: 'canvas-uat-db-backups',
      inputRetentionHours: 24,
      outputRetentionHours: 72,
      downloadUrlTtlSeconds: 900,
      reason: 'initial',
      effectiveAt: '2026-09-04T00:00:00.000Z',
      createdByPrincipalId: 'admin-id',
      updatedBy: 'Platform Admin',
      createdAt: '2026-09-04T00:00:00.000Z',
      checks: {
        taskMedia: {
          outcome: 'PASSED',
          reasonCode: null,
          checkedBy: 'Platform Admin',
          checkedAt: '2026-09-04T00:01:00.000Z',
        },
        databaseBackup: null,
      },
    },
  ],
  credentialGroups: [
    {
      id: '85000000-0000-7000-8000-000000000003',
      credentialGroupId: '85000000-0000-7000-8000-000000000004',
      providerId: '85000000-0000-7000-8000-000000000001',
      providerCode: 'provider-a',
      name: 'Primary',
      version: 1,
      status: 'PUBLISHED',
      schemeNames: ['bearerAuth'],
      reason: 'initial',
      effectiveAt: '2026-09-04T00:00:00.000Z',
      createdByPrincipalId: 'admin-id',
      updatedBy: 'Platform Admin',
      createdAt: '2026-09-04T00:00:00.000Z',
      latestCheck: {
        outcome: 'FAILED',
        reasonCode: 'PROVIDER_CHECK_REQUIRES_CHANNEL',
        checkedBy: 'Platform Admin',
        checkedAt: '2026-09-04T00:02:00.000Z',
      },
    },
  ],
  models: [
    {
      id: '85000000-0000-7000-8000-000000000005',
      modelKey: 'image-a',
      publicName: 'Image A',
      status: 'PUBLISHED',
      providerId: '85000000-0000-7000-8000-000000000001',
      providerCode: 'provider-a',
      providerChannelId: '85000000-0000-7000-8000-000000000006',
      credentialGroupName: null,
      credentialGroupVersionId: null,
    },
  ],
}

function renderRuntime() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <RuntimeConfiguration />
    </QueryClientProvider>
  )
}

describe('Canvas runtime configuration', () => {
  beforeAll(() =>
    i18next.addResourceBundle('en', 'translation', en.translation, true, true)
  )
  beforeEach(async () => {
    vi.clearAllMocks()
    await i18next.changeLanguage('en')
    apiMocks.getCanvasRuntimeConfiguration.mockResolvedValue(runtime)
  })

  it('shows ownership and latest checks without ever redisplaying secret values', async () => {
    renderRuntime()

    expect(await screen.findAllByText(/Platform Admin/)).not.toHaveLength(0)
    expect(screen.getByText('Passed')).toBeVisible()
    expect(screen.getByText('Failed')).toBeVisible()
    expect(screen.queryByText(/stored-secret/i)).not.toBeInTheDocument()
    expect(
      screen
        .getAllByLabelText(/secret/i)
        .every(
          (input) =>
            input.getAttribute('type') === 'password' &&
            (input as HTMLInputElement).value === ''
        )
    ).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Replace secret' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Secret value')).toHaveFocus()
    )
    expect(screen.getByLabelText('Provider')).toBeDisabled()
    expect(
      screen
        .getAllByLabelText('Credential group')
        .find((element) => element.tagName === 'INPUT')
    ).toBeDisabled()
  })

  it('reports a recorded failed check as failure and refreshes the overview', async () => {
    apiMocks.checkCanvasProviderCredentialGroup.mockResolvedValue({
      outcome: 'FAILED',
      reasonCode: 'PROVIDER_CHECK_REQUIRES_CHANNEL',
      checkedAt: '2026-09-04T00:03:00.000Z',
    })
    renderRuntime()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Check connection' })
    )

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith(
        'Connection check failed: A safe provider check requires a bound provider channel'
      )
    )
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(apiMocks.getCanvasRuntimeConfiguration).toHaveBeenCalledTimes(2)
  })
})
