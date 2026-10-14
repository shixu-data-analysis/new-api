/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { PageFooterPortal } from '@/components/layout/components/page-footer'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import {
  getModelPricingServerErrorMessageKey,
  getServerErrorMessageKey,
} from '@/lib/server-error-message'

import {
  calculateCanvasModelPricingCny,
  getCanvasModelPricingModel,
  getCanvasModelPricingWorkspace,
  previewCanvasModelPricing,
  publishCanvasModelPricing,
} from '../api'
import { billingUnitLabelKey } from '../lib/billing-unit-labels'
import {
  calculationScopes,
  conflictsByRow,
  currentPricingIdentity,
  firstPricingError,
  isRowIncluded,
  originalPricingDrafts,
  pricingEditorRows,
  pricingFields,
  publicationScopes,
  withDraftValue,
  type PricingDrafts,
  type PricingEditorRow,
  type PricingEditorState,
  type PricingSide,
} from '../lib/model-pricing-editor'
import { pricingRowLabeling } from '../lib/model-pricing-row-label'
import { pricingLoadErrorTitle } from '../model-pricing-error'
import type {
  CanvasBillingUnit,
  CanvasModelPricingCnyCalculation,
  CanvasModelPricingCnyScope,
  CanvasModelPricingDetail,
  CanvasModelPricingPreview,
} from '../types'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import { ModelIdentityTooltip } from './ModelIdentityTooltip'
import {
  ModelPricingEditorTable,
  type PricingRevealRequest,
} from './ModelPricingEditorTable'
import {
  ModelPricingPublishBar,
  type PricingEffectiveMode,
} from './ModelPricingPublishBar'
import { ModelPricingPublishConfirmation } from './ModelPricingPublishConfirmation'
import { ModelPricingScheduleCancelDialog } from './ModelPricingScheduleCancelDialog'
import { ModelPricingUnitSummary } from './ModelPricingUnitSummary'
import { UnifiedModelPricingHistory } from './UnifiedModelPricingHistory'

type PricingTab = 'current' | 'history'

const pricingMetaSchema = z
  .object({
    decisionSummary: z
      .string()
      .trim()
      .max(2000, 'Use no more than 2000 characters'),
    effectiveAt: z.string(),
    effectiveMode: z.enum(['IMMEDIATE', 'SCHEDULED']),
  })
  .superRefine((values, context) => {
    if (values.effectiveMode !== 'SCHEDULED') return
    if (!values.effectiveAt) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveAt'],
        message: 'Choose an effective time',
      })
    } else if (new Date(values.effectiveAt).getTime() <= Date.now()) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveAt'],
        message: 'Scheduled publication must be in the future',
      })
    }
  })
type PricingMetaValues = z.infer<typeof pricingMetaSchema>
const EMPTY_META: PricingMetaValues = {
  decisionSummary: '',
  effectiveAt: '',
  effectiveMode: 'IMMEDIATE',
}

/**
 * Model pricing: prices are edited in the current-pricing table and every change is published together from the
 * page footer. History lists each publication.
 */
