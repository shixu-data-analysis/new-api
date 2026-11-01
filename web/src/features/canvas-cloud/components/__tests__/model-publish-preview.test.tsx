import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import i18next from 'i18next'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'

import type { CatalogEditPlan } from '../../catalog-edit-api'
import { ModelPublishPreview } from '../catalog-edit/ModelPublishPreview'

vi.mock('../../catalog-edit-api', async (original) => ({
  ...(await original<typeof import('../../catalog-edit-api')>()),
  getCatalogEditorOptions: () => new Promise(() => undefined),
}))

const MESSAGE_KEY = 'catalog.plan.promptReferencesRewritten'

const rewrite = {
  code: 'CATALOG_PROMPT_REFERENCES_REWRITTEN',
  severity: 'WARNING',
  sourceFile: 'database',
  jsonPath: 'channels[acme.video].adapterProfile',
  valueSummary: 'acme.video',
  capability: 'catalog.import.publication',
  ownerModule: 'model-catalog',
  recommendation:
    'References in prompts are rewritten in every mode after publishing.',
  internalTestingAllowed: false,
  messageKey: MESSAGE_KEY,
  params: { channelId: 'acme.video' },
}

function plan(overrides: Partial<CatalogEditPlan> = {}): CatalogEditPlan {
  return {
    action: 'PUBLISH',
    blocking: false,
    diagnostics: [],
    changes: [],
    models: [],
    decisions: [],
    requestChanges: [],
    editedModelKeys: [],
    ...overrides,
  } as unknown as CatalogEditPlan
}

function open(value: CatalogEditPlan) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ModelPublishPreview
        plan={value}
        title='Model'
        capability='video.generate'
        sourceLabel='Edit'
        modelKey={null}
        changes={[]}
        copySource={null}
        busy={false}
        onBack={vi.fn()}
        onConfirm={vi.fn()}
      />
    </QueryClientProvider>
  )
}

describe('Publication preview of a prompt reference rewrite', () => {
  beforeAll(async () => {
    await i18next.changeLanguage('en')
    i18next.addResource(
      'en',
      'translation',
      MESSAGE_KEY,
      (en.translation as Record<string, string>)[MESSAGE_KEY]
    )
  })

  it('names the Channel and leaves publishing open', () => {
    open(plan({ diagnostics: [rewrite] } as never))
    expect(
      screen.getByText(
        /^acme\.video: After publishing, every mode writes @图片1/
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Confirm publication' })
    ).toBeEnabled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says nothing when no Channel is rewritten', () => {
    open(plan())
    expect(screen.queryByText(/every mode writes/)).toBeNull()
  })

  it('shows one line per Channel', () => {
    const other = {
      ...rewrite,
      jsonPath: 'channels[beta.video].adapterProfile',
      params: { channelId: 'beta.video' },
    }
    open(plan({ diagnostics: [rewrite, other] } as never))
    expect(screen.getAllByText(/every mode writes/)).toHaveLength(2)
  })
})
