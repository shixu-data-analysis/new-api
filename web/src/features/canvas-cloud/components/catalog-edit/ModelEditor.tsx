/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { defaultParamsIssues } from '@pixmiao/model-catalog/request-validator'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import {
  getCatalogEditorOptions,
  getCatalogModelVersion,
  getCurrentCatalog,
  planCatalogEdit,
  publishCatalogEdit,
  type CatalogEditPlan,
} from '../../catalog-edit-api'
import {
  changedPaths,
  contractOfProfile,
  displayPath,
  followSelections,
  generatedProductKey,
  prefillSizeMap,
  profileOfChannel,
  readPath,
  replayChanges,
  replayConflicts,
  sentFieldsOf,
  sizeParamOf,
  unsupportedModelFields,
  upstreamModelIdsOf,
  usageProtocolOf,
  writePath,
} from '../../catalog-edit-logic'
import type {
  CatalogCapability,
  CatalogEditDraft,
  CatalogEditDraftModel,
  CatalogModelDefinition,
  CatalogModelVersionFact,
  CurrentCatalogView,
} from '../../catalog-edit-types'
import { useModelManagementEditorPage } from '../../model-management-editor-page-context'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from '../CanvasManagementTabs'
import { CanvasPreview } from './CanvasPreview'
import {
  catalogEditErrorText,
  catalogEditFailure,
  catalogErrorField,
} from './catalog-edit-errors'
import { ComparedWithContext } from './compared-with-context'
import {
  EditField,
  EditorFooter,
  EditSection,
  LeaveConfirm,
  SwitchField,
} from './EditFields'
import {
  ModelMediaSection,
  ModelParametersSection,
  ModelReferenceSection,
  ModelSizeSection,
  ModelTokenSection,
  UnsupportedFieldsNotice,
} from './ModelEditorSections'
import { ModelJsonView } from './ModelJsonView'
import { ModelPublishPreview } from './ModelPublishPreview'

export type ModelEditorMode =
  | { kind: 'edit'; modelKey: string }
  | { kind: 'copy'; modelKey: string }
  | { kind: 'new'; channelId: string }

const VERSION_CHECK_MS = 30_000

function blankModel(
  catalog: CurrentCatalogView,
  channelId: string
): CatalogModelDefinition {
  const profile = profileOfChannel(catalog, channelId)
  const provider = catalog.bundle.providers.find(
    (entry) =>
      entry.id ===
      catalog.bundle.channels.find((channel) => channel.id === channelId)
        ?.providerId
  )
  return {
    productKey: '',
    displayName: '',
    description: '',
    capability: (profile?.kind ?? 'image.generate') as CatalogCapability,
    sourceKind: provider?.sourceKind ?? 'relay',
    release: {
      channelId,
      execution: { providerModel: { modelId: '' } },
      publicInteraction: {
        defaultParams: {},
        paramSchema: {},
        referenceLimits: {},
      },
    },
  }
}

function copyOf(
  source: CatalogModelDefinition,
  displayName: string
): CatalogModelDefinition {
  return { ...structuredClone(source), displayName, productKey: '' }
}

function withoutEmpty(model: CatalogModelDefinition): CatalogModelDefinition {
  const interaction = model.release.publicInteraction
  if (
    interaction.mediaConstraints &&
    Object.values(interaction.mediaConstraints).every(
      (entry) => !entry || Object.keys(entry as object).length === 0
    )
  ) {
    const { mediaConstraints: _empty, ...rest } = interaction
    return { ...model, release: { ...model.release, publicInteraction: rest } }
  }
  return model
}

/** Inside the new Channel flow: the Channel is not published yet, so the parent keeps the draft and publishes all together. */
export interface EmbeddedModelEditor {
  /** Typed once on this page: every model added here shares the API Key of a provider that has none. */
  apiKey: string
  onApiKeyChange: (apiKey: string) => void
  extraDraft: Pick<CatalogEditDraft, 'providers' | 'channels'>
  onChange: (
    model: CatalogModelDefinition | null,
    credentialGroup: string
  ) => void
  initialDraft?: CatalogModelDefinition | null
  initialCredentialGroup?: string
  /** The other models added on this page; they are published with this one. */
  others?: CatalogEditDraftModel[]
  slots?: {
    tabs: Array<{ id: string; name: string }>
    index: number
    onShow: (index: number) => void
    onAdd: () => void
    onCopy: () => void
    onRemove: () => void
  }
  /** Step 2 of a new Channel: its identity is fixed, and it can publish without any model. */
  wizard?: { title: string; onBack: () => void; onChannelOnly: () => void }
  onNewChannel?: () => void
}

export function ModelEditor(props: {
  mode: ModelEditorMode
  catalogOverride?: CurrentCatalogView
  embedded?: EmbeddedModelEditor
  onClose: (published?: string) => void
  onEditPresentation: (modelKey: string) => void
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
    <LoadedEditor
      {...props}
      catalog={props.catalogOverride ?? catalogQuery.data}
      options={optionsQuery.data}
    />
  )
}