export function UnifiedModelPricing(props: {
  onBack: () => void
  initialModelId?: string
  initialPublicationId?: string
  tab?: PricingTab
  onTabChange?: (tab: PricingTab) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'model-pricing'],
    queryFn: getCanvasModelPricingWorkspace,
  })
  const modelId = props.initialModelId ?? ''
  const [tab, setTab] = useState<PricingTab>(props.tab ?? 'current')
  const [billingUnit, setBillingUnit] = useState<CanvasBillingUnit>('REQUEST')
  const [unitChosen, setUnitChosen] = useState(true)
  const [drafts, setDrafts] = useState<PricingDrafts>({})
  const [attempted, setAttempted] = useState(false)
  const [barError, setBarError] = useState('')
  const [conflicts, setConflicts] = useState<
    CanvasModelPricingPreview['conflicts']
  >([])
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [publishKey, setPublishKey] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [reveal, setReveal] = useState<PricingRevealRequest | null>(null)
  const [cancelTarget, setCancelTarget] = useState<{
    publicationId: string
    scopeId: string
  } | null>(null)
  const [initializedModelId, setInitializedModelId] = useState<string | null>(
    null
  )
  const form = useForm<PricingMetaValues>({
    resolver: zodResolver(pricingMetaSchema),
    defaultValues: EMPTY_META,
  })
  const decisionSummary = form.watch('decisionSummary')
  const effectiveAt = form.watch('effectiveAt')
  const effectiveMode = form.watch('effectiveMode')

  useEffect(() => {
    if (props.tab) setTab(props.tab)
  }, [props.tab])
  const changeTab = (next: PricingTab) => {
    if (next === tab) return
    // Unpublished changes stay in the table while history is open.
    if (props.onTabChange) props.onTabChange(next)
    else setTab(next)
  }

  const detail = useQuery({
    queryKey: ['canvas-cloud', 'model-pricing', modelId, 'detail'],
    queryFn: () => getCanvasModelPricingModel(modelId),
    enabled: Boolean(modelId),
  })
  // Drafts, the values they are compared with and the source versions they publish from form one snapshot.
  const [pricing, setPricing] = useState<CanvasModelPricingDetail | null>(null)
  const [pricingChanged, setPricingChanged] = useState(false)
  const hasEdits = useRef(false)
  const selected =
    pricing?.model ??
    detail.data?.model ??
    workspace.data?.models.find((model) => model.id === modelId) ??
    null
  const originals = useMemo(
    () => (pricing ? originalPricingDrafts(pricing) : {}),
    [pricing]
  )
  useEffect(() => {
    const latest = detail.data
    if (!latest || latest === pricing) return
    if (initializedModelId === latest.model.id && pricing) {
      // A refresh that keeps the current versions (such as a cancelled schedule) keeps the drafts too.
      if (currentPricingIdentity(latest) === currentPricingIdentity(pricing)) {
        setPricing(latest)
      } else if (hasEdits.current) {
        setPricingChanged(true)
      } else {
        setPricing(latest)
        setDrafts(originalPricingDrafts(latest))
      }
      return
    }
    const model = latest.model
    setInitializedModelId(model.id)
    setPricing(latest)
    setPricingChanged(false)
    setBillingUnit(
      model.billingUnit ?? model.allowedBillingUnits[0] ?? 'REQUEST'
    )
    setUnitChosen(model.billingUnitState !== 'MIXED')
    setDrafts(originalPricingDrafts(latest))
    setAttempted(false)
    setBarError('')
    setConflicts([])
    form.reset(EMPTY_META)
  }, [detail.data, form, initializedModelId, pricing])

  const fields = pricingFields(billingUnit, selected?.tokenCategories ?? [])
  const rows = useMemo(
    () =>
      pricing
        ? pricingEditorRows(
            pricing,
            pricingFields(billingUnit, pricing.model.tokenCategories)
          )
        : [],
    [pricing, billingUnit]
  )
  const state: PricingEditorState = {
    rows,
    drafts,
    originals,
    fields,
    billingUnit,
    tokenCategories: selected?.tokenCategories ?? [],
    unitChange: Boolean(
      selected &&
      (selected.billingUnitState === 'MIXED' ||
        (selected.billingUnit !== null && selected.billingUnit !== billingUnit))
    ),
    unitPending: !unitChosen,
  }
  const includedRows = rows.filter((row) => isRowIncluded(state, row))
  useEffect(() => {
    hasEdits.current = includedRows.length > 0 || state.unitChange
  })
  const labeling = pricing
    ? pricingRowLabeling(pricing, billingUnit === 'MILLION_TOKENS')
    : null

  // Points and margins under the cells come from the API calculation of the current drafts.
  const calculationRevision = useRef(0)
  const [calculation, setCalculation] =
    useState<CanvasModelPricingCnyCalculation | null>(null)
  const [calculationFailed, setCalculationFailed] = useState(false)
  const [calculationRetry, setCalculationRetry] = useState(0)
  const scopesForCalculation =
    pricing && unitChosen ? calculationScopes(state) : null
  // Serialized, so the request only repeats when the priced values change.
  const calculationKey = JSON.stringify(scopesForCalculation)
  useEffect(() => {
    calculationRevision.current += 1
    setCalculation(null)
    setCalculationFailed(false)
    const scopes = JSON.parse(calculationKey) as
      | CanvasModelPricingCnyScope[]
      | null
    if (!scopes || !modelId) return
    const revision = calculationRevision.current
    const timeout = window.setTimeout(() => {
      calculateCanvasModelPricingCny({
        customerModelId: modelId,
        billingUnit,
        scopes,
      })
        .then((result) => {
          if (revision === calculationRevision.current) setCalculation(result)
        })
        .catch(() => {
          if (revision === calculationRevision.current) {
            setCalculationFailed(true)
          }
        })
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [calculationKey, billingUnit, modelId, calculationRetry])

  const previewRevision = useRef(0)
  const preview = useMutation({
    mutationFn: (input: {
      revision: number
      scopes: CanvasModelPricingCnyScope[]
      calculationIdentity: CanvasModelPricingCnyCalculation['inputIdentity']
    }) =>
      previewCanvasModelPricing({
        customerModelId: modelId,
        billingUnit,
        effectiveMode,
        ...(effectiveMode === 'SCHEDULED'
          ? { effectiveAt: new Date(effectiveAt).toISOString() }
          : {}),
        decisionSummary: decisionSummary.trim(),
        inputMode: 'CNY',
        calculationIdentity: input.calculationIdentity,
        scopes: input.scopes,
      }),
    onSuccess: (result, input) => {
      if (input.revision !== previewRevision.current) return
      if (result.conflicts.length > 0) {
        // Conflicts stop the publication before the confirmation and are marked on their rows.
        setConflicts(result.conflicts)
        setBarError(
          t('{{count}} conflicts block publishing', {
            count: result.conflicts.length,
          })
        )
        const marked = conflictsByRow(state, result.conflicts)
        const first = rows.find((row) => marked.has(row.id))
        if (first) {
          setReveal((current) => ({
            rowId: first.id,
            side: 'customer',
            focus: false,
            seq: (current?.seq ?? 0) + 1,
          }))
        }
        return
      }
      setPreviewId(result.id)
      setPublishKey(`web-model-pricing-${crypto.randomUUID()}`)
      setConfirming(true)
    },
    onError: (error, input) => {
      if (input.revision !== previewRevision.current) return
      toast.error(
        t(
          getServerErrorMessageKey(error) ??
            'Pricing preview could not be created'
        )
      )
    },
  })
  const publication = useMutation({
    mutationFn: () =>
      publishCanvasModelPricing(previewId ?? '', publishKey ?? ''),
    onSuccess: async () => {
      setConfirming(false)
      setPreviewId(null)
      setPublishKey(null)
      toast.success(t('Model pricing published'))
      preview.reset()
      // Start a new edit snapshot from the published prices.
      setInitializedModelId(null)
      await detail.refetch()
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'model-pricing'],
      })
    },
    onError: (error) =>
      toast.error(
        t(
          getModelPricingServerErrorMessageKey(error) ??
            'Model pricing could not be published'
        )
      ),
  })

  function invalidatePreview() {
    previewRevision.current += 1
    setPreviewId(null)
    setPublishKey(null)
    setConfirming(false)
    setConflicts([])
    setBarError('')
  }

  // Discarding also loads the latest prices.
  function discardChanges() {
    invalidatePreview()
    setAttempted(false)
    const latest = detail.data ?? pricing
    if (latest) {
      setPricing(latest)
      setPricingChanged(false)
      setDrafts(originalPricingDrafts(latest))
      setBillingUnit(
        latest.model.billingUnit ??
          latest.model.allowedBillingUnits[0] ??
          'REQUEST'
      )
      setUnitChosen(latest.model.billingUnitState !== 'MIXED')
    }
    form.reset(EMPTY_META)
    preview.reset()
    publication.reset()
  }

  const isDirty = Boolean(
    pricing &&
    (includedRows.length > 0 ||
      decisionSummary.trim() ||
      effectiveMode === 'SCHEDULED' ||
      state.unitChange)
  )

  function changeDraft(
    row: PricingEditorRow,
    side: PricingSide,
    value: string
  ) {
    invalidatePreview()
    setDrafts((current) => withDraftValue(current, row, side, value))
  }

  function changeBillingUnit(next: CanvasBillingUnit) {
    if (!selected || (next === billingUnit && unitChosen)) return
    invalidatePreview()
    setBillingUnit(next)
    setUnitChosen(true)
    setAttempted(false)
    // Old prices do not apply to another unit; returning to the published unit restores them.
    setDrafts(
      selected.billingUnitState !== 'MIXED' && next === selected.billingUnit
        ? originals
        : {}
    )
  }

  async function requestPreview() {
    if (!pricing || !unitChosen || pricingChanged) return
    setAttempted(true)
    const revision = ++previewRevision.current
    setConflicts([])
    const firstError = firstPricingError(state)
    if (firstError) {
      setBarError(t('Fix the prices marked in red first'))
      setReveal((current) => ({
        rowId: firstError.row.id,
        side: firstError.side,
        focus: true,
        seq: (current?.seq ?? 0) + 1,
      }))
      return
    }
    if (!(await form.trigger())) {
      const message = form.getFieldState('effectiveAt').error?.message
      setBarError(message ? t(message) : '')
      return
    }
    setBarError('')
    const scopes = publicationScopes(state)
    let identity: CanvasModelPricingCnyCalculation['inputIdentity']
    try {
      identity = (
        await calculateCanvasModelPricingCny({
          customerModelId: modelId,
          billingUnit,
          scopes,
        })
      ).inputIdentity
    } catch (error) {
      if (revision === previewRevision.current) {
        toast.error(
          t(
            getServerErrorMessageKey(error) ??
              'Pricing preview could not be created'
          )
        )
      }
      return
    }
    if (revision !== previewRevision.current) return
    preview.mutate({ revision, scopes, calculationIdentity: identity })
  }

  if (workspace.isPending) {
    return (
      <Card>
        <CardContent>{t('Loading model pricing...')}</CardContent>
      </Card>
    )
  }
  if (workspace.isError || detail.isError) {
    return (
      <Card>
        <CardContent className='space-y-3'>
          <p role='alert'>
            {pricingLoadErrorTitle(
              workspace.isError ? workspace.error : detail.error,
              t
            )}
          </p>
          <Button
            variant='outline'
            onClick={() =>
              void (workspace.isError ? workspace.refetch() : detail.refetch())
            }
          >
            {t('Retry')}
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!selected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('Model pricing')}</CardTitle>
          <CardDescription>
            {props.initialModelId
              ? t('The requested model was not found or is unavailable.')
              : t(
                  'Choose a model to configure its provider costs and customer prices together.'
                )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant='outline' onClick={props.onBack}>
            {t('Back to model list')}
          </Button>
        </CardContent>
      </Card>
    )
  }
  if (!pricing || !labeling || initializedModelId !== pricing.model.id) {
    return (
      <Card>
        <CardContent>{t('Loading model pricing...')}</CardContent>
      </Card>
    )
  }

  const planCount = new Set(includedRows.map((row) => row.price.priceGroupId))
    .size
  const scopeCount = new Set(
    includedRows.map((row) => row.scope.parameterCombinationId)
  ).size
  let summary = t('No unpublished changes')
  if (state.unitChange) {
    summary = t(
      'Billing unit changed to {{unit}}; fill in all {{count}} prices',
      {
        unit: t(billingUnitLabelKey(billingUnit)),
        count: includedRows.length,
      }
    )
  } else if (includedRows.length && billingUnit === 'MILLION_TOKENS') {
    summary = t(
      'Publishing {{plans}} price plans ({{count}} Token category prices)',
      {
        plans: planCount,
        count: includedRows.length,
      }
    )
  } else if (includedRows.length && labeling.multiplePlans) {
    summary = t('Publishing {{count}} prices ({{scopes}} pricing scopes)', {
      count: includedRows.length,
      scopes: scopeCount,
    })
  } else if (includedRows.length) {
    summary = t('Changed {{count}} pricing scopes', { count: scopeCount })
  }

  return (
    <div className='space-y-4'>
      <FormNavigationGuard
        when={isDirty}
        title={t('Leave unpublished pricing changes?')}
        message={t(
          'The current pricing changes have not been published. They will be lost if you leave. Are you sure you want to leave?'
        )}
        confirmText={t('Discard changes and leave')}
        cancelText={t('Keep editing')}
        onDiscard={discardChanges}
      />
      {isDirty ? (
        <div
          role='status'
          className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm'
        >
          {t('Current changes have not been published.')}
        </div>
      ) : null}
      <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2'>
        <Button
          variant='outline'
          // The navigation guard asks before unpublished changes are left.
          onClick={props.onBack}
        >
          {t('Back to model list')}
        </Button>
        <h2 className='max-w-full min-w-0 text-sm font-medium break-words'>
          {tab === 'history' ? (
            t('History versions')
          ) : (
            <>
              {selected.effectiveDisplayName}
              <ModelIdentityTooltip
                effectiveDisplayName={selected.effectiveDisplayName}
                catalogDefaultName={selected.catalogDefaultName}
                modelKey={selected.modelKey}
              />
            </>
          )}
        </h2>
        <span className='text-muted-foreground text-sm'>
          {t(selected.capability, { defaultValue: t('Unknown') })}
        </span>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === 'current' || value === 'history') changeTab(value)
        }}
      >
        <CanvasManagementTabsList>
          <CanvasManagementTabsTrigger value='current'>
            {t('Current pricing')}
          </CanvasManagementTabsTrigger>
          <CanvasManagementTabsTrigger value='history'>
            {t('History versions')}
          </CanvasManagementTabsTrigger>
        </CanvasManagementTabsList>
        <TabsContent value='current' className='mt-4 space-y-3'>
          <ModelPricingUnitSummary
            model={selected}
            billingUnit={billingUnit}
            unitChosen={unitChosen}
            unitChange={
              state.unitChange && selected.billingUnitState !== 'MIXED'
            }
            pointsPerRmb={calculation?.pointIssuanceRate.pointsPerRmb}
            onUnitChange={changeBillingUnit}
          />
          {calculationFailed ? (
            <div role='alert' className='flex items-center gap-3 text-sm'>
              <span>{t('Pricing preview could not be created')}</span>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setCalculationRetry((current) => current + 1)}
              >
                {t('Retry')}
              </Button>
            </div>
          ) : null}
          {pricingChanged ? (
            <p
              role='alert'
              className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm'
            >
              {t(
                'Prices changed after you started editing. These changes cannot be published; discard them to load the latest prices.'
              )}
            </p>
          ) : null}
          <ModelPricingEditorTable
            detail={pricing}
            state={state}
            attempted={attempted}
            calculation={calculation}
            conflicts={conflictsByRow(state, conflicts)}
            onChange={changeDraft}
            onCancelSchedule={(publicationId, scopeId) =>
              setCancelTarget({ publicationId, scopeId })
            }
            reveal={reveal}
          />
        </TabsContent>
        <TabsContent value='history' className='mt-4'>
          <UnifiedModelPricingHistory
            modelId={modelId}
            detail={detail.data}
            initialPublicationId={props.initialPublicationId}
          />
        </TabsContent>
      </Tabs>
      {tab === 'current' ? (
        <PageFooterPortal>
          <ModelPricingPublishBar
            summary={summary}
            dirty={includedRows.length > 0}
            error={barError}
            effectiveMode={effectiveMode}
            scheduleDisabled={selected.billingUnitState === 'MIXED'}
            effectiveAt={effectiveAt ? new Date(effectiveAt) : undefined}
            reason={decisionSummary}
            reasonError={
              form.formState.errors.decisionSummary?.message
                ? t(form.formState.errors.decisionSummary.message)
                : undefined
            }
            publishDisabled={
              includedRows.length === 0 ||
              pricingChanged ||
              !unitChosen ||
              preview.isPending ||
              publication.isPending
            }
            onEffectiveModeChange={(mode: PricingEffectiveMode) => {
              form.setValue('effectiveMode', mode)
              invalidatePreview()
            }}
            onEffectiveAtChange={(value) => {
              form.setValue('effectiveAt', value ? value.toISOString() : '')
              invalidatePreview()
            }}
            onReasonChange={(value) => {
              form.setValue('decisionSummary', value, {
                shouldValidate: attempted,
              })
              invalidatePreview()
            }}
            onDiscard={discardChanges}
            onPublish={() => void requestPreview()}
          />
        </PageFooterPortal>
      ) : null}
      <ModelPricingPublishConfirmation
        open={confirming}
        onOpenChange={setConfirming}
        detail={pricing}
        state={state}
        labeling={labeling}
        preview={preview.data}
        effectiveMode={effectiveMode}
        effectiveAt={effectiveAt}
        reason={decisionSummary}
        pending={publication.isPending}
        onConfirm={() => {
          if (!preview.data?.canPublish || !previewId || !publishKey) return
          if (
            effectiveMode === 'SCHEDULED' &&
            new Date(effectiveAt).getTime() <= Date.now()
          ) {
            invalidatePreview()
            setBarError(
              t(
                'The scheduled time has passed. Choose a new time and preview again.'
              )
            )
            return
          }
          publication.mutate()
        }}
      />
      <ModelPricingScheduleCancelDialog
        publicationId={cancelTarget?.publicationId ?? null}
        scopeId={cancelTarget?.scopeId}
        detail={pricing}
        onClose={() => setCancelTarget(null)}
        onCancelled={() => {
          setConflicts([])
          setBarError('')
        }}
      />
    </div>
  )
}
