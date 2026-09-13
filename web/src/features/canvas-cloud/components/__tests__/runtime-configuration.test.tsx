/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vietnamese from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'

import type {
  CanvasCredentialRotationPreview,
  CanvasModelBindingPreview,
} from '../../types'
import { runtimeChangeError } from '../runtime-change-error'
import {
  RuntimeConfiguration,
  type CanvasProviderNavigationTarget,
} from '../RuntimeConfiguration'
import { RuntimeManagement } from '../RuntimeManagement'

const apiMocks = vi.hoisted(() => ({
  bindCanvasProviderCredentials: vi.fn(),
  checkCanvasDatabaseBackupStorage: vi.fn(),
  checkCanvasCustomerModelAccessPermission: vi.fn(),
  checkCanvasTaskMediaStorage: vi.fn(),
  getCanvasCredentialRotationPreview: vi.fn(),
  getCanvasCredentialVersionAffectedModels: vi.fn(),
  getCanvasModelCredentialBindingHistory: vi.fn(),
  getCanvasProviderConfiguration: vi.fn(),
  getCanvasProviderCredentialHistory: vi.fn(),
  getCanvasProviderCredentialGroupChanges: vi.fn(),
  getCanvasRuntimeConfiguration: vi.fn(),
  previewCanvasProviderCredentialBindings: vi.fn(),
  publishCanvasDatabaseBackupStorage: vi.fn(),
  publishCanvasProviderCredentialGroup: vi.fn(),
  publishCanvasTaskMediaStorage: vi.fn(),
  publishCanvasCredentialGroupManagement: vi.fn(),
  archiveCanvasCredentialGroup: vi.fn(),
  restoreCanvasCredentialGroup: vi.fn(),
}))
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('../../api', () => apiMocks)
vi.mock('@/features/system-settings/components/form-navigation-guard', () => ({
  FormNavigationGuard: (props: { when: boolean }) => (
    <div data-testid='navigation-guard' data-active={String(props.when)} />
  ),
}))
vi.mock('sonner', () => ({ toast: toastMocks }))

const runtime = {
  environment: 'UAT',
  taskMedia: {
    id: '85000000-0000-7000-8000-000000000002',
    version: 1,
    status: 'PUBLISHED',
    endpoint: 'https://account.r2.cloudflarestorage.com',
    bucket: 'canvas-uat-task-media',
    accessKeyId: 'current-media-access',
    credentialsConfigured: true,
    inputRetentionHours: 24,
    outputRetentionHours: 72,
    downloadUrlTtlSeconds: 900,
    reason: 'initial',
    effectiveAt: '2026-09-04T00:00:00.000Z',
    createdByPrincipalId: 'admin-id',
    updatedBy: 'Platform Admin',
    createdAt: '2026-09-04T00:00:00.000Z',
    latestCheck: {
      outcome: 'PASSED',
      reasonCode: null,
      checkedBy: 'Platform Admin',
      checkedAt: '2026-09-04T00:01:00.000Z',
    },
  },
  databaseBackup: {
    id: '85000000-0000-7000-8000-000000000007',
    version: 2,
    status: 'PUBLISHED',
    endpoint: 'https://account.r2.cloudflarestorage.com',
    bucket: 'canvas-uat-db-backups',
    accessKeyId: 'current-backup-access',
    credentialsConfigured: true,
    backupRetentionHours: 72,
    downloadUrlTtlSeconds: 900,
    reason: 'separate backup',
    effectiveAt: '2026-09-04T00:00:00.000Z',
    createdByPrincipalId: 'admin-id',
    updatedBy: 'Platform Admin',
    createdAt: '2026-09-04T00:00:00.000Z',
    latestCheck: null,
  },
}

const model = {
  id: '85000000-0000-7000-8000-000000000005',
  modelKey: 'image-a',
  publicName: 'Image A',
  capability: 'image.generate',
  status: 'PUBLISHED',
  providerId: '85000000-0000-7000-8000-000000000001',
  providerCode: 'provider-a',
  providerChannelId: '85000000-0000-7000-8000-000000000006',
  credentialBindingId: '85000000-0000-7000-8000-000000000008',
  credentialBindingVersion: 1,
  credentialBindingEffectiveAt: '2026-09-04T00:00:00.000Z',
  credentialGroupId: '85000000-0000-7000-8000-000000000004',
  credentialGroupName: 'Primary',
  credentialGroupVersionId: '85000000-0000-7000-8000-000000000003',
  credentialGroupVersion: 1,
  latestAccessCheck: {
    outcome: 'UNVERIFIABLE',
    reasonCode: 'MODEL_ACCESS_CHECK_UNSUPPORTED',
    checkedBy: 'Platform Admin',
    checkedAt: '2026-09-04T00:02:00.000Z',
  },
}
const secondModel = {
  ...model,
  id: '85000000-0000-7000-8000-000000000009',
  modelKey: 'image-b',
  publicName: 'Image B',
  credentialBindingId: null,
  credentialBindingVersion: null,
  credentialGroupId: null,
  credentialGroupName: null,
  credentialGroupVersionId: null,
  credentialGroupVersion: null,
}

