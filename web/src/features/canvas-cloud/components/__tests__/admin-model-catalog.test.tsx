import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildCatalogBundle } from '../../catalogBundleReader'
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
vi.mock('../../api', () => ({
  planCanvasModelCatalogBundle: mocks.plan,
  publishCanvasModelCatalogBundle: mocks.publish,
  getCanvasAdminTestingModels: mocks.published,
  getCanvasAdminModelTags: mocks.tags,
  getCanvasPriceGroups: mocks.priceGroups,
  publishCanvasModelPresentation: mocks.presentation,
  publishCanvasExecutionTargetPresentation: mocks.targetPresentation,
}))
vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess } }))

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
  beforeEach(() => {
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
        provider: { code: 'api', name: 'API provider' },
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
        <AdminModelCatalog initialPricingModelId={modelId} />
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
  it('assembles only the files referenced by manifest.json', async () => {
    const bundle = await buildCatalogBundle([
      catalogFile('manifest.json', manifest),
      catalogFile('providers.json', {
        schemaVersion: 2,
        providers: [{ id: 'p' }],
      }),
      catalogFile('channels.json', {
        schemaVersion: 2,
        channels: [{ id: 'c' }],
      }),
      catalogFile('models.json', {
        schemaVersion: 2,
        models: [{ ...modelDefinition, description: 'Published default' }],
      }),
      catalogFile('openapi/test.openapi.json', { openapi: '3.0.0' }),
      catalogFile('profiles/test.profile.json', {
        schemaVersion: 1,
        templateLanguageVersion: 1,
      }),
    ])
    expect(bundle).toMatchObject({
      bundleId: 'canvas.test',
      bundleVersion: '1',
    })
    expect(bundle.openapiContracts[0]?.path).toBe('openapi/test.openapi.json')
    expect(bundle.adapterProfiles[0]?.path).toBe('profiles/test.profile.json')
    expect(bundle.models[0]?.description).toBe('Published default')
  })

  it('uses only the model JSON description and keeps absence distinct from Profile text', async () => {
    const withDefault = await buildCatalogBundle(
      bundleFiles(
        { ...modelDefinition, description: '  Client copy  ' },
        { schemaVersion: 1, description: 'Technical Profile text' }
      )
    )
    expect(withDefault.models[0]?.description).toBe('Client copy')
    const withoutDefault = await buildCatalogBundle(
      bundleFiles(modelDefinition, {
        schemaVersion: 1,
        description: 'Technical Profile text',
      })
    )
    expect(withoutDefault.models[0]).not.toHaveProperty('description')
  })

  it('preserves the Profile template language version and templates in the Bundle payload', async () => {
    const profile = {
      schemaVersion: 1,
      version: 2,
      templateLanguageVersion: 1,
      advanced: {
        request: {
          body: {
            first_image: {
              $call: 'mediaUrlByRole',
              args: [{ $ref: 'media' }, 'first'],
            },
          },
        },
      },
    }
    const bundle = await buildCatalogBundle(
      bundleFiles(modelDefinition, profile)
    )
    expect(bundle.adapterProfiles).toEqual([
      { path: 'profiles/test.profile.json', profile },
    ])
  })

  it('rejects an oversized description and unknown model fields before upload', async () => {
    await expect(
      buildCatalogBundle(
        bundleFiles({ ...modelDefinition, description: 'x'.repeat(501) })
      )
    ).rejects.toThrow('description')
    await expect(
      buildCatalogBundle(
        bundleFiles({ ...modelDefinition, surprise: 'not allowed' })
      )
    ).rejects.toThrow('surprise')
  })

  it('reports a missing referenced file before calling Canvas Cloud', async () => {
    await expect(
      buildCatalogBundle([
        catalogFile('manifest.json', manifest),
        catalogFile('providers.json', { schemaVersion: 2, providers: [] }),
        catalogFile('channels.json', { schemaVersion: 2, channels: [] }),
        catalogFile('models.json', { schemaVersion: 2, models: [] }),
      ])
    ).rejects.toThrow('Missing required file: openapi/test.openapi.json')
  })

  it('shows Profile, operation, path and stable reason from a rejected plan', async () => {
    mocks.plan.mockRejectedValue({
      response: {
        data: {
          message: 'Bundle validation failed',
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
            {
              code: 'SOURCE_FIELD_REQUIRED',
              sourceFile: 'profiles/test.profile.json',
              jsonPath: '$.adapterProfiles[0].profile.templateLanguageVersion',
              recommendation: 'Declare template language version',
            },
          ],
        },
      },
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: {
        files: bundleFiles(modelDefinition, {
          schemaVersion: 1,
          templateLanguageVersion: 1,
        }),
      },
    })
    expect(await screen.findByText(/z5api.seedance@1.0.0/)).toHaveTextContent(
      'Operation: submitVideo'
    )
    expect(screen.getByText(/z5api.seedance@1.0.0/)).toHaveTextContent(
      'profiles/test.profile.json'
    )
    expect(screen.getByText(/z5api.seedance@1.0.0/)).toHaveTextContent(
      'Path: $.adapterProfiles[0].profile.advanced.request.body.first_image'
    )
    expect(screen.getByText(/z5api.seedance@1.0.0/)).toHaveTextContent(
      'Reason: UNSUPPORTED_FUNCTION'
    )
    expect(screen.getByText(/SOURCE_FIELD_REQUIRED/)).toHaveTextContent(
      'Path: $.adapterProfiles[0].profile.templateLanguageVersion'
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
      bundleId: 'canvas.test',
      bundleVersion: '1',
      manifestSha256: 'a'.repeat(64),
      planToken: 'plan-token-1',
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
        <AdminModelCatalog />
      </QueryClientProvider>
    )
    fireEvent.click(screen.getByRole('tab', { name: 'Import and publish' }))
    fireEvent.change(screen.getByLabelText('Choose Bundle folder'), {
      target: { files },
    })
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(1))
    expect(mocks.plan).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterProfiles: [
          expect.objectContaining({
            profile: expect.objectContaining({ templateLanguageVersion: 1 }),
          }),
        ],
        models: [
          expect.objectContaining({
            description: 'Default customer description',
          }),
        ],
      }),
      expect.any(Object)
    )
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
        expect.objectContaining({ expectedPlanToken: 'plan-token-1' }),
        expect.any(Object)
      )
    )
    expect(
      await screen.findByText(
        'Adapter Profile template uses an unsupported function.'
      )
    ).toBeInTheDocument()
  })

  it('shows unchanged models and prevents a redundant publication', async () => {
    mocks.plan.mockResolvedValue({
      bundleId: 'canvas.test',
      bundleVersion: '2',
      manifestSha256: 'b'.repeat(64),
      planToken: 'plan-token-2',
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
        <AdminModelCatalog />
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
        <AdminModelCatalog />
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
        <AdminModelCatalog />
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

  it('invalidates a stale plan after a 409 and requires validation before retry', async () => {
    const planned = {
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
          code: 'CONFLICT',
          message:
            'Catalog plan is stale; review the latest price sources and publish again',
        },
      },
    })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AdminModelCatalog />
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
        'Publication failed. Validate the Bundle again before retrying.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Catalog plan is stale because price sources or versions changed after validation.'
      )
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Catalog plan is stale; review the latest price sources and publish again'
      )
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Review and publish' })
    ).not.toBeInTheDocument()
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'Validate Bundle again' })
    )
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(2))
    expect(
      await screen.findByRole('button', { name: 'Review and publish' })
    ).toBeEnabled()
    expect(mocks.publish).toHaveBeenCalledTimes(1)
  })
})
