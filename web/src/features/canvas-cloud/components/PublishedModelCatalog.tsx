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
import type { ColumnDef } from '@tanstack/react-table'
import { Info } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
  DataTableView,
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
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'

import {
  getCanvasAdminTestingModels,
  getCanvasPriceGroups,
  publishCanvasModelPresentation,
} from '../api'
import {
  modelPresentationSchema,
  type ModelPresentationFormValues,
  hasModelPresentationChanges,
} from '../lib/model-presentation-schema'
import type { CanvasAdminTestingModel } from '../types'
import { withCanvasTableColumnSizes } from './canvas-table-layout'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { PublishedModelDetails } from './PublishedModelDetails'

function presentationVersion(model: CanvasAdminTestingModel) {
  return model.presentationVersion ?? 0
}

function customerDisplayAction(enabled: boolean, t: (key: string) => string) {
  return enabled ? t('Turn off display switch') : t('Turn on display switch')
}

function visibilityRank(model: CanvasAdminTestingModel) {
  return model.customerVisible ? 1 : 0
}

function CustomerVisibilityCell(props: { model: CanvasAdminTestingModel }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const model = props.model
  const enabledScopes = model.parameterCombinations.filter(
    (scope) => scope.enabled
  )
  const priceGroups = useQuery({
    queryKey: ['canvas-cloud', 'price-groups'],
    queryFn: getCanvasPriceGroups,
    enabled: open && !model.customerVisible && enabledScopes.length === 0,
  })
  const hasPublishedPlans = priceGroups.data?.some(
    (group) =>
      group.status === 'PUBLISHED' &&
      group.effectiveAt !== null &&
      Date.parse(group.effectiveAt) <= Date.now()
  )
  if (model.customerVisible) {
    return (
      <span className='min-w-0 break-words whitespace-normal'>
        {t('Visible to customers')}
      </span>
    )
  }
  const reasons: string[] = []
  if (!model.enabled) reasons.push(t('Display switch is off'))
  if (!model.resourceEnabled) reasons.push(t('Technical control is off'))
  const plans = new Map<string, Set<string>>()
  for (const target of model.pricingTargets) {
    const pricedScopes = plans.get(target.priceGroupId) ?? new Set<string>()
    if (target.priced) pricedScopes.add(target.parameterCombinationId)
    plans.set(target.priceGroupId, pricedScopes)
  }
  if (enabledScopes.length === 0) {
    reasons.push(t('No enabled parameter combinations'))
  }
  const hasPlans = enabledScopes.length > 0 ? plans.size > 0 : hasPublishedPlans
  if (hasPlans === false) reasons.push(t('No published price plans'))
  if (
    enabledScopes.length > 0 &&
    hasPlans &&
    ![...plans.values()].some((pricedScopes) =>
      enabledScopes.every((scope) => pricedScopes.has(scope.id))
    )
  ) {
    reasons.push(t('No price plan covers all enabled parameter combinations'))
  }
  if (reasons.length === 0) {
    reasons.push(t('No specific reason for non-display was provided.'))
  }
  return (
    <span className='inline-flex min-w-0 items-center gap-1 whitespace-normal'>
      <span className='min-w-0 break-words'>{t('Not displayed')}</span>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          closeOnClick={false}
          render={
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='text-muted-foreground size-6 shrink-0'
              aria-label={t('Why not displayed')}
              onClick={() => setOpen(true)}
            />
          }
        >
          <Info className='size-4' aria-hidden='true' />
        </TooltipTrigger>
        <TooltipContent className='max-w-80 whitespace-normal'>
          <ul className='space-y-1'>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </span>
  )
}

