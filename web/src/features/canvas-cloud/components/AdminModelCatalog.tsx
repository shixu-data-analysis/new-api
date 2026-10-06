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
import type { TFunction } from 'i18next'
import { FolderUp, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  getServerErrorCode,
  getServerErrorStatus,
} from '@/lib/server-error-message'

import {
  planCanvasModelCatalogImport,
  publishCanvasModelCatalogImport,
} from '../api'
import {
  catalogDiagnosticTarget,
  catalogModelTabCounts,
  catalogSharedChangeKind,
  catalogSharedChanges,
  reviewCatalogModel,
  type CatalogDiagnosticTarget,
} from '../catalog-plan-review'
import {
  CatalogSourceReadError,
  readCatalogSource,
} from '../catalogSourceReader'
import type {
  ModelCatalogDiagnostic,
  ModelCatalogImportPlan,
} from '../generated/model-catalog-import'
import type { ModelManagementReturnContext } from '../model-management-navigation-state'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import { catalogPlanDiagnosticText } from './catalog-plan-labels'
import { CatalogModelPreview, type CatalogRowFocus } from './CatalogModelPreview'
import {
  CatalogSharedResources,
  type CatalogSharedFocus,
} from './CatalogSharedResources'
import { ModelMonitoringOverview } from './ModelMonitoringOverview'
import { PricingActionConfirmation } from './PricingActionConfirmation'
import {
  PublishedModelCatalog,
  type ModelBindingNavigationTarget,
} from './PublishedModelCatalog'
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

