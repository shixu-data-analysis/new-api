import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminModelCatalog } from '../AdminModelCatalog'

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  publish: vi.fn(),
  published: vi.fn(),
  tags: vi.fn(),
  priceGroups: vi.fn(),
  presentation: vi.fn(),
  targetPresentation: vi.fn(),
  navigate: vi.fn(),
  toastSuccess: vi.fn(),
}))
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useNavigate: () => mocks.navigate,
}))
vi.mock('../UnifiedModelPricing', () => ({
  UnifiedModelPricing: (props: {
    initialModelId?: string
    onBack: () => void
  }) => (
    <div>
      Selected pricing: {props.initialModelId}
      <button type='button' onClick={props.onBack}>
        Return to models
      </button>
    </div>
  ),
}))
vi.mock('../ModelMonitoringOverview', () => ({
  ModelMonitoringOverview: () => <div>Logical model monitoring overview</div>,
}))
vi.mock('../../api', () => ({
  planCanvasModelCatalogImport: mocks.plan,
  publishCanvasModelCatalogImport: mocks.publish,
  getCanvasAdminTestingModels: mocks.published,
  getCanvasAdminModelTags: mocks.tags,
  getCanvasPriceGroups: mocks.priceGroups,
  publishCanvasModelPresentation: mocks.presentation,
  publishCanvasExecutionTargetPresentation: mocks.targetPresentation,
}))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }))

const ADMIN_ONE_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_TWO_ID = '22222222-2222-4222-8222-222222222222'
const IMPORT_ONE_ID = '33333333-3333-4333-8333-333333333333'
const IMPORT_TWO_ID = '44444444-4444-4444-8444-444444444444'
const IMPORT_CURRENT_ID = '55555555-5555-4555-8555-555555555555'
const IMPORT_OLD_ID = '66666666-6666-4666-8666-666666666666'
const PLAN_TOKEN_ONE = 'a'.repeat(64)

function catalogFile(path: string, value: unknown): File {
  const file = new File(
    [JSON.stringify(value)],
    path.split('/').at(-1) ?? path,
    {
      type: 'application/json',
    }
  )
  Object.defineProperty(file, 'webkitRelativePath', { value: `bundle/${path}` })
  return file
}

function sourceFileWithBytes(path: string, bytes: Uint8Array): File {
  const content = new Uint8Array(bytes.byteLength)
  content.set(bytes)
  const file = new File([content.buffer], path.split('/').at(-1) ?? path)
  Object.defineProperty(file, 'webkitRelativePath', { value: `bundle/${path}` })
  return file
}

const manifest = {
  schemaVersion: 2,
  bundleId: 'canvas.test',
  bundleVersion: '1',
  providers: 'providers.json',
  channels: 'channels.json',
  models: 'models.json',
  openapiContracts: ['openapi/test.openapi.json'],
  adapterProfiles: ['profiles/test.profile.json'],
}

const modelDefinition = {
  productKey: 'canvas.image.test',
  displayName: 'Client model',
  capability: 'image.generate',
  release: {
    channelId: 'test-channel',
    execution: { providerModel: { modelId: 'upstream-test' } },
    publicInteraction: {
      defaultParams: {},
      paramSchema: {},
      referenceLimits: {},
    },
  },
  sourceKind: 'relay',
}

const unboundCredential = {
  status: 'NEEDS_BINDING',
  reasonCode: 'UNBOUND_SOURCE',
  sourceBindingId: null,
  sourceModelId: null,
  credentialGroupVersionId: null,
  credentialGroupName: null,
}

const importPlanFields = {
  importId: IMPORT_ONE_ID,
  sourceSha256: '1'.repeat(64),
  validatedBundleSha256: '2'.repeat(64),
  validatorVersion: 1,
  expiresAt: '2099-09-23T00:00:00.000Z',
}

function catalogPlan(overrides: Record<string, unknown> = {}) {
  return {
    ...importPlanFields,
    bundleId: 'canvas.test',
    bundleVersion: '1',
    manifestSha256: '3'.repeat(64),
    planToken: PLAN_TOKEN_ONE,
    pricingSummary: { reused: 0, needsPricing: 0 },
    action: 'PUBLISH',
    blocking: false,
    diagnostics: [],
    models: [],
    changes: [
      {
        resourceType: 'CUSTOMER_MODEL',
        key: 'canvas.image.test',
        action: 'CREATE',
        currentVersion: null,
        proposedVersion: 1,
        detail: {},
      },
    ],
    ...overrides,
  }
}