export function PublishedModelCatalog(props: {
  onManagePricing: (modelId: string) => void
}) {
  const onManagePricing = props.onManagePricing
  const { t, i18n } = useTranslation()
  const numberFormatter = useMemo(
    () =>
      new Intl.NumberFormat(
        toIntlLocale(i18n.resolvedLanguage ?? i18n.language)
      ),
    [i18n.language, i18n.resolvedLanguage]
  )
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [modelId, setModelId] = useState('')
  const [provider, setProvider] = useState('')
  const [capability, setCapability] = useState('')
  const [visibility, setVisibility] = useState('ALL')
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const tableContentRef = useRef<HTMLDivElement>(null)
  const [actionColumnSize, setActionColumnSize] = useState(208)
  useEffect(() => {
    setPagination((current) =>
      current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }
    )
  }, [capability, modelId, provider, search, visibility])
  const ensurePageInRange = useCallback((pageCount: number) => {
    setPagination((current) =>
      current.pageIndex < Math.max(1, pageCount)
        ? current
        : { ...current, pageIndex: Math.max(0, pageCount - 1) }
    )
  }, [])
  const [editing, setEditing] = useState<CanvasAdminTestingModel | null>(null)
  const [toggling, setToggling] = useState<CanvasAdminTestingModel | null>(null)
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
  const presentationBusy = publisher.isPending || reloadingPresentation
  async function reloadPresentation() {
    if (presentationBusy) return
    setReloadingPresentation(true)
    const result = await models.refetch()
    const current = result.data?.find(
      (model) => model.id === (editing ?? toggling)?.id
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
      setToggling(current)
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
          ? model.customerVisible
          : !model.customerVisible)
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
  useLayoutEffect(() => {
    const actions = tableContentRef.current?.querySelector<HTMLElement>(
      '[data-model-actions]'
    )
    if (!actions || actions.scrollWidth === 0) return
    const cell = actions.closest('td')
    if (!cell) return
    const padding = getComputedStyle(cell)
    const requiredWidth = Math.ceil(
      actions.scrollWidth +
        Number.parseFloat(padding.paddingLeft) +
        Number.parseFloat(padding.paddingRight)
    )
    setActionColumnSize(
      [128, 160, 208, 256].find((size) => size >= requiredWidth) ??
        requiredWidth
    )
  }, [filtered, pagination.pageIndex, pagination.pageSize, t])
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
            <div className='min-w-0 space-y-1 whitespace-normal'>
              <div className='font-medium [overflow-wrap:anywhere]'>
                {model.name}
              </div>
              <PublishedModelDetails model={model} />
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
        id: 'visibility',
        accessorFn: visibilityRank,
        size: 160,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Customer display')}
          />
        ),
        meta: {
          label: t('Customer display'),
        },
        cell: ({ row }) => (
          <div className='flex items-center gap-2'>
            <Switch
              checked={row.original.enabled}
              disabled={presentationBusy}
              aria-label={t('Customer display for {{model}}', {
                model: row.original.name,
              })}
              onCheckedChange={() => {
                if (presentationBusy) return
                setFormServerError(null)
                setPresentationConflict(false)
                setToggling(row.original)
              }}
            />
            {row.original.enabled && (
              <CustomerVisibilityCell model={row.original} />
            )}
          </div>
        ),
      },
      {
        id: 'pricing',
        size: 128,
        accessorFn: (model) =>
          model.totalTargets ? model.pricedTargets / model.totalTargets : 0,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('Pricing coverage')}
          />
        ),
        meta: {
          label: t('Pricing coverage'),
        },
        cell: ({ row }) => {
          const model = row.original
          const enabledScopes = model.parameterCombinations.filter(
            (scope) => scope.enabled
          ).length
          let label = t('Priced {{priced}} / {{total}} targets', {
            priced: numberFormatter.format(model.pricedTargets),
            total: numberFormatter.format(model.totalTargets),
          })
          if (enabledScopes === 0) {
            label = t('No pricing scopes')
          } else if (model.totalTargets === 0) {
            label = t('No published price plans')
          }
          return <span className='whitespace-normal tabular-nums'>{label}</span>
        },
      },
      {
        id: 'actions',
        size: actionColumnSize,
        header: t('Actions'),
        meta: { label: t('Actions') },
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const model = row.original
          return (
            <div
              data-model-actions
              className='flex w-max items-center justify-start gap-2'
            >
              <Button
                variant='outline'
                disabled={presentationBusy}
                onClick={() => onManagePricing(model.id)}
              >
                {t('Manage prices')}
              </Button>
              <Button
                variant='outline'
                disabled={presentationBusy}
                onClick={() => startEdit(model)}
              >
                {t('Edit display information')}
              </Button>
            </div>
          )
        },
      },
    ],
    [
      actionColumnSize,
      numberFormatter,
      onManagePricing,
      presentationBusy,
      startEdit,
      t,
    ]
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
    pagination,
    onPaginationChange: setPagination,
    ensurePageInRange,
    autoResetPageIndex: false,
  })
  const visibleColumns = table.getVisibleLeafColumns()
  const flexibleColumn =
    visibleColumns.find((column) => column.id === 'name') ??
    visibleColumns.find((column) => column.id === 'provider')
  const minimumTableWidth = visibleColumns.reduce(
    (width, column) => width + column.getSize(),
    0
  )
  if (models.isError) {
    return <ErrorState onRetry={() => void models.refetch()} />
  }
  return (
    <Card>
      <CardContent ref={tableContentRef} className='min-w-0 space-y-4'>
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
            search || modelId || provider || capability || visibility !== 'ALL'
          )}
          onReset={() => {
            setSearch('')
            setModelId('')
            setProvider('')
            setCapability('')
            setVisibility('ALL')
          }}
        />
        <DataTableView
          table={table}
          isLoading={models.isPending}
          tableContainerClassName='overflow-x-auto'
          tableClassName={
            flexibleColumn
              ? 'w-full min-w-(--model-table-min-width) table-fixed'
              : 'w-(--model-table-min-width) min-w-(--model-table-min-width) table-fixed'
          }
          containerProps={{
            style: {
              '--model-table-min-width': `${minimumTableWidth}px`,
            } as CSSProperties,
          }}
          colgroup={
            <colgroup>
              {visibleColumns.map((column) => (
                <col
                  key={column.id}
                  style={{
                    width:
                      column.id === flexibleColumn?.id
                        ? undefined
                        : column.getSize(),
                  }}
                />
              ))}
            </colgroup>
          }
          getColumnClassName={(columnId, section) => {
            if (section === 'cell') {
              return `px-2 py-2 whitespace-normal ${columnId === 'actions' ? 'align-middle' : 'align-top'}`
            }
            if (columnId === 'visibility' || columnId === 'pricing') {
              return 'px-2 [&_button]:ms-0 [&_button]:h-auto [&_button]:min-h-8 [&_button]:w-full [&_button]:justify-start [&_button]:px-0 [&_button]:whitespace-normal [&_button_span]:min-w-0 [&_button_span]:text-left'
            }
            return 'px-2'
          }}
          emptyTitle={t('No matching models')}
          emptyDescription={t('No records found. Try adjusting your filters.')}
        />
        <div className='pt-2'>
          <DataTablePagination table={table} />
        </div>
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
                enabled: editing.enabled,
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
                {toggling.enabled
                  ? t('Turn off display switch?')
                  : t('Turn on display switch?')}
              </AlertDialogTitle>
            </AlertDialogHeader>
            <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm'>
              <dt className='text-muted-foreground'>{t('Model')}</dt>
              <dd>{toggling.name}</dd>
              <dt className='text-muted-foreground'>{t('Display switch')}</dt>
              <dd>
                {toggling.enabled
                  ? t('Display switch on state')
                  : t('Display switch off state')}{' '}
                →{' '}
                {toggling.enabled
                  ? t('Display switch off state')
                  : t('Display switch on state')}
              </dd>
            </dl>
            <AlertDialogDescription>
              {toggling.enabled
                ? t('When disabled, the model is not shown to customers.')
                : t(
                    'When enabled, the model is shown to customers only when technical and pricing conditions are met.'
                  )}
            </AlertDialogDescription>
            {presentationFeedback}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={presentationBusy}>
                {t('Cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={toggling.enabled ? 'destructive' : 'default'}
                disabled={presentationBusy || presentationConflict}
                onClick={() => {
                  if (presentationBusy || presentationConflict) return
                  publisher.mutate({
                    modelKey: toggling.modelKey,
                    displayName: toggling.name,
                    description: toggling.description,
                    enabled: !toggling.enabled,
                    expectedVersion: presentationVersion(toggling),
                  })
                }}
              >
                {publisher.isPending
                  ? t('Publishing...')
                  : customerDisplayAction(toggling.enabled, t)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  )
}