const providerRuntime = {
  environment: 'UAT',
  selectedProviderId: '85000000-0000-7000-8000-000000000001',
  selectedCredentialGroupId: '85000000-0000-7000-8000-000000000004',
  navigationTarget: null,
  providers: [
    {
      id: '85000000-0000-7000-8000-000000000001',
      code: 'provider-a',
      name: 'Provider A',
      credentialSchemes: ['bearerAuth', 'googleApiKey'],
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
      lifecycleStatus: 'ACTIVE',
      archivedAt: null,
      schemeNames: ['bearerAuth'],
      reason: 'initial',
      effectiveAt: '2026-09-04T00:00:00.000Z',
      createdByPrincipalId: 'admin-id',
      updatedBy: 'Platform Admin',
      createdAt: '2026-09-04T00:00:00.000Z',
      boundModelCount: 1,
      versionCount: 1,
    },
  ],
  models: { page: 1, pageSize: 20, total: 1, items: [model] },
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

function renderProviderConfiguration(
  providerTarget?: CanvasProviderNavigationTarget
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <RuntimeConfiguration view='provider' providerTarget={providerTarget} />
    </QueryClientProvider>
  )
}

function renderRuntimeManagement() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <RuntimeManagement initialView='provider' />
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
    apiMocks.getCanvasProviderConfiguration.mockResolvedValue(providerRuntime)
    apiMocks.getCanvasProviderCredentialGroupChanges.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.publishCanvasProviderCredentialGroup.mockResolvedValue({
      providerId: providerRuntime.providers[0].id,
      credentialGroupId: providerRuntime.credentialGroups[0].credentialGroupId,
    })
    apiMocks.getCanvasCredentialRotationPreview.mockResolvedValue({
      credentialGroupId: '85000000-0000-7000-8000-000000000004',
      providerId: '85000000-0000-7000-8000-000000000001',
      name: 'Primary',
      currentCredentialGroupVersionId: '85000000-0000-7000-8000-000000000003',
      currentVersion: 1,
      nextVersion: 2,
      affectedModels: [
        {
          customerModelId: model.id,
          publicName: model.publicName,
          bindingId: model.credentialBindingId,
          bindingVersion: model.credentialBindingVersion,
        },
      ],
    })
    apiMocks.previewCanvasProviderCredentialBindings.mockResolvedValue({
      credentialGroupVersionId: '85000000-0000-7000-8000-000000000003',
      targetCredentialGroupName: 'Primary',
      targetCredentialGroupVersion: 1,
      models: [
        {
          customerModelId: model.id,
          publicName: model.publicName,
          currentCredentialGroupName: model.credentialGroupName,
          currentCredentialGroupVersion: model.credentialGroupVersion,
          bindingId: model.credentialBindingId,
          bindingVersion: model.credentialBindingVersion,
        },
      ],
    })
    apiMocks.getCanvasProviderCredentialHistory.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
    apiMocks.getCanvasCredentialVersionAffectedModels.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      factAvailable: true,
      items: [],
    })
    apiMocks.getCanvasModelCredentialBindingHistory.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      items: [],
    })
  })

  it('maps controlled runtime failures to safe recovery actions', () => {
    const translate = (key: string) => key
    const error = (code: string) => ({
      response: {
        data: { code, message: 'internal secret must not be rendered' },
      },
    })
    expect(
      runtimeChangeError(error('PREVIEW_STALE'), translate, 'binding')
    ).toBe('Configuration changed. Preview again before confirming.')
    expect(
      runtimeChangeError(
        error('CREDENTIAL_GROUP_VERSION_STALE'),
        translate,
        'binding'
      )
    ).toBe(
      'The credential version changed. Refresh and select the current version.'
    )
    expect(
      runtimeChangeError(error('MODEL_PROVIDER_MISMATCH'), translate, 'binding')
    ).toBe(
      'Some selected models no longer belong to this provider. Review the filters and selection.'
    )
    expect(
      runtimeChangeError(
        error('CREDENTIAL_SCHEME_MISMATCH'),
        translate,
        'credential'
      )
    ).toBe(
      'The credential scheme no longer matches every selected model. Update the credential group or selection.'
    )
    expect(runtimeChangeError(error('UNKNOWN'), translate, 'credential')).toBe(
      'Credential publication failed. Check the required schemes and preview again.'
    )
    expect(
      runtimeChangeError(error('UNKNOWN'), translate, 'preview')
    ).not.toContain('internal secret')
  })

  it('consolidates runtime operations into three responsive sections', async () => {
    renderRuntimeManagement()

    expect(
      screen.getByRole('tab', { name: 'Execution overview' })
    ).toBeVisible()
    expect(
      screen.getByRole('tab', { name: 'Provider configuration' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(
      screen.getByRole('tab', { name: 'Storage and backups' })
    ).toBeVisible()
    expect(await screen.findByText('Provider API Key groups')).toBeVisible()
  })

  it('uses the provider-only overview without exposing storage controls', async () => {
    renderProviderConfiguration()

    expect(await screen.findByText('Provider API Key groups')).toBeVisible()
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeVisible()
    expect(screen.queryByText('Runtime storage')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('form', { name: 'Publish task media configuration' })
    ).not.toBeInTheDocument()
    expect(apiMocks.getCanvasProviderConfiguration).toHaveBeenCalledTimes(1)
    expect(apiMocks.getCanvasRuntimeConfiguration).not.toHaveBeenCalled()
  })

  it('manages one API Key group in a single drawer and previews actual changes', async () => {
    apiMocks.publishCanvasCredentialGroupManagement.mockResolvedValue({})
    renderProviderConfiguration({
      credentialGroupVersionId: providerRuntime.credentialGroups[0].id,
      modelId: model.id,
    })
    await screen.findByText('Provider API Key groups')

    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage API Key group' })
    )
    const drawer = screen.getByRole('dialog', { name: 'Manage API Key group' })
    expect(within(drawer).getByLabelText('API Key group')).toHaveValue('Primary')
    expect(within(drawer).getByLabelText('Replace API Key')).toHaveValue('')
    expect(await within(drawer).findByText('Image A')).toBeVisible()

    fireEvent.change(within(drawer).getByLabelText('API Key group'), {
      target: { value: 'Primary updated' },
    })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Preview changes' }))
    const confirmation = await screen.findByRole('alertdialog')
    expect(within(confirmation).getByText('Primary → Primary updated')).toBeVisible()
  })

  it('loads every candidate page before initializing API Key group bindings', async () => {
    const candidates = Array.from({ length: 101 }, (_, index) => ({
      ...secondModel,
      id: `candidate-${index + 1}`,
      modelKey: `candidate-${index + 1}`,
      publicName: `Candidate ${index + 1}`,
      ...(index === 100
        ? {
            credentialBindingId: 'binding-on-page-two',
            credentialBindingVersion: 3,
            credentialGroupId:
              providerRuntime.credentialGroups[0].credentialGroupId,
            credentialGroupName: providerRuntime.credentialGroups[0].name,
            credentialGroupVersionId: providerRuntime.credentialGroups[0].id,
            credentialGroupVersion: 1,
          }
        : {}),
    }))
    apiMocks.getCanvasProviderConfiguration.mockImplementation((query) => {
      if (query.modelScope !== 'ELIGIBLE') return Promise.resolve(providerRuntime)
      const start = (query.page - 1) * query.pageSize
      return Promise.resolve({
        ...providerRuntime,
        models: {
          page: query.page,
          pageSize: query.pageSize,
          total: candidates.length,
          items: candidates.slice(start, start + query.pageSize),
        },
      })
    })

    renderProviderConfiguration()
    await screen.findByText('Provider API Key groups')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage API Key group' })
    )

    const drawer = screen.getByRole('dialog', { name: 'Manage API Key group' })
    expect(
      await within(drawer).findByLabelText('Select model Candidate 101')
    ).toBeChecked()
    expect(apiMocks.getCanvasProviderConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ modelScope: 'ELIGIBLE', page: 2, pageSize: 100 }),
      expect.anything()
    )
  })

  it('keeps selections hidden by filtering and discards a late binding preview after selection changes', async () => {
    let resolvePreview!: (value: Awaited<ReturnType<typeof apiMocks.previewCanvasProviderCredentialBindings>>) => void
    apiMocks.previewCanvasProviderCredentialBindings.mockReturnValue(
      new Promise((resolve) => { resolvePreview = resolve })
    )
    apiMocks.getCanvasProviderConfiguration.mockImplementation((query) =>
      Promise.resolve({
        ...providerRuntime,
        navigationTarget: {
          modelId: model.id,
          bindingStatus: 'BOUND',
        },
        models: {
          page: 1,
          pageSize: 20,
          total: 2,
          items: [model, secondModel].filter((item) =>
            !query.modelName || item.publicName.includes(query.modelName)
          ),
        },
      })
    )
    renderProviderConfiguration({
      providerId: providerRuntime.providers[0].id,
      credentialGroupId: providerRuntime.credentialGroups[0].credentialGroupId,
      credentialGroupVersionId: providerRuntime.credentialGroups[0].id,
      modelId: model.id,
    })
    const firstSelection = await screen.findByLabelText('Select model Image A')
    fireEvent.click(firstSelection)
    fireEvent.click(screen.getByRole('button', { name: 'Column filters' }))
    fireEvent.change(screen.getByPlaceholderText('Model name'), {
      target: { value: 'Image B' },
    })
    await waitFor(() => expect(screen.getByText('Selected models: 1')).toBeVisible())
    fireEvent.click(await screen.findByLabelText('Select model Image B'))
    expect(screen.getByText('Selected models: 2')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /Review model bindings/ }))
    fireEvent.click(screen.getByLabelText('Select model Image B'))
    resolvePreview({
      credentialGroupVersionId: providerRuntime.credentialGroups[0].id,
      targetCredentialGroupName: 'Primary',
      targetCredentialGroupVersion: 1,
      models: [],
    })
    await waitFor(() => expect(apiMocks.previewCanvasProviderCredentialBindings).toHaveBeenCalled())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.getByText('Selected models: 1')).toBeVisible()
  })

  it('renders paged secret-free API Key group changes from the changes endpoint', async () => {
    apiMocks.getCanvasProviderCredentialGroupChanges.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{
        id: 'change-1',
        occurredAt: '2026-09-04T01:00:00.000Z',
        operator: 'Platform Admin',
        type: 'MODEL_REBOUND',
        outcome: 'SUCCESS',
        reason: 'move workload',
        changes: [{ type: 'MODEL_REBOUND', modelName: 'Image A', fromGroup: 'Legacy', toGroup: 'Primary' }, { type: 'KEY_REPLACED' }],
      }],
    })
    renderProviderConfiguration()
    await screen.findByText('Provider API Key groups')
    fireEvent.click(screen.getByRole('button', { name: 'View change history' }))
    const drawer = screen.getByRole('dialog', { name: 'Change history' })
    expect(await within(drawer).findByText('Image A: Legacy → Primary')).toBeVisible()
    expect(within(drawer).getByText('API Key replaced')).toBeVisible()
    expect(within(drawer).getByText(/move workload/)).toBeVisible()
    expect(apiMocks.getCanvasProviderCredentialGroupChanges).toHaveBeenCalledWith(
      providerRuntime.credentialGroups[0].credentialGroupId,
      { page: 1, pageSize: 20 },
      expect.anything()
    )
  })

  it('collects the optional management reason in confirmation and retains it after failure', async () => {
    apiMocks.publishCanvasCredentialGroupManagement.mockRejectedValue({
      response: { data: { code: 'PREVIEW_STALE' } },
    })
    renderProviderConfiguration()
    await screen.findByText('Provider API Key groups')
    fireEvent.click(screen.getByRole('button', { name: 'Manage API Key group' }))
    const drawer = screen.getByRole('dialog', { name: 'Manage API Key group' })
    expect(within(drawer).queryByLabelText('Reason (optional)')).not.toBeInTheDocument()
    await within(drawer).findByText('Image A')
    fireEvent.change(within(drawer).getByLabelText('API Key group'), { target: { value: 'Primary updated' } })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Preview changes' }))
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.change(within(confirmation).getByLabelText('Reason (optional)'), { target: { value: '  reviewed failure  ' } })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Confirm publication' }))
    await waitFor(() => expect(apiMocks.publishCanvasCredentialGroupManagement).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'reviewed failure' })
    ))
    expect(within(confirmation).getByLabelText('Reason (optional)')).toHaveValue('  reviewed failure  ')
  })

  it('accepts a 255-character management reason and rejects 256 characters', async () => {
    apiMocks.publishCanvasCredentialGroupManagement.mockRejectedValue({
      response: { data: { code: 'PREVIEW_STALE' } },
    })
    renderProviderConfiguration()
    await screen.findByText('Provider API Key groups')
    fireEvent.click(screen.getByRole('button', { name: 'Manage API Key group' }))
    const drawer = screen.getByRole('dialog', { name: 'Manage API Key group' })
    await within(drawer).findByText('Image A')
    fireEvent.change(within(drawer).getByLabelText('API Key group'), {
      target: { value: 'Primary updated' },
    })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Preview changes' }))
    const confirmation = await screen.findByRole('alertdialog')
    const reason = within(confirmation).getByLabelText('Reason (optional)')
    fireEvent.change(reason, { target: { value: 'x'.repeat(255) } })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Confirm publication' }))
    await waitFor(() => expect(apiMocks.publishCanvasCredentialGroupManagement).toHaveBeenCalledTimes(1))
    fireEvent.change(reason, { target: { value: 'x'.repeat(256) } })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Confirm publication' }))
    expect(await within(confirmation).findByText('Use no more than 255 characters')).toBeVisible()
    expect(apiMocks.publishCanvasCredentialGroupManagement).toHaveBeenCalledTimes(1)
  })

  it('switches to archived groups without retaining an active group and restores the selected group', async () => {
    const archivedRuntime = {
      ...providerRuntime,
      credentialGroups: [{
        ...providerRuntime.credentialGroups[0],
        lifecycleStatus: 'ARCHIVED',
        archivedAt: '2026-09-04T02:00:00.000Z',
        boundModelCount: 0,
      }],
      models: { page: 1, pageSize: 20, total: 0, items: [] },
    }
    apiMocks.getCanvasProviderConfiguration.mockImplementation((query) =>
      Promise.resolve(query.credentialGroupStatus === 'ARCHIVED' ? archivedRuntime : providerRuntime)
    )
    apiMocks.restoreCanvasCredentialGroup.mockResolvedValue({})
    renderProviderConfiguration({
      providerId: providerRuntime.providers[0].id,
      credentialGroupId: providerRuntime.credentialGroups[0].credentialGroupId,
      credentialGroupVersionId: providerRuntime.credentialGroups[0].id,
      modelId: model.id,
    })
    await screen.findByText('Provider API Key groups')
    fireEvent.click(screen.getByText('Show archived API Key groups'))
    expect(await screen.findByRole('button', { name: 'Restore API Key group' })).toBeVisible()
    expect(apiMocks.getCanvasProviderConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ credentialGroupStatus: 'ARCHIVED' }),
      expect.anything()
    )
    const archivedQuery = apiMocks.getCanvasProviderConfiguration.mock.calls
      .map(([query]) => query)
      .find((query) => query.credentialGroupStatus === 'ARCHIVED')
    expect(archivedQuery).not.toHaveProperty('credentialGroupId')
    expect(archivedQuery).not.toHaveProperty('credentialGroupVersionId')
    expect(archivedQuery).not.toHaveProperty('modelId')
    fireEvent.click(screen.getByRole('button', { name: 'Restore API Key group' }))
    const confirmation = await screen.findByRole('dialog', { name: 'Restore API Key group' })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Confirm restore' }))
    await waitFor(() => expect(apiMocks.restoreCanvasCredentialGroup).toHaveBeenCalled())
  })

  it('shows only the backend environment and separates storage responsibilities', async () => {
    renderRuntime()

    const environment = await screen.findByText('Current environment: UAT')
    expect(environment).toBeVisible()
    expect(environment).toHaveClass('whitespace-nowrap')
    expect(screen.getByRole('tablist')).toHaveClass(
      'flex-nowrap',
      'overflow-x-auto'
    )
    screen
      .getAllByRole('tab')
      .forEach((tab) => expect(tab).toHaveClass('h-8', 'flex-none', 'px-3'))
    expect(
      screen.queryByRole('combobox', { name: 'Environment' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Task media' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByText('canvas-uat-task-media')).toBeVisible()
    expect(
      screen.queryByRole('form', {
        name: 'Publish task media configuration',
      })
    ).not.toBeInTheDocument()
    expect(screen.queryByText('canvas-uat-db-backups')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Update configuration' })
    )
    expect(
      screen.getByRole('form', { name: 'Publish task media configuration' })
    ).toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: 'Database backups' }))
    expect(screen.getByText('canvas-uat-db-backups')).toBeVisible()
    expect(screen.queryByText('canvas-uat-task-media')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('form', {
        name: 'Publish database backup configuration',
      })
    ).not.toBeInTheDocument()
  })

  it('uses a right-side credential sheet with fixed schemes and one API key', async () => {
    renderProviderConfiguration()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add API Key group' })
    )
    const editor = await screen.findByRole('form', {
      name: 'Publish provider API Key group',
    })
    expect(
      screen.getByRole('dialog', { name: 'Add API Key group' })
    ).toBeVisible()

    expect(within(editor).getByLabelText('Provider')).toHaveValue('')
    expect(within(editor).queryByText('bearerAuth')).not.toBeInTheDocument()
    fireEvent.change(within(editor).getByLabelText('Provider'), {
      target: { value: providerRuntime.providers[0].id },
    })
    expect(within(editor).getByText('bearerAuth')).toBeVisible()
    expect(within(editor).getByText('googleApiKey')).toBeVisible()
    expect(within(editor).getAllByLabelText('API Key')).toHaveLength(1)
    fireEvent.change(within(editor).getByLabelText('API Key'), {
      target: { value: 'must-not-cross-providers' },
    })
    fireEvent.change(within(editor).getByLabelText('Provider'), {
      target: { value: '' },
    })
    expect(within(editor).getByLabelText('API Key')).toHaveValue('')
    fireEvent.change(within(editor).getByLabelText('API Key group'), {
      target: { value: 'Unsaved group' },
    })
    expect(within(editor).getByRole('button', { name: 'Next' })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    const discardDialog = await screen.findByRole('dialog', {
      name: 'Discard unsaved changes?',
    })
    fireEvent.click(
      within(discardDialog).getByRole('button', { name: 'Cancel' })
    )
    expect(
      screen.getByRole('dialog', { name: 'Add API Key group' })
    ).toBeVisible()
    fireEvent.click(within(editor).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(
      within(
        await screen.findByRole('dialog', {
          name: 'Discard unsaved changes?',
        })
      ).getByRole('button', { name: 'Discard changes' })
    )
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Add API Key group' })
      ).not.toBeInTheDocument()
    )
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue(
      providerRuntime.providers[0].id
    )
  })

  it('shows specific credential errors and links them to their controls', async () => {
    renderProviderConfiguration()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Add API Key group' })
    )
    const editor = await screen.findByRole('form', {
      name: 'Publish provider API Key group',
    })
    fireEvent.click(within(editor).getByRole('button', { name: 'Next' }))

    const apiKey = within(editor).getByLabelText('API Key')
    const requiredError = await within(editor).findByText('Enter an API Key')
    expect(apiKey).toHaveAttribute('aria-invalid', 'true')
    expect(apiKey).toHaveAttribute('aria-describedby', requiredError.id)

    fireEvent.change(within(editor).getByLabelText('API Key group'), {
      target: { value: 'x'.repeat(192) },
    })
    expect(
      await within(editor).findByText('Use no more than 191 characters')
    ).toBeVisible()
    expect(screen.getByTestId('navigation-guard')).toHaveAttribute(
      'data-active',
      'true'
    )
  })

  it('reviews the exact drawer owner and selects the newly created group', async () => {
    const secondProviderId = '85000000-0000-7000-8000-000000000020'
    const newGroupId = '85000000-0000-7000-8000-000000000021'
    apiMocks.getCanvasProviderConfiguration.mockResolvedValue({
      ...providerRuntime,
      providers: [
        ...providerRuntime.providers,
        {
          id: secondProviderId,
          code: 'provider-b',
          name: 'Provider B',
          credentialSchemes: ['bearerAuth'],
        },
      ],
      credentialGroups: [
        ...providerRuntime.credentialGroups,
        {
          ...providerRuntime.credentialGroups[0],
          id: '85000000-0000-7000-8000-000000000022',
          credentialGroupId: newGroupId,
          providerId: secondProviderId,
          providerCode: 'provider-b',
          name: 'New group',
          boundModelCount: 0,
        },
      ],
    })
    apiMocks.publishCanvasProviderCredentialGroup.mockResolvedValue({
      providerId: secondProviderId,
      credentialGroupId: newGroupId,
    })
    renderProviderConfiguration()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Add API Key group' })
    )
    const editor = await screen.findByRole('form', {
      name: 'Publish provider API Key group',
    })
    fireEvent.change(within(editor).getByLabelText('Provider'), {
      target: { value: secondProviderId },
    })
    fireEvent.change(within(editor).getByLabelText('API Key group'), {
      target: { value: 'New group' },
    })
    fireEvent.change(within(editor).getByLabelText('API Key'), {
      target: { value: 'never-show-this-secret' },
    })
    fireEvent.change(within(editor).getByLabelText('Reason'), {
      target: { value: 'create dedicated group' },
    })
    fireEvent.click(within(editor).getByRole('button', { name: 'Next' }))

    const review = await screen.findByRole('alertdialog')
    expect(review).toHaveTextContent('provider-b · Provider B')
    expect(review).toHaveTextContent('New group')
    expect(review).not.toHaveTextContent('never-show-this-secret')
    fireEvent.click(
      within(review).getByRole('button', { name: 'Confirm publication' })
    )

    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveValue(
        secondProviderId
      )
    )
    expect(screen.getByRole('combobox', { name: 'API Key group' })).toHaveValue(
      newGroupId
    )
  })

  it('warns before a scope switch and consumes stale deep-link targets', async () => {
    const secondProviderId = '85000000-0000-7000-8000-000000000012'
    apiMocks.getCanvasProviderConfiguration.mockResolvedValue({
      ...providerRuntime,
      navigationTarget: { modelId: model.id, bindingStatus: 'BOUND' },
      providers: [
        ...providerRuntime.providers,
        {
          id: secondProviderId,
          code: 'provider-b',
          name: 'Provider B',
          credentialSchemes: ['bearerAuth'],
        },
      ],
    })
    renderProviderConfiguration({
      credentialGroupVersionId: '85000000-0000-7000-8000-000000000003',
      modelId: model.id,
    })

    fireEvent.click(await screen.findByLabelText('Select model Image A'))
    fireEvent.change(screen.getByRole('combobox', { name: 'Provider' }), {
      target: { value: secondProviderId },
    })
    expect(
      await screen.findByRole('heading', { name: 'Discard unsaved changes?' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    await waitFor(() => {
      const switchedQuery = apiMocks.getCanvasProviderConfiguration.mock.calls
        .map(([query]) => query)
        .find((query) => query.providerId === secondProviderId)
      expect(switchedQuery).toBeDefined()
      expect(switchedQuery).not.toHaveProperty('credentialGroupVersionId')
      expect(switchedQuery).not.toHaveProperty('modelId')
    })
  })

  it('requires an explicit credential group before opening an unbound model binding target', async () => {
    apiMocks.getCanvasProviderConfiguration.mockResolvedValue({
      ...providerRuntime,
      navigationTarget: { modelId: model.id, bindingStatus: 'UNBOUND' },
    })
    renderProviderConfiguration({
      providerId: providerRuntime.providers[0].id,
      modelId: model.id,
    })

    const group = await screen.findByRole('combobox', {
      name: 'API Key group',
    })
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalled())
    await waitFor(() => expect(group).toHaveValue(''))
    expect(
      screen.queryByRole('form', { name: /Publish model.*bindings/ })
    ).not.toBeInTheDocument()

    fireEvent.change(group, {
      target: { value: providerRuntime.credentialGroups[0].credentialGroupId },
    })
    expect(
      await screen.findByRole('form', {
        name: /Publish model.*bindings/,
      })
    ).toBeVisible()
    expect(
      await screen.findByLabelText(`Select model ${model.publicName}`)
    ).toBeChecked()
  })

  it('drops an unbound model target when the provider selection changes', async () => {
    const secondProviderId = '85000000-0000-7000-8000-000000000012'
    const secondGroupId = '85000000-0000-7000-8000-000000000013'
    apiMocks.getCanvasProviderConfiguration.mockResolvedValue({
      ...providerRuntime,
      navigationTarget: { modelId: model.id, bindingStatus: 'UNBOUND' },
      providers: [
        ...providerRuntime.providers,
        {
          id: secondProviderId,
          code: 'provider-b',
          name: 'Provider B',
          credentialSchemes: ['bearerAuth'],
        },
      ],
      credentialGroups: [
        ...providerRuntime.credentialGroups,
        {
          ...providerRuntime.credentialGroups[0],
          id: '85000000-0000-7000-8000-000000000014',
          credentialGroupId: secondGroupId,
          providerId: secondProviderId,
          providerCode: 'provider-b',
          name: 'Secondary',
        },
      ],
    })
    renderProviderConfiguration({
      providerId: providerRuntime.providers[0].id,
      modelId: model.id,
    })

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalled())
    fireEvent.change(screen.getByRole('combobox', { name: 'Provider' }), {
      target: { value: secondProviderId },
    })
    const group = screen.getByRole('combobox', { name: 'API Key group' })
    fireEvent.change(group, { target: { value: secondGroupId } })

    await waitFor(() => expect(group).toHaveValue(secondGroupId))
    expect(
      screen.queryByRole('form', { name: /Publish model.*bindings/ })
    ).not.toBeInTheDocument()
  })

  it('turns a stale or missing deep-link target into an actionable error', async () => {
    apiMocks.getCanvasProviderConfiguration.mockRejectedValue({
      response: { data: { code: 'NOT_FOUND' } },
    })

    renderProviderConfiguration({
      credentialGroupVersionId: '85000000-0000-7000-8000-000000000099',
    })

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The configuration no longer exists. Refresh and try again.'
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  it.each([
    ['Task media', 'Publish task media configuration'],
    ['Database backups', 'Publish database backup configuration'],
  ])(
    'protects dirty %s edits when cancelling from its footer',
    async (tab, name) => {
      renderRuntime()
      await screen.findByText('canvas-uat-task-media')
      fireEvent.click(screen.getByRole('tab', { name: tab }))
      fireEvent.click(
        screen.getByRole('button', { name: 'Update configuration' })
      )
      const form = screen.getByRole('form', { name })
      fireEvent.change(within(form).getByLabelText('Reason (optional)'), {
        target: { value: 'Keep this draft' },
      })
      fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(within(form).getByLabelText('Reason (optional)')).toHaveValue(
        'Keep this draft'
      )
      fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Discard changes',
        })
      )
      expect(screen.queryByRole('form', { name })).not.toBeInTheDocument()
      fireEvent.click(
        screen.getByRole('button', { name: 'Update configuration' })
      )
      expect(
        within(screen.getByRole('form', { name })).getByLabelText('Reason (optional)')
      ).toHaveValue('')
      expect(apiMocks.publishCanvasTaskMediaStorage).not.toHaveBeenCalled()
      expect(apiMocks.publishCanvasDatabaseBackupStorage).not.toHaveBeenCalled()
    }
  )

  it('disables storage footer actions while the confirmed publication is pending', async () => {
    apiMocks.publishCanvasTaskMediaStorage.mockReturnValue(
      new Promise(() => {})
    )
    renderRuntime()
    await screen.findByText('canvas-uat-task-media')
    fireEvent.click(
      screen.getByRole('button', { name: 'Update configuration' })
    )
    const form = screen.getByRole('form', {
      name: 'Publish task media configuration',
    })
    for (const [label, value] of [
      ['R2 endpoint', 'https://example.r2.cloudflarestorage.com'],
      ['Task media bucket', 'uat-task-media'],
      ['Access key ID', 'mock-access'],
      ['Secret access key', 'mock-secret'],
      ['Reason (optional)', 'Mock publication'],
    ] as const) {
      fireEvent.change(within(form).getByLabelText(label), {
        target: { value },
      })
    }
    fireEvent.click(
      within(form).getByRole('button', {
        name: 'Review task media publication',
      })
    )
    const review = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(review).getByRole('button', { name: 'Confirm publication' })
    )
    await waitFor(() =>
      expect(apiMocks.publishCanvasTaskMediaStorage).toHaveBeenCalledTimes(1)
    )
    expect(
      within(form).getByRole('button', { name: 'Cancel', hidden: true })
    ).toBeDisabled()
    expect(
      within(form).getByRole('button', {
        name: 'Review task media publication',
        hidden: true,
      })
    ).toBeDisabled()
  })

  it('prefills published task-media values and preserves credentials when only retention changes', async () => {
    apiMocks.publishCanvasTaskMediaStorage.mockResolvedValue({})
    renderRuntime()
    await screen.findByText('canvas-uat-task-media')
    fireEvent.click(
      screen.getByRole('button', { name: 'Update configuration' })
    )
    const form = screen.getByRole('form', {
      name: 'Publish task media configuration',
    })

    expect(within(form).getByLabelText('R2 endpoint')).toHaveValue(
      runtime.taskMedia.endpoint
    )
    expect(within(form).getByLabelText('Task media bucket')).toHaveValue(
      runtime.taskMedia.bucket
    )
    expect(within(form).getByLabelText('Access key ID')).toHaveValue(
      runtime.taskMedia.accessKeyId
    )
    expect(within(form).getByLabelText('Secret access key')).toHaveValue('')
    expect(
      within(form).getByRole('button', {
        name: 'Review task media publication',
      })
    ).toBeDisabled()

    fireEvent.change(within(form).getByLabelText('Output retention hours'), {
      target: { value: '96' },
    })
    fireEvent.click(
      within(form).getByRole('button', {
        name: 'Review task media publication',
      })
    )
    const review = await screen.findByRole('alertdialog')
    expect(within(review).getByText('72 → 96')).toBeVisible()
    fireEvent.click(
      within(review).getByRole('button', { name: 'Confirm publication' })
    )
    await waitFor(() =>
      expect(apiMocks.publishCanvasTaskMediaStorage).toHaveBeenCalledWith(
        {
          outputRetentionHours: 96,
        }
      )
    )
    expect(
      apiMocks.publishCanvasTaskMediaStorage.mock.calls[0]?.[0]
    ).not.toHaveProperty('mediaCredentials')
  })
  it.each([
    ['en', en],
    ['zhCN', zh],
    ['zhTW', zhTW],
    ['ja', ja],
    ['fr', fr],
    ['ru', ru],
    ['vi', vietnamese],
  ] as const)(
    'renders provider selection and API Key validation in %s',
    async (locale, resource) => {
      i18next.addResourceBundle(
        locale,
        'translation',
        resource.translation,
        true,
        true
      )
      await i18next.changeLanguage(locale)
      renderProviderConfiguration()
      fireEvent.click(
        await screen.findByRole('button', {
          name: resource.translation['Add credential group'],
        })
      )
      const editor = await screen.findByRole('form', {
        name: resource.translation['Publish provider credential group'],
      })
      fireEvent.click(
        within(editor).getByRole('button', { name: resource.translation.Next })
      )
      await waitFor(() =>
        expect(
          within(editor).getByLabelText(resource.translation.Provider)
        ).toHaveAccessibleDescription(resource.translation['Select provider'])
      )
      const keyInput = within(editor).getByLabelText('API Key')
      expect(keyInput).toHaveAccessibleDescription(
        resource.translation['Enter an API Key']
      )
      expect(
        within(editor).getByLabelText(resource.translation['Credential group'])
      ).toHaveAccessibleDescription(
        resource.translation['Enter a credential group name']
      )
      expect(
        within(editor).getByLabelText(resource.translation.Reason)
      ).toHaveAccessibleDescription(resource.translation['Enter a reason'])
      expect(
        within(editor).queryByText('Select a provider')
      ).not.toBeInTheDocument()
    }
  )

  it.each([
    ['en', en], ['zhCN', zh], ['zhTW', zhTW], ['ja', ja],
    ['fr', fr], ['ru', ru], ['vi', vietnamese],
  ] as const)('localizes empty storage numbers and optional reasons in %s', async (locale, resource) => {
    i18next.addResourceBundle(locale, 'translation', resource.translation, true, true)
    await i18next.changeLanguage(locale)
    renderRuntime()
    await screen.findByText('canvas-uat-task-media')
    fireEvent.click(screen.getByRole('button', { name: resource.translation['Update configuration'] }))
    const form = screen.getByRole('form', { name: resource.translation['Publish task media configuration'] })
    expect(within(form).getByLabelText(resource.translation['Reason (optional)'])).toBeVisible()
    fireEvent.change(within(form).getByLabelText(resource.translation['Input retention hours']), { target: { value: '' } })
    fireEvent.click(within(form).getByRole('button', { name: resource.translation['Review task media publication'] }))
    await waitFor(() => expect(
      within(form).getByLabelText(resource.translation['Input retention hours'])
    ).toHaveAccessibleDescription(resource.translation['Enter a number']))
  })
})