const countBadgeClass = {
  changed:
    'rounded-full bg-blue-100 px-2 text-xs font-medium text-blue-800 dark:bg-blue-500/20 dark:text-blue-200',
  pending:
    'rounded-full bg-orange-100 px-2 text-xs font-medium text-orange-800 dark:bg-orange-500/20 dark:text-orange-200',
  conflict:
    'bg-destructive rounded-full px-2 text-xs font-medium text-white',
} as const

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
    target: ModelBindingNavigationTarget,
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
  const [reviewTab, setReviewTab] = useState<'models' | 'shared'>('models')
  const [modelFocus, setModelFocus] = useState<CatalogRowFocus | null>(null)
  const [sharedFocus, setSharedFocus] = useState<CatalogSharedFocus | null>(
    null
  )
  const focusNonce = useRef(0)
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
    setReviewTab('models')
    setModelFocus(null)
    setSharedFocus(null)
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
  const reviews = useMemo(
    () =>
      (plan?.models ?? []).map((model) =>
        reviewCatalogModel(model, plan?.changes ?? [])
      ),
    [plan]
  )
  const sharedChanges = useMemo(
    () => catalogSharedChanges(plan?.changes ?? []),
    [plan]
  )
  const modelCounts = catalogModelTabCounts(reviews)
  const sharedChanged = sharedChanges.filter(
    (change) => catalogSharedChangeKind(change) !== 'UNCHANGED'
  ).length
  const sharedConflicts = sharedChanges.filter(
    (change) => catalogSharedChangeKind(change) === 'CONFLICT'
  ).length
  const publishableChanges = (plan?.changes ?? []).filter(
    (change) => change.action === 'CREATE' || change.action === 'CREATE_VERSION'
  )
  const changedModels = (plan?.models ?? []).filter(
    (model) => model.action !== 'NO_OP'
  )
  const recoveringExisting =
    plan?.action === 'RECOVER_PRICING' || plan?.action === 'RECOVER_CONTINUITY'
  const blockingDiagnostics = (plan?.diagnostics ?? []).filter(
    (diagnostic) =>
      diagnostic.severity === 'BLOCKING' || diagnostic.severity === 'ERROR'
  )
  const warningDiagnostics = (plan?.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.severity === 'WARNING'
  )
  const planBlocked = Boolean(plan?.blocking || blockingDiagnostics.length > 0)
  const canPublish =
    (plan?.action === 'PUBLISH' || recoveringExisting) &&
    !planBlocked &&
    Boolean(plan.importId) &&
    Boolean(plan.planToken) &&
    (publishableChanges.length > 0 || recoveringExisting)
  let planDescription = t(
    'Validation passed. Review the model and shared resource changes before publishing.'
  )
  if (plan?.action === 'RECOVER_PRICING') {
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
  let confirmationTitle = t('Publish model catalog Bundle?')
  let reviewLabel = t('Review publication content')
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
  function locate(target: CatalogDiagnosticTarget) {
    const nonce = ++focusNonce.current
    setReviewTab(target.tab)
    if (target.tab === 'models') {
      setModelFocus({ key: target.key, nonce })
      return
    }
    setSharedFocus({
      resourceType: target.resourceType,
      key: target.key,
      nonce,
    })
  }
  const countByType = (resourceType: string) =>
    sharedChanges.filter((change) => change.resourceType === resourceType)
      .length
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
                  <CardTitle>{t('Publication preview')}</CardTitle>
                  <CardDescription className='[overflow-wrap:anywhere]'>
                    {plan.bundleId}
                    {' · '}
                    {plan.currentBundle
                      ? t('Currently published {{current}} → this upload {{next}}', {
                          current: plan.currentBundle.bundleVersion,
                          next: plan.bundleVersion,
                        })
                      : t('First import {{version}}', {
                          version: plan.bundleVersion,
                        })}
                    {' · '}
                    {t('Files validated')}
                  </CardDescription>
                  <CardAction>
                    <Button
                      disabled={!canPublish || publisher.isPending}
                      onClick={() => setConfirming(true)}
                    >
                      {reviewLabel}
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {planBlocked ? (
                    <div
                      role='alert'
                      className='border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm'
                    >
                      <div className='font-medium'>
                        {t('Cannot publish: {{count}} items must be resolved first', {
                          count: blockingDiagnostics.length,
                        })}
                      </div>
                      <ul className='mt-2 list-disc space-y-2 pl-4'>
                        {blockingDiagnostics.map((diagnostic) => {
                          const text = catalogPlanDiagnosticText(
                            t,
                            diagnostic,
                            plan.models
                          )
                          const target = catalogDiagnosticTarget(diagnostic)
                          return (
                            <li
                              key={`${diagnostic.code}:${diagnostic.sourceFile}:${diagnostic.jsonPath}`}
                            >
                              <div>
                                {text?.message ??
                                  diagnosticDetails(diagnostic, t)}
                              </div>
                              {text && <div>{text.remedy}</div>}
                              {target && (
                                <Button
                                  type='button'
                                  variant='link'
                                  size='sm'
                                  className='text-destructive h-auto p-0'
                                  onClick={() => locate(target)}
                                >
                                  {t('View details')}
                                </Button>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : (
                    <p className='text-sm'>{planDescription}</p>
                  )}
                  {warningDiagnostics.length > 0 && (
                    <ul className='bg-muted/30 list-disc space-y-1 rounded-lg border p-3 pl-7 text-sm'>
                      {warningDiagnostics.map((diagnostic) => (
                        <li
                          key={`${diagnostic.code}:${diagnostic.sourceFile}:${diagnostic.jsonPath}`}
                        >
                          {diagnosticDetails(diagnostic, t)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className='text-muted-foreground text-sm tabular-nums'>
                    {t(
                      'This Bundle contains: {{models}} models · {{providers}} API providers · {{channels}} provider channels · {{artifacts}} model definition files',
                      {
                        models: plan.models.length,
                        providers: countByType('PROVIDER'),
                        channels: countByType('PROVIDER_CHANNEL'),
                        artifacts: countByType('MODEL_DEFINITION_ARTIFACT'),
                      }
                    )}
                  </p>
                  <Tabs
                    value={reviewTab}
                    onValueChange={(value) => {
                      if (value === 'models' || value === 'shared') {
                        setReviewTab(value)
                      }
                    }}
                  >
                    <TabsList className='max-w-full justify-start overflow-x-auto'>
                      <TabsTrigger value='models' className='flex-none'>
                        {t('Models')}{' '}
                        <span className={countBadgeClass.changed}>
                          {t('{{count}} models changed', {
                            count: modelCounts.changed,
                          })}
                        </span>
                        {modelCounts.pending > 0 && ' '}
                        {modelCounts.pending > 0 && (
                          <span className={countBadgeClass.pending}>
                            {t('{{count}} models pending', {
                              count: modelCounts.pending,
                            })}
                          </span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value='shared' className='flex-none'>
                        {t('Shared resources')}{' '}
                        <span className={countBadgeClass.changed}>
                          {t('{{count}} resources changed', {
                            count: sharedChanged,
                          })}
                        </span>
                        {sharedConflicts > 0 && ' '}
                        {sharedConflicts > 0 && (
                          <span className={countBadgeClass.conflict}>
                            {t('{{count}} resources in conflict', {
                              count: sharedConflicts,
                            })}
                          </span>
                        )}
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value='models' className='mt-2' keepMounted>
                      <CatalogModelPreview
                        reviews={reviews}
                        changes={plan.changes}
                        focus={modelFocus}
                        onViewChannel={(channelId) =>
                          locate({
                            tab: 'shared',
                            resourceType: 'PROVIDER_CHANNEL',
                            key: channelId,
                          })
                        }
                      />
                    </TabsContent>
                    <TabsContent value='shared' className='mt-2' keepMounted>
                      <CatalogSharedResources
                        plan={plan}
                        changes={sharedChanges}
                        reviews={reviews}
                        focus={sharedFocus}
                      />
                    </TabsContent>
                  </Tabs>
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
