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
  getCanvasRuntimeConfiguration: vi.fn(),
  previewCanvasProviderCredentialBindings: vi.fn(),
  publishCanvasDatabaseBackupStorage: vi.fn(),
  publishCanvasProviderCredentialGroup: vi.fn(),
  publishCanvasTaskMediaStorage: vi.fn(),
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

  it('shows ownership and latest checks without ever redisplaying secret values', async () => {
    renderProviderConfiguration()

    expect(await screen.findByText('Provider API Key groups')).toBeVisible()
    expect(screen.getAllByText(/Platform Admin/)).not.toHaveLength(0)
    expect(screen.getByText('Unable to verify')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Check access permission' })
    ).toBeVisible()
    expect(screen.queryByText(/stored-secret/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/secret/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Replace API Key' }))
    await waitFor(() => expect(screen.getByLabelText('API Key')).toHaveFocus())
    expect(screen.getByLabelText('API Key')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('API Key')).toHaveValue('')
    expect(
      screen
        .getAllByLabelText('Provider')
        .find((element) => element.hasAttribute('disabled'))
    ).toBeDisabled()
    expect(
      screen
        .getAllByLabelText('API Key group')
        .find((element) => element.tagName === 'INPUT')
    ).toBeDisabled()
  })

  it('cancels credential replacement and model binding edits without publishing', async () => {
    renderProviderConfiguration()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Replace API Key' })
    )
    const credentialEditor = await screen.findByRole('form', {
      name: 'Publish provider API Key group',
    })
    fireEvent.change(within(credentialEditor).getByLabelText('API Key'), {
      target: { value: 'do-not-publish' },
    })
    fireEvent.click(
      within(credentialEditor).getByRole('button', { name: 'Cancel' })
    )
    expect(credentialEditor).not.toBeInTheDocument()
    expect(apiMocks.getCanvasCredentialRotationPreview).toHaveBeenCalledTimes(1)
    expect(apiMocks.publishCanvasProviderCredentialGroup).not.toHaveBeenCalled()

    fireEvent.click(
      screen.getByRole('button', { name: 'Manage model bindings' })
    )
    const bindingEditor = await screen.findByRole('form', {
      name: 'Publish model API Key group bindings',
    })
    fireEvent.click(await screen.findByLabelText('Select model Image A'))
    fireEvent.click(
      within(bindingEditor).getByRole('button', { name: 'Cancel' })
    )
    expect(bindingEditor).not.toBeInTheDocument()
    expect(screen.getByText('Bound models (1)')).toBeVisible()
    expect(
      apiMocks.previewCanvasProviderCredentialBindings
    ).not.toHaveBeenCalled()
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

  it('previews credential rotation impact and fixes model binding to the open group', async () => {
    renderProviderConfiguration()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Replace API Key' })
    )
    fireEvent.change(await screen.findByLabelText('API Key'), {
      target: { value: 'replacement-one' },
    })
    fireEvent.change(screen.getByLabelText('Reason'), {
      target: { value: 'rotate credentials' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Review API Key group publication' })
    )

    const rotationDialog = await screen.findByRole('alertdialog')
    expect(rotationDialog).toHaveTextContent('v1 → v2')
    expect(rotationDialog).toHaveTextContent('Image A')
    fireEvent.click(
      within(rotationDialog).getByRole('button', {
        name: 'Confirm publication',
      })
    )
    await waitFor(() =>
      expect(
        apiMocks.publishCanvasProviderCredentialGroup
      ).toHaveBeenCalledWith({
        providerId: '85000000-0000-7000-8000-000000000001',
        credentialGroupId: '85000000-0000-7000-8000-000000000004',
        name: 'Primary',
        apiKey: 'replacement-one',
        expectedCredentialGroupVersionId:
          '85000000-0000-7000-8000-000000000003',
        expectedBindings: [
          {
            customerModelId: model.id,
            bindingId: model.credentialBindingId,
            bindingVersion: model.credentialBindingVersion,
          },
        ],
        reason: 'rotate credentials',
      })
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Manage model bindings' })
    )
    expect(screen.getByText('Binding target: Primary v1')).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'API Key group' })).toHaveValue(
      '85000000-0000-7000-8000-000000000004'
    )
    fireEvent.click(await screen.findByLabelText('Select model Image A'))
    expect(screen.getByLabelText('Reason (optional)')).toBeVisible()
    fireEvent.click(
      screen.getByRole('button', { name: /Review model bindings/ })
    )
    const bindingDialog = await screen.findByRole('alertdialog')
    expect(bindingDialog).toHaveTextContent('Model name')
    expect(bindingDialog).toHaveTextContent('Current group and version')
    expect(bindingDialog).toHaveTextContent('Target group and version')
    expect(bindingDialog).toHaveTextContent('Image A')
    expect(bindingDialog).toHaveTextContent('Primary v1')
    fireEvent.click(
      within(bindingDialog).getByRole('button', { name: 'Confirm publication' })
    )
    await waitFor(() =>
      expect(apiMocks.bindCanvasProviderCredentials).toHaveBeenCalledWith({
        credentialGroupVersionId: '85000000-0000-7000-8000-000000000003',
        customerModelIds: ['85000000-0000-7000-8000-000000000005'],
        expectedBindings: [
          {
            customerModelId: '85000000-0000-7000-8000-000000000005',
            bindingId: '85000000-0000-7000-8000-000000000008',
            bindingVersion: 1,
          },
        ],
      })
    )
  })

  it('preserves a supplied optional binding reason and enforces its maximum length', async () => {
    renderProviderConfiguration()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage model bindings' })
    )
    fireEvent.click(await screen.findByLabelText('Select model Image A'))
    const reason = screen.getByLabelText('Reason (optional)')
    fireEvent.change(reason, { target: { value: 'x'.repeat(256) } })
    fireEvent.click(
      screen.getByRole('button', { name: /Review model bindings/ })
    )
    expect(
      apiMocks.previewCanvasProviderCredentialBindings
    ).not.toHaveBeenCalled()

    fireEvent.change(reason, {
      target: { value: 'Move to the primary credential group' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /Review model bindings/ })
    )
    const bindingDialog = await screen.findByRole('alertdialog')
    fireEvent.click(
      within(bindingDialog).getByRole('button', { name: 'Confirm publication' })
    )
    await waitFor(() =>
      expect(apiMocks.bindCanvasProviderCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Move to the primary credential group',
        })
      )
    )
  })

  it('adds and removes only the current filtered page while preserving hidden selections', async () => {
    apiMocks.getCanvasProviderConfiguration.mockImplementation(
      async (query: { modelName?: string }) => ({
        ...providerRuntime,
        models: {
          page: 1,
          pageSize: 20,
          total: 1,
          items: query.modelName ? [secondModel] : [model],
        },
      })
    )
    renderProviderConfiguration()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage model bindings' })
    )
    fireEvent.click(await screen.findByLabelText('Select model Image A'))
    expect(screen.getByText('Selected models: 1')).toBeVisible()

    const eligibleModels = screen.getByRole('region', {
      name: 'Eligible models',
    })
    fireEvent.click(
      within(eligibleModels).getByRole('button', { name: 'Column filters' })
    )
    fireEvent.change(screen.getByPlaceholderText('Model name'), {
      target: { value: 'Image B' },
    })
    expect(await screen.findByText('Image B')).toBeVisible()
    const currentPage = screen.getByRole('checkbox', {
      name: /Select this page/,
    })
    fireEvent.click(currentPage)
    expect(screen.getByText('Selected models: 2')).toBeVisible()
    fireEvent.click(currentPage)
    expect(screen.getByText('Selected models: 1')).toBeVisible()
  })

  it('loads affected models only after a visible history row is expanded', async () => {
    apiMocks.getCanvasProviderCredentialHistory.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        {
          ...providerRuntime.credentialGroups[0],
          affectedModelCount: 1,
        },
      ],
    })
    apiMocks.getCanvasCredentialVersionAffectedModels.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      factAvailable: true,
      items: [{ id: model.id, publicName: model.publicName }],
    })

    renderProviderConfiguration()

    expect(await screen.findByText('v1 · Current')).toBeVisible()
    expect(
      apiMocks.getCanvasCredentialVersionAffectedModels
    ).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand affected models' })
    )
    expect(await screen.findByText('Image A')).toBeVisible()
    expect(
      apiMocks.getCanvasCredentialVersionAffectedModels
    ).toHaveBeenCalledWith(
      '85000000-0000-7000-8000-000000000003',
      { page: 1, pageSize: 20 },
      expect.anything()
    )
  })

  it('keeps the daily model table concise and expands binding history from the model name', async () => {
    renderProviderConfiguration()

    const heading = await screen.findByText('Bound models (1)')
    expect(heading).toBeVisible()
    const tableRegion = heading.closest('section')
    expect(tableRegion).not.toBeNull()
    if (!tableRegion) throw new Error('Bound models section is missing')
    expect(
      within(tableRegion).queryByRole('columnheader', { name: 'Model key' })
    ).not.toBeInTheDocument()
    expect(
      within(tableRegion).queryByRole('columnheader', { name: 'Status' })
    ).not.toBeInTheDocument()
    expect(
      within(tableRegion).queryByRole('columnheader', { name: 'Actions' })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Image A' }))
    expect(await screen.findByLabelText('Binding history')).toBeVisible()
    expect(
      apiMocks.getCanvasModelCredentialBindingHistory
    ).toHaveBeenCalledWith(
      model.id,
      { page: 1, pageSize: 20 },
      expect.anything()
    )
  })

  it('keeps the current credential group visible while selecting binding candidates', async () => {
    renderProviderConfiguration()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage model bindings' })
    )
    expect(
      screen.getByRole('columnheader', { name: 'Current API Key group' })
    ).toBeVisible()
    expect(
      screen.getByRole('region', { name: 'Eligible models' })
    ).toHaveTextContent('Primary v1')
  })

  it('locates, highlights, and expands an off-page version target', async () => {
    const historicalVersionId = '85000000-0000-7000-8000-000000000011'
    apiMocks.getCanvasProviderCredentialHistory.mockResolvedValue({
      page: 3,
      pageSize: 20,
      total: 41,
      items: [
        {
          ...providerRuntime.credentialGroups[0],
          id: historicalVersionId,
          version: 1,
          reason: 'historical rotation',
          affectedModelCount: 1,
        },
      ],
    })
    apiMocks.getCanvasCredentialVersionAffectedModels.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      factAvailable: true,
      items: [{ id: model.id, publicName: model.publicName }],
    })

    renderProviderConfiguration({
      credentialGroupVersionId: historicalVersionId,
    })

    await waitFor(() =>
      expect(apiMocks.getCanvasProviderConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialGroupVersionId: historicalVersionId,
        }),
        expect.anything()
      )
    )
    await waitFor(() =>
      expect(apiMocks.getCanvasProviderCredentialHistory).toHaveBeenCalledWith(
        '85000000-0000-7000-8000-000000000004',
        expect.objectContaining({ targetVersionId: historicalVersionId }),
        expect.anything()
      )
    )
    await waitFor(() =>
      expect(
        apiMocks.getCanvasCredentialVersionAffectedModels
      ).toHaveBeenCalledWith(
        historicalVersionId,
        { page: 1, pageSize: 20 },
        expect.anything()
      )
    )
    expect(
      document.querySelector(`#credential-version-${historicalVersionId}`)
    ).toHaveClass('bg-primary/10')
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

  it('discards a late binding preview after the selected models change', async () => {
    let resolvePreview!: (value: CanvasModelBindingPreview) => void
    apiMocks.previewCanvasProviderCredentialBindings.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreview = resolve
      })
    )
    renderProviderConfiguration()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Manage model bindings' })
    )
    fireEvent.click(await screen.findByLabelText('Select model Image A'))
    fireEvent.click(
      screen.getByRole('button', { name: /Review model bindings/ })
    )
    fireEvent.click(screen.getByLabelText('Select model Image A'))
    resolvePreview({
      credentialGroupVersionId: providerRuntime.credentialGroups[0].id,
      targetCredentialGroupName: 'Primary',
      targetCredentialGroupVersion: 1,
      models: [],
    })

    await waitFor(() =>
      expect(
        apiMocks.previewCanvasProviderCredentialBindings
      ).toHaveBeenCalled()
    )
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('discards a late rotation preview after the provider scope changes', async () => {
    const secondProviderId = '85000000-0000-7000-8000-000000000012'
    let resolvePreview!: (value: CanvasCredentialRotationPreview) => void
    apiMocks.getCanvasCredentialRotationPreview.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreview = resolve
      })
    )
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
    })
    renderProviderConfiguration()

    fireEvent.click(
      await screen.findByRole('button', { name: 'Replace API Key' })
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Provider' }), {
      target: { value: secondProviderId },
    })
    resolvePreview({
      credentialGroupId: providerRuntime.credentialGroups[0].credentialGroupId,
      providerId: providerRuntime.providers[0].id,
      name: 'Primary',
      currentCredentialGroupVersionId: providerRuntime.credentialGroups[0].id,
      currentVersion: 1,
      nextVersion: 2,
      affectedModels: [],
    })

    await waitFor(() =>
      expect(apiMocks.getCanvasCredentialRotationPreview).toHaveBeenCalled()
    )
    expect(
      screen.queryByRole('form', { name: 'Publish provider API Key group' })
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

  it('reports a verified model permission check without exposing credentials', async () => {
    apiMocks.checkCanvasCustomerModelAccessPermission.mockResolvedValue({
      outcome: 'PASSED',
      reasonCode: null,
      checkedAt: '2026-09-04T00:03:00.000Z',
    })
    renderProviderConfiguration()

    await screen.findByText('Provider API Key groups')
    fireEvent.click(
      screen.getByRole('button', { name: 'Check access permission' })
    )

    await waitFor(() =>
      expect(toastMocks.success).toHaveBeenCalledWith(
        'Access permission verified'
      )
    )
    expect(
      apiMocks.checkCanvasCustomerModelAccessPermission
    ).toHaveBeenCalledWith(model.id, expect.anything())
    expect(screen.queryByText(/stored-secret/i)).not.toBeInTheDocument()
  })

  it('keeps unsupported model permission checks explicitly unverifiable', async () => {
    apiMocks.checkCanvasCustomerModelAccessPermission.mockResolvedValue({
      outcome: 'UNVERIFIABLE',
      reasonCode: 'MODEL_ACCESS_CHECK_UNSUPPORTED',
      checkedAt: '2026-09-04T00:03:00.000Z',
    })
    renderProviderConfiguration()

    await screen.findByText('Provider API Key groups')
    fireEvent.click(
      screen.getByRole('button', { name: 'Check access permission' })
    )

    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith('Unable to verify')
    )
    expect(
      apiMocks.checkCanvasCustomerModelAccessPermission
    ).toHaveBeenCalledWith(model.id, expect.anything())
    expect(toastMocks.success).not.toHaveBeenCalled()
    expect(apiMocks.getCanvasProviderConfiguration).toHaveBeenCalledTimes(2)
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
      fireEvent.change(within(form).getByLabelText('Reason'), {
        target: { value: 'Keep this draft' },
      })
      fireEvent.click(within(form).getByRole('button', { name: 'Cancel' }))
      const dialog = await screen.findByRole('dialog')
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
      expect(within(form).getByLabelText('Reason')).toHaveValue(
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
        within(screen.getByRole('form', { name })).getByLabelText('Reason')
      ).toHaveValue('')
      expect(apiMocks.publishCanvasTaskMediaStorage).not.toHaveBeenCalled()
      expect(apiMocks.publishCanvasDatabaseBackupStorage).not.toHaveBeenCalled()
    }
  )

  it('keeps replacement in the card footer and binding submission after the model table', async () => {
    renderProviderConfiguration()
    await screen.findByText('Provider API Key groups')
    expect(
      screen
        .getByRole('button', { name: 'Replace API Key' })
        .closest('[data-slot="card-footer"]')
    ).not.toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Manage model bindings' })
    )
    const form = screen.getByRole('form', {
      name: 'Publish model API Key group bindings',
    })
    const section = form.closest('section')
    if (!section) {
      throw new Error('Binding editor must belong to the model list')
    }
    expect(
      within(section).getByRole('table').compareDocumentPosition(form) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    const review = within(form).getByRole('button', {
      name: /Review model bindings/,
    }) as HTMLButtonElement
    expect(review.form).toBe(form)
  })
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
      ['Reason', 'Mock publication'],
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
})
