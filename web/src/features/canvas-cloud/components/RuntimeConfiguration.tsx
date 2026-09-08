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
  Fragment,
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

import {
  DataTableColumnHeader,
  DataTableRow,
  StaticDataTable,
} from '@/components/data-table'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
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
import { TableCell, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { useDebounce } from '@/hooks'

import {
  bindCanvasProviderCredentials,
  checkCanvasCustomerModelAccessPermission,
  checkCanvasDatabaseBackupStorage,
  checkCanvasTaskMediaStorage,
  getCanvasCredentialRotationPreview,
  getCanvasCredentialVersionAffectedModels,
  getCanvasModelCredentialBindingHistory,
  getCanvasProviderConfiguration,
  getCanvasProviderCredentialHistory,
  getCanvasRuntimeConfiguration,
  previewCanvasProviderCredentialBindings,
  publishCanvasDatabaseBackupStorage,
  publishCanvasProviderCredentialGroup,
  publishCanvasTaskMediaStorage,
} from '../api'
import { formatCanvasDateTime } from '../formatters'
import type {
  CanvasCredentialRotationPreview,
  CanvasModelBindingPreview,
  CanvasModelAccessPermissionCheck,
  CanvasProviderConfiguration,
  CanvasProviderConfigurationQuery,
  CanvasProviderCredentialVersion,
  CanvasProviderModel,
  CanvasRuntimeConnectionCheck,
} from '../types'
import { useServerTableState } from '../use-server-table-state'
import { BusinessTerm } from './BusinessTerm'
import { CanvasColumnFilterField } from './CanvasColumnFilterPanel'
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

const taskMediaSchema = z.object({
  endpoint: z.string().url().refine(isHttpsOrigin),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  inputRetentionHours: z.number().int().min(1).max(8760),
  outputRetentionHours: z.number().int().min(1).max(8760),
  downloadUrlTtlSeconds: z.number().int().min(60).max(3600),
  reason: z.string().trim().min(1).max(255),
})
type TaskMediaForm = z.infer<typeof taskMediaSchema>
const databaseBackupSchema = z.object({
  endpoint: z.string().url().refine(isHttpsOrigin),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  reason: z.string().trim().min(1).max(255),
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
    .min(1, { error: 'Enter a reason' })
    .max(255, { error: 'Use no more than 255 characters' }),
})
type CredentialForm = z.infer<typeof credentialSchema>
const bindingSchema = z.object({
  reason: z.string().trim().max(255),
})
type BindingForm = z.infer<typeof bindingSchema>

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
  const [activeSection, setActiveSection] = useState<
    'taskMedia' | 'databaseBackup'
  >('taskMedia')
  const [openEditor, setOpenEditor] = useState<
    'taskMedia' | 'databaseBackup' | 'credential' | 'binding' | null
  >(null)
  const [addCredentialOpen, setAddCredentialOpen] = useState(false)
  const [credentialCloseRequested, setCredentialCloseRequested] =
    useState(false)
  const [selectedProviderId, setSelectedProviderId] = useState(
    targetProviderId ?? ''
  )
  const [selectedCredentialGroupId, setSelectedCredentialGroupId] = useState(
    targetCredentialGroupId ?? ''
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
  const [confirmation, setConfirmation] = useState<
    'taskMedia' | 'databaseBackup' | 'credential' | 'binding' | null
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
  const selectedModelsRef = useRef(selectedModels)
  selectedModelsRef.current = selectedModels
  const selectedGroupVersionRef = useRef('')
  const [rotationPreview, setRotationPreview] =
    useState<CanvasCredentialRotationPreview | null>(null)
  const [bindingPreview, setBindingPreview] =
    useState<CanvasModelBindingPreview | null>(null)
  const [expandedBindingHistoryModelId, setExpandedBindingHistoryModelId] =
    useState('')
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
    setSelectedProviderId(targetProviderId ?? '')
    setSelectedCredentialGroupId(targetCredentialGroupId ?? '')
    setNavigationTargetApplied(false)
    rotationPreviewRequestRef.current += 1
    bindingPreviewRequestRef.current += 1
  }, [
    targetCredentialGroupId,
    targetCredentialGroupVersionId,
    targetModelId,
    targetProviderId,
  ])
  const providerQuery: CanvasProviderConfigurationQuery = {
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

  const hasUnsavedProviderEdit =
    openEditor === 'credential' || addCredentialOpen
      ? credential.formState.isDirty
      : openEditor === 'binding' &&
        (binding.formState.isDirty || selectedModels.length > 0)
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
    } else {
      setSelectedProviderId(
        (current) => current || providerData?.selectedProviderId || ''
      )
      setSelectedCredentialGroupId(change.value)
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
  const taskMediaMutation = useMutation({
    mutationFn: (value: TaskMediaForm) =>
      publishCanvasTaskMediaStorage({
        endpoint: value.endpoint,
        mediaBucket: value.bucket,
        mediaCredentials: {
          accessKeyId: value.accessKeyId,
          secretAccessKey: value.secretAccessKey,
        },
        inputRetentionHours: value.inputRetentionHours,
        outputRetentionHours: value.outputRetentionHours,
        downloadUrlTtlSeconds: value.downloadUrlTtlSeconds,
        reason: value.reason,
      }),
    onSuccess: async () => {
      setConfirmation(null)
      setOpenEditor(null)
      taskMedia.resetField('accessKeyId')
      taskMedia.resetField('secretAccessKey')
      toast.success(t('Task media configuration published'))
      await refresh()
    },
    onError: () => toast.error(t('Task media configuration failed')),
  })
  const databaseBackupMutation = useMutation({
    mutationFn: (value: DatabaseBackupForm) =>
      publishCanvasDatabaseBackupStorage({
        endpoint: value.endpoint,
        backupBucket: value.bucket,
        backupCredentials: {
          accessKeyId: value.accessKeyId,
          secretAccessKey: value.secretAccessKey,
        },
        reason: value.reason,
      }),
    onSuccess: async () => {
      setConfirmation(null)
      setOpenEditor(null)
      databaseBackup.resetField('accessKeyId')
      databaseBackup.resetField('secretAccessKey')
      toast.success(t('Database backup configuration published'))
      await refresh()
    },
    onError: () => toast.error(t('Database backup configuration failed')),
  })
  const credentialMutation = useMutation({
    mutationFn: (value: CredentialForm) => {
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
        reason: value.reason,
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
    onError: async (error) => {
      setConfirmation(null)
      toast.error(runtimeChangeError(error, t, 'credential'))
      await refresh()
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
  const rotationPreviewMutation = useMutation({
    mutationFn: (input: { credentialGroupId: string; requestId: number }) =>
      getCanvasCredentialRotationPreview(input.credentialGroupId),
    onError: (error) => toast.error(runtimeChangeError(error, t, 'preview')),
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
  const modelAccessCheck = useMutation({
    mutationFn: checkCanvasCustomerModelAccessPermission,
    onSuccess: async (result) => {
      if (result.outcome === 'PASSED') {
        toast.success(t('Access permission verified'))
      } else if (result.outcome === 'UNVERIFIABLE') {
        toast.error(t('Unable to verify'))
      } else {
        toast.error(t('Access permission denied'))
      }
      await refresh()
    },
    onError: () => toast.error(t('Unable to verify')),
  })

  const effectiveProviderId =
    selectedProviderId || providerData?.selectedProviderId || ''
  const effectiveCredentialGroupId =
    selectedCredentialGroupId || providerData?.selectedCredentialGroupId || ''
  const providerGroups = (providerData?.credentialGroups ?? []).filter(
    (item) => item.providerId === effectiveProviderId
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
    setNavigationTargetApplied(true)
    if (providerData.navigationTarget.bindingStatus === 'UNBOUND') {
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
            <Button
              type='button'
              variant='link'
              className='h-auto max-w-full justify-start p-0 text-left font-medium break-words whitespace-normal'
              aria-expanded={expandedBindingHistoryModelId === row.original.id}
              onClick={() =>
                setExpandedBindingHistoryModelId((current) =>
                  current === row.original.id ? '' : row.original.id
                )
              }
            >
              {row.original.publicName}
            </Button>
          ),
      },
      {
        id: 'modelKey',
        accessorKey: 'modelKey',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model key')} />
        ),
        meta: { label: t('Model key') },
        cell: ({ row }) => (
          <span className='block font-mono text-xs break-all whitespace-normal'>
            {row.original.modelKey}
          </span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Status')} />
        ),
        meta: { label: t('Status') },
        cell: ({ row }) => (
          <BusinessTerm kind='configStatus' value={row.original.status} />
        ),
      },
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
            {
              id: 'accessPermission',
              header: t('Access permission'),
              meta: { label: t('Access permission') },
              enableSorting: false,
              cell: ({ row }) => (
                <div className='flex min-w-48 flex-wrap items-center gap-2'>
                  <AccessPermissionStatus
                    value={row.original.latestAccessCheck}
                  />
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={
                      modelAccessCheck.isPending &&
                      modelAccessCheck.variables === row.original.id
                    }
                    onClick={() => modelAccessCheck.mutate(row.original.id)}
                  >
                    {t('Check access permission')}
                  </Button>
                </div>
              ),
            } satisfies ColumnDef<CanvasProviderModel, unknown>,
          ]),
    ],
    [
      expandedBindingHistoryModelId,
      modelAccessCheck,
      openEditor,
      selectedModels,
      t,
    ]
  )
  let confirmationDetails = [
    { label: t('Selected models'), value: String(selectedModels.length) },
  ]
  if (confirmation === 'taskMedia') {
    confirmationDetails = [
      { label: t('Environment'), value: storageData?.environment ?? '—' },
      { label: t('Task media bucket'), value: taskMedia.getValues('bucket') },
    ]
  }
  if (confirmation === 'databaseBackup') {
    confirmationDetails = [
      { label: t('Environment'), value: storageData?.environment ?? '—' },
      {
        label: t('Database backup bucket'),
        value: databaseBackup.getValues('bucket'),
      },
    ]
  }
  if (confirmation === 'credential') {
    const provider = providerData?.providers.find(
      (item) => item.id === credential.getValues('providerId')
    )
    confirmationDetails = [
      {
        label: t('Provider'),
        value: provider ? `${provider.code} · ${provider.name}` : '—',
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
      <FormNavigationGuard when={hasUnsavedFormEdit} />
      <Tabs
        value={view === 'provider' ? 'providerCredentials' : activeSection}
        onValueChange={(value) => {
          setActiveSection(value as 'taskMedia' | 'databaseBackup')
          setOpenEditor(null)
        }}
        className='space-y-4'
      >
        {view === 'storage' && (
          <Card>
            <CardHeader>
              <CardTitle>{t('Runtime storage')}</CardTitle>
              <CardDescription>
                {t(
                  'Task media and database backups use independent buckets, credentials, publications, and connection checks.'
                )}
              </CardDescription>
              <CardAction>
                <div className='bg-muted rounded-full border px-3 py-1 text-xs font-medium whitespace-nowrap'>
                  {t('Current environment')}: {storageData?.environment}
                </div>
              </CardAction>
            </CardHeader>
            <CardContent>
              <TabsList className='h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden p-1'>
                <TabsTrigger
                  value='taskMedia'
                  className='h-8 min-h-8 flex-none px-3'
                >
                  {t('Task media')}
                </TabsTrigger>
                <TabsTrigger
                  value='databaseBackup'
                  className='h-8 min-h-8 flex-none px-3'
                >
                  {t('Database backups')}
                </TabsTrigger>
              </TabsList>
            </CardContent>
          </Card>
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
                        : setOpenEditor('taskMedia')
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
                    onClick={() => setOpenEditor('taskMedia')}
                    aria-expanded={openEditor === 'taskMedia'}
                  >
                    {t('Update configuration')}
                  </Button>
                )}
                {openEditor === 'taskMedia' && (
                  <form
                    aria-label={t('Publish task media configuration')}
                    className='bg-muted/20 grid gap-3 rounded-lg border p-3 sm:grid-cols-2'
                    onSubmit={taskMedia.handleSubmit(() =>
                      setConfirmation('taskMedia')
                    )}
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
                      label={t('Reason')}
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
                        disabled={taskMediaMutation.isPending}
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
                        : setOpenEditor('databaseBackup')
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
                    onClick={() => setOpenEditor('databaseBackup')}
                    aria-expanded={openEditor === 'databaseBackup'}
                  >
                    {t('Update configuration')}
                  </Button>
                )}
                {openEditor === 'databaseBackup' && (
                  <form
                    aria-label={t('Publish database backup configuration')}
                    className='bg-muted/20 grid gap-3 rounded-lg border p-3 sm:grid-cols-2'
                    onSubmit={databaseBackup.handleSubmit(() =>
                      setConfirmation('databaseBackup')
                    )}
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
                    <Field
                      label={t('Reason')}
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
                        disabled={databaseBackupMutation.isPending}
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
                          {provider.code} · {provider.name}
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
                <TabsList className='h-10 w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto overflow-y-hidden p-1'>
                  <TabsTrigger
                    value='overview'
                    className='h-8 min-h-8 flex-none px-3'
                  >
                    {t('Overview')}
                  </TabsTrigger>
                  <TabsTrigger
                    value='execution'
                    className='h-8 min-h-8 flex-none px-3'
                  >
                    {t('Execution policy')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value='overview' className='space-y-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle>{selectedGroup.name}</CardTitle>
                      <CardDescription>
                        {selectedGroup.providerCode}
                      </CardDescription>
                      <CardAction>
                        <div className='flex flex-wrap justify-end gap-2'>
                          <span className='bg-muted rounded-md px-2 py-1 text-xs font-medium tabular-nums'>
                            v{selectedGroup.version}
                          </span>
                        </div>
                      </CardAction>
                    </CardHeader>
                    <CardContent className='space-y-5'>
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

                      {providerData && openEditor === 'credential' && (
                        <CredentialEditor
                          runtime={providerData}
                          form={credential}
                          pending={credentialMutation.isPending}
                          onCancel={resetProviderEdit}
                          onReview={() => setConfirmation('credential')}
                        />
                      )}

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
                          <Button
                            size='sm'
                            aria-expanded={openEditor === 'binding'}
                            onClick={() => {
                              rotationPreviewRequestRef.current += 1
                              bindingPreviewRequestRef.current += 1
                              setOpenEditor(
                                openEditor === 'binding' ? null : 'binding'
                              )
                              setSelectedModels([])
                              setBindingPreview(null)
                              binding.reset({ reason: '' })
                            }}
                          >
                            {openEditor === 'binding'
                              ? t('Finish managing bindings')
                              : t('Manage model bindings')}
                          </Button>
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
                          renderRow={
                            openEditor === 'binding'
                              ? undefined
                              : (row) => (
                                  <>
                                    <DataTableRow row={row} />
                                    {expandedBindingHistoryModelId ===
                                      row.original.id && (
                                      <TableRow>
                                        <TableCell
                                          colSpan={row.getVisibleCells().length}
                                          className='bg-muted/20 p-4'
                                        >
                                          <BindingHistoryPanel
                                            model={row.original}
                                          />
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </>
                                )
                          }
                          additionalFilters={
                            <>
                              <CanvasColumnFilterField label={t('Model key')}>
                                <Input
                                  value={modelKeyFilter}
                                  placeholder={t('Model key')}
                                  onChange={(event) =>
                                    setModelKeyFilter(event.target.value)
                                  }
                                />
                              </CanvasColumnFilterField>
                              <CanvasColumnFilterField label={t('Status')}>
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
                              </CanvasColumnFilterField>
                              {openEditor === 'binding' && (
                                <>
                                  <CanvasColumnFilterField
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
                                  </CanvasColumnFilterField>
                                  <CanvasColumnFilterField
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
                                  </CanvasColumnFilterField>
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

                      <CredentialVersionHistory
                        credentialGroupId={selectedGroup.credentialGroupId}
                        currentVersionId={selectedGroup.id}
                        targetVersionId={
                          activeProviderTarget?.credentialGroupVersionId
                        }
                      />
                    </CardContent>
                    <CardFooter className='flex flex-wrap justify-end gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={rotationPreviewMutation.isPending}
                        onClick={() => {
                          bindingPreviewRequestRef.current += 1
                          setBindingPreview(null)
                          rotationPreviewMutation.mutate(
                            {
                              credentialGroupId:
                                selectedGroup.credentialGroupId,
                              requestId: ++rotationPreviewRequestRef.current,
                            },
                            {
                              onSuccess: (preview, input) => {
                                if (
                                  input.requestId !==
                                  rotationPreviewRequestRef.current
                                ) {
                                  return
                                }
                                setRotationPreview(preview)
                                credential.reset({
                                  providerId: selectedGroup.providerId,
                                  credentialGroupId:
                                    selectedGroup.credentialGroupId,
                                  name: selectedGroup.name,
                                  apiKey: '',
                                  reason: '',
                                })
                                setOpenEditor('credential')
                                requestAnimationFrame(() =>
                                  credential.setFocus('apiKey')
                                )
                              },
                            }
                          )
                        }}
                      >
                        {t('Replace API Key')}
                      </Button>
                    </CardFooter>
                  </Card>
                </TabsContent>

                <TabsContent value='execution'>
                  <ExecutionSettings
                    view='credentialGroup'
                    credentialGroupId={selectedGroup.credentialGroupId}
                    credentialGroupName={selectedGroup.name}
                    providerName={selectedGroup.providerCode}
                    onDirtyChange={setExecutionPolicyDirty}
                  />
                </TabsContent>
              </Tabs>
            )}
          </TabsContent>
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
          title={t('Confirm runtime configuration change')}
          description={t(
            'This publishes immutable configuration versions. Secret values will not be shown again.'
          )}
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
          }}
          pending={
            taskMediaMutation.isPending ||
            databaseBackupMutation.isPending ||
            credentialMutation.isPending ||
            bindingMutation.isPending
          }
        >
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
                {item.code}
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
          label={t('Reason')}
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

function CredentialVersionHistory(props: {
  credentialGroupId: string
  currentVersionId: string
  targetVersionId?: string
}) {
  const { t } = useTranslation()
  const tableState = useServerTableState<
    'version' | 'effectiveAt' | 'updatedBy' | 'reason'
  >('version')
  const [versionFilter, setVersionFilter] = useState('')
  const [operatorFilter, setOperatorFilter] = useState('')
  const [expandedVersionId, setExpandedVersionId] = useState('')
  const [pendingTargetVersionId, setPendingTargetVersionId] = useState(
    props.targetVersionId ?? ''
  )
  const debouncedOperator = useDebounce(operatorFilter.trim(), 300)
  const parsedVersion = /^\d+$/.test(versionFilter)
    ? Number(versionFilter)
    : undefined
  const historyQuery = {
    ...(pendingTargetVersionId
      ? { targetVersionId: pendingTargetVersionId }
      : {}),
    ...(parsedVersion ? { version: parsedVersion } : {}),
    ...(debouncedOperator ? { operator: debouncedOperator } : {}),
    ...(tableState.query.search ? { reason: tableState.query.search } : {}),
    page: tableState.query.page,
    pageSize: tableState.query.pageSize,
    sortBy: tableState.query.sortBy,
    sortOrder: tableState.query.sortOrder,
  }
  const history = useQuery({
    queryKey: [
      'canvas-cloud',
      'provider-credential-history',
      props.credentialGroupId,
      historyQuery,
    ],
    queryFn: ({ signal }) =>
      getCanvasProviderCredentialHistory(
        props.credentialGroupId,
        historyQuery,
        signal
      ),
  })
  const setHistoryPagination = tableState.setPagination
  useEffect(() => {
    setExpandedVersionId('')
    setPendingTargetVersionId(props.targetVersionId ?? '')
    setHistoryPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [props.credentialGroupId, props.targetVersionId, setHistoryPagination])
  useEffect(() => {
    if (!pendingTargetVersionId || !history.data) return
    if (
      !history.data.items.some((item) => item.id === pendingTargetVersionId)
    ) {
      return
    }
    const targetId = pendingTargetVersionId
    setHistoryPagination((current) => ({
      ...current,
      pageIndex: history.data.page - 1,
    }))
    setExpandedVersionId(targetId)
    setPendingTargetVersionId('')
    requestAnimationFrame(() => {
      document
        .querySelector(`#credential-version-${targetId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [history.data, pendingTargetVersionId, setHistoryPagination])
  const columns = useMemo<
    ColumnDef<CanvasProviderCredentialVersion, unknown>[]
  >(
    () => [
      {
        id: 'version',
        accessorKey: 'version',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Version')} />
        ),
        meta: { label: t('Version') },
        cell: ({ row }) => (
          <span className='font-medium'>
            v{row.original.version}
            {row.original.id === props.currentVersionId
              ? ` · ${t('Current')}`
              : ''}
          </span>
        ),
      },
      {
        id: 'effectiveAt',
        accessorKey: 'effectiveAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Effective at')} />
        ),
        meta: { label: t('Effective at') },
        cell: ({ row }) =>
          row.original.effectiveAt
            ? formatCanvasDateTime(row.original.effectiveAt)
            : '—',
      },
      {
        id: 'updatedBy',
        accessorKey: 'updatedBy',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Updated by')} />
        ),
        meta: { label: t('Updated by') },
      },
      {
        id: 'affectedModels',
        accessorKey: 'affectedModelCount',
        header: t('Affected models'),
        meta: { label: t('Affected models') },
        enableSorting: false,
        cell: ({ row }) => row.original.affectedModelCount ?? t('Not recorded'),
      },
      {
        id: 'reason',
        accessorKey: 'reason',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Reason')} />
        ),
        meta: { label: t('Reason') },
        cell: ({ row }) => (
          <span className='break-words whitespace-normal'>
            {row.original.reason}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('Actions'),
        meta: { label: t('Actions') },
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            size='sm'
            variant='outline'
            aria-expanded={expandedVersionId === row.original.id}
            onClick={(event) => {
              event.stopPropagation()
              setExpandedVersionId((current) =>
                current === row.original.id ? '' : row.original.id
              )
            }}
          >
            {expandedVersionId === row.original.id
              ? t('Collapse affected models')
              : t('Expand affected models')}
          </Button>
        ),
      },
    ],
    [expandedVersionId, props.currentVersionId, t]
  )
  return (
    <section
      id='credential-version-history'
      className='space-y-3 border-t pt-5'
      aria-labelledby='credential-version-history-title'
    >
      <div>
        <h3 id='credential-version-history-title' className='font-semibold'>
          {t('Credential version history')}
        </h3>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Version rows are read-only. Expand a row to load its recorded affected models.'
          )}
        </p>
      </div>
      <CanvasServerTable
        data={history.data?.items ?? []}
        columns={columns}
        total={history.data?.total ?? 0}
        state={tableState}
        searchLabel={t('Reason')}
        loading={history.isFetching}
        emptyTitle={t('No history')}
        getRowId={(version) => version.id}
        additionalFilters={
          <>
            <CanvasColumnFilterField label={t('Version')}>
              <Input
                inputMode='numeric'
                value={versionFilter}
                placeholder={t('Version')}
                onChange={(event) =>
                  setVersionFilter(event.target.value.replaceAll(/\D/g, ''))
                }
              />
            </CanvasColumnFilterField>
            <CanvasColumnFilterField label={t('Updated by')}>
              <Input
                value={operatorFilter}
                placeholder={t('Updated by')}
                onChange={(event) => setOperatorFilter(event.target.value)}
              />
            </CanvasColumnFilterField>
          </>
        }
        hasActiveFilters={Boolean(versionFilter || operatorFilter)}
        activeFilterCount={
          [tableState.search, versionFilter, operatorFilter].filter(Boolean)
            .length
        }
        onResetFilters={() => {
          setVersionFilter('')
          setOperatorFilter('')
        }}
        getRowClassName={(row) =>
          row.original.id === props.targetVersionId
            ? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
            : undefined
        }
        renderRow={(row) => (
          <Fragment key={row.id}>
            <DataTableRow
              id={`credential-version-${row.original.id}`}
              row={row}
              tabIndex={0}
              aria-expanded={expandedVersionId === row.original.id}
              className={
                row.original.id === props.targetVersionId
                  ? 'bg-primary/10 ring-primary/30 ring-1 ring-inset'
                  : 'cursor-pointer'
              }
              onClick={() =>
                setExpandedVersionId((current) =>
                  current === row.original.id ? '' : row.original.id
                )
              }
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                setExpandedVersionId((current) =>
                  current === row.original.id ? '' : row.original.id
                )
              }}
            />
            {expandedVersionId === row.original.id && (
              <TableRow key={`${row.id}-detail`}>
                <TableCell
                  colSpan={row.getVisibleCells().length}
                  className='bg-muted/20 p-4'
                >
                  <CredentialVersionAffectedModels
                    credentialGroupVersionId={row.original.id}
                  />
                </TableCell>
              </TableRow>
            )}
          </Fragment>
        )}
      />
    </section>
  )
}

function CredentialVersionAffectedModels(props: {
  credentialGroupVersionId: string
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const affected = useQuery({
    queryKey: [
      'canvas-cloud',
      'credential-version-affected-models',
      props.credentialGroupVersionId,
      page,
    ],
    queryFn: ({ signal }) =>
      getCanvasCredentialVersionAffectedModels(
        props.credentialGroupVersionId,
        { page, pageSize: 20 },
        signal
      ),
  })
  const pageCount = Math.max(1, Math.ceil((affected.data?.total ?? 0) / 20))
  if (affected.isError) {
    return (
      <Button variant='outline' onClick={() => void affected.refetch()}>
        {t('Retry')}
      </Button>
    )
  }
  if (affected.isPending) {
    return <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
  }
  if (!affected.data.factAvailable) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t(
          'No recorded affected-model snapshot is available for this version.'
        )}
      </p>
    )
  }
  return (
    <div className='space-y-3'>
      <StaticDataTable
        tableClassName='min-w-[480px] table-fixed'
        data={affected.data.items}
        empty={affected.data.items.length === 0}
        emptyContent={t('No affected models')}
        getRowKey={(model) => model.id}
        columns={[
          {
            id: 'name',
            header: t('Model name'),
            className: 'w-64',
            cell: (model) => model.publicName,
          },
          {
            id: 'id',
            header: t('Model ID'),
            className: 'w-64',
            cell: (model) => (
              <span className='font-mono text-xs break-all'>{model.id}</span>
            ),
          },
        ]}
      />
      {pageCount > 1 && (
        <div className='flex items-center justify-between gap-3 text-sm'>
          <span>
            {t('Page')} {page} / {pageCount}
          </span>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              {t('Previous')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={page >= pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              {t('Next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function BindingHistoryPanel(props: { model: CanvasProviderModel }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const modelId = props.model.id
  useEffect(() => setPage(1), [modelId])
  const history = useQuery({
    queryKey: [
      'canvas-cloud',
      'model-credential-binding-history',
      modelId,
      page,
    ],
    queryFn: ({ signal }) => {
      return getCanvasModelCredentialBindingHistory(
        modelId,
        { page, pageSize: 20 },
        signal
      )
    },
  })
  const pageCount = Math.max(1, Math.ceil((history.data?.total ?? 0) / 20))
  return (
    <div className='space-y-3' aria-label={t('Binding history')}>
      <div>
        <h4 className='font-medium'>{t('Binding history')}</h4>
        <p className='text-muted-foreground text-sm'>
          {props.model.publicName}
        </p>
      </div>
      {history.isError ? (
        <Button variant='outline' onClick={() => void history.refetch()}>
          {t('Retry')}
        </Button>
      ) : (
        <StaticDataTable
          tableClassName='min-w-[800px] table-fixed'
          data={history.data?.items ?? []}
          empty={history.isPending || history.data?.items.length === 0}
          emptyContent={history.isPending ? t('Loading') : t('No history')}
          getRowKey={(binding) => binding.id}
          columns={[
            {
              id: 'version',
              header: t('Binding version'),
              className: 'w-32',
              cell: (binding) => `v${binding.version}`,
            },
            {
              id: 'credential',
              header: t('Credential group and version'),
              className: 'w-52',
              cell: (binding) =>
                `${binding.credentialGroupName} v${binding.credentialGroupVersion}`,
            },
            {
              id: 'createdAt',
              header: t('Published at'),
              className: 'w-52',
              cell: (binding) => formatCanvasDateTime(binding.createdAt),
            },
            {
              id: 'updatedBy',
              header: t('Updated by'),
              className: 'w-40',
              cell: (binding) => binding.updatedBy,
            },
            {
              id: 'reason',
              header: t('Reason'),
              className: 'w-64',
              cell: (binding) => (
                <span className='break-words whitespace-normal'>
                  {binding.reason ?? '—'}
                </span>
              ),
            },
          ]}
        />
      )}
      <div className='flex items-center justify-between gap-3 text-sm'>
        <span>
          {t('Page')} {page} / {pageCount}
        </span>
        <div className='flex gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            {t('Previous')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={page >= pageCount}
            onClick={() => setPage((current) => current + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      </div>
    </div>
  )
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
      <div className='flex flex-wrap items-center gap-2'>
        <BusinessTerm kind='configStatus' value={props.item.status} />
        <span className='bg-muted rounded-md px-2 py-1 text-xs font-medium tabular-nums'>
          v{props.item.version}
        </span>
      </div>
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

function AccessPermissionStatus(props: {
  value: CanvasModelAccessPermissionCheck | null
}) {
  const { t } = useTranslation()
  if (!props.value) {
    return (
      <span className='text-muted-foreground text-sm'>{t('Not checked')}</span>
    )
  }
  if (props.value.outcome === 'PASSED') {
    return (
      <span className='text-sm text-emerald-600 dark:text-emerald-400'>
        {t('Passed')}
      </span>
    )
  }
  if (props.value.outcome === 'FAILED') {
    return (
      <span className='text-destructive text-sm'>
        {t('Access permission denied')}
      </span>
    )
  }
  return (
    <span className='text-muted-foreground text-sm'>
      {t('Unable to verify')}
    </span>
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
