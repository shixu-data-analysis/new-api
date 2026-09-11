/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License along with this program.
If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  flexRender,
  functionalUpdate,
  type ColumnDef,
  type PaginationState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  DataTableColumnHeader,
  DataTablePage,
  DataTableToolbar,
  StaticDataTable,
  useDataTable,
} from '@/components/data-table'
import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from '@/components/data-table/toolbar/column-filter-panel'
import { ErrorState } from '@/components/error-state'
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
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { TableCell, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

import {
  getCanvasAdminTestingModels,
  publishCanvasExecutionTargetPresentation,
  publishCanvasModelPresentation,
} from '../api'
import {
  modelPresentationSchema,
  type ModelPresentationFormValues,
  hasModelPresentationChanges,
} from '../lib/model-presentation-schema'
import { useOptionalModelManagementNavigation } from '../model-management-navigation-hooks'
import type { CanvasAdminTestingModel } from '../types'
import { withCanvasTableColumnSizes } from './canvas-table-layout'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import {
  executionTargetLabel,
  executionTargetSpecifications,
} from './execution-target-label'
import { ExecutionTargetCoverage } from './ExecutionTargetCoverage'
import { PublishedModelDetails } from './PublishedModelDetails'

function presentationVersion(model: CanvasAdminTestingModel) {
  return model.presentationVersion ?? 0
}

function customerDisplayAction(enabled: boolean, t: (key: string) => string) {
  return enabled ? t('Turn off display switch') : t('Turn on display switch')
}

export function PublishedModelCatalog(props: {
  onManagePricing: (modelId: string, returnContext?: { nonce: string }) => void
  onManageMonitoring?: (
    modelId: string,
    executionTargetId: string,
    returnContext?: { nonce: string }
  ) => void
  onManageBindings?: (
    modelId: string,
    returnContext?: { nonce: string }
  ) => void
}) {
  const onManagePricing = props.onManagePricing
  const navigation = useOptionalModelManagementNavigation()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState(() => navigation?.listState.search ?? '')
  const [modelId, setModelId] = useState(
    () => navigation?.listState.modelId ?? ''
  )
  const [provider, setProvider] = useState(
    () => navigation?.listState.provider ?? ''
  )
  const [capability, setCapability] = useState(
    () => navigation?.listState.capability ?? ''
  )
  const [visibility, setVisibility] = useState(
    () => navigation?.listState.visibility ?? 'ALL'
  )
  const [pagination, setPagination] = useState<PaginationState>(
    () => navigation?.listState.pagination ?? { pageIndex: 0, pageSize: 20 }
  )
  const [sorting, setSorting] = useState<SortingState>(
    () => navigation?.listState.sorting ?? [{ id: 'name', desc: false }]
  )
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => navigation?.listState.columnVisibility ?? {}
  )
  useEffect(() => {
    if (!navigation) return
    setColumnVisibility(navigation.listState.columnVisibility)
  }, [navigation, navigation?.listState.columnVisibility])
  const hasAppliedInitialFilters = useRef(false)
  useEffect(() => {
    if (!hasAppliedInitialFilters.current) {
      hasAppliedInitialFilters.current = true
      return
    }
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    )
  }, [capability, modelId, provider, search, visibility])
  useEffect(() => {
    navigation?.updateListState({
      search,
      modelId,
      provider,
      capability,
      visibility,
      pagination,
      sorting,
      columnVisibility,
    })
  }, [
    capability,
    modelId,
    navigation,
    pagination,
    provider,
    search,
    sorting,
    columnVisibility,
    visibility,
  ])
  const ensurePageInRange = useCallback((pageCount: number) => {
    setPagination((current) =>
      current.pageIndex < Math.max(1, pageCount)
        ? current
        : { ...current, pageIndex: Math.max(0, pageCount - 1) }
    )
  }, [])
  const [editing, setEditing] = useState<CanvasAdminTestingModel | null>(null)
  const [toggling, setToggling] = useState<{
    model: CanvasAdminTestingModel
    target: CanvasAdminTestingModel['executionTargets'][number]
  } | null>(null)
  const [discardingEdit, setDiscardingEdit] = useState(false)
  const [formServerError, setFormServerError] = useState<string | null>(null)
  const [presentationConflict, setPresentationConflict] = useState(false)
  const [reloadingPresentation, setReloadingPresentation] = useState(false)
  const [originalPresentation, setOriginalPresentation] =
    useState<ModelPresentationFormValues | null>(null)
  const displayForm = useForm<ModelPresentationFormValues>({
    resolver: zodResolver(modelPresentationSchema),
    mode: 'onTouched',
    defaultValues: { displayName: '', description: '' },
  })
  const watchedPresentation = displayForm.watch()
  const models = useQuery({
    queryKey: ['canvas-cloud', 'admin-testing-models'],
    queryFn: getCanvasAdminTestingModels,
  })
  useEffect(() => {
    if (!navigation?.listState.focusModelId || !models.data) return
    const modelIdToFocus = navigation.listState.focusModelId
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-model-navigation-id="${modelIdToFocus}"]`
      )
      if (!target) return
      window.scrollTo({ top: navigation.listState.scrollY })
      target.focus()
      const context = (window.history.state as Record<string, unknown> | null)
        ?.canvasModelManagementReturn
      if (context && typeof context === 'object' && 'nonce' in context) {
        navigation.consumeReturnContext(String(context.nonce))
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [models.data, navigation])
  const publisher = useMutation({
    mutationFn: publishCanvasModelPresentation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-testing-models'],
      })
      displayForm.reset()
      setEditing(null)
      setToggling(null)
      setFormServerError(null)
      setPresentationConflict(false)
      setOriginalPresentation(null)
      toast.success(t('Model display settings published'))
    },
    onError: (error: unknown) => {
      const response = error as {
        response?: { status?: number; data?: { code?: string } }
      }
      const status = response.response?.status
      const payload = response.response?.data
      if (status === 409 && payload?.code === 'MODEL_PRESENTATION_UNCHANGED') {
        setFormServerError('No display changes to publish.')
        return
      }
      if (
        status === 409 &&
        payload?.code === 'MODEL_PRESENTATION_VERSION_CONFLICT'
      ) {
        setFormServerError(
          'This model was changed elsewhere. Reload and try again.'
        )
        setPresentationConflict(true)
        return
      }
      setFormServerError('Model display settings publication failed')
    },
  })
  const targetPresentation = useMutation({
    mutationFn: publishCanvasExecutionTargetPresentation,
    onSuccess: async () => {
      const modelId = toggling?.model.id
      const executionTargetId = toggling?.target.id
      const invalidations = [
        queryClient.invalidateQueries({
          queryKey: ['canvas-cloud', 'admin-testing-models'],
        }),
      ]
      if (modelId && executionTargetId) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: ['canvas-cloud', 'model-monitoring-targets', modelId],
          }),
          queryClient.invalidateQueries({
            queryKey: [
              'canvas-cloud',
              'model-monitoring',
              modelId,
              executionTargetId,
            ],
          })
        )
      }
      await Promise.all(invalidations)
      setToggling(null)
      setFormServerError(null)
    },
    onError: () => {
      setFormServerError(
        t(
          'Target display change failed. Refresh the target state before retrying.'
        )
      )
    },
  })
  const presentationBusy =
    publisher.isPending || targetPresentation.isPending || reloadingPresentation
  async function reloadPresentation() {
    if (presentationBusy) return
    setReloadingPresentation(true)
    const result = await models.refetch()
    const current = result.data?.find(
      (model) => model.id === (editing ?? toggling?.model)?.id
    )
    if (result.isError || !current) {
      setFormServerError(
        'Could not reload this model. Your changes are preserved.'
      )
      setReloadingPresentation(false)
      return
    }
    if (editing) {
      const draft = displayForm.getValues()
      displayForm.reset({
        displayName:
          originalPresentation &&
          draft.displayName.trim() !== originalPresentation.displayName.trim()
            ? draft.displayName
            : current.name,
        description:
          originalPresentation &&
          draft.description.trim() !== originalPresentation.description.trim()
            ? draft.description
            : current.description,
      })
      setEditing(current)
      setOriginalPresentation({
        displayName: current.name,
        description: current.description,
      })
    } else if (toggling) {
      const target = current.executionTargets.find(
        (candidate) => candidate.id === toggling.target.id
      )
      if (target) setToggling({ model: current, target })
    }
    setFormServerError(null)
    setPresentationConflict(false)
    setReloadingPresentation(false)
  }
  const presentationFeedback = formServerError && (
    <div className='space-y-2'>
      <p role='alert' className='text-destructive text-sm'>
        {t(formServerError)}
      </p>
      {presentationConflict && (
        <Button
          type='button'
          variant='outline'
          disabled={presentationBusy}
          onClick={() => void reloadPresentation()}
        >
          {reloadingPresentation
            ? t('Reloading...')
            : t('Reload model information')}
        </Button>
      )}
    </div>
  )
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const idQuery = modelId.trim().toLocaleLowerCase()
    const providerQuery = provider.trim().toLocaleLowerCase()
    const capabilityQuery = capability.trim().toLocaleLowerCase()
    const matches = (models.data ?? []).filter((model) => {
      const providerModelIds = model.modelIds
        .map((entry) => entry.modelId)
        .join('\n')
        .toLocaleLowerCase()
      const visible =
        visibility === 'ALL' ||
        (visibility === 'CUSTOMER'
          ? model.executionTargets.some((target) => target.customerVisible)
          : model.executionTargets.some((target) => !target.customerVisible))
      return (
        visible &&
        (!query || model.name.toLocaleLowerCase().includes(query)) &&
        (!providerQuery ||
          `${model.provider.name} ${model.provider.code}`
            .toLocaleLowerCase()
            .includes(providerQuery)) &&
        (!capabilityQuery ||
          t(String(model.publicCatalogSnapshot.capability ?? ''))
            .toLocaleLowerCase()
            .includes(capabilityQuery)) &&
        (!idQuery || providerModelIds.includes(idQuery))
      )
    })
    return matches
  }, [capability, modelId, models.data, provider, search, t, visibility])
  let visibilityFilterLabel = t('All')
  if (visibility === 'CUSTOMER') {
    visibilityFilterLabel = t('Visible to customers')
  } else if (visibility === 'INTERNAL') {
    visibilityFilterLabel = t('Not shown to customers')
  }
  const startEdit = useCallback(
    (model: CanvasAdminTestingModel) => {
      const values = { displayName: model.name, description: model.description }
      displayForm.reset(values)
      setOriginalPresentation(values)
      setFormServerError(null)
      setPresentationConflict(false)
      setEditing(model)
    },
    [displayForm]
  )
  const closeEdit = useCallback(() => {
    if (presentationBusy) return
    if (
      originalPresentation &&
      hasModelPresentationChanges(displayForm.getValues(), originalPresentation)
    ) {
      setDiscardingEdit(true)
      return
    }
    setEditing(null)
  }, [displayForm, originalPresentation, presentationBusy])
  const columns = useMemo<ColumnDef<CanvasAdminTestingModel, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (model) => model.name,
        size: 256,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Model')} />
        ),
        meta: { label: t('Model') },
        cell: ({ row }) => {
          const model = row.original
          return (
            <div className='min-w-0 font-medium [overflow-wrap:anywhere] whitespace-normal'>
              {model.name}
            </div>
          )
        },
      },
      {
        id: 'provider',
        size: 160,
        accessorFn: (model) => model.provider.name,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('API provider')} />
        ),
        meta: { label: t('API provider') },
        cell: ({ row }) => (
          <div className='whitespace-normal'>{row.original.provider.name}</div>
        ),
      },
      {
        id: 'capability',
        size: 128,
        accessorFn: (model) =>
          typeof model.publicCatalogSnapshot.capability === 'string'
            ? model.publicCatalogSnapshot.capability
            : '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Capability')} />
        ),
        meta: { label: t('Capability') },
        cell: ({ getValue }) => (
          <span className='whitespace-normal'>
            {t(String(getValue() || '—'))}
          </span>
        ),
      },
      {
        id: 'billingUnit',
        size: 128,
        accessorFn: (model) => (model.billingUnits ?? []).join(', '),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Billing unit')} />
        ),
        meta: { label: t('Billing unit') },
        cell: ({ row }) => {
          const units = row.original.billingUnits ?? []
          let label =
            row.original.pricedTargets > 0
              ? t('Billing unit missing')
              : t('Not configured')
          if (units.length === 1) label = t(units[0])
          else if (units.length > 1) {
            label = `${t('Billing unit conflict')}: ${units.map((unit) => t(unit)).join(' · ')}`
          }
          return <span className='whitespace-normal'>{label}</span>
        },
      },
      {
        id: 'catalogConfiguration',
        size: 224,
        accessorFn: (model) => JSON.stringify(model.publicCatalogSnapshot),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Original catalog configuration')}
          />
        ),
        meta: { label: t('Original catalog configuration') },
        cell: ({ row }) => <PublishedModelDetails model={row.original} />,
      },
      {
        id: 'actions',
        size: 208,
        header: t('Model actions'),
        meta: { label: t('Model actions') },
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const model = row.original
          return (
            <div className='grid gap-2'>
              <div className='grid w-max gap-2'>
                <Button
                  variant='outline'
                  disabled={presentationBusy}
                  data-model-navigation-id={`${model.id}:pricing`}
                  onClick={(event) => {
                    const returnContext = navigation?.captureReturnContext(
                      `${model.id}:pricing`
                    )
                    event.currentTarget.focus()
                    onManagePricing(model.id, returnContext)
                  }}
                >
                  {t('Manage prices')}
                </Button>
                <Button
                  variant='outline'
                  disabled={presentationBusy || !props.onManageBindings}
                  data-model-navigation-id={`${model.id}:bindings`}
                  onClick={() => {
                    props.onManageBindings?.(
                      model.id,
                      navigation?.captureReturnContext(`${model.id}:bindings`)
                    )
                  }}
                >
                  {t('Manage API Key bindings')}
                </Button>
                <Button
                  variant='outline'
                  disabled={presentationBusy}
                  onClick={() => startEdit(model)}
                >
                  {t('Edit display information')}
                </Button>
              </div>
            </div>
          )
        },
      },
    ],
    [navigation, onManagePricing, presentationBusy, props, startEdit, t]
  )
  const sizedColumns = useMemo(
    () => withCanvasTableColumnSizes(columns),
    [columns]
  )
  const { table } = useDataTable({
    data: filtered,
    columns: sizedColumns,
    getRowId: (model) => model.id,
    manualFiltering: true,
    columnFilters: [],
    globalFilter: '',
    initialSorting: [{ id: 'name', desc: false }],
    sorting,
    onSortingChange: setSorting,
    pagination,
    onPaginationChange: setPagination,
    columnVisibility,
    onColumnVisibilityChange: (update) =>
      setColumnVisibility((current) => functionalUpdate(update, current)),
    ensurePageInRange,
    autoResetPageIndex: false,
  })
  const renderTargetDetails = (
    model: CanvasAdminTestingModel,
    mobile = false
  ) => {
    const displayControl = (
      target: CanvasAdminTestingModel['executionTargets'][number]
    ) => (
      <Switch
        checked={target.enabled}
        disabled={presentationBusy}
        aria-label={t('Customer display for {{model}}', {
          model: `${model.name} · ${executionTargetLabel(target, t)}`,
        })}
        onCheckedChange={() => {
          if (presentationBusy) return
          setFormServerError(null)
          setPresentationConflict(false)
          setToggling({ model, target })
        }}
      />
    )
    const monitoringAction = (
      target: CanvasAdminTestingModel['executionTargets'][number]
    ) => (
      <Button
        variant='outline'
        disabled={presentationBusy || !props.onManageMonitoring}
        data-model-navigation-id={`${model.id}:monitoring:${target.id}`}
        onClick={() => {
          props.onManageMonitoring?.(
            model.id,
            target.id,
            navigation?.captureReturnContext(
              `${model.id}:monitoring:${target.id}`
            )
          )
        }}
      >
        {t('Runtime monitoring')}
      </Button>
    )
    if (mobile) {
      return (
        <div className='space-y-3' aria-label={t('Execution targets')}>
          {model.executionTargets.map((target) => (
            <section key={target.id} className='space-y-2'>
              <p className='font-medium break-words'>
                {executionTargetLabel(target, t)}
              </p>
              <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm'>
                <dt className='text-muted-foreground'>
                  {t('Upstream model ID')}
                </dt>
                <dd className='break-all'>{target.upstreamModelId}</dd>
                <dt className='text-muted-foreground'>
                  {t('Price plans and customer visibility')}
                </dt>
                <dd>
                  <ExecutionTargetCoverage
                    coverage={target.pricingCoverage}
                    parameterCombinations={target.parameterCombinations}
                  />
                </dd>
                <dt className='text-muted-foreground'>
                  {t('Display settings')}
                </dt>
                <dd>{displayControl(target)}</dd>
              </dl>
              {monitoringAction(target)}
            </section>
          ))}
        </div>
      )
    }
    return (
      <StaticDataTable
        data={model.executionTargets}
        getRowKey={(target) => target.id}
        columns={[
          {
            id: 'specification',
            header: t('Specification'),
            cell: (target) => executionTargetSpecifications(target, t) || '—',
          },
          {
            id: 'upstreamModelId',
            header: t('Upstream model ID'),
            cell: (target) => (
              <span className='break-all'>{target.upstreamModelId}</span>
            ),
          },
          {
            id: 'customerVisibility',
            header: t('Price plans and customer visibility'),
            cell: (target) => (
              <ExecutionTargetCoverage
                coverage={target.pricingCoverage}
                parameterCombinations={target.parameterCombinations}
              />
            ),
          },
          {
            id: 'display',
            header: t('Display settings'),
            cell: displayControl,
          },
          {
            id: 'monitoring',
            header: t('Actions'),
            cell: monitoringAction,
          },
        ]}
      />
    )
  }
  if (models.isError) {
    return <ErrorState onRetry={() => void models.refetch()} />
  }
  return (
    <Card>
      <CardContent className='min-w-0'>
        <DataTablePage
          table={table}
          columns={sizedColumns}
          isLoading={models.isPending}
          fixedHeight={false}
          paginationInFooter={false}
          applyHeaderSize
          emptyTitle={t('No matching models')}
          emptyDescription={t('No records found. Try adjusting your filters.')}
          getColumnClassName={(_, section) => {
            if (section === 'cell') {
              return 'px-2 py-2 align-top whitespace-normal'
            }
            return 'px-2'
          }}
          renderRow={(row, helpers) => (
            <Fragment key={row.id}>
              <TableRow>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={helpers.getCellClassName(cell.column.id)}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell
                  colSpan={row.getVisibleCells().length}
                  className='bg-muted/20 px-3 py-3'
                >
                  <div className='space-y-2'>
                    <p className='text-sm font-medium'>
                      {t('Execution targets')}
                    </p>
                    {renderTargetDetails(row.original)}
                  </div>
                </TableCell>
              </TableRow>
            </Fragment>
          )}
          mobileProps={{
            renderExpandedContent: (row) =>
              renderTargetDetails(row.original, true),
          }}
          toolbar={
            <DataTableToolbar
              table={table}
              filterPanel={
                <DataTableColumnFilterPanel
                  activeCount={
                    [
                      search,
                      modelId,
                      provider,
                      capability,
                      visibility === 'ALL' ? '' : visibility,
                    ].filter(Boolean).length
                  }
                >
                  <DataTableColumnFilterField label={t('Model')}>
                    <Input
                      value={search}
                      placeholder={t('Model')}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </DataTableColumnFilterField>
                  <DataTableColumnFilterField label={t('Upstream model ID')}>
                    <Input
                      value={modelId}
                      placeholder={t('Upstream model ID')}
                      onChange={(event) => setModelId(event.target.value)}
                    />
                  </DataTableColumnFilterField>
                  <DataTableColumnFilterField label={t('API provider')}>
                    <Input
                      value={provider}
                      placeholder={t('API provider')}
                      onChange={(event) => setProvider(event.target.value)}
                    />
                  </DataTableColumnFilterField>
                  <DataTableColumnFilterField label={t('Capability')}>
                    <Input
                      value={capability}
                      placeholder={t('Capability')}
                      onChange={(event) => setCapability(event.target.value)}
                    />
                  </DataTableColumnFilterField>
                  <DataTableColumnFilterField label={t('Customer display')}>
                    <Select
                      value={visibility}
                      onValueChange={(value) => setVisibility(value ?? 'ALL')}
                    >
                      <SelectTrigger
                        className='w-full'
                        aria-label={t('Customer display')}
                      >
                        <CanvasLocalizedSelectValue
                          value={visibility}
                          displayValue={visibilityFilterLabel}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='ALL'>{t('All')}</SelectItem>
                        <SelectItem value='CUSTOMER'>
                          {t('Visible to customers')}
                        </SelectItem>
                        <SelectItem value='INTERNAL'>
                          {t('Not shown to customers')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </DataTableColumnFilterField>
                </DataTableColumnFilterPanel>
              }
              hasAdditionalFilters={Boolean(
                search ||
                modelId ||
                provider ||
                capability ||
                visibility !== 'ALL'
              )}
              onReset={() => {
                setSearch('')
                setModelId('')
                setProvider('')
                setCapability('')
                setVisibility('ALL')
              }}
            />
          }
        />
      </CardContent>
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && closeEdit()}
      >
        <DialogContent
          showCloseButton={!presentationBusy}
          aria-busy={presentationBusy}
        >
          <DialogHeader>
            <DialogTitle>{t('Edit model display information')}</DialogTitle>
            <DialogDescription>
              {t('Set the model name and description customers see.')}
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className='space-y-4'
            onSubmit={displayForm.handleSubmit((value) => {
              if (
                !editing ||
                presentationBusy ||
                presentationConflict ||
                !originalPresentation ||
                !hasModelPresentationChanges(value, originalPresentation)
              ) {
                return
              }
              publisher.mutate({
                modelKey: editing.modelKey,
                displayName: value.displayName.trim(),
                description: value.description.trim(),
                expectedVersion: presentationVersion(editing),
              })
            })}
          >
            <div className='space-y-1'>
              <Label htmlFor='model-display-name'>
                {t('Client display name')} *
              </Label>
              <Input
                id='model-display-name'
                aria-required='true'
                maxLength={191}
                disabled={presentationBusy}
                aria-invalid={Boolean(displayForm.formState.errors.displayName)}
                aria-describedby={
                  displayForm.formState.errors.displayName
                    ? 'model-display-name-error'
                    : undefined
                }
                {...displayForm.register('displayName')}
              />
              {displayForm.formState.errors.displayName && (
                <p
                  id='model-display-name-error'
                  role='alert'
                  className='text-destructive text-xs'
                >
                  {t(
                    displayForm.formState.errors.displayName.message ??
                      'Required'
                  )}
                </p>
              )}
            </div>
            <div className='space-y-1'>
              <Label htmlFor='model-description'>
                {t('Client description')} ({t('Optional')})
              </Label>
              <Textarea
                id='model-description'
                maxLength={500}
                disabled={presentationBusy}
                aria-invalid={Boolean(displayForm.formState.errors.description)}
                aria-describedby={
                  displayForm.formState.errors.description
                    ? 'model-description-error'
                    : undefined
                }
                {...displayForm.register('description')}
              />
              {displayForm.formState.errors.description && (
                <p
                  id='model-description-error'
                  role='alert'
                  className='text-destructive text-xs'
                >
                  {t(displayForm.formState.errors.description.message ?? '')}
                </p>
              )}
            </div>
            {presentationFeedback}
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                disabled={presentationBusy}
                onClick={closeEdit}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='submit'
                disabled={
                  !editing ||
                  !originalPresentation ||
                  !hasModelPresentationChanges(
                    watchedPresentation,
                    originalPresentation
                  ) ||
                  !watchedPresentation.displayName.trim() ||
                  presentationBusy ||
                  presentationConflict
                }
              >
                {publisher.isPending
                  ? t('Publishing...')
                  : t('Save and publish')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discardingEdit} onOpenChange={setDiscardingEdit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Discard changes?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Your unsaved display information changes will be lost.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                displayForm.reset()
                setEditing(null)
                setDiscardingEdit(false)
              }}
            >
              {t('Discard changes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {toggling && (
        <AlertDialog
          open
          onOpenChange={(open) =>
            !open && !presentationBusy && setToggling(null)
          }
        >
          <AlertDialogContent aria-busy={presentationBusy}>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {toggling.target.enabled
                  ? t('Turn off display switch?')
                  : t('Turn on display switch?')}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm'>
              <dt className='text-muted-foreground'>{t('Model')}</dt>
              <dd>{toggling.model.name}</dd>
              <dt className='text-muted-foreground'>{t('Execution target')}</dt>
              <dd>{executionTargetLabel(toggling.target, t)}</dd>
              <dt className='text-muted-foreground'>
                {t('Upstream model ID')}
              </dt>
              <dd className='break-all'>{toggling.target.upstreamModelId}</dd>
              <dt className='text-muted-foreground'>{t('Display settings')}</dt>
              <dd>
                {toggling.target.enabled
                  ? t('Display switch on state')
                  : t('Display switch off state')}{' '}
                →{' '}
                {toggling.target.enabled
                  ? t('Display switch off state')
                  : t('Display switch on state')}
              </dd>
            </dl>
            <AlertDialogDescription>
              {toggling.target.enabled
                ? t('When disabled, this target is not shown to customers.')
                : t(
                    'When enabled, this target is shown to customers only when runtime and pricing conditions are met.'
                  )}
            </AlertDialogDescription>
            {presentationFeedback}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={presentationBusy}>
                {t('Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={toggling.target.enabled ? 'destructive' : 'default'}
                disabled={presentationBusy || presentationConflict}
                onClick={() => {
                  if (presentationBusy || presentationConflict) return
                  targetPresentation.mutate({
                    executionTargetId: toggling.target.id,
                    enabled: !toggling.target.enabled,
                    expectedVersion: toggling.target.presentationVersion ?? 0,
                  })
                }}
              >
                {targetPresentation.isPending
                  ? t('Publishing...')
                  : customerDisplayAction(toggling.target.enabled, t)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  )
}
