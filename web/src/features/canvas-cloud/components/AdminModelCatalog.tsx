/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type PaginationState,
} from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import { CheckCircle2, FileJson2, FolderUp, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePagination, StaticDataTable } from '@/components/data-table'
import {
  DataTableColumnFilterField,
  DataTableColumnFilterPanel,
} from '@/components/data-table/toolbar/column-filter-panel'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import {
  getServerErrorCode,
  getServerErrorStatus,
} from '@/lib/server-error-message'

import {
  planCanvasModelCatalogImport,
  publishCanvasModelCatalogImport,
} from '../api'
import {
  CatalogSourceReadError,
  readCatalogSource,
} from '../catalogSourceReader'
import type {
  ModelCatalogDiagnostic,
  ModelCatalogImportPlan,
} from '../generated/model-catalog-import'
import type { ModelManagementReturnContext } from '../model-management-navigation-state'
import { canvasStaticColumnWidth } from './canvas-table-layout'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import { CanvasStaticSortHeader } from './CanvasStaticSortHeader'
import { CatalogModelPreview } from './CatalogModelPreview'
import { ModelMonitoringOverview } from './ModelMonitoringOverview'
import { PricingActionConfirmation } from './PricingActionConfirmation'
import { PublishedModelCatalog } from './PublishedModelCatalog'
import { UnifiedModelPricing } from './UnifiedModelPricing'