function LoadedEditor(props: {
  mode: ModelEditorMode
  catalog: CurrentCatalogView
  options: Awaited<ReturnType<typeof getCatalogEditorOptions>>
  embedded?: EmbeddedModelEditor
  onClose: (published?: string) => void
  onEditPresentation: (modelKey: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { mode, catalog, options, embedded } = props
  useModelManagementEditorPage()
  const sourceKey = mode.kind === 'new' ? null : mode.modelKey
  const source = sourceKey
    ? (catalog.bundle.models.find((model) => model.productKey === sourceKey) ??
      null)
    : null
  const initialBase = mode.kind === 'edit' ? source : null
  const [base, setBase] = useState<CatalogModelDefinition | null>(initialBase)
  const [baseVersion, setBaseVersion] = useState<number | null>(
    mode.kind === 'edit'
      ? (catalog.versions.models[mode.modelKey] ?? null)
      : null
  )
  const [draft, setDraft] = useState<CatalogModelDefinition>(() => {
    if (mode.kind === 'edit' && source) return structuredClone(source)
    if (mode.kind === 'copy' && source) {
      return copyOf(source, t('{{name}} copy', { name: source.displayName }))
    }
    return (
      embedded?.initialDraft ??
      blankModel(catalog, mode.kind === 'new' ? mode.channelId : '')
    )
  })
  const [chosenCapability, setChosenCapability] = useState<CatalogCapability>(
    draft.capability
  )
  const [chosenProvider, setChosenProvider] = useState('')
  const [keyEdited, setKeyEdited] = useState(false)
  const [tab, setTab] = useState<'form' | 'json'>('form')
  const [plan, setPlan] = useState<CatalogEditPlan | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [jsonError, setJsonError] = useState<string>()
  const [typedKey, setTypedKey] = useState(embedded?.apiKey ?? '')
  const [credentialGroup, setCredentialGroup] = useState<string>(
    sourceKey
      ? (catalog.modelCredentialGroups[sourceKey] ?? '')
      : (embedded?.initialCredentialGroup ?? '')
  )
  const [inherit, setInherit] = useState({ category: true, icon: true })
  const [latest, setLatest] = useState<CatalogModelVersionFact | null>(null)
  const [choices, setChoices] = useState<Record<string, 'mine' | 'theirs'>>({})
  const [showSizeTable, setShowSizeTable] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [channelOnly, setChannelOnly] = useState(false)
  const offered = useRef(new Set<string>())
  const [prefilled, setPrefilled] = useState(0)
  const idempotencyKey = useRef(crypto.randomUUID())
  const formArea = useRef<HTMLDivElement>(null)
  const autoDefaultQuality = useRef(false)
  const lastModelId = useRef('')

  const channel = catalog.bundle.channels.find(
    (entry) => entry.id === draft.release.channelId
  )
  const provider = catalog.bundle.providers.find(
    (entry) => entry.id === channel?.providerId
  )
  const profile = profileOfChannel(catalog, draft.release.channelId)
  const contract = profile ? contractOfProfile(catalog, profile) : undefined
  const sent = useMemo(
    () => sentFieldsOf(profile, contract),
    [profile, contract]
  )
  const sizeParam = sizeParamOf(profile)
  const usageProtocol = usageProtocolOf(profile)
  const catalogValues = useMemo(() => {
    return (capability: CatalogCapability, field: string) => [
      ...new Set(
        catalog.bundle.models
          .filter((model) => model.capability === capability)
          .flatMap(
            (model) =>
              (model.release.publicInteraction.paramSchema[field] ??
                []) as string[]
          )
      ),
    ]
  }, [catalog])

  // Design 6.2: found on the page, not when publishing is refused.
  useEffect(() => {
    if (mode.kind !== 'edit') return
    let active = true
    const check = () => {
      void getCatalogModelVersion(mode.modelKey)
        .then((fact) => {
          if (active && baseVersion !== null && fact.version > baseVersion) {
            setLatest(fact)
          }
        })
        .catch(() => undefined)
    }
    const timer = window.setInterval(check, VERSION_CHECK_MS)
    window.addEventListener('focus', check)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', check)
    }
  }, [mode, baseVersion])

  const latestCatalog = useQuery({
    queryKey: ['canvas-cloud', 'model-catalog', 'current', latest?.version],
    queryFn: getCurrentCatalog,
    enabled: Boolean(latest),
  })
  const latestModel =
    latest && latestCatalog.data
      ? (latestCatalog.data.bundle.models.find(
          (model) => model.productKey === latest.modelKey
        ) ?? null)
      : null
  const conflicts = useMemo(
    () =>
      latestModel && base ? replayConflicts(base, draft, latestModel) : [],
    [latestModel, base, draft]
  )

  const update = (
    recipe: (model: CatalogModelDefinition) => CatalogModelDefinition
  ) => {
    setPlan(null)
    setDraft((current) => {
      const followed = followSelections(current, recipe(current), {
        base: compared,
        autoDefaultQuality: autoDefaultQuality.current,
        lastModelId: lastModelId.current,
      })
      autoDefaultQuality.current = followed.autoDefaultQuality
      let next = followed.model
      const interaction = next.release.publicInteraction
      // Without a count field several results can only come from several calls.
      if (
        next.capability !== 'chat.generate' &&
        !sent.batchSize.length &&
        Number(interaction.paramSchema.maxBatchSize) > 1 &&
        !interaction.defaultParams.multiResultMode
      ) {
        next = writePath(
          next,
          [
            'release',
            'publicInteraction',
            'defaultParams',
            'multiResultMode',
          ].join('\u0000'),
          'fanout'
        )
      }
      if (!sizeParam && !showSizeTable && !interaction.defaultParams.sizeMap) {
        return next
      }
      const ratios = (interaction.paramSchema.aspectRatios ?? []) as string[]
      const qualities = (interaction.paramSchema.qualities ?? []) as string[]
      const result = prefillSizeMap(
        (interaction.defaultParams.sizeMap ?? {}) as Record<
          string,
          Record<string, string>
        >,
        ratios,
        qualities,
        offered.current
      )
      offered.current = result.offered
      if (result.filled) setPrefilled((count) => count + result.filled)
      return writePath(
        next,
        ['release', 'publicInteraction', 'defaultParams', 'sizeMap'].join(
          '\u0000'
        ),
        Object.keys(result.sizeMap).length ? result.sizeMap : undefined
      )
    })
  }
  const setInteraction = (keys: string[], value: unknown) =>
    update((current) =>
      writePath(
        current,
        ['release', 'publicInteraction', ...keys].join('\u0000'),
        value
      )
    )
  // A copy is compared with its source, so what was changed on purpose stays visible.
  const compared = base ?? (mode.kind === 'copy' ? source : null)
  const was = (keys: string[]) => {
    if (!compared) return undefined
    const joined = ['release', 'publicInteraction', ...keys].join('\u0000')
    const before = readPath(compared, joined)
    if (JSON.stringify(before) === JSON.stringify(readPath(draft, joined))) {
      return undefined
    }
    if (before === undefined) return t('Not set')
    return Array.isArray(before) ? before.join(', ') : String(before)
  }

  const upstreamId =
    'modelId' in draft.release.execution.providerModel
      ? draft.release.execution.providerModel.modelId
      : ''
  // By ID: a draft Provider is a new object on every render of the page that holds it.
  const providerId = provider?.id
  useEffect(() => {
    if (mode.kind === 'edit' || keyEdited || !providerId) return
    const firstId =
      upstreamId ||
      ('modelIdByQuality' in draft.release.execution.providerModel
        ? (Object.values(
            draft.release.execution.providerModel.modelIdByQuality
          )[0] ?? '')
        : '')
    setDraft((current) => {
      const productKey = firstId
        ? generatedProductKey(providerId, current.capability, firstId)
        : ''
      return current.productKey === productKey
        ? current
        : { ...current, productKey }
    })
  }, [
    upstreamId,
    providerId,
    keyEdited,
    mode.kind,
    draft.release.execution.providerModel,
  ])

  const onEmbeddedChange = embedded?.onChange
  useEffect(() => {
    onEmbeddedChange?.(
      draft.displayName || upstreamId ? withoutEmpty(draft) : null,
      credentialGroup
    )
    // The parent stores the latest draft; its callback identity does not matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, credentialGroup])

  const groups = catalog.credentialGroups.filter(
    (group) => group.providerId === provider?.id
  )
  // A provider without an API Key gets one here; the value stays out of the draft and is saved with the publication.
  const activeSlot = embedded?.slots?.index
  const keyProvider =
    mode.kind !== 'edit' && groups.length === 0 ? provider : undefined
  const needsKey = Boolean(keyProvider)
  const newCredentialGroup =
    keyProvider && typedKey
      ? {
          providerId: keyProvider.id,
          name: t('{{name}} main account', { name: keyProvider.internalName }),
          apiKey: typedKey,
        }
      : undefined
  const previewGroup =
    credentialGroup ||
    (sourceKey ? catalog.modelCredentialGroups[sourceKey] : undefined)

  const draftPayload = (): CatalogEditDraft => ({
    providers: embedded?.extraDraft.providers ?? [],
    channels: embedded?.extraDraft.channels ?? [],
    models: [
      {
        baseVersion,
        definition: withoutEmpty(draft),
        ...(mode.kind !== 'edit' && credentialGroup
          ? { credentialGroupVersionId: credentialGroup }
          : {}),
        ...(mode.kind === 'copy'
          ? {
              copy: {
                sourceModelKey: mode.modelKey,
                inheritCategory: inherit.category,
                inheritIcon: inherit.icon,
              },
            }
          : {}),
      },
      ...(embedded?.others ?? []),
    ],
  })

  const localErrors = (): Record<string, string> => {
    const found: Record<string, string> = {}
    const interaction = draft.release.publicInteraction
    const qualityList = (interaction.paramSchema.qualities ?? []) as string[]
    const others = embedded?.others ?? []
    if (!draft.release.channelId) {
      found.channel = t('Choose a Channel configuration')
    }
    const providerModel = draft.release.execution.providerModel
    const upstreamIds =
      'modelId' in providerModel
        ? [providerModel.modelId]
        : qualityList.map(
            (quality) => providerModel.modelIdByQuality[quality] ?? ''
          )
    if (draft.release.channelId) {
      const sameChannel = (model: CatalogModelDefinition) =>
        model.release.channelId === draft.release.channelId &&
        upstreamModelIdsOf(model).some((id) => upstreamIds.includes(id))
      const clash = catalog.bundle.models.find(
        (model) =>
          !(mode.kind === 'edit' && model.productKey === mode.modelKey) &&
          sameChannel(model)
      )
      if (!upstreamIds.length) found.upstream = t('Add at least one resolution')
      else if (upstreamIds.some((id) => !id.trim())) {
        found.upstream = t('Enter the upstream model ID')
      } else if (clash) {
        found.upstream = t(
          'This Channel already has a model using this upstream model ID: {{name}} ({{key}})',
          { name: clash.displayName, key: clash.productKey }
        )
      } else if (others.some((entry) => sameChannel(entry.definition))) {
        found.upstream = t(
          'Another model added this time has the same upstream model ID'
        )
      }
    }
    if (mode.kind !== 'edit') {
      const name = draft.displayName.trim()
      if (!name) found.displayName = t('Enter a display name')
      else if (
        mode.kind === 'copy' &&
        source &&
        (name === source.displayName ||
          name === t('{{name}} copy', { name: source.displayName }))
      ) {
        found.displayName = t(
          'Change the name: it cannot match the source model or the default copy name'
        )
      }
      if (!draft.productKey) found.productKey = t('Enter a product key')
      else if (
        !/^[a-z0-9-]+\.(image|video|chat)\.[a-z0-9.-]+$/.test(draft.productKey)
      ) {
        found.productKey = t(
          'Use lowercase letters, numbers, dots and hyphens, as API provider.type.name'
        )
      } else if (draft.productKey.length > 128) {
        found.productKey = t('The product key can have at most 128 characters')
      } else if (catalog.retiredModelKeys.includes(draft.productKey)) {
        found.productKey = t('This product key belongs to a deleted model.')
      } else if (
        catalog.bundle.models.some(
          (model) => model.productKey === draft.productKey
        )
      ) {
        found.productKey = t('This product key already exists')
      } else if (
        others.some((entry) => entry.definition.productKey === draft.productKey)
      ) {
        found.productKey = t(
          'Another model added this time has the same product key'
        )
      }
      if (needsKey && !typedKey) found.apiKey = t('Enter the API Key')
      if (!needsKey && !credentialGroup) {
        found.credentialGroup = t('Choose an API Key group')
      }
    }
    const ratios = (interaction.paramSchema.aspectRatios ?? []) as string[]
    if (draft.capability !== 'chat.generate') {
      if (sent.aspectRatio.length && !ratios.length) {
        found['paramSchema.aspectRatios'] = t(
          'Choose at least one aspect ratio: the Channel sends it'
        )
      }
      if (sizeParam) {
        const sizeMap = (interaction.defaultParams.sizeMap ?? {}) as Record<
          string,
          Record<string, string>
        >
        const missing = ratios.flatMap((ratio) =>
          qualityList
            .filter((quality) => !sizeMap[ratio]?.[quality])
            .map((quality) => `${ratio} × ${quality}`)
        )
        if (missing.length > 4) {
          found['defaultParams.sizeMap'] = t(
            'The size table has {{count}} empty cells: {{cells}} and more',
            { count: missing.length, cells: missing.slice(0, 4).join(', ') }
          )
        } else if (missing.length) {
          found['defaultParams.sizeMap'] = t(
            'The size table has {{count}} empty cells: {{cells}}',
            { count: missing.length, cells: missing.join(', ') }
          )
        }
      }
    }
    for (const field of sent.modelFields) {
      if (
        !(
          (interaction.paramSchema.options ?? []) as Array<{ key: string }>
        ).some((option) => option.key === field.key) &&
        interaction.defaultParams[field.key] === undefined
      ) {
        found[`defaultParams.${field.key}`] = t('Please fill in')
      }
    }
    // The shared request validator, as the Cloud checks a task; only worth reading once the form itself is complete.
    if (
      draft.capability !== 'chat.generate' &&
      Object.keys(found).length === 0
    ) {
      const labels: Record<string, string> = {
        aspectRatio: t('Aspect ratio'),
        quality: t('Quality tier'),
        apiQuality: t('Image quality'),
        durationSeconds: t('Length'),
        batchSize: t('Count'),
        generateAudio: t('Generate audio'),
      }
      for (const issue of defaultParamsIssues(interaction)) {
        found[`defaultParams.${issue.field}`] = t(
          'The default {{field}} is outside the parameter range',
          { field: labels[issue.field] ?? issue.field }
        )
      }
    }
    return found
  }

  const refused = (error: unknown) => {
    const failure = catalogEditFailure(error)
    const text = catalogEditErrorText(failure, t)
    const field = catalogErrorField(failure)
    // The footer always carries the text, also when no field on the form can show it.
    setErrors({ form: text, ...(field ? { [field]: text } : {}) })
    if (field) setTab('form')
  }

  // The first error may be far below: bring it into view and put focus on its control.
  useEffect(() => {
    const first = formArea.current?.querySelector<HTMLElement>('[role=alert]')
    if (!first) return
    first.scrollIntoView({ block: 'center' })
    const field = first.closest('[data-edit-field]')
    const control =
      field?.querySelector<HTMLElement>('input:not([disabled]), textarea') ??
      field?.querySelector<HTMLElement>('select:not([disabled])')
    control?.focus({ preventScroll: true })
  }, [errors])

  const validate = useMutation({
    mutationFn: () => planCatalogEdit(draftPayload()),
    onSuccess: (result) => {
      setErrors({})
      setPlan(result)
    },
    onError: refused,
  })
  const publish = useMutation({
    mutationFn: (expectedPlanToken: string) =>
      publishCatalogEdit({
        draft: draftPayload(),
        expectedPlanToken,
        idempotencyKey: idempotencyKey.current,
        ...(newCredentialGroup ? { newCredentialGroup } : {}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['canvas-cloud'] })
      toast.success(t('Published'))
      props.onClose(draft.productKey)
    },
    onError: (error) => {
      idempotencyKey.current = crypto.randomUUID()
      setPlan(null)
      refused(error)
    },
  })

  const unsupportedPaths = unsupportedModelFields(
    draft,
    options.supportedFields,
    profile,
    contract
  )
  const changes = compared ? changedPaths(compared, draft) : []
  const remote = Boolean(latest)
  const submit = () => {
    const found = localErrors()
    if (jsonError) found['paramSchema.usageEstimate'] = jsonError
    const count = Object.keys(found).length
    setErrors(found)
    if (count === 0) {
      validate.mutate()
      return
    }
    setTab('form')
    toast.error(
      t('Validation failed: {{count}} fields to correct; the first is shown', {
        count,
      })
    )
  }

  let title = embedded?.wizard?.title ?? t('Add a model')
  if (mode.kind === 'edit') {
    title = t('Edit model configuration · {{name}}', {
      name: source?.displayName ?? '',
    })
  } else if (mode.kind === 'copy') {
    title = t('Copy as a new model · {{name}}', {
      name: source?.displayName ?? '',
    })
  }
  const groupName = (versionId: string | undefined) =>
    catalog.credentialGroups.find((group) => group.versionId === versionId)
      ?.name
  const boundGroupName = groupName(credentialGroup) ?? newCredentialGroup?.name
  const boundOnPublish: Record<string, string> = Object.fromEntries([
    ...(mode.kind !== 'edit' && boundGroupName
      ? [[draft.productKey, boundGroupName] as [string, string]]
      : []),
    ...(embedded?.others ?? []).flatMap((entry) => {
      const name =
        groupName(entry.credentialGroupVersionId) ?? newCredentialGroup?.name
      return name
        ? [[entry.definition.productKey, name] as [string, string]]
        : []
    }),
  ])
  if (plan) {
    return (
      <ModelPublishPreview
        plan={plan}
        title={`${title} · ${draft.displayName}`}
        capability={
          {
            'image.generate': t('Image generation'),
            'video.generate': t('Video generation'),
            'chat.generate': t('Text generation'),
          }[draft.capability]
        }
        sourceLabel={
          { edit: t('Admin edit'), new: t('Admin new'), copy: t('Admin copy') }[
            mode.kind
          ]
        }
        modelKey={draft.productKey}
        changes={changes.map(displayPath)}
        copySource={mode.kind === 'copy' ? mode.modelKey : null}
        busy={publish.isPending}
        error={errors.form}
        onBack={() => setPlan(null)}
        onConfirm={() => publish.mutate(plan.planToken)}
        together={Boolean(embedded?.wizard)}
        boundOnPublish={boundOnPublish}
      />
    )
  }

  const providerModel = draft.release.execution.providerModel
  const qualities = (draft.release.publicInteraction.paramSchema.qualities ??
    []) as string[]
  let status = t('Fill in and validate')
  if (mode.kind === 'edit') {
    status = changes.length
      ? t('{{count}} changes', { count: changes.length })
      : t('No unpublished changes')
  } else if (mode.kind === 'copy') {
    status = t('{{count}} differ from the source model', {
      count: changes.length,
    })
  }
  const errorCount = Object.keys(errors).length
  const capabilityNames: Record<string, string> = {
    'image.generate': t('Image generation'),
    'video.generate': t('Video generation'),
    'chat.generate': t('Text generation'),
  }
  const isNewChoice = mode.kind === 'new' && !embedded?.wizard
  const selectableChannels = catalog.bundle.channels.filter(
    (entry) =>
      entry.providerId === (provider?.id ?? chosenProvider) &&
      profileOfChannel(catalog, entry.id)?.kind === chosenCapability
  )
  const channelsPlaceholder = selectableChannels.length
    ? t('Please select')
    : t('This API provider has no Channel configuration of this type')
  const channelPlaceholder =
    (provider?.id ?? chosenProvider)
      ? channelsPlaceholder
      : t('Choose an API provider first')

  const capabilityName = {
    'image.generate': t('Image generation'),
    'video.generate': t('Video generation'),
    'chat.generate': t('Text generation'),
  }[draft.capability]
  const modelSource = sourceKey ? catalog.sources.models[sourceKey] : undefined
  const bundleVersion = sourceKey
    ? catalog.modelBundleVersions[sourceKey]
    : undefined
  const summary =
    mode.kind === 'edit' && baseVersion !== null
      ? [
          capabilityName,
          t('Current v{{version}}', { version: baseVersion }),
          t('Source {{source}}', {
            source:
              modelSource === 'ADMIN'
                ? t('Admin edit')
                : `${t('Bundle, short')}${bundleVersion ? ` ${bundleVersion}` : ''}`,
          }),
        ].join(' · ')
      : capabilityName
  const leave = () => {
    if (mode.kind === 'edit' && changes.length) setLeaving(true)
    else props.onClose()
  }
  return (
    <ComparedWithContext.Provider
      value={mode.kind === 'copy' ? 'source' : 'version'}
    >
      <div className='space-y-4'>
        <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() =>
              embedded?.wizard ? embedded.wizard.onBack() : leave()
            }
          >
            {embedded?.wizard
              ? t('Previous step')
              : t('Back to the model list')}
          </Button>
          <h3 className='text-sm font-medium'>{title}</h3>
          <span className='text-muted-foreground text-sm'>{summary}</span>
        </div>

        <UnsupportedFieldsNotice paths={unsupportedPaths} />
        {embedded?.slots ? (
          <div
            className='flex flex-wrap items-center gap-2'
            role='tablist'
            aria-label={t('Models added this time')}
          >
            {embedded.slots.tabs.map((tab, index) => (
              <Button
                key={tab.id}
                size='sm'
                role='tab'
                aria-selected={index === activeSlot}
                variant={index === activeSlot ? 'default' : 'outline'}
                onClick={() => embedded.slots?.onShow(index)}
              >
                {(index === activeSlot ? draft.displayName : tab.name) ||
                  t('Model {{number}}', { number: index + 1 })}
              </Button>
            ))}
            <Button size='sm' variant='outline' onClick={embedded.slots.onAdd}>
              <Plus aria-hidden='true' />
              {t('Add another model')}
            </Button>
            <Button size='sm' variant='outline' onClick={embedded.slots.onCopy}>
              {t('Copy this model')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              onClick={embedded.slots.onRemove}
            >
              {t('Delete this model')}
            </Button>
          </div>
        ) : null}

        {latest ? (
          <div
            role='alert'
            className='flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm'
          >
            <TriangleAlert
              aria-hidden='true'
              className='mt-0.5 size-4 shrink-0'
            />
            <div className='min-w-0 space-y-2'>
              <p className='font-medium'>
                {t(
                  'This model has a new version v{{version}}: {{name}} published it at {{time}}',
                  {
                    version: latest.version,
                    name: latest.publishedBy ?? t('Unknown'),
                    time: new Date(latest.publishedAt).toLocaleString(),
                  }
                )}
              </p>
              <p>
                {conflicts.length
                  ? t(
                      'Validation is off. Choose below for the fields both sides changed, then load the new version.'
                    )
                  : t(
                      'Validation is off. Load the new version; your changes are applied again.'
                    )}
              </p>
              {conflicts.map((conflict) => (
                <fieldset
                  key={conflict.path}
                  className='flex flex-wrap items-center gap-3'
                >
                  <legend className='font-mono text-xs'>
                    {displayPath(conflict.path)}
                  </legend>
                  {(['mine', 'theirs'] as const).map((side) => (
                    <label
                      key={side}
                      className='inline-flex items-center gap-1.5'
                    >
                      <input
                        type='radio'
                        name={conflict.path}
                        checked={choices[conflict.path] === side}
                        onChange={() =>
                          setChoices((current) => ({
                            ...current,
                            [conflict.path]: side,
                          }))
                        }
                      />
                      {side === 'mine'
                        ? t('Keep mine: {{value}}', {
                            value: JSON.stringify(conflict.mine),
                          })
                        : t('Use the new version: {{value}}', {
                            value: JSON.stringify(conflict.theirs),
                          })}
                    </label>
                  ))}
                </fieldset>
              ))}
              <Button
                size='sm'
                disabled={
                  !latestModel ||
                  conflicts.some((conflict) => !choices[conflict.path])
                }
                onClick={() => {
                  if (!latestModel || !base) return
                  const keepTheirs = new Set(
                    conflicts
                      .filter((conflict) => choices[conflict.path] === 'theirs')
                      .map((conflict) => conflict.path)
                  )
                  setDraft(replayChanges(base, draft, latestModel, keepTheirs))
                  setBase(latestModel)
                  setBaseVersion(latest.version)
                  setLatest(null)
                  setChoices({})
                  void queryClient.invalidateQueries({
                    queryKey: ['canvas-cloud', 'model-catalog', 'current'],
                  })
                }}
              >
                {t('Load the new version and apply my changes again')}
              </Button>
            </div>
          </div>
        ) : null}

        <div ref={formArea}>
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
            <TabsContent value='form' className='mt-4 space-y-3'>
              <EditSection
                title={t('Basic information')}
                description={
                  mode.kind === 'copy' && source
                    ? t(
                        'Copied from {{name}} ({{key}}). Change the upstream model ID and the display name. Later changes of the source do not affect the new model.',
                        { name: source.displayName, key: mode.modelKey }
                      )
                    : undefined
                }
              >
                {isNewChoice ? (
                  <>
                    <EditField
                      label={t('Generation type')}
                      help={t('Cannot change after creation')}
                    >
                      {(id, describedBy) => (
                        <NativeSelect
                          id={id}
                          className='w-full'
                          aria-describedby={describedBy}
                          value={chosenCapability}
                          onChange={(event) => {
                            const next = event.target.value as CatalogCapability
                            setChosenCapability(next)
                            setChosenProvider('')
                            setDraft({
                              ...blankModel(catalog, ''),
                              capability: next,
                            })
                          }}
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
                    <EditField label={t('API provider')}>
                      {(id) => (
                        <NativeSelect
                          id={id}
                          className='w-full'
                          value={provider?.id ?? chosenProvider}
                          onChange={(event) => {
                            setChosenProvider(event.target.value)
                            setDraft({
                              ...blankModel(catalog, ''),
                              capability: chosenCapability,
                            })
                          }}
                        >
                          <NativeSelectOption value=''>
                            {t('Please select')}
                          </NativeSelectOption>
                          {catalog.bundle.providers.map((entry) => (
                            <NativeSelectOption key={entry.id} value={entry.id}>
                              {entry.internalName}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      )}
                    </EditField>
                    <EditField
                      label={t('Channel configuration')}
                      help={t(
                        'Only Channel configurations of this API provider and generation type are listed'
                      )}
                      error={errors.channel}
                    >
                      {(id, describedBy) => (
                        <div className='flex items-center gap-2'>
                          <NativeSelect
                            id={id}
                            aria-describedby={describedBy}
                            className='min-w-0 flex-1'
                            disabled={!(provider?.id ?? chosenProvider)}
                            value={draft.release.channelId}
                            onChange={(event) => {
                              setPlan(null)
                              setDraft(blankModel(catalog, event.target.value))
                            }}
                          >
                            <NativeSelectOption value=''>
                              {channelPlaceholder}
                            </NativeSelectOption>
                            {selectableChannels.map((entry) => (
                              <NativeSelectOption
                                key={entry.id}
                                value={entry.id}
                              >
                                {entry.id}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          {embedded?.onNewChannel ? (
                            <Button
                              type='button'
                              variant='outline'
                              className='shrink-0'
                              onClick={embedded.onNewChannel}
                            >
                              {t('New Channel configuration')}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </EditField>
                  </>
                ) : (
                  <>
                    <EditField label={t('Generation type')}>
                      {() => (
                        <p className='min-h-8 py-1.5 text-sm'>
                          {
                            {
                              'image.generate': t('Image generation'),
                              'video.generate': t('Video generation'),
                              'chat.generate': t('Text generation'),
                            }[draft.capability]
                          }
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
                    <EditField
                      label={t('Channel configuration')}
                      help={
                        mode.kind === 'copy'
                          ? t(
                              'A copy keeps its Channel; to change it, add a model instead'
                            )
                          : undefined
                      }
                    >
                      {() => (
                        <p className='min-h-8 py-1.5 font-mono text-sm'>
                          {draft.release.channelId}
                        </p>
                      )}
                    </EditField>
                  </>
                )}
                <EditField
                  label={t('Upstream model ID')}
                  help={t(
                    'Two models on one Channel cannot use one upstream model ID'
                  )}
                  error={errors.upstream}
                >
                  {(id, describedBy) => (
                    <div className='space-y-2'>
                      <NativeSelect
                        id={`${id}-mode`}
                        aria-label={t('How the upstream model ID is chosen')}
                        className='w-36'
                        value={
                          'modelId' in providerModel ? 'fixed' : 'byQuality'
                        }
                        onChange={(event) =>
                          update((current) => {
                            const firstQuality = qualities[0] ?? ''
                            const current_ =
                              current.release.execution.providerModel
                            if ('modelId' in current_) {
                              lastModelId.current = current_.modelId
                            }
                            const nextModel =
                              event.target.value === 'fixed'
                                ? {
                                    modelId:
                                      'modelIdByQuality' in current_
                                        ? (Object.values(
                                            current_.modelIdByQuality
                                          )[0] ?? '')
                                        : current_.modelId,
                                  }
                                : {
                                    defaultQuality: String(
                                      current.release.publicInteraction
                                        .defaultParams.quality ?? firstQuality
                                    ),
                                    modelIdByQuality: Object.fromEntries(
                                      qualities.map((quality) => [
                                        quality,
                                        'modelId' in current_
                                          ? current_.modelId
                                          : (current_.modelIdByQuality[
                                              quality
                                            ] ?? ''),
                                      ])
                                    ),
                                  }
                            return {
                              ...current,
                              release: {
                                ...current.release,
                                execution: { providerModel: nextModel },
                              },
                            }
                          })
                        }
                      >
                        <NativeSelectOption value='fixed'>
                          {t('Fixed')}
                        </NativeSelectOption>
                        <NativeSelectOption value='byQuality'>
                          {t('By resolution')}
                        </NativeSelectOption>
                      </NativeSelect>
                      {'modelId' in providerModel ? (
                        <Input
                          id={id}
                          className='font-mono'
                          aria-describedby={describedBy}
                          aria-invalid={errors.upstream ? true : undefined}
                          placeholder={t('The model field of the upstream API')}
                          value={providerModel.modelId}
                          onChange={(event) =>
                            update((current) => ({
                              ...current,
                              release: {
                                ...current.release,
                                execution: {
                                  providerModel: {
                                    modelId: event.target.value,
                                  },
                                },
                              },
                            }))
                          }
                        />
                      ) : (
                        qualities.map((quality) => (
                          <div
                            key={quality}
                            className='flex items-center gap-2'
                          >
                            <span className='w-14 shrink-0 text-xs font-medium'>
                              {quality}
                            </span>
                            <Input
                              className='font-mono'
                              aria-label={t(
                                'Upstream model ID of {{quality}}',
                                { quality }
                              )}
                              aria-invalid={
                                errors.upstream &&
                                !providerModel.modelIdByQuality[quality]?.trim()
                                  ? true
                                  : undefined
                              }
                              value={
                                providerModel.modelIdByQuality[quality] ?? ''
                              }
                              onChange={(event) =>
                                update((current) =>
                                  writePath(
                                    current,
                                    [
                                      'release',
                                      'execution',
                                      'providerModel',
                                      'modelIdByQuality',
                                      quality,
                                    ].join('\u0000'),
                                    event.target.value
                                  )
                                )
                              }
                            />
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </EditField>
                {mode.kind === 'edit' ? (
                  <>
                    <EditField label={t('Product key')}>
                      {() => (
                        <p className='min-h-8 py-1.5 font-mono text-sm'>
                          {draft.productKey}
                        </p>
                      )}
                    </EditField>
                    <EditField label={t('Name and description')}>
                      {() => (
                        <p className='min-h-8 py-1.5 text-sm'>
                          {t('Edited in Display and categories')}{' '}
                          <button
                            type='button'
                            className='text-primary hover:underline'
                            onClick={() =>
                              props.onEditPresentation(draft.productKey)
                            }
                          >
                            {t('Go there')}
                          </button>
                        </p>
                      )}
                    </EditField>
                  </>
                ) : (
                  <>
                    <EditField
                      label={t('Display name')}
                      help={t(
                        'The default name in the catalog; change it later in Display and categories'
                      )}
                      error={errors.displayName}
                    >
                      {(id, describedBy) => (
                        <Input
                          id={id}
                          placeholder={t('For example {{value}}', {
                            value: 'HF-gpt-image-2.5-flare',
                          })}
                          aria-describedby={describedBy}
                          aria-invalid={errors.displayName ? true : undefined}
                          value={draft.displayName}
                          onChange={(event) =>
                            update((current) => ({
                              ...current,
                              displayName: event.target.value,
                            }))
                          }
                        />
                      )}
                    </EditField>
                    <EditField
                      label={t('Product key')}
                      help={t(
                        'Generated from the API provider, type and upstream model ID; can be changed before creation, never after'
                      )}
                      error={errors.productKey}
                    >
                      {(id, describedBy) => (
                        <Input
                          id={id}
                          className='font-mono'
                          aria-describedby={describedBy}
                          aria-invalid={errors.productKey ? true : undefined}
                          placeholder={t(
                            'Generated after you choose a Channel configuration and fill in the upstream model ID'
                          )}
                          value={draft.productKey}
                          onChange={(event) => {
                            setKeyEdited(true)
                            update((current) => ({
                              ...current,
                              productKey: event.target.value,
                            }))
                          }}
                        />
                      )}
                    </EditField>
                    <EditField
                      label={t('Model description')}
                      wide
                      help={t(
                        'Write capabilities only; the default description in the catalog'
                      )}
                    >
                      {(id, describedBy) => (
                        <Textarea
                          id={id}
                          rows={2}
                          aria-describedby={describedBy}
                          value={draft.description ?? ''}
                          onChange={(event) =>
                            update((current) => ({
                              ...current,
                              description: event.target.value,
                            }))
                          }
                        />
                      )}
                    </EditField>
                    {keyProvider ? (
                      <EditField
                        label='API Key'
                        help={t('Saved to the API Key group "{{group}}"', {
                          group: t('{{name}} main account', {
                            name: keyProvider.internalName,
                          }),
                        })}
                        error={errors.apiKey}
                      >
                        {(id, describedBy) => (
                          <Input
                            id={id}
                            type='password'
                            autoComplete='off'
                            placeholder={t(
                              'Saved when publishing; used by real calls'
                            )}
                            aria-describedby={describedBy}
                            aria-invalid={errors.apiKey ? true : undefined}
                            value={typedKey}
                            onChange={(event) => {
                              setTypedKey(event.target.value)
                              embedded?.onApiKeyChange(event.target.value)
                            }}
                          />
                        )}
                      </EditField>
                    ) : (
                      <EditField
                        label={t('API Key group')}
                        help={
                          mode.kind === 'copy'
                            ? t(
                                "Keeps the source model's API Key group by default"
                              )
                            : undefined
                        }
                        error={errors.credentialGroup}
                      >
                        {(id, describedBy) => (
                          <NativeSelect
                            id={id}
                            className='w-full'
                            aria-describedby={describedBy}
                            aria-invalid={
                              errors.credentialGroup ? true : undefined
                            }
                            value={credentialGroup}
                            onChange={(event) =>
                              setCredentialGroup(event.target.value)
                            }
                          >
                            <NativeSelectOption value=''>
                              {t('Please select')}
                            </NativeSelectOption>
                            {groups.map((group) => (
                              <NativeSelectOption
                                key={group.versionId}
                                value={group.versionId}
                              >
                                {group.name}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        )}
                      </EditField>
                    )}
                  </>
                )}
                {mode.kind === 'copy' ? (
                  <EditField
                    label={t('Display attributes')}
                    wide
                    help={t(
                      'Badges and order are not inherited; the new model is hidden from customers'
                    )}
                  >
                    {() => (
                      <div className='grid gap-2 py-1'>
                        <SwitchField
                          label={t('Inherit categories')}
                          checked={inherit.category}
                          onChange={(next) =>
                            setInherit((current) => ({
                              ...current,
                              category: next,
                            }))
                          }
                        />
                        <SwitchField
                          label={t('Inherit icon')}
                          checked={inherit.icon}
                          onChange={(next) =>
                            setInherit((current) => ({
                              ...current,
                              icon: next,
                            }))
                          }
                        />
                      </div>
                    )}
                  </EditField>
                ) : null}
              </EditSection>
              <div className='grid items-start gap-3 min-[1181px]:grid-cols-[minmax(0,48rem)_minmax(16rem,24rem)]'>
                <ModelParametersSection
                  draft={draft}
                  base={base}
                  sent={sent}
                  catalogValues={catalogValues}
                  errors={errors}
                  set={setInteraction}
                  was={was}
                />
                {draft.capability !== 'chat.generate' ? (
                  <CanvasPreview model={draft} sent={sent} />
                ) : null}
              </div>
              <ModelTokenSection
                draft={draft}
                base={base}
                sent={sent}
                catalogValues={catalogValues}
                errors={errors}
                set={setInteraction}
                was={was}
                usageProtocol={usageProtocol}
                onJsonError={setJsonError}
              />
              <ModelSizeSection
                draft={draft}
                base={base}
                sent={sent}
                catalogValues={catalogValues}
                errors={errors}
                set={setInteraction}
                was={was}
                required={Boolean(sizeParam)}
                prefilled={prefilled}
                showTable={showSizeTable}
                onShowTable={() => {
                  setShowSizeTable(true)
                  setInteraction(['defaultParams', 'sizeMap'], {})
                }}
              />
              <ModelReferenceSection
                draft={draft}
                base={base}
                sent={sent}
                catalogValues={catalogValues}
                errors={errors}
                set={setInteraction}
                was={was}
              />
              <ModelMediaSection
                draft={draft}
                base={base}
                sent={sent}
                catalogValues={catalogValues}
                errors={errors}
                set={setInteraction}
                was={was}
              />
            </TabsContent>
            <TabsContent value='json' className='mt-4'>
              <ModelJsonView
                credentialLabel={
                  catalog.credentialGroups.find(
                    (group) => group.versionId === credentialGroup
                  )?.name
                }
                base={base}
                draft={draft}
                draftPayload={draftPayload}
                {...(typedKey ? { apiKey: typedKey } : {})}
                {...(previewGroup
                  ? { credentialGroupVersionId: previewGroup }
                  : {})}
              />
            </TabsContent>
          </Tabs>
        </div>

        <EditorFooter>
          <span
            className={`min-w-0 flex-1 text-sm font-medium ${errorCount ? 'text-destructive' : 'text-muted-foreground'}`}
            role={errorCount ? 'alert' : undefined}
          >
            {errors.form ??
              (errorCount
                ? t('Correct the {{count}} marked fields first', {
                    count: errorCount,
                  })
                : status)}
          </span>
          {embedded?.wizard ? (
            <>
              <Button variant='outline' onClick={embedded.wizard.onBack}>
                {t('Previous step')}
              </Button>
              <Button
                variant='outline'
                onClick={() =>
                  draft.displayName || upstreamId || embedded.others?.length
                    ? setChannelOnly(true)
                    : embedded.wizard?.onChannelOnly()
                }
              >
                {t('Publish the Channel without models')}
              </Button>
            </>
          ) : (
            <Button variant='outline' onClick={leave}>
              {mode.kind === 'edit' ? t('Discard changes') : t('Cancel')}
            </Button>
          )}
          <Button disabled={remote || validate.isPending} onClick={submit}>
            {t('Validate and preview')}
          </Button>
        </EditorFooter>
        <LeaveConfirm
          open={leaving}
          onOpenChange={setLeaving}
          onLeave={() => props.onClose()}
        />
        {embedded?.wizard ? (
          <AlertDialog open={channelOnly} onOpenChange={setChannelOnly}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('Publish only the Channel configuration?')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('The {{count}} models filled in here are not saved.', {
                    count:
                      (embedded.others?.length ?? 0) +
                      (draft.displayName || upstreamId ? 1 : 0),
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('Keep editing')}</AlertDialogCancel>
                <AlertDialogAction onClick={embedded.wizard.onChannelOnly}>
                  {t('Publish only the Channel configuration')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>
    </ComparedWithContext.Provider>
  )
}
