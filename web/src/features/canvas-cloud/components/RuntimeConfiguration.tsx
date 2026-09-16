/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  cloneElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { DataTableColumnHeader, StaticDataTable } from '@/components/data-table'
import { DataTableColumnFilterField } from '@/components/data-table/toolbar/column-filter-panel'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { useDebounce } from '@/hooks'

import {
  bindCanvasProviderCredentials,
  archiveCanvasCredentialGroup,
  checkCanvasDatabaseBackupStorage,
  checkCanvasTaskMediaStorage,
  getCanvasProviderConfiguration,
  getCanvasProviderCredentialGroupChanges,
  getCanvasRuntimeConfiguration,
  previewCanvasProviderCredentialBindings,
  publishCanvasDatabaseBackupStorage,
  publishCanvasProviderCredentialGroup,
  publishCanvasCredentialGroupManagement,
  restoreCanvasCredentialGroup,
  publishCanvasTaskMediaStorage,
} from '../api'
import { formatCanvasDateTime } from '../formatters'
import type {
  CanvasCredentialRotationPreview,
  CanvasModelBindingPreview,
  CanvasProviderConfiguration,
  CanvasProviderConfigurationQuery,
  CanvasProviderCredentialGroupChange,
  CanvasProviderModel,
  CanvasRuntimeConnectionCheck,
} from '../types'
import { useDirectAsync } from '../use-direct-async'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm } from './BusinessTerm'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import { CanvasServerTable } from './CanvasServerTable'
import { ExecutionSettings } from './ExecutionSettings'
import { PricingActionConfirmation } from './PricingActionConfirmation'
import { runtimeChangeError } from './runtime-change-error'

function isHttpsOrigin(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

const taskMediaSchema = z
  .object({
    endpoint: z
      .string()
      .trim()
      .refine(isHttpsOrigin, 'Enter an HTTPS origin without a path'),
    bucket: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'Enter a valid bucket name'),
    accessKeyId: z.string().trim().max(255, 'Use no more than 255 characters'),
    secretAccessKey: z
      .string()
      .max(65_536, 'Use no more than 65536 characters'),
    inputRetentionHours: z
      .number({ error: 'Enter a number' })
      .int('Enter a whole number')
      .min(1, 'Enter a value from 1 to 8760')
      .max(8760, 'Enter a value from 1 to 8760'),
    outputRetentionHours: z
      .number({ error: 'Enter a number' })
      .int('Enter a whole number')
      .min(1, 'Enter a value from 1 to 8760')
      .max(8760, 'Enter a value from 1 to 8760'),
    downloadUrlTtlSeconds: z
      .number({ error: 'Enter a number' })
      .int('Enter a whole number')
      .min(60, 'Enter a value from 60 to 3600')
      .max(3600, 'Enter a value from 60 to 3600'),
    reason: z.string().trim().max(255, 'Use no more than 255 characters'),
  })
  .refine((value) => !value.secretAccessKey || Boolean(value.accessKeyId), {
    message: 'Enter both credential fields or leave both blank',
    path: ['secretAccessKey'],
  })
type TaskMediaForm = z.infer<typeof taskMediaSchema>
const databaseBackupSchema = z
  .object({
    endpoint: z
      .string()
      .trim()
      .refine(isHttpsOrigin, 'Enter an HTTPS origin without a path'),
    bucket: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, 'Enter a valid bucket name'),
    accessKeyId: z.string().trim().max(255, 'Use no more than 255 characters'),
    secretAccessKey: z
      .string()
      .max(65_536, 'Use no more than 65536 characters'),
    backupRetentionHours: z
      .number({ error: 'Enter a number' })
      .int('Enter a whole number')
      .min(1, 'Enter a value from 1 to 8760')
      .max(8760, 'Enter a value from 1 to 8760'),
    downloadUrlTtlSeconds: z
      .number({ error: 'Enter a number' })
      .int('Enter a whole number')
      .min(60, 'Enter a value from 60 to 3600')
      .max(3600, 'Enter a value from 60 to 3600'),
    reason: z.string().trim().max(255, 'Use no more than 255 characters'),
  })
  .refine((value) => !value.secretAccessKey || Boolean(value.accessKeyId), {
    message: 'Enter both credential fields or leave both blank',
    path: ['secretAccessKey'],
  })
type DatabaseBackupForm = z.infer<typeof databaseBackupSchema>

const credentialSchema = z.object({
  providerId: z.string().uuid({ error: 'Select provider' }),
  credentialGroupId: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .min(1, { error: 'Enter a credential group name' })
    .max(191, { error: 'Use no more than 191 characters' }),
  apiKey: z
    .string()
    .min(1, { error: 'Enter an API Key' })
    .max(65_536, { error: 'Use no more than 65536 characters' })
    .refine((value) => !value.includes('\0'), {
      error: 'API Key contains an invalid character',
    }),
  reason: z
    .string()
    .trim()
    .max(255, { error: 'Use no more than 255 characters' }),
})
type CredentialForm = z.infer<typeof credentialSchema>
const bindingSchema = z.object({
  reason: z.string().trim().max(255),
})
type BindingForm = z.infer<typeof bindingSchema>
const managementSchema = z.object({
  name: z.string().trim().min(1).max(191),
  apiKey: z.string().max(65_536),
  reason: z.string().trim().max(255, 'Use no more than 255 characters'),
})
type ManagementForm = z.infer<typeof managementSchema>
const providerContextStorageKey = 'canvas.provider-api-key-group.context'

function readProviderContext(): {
  providerId: string
  credentialGroupId: string
} | null {
  if (typeof window === 'undefined') return null
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(providerContextStorageKey) ?? 'null'
    ) as unknown
    if (!value || typeof value !== 'object') return null
    const providerId = (value as { providerId?: unknown }).providerId
    const credentialGroupId = (value as { credentialGroupId?: unknown })
      .credentialGroupId
    if (
      typeof providerId !== 'string' ||
      typeof credentialGroupId !== 'string'
    ) {
      return null
    }
    return { providerId, credentialGroupId }
  } catch {
    return null
  }
}

export interface CanvasProviderNavigationTarget {
  providerId?: string
  credentialGroupId?: string
  credentialGroupVersionId?: string
  modelId?: string
}