function diagnosticDetails(
  diagnostic: Partial<ModelCatalogDiagnostic>,
  t: TFunction
): string {
  const fallback = [diagnostic.recommendation, diagnostic.valueSummary]
    .filter(
      (value, index, values) =>
        Boolean(value) && values.indexOf(value) === index
    )
    .join(' · ')
  const fallbackMessage = fallback || diagnostic.code || t('Unknown')
  const message = diagnostic.messageKey
    ? t(diagnostic.messageKey, {
        ...diagnostic.params,
        defaultValue: fallbackMessage,
      })
    : fallbackMessage
  const reason =
    diagnostic.valueSummary && message !== fallbackMessage
      ? `${message} · ${diagnostic.valueSummary}`
      : message
  return [
    diagnostic.profileKey &&
      `${t('Adapter Profile')}: ${diagnostic.profileKey}`,
    diagnostic.operation && `${t('Operation')}: ${diagnostic.operation}`,
    diagnostic.sourceFile,
    diagnostic.jsonPath && `${t('Path')}: ${diagnostic.jsonPath}`,
    `${t('Reason')}: ${reason}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function errorDetails(
  error: unknown,
  t: TFunction
): { message: string; details: string[] } {
  if (error && typeof error === 'object') {
    const data = (error as { response?: { data?: unknown } }).response?.data as
      | { message?: unknown; diagnostics?: unknown }
      | undefined
    const details = Array.isArray(data?.diagnostics)
      ? data.diagnostics.map((item) =>
          diagnosticDetails(item as Partial<ModelCatalogDiagnostic>, t)
        )
      : []
    if (details.length > 0) {
      return { message: t('Catalog source validation failed.'), details }
    }
    if (typeof data?.message === 'string') {
      return { message: data.message, details }
    }
  }
  if (error instanceof CatalogSourceReadError) {
    const messageKey = {
      NO_FILES_SELECTED: 'Select a catalog source folder.',
      FILE_READ_FAILED: 'A catalog source file could not be read.',
      ENCODING_FAILED: 'A catalog source file could not be encoded.',
    }[error.code]
    const details = error.sourceFile ? [error.sourceFile] : []
    return { message: t(messageKey), details }
  }
  return {
    message:
      error instanceof Error
        ? error.message
        : t('Catalog source validation failed.'),
    details: [],
  }
}

function publicationErrorReason(error: unknown, t: TFunction): string {
  const code = getServerErrorCode(error)
  const status = getServerErrorStatus(error)
  const response = (
    error as {
      response?: { data?: { message?: unknown; diagnostics?: unknown } }
    }
  )?.response?.data
  const message = response?.message
  if (Array.isArray(response?.diagnostics) && response.diagnostics.length > 0) {
    return diagnosticDetails(
      response.diagnostics[0] as Partial<ModelCatalogDiagnostic>,
      t
    )
  }
  if (
    code === 'CATALOG_PLAN_VALIDATOR_CHANGED' ||
    code === 'CATALOG_PLAN_ACTOR_MISMATCH' ||
    code === 'CATALOG_PLAN_SNAPSHOT_INVALID'
  ) {
    return t('The catalog plan is stale. Select the source folder again.')
  }
  if (code === 'CATALOG_IMPORT_EXPIRED') {
    return t('The catalog plan has expired.')
  }
  if (code === 'IDEMPOTENCY_CONFLICT') {
    return t('This publication request conflicts with an earlier request.')
  }
  if (status === 401 || status === 403 || code === 'UNAUTHORIZED') {
    return t('Your administrator session is no longer authorized.')
  }
  if (code === 'VALIDATION_FAILED') {
    return t('The Bundle publication request is no longer valid.')
  }
  if (status === 409) {
    return t(
      'Catalog publication conflicts with current catalog or pricing facts.'
    )
  }
  if (typeof message === 'string') return message
  return t('Catalog publication failed. Review the validation results.')
}

export function AdminModelCatalog(props: {
  principalId: string
  initialPricingModelId?: string
  initialPricingPublicationId?: string
  tab?: 'published' | 'import' | 'monitoring'
  onTabChange?: (tab: 'published' | 'import' | 'monitoring') => void
  onManagePricing?: (
    modelId: string,
    returnContext?: ModelManagementReturnContext
  ) => void
  onManageBindings?: (
    modelId: string,
    returnContext?: ModelManagementReturnContext
  ) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [storedPlan, setPlan] = useState<ModelCatalogImportPlan | null>(null)
  const planActorPrincipalId = useRef<string | null>(null)
  const plan =
    planActorPrincipalId.current === props.principalId ? storedPlan : null
  const [failure, setFailure] = useState<{
    message: string
    details: string[]
  } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const selectionGeneration = useRef(0)
  const [uncontrolledActiveTab, setUncontrolledActiveTab] = useState<
    'published' | 'import' | 'monitoring'
  >('published')
  const activeTab = props.tab ?? uncontrolledActiveTab
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [resourceType, setResourceType] = useState('')
  const [action, setAction] = useState('ALL')
  const [sort, setSort] = useState<
    'resourceType' | 'key' | 'action' | 'currentVersion' | 'proposedVersion'
  >('resourceType')
  const [descending, setDescending] = useState(false)
  const [changePagination, setChangePagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const planner = useMutation({ mutationFn: planCanvasModelCatalogImport })
  const publisher = useMutation({
    mutationFn: publishCanvasModelCatalogImport,
    onSuccess: async () => {
      const recovered = plan?.action === 'RECOVER_PRICING'
      const continuityRecovered = plan?.action === 'RECOVER_CONTINUITY'
      setPlan(null)
      planActorPrincipalId.current = null
      setFailure(null)
      setConfirming(false)
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-testing-models'],
      })
      let successMessage = t('Model catalog published')
      if (recovered) {
        successMessage = t('Verified price links restored')
      }
      if (continuityRecovered) {
        successMessage = t('Verified price and API Key links restored')
      }
      toast.success(successMessage)
    },
    onError: (error) => {
      setPlan(null)
      planActorPrincipalId.current = null
      setConfirming(false)
      setFailure({
        message: t(
          'Publication failed. Select the catalog source folder again.'
        ),
        details: [publicationErrorReason(error, t)],
      })
    },
  })

  async function selectFolder(files: FileList | null) {
    const generation = ++selectionGeneration.current
    setPlan(null)
    planActorPrincipalId.current = null
    setFailure(null)
    if (!files?.length) return
    try {
      const nextPlan = await planner.mutateAsync(
        await readCatalogSource([...files])
      )
      if (generation !== selectionGeneration.current) return
      if (Date.parse(nextPlan.expiresAt) <= Date.now()) {
        setFailure({ message: t('The catalog plan has expired.'), details: [] })
        return
      }
      planActorPrincipalId.current = props.principalId
      setPlan(nextPlan)
    } catch (error) {
      if (generation !== selectionGeneration.current) return
      setFailure(errorDetails(error, t))
    } finally {
      if (generation === selectionGeneration.current) planner.reset()
    }
  }
  useEffect(() => {
    ++selectionGeneration.current
    planActorPrincipalId.current = null
    setPlan(null)
    setConfirming(false)
    setFailure(null)
  }, [props.principalId])
  useEffect(() => {
    if (!plan) return
    let timeout: number | undefined
    const expireWhenDue = () => {
      const remaining = Date.parse(plan.expiresAt) - Date.now()
      if (remaining <= 0) {
        setPlan(null)
        planActorPrincipalId.current = null
        setConfirming(false)
        setFailure({ message: t('The catalog plan has expired.'), details: [] })
        return
      }
      timeout = window.setTimeout(
        expireWhenDue,
        Math.min(remaining, 2_147_483_647)
      )
    }
    expireWhenDue()
    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout)
    }
  }, [plan, t])
  const filteredChanges = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    const resourceQuery = resourceType.trim().toLocaleLowerCase()
    return [...(plan?.changes ?? [])]
      .filter(
        (change) =>
          (action === 'ALL' || change.action === action) &&
          (!query || change.key.toLocaleLowerCase().includes(query)) &&
          (!resourceQuery ||
            change.resourceType.toLocaleLowerCase().includes(resourceQuery))
      )
      .sort((left, right) => {
        const compared =
          typeof left[sort] === 'number' && typeof right[sort] === 'number'
            ? left[sort] - right[sort]
            : String(left[sort] ?? '').localeCompare(String(right[sort] ?? ''))
        return descending ? -compared : compared
      })
  }, [action, descending, plan?.changes, resourceType, search, sort])
  const pageCount = Math.max(
    1,
    Math.ceil(filteredChanges.length / changePagination.pageSize)
  )
  useEffect(() => {
    setChangePagination((value) =>
      value.pageIndex >= pageCount
        ? { ...value, pageIndex: pageCount - 1 }
        : value
    )
  }, [pageCount])
  const effectiveChangePagination = {
    ...changePagination,
    pageIndex: Math.min(changePagination.pageIndex, pageCount - 1),
  }
  const changeTable = useReactTable({
    data: filteredChanges,
    columns: [{ id: 'change', accessorFn: (change) => change.key }],
    state: { pagination: effectiveChangePagination },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater(effectiveChangePagination)
          : updater
      setChangePagination(
        next.pageSize === effectiveChangePagination.pageSize
          ? next
          : { ...next, pageIndex: 0 }
      )
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })
  const visibleChanges = changeTable
    .getRowModel()
    .rows.map((row) => row.original)
  const publishableChanges = (plan?.changes ?? []).filter(
    (change) => change.action === 'CREATE' || change.action === 'CREATE_VERSION'
  )
  const changedModels = (plan?.models ?? []).filter(
    (model) => model.action !== 'NO_OP'
  )
  const recoveringExisting =
    plan?.action === 'RECOVER_PRICING' || plan?.action === 'RECOVER_CONTINUITY'
  const hasBlockingDiagnostics =
    plan?.diagnostics.some(
      (diagnostic) =>
        diagnostic.severity === 'BLOCKING' || diagnostic.severity === 'ERROR'
    ) ?? false
  const planBlocked = Boolean(plan?.blocking || hasBlockingDiagnostics)
  const canPublish =
    (plan?.action === 'PUBLISH' || recoveringExisting) &&
    !planBlocked &&
    Boolean(plan.importId) &&
    Boolean(plan.planToken) &&
    (publishableChanges.length > 0 || recoveringExisting)
  let planDescription = t(
    'Validation passed. Review the client model preview and every database change before publishing.'
  )
  if (planBlocked) {
    planDescription = t(
      'Publication is blocked. Fix every conflict and upload the Bundle again.'
    )
  } else if (plan?.action === 'RECOVER_PRICING') {
    planDescription = t(
      'Review the verified price links for this published catalog before restoring them.'
    )
  } else if (plan?.action === 'RECOVER_CONTINUITY') {
    planDescription = t(
      'Review the verified price and API Key links before restoring them.'
    )
  } else if (plan?.action === 'REPLAY') {
    planDescription = t(
      'This exact Bundle is already published. No new publication is required.'
    )
  } else if (plan?.action === 'NO_CHANGES') {
    planDescription = t(
      'All catalog resources are unchanged. No new publication will be created.'
    )
  }
  let publicationSummary = t('Nothing needs to be published')
  if (plan?.action === 'RECOVER_PRICING' && canPublish) {
    publicationSummary = t(
      'Verified price links will be restored without a new catalog version'
    )
  } else if (plan?.action === 'RECOVER_CONTINUITY' && canPublish) {
    publicationSummary = t(
      'Verified price and API Key links will be restored without a new catalog version'
    )
  } else if (canPublish) {
    publicationSummary = t(
      '{{models}} models and {{changes}} resource changes will be published',
      { models: changedModels.length, changes: publishableChanges.length }
    )
  }
  let confirmationTitle = t('Publish model catalog Bundle?')
  let reviewLabel = t('Review and publish')
  let confirmationDescription = t(
    'This publishes immutable catalog versions and the verified price links shown in the plan. Specifications needing pricing remain unpriced.'
  )
  let confirmLabel = t('Publish Bundle')
  if (plan?.action === 'RECOVER_PRICING') {
    reviewLabel = t('Review and restore prices')
    confirmationTitle = t('Restore verified price links for this Bundle?')
    confirmationDescription = t(
      'This restores only the verified price links shown in the plan. Existing catalog versions remain unchanged.'
    )
    confirmLabel = t('Restore price links')
  } else if (plan?.action === 'RECOVER_CONTINUITY') {
    reviewLabel = t('Review and restore links')
    confirmationTitle = t('Restore verified links for this Bundle?')
    confirmationDescription = t(
      'This restores only the verified price and API Key links shown in the plan. Existing catalog versions remain unchanged.'
    )
    confirmLabel = t('Restore verified links')
  }
  function changeSort(next: typeof sort) {
    if (sort === next) setDescending((value) => !value)
    else {
      setSort(next)
      setDescending(false)
    }
    setChangePagination((value) => ({ ...value, pageIndex: 0 }))
  }
  return (
    <>
      {props.initialPricingModelId && (
        <UnifiedModelPricing
          initialModelId={props.initialPricingModelId}
          initialPublicationId={props.initialPricingPublicationId}
          onBack={() =>
            void navigate({
              to: '/canvas-cloud/$section',
              params: { section: 'catalog' },
              search: {},
            })
          }
        />
      )}
      <div className='space-y-4' hidden={Boolean(props.initialPricingModelId)}>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (
              value !== 'published' &&
              value !== 'import' &&
              value !== 'monitoring'
            ) {
              return
            }
            if (props.tab === undefined) setUncontrolledActiveTab(value)
            props.onTabChange?.(value)
          }}
        >
          <CanvasManagementTabsList>
            <CanvasManagementTabsTrigger value='published'>
              {t('Model list')}
            </CanvasManagementTabsTrigger>
            <CanvasManagementTabsTrigger value='import'>
              {t('Import and publish')}
            </CanvasManagementTabsTrigger>
            <CanvasManagementTabsTrigger value='monitoring'>
              {t('Runtime monitoring')}
            </CanvasManagementTabsTrigger>
          </CanvasManagementTabsList>
          <TabsContent value='published' className='mt-4'>
            <PublishedModelCatalog
              onManagePricing={(modelId, returnContext) => {
                if (props.onManagePricing) {
                  props.onManagePricing(modelId, returnContext)
                  return
                }
                void navigate({
                  to: '/canvas-cloud/$section',
                  params: { section: 'pricing' },
                  search: { modelId },
                })
              }}
              onManageBindings={props.onManageBindings}
            />
          </TabsContent>
          <TabsContent value='monitoring' className='mt-4'>
            <ModelMonitoringOverview />
          </TabsContent>
          <TabsContent value='import' className='mt-4 space-y-4'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Model catalog Bundle')}</CardTitle>
                <CardDescription>
                  {t(
                    'Upload the complete Bundle folder. Canvas Cloud validates every referenced JSON file before showing a publication plan.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-4'>
                <label className='hover:bg-muted/40 focus-within:ring-ring flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center transition-colors focus-within:ring-2 sm:p-8'>
                  <FolderUp
                    className='text-muted-foreground size-8'
                    aria-hidden='true'
                  />
                  <span className='font-medium'>
                    {t('Choose Bundle folder')}
                  </span>
                  <span className='text-muted-foreground text-sm'>
                    {t(
                      'The folder must contain manifest.json and every file referenced by it.'
                    )}
                  </span>
                  <Input
                    className='sr-only'
                    type='file'
                    multiple
                    disabled={publisher.isPending}
                    aria-label={t('Choose Bundle folder')}
                    ref={(node) => {
                      if (node) node.setAttribute('webkitdirectory', '')
                    }}
                    onChange={(event) => {
                      void selectFolder(event.target.files)
                      event.target.value = ''
                    }}
                  />
                </label>
                {failure && (
                  <div
                    role='alert'
                    className='border-destructive/40 bg-destructive/5 text-destructive flex gap-3 rounded-lg border p-3 text-sm'
                  >
                    <ShieldAlert className='mt-0.5 size-4 shrink-0' />
                    <div>
                      <div>{t(failure.message)}</div>
                      {failure.details.length > 0 && (
                        <ul className='mt-2 list-disc space-y-1 pl-4'>
                          {failure.details.map((detail) => (
                            <li key={detail}>{detail}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            {plan && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <FileJson2 className='size-5' />
                    {plan.bundleId}
                  </CardTitle>
                  <CardDescription>
                    {t('Bundle version')}: {plan.bundleVersion}
                  </CardDescription>
                </CardHeader>
                <CardContent className='text-muted-foreground space-y-1 text-xs'>
                  <div className='break-all'>
                    {t('Import ID')}: {plan.importId}
                  </div>
                  <div className='break-all'>
                    {t('Source SHA-256')}: {plan.sourceSha256}
                  </div>
                </CardContent>
              </Card>
            )}
            {planner.isPending && (
              <Card size='sm'>
                <CardContent className='text-muted-foreground text-sm'>
                  {t('Validating Bundle and calculating changes...')}
                </CardContent>
              </Card>
            )}
            {plan && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <CheckCircle2 className='size-5 text-emerald-600' />
                    {t('Validation and publication plan')}
                  </CardTitle>
                  <CardDescription>{planDescription}</CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {plan.diagnostics.length > 0 && (
                    <div
                      role='alert'
                      className={
                        planBlocked
                          ? 'border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm'
                          : 'bg-muted/30 rounded-lg border p-3 text-sm'
                      }
                    >
                      <ul className='list-disc space-y-1 pl-4'>
                        {plan.diagnostics.map((diagnostic) => (
                          <li
                            key={`${diagnostic.code}:${diagnostic.sourceFile}:${diagnostic.jsonPath}`}
                          >
                            {diagnosticDetails(diagnostic, t)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Tabs defaultValue='models'>
                    <CanvasManagementTabsList>
                      <CanvasManagementTabsTrigger value='models'>
                        {t('Client model preview')} ({plan.models.length})
                      </CanvasManagementTabsTrigger>
                      <CanvasManagementTabsTrigger value='changes'>
                        {t('Database plan')} ({plan.changes.length})
                      </CanvasManagementTabsTrigger>
                    </CanvasManagementTabsList>
                    <TabsContent value='models' className='mt-4' keepMounted>
                      <CatalogModelPreview
                        models={plan.models}
                        recoverPricing={plan.action === 'RECOVER_PRICING'}
                        recoverContinuity={plan.action === 'RECOVER_CONTINUITY'}
                      />
                    </TabsContent>
                    <TabsContent
                      value='changes'
                      className='mt-4 space-y-4'
                      keepMounted
                    >
                      <DataTableColumnFilterPanel
                        activeCount={
                          [
                            resourceType,
                            search,
                            action === 'ALL' ? '' : action,
                          ].filter(Boolean).length
                        }
                        onClear={() => {
                          setResourceType('')
                          setSearch('')
                          setAction('ALL')
                          setChangePagination((value) => ({
                            ...value,
                            pageIndex: 0,
                          }))
                        }}
                      >
                        <DataTableColumnFilterField label={t('Resource type')}>
                          <Input
                            value={resourceType}
                            placeholder={t('Resource type')}
                            onChange={(event) => {
                              setResourceType(event.target.value)
                              setChangePagination((value) => ({
                                ...value,
                                pageIndex: 0,
                              }))
                            }}
                          />
                        </DataTableColumnFilterField>
                        <DataTableColumnFilterField label={t('Key')}>
                          <Input
                            value={search}
                            placeholder={t('Key')}
                            onChange={(event) => {
                              setSearch(event.target.value)
                              setChangePagination((value) => ({
                                ...value,
                                pageIndex: 0,
                              }))
                            }}
                          />
                        </DataTableColumnFilterField>
                        <DataTableColumnFilterField label={t('Action')}>
                          <Select
                            value={action}
                            onValueChange={(value) => {
                              setAction(value ?? 'ALL')
                              setChangePagination((value) => ({
                                ...value,
                                pageIndex: 0,
                              }))
                            }}
                          >
                            <SelectTrigger
                              className='w-full'
                              aria-label={t('Action')}
                            >
                              <CanvasLocalizedSelectValue
                                value={action === 'ALL' ? '' : action}
                                emptyLabelKey='All actions'
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='ALL'>
                                {t('All actions')}
                              </SelectItem>
                              {[
                                'CREATE',
                                'REUSE',
                                'CREATE_VERSION',
                                'NO_OP',
                                'CONFLICT',
                              ].map((value) => (
                                <SelectItem key={value} value={value}>
                                  {t(value)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </DataTableColumnFilterField>
                      </DataTableColumnFilterPanel>
                      <StaticDataTable
                        className='max-w-full overflow-x-auto'
                        containerProps={{
                          'aria-label': t('Database plan'),
                          tabIndex: 0,
                        }}
                        tableClassName='min-w-[880px] table-fixed'
                      >
                        <TableHeader>
                          <TableRow>
                            <TableHead
                              className={canvasStaticColumnWidth.standard}
                            >
                              <CanvasStaticSortHeader
                                active={sort === 'resourceType'}
                                descending={descending}
                                label={t('Resource type')}
                                onClick={() => changeSort('resourceType')}
                              />
                            </TableHead>
                            <TableHead
                              className={canvasStaticColumnWidth.detail}
                            >
                              <CanvasStaticSortHeader
                                active={sort === 'key'}
                                descending={descending}
                                label={t('Key')}
                                onClick={() => changeSort('key')}
                              />
                            </TableHead>
                            <TableHead
                              className={canvasStaticColumnWidth.standard}
                            >
                              <CanvasStaticSortHeader
                                active={sort === 'action'}
                                descending={descending}
                                label={t('Action')}
                                onClick={() => changeSort('action')}
                              />
                            </TableHead>
                            <TableHead
                              className={canvasStaticColumnWidth.compact}
                            >
                              <CanvasStaticSortHeader
                                active={sort === 'currentVersion'}
                                descending={descending}
                                label={t('Current version')}
                                onClick={() => changeSort('currentVersion')}
                              />
                            </TableHead>
                            <TableHead
                              className={canvasStaticColumnWidth.compact}
                            >
                              <CanvasStaticSortHeader
                                active={sort === 'proposedVersion'}
                                descending={descending}
                                label={t('Proposed version')}
                                onClick={() => changeSort('proposedVersion')}
                              />
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {visibleChanges.map((change) => (
                            <TableRow
                              key={`${change.resourceType}:${change.key}`}
                            >
                              <TableCell>{t(change.resourceType)}</TableCell>
                              <TableCell className='max-w-[22rem] break-all'>
                                {change.key}
                              </TableCell>
                              <TableCell className='font-medium'>
                                {t(change.action)}
                              </TableCell>
                              <TableCell className='tabular-nums'>
                                {change.currentVersion ?? '—'}
                              </TableCell>
                              <TableCell className='tabular-nums'>
                                {change.proposedVersion ?? '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </StaticDataTable>
                      <DataTablePagination table={changeTable} />
                    </TabsContent>
                  </Tabs>
                  <div className='bg-muted/30 flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='text-sm'>
                      <div className='font-medium'>{publicationSummary}</div>
                      <div className='text-muted-foreground mt-1'>
                        {recoveringExisting
                          ? t('Existing catalog versions remain unchanged.')
                          : t(
                              'Unchanged models are reused and never receive a new version.'
                            )}
                      </div>
                      <div className='mt-2 text-sm tabular-nums'>
                        {t('Existing prices reused')}:{' '}
                        {plan.pricingSummary.reused}
                        {' · '}
                        {t('Specifications needing pricing')}:{' '}
                        {plan.pricingSummary.needsPricing}
                      </div>
                    </div>
                    <Button
                      disabled={!canPublish || publisher.isPending}
                      onClick={() => setConfirming(true)}
                    >
                      {reviewLabel}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
        {plan && (
          <PricingActionConfirmation
            open={confirming}
            onOpenChange={setConfirming}
            title={confirmationTitle}
            description={confirmationDescription}
            details={[
              { label: t('Bundle'), value: plan.bundleId },
              { label: t('Bundle version'), value: plan.bundleVersion },
              ...(recoveringExisting
                ? []
                : [
                    {
                      label: t('Models to publish'),
                      value: String(changedModels.length),
                    },
                    {
                      label: t('Resource changes to publish'),
                      value: String(publishableChanges.length),
                    },
                    {
                      label: t('Unchanged models skipped'),
                      value: String(plan.models.length - changedModels.length),
                    },
                  ]),
              { label: t('Plan action'), value: t(plan.action) },
              {
                label: t('Existing prices reused'),
                value: String(plan.pricingSummary.reused),
              },
              {
                label: t('Specifications needing pricing'),
                value: String(plan.pricingSummary.needsPricing),
              },
            ]}
            confirmLabel={confirmLabel}
            pending={publisher.isPending}
            onConfirm={() =>
              publisher.mutate({
                importId: plan.importId,
                expectedPlanToken: plan.planToken,
              })
            }
          />
        )}
      </div>
    </>
  )
}
