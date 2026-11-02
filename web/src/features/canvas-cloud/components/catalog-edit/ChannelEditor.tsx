/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { StaticDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import {
  blankChannelDraft,
  buildContract,
  buildProfile,
  channelDraftFrom,
  channelIssues,
  sameDocument,
  unsupportedProfileFields,
  paramKeyOf,
  withChatStreaming,
  type BodyName,
  type ChannelDraft,
} from '../../catalog-channel-draft'
import {
  isModeView,
  materialIssues,
  withMeasuredAccepts,
  type MediaMode,
} from '../../catalog-channel-materials'
import {
  getCatalogEditorOptions,
  getCurrentCatalog,
  planCatalogEdit,
  publishCatalogEdit,
  type CatalogEditPlan,
} from '../../catalog-edit-api'
import { contractOfProfile, profileOfChannel } from '../../catalog-edit-logic'
import type {
  CatalogEditDraft,
  CatalogEditDraftModel,
  CatalogEditDraftProvider,
  CatalogJson,
  CatalogModelDefinition,
  CurrentCatalogView,
} from '../../catalog-edit-types'
import { diffCatalogJson } from '../../catalog-json-diff'
import {
  channelJsonExample,
  channelJsonIssue,
  formModel,
  pastedNotes,
  type ChannelJson,
  type JsonIssue,
} from '../../catalog-json-fill'
import { useModelManagementEditorPage } from '../../model-management-editor-page-context'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from '../CanvasManagementTabs'
import { CatalogJsonDiff } from '../CatalogJsonDiff'
import { catalogEditErrorText, catalogEditFailure } from './catalog-edit-errors'
import { RowsEditor, OperationFields } from './ChannelFormParts'
import { ChannelMaterialsSection } from './ChannelMaterialsSection'
import { ChannelPreview } from './ChannelPreview'
import { ChannelPublishDialog } from './ChannelPublishDialog'
import { ChannelResponseSection } from './ChannelResponseSection'
import {
  EditField,
  EditorFooter,
  EditSection,
  LeaveConfirm,
  SwitchField,
} from './EditFields'
import { JsonFillDialog } from './JsonFillDialog'
import { UnsupportedFieldsNotice } from './ModelEditorSections'
import { ModelPublishPreview } from './ModelPublishPreview'
import { NewModelsPage } from './NewModelsPage'
import { useJsonIssueText } from './use-json-issue-text'
import { WizardSteps } from './WizardSteps'
import { workflowLabel } from './workflow-labels'

export type ChannelEditorMode =
  | { kind: 'edit'; channelId: string }
  | { kind: 'copy'; channelId: string }
  | { kind: 'new' }

export function ChannelEditor(props: {
  mode: ChannelEditorMode
  onClose: () => void
  onEditPresentation: (modelKey: string) => void
  onEditModel: (modelKey: string) => void
}) {
  const { t } = useTranslation()
  const catalogQuery = useQuery({
    queryKey: ['canvas-cloud', 'model-catalog', 'current'],
    queryFn: getCurrentCatalog,
    staleTime: Infinity,
  })
  const optionsQuery = useQuery({
    queryKey: ['canvas-cloud', 'model-catalog', 'editor-options'],
    queryFn: getCatalogEditorOptions,
    staleTime: Infinity,
  })
  if (catalogQuery.isPending || optionsQuery.isPending) {
    return <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
  }
  if (catalogQuery.isError || optionsQuery.isError) {
    return (
      <p role='alert' className='text-destructive text-sm'>
        {t('The catalog could not be loaded.')}
      </p>
    )
  }
  return (
    <LoadedChannelEditor
      {...props}
      catalog={catalogQuery.data}
      options={optionsQuery.data}
    />
  )
}

const MEDIA_KINDS: Record<
  string,
  ReadonlyArray<'image' | 'video' | 'audio'>
> = {
  'video.generate': ['image', 'video', 'audio'],
  'image.generate': ['image'],
}

function LoadedChannelEditor(props: {
  mode: ChannelEditorMode
  catalog: CurrentCatalogView
  options: Awaited<ReturnType<typeof getCatalogEditorOptions>>
  onClose: () => void
  onEditPresentation: (modelKey: string) => void
  onEditModel: (modelKey: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { mode, catalog, options } = props
  useModelManagementEditorPage()
  const [sourceId, setSourceId] = useState(
    mode.kind === 'new' ? '' : mode.channelId
  )
  const [createMode, setCreateMode] = useState<'copy' | 'blank' | 'json'>(
    'copy'
  )
  // A pasted Channel configuration is the base the form builds on, the way a copied one is.
  const [pasted, setPasted] = useState<{
    profile: CatalogJson
    contract: CatalogJson
    models: CatalogModelDefinition[]
    notes: JsonIssue[]
  } | null>(null)
  const [jsonOpen, setJsonOpen] = useState(false)
  const issueText = useJsonIssueText()
  const sourceProfile = sourceId
    ? (profileOfChannel(catalog, sourceId) ?? null)
    : null
  const baseProfile = sourceProfile ?? pasted?.profile ?? null
  const baseContract = sourceProfile
    ? (contractOfProfile(catalog, sourceProfile) ?? null)
    : (pasted?.contract ?? null)
  const sourceChannel = catalog.bundle.channels.find(
    (channel) => channel.id === sourceId
  )
  const [draft, setDraft] = useState<ChannelDraft>(() =>
    baseProfile && baseContract
      ? withMeasuredAccepts(channelDraftFrom(baseProfile, baseContract))
      : withMeasuredAccepts(blankChannelDraft('video.generate'))
  )
  const [providerId, setProviderId] = useState(sourceChannel?.providerId ?? '')
  const [newProvider, setNewProvider] = useState<CatalogEditDraftProvider>({
    id: '',
    internalName: '',
    baseUrl: '',
    sourceKind: 'relay',
    credentialSchemes: ['bearerAuth'],
    confirmHostChange: false,
  })
  const [channelName, setChannelName] = useState('')
  const [tab, setTab] = useState<'form' | 'json'>('form')
  // The canvas mode the materials section and the preview show; each body falls back to a mode it has.
  const [mediaMode, setMediaMode] = useState<MediaMode>()
  const [leaving, setLeaving] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [activeTab, setActiveTab] = useState<'body' | 'bodyWithImages'>('body')
  const [issues, setIssues] = useState<
    Array<{ path: string; message: string }>
  >([])
  const [modelValues, setModelValues] = useState<
    Record<string, Record<string, string>>
  >({})
  const [plan, setPlan] = useState<CatalogEditPlan | null>(null)
  const [error, setError] = useState<string>()
  const idempotencyKey = useRef(crypto.randomUUID())
  const formArea = useRef<HTMLDivElement>(null)
  const [leaveToModel, setLeaveToModel] = useState<string | null>(null)

  const isEdit = mode.kind === 'edit'
  const isNewProvider = providerId === '__new'
  const effectiveProviderId = isNewProvider ? newProvider.id : providerId
  const channelId = isEdit
    ? mode.channelId
    : `${effectiveProviderId}.${channelName}`
  const provider = catalog.bundle.providers.find(
    (entry) => entry.id === providerId
  )
  const baseUrl = isNewProvider
    ? newProvider.baseUrl
    : (provider?.baseUrl ?? '')
  const prefix = channelId.toLowerCase().replaceAll(/[^a-z0-9]+/g, '')
  const set = (next: Partial<ChannelDraft>) => {
    setPlan(null)
    setDraft((current) => ({ ...current, ...next }))
  }
  const usageChoices =
    draft.capability === 'chat.generate'
      ? options.textUsageProtocols
      : options.usageProtocols
  const onChannel = useMemo(
    () =>
      catalog.bundle.models.filter(
        (model) => model.release.channelId === sourceId
      ),
    [catalog, sourceId]
  )
  const seenOptions = new Set<string>()
  const optionRows = [...draft.rows, ...draft.imageRows].filter((row) => {
    const key = row.optionKey ?? paramKeyOf(row.field)
    if (row.source !== 'option' || !row.field.trim() || seenOptions.has(key)) {
      return false
    }
    seenOptions.add(key)
    return true
  })
  const skipped = (model: CatalogModelDefinition, key: string) =>
    model.release.publicInteraction.defaultParams[key] === ''
  const userChoiceOrSkipped = (model: CatalogModelDefinition, key: string) =>
    skipped(model, key) ||
    (
      (model.release.publicInteraction.paramSchema.options ?? []) as Array<{
        key: string
      }>
    ).some((option) => option.key === key)
  const unsentParams = useMemo(() => {
    if (mode.kind !== 'edit' || !onChannel.length) return []
    const labels: Record<string, string> = {
      aspectRatio: t('Aspect ratio'),
      quality: t('Quality tier'),
      apiQuality: t('Image quality'),
      durationSeconds: t('Length'),
      generateAudio: t('Generate audio'),
    }
    const policyParam: Record<string, string> = {
      count: 'batchSize',
      apiQuality: 'apiQuality',
      ratio: 'aspectRatio',
    }
    const rows = [...draft.rows, ...draft.imageRows]
    const sends = (param: string) =>
      rows.some(
        (row) =>
          row.source === param ||
          policyParam[row.source] === param ||
          (row.source === 'size' &&
            ['aspectRatio', 'quality'].includes(param)) ||
          (row.source === 'expr' &&
            String(row.expr).includes(`"request.${param}"`))
      )
    return Object.keys(labels)
      .filter(
        (param) =>
          onChannel.some(
            (model) =>
              model.release.publicInteraction.defaultParams[param] !== undefined
          ) && !sends(param)
      )
      .map((param) => labels[param])
  }, [mode, onChannel, draft.rows, draft.imageRows, t])

  // A keystroke re-renders this page, so the documents are only rebuilt when the form changed.
  const builtProfileDocument = useMemo(() => {
    const built = buildProfile(
      draft,
      mode.kind === 'edit'
        ? baseProfile
        : baseProfile && { ...baseProfile, id: undefined },
      prefix
    )
    if (mode.kind !== 'edit') delete built.description
    return built
  }, [draft, mode.kind, baseProfile, prefix])
  const builtContractDocument = useMemo(
    () => buildContract(draft, baseContract, baseProfile, prefix, channelId),
    [draft, baseContract, baseProfile, prefix, channelId]
  )
  const builtProfile = () => builtProfileDocument
  const builtContract = () => builtContractDocument

  const modelsWithValues = (): CatalogEditDraftModel[] => {
    const edited = Object.entries(modelValues).flatMap(([modelKey, values]) => {
      const model = onChannel.find((entry) => entry.productKey === modelKey)
      if (!model) return []
      const copy = structuredClone(model)
      const defaults = copy.release.publicInteraction.defaultParams
      for (const [key, text] of Object.entries(values)) {
        const row = optionRows.find(
          (entry) => (entry.optionKey ?? paramKeyOf(entry.field)) === key
        )
        if (row?.paramType === 'number') defaults[key] = Number(text)
        else if (row?.paramType === 'boolean') defaults[key] = text === 'true'
        else defaults[key] = text
      }
      return [
        {
          baseVersion: catalog.versions.models[modelKey] ?? null,
          definition: copy,
        },
      ]
    })
    return edited
  }
  const payload = (): CatalogEditDraft => ({
    providers: isNewProvider ? [newProvider] : [],
    channels: [
      {
        id: channelId,
        providerId: effectiveProviderId,
        baseVersion: isEdit
          ? (catalog.versions.channels[channelId] ?? null)
          : null,
        profile: builtProfile(),
        contract: builtContract(),
      },
    ],
    models: modelsWithValues(),
  })

  const localIssues = (): Array<{ path: string; message: string }> => {
    if (!isEdit && createMode === 'copy' && !sourceId) {
      return [
        {
          path: 'source',
          message: t('Choose the Channel configuration to copy'),
        },
      ]
    }
    if (!isEdit && createMode === 'json' && !pasted) {
      return [{ path: 'json', message: t('Paste the JSON first') }]
    }
    // The models on an edited Channel need the materials their modes take.
    const modelsOnChannel = isEdit
      ? onChannel.map((model) => ({
          key: model.productKey,
          limits: model.release.publicInteraction.referenceLimits as
            | Record<string, unknown>
            | undefined,
        }))
      : []
    const found = [
      ...channelIssues(draft, baseProfile),
      ...materialIssues(draft, modelsOnChannel),
    ].map((issue) => ({
      path: issue.path,
      message: t(issue.key, issue.values ?? {}),
    }))
    if (!isEdit) {
      if (!effectiveProviderId) {
        found.push({ path: 'provider', message: t('Choose an API provider') })
      }
      if (!/^[a-z0-9][a-z0-9-]*$/.test(channelName)) {
        found.push({
          path: 'channelName',
          message: t(
            'The Channel name can use lowercase letters, numbers and hyphens only'
          ),
        })
      }
      if (catalog.bundle.channels.some((channel) => channel.id === channelId)) {
        found.push({
          path: 'channelName',
          message: t('This Channel code already exists'),
        })
      } else if (catalog.retiredChannelCodes.includes(channelId)) {
        found.push({
          path: 'channelName',
          message: t(
            'This Channel code belongs to a deleted Channel; choose another'
          ),
        })
      }
    }
    if (isEdit) {
      const tokenModels = onChannel.filter(
        (model) =>
          (
            (model.release.publicInteraction.paramSchema.tokenUsageCategories ??
              []) as string[]
          ).length
      ).length
      if (!draft.usageProtocol && tokenModels) {
        found.push({
          path: 'usage',
          message: t(
            '{{count}} models bill by Token, so "Does not read usage" cannot be chosen. Change them to per request or per second first.',
            { count: tokenModels }
          ),
        })
      }
      for (const model of onChannel) {
        for (const row of optionRows) {
          const key = row.optionKey ?? paramKeyOf(row.field)
          if (userChoiceOrSkipped(model, key)) continue
          const stored = model.release.publicInteraction.defaultParams[key]
          if (
            (modelValues[model.productKey]?.[key] ??
              (stored === undefined ? '' : String(stored))) === ''
          ) {
            found.push({
              path: `values.${model.productKey}.${key}`,
              message: t('Please fill in'),
            })
          }
        }
      }
    }
    if (isNewProvider) {
      if (!newProvider.internalName.trim()) {
        found.push({
          path: 'newProvider.internalName',
          message: t('Enter the internal name'),
        })
      }
      if (!/^[a-z0-9-]+$/.test(newProvider.id)) {
        found.push({
          path: 'newProvider.id',
          message: t('Use lowercase letters, numbers and hyphens only'),
        })
      } else if (
        catalog.bundle.providers.some((entry) => entry.id === newProvider.id)
      ) {
        found.push({
          path: 'newProvider.id',
          message: t('This API provider code already exists'),
        })
      }
      try {
        const url = new URL(newProvider.baseUrl)
        if (url.protocol !== 'https:' || url.username || url.password) {
          found.push({
            path: 'newProvider.baseUrl',
            message: t('Use an HTTPS address without an account or password'),
          })
        }
      } catch {
        found.push({
          path: 'newProvider.baseUrl',
          message: t('Enter a valid base address'),
        })
      }
    }
    return found
  }
  const validate = useMutation({
    mutationFn: () => planCatalogEdit(payload()),
    onSuccess: (result) => {
      setPlan(result)
      setError(undefined)
    },
    onError: (failure) =>
      setError(catalogEditErrorText(catalogEditFailure(failure), t)),
  })
  const publish = useMutation({
    mutationFn: (expectedPlanToken: string) =>
      publishCatalogEdit({
        draft: payload(),
        expectedPlanToken,
        idempotencyKey: idempotencyKey.current,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['canvas-cloud'] })
      toast.success(t('Published'))
      props.onClose()
    },
    onError: (failure) => {
      idempotencyKey.current = crypto.randomUUID()
      setPlan(null)
      setError(catalogEditErrorText(catalogEditFailure(failure), t))
    },
  })
  const checked = () => {
    const found = localIssues()
    setIssues(found)
    if (!found.length) return true
    setTab('form')
    const firstRows = found.find((issue) =>
      /^(rows|imageRows)\b/.test(issue.path)
    )
    if (firstRows) {
      setActiveTab(
        firstRows.path.startsWith('imageRows') ? 'bodyWithImages' : 'body'
      )
    }
    toast.error(
      t('Validation failed: {{count}} fields to correct; the first is shown', {
        count: found.length,
      })
    )
    return false
  }
  const submit = () => {
    if (checked()) validate.mutate()
  }
  const goNext = () => {
    if (checked()) setStep(2)
  }

  // The first error may be far below: bring it into view and put focus on its control.
  useEffect(() => {
    const first = formArea.current?.querySelector<HTMLElement>('[role=alert]')
    if (!first) return
    first.scrollIntoView({ block: 'center' })
    const field = first.closest('[data-edit-field], [role=row]')
    const control =
      field?.querySelector<HTMLElement>('input:not([disabled]), textarea') ??
      field?.querySelector<HTMLElement>('select:not([disabled])')
    control?.focus({ preventScroll: true })
  }, [issues])

  const overlay = useMemo((): CurrentCatalogView => {
    const profile = {
      ...builtProfileDocument,
      id: channelId.toLowerCase(),
      version: '1.0.0-admin.1',
      api: `${channelId.toLowerCase().replaceAll('.', '-')}@1.0.0-admin.1`,
    }
    const contract = {
      ...builtContractDocument,
      info: { title: channelId, version: '1.0.0-admin.1' },
    }
    return {
      ...catalog,
      bundle: {
        ...catalog.bundle,
        providers: isNewProvider
          ? [
              ...catalog.bundle.providers,
              {
                ...newProvider,
                internalOnly: true,
                trustPolicy: 'public-only',
              },
            ]
          : catalog.bundle.providers,
        channels: [
          ...catalog.bundle.channels,
          {
            id: channelId,
            providerId: effectiveProviderId,
            adapterProfile: {
              id: channelId.toLowerCase(),
              version: '1.0.0-admin.1',
            },
            internalOnly: true,
          },
        ],
        adapterProfiles: [
          ...catalog.bundle.adapterProfiles,
          {
            path: `profiles/${channelId.toLowerCase().replaceAll('.', '-')}.profile.json`,
            profile,
          },
        ],
        openapiContracts: [
          ...catalog.bundle.openapiContracts,
          {
            path: `openapi/${channelId.toLowerCase().replaceAll('.', '-')}.openapi.json`,
            document: contract,
          },
        ],
      },
    }
  }, [
    catalog,
    channelId,
    effectiveProviderId,
    isNewProvider,
    newProvider,
    builtProfileDocument,
    builtContractDocument,
  ])

  if (plan && !isEdit) {
    return (
      <ModelPublishPreview
        plan={plan}
        title={t('New Channel configuration')}
        capability={
          {
            'image.generate': t('Image generation'),
            'video.generate': t('Video generation'),
            'chat.generate': t('Text generation'),
          }[draft.capability] ?? ''
        }
        sourceLabel={t('Admin new')}
        modelKey={null}
        changes={[]}
        copySource={null}
        busy={publish.isPending}
        error={error}
        onBack={() => setPlan(null)}
        onConfirm={() => publish.mutate(plan.planToken)}
      />
    )
  }

  // A draft Channel appears in the catalog the model forms read, so they treat it like a published one.
  if (step === 2) {
    return (
      <div className='space-y-4'>
        <WizardSteps
          current={2}
          channelPasted={Boolean(pasted)}
          pastedModels={pasted?.models.length ?? 0}
        />
        <NewModelsPage
          channelId={channelId}
          {...(pasted?.models.length
            ? {
                // The page owns the Channel's identity, so a code changed after the paste carries its models along.
                initialModels: pasted.models.map((model) => ({
                  ...model,
                  release: { ...model.release, channelId },
                })),
              }
            : {})}
          catalogOverride={overlay}
          shared={{
            extraDraft: {
              providers: isNewProvider ? [newProvider] : [],
              channels: payload().channels,
            },
            wizard: {
              title: t(
                'New Channel configuration · step 2: models (none, one or several)'
              ),
              onBack: () => setStep(1),
              onChannelOnly: () => {
                setStep(1)
                submit()
              },
            },
          }}
          onClose={props.onClose}
          onEditPresentation={props.onEditPresentation}
        />
      </div>
    )
  }

  let title = t('New Channel configuration · step 1: Channel')
  if (mode.kind === 'edit') {
    title = t('Edit Channel configuration · {{id}}', { id: mode.channelId })
  }
  const capabilityNames: Record<string, string> = {
    'image.generate': t('Image generation'),
    'video.generate': t('Video generation'),
    'chat.generate': t('Text generation'),
  }
  const summary = isEdit
    ? [
        capabilityNames[draft.capability],
        t('Current v{{version}}', {
          version: String(baseProfile?.version ?? ''),
        }),
        t('{{count}} models in use', { count: onChannel.length }),
      ].join(' · ')
    : capabilityNames[draft.capability]
  const isChat = draft.capability === 'chat.generate'
  const polls = draft.workflow !== 'sync'
  const ready =
    isEdit ||
    createMode === 'blank' ||
    Boolean(sourceId) ||
    (createMode === 'json' && Boolean(pasted))
  const pathExamples: Record<string, Record<string, string>> = {
    'video.generate': {
      submit: '/v1/videos',
      images: '/v1/videos',
      poll: '/v1/videos/{taskId}',
      prepareAsset: '/v1/assets',
      pollAsset: '/v1/assets/{assetId}',
    },
    'image.generate': {
      submit: '/v1/images/generations',
      images: '/v1/images/edits',
      poll: '/v1/images/tasks/{taskId}',
      prepareAsset: '/v1/assets',
      pollAsset: '/v1/assets/{assetId}',
    },
    'chat.generate': {
      submit: '/v1/chat/completions',
      images: '/v1/chat/completions',
      poll: '',
    },
  }
  const paths = pathExamples[draft.capability] ?? pathExamples['image.generate']
  const formatHelp = t(
    'Choose the request format from the upstream documents: application/json is JSON; multipart/form-data, or a required file upload, is a file form.'
  )
  const taskPathHelp = t(
    'Use . for levels and [0] for an item of a list, such as data.id or data[0].id. Separate several with commas; the first that has a value is used.'
  )
  const statusPathHelp = t(
    'Use . for levels, such as data.status. Separate several with commas; the first that has a value is used.'
  )
  const dottedHelp = t(
    'Use . for levels and [] for lists, such as data[].url. Separate several with commas.'
  )
  const deliveries = options.mediaDeliveries
  const deliveryLabels: Record<string, string> = {
    'public-url': t('Public address'),
    'multipart-file': t('File upload'),
    base64: 'base64',
    'data-url': 'data URL',
    'provider-asset': t('Upload to the upstream first'),
  }
  const deliveryHints: Record<string, string> = {
    'public-url': t('Sends the download address; the upstream downloads it.'),
    'multipart-file': t(
      'Puts the file in the request; the request format must be a file form.'
    ),
    base64: t('Turns the file into base64 text in a request field.'),
    'data-url': t(
      'Turns the file into data:image/png;base64,… text in a request field.'
    ),
    'provider-asset': t(
      'Uploads the material to the upstream first; the request sends the ID the upstream returned. The call method must be "Upload materials, then asynchronous".'
    ),
  }
  const mediaKinds = MEDIA_KINDS[draft.capability] ?? []
  const kindLabels = { image: t('Image'), video: t('Video'), audio: t('Audio') }
  const assetKinds = (['image', 'video', 'audio'] as const).filter(
    (kind) => draft.media[kind] === 'provider-asset'
  )
  const rootHint = (() => {
    const path = draft.submit.path.trim() || t('/path')
    let origin: string
    try {
      origin = new URL(baseUrl).origin
    } catch {
      return t(
        'It only matters when the base address has a path: "Use the domain only" removes that path.'
      )
    }
    const root = baseUrl.replace(/\/$/, '')
    return root === origin
      ? t(
          'This base address {{root}} has no path, so both send to {{root}}{{path}}.',
          { root, path }
        )
      : t(
          'This base address {{root}} has a path: the full base address sends to {{root}}{{path}}; the domain only sends to {{origin}}{{path}}.',
          { root, path, origin }
        )
  })()
  const chooseSource = (next: string) => {
    setSourceId(next)
    setPlan(null)
    const profile = next ? profileOfChannel(catalog, next) : undefined
    const contract = profile ? contractOfProfile(catalog, profile) : undefined
    if (profile && contract) {
      setDraft(withMeasuredAccepts(channelDraftFrom(profile, contract)))
      setProviderId(
        catalog.bundle.channels.find((channel) => channel.id === next)
          ?.providerId ?? ''
      )
    }
  }
  const chooseCapability = (capability: string) => {
    setSourceId('')
    setPasted(null)
    setDraft(withMeasuredAccepts(blankChannelDraft(capability)))
    setPlan(null)
  }
  const chooseCreateMode = (next: 'copy' | 'blank' | 'json') => {
    setCreateMode(next)
    setSourceId('')
    setPasted(null)
    // Filling from JSON starts with the paste, so its dialog opens at once.
    setJsonOpen(next === 'json')
    setDraft(withMeasuredAccepts(blankChannelDraft(draft.capability)))
    setPlan(null)
  }
  // Read the way copying a Channel configuration reads one; the form then checks and publishes it as usual.
  const fillFromJson = (json: unknown): JsonIssue | null => {
    const issue = channelJsonIssue(json, catalog, options.capabilities)
    if (issue) return issue
    const { provider, channel, profile, openapi, models } = json as ChannelJson
    let filled: ChannelDraft
    try {
      filled = withMeasuredAccepts(channelDraftFrom(profile, openapi))
    } catch (error) {
      return {
        key: 'This configuration cannot be read: {{message}}',
        values: { message: error instanceof Error ? error.message : '' },
      }
    }
    const known = catalog.bundle.providers.some(
      (entry) => entry.id === channel.providerId
    )
    setDraft(filled)
    setSourceId('')
    setPlan(null)
    setProviderId(known ? channel.providerId : '__new')
    if (!known && provider) {
      setNewProvider((current) => ({
        ...current,
        id: channel.providerId,
        internalName: String(provider.internalName ?? ''),
        baseUrl: String(provider.baseUrl ?? ''),
        sourceKind: provider.sourceKind === 'official' ? 'official' : 'relay',
      }))
    }
    setChannelName(channel.id.slice(channel.providerId.length + 1))
    setPasted({
      profile,
      contract: openapi,
      models: (models ?? []).map(formModel),
      notes: pastedNotes(json as ChannelJson, catalog),
    })
    toast.success(
      models?.length
        ? t(
            'Filled in the Channel configuration; {{count}} models are filled in at the next step',
            { count: models.length }
          )
        : t('Filled in; check it, then validate and publish')
    )
    return null
  }
  const setChatStreaming = (streaming: boolean) =>
    set(withChatStreaming(draft, streaming))
  const unsaved =
    isEdit &&
    baseProfile &&
    (!sameDocument(baseProfile, builtProfileDocument) ||
      !sameDocument(baseContract, builtContractDocument) ||
      Object.keys(modelValues).length)
  const leave = () => {
    if (unsaved) setLeaving(true)
    else props.onClose()
  }
  const builtForPreview = builtProfile()
  const openModel = (modelKey: string) => {
    if (!unsaved) {
      props.onEditModel(modelKey)
      return
    }
    setLeaveToModel(modelKey)
    setLeaving(true)
  }
  const rowModels = isEdit ? { models: onChannel } : {}
  // Video and image forms send the prompt and materials by canvas mode; text forms keep the user-input group.
  const materialsFor = (body: BodyName) =>
    isModeView(draft.capability)
      ? {
          title: t('Prompt and materials'),
          note: t('The user provides them for each generation.'),
          content: (
            <ChannelMaterialsSection
              draft={draft}
              body={body}
              mode={mediaMode}
              onMode={setMediaMode}
              onChange={(next) => set(next)}
              errorOf={errorOf}
            />
          ),
        }
      : undefined
  const errorOf = (path: string) =>
    issues.find((issue) => issue.path === path)?.message
  const rowIssues = (name: 'rows' | 'imageRows') =>
    issues.filter(
      (issue) => issue.path === name || issue.path.startsWith(`${name}.`)
    ).length
  // What the Channel really sends: the example uses its first model, with the values changed on this page.
  const firstModel = onChannel[0]?.release.execution.providerModel
  const previewDefaults = onChannel[0]
    ? (
        modelsWithValues().find(
          (entry) => entry.definition.productKey === onChannel[0].productKey
        )?.definition ?? onChannel[0]
      ).release.publicInteraction.defaultParams
    : undefined
  const firstUpstreamId =
    firstModel &&
    ('modelId' in firstModel
      ? firstModel.modelId
      : Object.values(firstModel.modelIdByQuality)[0])
  const jsonBlocks = isEdit
    ? () => (
        <>
          {baseProfile ? (
            <CatalogJsonDiff
              title={t('Adapter profile')}
              summary={t('Compared with the current version')}
              diff={diffCatalogJson(baseProfile, builtForPreview)}
            />
          ) : null}
          {baseContract ? (
            <CatalogJsonDiff
              title={t('API contract')}
              summary={t('Compared with the current version')}
              diff={diffCatalogJson(baseContract, builtContract())}
            />
          ) : null}
        </>
      )
    : () => (
        <>
          {isNewProvider ? (
            <CatalogJsonDiff
              title={t('API provider')}
              summary={t('New')}
              diff={diffCatalogJson(
                null,
                newProvider as unknown as CatalogJson
              )}
            />
          ) : null}
          <CatalogJsonDiff
            title={t('Adapter profile')}
            summary={
              baseProfile
                ? t('Compared with {{source}}', {
                    source: sourceId || t('the pasted JSON'),
                  })
                : t('New')
            }
            diff={diffCatalogJson(baseProfile, builtForPreview)}
          />
          <CatalogJsonDiff
            title={t('API contract')}
            summary={t('Generated from the form')}
            diff={diffCatalogJson(null, builtContract())}
          />
        </>
      )
  return (
    <div className='space-y-4'>
      <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2'>
        <Button variant='outline' size='sm' onClick={leave}>
          {t('Back to the Channel list')}
        </Button>
        <h3 className='text-sm font-medium'>{title}</h3>
        <span className='text-muted-foreground text-sm'>{summary}</span>
      </div>
      {isEdit ? null : (
        <WizardSteps
          current={1}
          channelPasted={Boolean(pasted)}
          pastedModels={pasted?.models.length ?? 0}
        />
      )}
      {jsonOpen ? (
        <JsonFillDialog
          title={t('Fill the Channel configuration from JSON')}
          summary={
            <>
              {t(
                'channel, profile and openapi are required; add provider for a new API provider, and models to add models with it. An API provider comes first, then the Channel configuration, then models.'
              )}
            </>
          }
          heads={[
            t('Key'),
            t('What it holds'),
            t('Where to get it'),
            t('Required'),
          ]}
          rows={[
            [
              'provider',
              t('API provider'),
              t('An item of providers.json'),
              t(
                'Only for a new API provider; its id equals channel.providerId'
              ),
            ],
            [
              'channel',
              t('Channel configuration'),
              t('An item of channels.json'),
              t(
                'Required. id is "provider code.Channel name"; adapterProfile.id equals profile.id'
              ),
            ],
            [
              'profile',
              t('Adapter profile'),
              t('A whole profiles/*.profile.json file'),
              t('Required'),
            ],
            [
              'openapi',
              t('API contract'),
              t('A whole openapi/*.openapi.json file'),
              t('Required, with every operationId of profile.operations'),
            ],
            [
              'models',
              t('Models'),
              t('Items of models in models.json'),
              t('Optional; filled in at the next step'),
            ],
          ].map(([key, ...cells]) => ({
            key,
            cells: [
              <code key='key' className='font-mono'>
                {key}
              </code>,
              ...cells,
            ],
          }))}
          notes={[
            t(
              'Write the content as the files of a Bundle: export the current catalog as a Bundle and use the files of the same name, or change an example below. JSON given by the filling guide is already in this format.'
            ),
            t(
              'The Channel code, version numbers and operationIds are assigned by the page; the pasted ones are not used.'
            ),
          ]}
          placeholder={`{
  "provider": { … },      ← ${t('only for a new API provider')}
  "channel": {
    "id": "acme.wan-video",
    "providerId": "acme",
    "adapterProfile": { "id": "acme.wan-video", "version": "1.0.0" }
  },
  "profile": { … },       ← ${t('the whole adapter profile file')}
  "openapi": { … },       ← ${t('the whole API contract file')}
  "models": [ … ]         ← ${t('optional, filled in at the next step')}
}`}
          example={{
            label: t('Make an example from a Channel configuration'),
            options: catalog.bundle.channels.map((channel) => ({
              value: channel.id,
              label: `${channel.id}${t('({{note}})', {
                note:
                  capabilityNames[
                    String(profileOfChannel(catalog, channel.id)?.kind)
                  ] ?? '',
              })}`,
            })),
            make: (id) => channelJsonExample(catalog, id),
          }}
          confirmFor={(parsed) => {
            const count = (parsed as { models?: unknown[] } | null)?.models
            return Array.isArray(count) && count.length
              ? t('Fill in the Channel configuration and {{count}} models', {
                  count: count.length,
                })
              : t('Fill in')
          }}
          fill={fillFromJson}
          onClose={() => setJsonOpen(false)}
        />
      ) : null}
      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next as 'form' | 'json')}
      >
        <CanvasManagementTabsList>
          <CanvasManagementTabsTrigger value='form'>
            {t('Form')}
          </CanvasManagementTabsTrigger>
          <CanvasManagementTabsTrigger value='json'>
            JSON
          </CanvasManagementTabsTrigger>
        </CanvasManagementTabsList>
        <TabsContent value='json' className='mt-4 space-y-3'>
          {tab === 'json' ? jsonBlocks() : null}
        </TabsContent>
        <TabsContent value='form' className='mt-4 space-y-3' ref={formArea}>
          <UnsupportedFieldsNotice
            paths={unsupportedProfileFields(baseProfile)}
          />
          <div className='grid items-start gap-3 min-[1181px]:grid-cols-[minmax(0,48rem)_minmax(20rem,1fr)]'>
            <div className='grid min-w-0 gap-4'>
              {!isEdit ? (
                <EditSection
                  title={t('How to create')}
                  description={t(
                    'Copy the closest Channel configuration and change only what differs; it is usually the fastest.'
                  )}
                >
                  <EditField label={t('Generation type')}>
                    {(id) => (
                      <NativeSelect
                        id={id}
                        className='w-full'
                        value={draft.capability}
                        onChange={(event) =>
                          chooseCapability(event.target.value)
                        }
                      >
                        {options.capabilities.map((capability) => (
                          <NativeSelectOption
                            key={capability}
                            value={capability}
                          >
                            {capabilityNames[capability]}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    )}
                  </EditField>
                  <EditField label={t('How to create')}>
                    {(id) => (
                      <NativeSelect
                        id={id}
                        className='w-full'
                        value={createMode}
                        onChange={(event) =>
                          chooseCreateMode(
                            event.target.value as 'copy' | 'blank' | 'json'
                          )
                        }
                      >
                        <NativeSelectOption value='copy'>
                          {t('Copy an existing Channel configuration')}
                        </NativeSelectOption>
                        <NativeSelectOption value='blank'>
                          {t('Start from blank')}
                        </NativeSelectOption>
                        <NativeSelectOption value='json'>
                          {t('Fill from JSON')}
                        </NativeSelectOption>
                      </NativeSelect>
                    )}
                  </EditField>
                  {createMode === 'copy' ? (
                    <EditField
                      error={errorOf('source')}
                      label={t('Copy from')}
                      wide
                    >
                      {(id) => (
                        <NativeSelect
                          id={id}
                          className='w-full'
                          value={sourceId}
                          onChange={(event) => chooseSource(event.target.value)}
                        >
                          <NativeSelectOption value=''>
                            {t('Please select')}
                          </NativeSelectOption>
                          {catalog.bundle.channels
                            .filter(
                              (channel) =>
                                profileOfChannel(catalog, channel.id)?.kind ===
                                draft.capability
                            )
                            .map((channel) => (
                              <NativeSelectOption
                                key={channel.id}
                                value={channel.id}
                              >
                                {channel.id}
                              </NativeSelectOption>
                            ))}
                        </NativeSelect>
                      )}
                    </EditField>
                  ) : null}
                  {createMode === 'json' ? (
                    <div className='space-y-2 md:col-span-2'>
                      {pasted ? (
                        <div
                          role='note'
                          className='bg-muted/50 space-y-1 rounded-lg border p-3 text-sm'
                        >
                          <strong className='font-medium'>
                            {t('Filled from JSON')}
                          </strong>
                          <ul className='list-disc space-y-0.5 pl-5'>
                            <li>
                              {t('API provider: {{name}}', {
                                name: isNewProvider
                                  ? t('{{name}} ({{id}}, new)', {
                                      name:
                                        newProvider.internalName ||
                                        newProvider.id,
                                      id: newProvider.id,
                                    })
                                  : t('{{name}} ({{id}}, existing)', {
                                      name:
                                        provider?.internalName ?? providerId,
                                      id: providerId,
                                    }),
                              })}
                            </li>
                            <li>
                              {t('Channel configuration:')}{' '}
                              <code className='font-mono'>{channelId}</code>
                            </li>
                          </ul>
                          {pasted.notes.map((note) => (
                            <p
                              key={note.key}
                              className='text-muted-foreground text-xs [overflow-wrap:anywhere]'
                            >
                              {issueText(note)}
                            </p>
                          ))}
                          <p className='text-muted-foreground text-xs'>
                            {t('The form below can still be changed.')}
                          </p>
                        </div>
                      ) : (
                        <p className='text-muted-foreground text-xs'>
                          {t(
                            'Paste the Channel configuration, adapter profile and API contract in the Bundle format; they fill the form below.'
                          )}
                        </p>
                      )}
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => setJsonOpen(true)}
                      >
                        {pasted ? t('Paste JSON again') : t('Paste JSON')}
                      </Button>
                      {errorOf('json') ? (
                        <p role='alert' className='text-destructive text-xs'>
                          {errorOf('json')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </EditSection>
              ) : null}
              {isEdit ? (
                <EditSection
                  title={t('Channel configuration')}
                  description={t('These cannot change after creation.')}
                >
                  <EditField label={t('Channel code')}>
                    {() => (
                      <p className='min-h-8 py-1.5 font-mono text-sm'>
                        {mode.channelId}
                      </p>
                    )}
                  </EditField>
                  <EditField label={t('Generation type')}>
                    {() => (
                      <p className='min-h-8 py-1.5 text-sm'>
                        {capabilityNames[draft.capability]}
                      </p>
                    )}
                  </EditField>
                  <EditField label={t('API provider')}>
                    {() => (
                      <p className='min-h-8 py-1.5 text-sm'>
                        {provider?.internalName}
                      </p>
                    )}
                  </EditField>
                  <EditField label={t('Base address')}>
                    {() => (
                      <p className='min-h-8 py-1.5 font-mono text-sm break-all'>
                        {baseUrl}
                      </p>
                    )}
                  </EditField>
                </EditSection>
              ) : null}
              {!isEdit && ready ? (
                <EditSection
                  title={t('Channel configuration')}
                  description={t('Which API provider this Channel belongs to.')}
                >
                  <EditField
                    label={t('API provider')}
                    error={errorOf('provider')}
                  >
                    {(id) => (
                      <NativeSelect
                        id={id}
                        className='w-full'
                        value={providerId}
                        onChange={(event) => setProviderId(event.target.value)}
                      >
                        <NativeSelectOption value=''>
                          {t('Please select')}
                        </NativeSelectOption>
                        {catalog.bundle.providers.map((entry) => (
                          <NativeSelectOption key={entry.id} value={entry.id}>
                            {entry.internalName}
                          </NativeSelectOption>
                        ))}
                        <NativeSelectOption value='__new'>
                          {t('+ New API provider')}
                        </NativeSelectOption>
                      </NativeSelect>
                    )}
                  </EditField>
                  <EditField
                    label={t('Channel name')}
                    error={errorOf('channelName')}
                    help={
                      effectiveProviderId
                        ? t(
                            'Tells apart the Channels of one API provider; lowercase letters, numbers and hyphens only. Code: {{code}}',
                            { code: channelId }
                          )
                        : t(
                            'The Channel code is generated after you choose an API provider'
                          )
                    }
                  >
                    {(id, describedBy) => (
                      <Input
                        id={id}
                        className='font-mono'
                        aria-describedby={describedBy}
                        placeholder={t('For example {{value}}', {
                          value:
                            {
                              'video.generate': 'wan-video',
                              'image.generate': 'gpt-image',
                              'chat.generate': 'deepseek-chat',
                            }[draft.capability] ?? '',
                        })}
                        value={channelName}
                        onChange={(event) =>
                          setChannelName(event.target.value.trim())
                        }
                      />
                    )}
                  </EditField>
                  {isNewProvider ? (
                    <>
                      <EditField
                        label={t('Internal name')}
                        error={errorOf('newProvider.internalName')}
                      >
                        {(id) => (
                          <Input
                            id={id}
                            placeholder={t('For example {{value}}', {
                              value: 'Acme API',
                            })}
                            value={newProvider.internalName}
                            onChange={(event) => {
                              const internalName = event.target.value
                              setNewProvider((current) => ({
                                ...current,
                                internalName,
                                id: internalName
                                  .toLowerCase()
                                  .replaceAll(/[^a-z0-9-]+/g, ''),
                              }))
                            }}
                          />
                        )}
                      </EditField>
                      <EditField
                        label={t('API provider code')}
                        error={errorOf('newProvider.id')}
                        help={t('Cannot change after creation')}
                      >
                        {(id, describedBy) => (
                          <Input
                            id={id}
                            className='font-mono'
                            aria-describedby={describedBy}
                            placeholder={t('For example {{value}}', {
                              value: 'acme',
                            })}
                            value={newProvider.id}
                            onChange={(event) =>
                              setNewProvider((current) => ({
                                ...current,
                                id: event.target.value.trim(),
                              }))
                            }
                          />
                        )}
                      </EditField>
                      <EditField
                        label={t('Base address')}
                        error={errorOf('newProvider.baseUrl')}
                      >
                        {(id) => (
                          <Input
                            id={id}
                            className='font-mono'
                            placeholder='https://api.example.com'
                            value={newProvider.baseUrl}
                            onChange={(event) =>
                              setNewProvider((current) => ({
                                ...current,
                                baseUrl: event.target.value.trim(),
                              }))
                            }
                          />
                        )}
                      </EditField>
                      <EditField label={t('Source type')}>
                        {(id) => (
                          <NativeSelect
                            id={id}
                            className='w-full'
                            value={newProvider.sourceKind}
                            onChange={(event) =>
                              setNewProvider((current) => ({
                                ...current,
                                sourceKind: event.target.value as
                                  | 'relay'
                                  | 'official',
                              }))
                            }
                          >
                            <NativeSelectOption value='relay'>
                              {t('Relay')}
                            </NativeSelectOption>
                            <NativeSelectOption value='official'>
                              {t('Official')}
                            </NativeSelectOption>
                          </NativeSelect>
                        )}
                      </EditField>
                    </>
                  ) : null}
                  {!isNewProvider && providerId ? (
                    <EditField label={t('Base address')}>
                      {() => (
                        <p className='min-h-8 py-1.5 font-mono text-sm break-all'>
                          {baseUrl}
                        </p>
                      )}
                    </EditField>
                  ) : null}
                </EditSection>
              ) : null}
              {ready ? (
                <>
                  <EditSection
                    title={t('Call method')}
                    description={t(
                      'How the upstream is called, and where the submit request goes.'
                    )}
                  >
                    <EditField
                      label={t('Call method')}
                      help={
                        isEdit || isChat
                          ? undefined
                          : t(
                              'Choose asynchronous when submit returns a task ID and the result is queried later; choose synchronous when one request returns the result.'
                            )
                      }
                    >
                      {(id, describedBy) =>
                        isEdit || isChat ? (
                          <p className='min-h-8 py-1.5 text-sm'>
                            {workflowLabel(t, draft.workflow)}
                          </p>
                        ) : (
                          <NativeSelect
                            id={id}
                            className='w-full'
                            aria-describedby={describedBy}
                            value={draft.workflow}
                            onChange={(event) =>
                              set({ workflow: event.target.value })
                            }
                          >
                            {options.workflows.map((workflow) => (
                              <NativeSelectOption
                                key={workflow}
                                value={workflow}
                              >
                                {workflowLabel(t, workflow)}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        )
                      }
                    </EditField>
                    <OperationFields
                      error={errorOf('submit.path')}
                      label={t('Submit path')}
                      help={isChat ? undefined : formatHelp}
                      operation={draft.submit}
                      placeholder={paths.submit ?? ''}
                      withFormat={!isChat}
                      onChange={(submit) => set({ submit })}
                    />
                    {isChat ? (
                      <div className='md:col-span-2'>
                        <SwitchField
                          label={t('Streaming response')}
                          checked={draft.streaming}
                          onChange={setChatStreaming}
                        />
                        <p className='text-muted-foreground text-xs'>
                          {t(
                            'Turn it on when the upstream returns text in parts. An upstream whose documents have a stream parameter usually supports it.'
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className='md:col-span-2'>
                        <SwitchField
                          label={t('Use another submit with reference images')}
                          checked={Boolean(draft.images)}
                          onChange={(next) =>
                            set({
                              images: next
                                ? {
                                    method: 'POST',
                                    path: '',
                                    format: 'application/json',
                                  }
                                : null,
                              imageRows:
                                next && draft.imageRows.length === 0
                                  ? [...draft.rows]
                                  : draft.imageRows,
                            })
                          }
                        />
                        <p className='text-muted-foreground text-xs'>
                          {t(
                            'Turn it on when generation and editing are two addresses, such as /v1/images/generations and /v1/images/edits.'
                          )}
                        </p>
                      </div>
                    )}
                    {draft.images ? (
                      <OperationFields
                        error={errorOf('images.path')}
                        label={t('Submit with reference images')}
                        help={formatHelp}
                        operation={draft.images}
                        placeholder={paths.images ?? ''}
                        withFormat
                        onChange={(images) => set({ images })}
                      />
                    ) : null}
                  </EditSection>
                  <EditSection
                    title={t('Request fields')}
                    description={`${t('The fields sent to the upstream on submit. Write field names as in the upstream documents; nested fields use dots, such as metadata.ratio.')}${(draft.images ?? draft.submit).format === 'multipart/form-data' ? ` ${t('Plain fields of a file form are all sent as text.')}` : ''}`}
                  >
                    {draft.images ? (
                      <Tabs
                        className='md:col-span-2'
                        value={activeTab}
                        onValueChange={(next) => setActiveTab(next as 'body')}
                      >
                        <CanvasManagementTabsList>
                          <CanvasManagementTabsTrigger value='body'>
                            {t('Submit path')}
                            {rowIssues('rows') ? (
                              <span className='text-destructive ml-1'>
                                ({rowIssues('rows')})
                              </span>
                            ) : null}
                          </CanvasManagementTabsTrigger>
                          <CanvasManagementTabsTrigger value='bodyWithImages'>
                            {t('Submit with reference images')}
                            {rowIssues('imageRows') ? (
                              <span className='text-destructive ml-1'>
                                ({rowIssues('imageRows')})
                              </span>
                            ) : null}
                          </CanvasManagementTabsTrigger>
                        </CanvasManagementTabsList>
                        <TabsContent value='body' className='mt-3'>
                          <RowsEditor
                            name='rows'
                            errorOf={errorOf}
                            {...rowModels}
                            materials={materialsFor('rows')}
                            rows={draft.rows}
                            capability={draft.capability}
                            onChange={(rows) => set({ rows })}
                          />
                        </TabsContent>
                        <TabsContent value='bodyWithImages' className='mt-3'>
                          <RowsEditor
                            name='imageRows'
                            errorOf={errorOf}
                            {...rowModels}
                            materials={materialsFor('imageRows')}
                            rows={draft.imageRows}
                            capability={draft.capability}
                            onChange={(imageRows) => set({ imageRows })}
                          />
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <RowsEditor
                        name='rows'
                        errorOf={errorOf}
                        {...rowModels}
                        materials={materialsFor('rows')}
                        rows={draft.rows}
                        capability={draft.capability}
                        onChange={(rows) => set({ rows })}
                      />
                    )}
                    {unsentParams.length ? (
                      <p className='text-muted-foreground text-xs md:col-span-2'>
                        {t(
                          'The models set {{params}}; this Channel does not send it to the upstream.',
                          { params: unsentParams.join(', ') }
                        )}
                      </p>
                    ) : null}
                  </EditSection>
                  {mediaKinds.length ? (
                    <EditSection
                      title={t('Materials')}
                      description={t(
                        'How user materials reach the upstream; choose from the upstream documents.'
                      )}
                    >
                      {mediaKinds.map((kind) => (
                        <EditField
                          key={kind}
                          error={errorOf(`media.${kind}`)}
                          label={t('{{kind}} delivery', {
                            kind: kindLabels[kind],
                          })}
                          help={deliveryHints[draft.media[kind]]}
                        >
                          {(id, describedBy) => (
                            <NativeSelect
                              id={id}
                              className='w-full'
                              aria-describedby={describedBy}
                              value={draft.media[kind]}
                              onChange={(event) =>
                                set({
                                  media: {
                                    ...draft.media,
                                    [kind]: event.target.value,
                                  },
                                })
                              }
                            >
                              {deliveries.map((delivery) => (
                                <NativeSelectOption
                                  key={delivery}
                                  value={delivery}
                                >
                                  {deliveryLabels[delivery] ?? delivery}
                                </NativeSelectOption>
                              ))}
                            </NativeSelect>
                          )}
                        </EditField>
                      ))}
                    </EditSection>
                  ) : null}
                  {draft.workflow === 'asset-async' ? (
                    <EditSection
                      title={t('Upload materials')}
                      description={t(
                        'Before the task is submitted, materials are uploaded to the upstream; submit sends the material ID the upstream returned.'
                      )}
                    >
                      <OperationFields
                        error={errorOf('prepareAsset.path')}
                        label={t('Upload path')}
                        operation={draft.prepareAsset}
                        placeholder={paths.prepareAsset ?? ''}
                        withFormat
                        onChange={(prepareAsset) => set({ prepareAsset })}
                      />
                      <OperationFields
                        error={errorOf('pollAsset.path')}
                        label={t('Material status path')}
                        help={t(
                          'Fill it in when the upstream needs time after an upload; the path has a placeholder for the material ID. Leave it empty when a material is usable at once.'
                        )}
                        operation={draft.pollAsset}
                        placeholder={paths.pollAsset ?? ''}
                        withFormat={false}
                        onChange={(pollAsset) => set({ pollAsset })}
                      />
                      {assetKinds.map((kind) => {
                        const asset = draft.asset[kind]
                        const setAsset = (next: Partial<typeof asset>) =>
                          set({
                            asset: {
                              ...draft.asset,
                              [kind]: { ...asset, ...next },
                            },
                          })
                        return (
                          <div
                            key={kind}
                            className='grid gap-3 md:col-span-2 md:grid-cols-2'
                          >
                            <strong className='font-medium md:col-span-2'>
                              {kindLabels[kind]}
                            </strong>
                            <EditField
                              error={errorOf(`asset.${kind}.body`)}
                              label={t('Upload request body (JSON)')}
                              wide
                              help={t(
                                'Can use the material address request.mediaPublicUrl, the file name request.mediaSafeName and the type request.mediaAssetType (Image, Video, Audio). The upload materials request on the right shows what is sent.'
                              )}
                            >
                              {(id, describedBy) => (
                                <Textarea
                                  id={id}
                                  aria-describedby={describedBy}
                                  rows={3}
                                  className='font-mono text-xs'
                                  value={asset.body}
                                  onChange={(event) =>
                                    setAsset({ body: event.target.value })
                                  }
                                />
                              )}
                            </EditField>
                            <EditField
                              error={errorOf(`asset.${kind}.remoteIdPaths`)}
                              label={t('Material ID path')}
                              help={taskPathHelp}
                            >
                              {(id, describedBy) => (
                                <Input
                                  id={id}
                                  aria-describedby={describedBy}
                                  className='font-mono'
                                  placeholder='data.id'
                                  value={asset.remoteIdPaths}
                                  onChange={(event) =>
                                    setAsset({
                                      remoteIdPaths: event.target.value,
                                    })
                                  }
                                />
                              )}
                            </EditField>
                            <EditField
                              label={t('Status path')}
                              help={statusPathHelp}
                            >
                              {(id, describedBy) => (
                                <Input
                                  id={id}
                                  aria-describedby={describedBy}
                                  className='font-mono'
                                  placeholder='data.status'
                                  value={asset.statusPaths}
                                  onChange={(event) =>
                                    setAsset({
                                      statusPaths: event.target.value,
                                    })
                                  }
                                />
                              )}
                            </EditField>
                            <EditField
                              error={errorOf(`asset.${kind}.readyValues`)}
                              label={t('Ready values')}
                            >
                              {(id) => (
                                <Input
                                  id={id}
                                  className='font-mono'
                                  placeholder='ready'
                                  value={asset.readyValues}
                                  onChange={(event) =>
                                    setAsset({
                                      readyValues: event.target.value,
                                    })
                                  }
                                />
                              )}
                            </EditField>
                            <EditField label={t('Processing values')}>
                              {(id) => (
                                <Input
                                  id={id}
                                  className='font-mono'
                                  placeholder='processing'
                                  value={asset.pendingValues}
                                  onChange={(event) =>
                                    setAsset({
                                      pendingValues: event.target.value,
                                    })
                                  }
                                />
                              )}
                            </EditField>
                            <EditField
                              error={errorOf(`asset.${kind}.failedValues`)}
                              label={t('Failure values')}
                            >
                              {(id) => (
                                <Input
                                  id={id}
                                  className='font-mono'
                                  placeholder='failed'
                                  value={asset.failedValues}
                                  onChange={(event) =>
                                    setAsset({
                                      failedValues: event.target.value,
                                    })
                                  }
                                />
                              )}
                            </EditField>
                            <EditField
                              label={t('Valid for (seconds)')}
                              help={t(
                                'Leave it empty when the material does not expire on the upstream.'
                              )}
                            >
                              {(id, describedBy) => (
                                <Input
                                  id={id}
                                  aria-describedby={describedBy}
                                  type='number'
                                  value={asset.expiresInSeconds}
                                  onChange={(event) =>
                                    setAsset({
                                      expiresInSeconds: event.target.value,
                                    })
                                  }
                                />
                              )}
                            </EditField>
                          </div>
                        )
                      })}
                    </EditSection>
                  ) : null}
                  <ChannelResponseSection
                    key={`${sourceId}:${createMode}:${draft.capability}`}
                    draft={draft}
                    set={set}
                    errorOf={errorOf}
                    pollPlaceholder={paths.poll ?? ''}
                    defaultPollIntervalMs={options.defaults.pollIntervalMs}
                    usageChoices={usageChoices}
                    taskPathHelp={taskPathHelp}
                    statusPathHelp={statusPathHelp}
                    dottedHelp={dottedHelp}
                  />
                  {isEdit && optionRows.length && onChannel.length ? (
                    <EditSection
                      title={t('Values of each model')}
                      description={t(
                        'Each custom parameter above has one value per model. Fill them in here; they are saved when the Channel configuration is published.'
                      )}
                    >
                      <div className='space-y-2 md:col-span-2'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <span className='text-muted-foreground text-sm'>
                            {t('All models')}
                          </span>
                          {optionRows.map((row) => {
                            const key = row.optionKey ?? paramKeyOf(row.field)
                            return (
                              <Input
                                key={row.field}
                                aria-label={t('Fill {{field}} for all models', {
                                  field: row.field,
                                })}
                                className='w-48 font-mono'
                                placeholder={row.field}
                                onChange={(event) => {
                                  const text = event.target.value
                                  setPlan(null)
                                  setModelValues((current) => ({
                                    ...current,
                                    ...Object.fromEntries(
                                      onChannel
                                        .filter(
                                          (model) =>
                                            !userChoiceOrSkipped(model, key)
                                        )
                                        .map((model) => [
                                          model.productKey,
                                          {
                                            ...current[model.productKey],
                                            [key]: text,
                                          },
                                        ])
                                    ),
                                  }))
                                }}
                              />
                            )
                          })}
                        </div>
                        <StaticDataTable
                          data={onChannel}
                          getRowKey={(model) => model.productKey}
                          emptyContent={t('No models')}
                          columns={[
                            {
                              id: 'model',
                              header: t('Model'),
                              cell: (model) => (
                                <span className='font-medium'>
                                  {model.displayName}
                                </span>
                              ),
                            },
                            ...optionRows.map((row) => {
                              const key = row.optionKey ?? paramKeyOf(row.field)
                              return {
                                id: row.field,
                                header: (
                                  <span className='font-mono'>{row.field}</span>
                                ),
                                cell: (model: CatalogModelDefinition) => {
                                  const stored =
                                    model.release.publicInteraction
                                      .defaultParams[key]
                                  if (userChoiceOrSkipped(model, key)) {
                                    return (
                                      <button
                                        type='button'
                                        className='text-primary text-sm hover:underline'
                                        onClick={() =>
                                          openModel(model.productKey)
                                        }
                                      >
                                        {skipped(model, key)
                                          ? t(
                                              'Not sent; change it on the model page'
                                            )
                                          : t(
                                              'User chooses; change it on the model page'
                                            )}
                                      </button>
                                    )
                                  }
                                  const cellError = errorOf(
                                    `values.${model.productKey}.${key}`
                                  )
                                  return (
                                    <>
                                      <Input
                                        aria-label={t(
                                          '{{field}} of {{model}}',
                                          {
                                            field: row.field,
                                            model: model.displayName,
                                          }
                                        )}
                                        aria-invalid={
                                          cellError ? true : undefined
                                        }
                                        className='font-mono'
                                        placeholder={t('Please fill in')}
                                        value={
                                          modelValues[model.productKey]?.[
                                            key
                                          ] ??
                                          (stored === undefined
                                            ? ''
                                            : String(stored))
                                        }
                                        onChange={(event) => {
                                          setPlan(null)
                                          setModelValues((current) => ({
                                            ...current,
                                            [model.productKey]: {
                                              ...current[model.productKey],
                                              [key]: event.target.value,
                                            },
                                          }))
                                        }}
                                      />
                                      {cellError ? (
                                        <p
                                          role='alert'
                                          className='text-destructive mt-1 text-xs'
                                        >
                                          {cellError}
                                        </p>
                                      ) : null}
                                    </>
                                  )
                                },
                              }
                            }),
                          ]}
                        />
                      </div>
                    </EditSection>
                  ) : null}
                  <EditSection
                    title={t('Advanced settings')}
                    description={t(
                      'Usually empty. Fill them in only when the upstream documents demand it.'
                    )}
                  >
                    {isChat ? null : (
                      <>
                        <EditField
                          label={t('Image reference in the prompt')}
                          help={t(
                            'The user writes @图片1; this form reaches the upstream. For example 图片{n} sends 图片1. Empty keeps @图片1.'
                          )}
                        >
                          {(id, describedBy) => (
                            <Input
                              id={id}
                              className='font-mono'
                              aria-describedby={describedBy}
                              placeholder='@图片{n}'
                              value={draft.promptImage}
                              onChange={(event) =>
                                set({ promptImage: event.target.value })
                              }
                            />
                          )}
                        </EditField>
                        <EditField
                          label={t('Video reference in the prompt')}
                          help={t('The same, for @视频1; empty keeps it.')}
                        >
                          {(id, describedBy) => (
                            <Input
                              id={id}
                              className='font-mono'
                              aria-describedby={describedBy}
                              placeholder='@视频{n}'
                              value={draft.promptVideo}
                              onChange={(event) =>
                                set({ promptVideo: event.target.value })
                              }
                            />
                          )}
                        </EditField>
                        <EditField
                          label={t('Audio reference in the prompt')}
                          help={t('The same, for @音频1; empty keeps it.')}
                        >
                          {(id, describedBy) => (
                            <Input
                              id={id}
                              className='font-mono'
                              aria-describedby={describedBy}
                              placeholder='@音频{n}'
                              value={draft.promptAudio}
                              onChange={(event) =>
                                set({ promptAudio: event.target.value })
                              }
                            />
                          )}
                        </EditField>
                      </>
                    )}
                    {polls ? (
                      <EditField
                        label={t('Idempotency header')}
                        help={t(
                          'Prevents a network retry from creating another task. Fill it in when the upstream documents have this header, such as Idempotency-Key. Each submit sends one unique value, unchanged when the same submit is sent again.'
                        )}
                      >
                        {(id, describedBy) => (
                          <Input
                            id={id}
                            className='font-mono'
                            aria-describedby={describedBy}
                            placeholder={t('Not sent')}
                            value={draft.idempotencyHeader}
                            onChange={(event) =>
                              set({ idempotencyHeader: event.target.value })
                            }
                          />
                        )}
                      </EditField>
                    ) : null}
                    <EditField
                      error={errorOf('maxMultipartBytes')}
                      label={t('File form limit (bytes)')}
                      help={t(
                        'Empty allows 2 GB. Fill it in when the upstream limit is smaller; for example 64 MB is 67108864. It only applies to file forms.'
                      )}
                    >
                      {(id, describedBy) => (
                        <Input
                          id={id}
                          type='number'
                          aria-describedby={describedBy}
                          placeholder={String(
                            options.defaults.maxMultipartBytes
                          )}
                          value={draft.maxMultipartBytes}
                          onChange={(event) =>
                            set({ maxMultipartBytes: event.target.value })
                          }
                        />
                      )}
                    </EditField>
                    <EditField label={t('Base address use')} help={rootHint}>
                      {(id, describedBy) => (
                        <NativeSelect
                          id={id}
                          className='w-full'
                          aria-describedby={describedBy}
                          value={draft.baseUrlMode}
                          onChange={(event) =>
                            set({ baseUrlMode: event.target.value })
                          }
                        >
                          <NativeSelectOption value=''>
                            {t('Use the full base address')}
                          </NativeSelectOption>
                          <NativeSelectOption value='origin'>
                            {t('Use the domain only')}
                          </NativeSelectOption>
                        </NativeSelect>
                      )}
                    </EditField>
                  </EditSection>
                </>
              ) : null}
            </div>
            {ready ? (
              <ChannelPreview
                draft={draft}
                body={
                  draft.images && activeTab === 'bodyWithImages'
                    ? 'imageRows'
                    : 'rows'
                }
                mode={mediaMode}
                onMode={setMediaMode}
                profile={builtForPreview}
                baseUrl={baseUrl}
                upstreamId={firstUpstreamId}
                {...(previewDefaults ? { defaults: previewDefaults } : {})}
              />
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
      <LeaveConfirm
        open={leaving}
        onOpenChange={(open) => {
          setLeaving(open)
          if (!open) setLeaveToModel(null)
        }}
        onLeave={() =>
          leaveToModel ? props.onEditModel(leaveToModel) : props.onClose()
        }
      />
      {plan && isEdit ? (
        <ChannelPublishDialog
          plan={plan}
          baseProfile={baseProfile}
          contractChanged={!sameDocument(baseContract, builtContractDocument)}
          busy={publish.isPending}
          error={error}
          onClose={() => setPlan(null)}
          onConfirm={() => publish.mutate(plan.planToken)}
        />
      ) : null}
      <EditorFooter>
        <span
          className={`min-w-0 flex-1 text-sm font-medium ${issues.length || error ? 'text-destructive' : 'text-muted-foreground'}`}
          role={issues.length || error ? 'alert' : undefined}
        >
          {error ??
            (issues.length
              ? t('Correct the {{count}} marked fields first', {
                  count: issues.length,
                })
              : '')}
        </span>
        <Button variant='outline' onClick={leave}>
          {t('Cancel')}
        </Button>
        {isEdit ? (
          <Button disabled={validate.isPending} onClick={submit}>
            {t('Validate and publish')}
          </Button>
        ) : (
          <>
            <Button
              variant='outline'
              disabled={validate.isPending}
              onClick={submit}
            >
              {t('Save the Channel configuration')}
            </Button>
            <Button onClick={goNext}>{t('Next: add models')}</Button>
          </>
        )}
      </EditorFooter>
    </div>
  )
}