export function RuntimeConfiguration(
  props: {
    view?: 'storage' | 'provider'
    providerTarget?: CanvasProviderNavigationTarget
  } = {}
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const view = props.view ?? 'storage'
  const targetProviderId = props.providerTarget?.providerId
  const targetCredentialGroupId = props.providerTarget?.credentialGroupId
  const targetCredentialGroupVersionId =
    props.providerTarget?.credentialGroupVersionId
  const targetModelId = props.providerTarget?.modelId
  const restoredProviderContext = useMemo(readProviderContext, [])
  const [activeSection, setActiveSection] = useState<
    'taskMedia' | 'databaseBackup'
  >('taskMedia')
  const [openEditor, setOpenEditor] = useState<
    'taskMedia' | 'databaseBackup' | 'credential' | 'binding' | null
  >(null)
  const [addCredentialOpen, setAddCredentialOpen] = useState(false)
  const [providerDrawer, setProviderDrawer] = useState<
    'management' | 'history' | null
  >(null)
  const [managementCloseRequested, setManagementCloseRequested] =
    useState(false)
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false)
  const [restoreConfirmationOpen, setRestoreConfirmationOpen] = useState(false)
  const [showArchivedGroups, setShowArchivedGroups] = useState(false)
  const managementTriggerRef = useRef<HTMLButtonElement>(null)
  const historyTriggerRef = useRef<HTMLButtonElement>(null)
  const [credentialCloseRequested, setCredentialCloseRequested] =
    useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState(
    targetProviderId ?? restoredProviderContext?.providerId ?? ''
  )
  const [selectedCredentialGroupId, setSelectedCredentialGroupId] = useState(
    targetCredentialGroupId ?? restoredProviderContext?.credentialGroupId ?? ''
  )
  const [activeProviderTarget, setActiveProviderTarget] = useState(
    props.providerTarget
  )
  const [providerTab, setProviderTab] = useState<'overview' | 'execution'>(
    'overview'
  )
  const [executionPolicyDirty, setExecutionPolicyDirty] = useState(false)
  const [pendingScopeChange, setPendingScopeChange] = useState<{
    kind: 'provider' | 'group' | 'tab'
    value: string
  } | null>(null)
  const [navigationTargetApplied, setNavigationTargetApplied] = useState(false)
  const [unboundTargetPending, setUnboundTargetPending] = useState(false)
  const [unboundTargetModelId, setUnboundTargetModelId] = useState('')
  const [confirmation, setConfirmation] = useState<
    | 'taskMedia'
    | 'databaseBackup'
    | 'credential'
    | 'binding'
    | 'management'
    | null
  >(null)
  const modelTableState = useServerTableState<
    'publicName' | 'modelKey' | 'status' | 'credentialGroup'
  >('publicName')
  const [modelKeyFilter, setModelKeyFilter] = useState('')
  const [modelStatusFilter, setModelStatusFilter] = useState('')
  const [credentialGroupFilter, setCredentialGroupFilter] = useState('')
  const [bindingStatusFilter, setBindingStatusFilter] = useState('')
  const debouncedModelKey = useDebounce(modelKeyFilter.trim(), 300)
  const debouncedCredentialGroup = useDebounce(
    credentialGroupFilter.trim(),
    300
  )
  const [storageCloseRequested, setStorageCloseRequested] = useState<
    'taskMedia' | 'databaseBackup' | null
  >(null)
  const [selectedModels, setSelectedModels] = useState<string[]>([])
  const [managementInitialModels, setManagementInitialModels] = useState<
    string[]
  >([])
  const [managementInitializedGroupId, setManagementInitializedGroupId] =
    useState('')
  const [managementModelSearch, setManagementModelSearch] = useState('')
  const selectedModelsRef = useRef(selectedModels)
  selectedModelsRef.current = selectedModels
  const selectedGroupVersionRef = useRef('')
  const [rotationPreview, setRotationPreview] =
    useState<CanvasCredentialRotationPreview | null>(null)
  const [bindingPreview, setBindingPreview] =
    useState<CanvasModelBindingPreview | null>(null)
  const rotationPreviewRequestRef = useRef(0)
  const bindingPreviewRequestRef = useRef(0)
  useEffect(() => {
    setActiveProviderTarget(
      targetProviderId ||
        targetCredentialGroupId ||
        targetCredentialGroupVersionId ||
        targetModelId
        ? {
            providerId: targetProviderId,
            credentialGroupId: targetCredentialGroupId,
            credentialGroupVersionId: targetCredentialGroupVersionId,
            modelId: targetModelId,
          }
        : undefined
    )
    setSelectedProviderId(
      targetProviderId ?? restoredProviderContext?.providerId ?? ''
    )
    setSelectedCredentialGroupId(
      targetCredentialGroupId ??
        restoredProviderContext?.credentialGroupId ??
        ''
    )
    setNavigationTargetApplied(false)
    setUnboundTargetPending(false)
    setUnboundTargetModelId('')
    rotationPreviewRequestRef.current += 1
    bindingPreviewRequestRef.current += 1
  }, [
    targetCredentialGroupId,
    targetCredentialGroupVersionId,
    targetModelId,
    targetProviderId,
    restoredProviderContext,
  ])
  const providerQuery: CanvasProviderConfigurationQuery = {
    ...(showArchivedGroups
      ? { credentialGroupStatus: 'ARCHIVED' as const }
      : {}),
    ...(selectedProviderId ? { providerId: selectedProviderId } : {}),
    ...(selectedCredentialGroupId
      ? { credentialGroupId: selectedCredentialGroupId }
      : {}),
    ...(activeProviderTarget?.credentialGroupVersionId
      ? {
          credentialGroupVersionId:
            activeProviderTarget.credentialGroupVersionId,
        }
      : {}),
    ...(activeProviderTarget?.modelId
      ? { modelId: activeProviderTarget.modelId }
      : {}),
    modelScope: openEditor === 'binding' ? 'ELIGIBLE' : 'BOUND_TO_GROUP',
    ...(modelTableState.query.search
      ? { modelName: modelTableState.query.search }
      : {}),
    ...(debouncedModelKey ? { modelKey: debouncedModelKey } : {}),
    ...(modelStatusFilter ? { modelStatus: modelStatusFilter } : {}),
    ...(debouncedCredentialGroup
      ? { credentialGroup: debouncedCredentialGroup }
      : {}),
    ...(bindingStatusFilter
      ? { bindingStatus: bindingStatusFilter as 'BOUND' | 'UNBOUND' }
      : {}),
    page: modelTableState.query.page,
    pageSize: modelTableState.query.pageSize,
    sortBy: modelTableState.query.sortBy,
    sortOrder: modelTableState.query.sortOrder,
  }
  const storageRuntime = useQuery({
    queryKey: ['canvas-cloud', 'runtime-configuration'],
    queryFn: getCanvasRuntimeConfiguration,
    enabled: view === 'storage',
  })
  const providerRuntime = useQuery({
    queryKey: ['canvas-cloud', 'provider-configuration', providerQuery],
    queryFn: ({ signal }) =>
      getCanvasProviderConfiguration(providerQuery, signal),
    enabled: view === 'provider',
    placeholderData: (previous) => previous,
  })
  const managementCandidates = useQuery({
    queryKey: [
      'canvas-cloud',
      'provider-configuration-management-candidates',
      selectedProviderId || providerRuntime.data?.selectedProviderId,
      selectedCredentialGroupId ||
        providerRuntime.data?.selectedCredentialGroupId,
    ],
    enabled:
      view === 'provider' &&
      providerDrawer === 'management' &&
      Boolean(
        (selectedProviderId || providerRuntime.data?.selectedProviderId) &&
        (selectedCredentialGroupId ||
          providerRuntime.data?.selectedCredentialGroupId)
      ),
    queryFn: async ({ signal }) => {
      const providerId =
        selectedProviderId || providerRuntime.data?.selectedProviderId
      const credentialGroupId =
        selectedCredentialGroupId ||
        providerRuntime.data?.selectedCredentialGroupId
      if (!providerId || !credentialGroupId) {
        throw new Error('API Key group management target is required')
      }
      const items: CanvasProviderModel[] = []
      let page = 1
      let total = 0
      do {
        const previousCount = items.length
        const result = await getCanvasProviderConfiguration(
          {
            providerId,
            credentialGroupId,
            modelScope: 'ELIGIBLE',
            sortBy: 'publicName',
            sortOrder: 'asc',
            page,
            pageSize: 100,
          },
          signal
        )
        items.push(...result.models.items)
        total = result.models.total
        if (items.length === previousCount && items.length < total) {
          throw new Error('Incomplete model candidate pagination')
        }
        page += 1
      } while (items.length < total)
      return items
    },
  })
  const runtime = view === 'provider' ? providerRuntime : storageRuntime
  const providerData = providerRuntime.data
  const storageData = storageRuntime.data
  const setModelPagination = modelTableState.setPagination
  useEffect(() => {
    setModelPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [
    bindingStatusFilter,
    debouncedCredentialGroup,
    debouncedModelKey,
    modelStatusFilter,
    selectedProviderId,
    selectedCredentialGroupId,
    openEditor,
    setModelPagination,
  ])
  const taskMedia = useForm<TaskMediaForm>({
    resolver: zodResolver(taskMediaSchema),
    defaultValues: {
      endpoint: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      inputRetentionHours: 24,
      outputRetentionHours: 72,
      downloadUrlTtlSeconds: 900,
      reason: '',
    },
  })
  const databaseBackup = useForm<DatabaseBackupForm>({
    resolver: zodResolver(databaseBackupSchema),
    defaultValues: {
      endpoint: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      backupRetentionHours: 72,
      downloadUrlTtlSeconds: 900,
      reason: '',
    },
  })
  const credential = useForm<CredentialForm>({
    resolver: zodResolver(credentialSchema),
    defaultValues: {
      providerId: '',
      credentialGroupId: undefined,
      name: '',
      apiKey: '',
      reason: '',
    },
  })
  const binding = useForm<BindingForm>({
    resolver: zodResolver(bindingSchema),
    defaultValues: { reason: '' },
  })
  const management = useForm<ManagementForm>({
    resolver: zodResolver(managementSchema),
    defaultValues: { name: '', apiKey: '', reason: '' },
  })

  let hasUnsavedProviderEdit = false
  if (providerDrawer === 'management') {
    hasUnsavedProviderEdit =
      management.formState.isDirty ||
      selectedModels.length !== managementInitialModels.length ||
      selectedModels.some((id) => !managementInitialModels.includes(id))
  } else if (openEditor === 'credential' || addCredentialOpen) {
    hasUnsavedProviderEdit = credential.formState.isDirty
  } else if (openEditor === 'binding') {
    hasUnsavedProviderEdit =
      binding.formState.isDirty || selectedModels.length > 0
  }
  const hasUnsavedStorageEdit =
    (openEditor === 'taskMedia' && taskMedia.formState.isDirty) ||
    (openEditor === 'databaseBackup' && databaseBackup.formState.isDirty)
  const hasUnsavedFormEdit = hasUnsavedProviderEdit || hasUnsavedStorageEdit
  const hasUnsavedRuntimeEdit = hasUnsavedFormEdit || executionPolicyDirty
  const closeStorageEditor = (kind: 'taskMedia' | 'databaseBackup') => {
    if (kind === 'taskMedia') taskMedia.reset()
    else databaseBackup.reset()
    setStorageCloseRequested(null)
    setOpenEditor(null)
  }
  const openStorageEditor = (kind: 'taskMedia' | 'databaseBackup') => {
    if (kind === 'taskMedia' && storageData?.taskMedia) {
      taskMedia.reset({
        endpoint: storageData.taskMedia.endpoint,
        bucket: storageData.taskMedia.bucket,
        accessKeyId: storageData.taskMedia.accessKeyId ?? '',
        secretAccessKey: '',
        inputRetentionHours: storageData.taskMedia.inputRetentionHours,
        outputRetentionHours: storageData.taskMedia.outputRetentionHours,
        downloadUrlTtlSeconds: storageData.taskMedia.downloadUrlTtlSeconds,
        reason: '',
      })
    }
    if (kind === 'databaseBackup' && storageData?.databaseBackup) {
      databaseBackup.reset({
        endpoint: storageData.databaseBackup.endpoint,
        bucket: storageData.databaseBackup.bucket,
        accessKeyId: storageData.databaseBackup.accessKeyId ?? '',
        secretAccessKey: '',
        backupRetentionHours: storageData.databaseBackup.backupRetentionHours,
        downloadUrlTtlSeconds: storageData.databaseBackup.downloadUrlTtlSeconds,
        reason: '',
      })
    }
    setOpenEditor(kind)
  }
  const requestStorageClose = (kind: 'taskMedia' | 'databaseBackup') => {
    const dirty =
      kind === 'taskMedia'
        ? taskMedia.formState.isDirty
        : databaseBackup.formState.isDirty
    if (dirty) setStorageCloseRequested(kind)
    else closeStorageEditor(kind)
  }
  const resetProviderEdit = () => {
    rotationPreviewRequestRef.current += 1
    bindingPreviewRequestRef.current += 1
    setOpenEditor(null)
    setAddCredentialOpen(false)
    setSelectedModels([])
    setBindingPreview(null)
    setRotationPreview(null)
    binding.reset({ reason: '' })
    credential.reset({
      providerId: '',
      credentialGroupId: undefined,
      name: '',
      apiKey: '',
      reason: '',
    })
  }
  const requestCredentialClose = () => {
    if (credential.formState.isDirty) setCredentialCloseRequested(true)
    else resetProviderEdit()
  }
  const applyScopeChange = (change: {
    kind: 'provider' | 'group' | 'tab'
    value: string
  }) => {
    resetProviderEdit()
    setExecutionPolicyDirty(false)
    if (change.kind === 'tab') {
      setProviderTab(change.value as 'overview' | 'execution')
      return
    }
    setActiveProviderTarget(undefined)
    setNavigationTargetApplied(true)
    if (change.kind === 'provider') {
      setSelectedProviderId(change.value)
      setSelectedCredentialGroupId('')
      setUnboundTargetPending(false)
      setUnboundTargetModelId('')
    } else {
      setSelectedProviderId(
        (current) => current || providerData?.selectedProviderId || ''
      )
      setSelectedCredentialGroupId(change.value)
      if (unboundTargetPending && unboundTargetModelId) {
        setUnboundTargetPending(false)
        setOpenEditor('binding')
        setSelectedModels([unboundTargetModelId])
        binding.reset({ reason: '' })
      }
    }
    setProviderTab('overview')
  }
  const requestScopeChange = (change: {
    kind: 'provider' | 'group' | 'tab'
    value: string
  }) => {
    if (hasUnsavedRuntimeEdit) setPendingScopeChange(change)
    else applyScopeChange(change)
  }

  const refresh = async () =>
    queryClient.invalidateQueries({
      queryKey: [
        'canvas-cloud',
        view === 'provider'
          ? 'provider-configuration'
          : 'runtime-configuration',
      ],
    })
  const taskMediaMutation = useDirectAsync({
    execute: (value: TaskMediaForm) => {
      const current = storageData?.taskMedia
      const endpoint = new URL(value.endpoint.trim()).origin
      const bucket = value.bucket.trim()
      return publishCanvasTaskMediaStorage({
        ...(current?.endpoint !== endpoint ? { endpoint } : {}),
        ...(current?.bucket !== bucket ? { mediaBucket: bucket } : {}),
        ...(value.accessKeyId && value.secretAccessKey
          ? {
              mediaCredentials: {
                accessKeyId: value.accessKeyId,
                secretAccessKey: value.secretAccessKey,
              },
            }
          : {}),
        ...(current?.inputRetentionHours !== value.inputRetentionHours
          ? { inputRetentionHours: value.inputRetentionHours }
          : {}),
        ...(current?.outputRetentionHours !== value.outputRetentionHours
          ? { outputRetentionHours: value.outputRetentionHours }
          : {}),
        ...(current?.downloadUrlTtlSeconds !== value.downloadUrlTtlSeconds
          ? { downloadUrlTtlSeconds: value.downloadUrlTtlSeconds }
          : {}),
        ...(value.reason.trim() ? { reason: value.reason.trim() } : {}),
      })
    },
    onSuccess: async () => {
      setConfirmation(null)
      setOpenEditor(null)
      taskMedia.resetField('accessKeyId')
      taskMedia.resetField('secretAccessKey')
      toast.success(t('Task media configuration published'))
      await refresh()
    },
    onError: () => {
      toast.error(t('Task media configuration failed'))
    },
  })
  const databaseBackupMutation = useDirectAsync({
    execute: (value: DatabaseBackupForm) => {
      const current = storageData?.databaseBackup
      const endpoint = new URL(value.endpoint.trim()).origin
      const bucket = value.bucket.trim()
      return publishCanvasDatabaseBackupStorage({
        ...(current?.endpoint !== endpoint ? { endpoint } : {}),
        ...(current?.bucket !== bucket ? { backupBucket: bucket } : {}),
        ...(value.accessKeyId && value.secretAccessKey
          ? {
              backupCredentials: {
                accessKeyId: value.accessKeyId,
                secretAccessKey: value.secretAccessKey,
              },
            }
          : {}),
        ...(current?.backupRetentionHours !== value.backupRetentionHours
          ? { backupRetentionHours: value.backupRetentionHours }
          : {}),
        ...(current?.downloadUrlTtlSeconds !== value.downloadUrlTtlSeconds
          ? { downloadUrlTtlSeconds: value.downloadUrlTtlSeconds }
          : {}),
        ...(value.reason.trim() ? { reason: value.reason.trim() } : {}),
      })
    },
    onSuccess: async () => {
      setConfirmation(null)
      setOpenEditor(null)
      databaseBackup.resetField('accessKeyId')
      databaseBackup.resetField('secretAccessKey')
      toast.success(t('Database backup configuration published'))
      await refresh()
    },
    onError: () => {
      toast.error(t('Database backup configuration failed'))
    },
  })
  const credentialMutation = useDirectAsync({
    execute: (value: CredentialForm) => {
      if (value.credentialGroupId && !rotationPreview) {
        throw new Error('Credential rotation preview is required')
      }
      return publishCanvasProviderCredentialGroup({
        providerId: value.providerId,
        ...(value.credentialGroupId
          ? { credentialGroupId: value.credentialGroupId }
          : {}),
        name: value.name,
        apiKey: value.apiKey,
        ...(rotationPreview
          ? {
              expectedCredentialGroupVersionId:
                rotationPreview.currentCredentialGroupVersionId,
              expectedBindings: rotationPreview.affectedModels.map((model) => ({
                customerModelId: model.customerModelId,
                bindingId: model.bindingId,
                bindingVersion: model.bindingVersion,
              })),
            }
          : {}),
        ...(value.reason.trim() ? { reason: value.reason.trim() } : {}),
      })
    },
    onSuccess: async (published) => {
      setConfirmation(null)
      setOpenEditor(null)
      setAddCredentialOpen(false)
      setRotationPreview(null)
      credential.reset({
        providerId: '',
        credentialGroupId: undefined,
        name: '',
        apiKey: '',
        reason: '',
      })
      setActiveProviderTarget(undefined)
      setSelectedProviderId(String(published.providerId))
      setSelectedCredentialGroupId(String(published.credentialGroupId))
      toast.success(t('Provider credential group published'))
      await refresh()
    },
    onError: (error) => {
      toast.error(runtimeChangeError(error, t, 'credential'))
    },
  })
  const bindingMutation = useMutation({
    mutationFn: (value: BindingForm) => {
      if (!selectedGroup || !bindingPreview) {
        throw new Error('Model binding preview is required')
      }
      return bindCanvasProviderCredentials({
        credentialGroupVersionId: selectedGroup.id,
        ...(value.reason.trim() ? { reason: value.reason.trim() } : {}),
        customerModelIds: selectedModels,
        expectedBindings: bindingPreview.models.map((model) => ({
          customerModelId: model.customerModelId,
          bindingId: model.bindingId,
          bindingVersion: model.bindingVersion,
        })),
      })
    },
    onSuccess: async () => {
      bindingMutation.reset()
      setConfirmation(null)
      setOpenEditor(null)
      setSelectedModels([])
      setBindingPreview(null)
      toast.success(t('Model credential bindings published'))
      await refresh()
    },
    onError: async (error) => {
      setConfirmation(null)
      toast.error(runtimeChangeError(error, t, 'binding'))
      await refresh()
    },
  })
  const managementMutation = useDirectAsync({
    execute: (value: ManagementForm) => {
      if (!selectedGroup || !managementCandidates.data) {
        throw new Error('API Key group management target is required')
      }
      return publishCanvasCredentialGroupManagement({
        credentialGroupId: selectedGroup.credentialGroupId,
        expectedCredentialGroupVersionId: selectedGroup.id,
        name: value.name.trim(),
        ...(value.apiKey ? { apiKey: value.apiKey } : {}),
        customerModelIds: selectedModels,
        expectedBindings: managementCandidates.data.map((model) => ({
          customerModelId: model.id,
          bindingId: model.credentialBindingId,
          bindingVersion: model.credentialBindingVersion,
        })),
        ...(value.reason.trim() ? { reason: value.reason.trim() } : {}),
      })
    },
    onSuccess: async () => {
      setConfirmation(null)
      closeProviderDrawer()
      setSelectedModels([])
      management.reset()
      toast.success(t('API Key group updated'))
      await refresh()
    },
    onError: (error) => {
      toast.error(runtimeChangeError(error, t, 'management'))
    },
  })
  const archiveMutation = useMutation({
    mutationFn: () => {
      if (!selectedGroup) throw new Error('API Key group target is required')
      return archiveCanvasCredentialGroup({
        credentialGroupId: selectedGroup.credentialGroupId,
        expectedCredentialGroupVersionId: selectedGroup.id,
      })
    },
    onSuccess: async () => {
      setArchiveConfirmationOpen(false)
      closeProviderDrawer()
      setSelectedCredentialGroupId('')
      toast.success(t('API Key group archived'))
      await refresh()
    },
    onError: (error) => {
      toast.error(runtimeChangeError(error, t, 'credential'))
    },
  })
  const restoreMutation = useMutation({
    mutationFn: () => {
      if (!selectedGroup) throw new Error('API Key group target is required')
      return restoreCanvasCredentialGroup({
        credentialGroupId: selectedGroup.credentialGroupId,
        expectedCredentialGroupVersionId: selectedGroup.id,
      })
    },
    onSuccess: async () => {
      setRestoreConfirmationOpen(false)
      setShowArchivedGroups(false)
      toast.success(t('API Key group restored'))
      await refresh()
    },
    onError: (error) => {
      toast.error(runtimeChangeError(error, t, 'credential'))
    },
  })
  const bindingPreviewMutation = useMutation({
    mutationFn: (input: {
      credentialGroupVersionId: string
      customerModelIds: string[]
      requestId: number
    }) =>
      previewCanvasProviderCredentialBindings({
        credentialGroupVersionId: input.credentialGroupVersionId,
        customerModelIds: input.customerModelIds,
      }),
    onSuccess: (preview, input) => {
      if (
        input.requestId !== bindingPreviewRequestRef.current ||
        input.credentialGroupVersionId !== selectedGroupVersionRef.current ||
        input.customerModelIds.length !== selectedModelsRef.current.length ||
        input.customerModelIds.some(
          (modelId) => !selectedModelsRef.current.includes(modelId)
        )
      ) {
        return
      }
      setBindingPreview(preview)
      setConfirmation('binding')
    },
    onError: (error) => toast.error(runtimeChangeError(error, t, 'preview')),
  })
  const reportCheck = async (result: CanvasRuntimeConnectionCheck) => {
    if (result.outcome === 'PASSED') toast.success(t('Connection check passed'))
    else {
      toast.error(
        `${t('Connection check failed')}: ${connectionCheckReason(result.reasonCode, t)}`
      )
    }
    await refresh()
  }
  const checkTaskMedia = useMutation({
    mutationFn: checkCanvasTaskMediaStorage,
    onSuccess: reportCheck,
    onError: () => toast.error(t('Connection check failed')),
  })
  const checkDatabaseBackup = useMutation({
    mutationFn: checkCanvasDatabaseBackupStorage,
    onSuccess: reportCheck,
    onError: () => toast.error(t('Connection check failed')),
  })

  const discardAllDrafts = () => {
    resetProviderEdit()
    taskMedia.reset()
    databaseBackup.reset()
    management.reset({ name: '', apiKey: '', reason: '' })
    setManagementInitialModels([])
    setManagementInitializedGroupId('')
    setProviderDrawer(null)
    setConfirmation(null)
    setExecutionPolicyDirty(false)
    taskMediaMutation.reset()
    databaseBackupMutation.reset()
    credentialMutation.reset()
    bindingMutation.reset()
    managementMutation.reset()
  }

  const effectiveProviderId =
    selectedProviderId || providerData?.selectedProviderId || ''
  const effectiveCredentialGroupId =
    selectedCredentialGroupId ||
    (unboundTargetPending ? '' : providerData?.selectedCredentialGroupId) ||
    ''
  const providerGroups = (providerData?.credentialGroups ?? []).filter(
    (item) => item.providerId === effectiveProviderId
  )
  const selectedProvider = providerData?.providers.find(
    (provider) => provider.id === effectiveProviderId
  )
  const selectedGroup =
    providerGroups.find(
      (item) => item.credentialGroupId === effectiveCredentialGroupId
    ) ?? null
  selectedGroupVersionRef.current = selectedGroup?.id ?? ''
  useEffect(() => {
    if (
      navigationTargetApplied ||
      !activeProviderTarget?.modelId ||
      !providerData?.navigationTarget
    ) {
      return
    }
    if (
      providerData.navigationTarget.modelId !== activeProviderTarget.modelId
    ) {
      return
    }
    setNavigationTargetApplied(true)
    if (providerData.navigationTarget.bindingStatus === 'UNBOUND') {
      setUnboundTargetPending(true)
      setUnboundTargetModelId(activeProviderTarget.modelId)
      setSelectedCredentialGroupId('')
      toast.error(
        t(
          'This model is not bound to a credential group. Select the intended group before managing bindings.'
        )
      )
      return
    }
    setOpenEditor('binding')
    binding.reset({ reason: '' })
  }, [
    binding,
    navigationTargetApplied,
    activeProviderTarget?.modelId,
    providerData?.navigationTarget,
    t,
  ])
  const pageModels = providerData?.models.items ?? []
  useEffect(() => {
    if (
      providerDrawer !== 'management' ||
      !managementCandidates.isSuccess ||
      !selectedGroup ||
      managementInitializedGroupId === selectedGroup.credentialGroupId
    ) {
      return
    }
    const boundIds = managementCandidates.data
      .filter(
        (model) => model.credentialGroupId === selectedGroup.credentialGroupId
      )
      .map((model) => model.id)
    setSelectedModels(boundIds)
    setManagementInitialModels(boundIds)
    setManagementInitializedGroupId(selectedGroup.credentialGroupId)
  }, [
    managementInitializedGroupId,
    managementCandidates.data,
    managementCandidates.isSuccess,
    providerDrawer,
    selectedGroup,
  ])
  const openManagementDrawer = () => {
    if (!selectedGroup) return
    setManagementInitializedGroupId('')
    setManagementModelSearch('')
    management.reset({ name: selectedGroup.name, apiKey: '', reason: '' })
    setProviderDrawer('management')
  }
  const closeProviderDrawer = () => {
    const closedDrawer = providerDrawer
    setProviderDrawer(null)
    requestAnimationFrame(() => {
      if (closedDrawer === 'history') historyTriggerRef.current?.focus()
      else managementTriggerRef.current?.focus()
    })
  }
  const requestManagementClose = () => {
    if (hasUnsavedProviderEdit) {
      setManagementCloseRequested(true)
      return
    }
    closeProviderDrawer()
  }
  const modelBindingDescription = (model: CanvasProviderModel): string => {
    if (model.credentialGroupId === selectedGroup?.credentialGroupId) {
      return t('Currently bound to this group')
    }
    if (model.credentialGroupName) {
      return t(
        'Currently bound to {{group}}; selecting will move it to this group',
        { group: model.credentialGroupName }
      )
    }
    return t('Currently unbound')
  }
  const managementModels = (managementCandidates.data ?? []).filter((model) =>
    model.publicName
      .toLocaleLowerCase()
      .includes(managementModelSearch.trim().toLocaleLowerCase())
  )
  const allPageSelected =
    pageModels.length > 0 &&
    pageModels.every((model) => selectedModels.includes(model.id))
  const updateSelectedModels = (update: (current: string[]) => string[]) => {
    bindingPreviewRequestRef.current += 1
    setBindingPreview(null)
    setConfirmation((current) => (current === 'binding' ? null : current))
    setSelectedModels(update)
  }
  const modelColumns = useMemo<ColumnDef<CanvasProviderModel, unknown>[]>(
    () => [
      ...(openEditor === 'binding'
        ? [
            {
              id: 'selection',
              size: 128,
              header: t('Select'),
              enableSorting: false,
              enableHiding: false,
              cell: ({ row }: { row: { original: CanvasProviderModel } }) => (
                <Checkbox
                  aria-label={`${t('Select model')} ${row.original.publicName}`}
                  checked={selectedModels.includes(row.original.id)}
                  onCheckedChange={(checked) =>
                    updateSelectedModels((current) =>
                      checked
                        ? [...new Set([...current, row.original.id])]
                        : current.filter((id) => id !== row.original.id)
                    )
                  }
                />
              ),
            } satisfies ColumnDef<CanvasProviderModel, unknown>,
          ]
        : []),
      {
        id: 'publicName',
        accessorKey: 'publicName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model name')} />
        ),
        meta: { label: t('Model name') },
        cell: ({ row }) =>
          openEditor === 'binding' ? (
            <span className='font-medium break-words whitespace-normal'>
              {row.original.publicName}
            </span>
          ) : (
            <a
              className='text-primary max-w-full font-medium break-words whitespace-normal underline-offset-4 hover:underline'
              href={`/canvas-cloud/model-management/${encodeURIComponent(row.original.id)}/pricing`}
              onClick={() => {
                if (!selectedGroup) return
                window.sessionStorage.setItem(
                  providerContextStorageKey,
                  JSON.stringify({
                    providerId: selectedGroup.providerId,
                    credentialGroupId: selectedGroup.credentialGroupId,
                  })
                )
              }}
            >
              {row.original.publicName}
            </a>
          ),
      },
      ...(openEditor === 'binding'
        ? [
            {
              id: 'modelKey',
              accessorKey: 'modelKey',
              header: t('Model key'),
              meta: { label: t('Model key') },
            },
            {
              id: 'status',
              accessorKey: 'status',
              header: t('Status'),
              meta: { label: t('Status') },
              cell: ({ row }: { row: { original: CanvasProviderModel } }) => (
                <BusinessTerm kind='configStatus' value={row.original.status} />
              ),
            },
          ]
        : []),
      ...(openEditor === 'binding'
        ? [
            {
              id: 'credentialGroup',
              accessorFn: (model) => model.credentialGroupName ?? '',
              header: ({ column }) => (
                <DataTableColumnHeader
                  column={column}
                  title={t('Current credential group')}
                />
              ),
              meta: { label: t('Current credential group') },
              cell: ({ row }) =>
                row.original.credentialGroupName ? (
                  <span>
                    {row.original.credentialGroupName} v
                    {row.original.credentialGroupVersion}
                  </span>
                ) : (
                  <span className='text-muted-foreground'>
                    {t('Not configured')}
                  </span>
                ),
            } satisfies ColumnDef<CanvasProviderModel, unknown>,
          ]
        : [
            {
              id: 'capability',
              accessorKey: 'capability',
              header: t('Capability'),
              meta: { label: t('Capability') },
              enableSorting: false,
              cell: ({ row }) => t(row.original.capability),
            } satisfies ColumnDef<CanvasProviderModel, unknown>,
            {
              id: 'bindingTime',
              accessorKey: 'credentialBindingEffectiveAt',
              header: t('Binding time'),
              meta: { label: t('Binding time') },
              enableSorting: false,
              cell: ({ row }) =>
                row.original.credentialBindingEffectiveAt
                  ? formatCanvasDateTime(
                      row.original.credentialBindingEffectiveAt
                    )
                  : '—',
            } satisfies ColumnDef<CanvasProviderModel, unknown>,
          ]),
    ],
    [openEditor, selectedGroup, selectedModels, t]
  )
  let confirmationDetails = [
    { label: t('Selected models'), value: String(selectedModels.length) },
  ]
  if (confirmation === 'taskMedia') {
    const current = storageData?.taskMedia
    const value = taskMedia.getValues()
    confirmationDetails = [
      ...(current?.endpoint !== value.endpoint
        ? [
            {
              label: t('R2 endpoint'),
              value: `${current?.endpoint ?? t('Not configured')} → ${value.endpoint}`,
            },
          ]
        : []),
      ...(current?.bucket !== value.bucket
        ? [
            {
              label: t('Task media bucket'),
              value: `${current?.bucket ?? t('Not configured')} → ${value.bucket}`,
            },
          ]
        : []),
      ...(current?.inputRetentionHours !== value.inputRetentionHours
        ? [
            {
              label: t('Input retention hours'),
              value: `${current?.inputRetentionHours ?? t('Not configured')} → ${value.inputRetentionHours}`,
            },
          ]
        : []),
      ...(current?.outputRetentionHours !== value.outputRetentionHours
        ? [
            {
              label: t('Output retention hours'),
              value: `${current?.outputRetentionHours ?? t('Not configured')} → ${value.outputRetentionHours}`,
            },
          ]
        : []),
      ...(current?.downloadUrlTtlSeconds !== value.downloadUrlTtlSeconds
        ? [
            {
              label: t('Download URL seconds'),
              value: `${current?.downloadUrlTtlSeconds ?? t('Not configured')} → ${value.downloadUrlTtlSeconds}`,
            },
          ]
        : []),
      {
        label: t('Credentials'),
        value: value.secretAccessKey
          ? t('Will be replaced')
          : t('Keep current'),
      },
      { label: t('Reason'), value: value.reason.trim() || t('Not provided') },
    ]
  }
  if (confirmation === 'databaseBackup') {
    const current = storageData?.databaseBackup
    const value = databaseBackup.getValues()
    confirmationDetails = [
      ...(current?.endpoint !== value.endpoint
        ? [
            {
              label: t('R2 endpoint'),
              value: `${current?.endpoint ?? t('Not configured')} → ${value.endpoint}`,
            },
          ]
        : []),
      ...(current?.bucket !== value.bucket
        ? [
            {
              label: t('Database backup bucket'),
              value: `${current?.bucket ?? t('Not configured')} → ${value.bucket}`,
            },
          ]
        : []),
      ...(current?.backupRetentionHours !== value.backupRetentionHours
        ? [
            {
              label: t('Backup retention hours'),
              value: `${current?.backupRetentionHours ?? t('Not configured')} → ${value.backupRetentionHours}`,
            },
          ]
        : []),
      ...(current?.downloadUrlTtlSeconds !== value.downloadUrlTtlSeconds
        ? [
            {
              label: t('Download URL seconds'),
              value: `${current?.downloadUrlTtlSeconds ?? t('Not configured')} → ${value.downloadUrlTtlSeconds}`,
            },
          ]
        : []),
      {
        label: t('Credentials'),
        value: value.secretAccessKey
          ? t('Will be replaced')
          : t('Keep current'),
      },
      { label: t('Reason'), value: value.reason.trim() || t('Not provided') },
    ]
  }
  if (confirmation === 'credential') {
    const provider = providerData?.providers.find(
      (item) => item.id === credential.getValues('providerId')
    )
    confirmationDetails = [
      {
        label: t('Provider'),
        value: provider?.name ?? '—',
      },
      {
        label: t('Provider credential group'),
        value: credential.getValues('name') || '—',
      },
      ...(rotationPreview
        ? [
            {
              label: t('Version change'),
              value: `v${rotationPreview.currentVersion} → v${rotationPreview.nextVersion}`,
            },
            {
              label: t('Affected models'),
              value:
                rotationPreview.affectedModels
                  .map((model) => model.publicName)
                  .join(', ') || t('None'),
            },
          ]
        : []),
    ]
  }
  if (confirmation === 'binding') {
    confirmationDetails = [
      {
        label: t('Credential group'),
        value: bindingPreview
          ? `${bindingPreview.targetCredentialGroupName} v${bindingPreview.targetCredentialGroupVersion}`
          : '—',
      },
      {
        label: t('Selected models'),
        value: String(bindingPreview?.models.length ?? selectedModels.length),
      },
    ]
  }
  if (
    confirmation === 'management' &&
    selectedGroup &&
    managementCandidates.data
  ) {
    const value = management.getValues()
    const added = managementCandidates.data.filter(
      (model) =>
        selectedModels.includes(model.id) &&
        model.credentialGroupId !== selectedGroup.credentialGroupId
    )
    const removed = managementCandidates.data.filter(
      (model) =>
        !selectedModels.includes(model.id) &&
        model.credentialGroupId === selectedGroup.credentialGroupId
    )
    confirmationDetails = [
      {
        label: t('Provider'),
        value: selectedProvider?.name ?? '—',
      },
      ...(value.name.trim() !== selectedGroup.name
        ? [
            {
              label: t('API Key group'),
              value: `${selectedGroup.name} → ${value.name.trim()}`,
            },
          ]
        : []),
      ...(value.apiKey
        ? [{ label: t('API Key'), value: t('Will be replaced') }]
        : []),
      ...added.map((model) => ({
        label: model.credentialGroupName ? t('Move binding') : t('Add binding'),
        value: model.credentialGroupName
          ? `${model.publicName}: ${model.credentialGroupName} → ${selectedGroup.name}`
          : model.publicName,
      })),
      ...removed.map((model) => ({
        label: t('Remove binding'),
        value: model.publicName,
      })),
      {
        label: t('Reason'),
        value: value.reason.trim() || t('Not provided'),
      },
    ]
  }
  let confirmationTitle = t('Confirm runtime configuration change')
  if (confirmation === 'taskMedia') {
    confirmationTitle = t('Confirm task media configuration update')
  } else if (confirmation === 'databaseBackup') {
    confirmationTitle = t('Confirm database backup configuration update')
  } else if (confirmation === 'management') {
    confirmationTitle = t('Confirm API Key group changes')
  }

  if (runtime.isPending) {
    return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  }
  if (runtime.isError) {
    return (
      <div className='space-y-3'>
        {view === 'provider' && (
          <p className='text-destructive text-sm' role='alert'>
            {runtimeChangeError(runtime.error, t, 'preview')}
          </p>
        )}
        <Button variant='outline' onClick={() => void runtime.refetch()}>
          {t('Retry')}
        </Button>
      </div>
    )
  }

  return (
    <>
      <FormNavigationGuard
        when={hasUnsavedFormEdit}
        title={t('Discard unsaved changes?')}
        message={t('You have unsaved changes. Are you sure you want to leave?')}
        confirmText={t('Discard changes and leave')}
        cancelText={t('Keep editing')}
        onDiscard={discardAllDrafts}
      />
      <Tabs
        value={view === 'provider' ? 'providerCredentials' : activeSection}
        onValueChange={(value) => {
          setActiveSection(value as 'taskMedia' | 'databaseBackup')
          setOpenEditor(null)
        }}
        className='space-y-4'
      >
        {view === 'storage' && (
          <CanvasManagementTabsList>
            <CanvasManagementTabsTrigger value='taskMedia'>
              {t('Task media')}
            </CanvasManagementTabsTrigger>
            <CanvasManagementTabsTrigger value='databaseBackup'>
              {t('Database backups')}
            </CanvasManagementTabsTrigger>
          </CanvasManagementTabsList>
        )}

        {view === 'storage' && (
          <TabsContent value='taskMedia'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Task media')}</CardTitle>
                <CardDescription>
                  {t(
                    'Stores task inputs and generated outputs with separate retention controls.'
                  )}
                </CardDescription>
                {storageData?.taskMedia && (
                  <CardAction>
                    <div className='flex flex-wrap items-center justify-end gap-2'>
                      <BusinessTerm
                        kind='configStatus'
                        value={storageData.taskMedia.status}
                      />
                      <Badge variant='secondary'>
                        {t('Version')} {storageData.taskMedia.version}
                      </Badge>
                    </div>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className='space-y-5'>
                {storageData?.taskMedia ? (
                  <StorageSummary
                    bucketLabel={t('Task media bucket')}
                    item={storageData.taskMedia}
                    details={`${t('Input retention hours')}: ${storageData.taskMedia.inputRetentionHours}h · ${t('Output retention hours')}: ${storageData.taskMedia.outputRetentionHours}h · ${t('Download URL seconds')}: ${storageData.taskMedia.downloadUrlTtlSeconds}s`}
                    checkLabel={t('Task media check')}
                    buttonLabel={t('Check task media')}
                    editLabel={t('Update configuration')}
                    onCheck={() => {
                      const id = storageData.taskMedia?.id
                      if (id) checkTaskMedia.mutate(id)
                    }}
                    checking={checkTaskMedia.isPending}
                    editing={openEditor === 'taskMedia'}
                    onEdit={() =>
                      openEditor === 'taskMedia'
                        ? requestStorageClose('taskMedia')
                        : openStorageEditor('taskMedia')
                    }
                  />
                ) : (
                  <p className='text-muted-foreground text-sm'>
                    {t('Not configured')}
                  </p>
                )}
                {!storageData?.taskMedia && (
                  <Button
                    variant='outline'
                    onClick={() => openStorageEditor('taskMedia')}
                    aria-expanded={openEditor === 'taskMedia'}
                  >
                    {t('Update configuration')}
                  </Button>
                )}
                {openEditor === 'taskMedia' && (
                  <form
                    aria-label={t('Publish task media configuration')}
                    className='bg-muted/20 grid gap-3 rounded-lg border p-3 sm:grid-cols-2'
                    onSubmit={taskMedia.handleSubmit((value) => {
                      const currentAccessKeyId =
                        storageData?.taskMedia?.accessKeyId ?? ''
                      if (
                        (!storageData?.taskMedia ||
                          value.accessKeyId !== currentAccessKeyId) &&
                        !value.secretAccessKey
                      ) {
                        taskMedia.setError('secretAccessKey', {
                          message:
                            'Enter both credential fields or leave both blank',
                        })
                        return
                      }
                      if (!taskMedia.formState.isDirty) return
                      setConfirmation('taskMedia')
                    })}
                  >
                    <Field
                      label={t('R2 endpoint')}
                      error={taskMedia.formState.errors.endpoint?.message}
                    >
                      <Input
                        {...taskMedia.register('endpoint')}
                        placeholder='https://…r2.cloudflarestorage.com'
                      />
                    </Field>
                    <Field
                      label={t('Task media bucket')}
                      error={taskMedia.formState.errors.bucket?.message}
                    >
                      <Input {...taskMedia.register('bucket')} />
                    </Field>
                    <Field
                      label={t('Access key ID')}
                      error={taskMedia.formState.errors.accessKeyId?.message}
                    >
                      <Input
                        autoComplete='off'
                        {...taskMedia.register('accessKeyId')}
                      />
                    </Field>
                    <Field
                      label={t('Secret access key')}
                      error={
                        taskMedia.formState.errors.secretAccessKey?.message
                      }
                    >
                      <Input
                        type='password'
                        autoComplete='new-password'
                        {...taskMedia.register('secretAccessKey')}
                      />
                    </Field>
                    {storageData?.taskMedia?.credentialsConfigured ? (
                      <p className='text-muted-foreground text-xs sm:col-span-2'>
                        {t(
                          'Secret access keys are never shown. Leave both credential fields unchanged to keep the current credentials.'
                        )}
                      </p>
                    ) : null}
                    <Field
                      label={t('Input retention hours')}
                      error={
                        taskMedia.formState.errors.inputRetentionHours?.message
                      }
                    >
                      <Input
                        type='number'
                        min={1}
                        max={8760}
                        {...taskMedia.register('inputRetentionHours', {
                          valueAsNumber: true,
                        })}
                      />
                    </Field>
                    <Field
                      label={t('Output retention hours')}
                      error={
                        taskMedia.formState.errors.outputRetentionHours?.message
                      }
                    >
                      <Input
                        type='number'
                        min={1}
                        max={8760}
                        {...taskMedia.register('outputRetentionHours', {
                          valueAsNumber: true,
                        })}
                      />
                    </Field>
                    <Field
                      label={t('Download URL seconds')}
                      error={
                        taskMedia.formState.errors.downloadUrlTtlSeconds
                          ?.message
                      }
                    >
                      <Input
                        type='number'
                        min={60}
                        max={3600}
                        {...taskMedia.register('downloadUrlTtlSeconds', {
                          valueAsNumber: true,
                        })}
                      />
                    </Field>
                    <Field
                      label={t('Reason (optional)')}
                      error={taskMedia.formState.errors.reason?.message}
                    >
                      <Input {...taskMedia.register('reason')} />
                    </Field>
                    <div className='flex flex-wrap justify-end gap-2 sm:col-span-2'>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={taskMediaMutation.isPending}
                        onClick={() => requestStorageClose('taskMedia')}
                      >
                        {t('Cancel')}
                      </Button>
                      <Button
                        type='submit'
                        disabled={
                          taskMediaMutation.isPending ||
                          !taskMedia.formState.isDirty
                        }
                      >
                        {t('Review task media publication')}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {view === 'storage' && (
          <TabsContent value='databaseBackup'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Database backups')}</CardTitle>
                <CardDescription>
                  {t(
                    'Stores database backups with dedicated credentials and lifecycle managed outside task media.'
                  )}
                </CardDescription>
                {storageData?.databaseBackup && (
                  <CardAction>
                    <div className='flex flex-wrap items-center justify-end gap-2'>
                      <BusinessTerm
                        kind='configStatus'
                        value={storageData.databaseBackup.status}
                      />
                      <Badge variant='secondary'>
                        {t('Version')} {storageData.databaseBackup.version}
                      </Badge>
                    </div>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent className='space-y-5'>
                {storageData?.databaseBackup ? (
                  <StorageSummary
                    bucketLabel={t('Database backup bucket')}
                    item={storageData.databaseBackup}
                    checkLabel={t('Backup check')}
                    buttonLabel={t('Check backup')}
                    editLabel={t('Update configuration')}
                    onCheck={() => {
                      const id = storageData.databaseBackup?.id
                      if (id) checkDatabaseBackup.mutate(id)
                    }}
                    checking={checkDatabaseBackup.isPending}
                    editing={openEditor === 'databaseBackup'}
                    onEdit={() =>
                      openEditor === 'databaseBackup'
                        ? requestStorageClose('databaseBackup')
                        : openStorageEditor('databaseBackup')
                    }
                  />
                ) : (
                  <p className='text-muted-foreground text-sm'>
                    {t('Not configured')}
                  </p>
                )}
                {!storageData?.databaseBackup && (
                  <Button
                    variant='outline'
                    onClick={() => openStorageEditor('databaseBackup')}
                    aria-expanded={openEditor === 'databaseBackup'}
                  >
                    {t('Update configuration')}
                  </Button>
                )}
                {openEditor === 'databaseBackup' && (
                  <form
                    aria-label={t('Publish database backup configuration')}
                    className='bg-muted/20 grid gap-3 rounded-lg border p-3 sm:grid-cols-2'
                    onSubmit={databaseBackup.handleSubmit((value) => {
                      const currentAccessKeyId =
                        storageData?.databaseBackup?.accessKeyId ?? ''
                      if (
                        (!storageData?.databaseBackup ||
                          value.accessKeyId !== currentAccessKeyId) &&
                        !value.secretAccessKey
                      ) {
                        databaseBackup.setError('secretAccessKey', {
                          message:
                            'Enter both credential fields or leave both blank',
                        })
                        return
                      }
                      if (!databaseBackup.formState.isDirty) return
                      setConfirmation('databaseBackup')
                    })}
                  >
                    <Field
                      label={t('R2 endpoint')}
                      error={databaseBackup.formState.errors.endpoint?.message}
                    >
                      <Input
                        {...databaseBackup.register('endpoint')}
                        placeholder='https://…r2.cloudflarestorage.com'
                      />
                    </Field>
                    <Field
                      label={t('Database backup bucket')}
                      error={databaseBackup.formState.errors.bucket?.message}
                    >
                      <Input {...databaseBackup.register('bucket')} />
                    </Field>
                    <Field
                      label={t('Access key ID')}
                      error={
                        databaseBackup.formState.errors.accessKeyId?.message
                      }
                    >
                      <Input
                        autoComplete='off'
                        {...databaseBackup.register('accessKeyId')}
                      />
                    </Field>
                    <Field
                      label={t('Secret access key')}
                      error={
                        databaseBackup.formState.errors.secretAccessKey?.message
                      }
                    >
                      <Input
                        type='password'
                        autoComplete='new-password'
                        {...databaseBackup.register('secretAccessKey')}
                      />
                    </Field>
                    {storageData?.databaseBackup?.credentialsConfigured ? (
                      <p className='text-muted-foreground text-xs sm:col-span-2'>
                        {t(
                          'Secret access keys are never shown. Leave both credential fields unchanged to keep the current credentials.'
                        )}
                      </p>
                    ) : null}
                    <Field
                      label={t('Backup retention hours')}
                      error={
                        databaseBackup.formState.errors.backupRetentionHours
                          ?.message
                      }
                    >
                      <Input
                        type='number'
                        min={1}
                        max={8760}
                        {...databaseBackup.register('backupRetentionHours', {
                          valueAsNumber: true,
                        })}
                      />
                    </Field>
                    <Field
                      label={t('Download URL seconds')}
                      error={
                        databaseBackup.formState.errors.downloadUrlTtlSeconds
                          ?.message
                      }
                    >
                      <Input
                        type='number'
                        min={60}
                        max={3600}
                        {...databaseBackup.register('downloadUrlTtlSeconds', {
                          valueAsNumber: true,
                        })}
                      />
                    </Field>
                    <Field
                      label={t('Reason (optional)')}
                      error={databaseBackup.formState.errors.reason?.message}
                    >
                      <Input {...databaseBackup.register('reason')} />
                    </Field>
                    <div className='flex flex-wrap justify-end gap-2 sm:col-span-2'>
                      <Button
                        type='button'
                        variant='outline'
                        disabled={databaseBackupMutation.isPending}
                        onClick={() => requestStorageClose('databaseBackup')}
                      >
                        {t('Cancel')}
                      </Button>
                      <Button
                        type='submit'
                        disabled={
                          databaseBackupMutation.isPending ||
                          !databaseBackup.formState.isDirty
                        }
                      >
                        {t('Review database backup publication')}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {view === 'provider' && (
          <TabsContent value='providerCredentials' className='space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Provider credential groups')}</CardTitle>
                <CardDescription>
                  {t(
                    'Choose one provider and credential group. The overview keeps current status, bound models, and version history together.'
                  )}
                </CardDescription>
                <CardAction>
                  <Button
                    aria-expanded={addCredentialOpen}
                    onClick={() => {
                      credential.reset({
                        providerId: '',
                        credentialGroupId: undefined,
                        name: '',
                        apiKey: '',
                        reason: '',
                      })
                      setRotationPreview(null)
                      setAddCredentialOpen(true)
                    }}
                  >
                    {t('Add credential group')}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid items-end gap-3 md:grid-cols-2'>
                  <Field label={t('Provider')}>
                    <NativeSelect
                      className='w-full'
                      value={effectiveProviderId}
                      onChange={(event) =>
                        requestScopeChange({
                          kind: 'provider',
                          value: event.target.value,
                        })
                      }
                    >
                      {(providerData?.providers ?? []).map((provider) => (
                        <NativeSelectOption
                          key={provider.id}
                          value={provider.id}
                        >
                          {provider.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field label={t('Credential group')}>
                    <NativeSelect
                      className='w-full'
                      value={effectiveCredentialGroupId}
                      onChange={(event) =>
                        requestScopeChange({
                          kind: 'group',
                          value: event.target.value,
                        })
                      }
                    >
                      <NativeSelectOption value=''>
                        {t('Select credential group')}
                      </NativeSelectOption>
                      {providerGroups.map((group) => (
                        <NativeSelectOption
                          key={group.credentialGroupId}
                          value={group.credentialGroupId}
                        >
                          {group.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                </div>
                <label className='flex items-center gap-2 text-sm'>
                  <Checkbox
                    checked={showArchivedGroups}
                    onCheckedChange={(checked) => {
                      setActiveProviderTarget(undefined)
                      setNavigationTargetApplied(true)
                      setSelectedCredentialGroupId('')
                      setUnboundTargetPending(false)
                      setUnboundTargetModelId('')
                      setModelPagination((current) => ({
                        ...current,
                        pageIndex: 0,
                      }))
                      setShowArchivedGroups(checked === true)
                    }}
                  />
                  {t('Show archived API Key groups')}
                </label>
              </CardContent>
            </Card>

            {selectedGroup && (
              <Tabs
                value={providerTab}
                onValueChange={(value) =>
                  requestScopeChange({ kind: 'tab', value })
                }
                className='space-y-4'
              >
                <CanvasManagementTabsList>
                  <CanvasManagementTabsTrigger value='overview'>
                    {t('Overview')}
                  </CanvasManagementTabsTrigger>
                  <CanvasManagementTabsTrigger value='execution'>
                    {t('Execution policy')}
                  </CanvasManagementTabsTrigger>
                </CanvasManagementTabsList>

                <TabsContent value='overview' className='space-y-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle>{selectedGroup.name}</CardTitle>
                      <CardDescription>
                        {selectedProvider?.name ?? '—'}
                      </CardDescription>
                      <CardAction>
                        <div className='flex flex-wrap justify-end gap-2'>
                          <Badge variant='secondary'>
                            {t('Version')} {selectedGroup.version}
                          </Badge>
                        </div>
                      </CardAction>
                    </CardHeader>
                    <CardContent className='space-y-5'>
                      <div className='flex items-center gap-2 text-sm'>
                        <span className='text-muted-foreground'>
                          {t('Lifecycle status')}
                        </span>
                        <span>
                          {t(
                            `Credential group ${selectedGroup.lifecycleStatus}`
                          )}
                        </span>
                      </div>
                      <dl className='grid gap-3 text-sm md:grid-cols-2'>
                        <div className='bg-muted/30 rounded-lg p-3'>
                          <dt className='text-muted-foreground text-xs'>
                            {t('Security scheme name')}
                          </dt>
                          <dd className='mt-1 font-mono text-xs break-words'>
                            {selectedGroup.schemeNames.join(', ')}
                          </dd>
                        </div>
                        <div className='bg-muted/30 rounded-lg p-3'>
                          <dt className='text-muted-foreground text-xs'>
                            {t('Updated by')}
                          </dt>
                          <dd className='mt-1 font-medium'>
                            {selectedGroup.updatedBy} ·{' '}
                            {formatCanvasDateTime(selectedGroup.createdAt)}
                          </dd>
                        </div>
                      </dl>

                      <section
                        className='space-y-3'
                        aria-labelledby='bound-models-title'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                          <div>
                            <h3
                              id='bound-models-title'
                              className='font-semibold'
                            >
                              {openEditor === 'binding'
                                ? t('Eligible models')
                                : t('Bound models ({{count}})', {
                                    count: selectedGroup.boundModelCount,
                                  })}
                            </h3>
                            {openEditor === 'binding' && (
                              <p className='text-muted-foreground text-sm'>
                                {`${t('Binding target')}: ${selectedGroup.name} v${selectedGroup.version}`}
                              </p>
                            )}
                          </div>
                        </div>

                        <CanvasServerTable
                          data={pageModels}
                          columns={modelColumns}
                          total={providerData?.models.total ?? 0}
                          state={modelTableState}
                          searchLabel={t('Model name')}
                          loading={providerRuntime.isFetching}
                          emptyTitle={
                            openEditor === 'binding'
                              ? t('No eligible models')
                              : t('No bound models')
                          }
                          getRowId={(model) => model.id}
                          initialColumnVisibility={{
                            modelKey: false,
                            status: false,
                          }}
                          additionalFilters={
                            <>
                              <DataTableColumnFilterField
                                label={t('Model key')}
                              >
                                <Input
                                  value={modelKeyFilter}
                                  placeholder={t('Model key')}
                                  onChange={(event) =>
                                    setModelKeyFilter(event.target.value)
                                  }
                                />
                              </DataTableColumnFilterField>
                              <DataTableColumnFilterField label={t('Status')}>
                                <NativeSelect
                                  className='w-full'
                                  aria-label={t('Status')}
                                  value={modelStatusFilter}
                                  onChange={(event) =>
                                    setModelStatusFilter(event.target.value)
                                  }
                                >
                                  <NativeSelectOption value=''>
                                    {t('All statuses')}
                                  </NativeSelectOption>
                                  <NativeSelectOption value='PUBLISHED'>
                                    {t('Published')}
                                  </NativeSelectOption>
                                  <NativeSelectOption value='RETIRED'>
                                    {t('Retired')}
                                  </NativeSelectOption>
                                </NativeSelect>
                              </DataTableColumnFilterField>
                              {openEditor === 'binding' && (
                                <>
                                  <DataTableColumnFilterField
                                    label={t('Current credential group')}
                                  >
                                    <Input
                                      value={credentialGroupFilter}
                                      placeholder={t(
                                        'Current credential group'
                                      )}
                                      onChange={(event) =>
                                        setCredentialGroupFilter(
                                          event.target.value
                                        )
                                      }
                                    />
                                  </DataTableColumnFilterField>
                                  <DataTableColumnFilterField
                                    label={t('Binding status')}
                                  >
                                    <NativeSelect
                                      className='w-full'
                                      aria-label={t('Binding status')}
                                      value={bindingStatusFilter}
                                      onChange={(event) =>
                                        setBindingStatusFilter(
                                          event.target.value
                                        )
                                      }
                                    >
                                      <NativeSelectOption value=''>
                                        {t('All binding statuses')}
                                      </NativeSelectOption>
                                      <NativeSelectOption value='BOUND'>
                                        {t('Bound')}
                                      </NativeSelectOption>
                                      <NativeSelectOption value='UNBOUND'>
                                        {t('Not configured')}
                                      </NativeSelectOption>
                                    </NativeSelect>
                                  </DataTableColumnFilterField>
                                </>
                              )}
                            </>
                          }
                          hasActiveFilters={Boolean(
                            modelKeyFilter ||
                            modelStatusFilter ||
                            (openEditor === 'binding' &&
                              (credentialGroupFilter || bindingStatusFilter))
                          )}
                          activeFilterCount={
                            [
                              modelTableState.search,
                              modelKeyFilter,
                              modelStatusFilter,
                              ...(openEditor === 'binding'
                                ? [credentialGroupFilter, bindingStatusFilter]
                                : []),
                            ].filter(Boolean).length
                          }
                          onResetFilters={() => {
                            setModelKeyFilter('')
                            setModelStatusFilter('')
                            setCredentialGroupFilter('')
                            setBindingStatusFilter('')
                          }}
                        />
                        {openEditor === 'binding' && (
                          <form
                            aria-label={t('Publish model credential bindings')}
                            className='space-y-3 rounded-xl border p-4'
                            onSubmit={binding.handleSubmit(() => {
                              if (selectedModels.length === 0) return
                              bindingPreviewMutation.mutate({
                                credentialGroupVersionId: selectedGroup.id,
                                customerModelIds: selectedModels,
                                requestId: ++bindingPreviewRequestRef.current,
                              })
                            })}
                          >
                            <Field
                              label={t('Reason (optional)')}
                              error={binding.formState.errors.reason?.message}
                            >
                              <Input {...binding.register('reason')} />
                            </Field>
                            <label className='bg-muted/30 flex items-center gap-3 rounded-lg border p-3 text-sm font-medium'>
                              <Checkbox
                                checked={allPageSelected}
                                onCheckedChange={(checked) => {
                                  const pageIds = new Set(
                                    pageModels.map((model) => model.id)
                                  )
                                  updateSelectedModels((current) =>
                                    checked === true
                                      ? [...new Set([...current, ...pageIds])]
                                      : current.filter((id) => !pageIds.has(id))
                                  )
                                }}
                              />
                              {t('Select this page ({{count}})', {
                                count: pageModels.length,
                              })}
                            </label>
                            <p
                              className='text-sm font-medium'
                              aria-live='polite'
                            >
                              {t('Selected models: {{count}}', {
                                count: selectedModels.length,
                              })}
                            </p>
                            <div className='flex flex-wrap justify-end gap-2'>
                              <Button
                                type='button'
                                variant='outline'
                                onClick={resetProviderEdit}
                              >
                                {t('Cancel')}
                              </Button>
                              <Button
                                type='submit'
                                disabled={
                                  selectedModels.length === 0 ||
                                  bindingPreviewMutation.isPending
                                }
                              >
                                {t('Review model bindings')} (
                                {selectedModels.length})
                              </Button>
                            </div>
                          </form>
                        )}
                      </section>
                    </CardContent>
                    <CardFooter className='flex flex-wrap justify-end gap-2'>
                      <Button
                        ref={historyTriggerRef}
                        size='sm'
                        variant='outline'
                        onClick={() => setProviderDrawer('history')}
                      >
                        {t('View change history')}
                      </Button>
                      {selectedGroup.lifecycleStatus === 'ARCHIVED' ? (
                        <Button
                          size='sm'
                          onClick={() => setRestoreConfirmationOpen(true)}
                        >
                          {t('Restore API Key group')}
                        </Button>
                      ) : (
                        <Button
                          ref={managementTriggerRef}
                          size='sm'
                          onClick={openManagementDrawer}
                        >
                          {t('Manage API Key group')}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                </TabsContent>

                <TabsContent value='execution'>
                  <ExecutionSettings
                    view='credentialGroup'
                    credentialGroupId={selectedGroup.credentialGroupId}
                    credentialGroupName={selectedGroup.name}
                    providerName={selectedProvider?.name ?? '—'}
                    onDirtyChange={setExecutionPolicyDirty}
                  />
                </TabsContent>
              </Tabs>
            )}
          </TabsContent>
        )}

        {providerData && selectedGroup && (
          <Sheet
            open={providerDrawer !== null}
            onOpenChange={(open) => {
              if (!open) requestManagementClose()
            }}
          >
            <SheetContent
              className={sideDrawerContentClassName('sm:max-w-[40rem]')}
            >
              <SheetHeader className={sideDrawerHeaderClassName()}>
                <SheetTitle>
                  {providerDrawer === 'history'
                    ? t('Change history')
                    : t('Manage API Key group')}
                </SheetTitle>
                <SheetDescription>
                  {selectedGroup.name} · {selectedProvider?.name ?? '—'}
                </SheetDescription>
              </SheetHeader>
              {providerDrawer === 'history' ? (
                <div className='min-h-0 flex-1 overflow-y-auto px-4 pb-4'>
                  <CredentialGroupChangeHistory
                    credentialGroupId={selectedGroup.credentialGroupId}
                  />
                </div>
              ) : (
                <form
                  className={sideDrawerFormClassName()}
                  aria-label={t('Manage API Key group')}
                  onSubmit={management.handleSubmit(() => {
                    if (!hasUnsavedProviderEdit) return
                    setConfirmation('management')
                  })}
                >
                  <div className='min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4'>
                    <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm'>
                      <dt className='text-muted-foreground'>{t('Provider')}</dt>
                      <dd>{selectedProvider?.name ?? '—'}</dd>
                      <dt className='text-muted-foreground'>
                        {t('Authentication method')}
                      </dt>
                      <dd>{selectedGroup.schemeNames.join(', ')}</dd>
                      <dt className='text-muted-foreground'>{t('Status')}</dt>
                      <dd>
                        {t(`Credential group ${selectedGroup.lifecycleStatus}`)}
                      </dd>
                    </dl>
                    <Field
                      label={t('API Key group')}
                      error={management.formState.errors.name?.message}
                    >
                      <Input {...management.register('name')} />
                    </Field>
                    <Field
                      label={t('Replace API Key')}
                      error={management.formState.errors.apiKey?.message}
                    >
                      <Input
                        type='password'
                        autoComplete='new-password'
                        {...management.register('apiKey')}
                      />
                    </Field>
                    <p className='text-muted-foreground text-xs'>
                      {t(
                        'An API Key is already configured. Leave this field blank to keep it unchanged.'
                      )}
                    </p>
                    <section
                      className='space-y-2'
                      aria-label={t('Bound models')}
                    >
                      <Label htmlFor='api-key-group-model-search'>
                        {t('Filter models')}
                      </Label>
                      <Input
                        id='api-key-group-model-search'
                        value={managementModelSearch}
                        placeholder={t('Model name')}
                        onChange={(event) =>
                          setManagementModelSearch(event.target.value)
                        }
                      />
                      <div className='space-y-2'>
                        {managementCandidates.isPending && (
                          <p className='text-muted-foreground text-sm'>
                            {t('Loading')}
                          </p>
                        )}
                        {!managementCandidates.isPending &&
                          managementCandidates.isError && (
                            <div className='space-y-2 rounded-lg border p-3'>
                              <p className='text-destructive text-sm'>
                                {t('Unable to load model candidates')}
                              </p>
                              <Button
                                type='button'
                                variant='outline'
                                size='sm'
                                onClick={() =>
                                  void managementCandidates.refetch()
                                }
                              >
                                {t('Retry')}
                              </Button>
                            </div>
                          )}
                        {!managementCandidates.isPending &&
                          !managementCandidates.isError &&
                          managementModels.map((model) => (
                            <label
                              key={model.id}
                              className='bg-muted/30 flex items-start gap-3 rounded-lg border p-3'
                            >
                              <Checkbox
                                aria-label={`${t('Select model')} ${model.publicName}`}
                                checked={selectedModels.includes(model.id)}
                                onCheckedChange={(checked) =>
                                  updateSelectedModels((current) =>
                                    checked
                                      ? [...new Set([...current, model.id])]
                                      : current.filter((id) => id !== model.id)
                                  )
                                }
                              />
                              <span className='min-w-0 text-sm'>
                                <span className='block font-medium break-words'>
                                  {model.publicName}
                                </span>
                                <span className='text-muted-foreground block'>
                                  {modelBindingDescription(model)}
                                </span>
                              </span>
                            </label>
                          ))}
                        {managementCandidates.isSuccess &&
                        managementModels.length === 0 ? (
                          <p className='text-muted-foreground text-sm'>
                            {t('No matching models')}
                          </p>
                        ) : null}
                      </div>
                    </section>
                    <section className='border-destructive/40 space-y-2 border-t pt-4'>
                      <h3 className='text-destructive text-sm font-semibold'>
                        {t('Danger zone')}
                      </h3>
                      <p className='text-muted-foreground text-sm'>
                        {selectedGroup.boundModelCount > 0
                          ? t(
                              'Remove all model bindings before archiving this API Key group.'
                            )
                          : t(
                              'Archiving prevents new model bindings and task acceptance. History is retained.'
                            )}
                      </p>
                      <Button
                        type='button'
                        variant='destructive'
                        disabled={
                          selectedGroup.boundModelCount > 0 ||
                          archiveMutation.isPending
                        }
                        onClick={() => setArchiveConfirmationOpen(true)}
                      >
                        {t('Archive API Key group')}
                      </Button>
                    </section>
                  </div>
                  <SheetFooter className={sideDrawerFooterClassName()}>
                    <Button
                      type='button'
                      variant='outline'
                      onClick={requestManagementClose}
                    >
                      {t('Cancel')}
                    </Button>
                    <Button
                      type='submit'
                      disabled={
                        !managementCandidates.isSuccess ||
                        managementInitializedGroupId !==
                          selectedGroup.credentialGroupId ||
                        !hasUnsavedProviderEdit ||
                        managementMutation.isPending
                      }
                    >
                      {t('Preview changes')}
                    </Button>
                  </SheetFooter>
                </form>
              )}
            </SheetContent>
          </Sheet>
        )}

        {providerData && (
          <Sheet
            open={addCredentialOpen}
            onOpenChange={(open) => {
              if (open) setAddCredentialOpen(true)
              else requestCredentialClose()
            }}
          >
            <SheetContent className={sideDrawerContentClassName()}>
              <SheetHeader className={sideDrawerHeaderClassName()}>
                <SheetTitle>{t('Add credential group')}</SheetTitle>
                <SheetDescription>
                  {t(
                    'This publishes immutable configuration versions. Secret values will not be shown again.'
                  )}
                </SheetDescription>
              </SheetHeader>
              <CredentialEditor
                runtime={providerData}
                form={credential}
                drawer
                pending={credentialMutation.isPending}
                onCancel={requestCredentialClose}
                onReview={() => setConfirmation('credential')}
              />
            </SheetContent>
          </Sheet>
        )}

        <PricingActionConfirmation
          open={confirmation !== null}
          onOpenChange={(open) => !open && setConfirmation(null)}
          title={confirmationTitle}
          description={t('This will publish a new configuration version.')}
          details={confirmationDetails}
          confirmLabel={t('Confirm publication')}
          onConfirm={() => {
            if (confirmation === 'taskMedia') {
              taskMediaMutation.mutate(taskMedia.getValues())
            }
            if (confirmation === 'databaseBackup') {
              databaseBackupMutation.mutate(databaseBackup.getValues())
            }
            if (confirmation === 'credential') {
              credentialMutation.mutate(credential.getValues())
            }
            if (confirmation === 'binding') {
              bindingMutation.mutate(binding.getValues())
            }
            if (confirmation === 'management') {
              void management.handleSubmit((values) => {
                managementMutation.mutate(values)
              })()
            }
          }}
          pending={
            taskMediaMutation.isPending ||
            databaseBackupMutation.isPending ||
            credentialMutation.isPending ||
            bindingMutation.isPending ||
            managementMutation.isPending
          }
        >
          {confirmation === 'management' ? (
            <Field
              label={t('Reason (optional)')}
              error={management.formState.errors.reason?.message}
            >
              <Input maxLength={255} {...management.register('reason')} />
            </Field>
          ) : null}
          {confirmation === 'credential' && rotationPreview && (
            <StaticDataTable
              className='max-h-72'
              tableClassName='min-w-[520px] table-fixed'
              data={rotationPreview.affectedModels}
              empty={rotationPreview.affectedModels.length === 0}
              emptyContent={t('No affected models')}
              getRowKey={(model) => model.customerModelId}
              columns={[
                {
                  id: 'model',
                  header: t('Affected model'),
                  className: 'w-64',
                  cell: (model) => model.publicName,
                },
                {
                  id: 'change',
                  header: t('Version change'),
                  className: 'w-64',
                  cell: () =>
                    `v${rotationPreview.currentVersion} → v${rotationPreview.nextVersion}`,
                },
              ]}
            />
          )}
          {confirmation === 'binding' && bindingPreview && (
            <StaticDataTable
              className='max-h-72'
              tableClassName='min-w-[640px] table-fixed'
              data={bindingPreview.models}
              getRowKey={(model) => model.customerModelId}
              columns={[
                {
                  id: 'model',
                  header: t('Model name'),
                  className: 'w-52',
                  cell: (model) => (
                    <span className='break-words whitespace-normal'>
                      {model.publicName}
                    </span>
                  ),
                },
                {
                  id: 'current',
                  header: t('Current group and version'),
                  className: 'w-52',
                  cell: (model) =>
                    model.currentCredentialGroupName
                      ? `${model.currentCredentialGroupName} v${model.currentCredentialGroupVersion}`
                      : t('Not configured'),
                },
                {
                  id: 'target',
                  header: t('Target group and version'),
                  className: 'w-52',
                  cell: () =>
                    `${bindingPreview.targetCredentialGroupName} v${bindingPreview.targetCredentialGroupVersion}`,
                },
              ]}
            />
          )}
        </PricingActionConfirmation>

        <Dialog
          open={pendingScopeChange !== null}
          onOpenChange={(open) => !open && setPendingScopeChange(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Discard unsaved changes?')}</DialogTitle>
              <DialogDescription>
                {t(
                  'Changing the provider or credential group will discard the current unsubmitted form and model selection.'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => setPendingScopeChange(null)}
              >
                {t('Cancel')}
              </Button>
              <Button
                variant='destructive'
                onClick={() => {
                  if (pendingScopeChange) applyScopeChange(pendingScopeChange)
                  setPendingScopeChange(null)
                }}
              >
                {t('Discard changes')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={storageCloseRequested !== null}
          onOpenChange={(open) => !open && setStorageCloseRequested(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Discard unsaved changes?')}</DialogTitle>
              <DialogDescription>
                {t('You have unsaved changes. Are you sure you want to leave?')}
              </DialogDescription>
            </DialogHeader>
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => setStorageCloseRequested(null)}
              >
                {t('Cancel')}
              </Button>
              <Button
                variant='destructive'
                onClick={() => {
                  if (storageCloseRequested) {
                    closeStorageEditor(storageCloseRequested)
                  }
                }}
              >
                {t('Discard changes')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={credentialCloseRequested}
          onOpenChange={(open) => !open && setCredentialCloseRequested(false)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Discard unsaved changes?')}</DialogTitle>
              <DialogDescription>
                {t(
                  'Changing the provider or credential group will discard the current unsubmitted form and model selection.'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => setCredentialCloseRequested(false)}
              >
                {t('Cancel')}
              </Button>
              <Button
                variant='destructive'
                onClick={() => {
                  setCredentialCloseRequested(false)
                  resetProviderEdit()
                }}
              >
                {t('Discard changes')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={managementCloseRequested}
          onOpenChange={(open) => !open && setManagementCloseRequested(false)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('Discard unsaved API Key group changes?')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'These changes have not been saved. Closing will discard them. Do you still want to close?'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => setManagementCloseRequested(false)}
              >
                {t('Keep editing')}
              </Button>
              <Button
                variant='destructive'
                onClick={() => {
                  setManagementCloseRequested(false)
                  setProviderDrawer(null)
                  setSelectedModels([])
                  management.reset()
                }}
              >
                {t('Discard changes')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={archiveConfirmationOpen}
          onOpenChange={setArchiveConfirmationOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Archive API Key group')}</DialogTitle>
              <DialogDescription>
                {t(
                  'Archiving prevents new model bindings and task acceptance. Historical tasks, costs, and change records are retained.'
                )}
              </DialogDescription>
            </DialogHeader>
            <dl className='grid grid-cols-[auto_1fr] gap-3 text-sm'>
              <dt className='text-muted-foreground'>{t('API Key group')}</dt>
              <dd>{selectedGroup?.name ?? '—'}</dd>
              <dt className='text-muted-foreground'>
                {t('Currently bound models')}
              </dt>
              <dd>{selectedGroup?.boundModelCount ?? 0}</dd>
            </dl>
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => setArchiveConfirmationOpen(false)}
              >
                {t('Cancel')}
              </Button>
              <Button
                variant='destructive'
                disabled={
                  (selectedGroup?.boundModelCount ?? 0) > 0 ||
                  archiveMutation.isPending
                }
                onClick={() => archiveMutation.mutate()}
              >
                {t('Confirm archive')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog
          open={restoreConfirmationOpen}
          onOpenChange={setRestoreConfirmationOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('Restore API Key group')}</DialogTitle>
              <DialogDescription>
                {t(
                  'Restoring returns this API Key group to active selection. Model bindings are not changed.'
                )}
              </DialogDescription>
            </DialogHeader>
            <div className='flex justify-end gap-2'>
              <Button
                variant='outline'
                onClick={() => setRestoreConfirmationOpen(false)}
              >
                {t('Cancel')}
              </Button>
              <Button
                disabled={restoreMutation.isPending}
                onClick={() => restoreMutation.mutate()}
              >
                {t('Confirm restore')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Tabs>
    </>
  )
}

function CredentialEditor(props: {
  runtime: CanvasProviderConfiguration
  form: UseFormReturn<CredentialForm>
  drawer?: boolean
  pending: boolean
  onCancel: () => void
  onReview: () => void
}) {
  const { t } = useTranslation()
  const replacing = Boolean(props.form.watch('credentialGroupId'))
  const provider = props.runtime.providers.find(
    (item) => item.id === props.form.watch('providerId')
  )
  return (
    <form
      aria-label={t('Publish provider credential group')}
      className={
        props.drawer
          ? 'flex min-h-0 flex-1 flex-col'
          : 'bg-muted/20 grid gap-3 rounded-xl border p-4 md:grid-cols-2 xl:grid-cols-3'
      }
      onSubmit={props.form.handleSubmit(props.onReview)}
    >
      <div className={props.drawer ? sideDrawerFormClassName() : 'contents'}>
        <Field
          label={t('Provider')}
          error={props.form.formState.errors.providerId?.message}
        >
          <NativeSelect
            className='w-full'
            disabled={replacing}
            {...props.form.register('providerId', {
              onChange: () => {
                props.form.resetField('apiKey', { defaultValue: '' })
              },
            })}
          >
            <NativeSelectOption value=''>
              {t('Select provider')}
            </NativeSelectOption>
            {props.runtime.providers.map((item) => (
              <NativeSelectOption key={item.id} value={item.id}>
                {item.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label={t('Credential group')}
          error={props.form.formState.errors.name?.message}
        >
          <Input disabled={replacing} {...props.form.register('name')} />
        </Field>
        <div className='space-y-2'>
          <Label>{t('Security scheme name')}</Label>
          <div className='flex flex-wrap gap-2'>
            {(provider?.credentialSchemes ?? []).map((schemeName) => (
              <span
                key={schemeName}
                className='bg-muted rounded-lg border px-2.5 py-1.5 font-mono text-sm'
              >
                {schemeName}
              </span>
            ))}
            {!provider && (
              <span className='text-muted-foreground text-sm'>
                {t('Select provider')}
              </span>
            )}
          </div>
        </div>
        <Field
          label={t('Provider API Key value')}
          error={props.form.formState.errors.apiKey?.message}
        >
          <Input
            type='password'
            autoComplete='new-password'
            {...props.form.register('apiKey')}
          />
        </Field>
        <Field
          label={t('Reason (optional)')}
          error={props.form.formState.errors.reason?.message}
        >
          <Input {...props.form.register('reason')} />
        </Field>
      </div>
      {props.drawer ? (
        <SheetFooter className={sideDrawerFooterClassName()}>
          <Button
            type='button'
            variant='outline'
            disabled={props.pending}
            onClick={props.onCancel}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' disabled={props.pending}>
            {t('Next')}
          </Button>
        </SheetFooter>
      ) : (
        <div className='flex flex-wrap justify-end gap-2 md:col-span-2 xl:col-span-3'>
          <Button
            type='button'
            variant='outline'
            disabled={props.pending}
            onClick={props.onCancel}
          >
            {t('Cancel')}
          </Button>
          <Button type='submit' disabled={props.pending}>
            {t('Review credential publication')}
          </Button>
        </div>
      )}
    </form>
  )
}

function CredentialGroupChangeHistory(props: { credentialGroupId: string }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const changes = useQuery({
    queryKey: [
      'canvas-cloud',
      'provider-credential-group-changes',
      props.credentialGroupId,
      page,
    ],
    queryFn: ({ signal }) =>
      getCanvasProviderCredentialGroupChanges(
        props.credentialGroupId,
        { page, pageSize: 20 },
        signal
      ),
  })
  useEffect(() => setPage(1), [props.credentialGroupId])
  if (changes.isPending) {
    return <p className='text-muted-foreground text-sm'>{t('Loading')}</p>
  }
  if (changes.isError) {
    return (
      <div className='space-y-2'>
        <p className='text-destructive text-sm'>
          {t('Unable to load change history')}
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={() => void changes.refetch()}
        >
          {t('Retry')}
        </Button>
      </div>
    )
  }
  return (
    <div className='space-y-3'>
      {changes.data.items.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {t('No change history')}
        </p>
      ) : null}
      {changes.data.items.map((event) => (
        <article key={event.id} className='space-y-2 rounded-lg border p-3'>
          <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
            <strong>{t(event.type)}</strong>
            <span>{t(event.outcome)}</span>
          </div>
          <p className='text-muted-foreground text-xs'>
            {formatCanvasDateTime(event.occurredAt)} ·{' '}
            {event.operator ?? t('Unknown operator')}
          </p>
          <ul className='space-y-1 text-sm'>
            {event.changes.map((change, index) => (
              // Audit changes have no stable per-change identifier and are immutable within an event.
              // eslint-disable-next-line react/no-array-index-key
              <li key={`${event.id}-${index}`}>
                {formatCredentialGroupChange(change, t)}
              </li>
            ))}
          </ul>
          <p className='text-sm'>
            <span className='text-muted-foreground'>{t('Reason')}:</span>{' '}
            {event.reason ?? t('Not provided')}
          </p>
        </article>
      ))}
      <div className='flex justify-end gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={page === 1}
          onClick={() => setPage((value) => value - 1)}
        >
          {t('Previous')}
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={page * changes.data.pageSize >= changes.data.total}
          onClick={() => setPage((value) => value + 1)}
        >
          {t('Next')}
        </Button>
      </div>
    </div>
  )
}

function formatCredentialGroupChange(
  change: CanvasProviderCredentialGroupChange['changes'][number],
  t: (key: string) => string
) {
  if (change.type === 'KEY_REPLACED') {
    return t('API Key replaced')
  }
  if (change.type === 'GROUP_RENAMED') {
    return `${t('API Key group')}: ${change.before ?? '—'} → ${change.after ?? '—'}`
  }
  if (change.modelName) {
    return `${change.modelName}: ${change.fromGroup ?? t('Unbound')} → ${change.toGroup ?? t('Unbound')}`
  }
  return t(change.type ?? 'GROUP_UPDATED')
}

function StorageSummary(props: {
  bucketLabel: string
  item: {
    version: number
    status: string
    endpoint: string
    bucket: string
    updatedBy: string
    createdAt: string
    latestCheck: CanvasRuntimeConnectionCheck | null
  }
  details?: string
  checkLabel: string
  buttonLabel: string
  editLabel: string
  checking: boolean
  editing: boolean
  onCheck: () => void
  onEdit: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className='space-y-5 text-sm'>
      <dl className='grid gap-3 md:grid-cols-2 xl:grid-cols-3'>
        <div className='bg-muted/30 min-w-0 rounded-lg p-3 xl:col-span-2'>
          <dt className='text-muted-foreground text-xs'>{t('R2 endpoint')}</dt>
          <dd className='mt-1 font-medium break-all'>{props.item.endpoint}</dd>
        </div>
        <div className='bg-muted/30 min-w-0 rounded-lg p-3'>
          <dt className='text-muted-foreground text-xs'>{props.bucketLabel}</dt>
          <dd className='mt-1 font-medium break-all'>{props.item.bucket}</dd>
        </div>
        {props.details && (
          <div className='bg-muted/30 min-w-0 rounded-lg p-3 md:col-span-2'>
            <dt className='text-muted-foreground text-xs'>
              {t('Retention and download')}
            </dt>
            <dd className='mt-1 font-medium'>{props.details}</dd>
          </div>
        )}
        <div className='bg-muted/30 min-w-0 rounded-lg p-3'>
          <dt className='text-muted-foreground text-xs'>{t('Updated by')}</dt>
          <dd className='mt-1 font-medium'>
            {props.item.updatedBy} ·{' '}
            {formatCanvasDateTime(props.item.createdAt)}
          </dd>
        </div>
      </dl>
      <div className='bg-muted/30 flex flex-col gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
        <dl className='min-w-0 text-xs'>
          <ConnectionCheck
            label={props.checkLabel}
            value={props.item.latestCheck}
          />
        </dl>
        <div className='flex shrink-0 flex-wrap gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={props.checking}
            onClick={props.onCheck}
          >
            {props.buttonLabel}
          </Button>
          <Button
            size='sm'
            aria-expanded={props.editing}
            onClick={props.onEdit}
          >
            {props.editLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field(props: {
  label: string
  error?: unknown
  children: ReactElement<{
    id?: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean
  }>
}) {
  const { t } = useTranslation()
  const generatedId = useId()
  const controlId = props.children.props.id ?? `field-${generatedId}`
  const errorId = `${controlId}-error`
  const hasError = Boolean(props.error)
  const control = cloneElement(props.children, {
    id: controlId,
    'aria-invalid': hasError || undefined,
    'aria-describedby': hasError
      ? errorId
      : props.children.props['aria-describedby'],
  })
  return (
    <div className='min-w-0 space-y-1'>
      <Label className='block' htmlFor={controlId}>
        {props.label}
      </Label>
      <span className='block font-normal'>{control}</span>
      {hasError && (
        <div id={errorId} className='text-destructive text-xs' role='alert'>
          {t(String(props.error))}
        </div>
      )}
    </div>
  )
}

function ConnectionCheck(props: {
  label: string
  value: CanvasRuntimeConnectionCheck | null
}) {
  const { t } = useTranslation()
  let statusClass = 'text-muted-foreground'
  if (props.value?.outcome === 'PASSED') {
    statusClass = 'text-emerald-600 dark:text-emerald-400'
  }
  if (props.value?.outcome === 'FAILED') statusClass = 'text-destructive'
  let statusLabel = t('Not checked')
  if (props.value?.outcome === 'PASSED') statusLabel = t('Passed')
  if (props.value?.outcome === 'FAILED') statusLabel = t('Failed')
  return (
    <div>
      <dt className='text-muted-foreground'>{props.label}</dt>
      <dd>
        <span className={statusClass}>{statusLabel}</span>
        {props.value && (
          <>
            {' '}
            · {formatCanvasDateTime(props.value.checkedAt)}
            {props.value.checkedBy ? ` · ${props.value.checkedBy}` : ''}
          </>
        )}
        {props.value?.outcome === 'FAILED' && (
          <span className='text-muted-foreground block'>
            {connectionCheckReason(props.value.reasonCode, t)}
          </span>
        )}
      </dd>
    </div>
  )
}

function connectionCheckReason(
  reasonCode: string | null,
  translate: (key: string) => string
) {
  if (reasonCode === 'PROVIDER_CHECK_REQUIRES_CHANNEL') {
    return translate('A safe provider check requires a bound provider channel')
  }
  if (reasonCode === 'R2_CONNECTION_FAILED') {
    return translate('The R2 connection could not be verified')
  }
  return reasonCode ?? translate('Connection check failed')
}