function bundleFiles(
  model: unknown,
  profile: Record<string, unknown> = { schemaVersion: 1 }
) {
  return [
    catalogFile('manifest.json', manifest),
    catalogFile('providers.json', { schemaVersion: 2, providers: [] }),
    catalogFile('channels.json', { schemaVersion: 2, channels: [] }),
    catalogFile('models.json', { schemaVersion: 2, models: [model] }),
    catalogFile('openapi/test.openapi.json', { openapi: '3.0.0' }),
    catalogFile('profiles/test.profile.json', profile),
  ]
}

describe('Canvas model catalog folder upload', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('en')
    i18next.addResource(
      'en',
      'translation',
      'catalog.catalog_source_json_invalid',
      'A catalog source file is not valid JSON.'
    )
    i18next.addResource(
      'zh',
      'translation',
      'catalog.mediaConstraint.invalidFrameRate',
      '帧率必须至少为 {{minimum}}，当前值为 {{actual}}。'
    )
    mocks.plan.mockReset()
    mocks.publish.mockReset()
    mocks.published.mockReset()
    mocks.published.mockResolvedValue([])
    mocks.tags.mockReset()
    mocks.tags.mockResolvedValue([])
    mocks.priceGroups.mockReset()
    mocks.priceGroups.mockResolvedValue([])
    mocks.presentation.mockReset()
    mocks.targetPresentation.mockReset()
    mocks.toastSuccess.mockReset()
  })
  it('shows published models, import, and model-level monitoring as three primary tabs', async () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    expect(screen.getByRole('tab', { name: 'Model list' })).toBeVisible()
    expect(
      screen.getByRole('tab', { name: 'Import and publish' })
    ).toBeVisible()
    fireEvent.click(screen.getByRole('tab', { name: 'Runtime monitoring' }))
    expect(
      await screen.findByText('Logical model monitoring overview')
    ).toBeVisible()
  })
  it('carries one selected model into pricing and preserves list filters and pagination on return', async () => {
    mocks.published.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({
        id: `model-${index}`,
        modelKey: `model-${index}`,
        tags: [],
        modelIds: [],
        executionTargets: [],
        version: 1,
        name: `Series ${String(index).padStart(2, '0')}`,
        description: '',
        enabled: true,
        resourceEnabled: true,
        presentationVersion: null,
        status: 'ACTIVE',
        customerVisible: false,
        pricedTargets: 0,
        totalTargets: 1,
        provider: { id: 'provider-api', code: 'api', name: 'API provider' },
        channel: {
          code: 'api',
          version: 1,
          status: 'ACTIVE',
          protocolAdapter: 'openai',
          upstreamModel: 'x',
          executionSnapshot: {},
        },
        publicCatalogSnapshot: { capability: 'image.generate' },
        parameterCombinations: [],
        pricingTargets: [],
        createdAt: '2026-09-08T00:00:00Z',
        effectiveAt: null,
      }))
    )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const page = (modelId?: string) => (
      <QueryClientProvider client={client}>
        <AdminModelCatalog
          principalId={ADMIN_ONE_ID}
          initialPricingModelId={modelId}
        />
      </QueryClientProvider>
    )
    const view = render(page())
    await screen.findByText('Series 00')
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    fireEvent.change(screen.getByPlaceholderText('Model'), {
      target: { value: 'Series' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    await screen.findByText('Series 20')
    fireEvent.click(screen.getByRole('button', { name: 'Manage prices' }))
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: '/canvas-cloud/$section',
      params: { section: 'pricing' },
      search: { modelId: 'model-20' },
    })
    view.rerender(page('model-20'))
    expect(screen.getByText('Selected pricing: model-20')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Manage prices' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Return to models' }))
    expect(mocks.navigate).toHaveBeenLastCalledWith({
      to: '/canvas-cloud/$section',
      params: { section: 'catalog' },
      search: {},
    })
    view.rerender(page())
    expect(screen.getByText('Series 20')).toBeVisible()
    expect(screen.queryByText('Series 00')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Column filters/ }))
    expect(screen.getByPlaceholderText('Model')).toHaveValue('Series')
    client.clear()
  })
  it('submits invalid JSON to Cloud and localizes its file-level diagnostic', async () => {
    mocks.plan.mockRejectedValue({
      response: {
        data: {
          message: 'Catalog validation failed',
          diagnostics: [
            {
              code: 'CATALOG_SOURCE_JSON_INVALID',
              severity: 'BLOCKING',
              sourceFile: 'models.json',
              jsonPath: '$',
              valueSummary: 'File is not valid JSON.',
              capability: 'catalog.import.schema-v1',
              ownerModule: 'model-catalog',
              recommendation:
                'Correct the source file and create a new import plan.',
              internalTestingAllowed: false,
              messageKey: 'catalog.catalog_source_json_invalid',
              params: {},
            },
          ],
        },
      },
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: {
        files: [sourceFileWithBytes('models.json', Uint8Array.from([0xff]))],
      },
    })
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(1))
    expect(mocks.plan).toHaveBeenCalledWith(
      {
        schemaVersion: 1,
        files: [{ path: 'models.json', contentBase64: '/w==' }],
      },
      expect.any(Object)
    )
    expect(await screen.findByText(/models.json/)).toHaveTextContent('Path: $')
    expect(screen.getByText(/models.json/)).toHaveTextContent(
      'Reason: A catalog source file is not valid JSON. · File is not valid JSON.'
    )
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('interpolates a non-English Cloud diagnostic and disables publication', async () => {
    await i18next.changeLanguage('zh')
    mocks.plan.mockResolvedValue(
      catalogPlan({
        diagnostics: [
          {
            code: 'CATALOG_SCHEMA_INVALID',
            severity: 'BLOCKING',
            sourceFile: 'models.json',
            jsonPath:
              'models[24].release.publicInteraction.mediaConstraints.video.maxFrameRate',
            valueSummary: 'Expected number to be greater than or equal to 1',
            capability: 'video.generate',
            ownerModule: 'model-catalog',
            recommendation:
              'Correct the invalid model capability field before publication.',
            internalTestingAllowed: false,
            messageKey: 'catalog.mediaConstraint.invalidFrameRate',
            params: { minimum: 1, actual: 0 },
          },
        ],
      })
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files: bundleFiles(modelDefinition) },
    })

    expect(await screen.findByText(/models.json/)).toHaveTextContent(
      'Path: models[24].release.publicInteraction.mediaConstraints.video.maxFrameRate'
    )
    expect(screen.getByText(/models.json/)).toHaveTextContent(
      'Reason: 帧率必须至少为 1，当前值为 0。 · Expected number to be greater than or equal to 1'
    )
    expect(
      screen.getByRole('button', { name: 'Review and publish' })
    ).toBeDisabled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('uses the exact Cloud fallback for a truly unknown diagnostic key', async () => {
    mocks.plan.mockRejectedValue({
      response: {
        data: {
          diagnostics: [
            {
              code: 'CATALOG_FUTURE_RULE',
              severity: 'BLOCKING',
              sourceFile: 'models.json',
              jsonPath: '$.models[0].futureField',
              valueSummary: 'Cloud value summary',
              capability: 'catalog.future',
              ownerModule: 'model-catalog',
              recommendation: 'Cloud recommendation',
              internalTestingAllowed: false,
              messageKey: 'catalog.future.unknown',
              params: { ignored: 'value' },
            },
          ],
        },
      },
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files: bundleFiles(modelDefinition) },
    })

    expect(await screen.findByText(/models.json/)).toHaveTextContent(
      'Reason: Cloud recommendation · Cloud value summary'
    )
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('shows server-planned changes and an explicit page indicator after folder selection', async () => {
    mocks.publish.mockRejectedValue({
      response: {
        data: {
          message: 'Bundle publication rejected',
          diagnostics: [
            {
              code: 'TEMPLATE_INVALID',
              sourceFile: 'profiles/test.profile.json',
              jsonPath:
                '$.adapterProfiles[0].profile.advanced.request.body.first_image',
              profileKey: 'z5api.seedance@1.0.0',
              operation: 'submitVideo',
              templateReason: 'UNSUPPORTED_FUNCTION',
              recommendation: 'Fix the template',
            },
          ],
        },
      },
    })
    mocks.plan.mockResolvedValue({
      ...importPlanFields,
      bundleId: 'canvas.test',
      bundleVersion: '1',
      manifestSha256: 'a'.repeat(64),
      planToken: PLAN_TOKEN_ONE,
      pricingSummary: { reused: 1, needsPricing: 1 },
      action: 'PUBLISH',
      blocking: false,
      diagnostics: [],
      models: [
        {
          productKey: 'canvas.image.preview',
          displayName: 'Client preview model',
          channelId: 'test-channel',
          providerId: 'test-provider',
          capability: 'image.generate',
          action: 'CREATE',
          currentVersion: null,
          proposedVersion: 1,
          customerVisibleAfterPublish: false,
          credential: {
            status: 'REUSE',
            reasonCode: 'MATCHED_PUBLISHED_BINDING',
            sourceBindingId: 'binding-1',
            sourceModelId: 'model-1',
            credentialGroupVersionId: 'group-version-1',
            credentialGroupName: 'Test group',
          },
          publicInteraction: {
            defaultParams: { quality: '2K' },
            paramSchema: { qualities: ['1K', '2K'] },
            referenceLimits: { maxImageReferences: 4 },
          },
          pricing: [
            {
              combinationKey: '480p',
              label: '480P',
              parameters: { quality: '480P' },
              billingDimensions: { billingUnit: 'REQUEST' },
              priceGroupId: 'standard',
              priceGroupCode: 'standard',
              priceGroupName: 'Standard',
              status: 'REUSE',
              reasonCode: 'MATCHED_PUBLISHED_PRICE',
              billingUnit: 'REQUEST',
              points: '450',
              tokenRates: null,
              sourcePriceVersionId: 'price-version-1',
              sourceProviderRateVersionId: 'provider-rate-version-1',
              sourceModelVersion: 1,
              effectiveAt: null,
            },
            {
              combinationKey: '720p',
              label: '720P',
              parameters: { quality: '720P' },
              billingDimensions: { billingUnit: 'REQUEST' },
              priceGroupId: 'standard',
              priceGroupCode: 'standard',
              priceGroupName: 'Standard',
              status: 'NEEDS_PRICING',
              reasonCode: 'NEW_SPECIFICATION',
              billingUnit: 'REQUEST',
              points: null,
              tokenRates: null,
              sourcePriceVersionId: null,
              sourceProviderRateVersionId: null,
              sourceModelVersion: null,
              effectiveAt: null,
            },
          ],
        },
        ...Array.from({ length: 20 }, (_, index) => ({
          productKey: `canvas.image.extra-${index + 1}`,
          displayName: `Additional client model ${index + 1}`,
          channelId: 'test-channel',
          providerId: 'test-provider',
          capability: 'image.generate',
          action: 'NO_OP',
          currentVersion: 1,
          proposedVersion: null,
          customerVisibleAfterPublish: false,
          credential: unboundCredential,
          publicInteraction: {
            defaultParams: {},
            paramSchema: {},
            referenceLimits: {},
          },
          pricing: [],
        })),
      ],
      changes: Array.from({ length: 21 }, (_, index) => ({
        resourceType: 'CUSTOMER_MODEL',
        key: `model-${index + 1}`,
        action: 'CREATE',
        currentVersion: null,
        proposedVersion: 1,
        detail: {},
      })),
    })
    const files = [
      catalogFile('manifest.json', manifest),
      catalogFile('providers.json', { schemaVersion: 2, providers: [] }),
      catalogFile('channels.json', { schemaVersion: 2, channels: [] }),
      catalogFile('models.json', {
        schemaVersion: 2,
        models: [
          { ...modelDefinition, description: 'Default customer description' },
        ],
      }),
      catalogFile('openapi/test.openapi.json', { openapi: '3.0.0' }),
      catalogFile('profiles/test.profile.json', {
        schemaVersion: 1,
        templateLanguageVersion: 1,
      }),
    ]
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files },
    })
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(1))
    const plannedSource = mocks.plan.mock.calls[0]?.[0]
    expect(plannedSource).toEqual({
      schemaVersion: 1,
      files: expect.arrayContaining([
        expect.objectContaining({ path: 'models.json' }),
        expect.objectContaining({ path: 'profiles/test.profile.json' }),
      ]),
    })
    expect(await screen.findByText('Client preview model')).toBeInTheDocument()
    screen
      .getAllByRole('tablist')
      .forEach((tabList) =>
        expect(tabList).toHaveClass('w-full', 'flex-nowrap', 'overflow-x-auto')
      )
    screen
      .getAllByRole('tab')
      .forEach((tab) => expect(tab).toHaveClass('flex-none'))
    expect(screen.getByText('canvas.image.preview')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'View details' })[0])
    expect(
      screen.getByText('Published binding carried forward')
    ).toBeInTheDocument()
    expect(screen.getByText(/API Key group: Test group/)).toBeInTheDocument()
    expect(screen.getByText(/450 points \/ /)).toBeInTheDocument()
    expect(
      screen.getByText('New specification has no matching price')
    ).toBeInTheDocument()
    expect(
      screen.getByText('Source price version: price-version-1')
    ).toBeInTheDocument()
    const modelPanel = screen.getByRole('tabpanel', {
      name: 'Client model preview (21)',
    })
    expect(within(modelPanel).getByText('Page 1 of 2')).toBeVisible()
    fireEvent.click(
      within(modelPanel).getByRole('button', { name: 'Go to next page' })
    )
    expect(within(modelPanel).getByText('Page 2 of 2')).toBeVisible()
    expect(screen.getByText('Additional client model 20')).toBeVisible()
    expect(
      screen.queryByText('Source price version: price-version-1')
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Database plan (21)' }))
    const databasePanel = screen.getByRole('tabpanel', {
      name: 'Database plan (21)',
    })
    expect(await screen.findByText('model-1')).toBeInTheDocument()
    expect(screen.queryByText('model-21')).not.toBeInTheDocument()
    expect(within(databasePanel).getByText('Page 1 of 2')).toBeInTheDocument()
    expect(within(databasePanel).getByText('21')).toBeInTheDocument()
    fireEvent.click(
      within(databasePanel).getByRole('button', { name: 'Go to next page' })
    )
    expect(within(databasePanel).getByText('Page 2 of 2')).toBeVisible()
    const pageSize = within(databasePanel).getByRole('combobox', {
      name: 'Rows per page',
    })
    expect(pageSize).toHaveTextContent('20')
    await userEvent.click(pageSize)
    await userEvent.click(screen.getByRole('option', { name: '10' }))
    expect(await within(databasePanel).findByText('Page 1 of 3')).toBeVisible()
    fireEvent.click(
      within(databasePanel).getByRole('button', { name: /Go to page 3/ })
    )
    expect(within(databasePanel).getByText('Page 3 of 3')).toBeVisible()
    expect(screen.getByText('model-21')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(
      screen.getByRole('tab', { name: 'Client model preview (21)' })
    )
    expect(within(modelPanel).getByText('Page 2 of 2')).toBeVisible()
    await userEvent.click(
      screen.getByRole('tab', { name: 'Database plan (21)' })
    )
    expect(within(databasePanel).getByText('Page 3 of 3')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Review and publish' })
    ).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Review and publish' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      /Existing prices reused:\s*1/
    )
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      /Specifications needing pricing:\s*1/
    )
    fireEvent.click(screen.getByRole('button', { name: 'Publish Bundle' }))
    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith(
        { importId: IMPORT_ONE_ID, expectedPlanToken: PLAN_TOKEN_ONE },
        expect.any(Object)
      )
    )
    expect(
      await screen.findByText(/profiles\/test.profile.json/)
    ).toHaveTextContent('Reason: Fix the template')
  })

  it('shows unchanged models and prevents a redundant publication', async () => {
    mocks.plan.mockResolvedValue({
      ...importPlanFields,
      bundleId: 'canvas.test',
      bundleVersion: '2',
      manifestSha256: 'b'.repeat(64),
      planToken: 'b'.repeat(64),
      pricingSummary: { reused: 0, needsPricing: 0 },
      action: 'NO_CHANGES',
      blocking: false,
      diagnostics: [],
      models: [
        {
          productKey: 'canvas.image.preview',
          displayName: 'Existing client model',
          channelId: 'test-channel',
          providerId: 'test-provider',
          capability: 'image.generate',
          action: 'NO_OP',
          currentVersion: 1,
          proposedVersion: 1,
          customerVisibleAfterPublish: false,
          credential: unboundCredential,
          publicInteraction: {
            defaultParams: {},
            paramSchema: {},
            referenceLimits: {},
          },
          pricing: [],
        },
      ],
      changes: [
        {
          resourceType: 'CUSTOMER_MODEL',
          key: 'canvas.image.preview',
          action: 'NO_OP',
          currentVersion: 1,
          proposedVersion: 1,
          detail: {},
        },
      ],
    })
    const files = [
      catalogFile('manifest.json', { ...manifest, bundleVersion: '2' }),
      catalogFile('providers.json', { schemaVersion: 2, providers: [] }),
      catalogFile('channels.json', { schemaVersion: 2, channels: [] }),
      catalogFile('models.json', { schemaVersion: 2, models: [] }),
      catalogFile('openapi/test.openapi.json', { openapi: '3.0.0' }),
      catalogFile('profiles/test.profile.json', { schemaVersion: 1 }),
    ]
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files },
    })
    expect(await screen.findByText('Existing client model')).toBeInTheDocument()
    expect(screen.getByText('Unchanged — skipped')).toBeInTheDocument()
    expect(
      screen.getByText('Nothing needs to be published')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Review and publish' })
    ).toBeDisabled()
    expect(mocks.publish).not.toHaveBeenCalled()
  })

  it('allows verified price recovery without technical catalog changes', async () => {
    mocks.plan.mockResolvedValue({
      ...importPlanFields,
      bundleId: 'canvas.test',
      bundleVersion: '1',
      manifestSha256: 'c'.repeat(64),
      planToken: 'c'.repeat(64),
      pricingSummary: { reused: 1, needsPricing: 0 },
      action: 'RECOVER_PRICING',
      blocking: false,
      diagnostics: [],
      models: [
        {
          productKey: 'canvas.image.test',
          displayName: 'Client model',
          channelId: 'test-channel',
          providerId: 'test-provider',
          capability: 'image.generate',
          action: 'NO_OP',
          currentVersion: 2,
          proposedVersion: 2,
          customerVisibleAfterPublish: false,
          credential: unboundCredential,
          publicInteraction: {
            defaultParams: { quality: '480P' },
            paramSchema: {},
            referenceLimits: {},
          },
          pricing: [
            {
              combinationKey: '480p',
              label: '480P',
              parameters: { quality: '480P' },
              billingDimensions: { billingUnit: 'REQUEST' },
              priceGroupId: 'standard',
              priceGroupCode: 'standard',
              priceGroupName: 'Standard',
              status: 'REUSE',
              reasonCode: 'MATCHED_PUBLISHED_PRICE',
              billingUnit: 'REQUEST',
              points: '450',
              tokenRates: null,
              sourcePriceVersionId: 'price-version-1',
              sourceProviderRateVersionId: 'provider-rate-version-1',
              sourceModelVersion: 1,
              effectiveAt: null,
            },
          ],
        },
      ],
      changes: [
        {
          resourceType: 'CUSTOMER_MODEL',
          key: 'canvas.image.test',
          action: 'NO_OP',
          currentVersion: 2,
          proposedVersion: 2,
          detail: {},
        },
      ],
    })
    mocks.publish.mockResolvedValue({})
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files: bundleFiles(modelDefinition) },
    })
    expect(
      await screen.findByText(
        'Review the verified price links for this published catalog before restoring them.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Verified price links will be restored without a new catalog version'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText('Catalog unchanged; price links to restore')
    ).toBeInTheDocument()
    const review = screen.getByRole('button', {
      name: 'Review and restore prices',
    })
    expect(review).toBeEnabled()
    fireEvent.click(review)
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'This restores only the verified price links shown in the plan. Existing catalog versions remain unchanged.'
    )
    expect(screen.queryByText('Models to publish')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore price links' }))
    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith(
        expect.objectContaining({ expectedPlanToken: 'c'.repeat(64) }),
        expect.any(Object)
      )
    )
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Verified price links restored'
      )
    )
    expect(
      screen.queryByRole('button', { name: 'Review and restore prices' })
    ).not.toBeInTheDocument()
  })

  it('allows verified price and API Key link recovery without technical catalog changes', async () => {
    mocks.plan.mockResolvedValue({
      ...importPlanFields,
      bundleId: 'canvas.test',
      bundleVersion: '1',
      manifestSha256: 'd'.repeat(64),
      planToken: 'd'.repeat(64),
      pricingSummary: { reused: 0, needsPricing: 0 },
      action: 'RECOVER_CONTINUITY',
      blocking: false,
      diagnostics: [],
      changes: [],
      models: [
        {
          productKey: 'canvas.image.test',
          displayName: 'Client model',
          channelId: 'test-channel',
          providerId: 'test-provider',
          capability: 'image.generate',
          action: 'NO_OP',
          currentVersion: 2,
          proposedVersion: 2,
          customerVisibleAfterPublish: false,
          publicInteraction: {
            defaultParams: {},
            paramSchema: {},
            referenceLimits: {},
          },
          credential: {
            ...unboundCredential,
            status: 'REUSE',
            reasonCode: 'MATCHED_PUBLISHED_BINDING',
            credentialGroupName: 'Test group',
          },
          pricing: [],
        },
      ],
    })
    mocks.publish.mockResolvedValue({})
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files: bundleFiles(modelDefinition) },
    })
    const review = await screen.findByRole('button', {
      name: 'Review and restore links',
    })
    expect(review).toBeEnabled()
    expect(
      screen.getByText('Catalog unchanged; verified links to restore')
    ).toBeInTheDocument()
    fireEvent.click(review)
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'This restores only the verified price and API Key links shown in the plan. Existing catalog versions remain unchanged.'
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Restore verified links' })
    )
    await waitFor(() =>
      expect(mocks.publish).toHaveBeenCalledWith(
        expect.objectContaining({ expectedPlanToken: 'd'.repeat(64) }),
        expect.any(Object)
      )
    )
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Verified price and API Key links restored'
      )
    )
  })

  it.each([
    'CATALOG_PLAN_VALIDATOR_CHANGED',
    'CATALOG_PLAN_ACTOR_MISMATCH',
    'CATALOG_PLAN_SNAPSHOT_INVALID',
  ])('invalidates %s and requires validation before retry', async (code) => {
    const planned = {
      ...importPlanFields,
      bundleId: 'canvas.test',
      bundleVersion: '1',
      manifestSha256: 'd'.repeat(64),
      planToken: 'e'.repeat(64),
      pricingSummary: { reused: 0, needsPricing: 0 },
      action: 'PUBLISH',
      blocking: false,
      diagnostics: [],
      models: [],
      changes: [
        {
          resourceType: 'CUSTOMER_MODEL',
          key: 'canvas.image.test',
          action: 'CREATE',
          currentVersion: null,
          proposedVersion: 1,
          detail: {},
        },
      ],
    }
    mocks.plan
      .mockResolvedValueOnce(planned)
      .mockResolvedValueOnce({ ...planned, planToken: 'f'.repeat(64) })
    mocks.publish.mockRejectedValue({
      response: {
        status: 409,
        data: {
          code,
          message: 'Cloud stale fallback',
        },
      },
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files: bundleFiles(modelDefinition) },
    })
    const review = await screen.findByRole('button', {
      name: 'Review and publish',
    })
    fireEvent.click(review)
    fireEvent.click(screen.getByRole('button', { name: 'Publish Bundle' }))
    expect(
      await screen.findByText(
        'Publication failed. Select the catalog source folder again.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'The catalog plan is stale. Select the source folder again.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Cloud stale fallback')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Review and publish' })
    ).not.toBeInTheDocument()
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files: bundleFiles(modelDefinition) },
    })
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByRole('button', { name: 'Review and publish' })
    ).toBeEnabled()
    expect(mocks.publish).toHaveBeenCalledTimes(1)
  })

  it.each([401, 403])(
    'clears the frozen import after a %s publication response',
    async (status) => {
      mocks.plan.mockResolvedValue(catalogPlan())
      mocks.publish.mockRejectedValue({
        response: { status, data: { code: 'UNAUTHORIZED' } },
      })
      render(
        <QueryClientProvider client={new QueryClient()}>
          <AdminModelCatalog principalId={ADMIN_ONE_ID} />
        </QueryClientProvider>
      )
      fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
      fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
        target: { files: bundleFiles(modelDefinition) },
      })
      fireEvent.click(
        await screen.findByRole('button', { name: 'Review and publish' })
      )
      fireEvent.click(screen.getByRole('button', { name: 'Publish Bundle' }))

      expect(
        await screen.findByText(
          'Your administrator session is no longer authorized.'
        )
      ).toBeVisible()
      expect(
        screen.queryByRole('button', { name: 'Review and publish' })
      ).not.toBeInTheDocument()
    }
  )

  it('rejects an already expired plan and requires a new folder selection', async () => {
    mocks.plan.mockResolvedValue(
      catalogPlan({ expiresAt: '2020-01-01T00:00:00.000Z' })
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files: bundleFiles(modelDefinition) },
    })

    expect(
      await screen.findByText('The catalog plan has expired.')
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Review and publish' })
    ).not.toBeInTheDocument()
  })

  it('clears the previous import as soon as a different folder is selected', async () => {
    let resolveReplacement: ((value: unknown) => void) | undefined
    mocks.plan.mockResolvedValueOnce(catalogPlan()).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReplacement = resolve
      })
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    const input = screen.getByLabelText('Choose Bundle folder')
    fireEvent.change(input, { target: { files: bundleFiles(modelDefinition) } })
    expect(
      await screen.findByRole('button', { name: 'Review and publish' })
    ).toBeEnabled()

    fireEvent.change(input, { target: { files: bundleFiles(modelDefinition) } })
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(2))
    expect(
      screen.queryByRole('button', { name: 'Review and publish' })
    ).not.toBeInTheDocument()
    resolveReplacement?.(catalogPlan({ importId: IMPORT_TWO_ID }))
  })

  it('ignores a late plan response from an older folder selection', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    mocks.plan
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
        })
      )
      .mockResolvedValueOnce(catalogPlan({ importId: IMPORT_CURRENT_ID }))
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    const input = screen.getByLabelText('Choose Bundle folder')
    fireEvent.change(input, { target: { files: bundleFiles(modelDefinition) } })
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(1))
    fireEvent.change(input, { target: { files: bundleFiles(modelDefinition) } })

    expect(
      await screen.findByText(new RegExp(IMPORT_CURRENT_ID, 'u'))
    ).toBeVisible()
    resolveFirst?.(catalogPlan({ importId: IMPORT_OLD_ID }))
    await waitFor(() =>
      expect(
        screen.queryByText(new RegExp(IMPORT_OLD_ID, 'u'))
      ).not.toBeInTheDocument()
    )
    expect(screen.getByText(new RegExp(IMPORT_CURRENT_ID, 'u'))).toBeVisible()
  })

  it('clears the plan and confirmation immediately when the actor changes', async () => {
    mocks.plan.mockResolvedValue(catalogPlan())
    const client = new QueryClient()
    const page = (principalId: string) => (
      <QueryClientProvider client={client}>
        <AdminModelCatalog principalId={principalId} />
      </QueryClientProvider>
    )
    const view = render(page(ADMIN_ONE_ID))
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files: bundleFiles(modelDefinition) },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review and publish' })
    )
    expect(screen.getByRole('alertdialog')).toBeVisible()

    view.rerender(page(ADMIN_TWO_ID))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Review and publish' })
    ).not.toBeInTheDocument()
    expect(mocks.publish).not.toHaveBeenCalled()
    client.clear()
  })

  it('does not submit a second publication while the first is pending', async () => {
    let resolvePublication: ((value: unknown) => void) | undefined
    mocks.plan.mockResolvedValue(catalogPlan())
    mocks.publish.mockReturnValue(
      new Promise((resolve) => {
        resolvePublication = resolve
      })
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog principalId={ADMIN_ONE_ID} />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files: bundleFiles(modelDefinition) },
    })
    fireEvent.click(
      await screen.findByRole('button', { name: 'Review and publish' })
    )
    const publish = screen.getByRole('button', { name: 'Publish Bundle' })
    fireEvent.click(publish)
    await waitFor(() => expect(publish).toBeDisabled())
    fireEvent.click(publish)
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    resolvePublication?.({})
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Model catalog published')
    )
  })
})
