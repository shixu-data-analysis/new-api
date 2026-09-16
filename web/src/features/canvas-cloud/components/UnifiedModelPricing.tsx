/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table'
import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
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
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { FormNavigationGuard } from '@/features/system-settings/components/form-navigation-guard'
import { toIntlLocale } from '@/i18n/languages'
import {
  getModelPricingServerErrorMessageKey,
  getServerErrorMessageKey,
} from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  calculateCanvasModelPricingCny,
  getCanvasModelPricingModel,
  getCanvasModelPricingWorkspace,
  getCanvasPointIssuanceRates,
  previewCanvasModelPricing,
  publishCanvasModelPricing,
} from '../api'
import { pricingLoadErrorTitle } from '../model-pricing-error'
import { formatExactRmbReference } from '../point-conversion-types'
import { pricingScopeLabel as scopeLabel } from '../pricing-scope-label'
import {
  type ProviderRiskFormValues,
  providerRiskFormSchema,
} from '../provider-pricing'
import type {
  CanvasBillingUnit,
  CanvasModelPricingScope,
  CanvasModelPricingCnyScope,
  CanvasModelPricingCnyCalculation,
  CanvasModelPricingCnyCalculationIdentity,
  CanvasModelPricingDetail,
  CanvasModelPricingProviderRate,
  CanvasModelPricingPriceSnapshot,
  CanvasModelPricingTokenRateVector,
  CanvasTokenCategory,
  CanvasTokenCategoryAssumptions,
} from '../types'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import {
  CanvasManagementTabsList,
  CanvasManagementTabsTrigger,
} from './CanvasManagementTabs'
import {
  CnyPricingQuestionnaire,
  type CnyPricingDraft,
} from './CnyPricingQuestionnaire'
import { PricingActionConfirmation } from './PricingActionConfirmation'
import { PricingQuestionnaire } from './PricingQuestionnaire'
import { TokenPricingQuestionnaire } from './TokenPricingQuestionnaire'
import { UnifiedModelPricingHistory } from './UnifiedModelPricingHistory'

type PricingValidationIssue = {
  message: string
  fieldId?: string
  scopeId?: string
  planId?: string
}
type PricingAnswers = typeof emptyQuestionnaire
type PriceDraft = {
  priceGroupId: string
  sourcePriceVersionId: string | null
  action: 'KEEP' | 'SET'
  points: string
  input: string
  output: string
  cacheRead: string
  cacheWrite: string
}
type ScopeDraft = {
  combinationId: string
  costEdited: boolean
  nativeAmount: string
  currency: string
  exchangeRate: string
  exchangeSource: string
  exchangeAsOf: string
  failureChargeMode: 'NONE' | 'SAME_AS_SUCCESS' | 'FIXED'
  failureNativeAmount: string
  input: string
  output: string
  cacheRead: string
  cacheWrite: string
  prices: PriceDraft[]
}
type CnyScopeDraft = {
  provider: Record<string, string>
  customers: Record<string, Record<string, string>>
}

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
    if (
      values.effectiveMode === 'SCHEDULED' &&
      (!values.effectiveAt ||
        !Number.isFinite(new Date(values.effectiveAt).getTime()) ||
        new Date(values.effectiveAt).getTime() <= Date.now())
    ) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveAt'],
        message: 'Scheduled publication must be in the future',
      })
    }
  })
type PricingMetaValues = z.infer<typeof pricingMetaSchema>

const emptyQuestionnaire = {
  targetMarginPercent: '40',
  successProbabilityPercent: '90',
  successfulTaskCostRmb: '',
  failedUnrecoverableCostRmb: '0',
  otherVariableCostRmb: '0',
  riskBufferRmb: '0',
  evidenceRefs: [] as string[],
  proposedPoints: '',
  tokenCategoryAssumptions: {} as CanvasTokenCategoryAssumptions,
}

function editableRmb(value: string | null | undefined): string {
  if (!value || !isFixedDecimal(value)) return value ?? ''
  const [integer, fraction = ''] = value.split('.')
  const significantFraction = fraction.replace(/0+$/, '')
  return significantFraction.length > 2
    ? value
    : `${integer}.${significantFraction.padEnd(2, '0')}`
}

function questionnaireValidation(
  answers: PricingAnswers,
  includePoints: boolean,
  includeAdditionalCosts = true
): Partial<Record<keyof PricingAnswers, string>> {
  const errors: Partial<Record<keyof PricingAnswers, string>> = {}
  if (
    !isFixedDecimal(answers.successProbabilityPercent) ||
    Number(answers.successProbabilityPercent) <= 0 ||
    Number(answers.successProbabilityPercent) > 100
  ) {
    errors.successProbabilityPercent = 'Percent, above 0 and at most 100'
  }
  if (
    !/^[1-9]\d?$/.test(answers.targetMarginPercent) ||
    Number(answers.targetMarginPercent) > 99
  ) {
    errors.targetMarginPercent = 'Enter an integer percentage from 1 to 99'
  }
  if (includeAdditionalCosts && !isRmbAmount(answers.otherVariableCostRmb)) {
    errors.otherVariableCostRmb =
      'Enter a non-negative value with up to 2 decimals'
  }
  if (includeAdditionalCosts && !isRmbAmount(answers.riskBufferRmb)) {
    errors.riskBufferRmb = 'Enter a non-negative value with up to 2 decimals'
  }
  if (includePoints && !/^[1-9]\d*$/.test(answers.proposedPoints)) {
    errors.proposedPoints = 'Enter a positive integer'
  }
  return errors
}

function tokenRates(
  draft: {
    input: string
    output: string
    cacheRead: string
    cacheWrite: string
  },
  categories: CanvasTokenCategory[]
): CanvasModelPricingTokenRateVector {
  const result: CanvasModelPricingTokenRateVector = {
    input: draft.input,
    output: draft.output,
  }
  if (categories.includes('cacheRead')) result.cacheRead = draft.cacheRead
  if (categories.includes('cacheWrite')) result.cacheWrite = draft.cacheWrite
  return result
}

function cnyTokenRates(
  draft: Record<string, string>,
  categories: CanvasTokenCategory[]
): CanvasModelPricingTokenRateVector {
  const result: CanvasModelPricingTokenRateVector = {
    input: draft.input ?? '',
    output: draft.output ?? '',
  }
  if (categories.includes('cacheRead')) {
    result.cacheRead = draft.cacheRead ?? ''
  }
  if (categories.includes('cacheWrite')) {
    result.cacheWrite = draft.cacheWrite ?? ''
  }
  return result
}

function cnyCalculationDisplay(
  price:
    | CanvasModelPricingCnyCalculation['scopes'][number]['prices'][number]
    | undefined,
  providerSuccessPriceCny: CanvasModelPricingCnyScope['providerSuccessPriceCny'],
  customerPriceCny: CanvasModelPricingCnyScope['prices'][number]['customerPriceCny']
) {
  if (!price) return undefined
  return {
    providerSuccessPriceCny,
    customerPriceCny,
    actualMarginRate: price.actualMarginRate,
    fullCostCny: price.fullCostCny,
    canPublish: price.canPublish,
  }
}

function currentProviderCnyDraft(
  rate: CanvasModelPricingProviderRate | null,
  billingUnit: CanvasBillingUnit | null | undefined
): Record<string, string> {
  if (billingUnit === 'MILLION_TOKENS') {
    return rate?.normalizedTokenRates ?? {}
  }
  return rate?.normalizedAmountMinor
    ? { scalar: rate.normalizedAmountMinor }
    : {}
}

function completeCnyCalculationScopes(input: {
  detail: CanvasModelPricingDetail
  drafts: Record<string, CnyScopeDraft>
  billingUnit: CanvasBillingUnit
  currentBillingUnit: CanvasBillingUnit | null
  tokenCategories: CanvasTokenCategory[]
  activeScopeId: string
  activePriceGroupId: string
}): CanvasModelPricingCnyScope[] | null {
  const fields =
    input.billingUnit === 'MILLION_TOKENS'
      ? input.tokenCategories
      : (['scalar'] as const)
  const isUnitChange =
    input.currentBillingUnit !== null &&
    input.currentBillingUnit !== input.billingUnit
  const relevantScopes = isUnitChange
    ? input.detail.pricingScopes.filter(
        (scope) =>
          scope.enabled ||
          Boolean(scope.currentProviderRate) ||
          scope.prices.some((price) => price.current)
      )
    : input.detail.pricingScopes.filter(
        (scope) => scope.parameterCombinationId === input.activeScopeId
      )
  const scopes: CanvasModelPricingCnyScope[] = []
  for (const scope of relevantScopes) {
    const draft = input.drafts[scope.parameterCombinationId]
    const relevantPrices = scope.prices.filter((price) =>
      isUnitChange
        ? scope.enabled || Boolean(price.current)
        : Boolean(price.current) ||
          price.priceGroupId === input.activePriceGroupId
    )
    if (
      !draft?.provider ||
      !fields.every((field) =>
        isPositiveRmbAmount(draft.provider[field] ?? '')
      ) ||
      relevantPrices.some((price) => {
        const customer = draft.customers[price.priceGroupId]
        return (
          !customer ||
          !fields.every((field) => isPositiveRmbAmount(customer[field] ?? ''))
        )
      })
    ) {
      return null
    }
    scopes.push({
      parameterCombinationId: scope.parameterCombinationId,
      providerSuccessPriceCny:
        input.billingUnit === 'MILLION_TOKENS'
          ? cnyTokenRates(draft.provider, input.tokenCategories)
          : (draft.provider.scalar ?? ''),
      prices: relevantPrices.map((price) => {
        const customer = draft.customers[price.priceGroupId]
        return {
          priceGroupId: price.priceGroupId,
          ...(price.current?.id
            ? { sourcePriceVersionId: price.current.id }
            : {}),
          customerPriceCny:
            input.billingUnit === 'MILLION_TOKENS'
              ? cnyTokenRates(customer, input.tokenCategories)
              : (customer.scalar ?? ''),
        }
      }),
    })
  }
  return scopes.length > 0 ? scopes : null
}

function billingUnitLabel(
  unit: CanvasBillingUnit,
  t: (key: string) => string
): string {
  if (unit === 'REQUEST') return t('per request')
  if (unit === 'SECOND') return t('per second')
  return t('per million tokens')
}

function pricingConflictLabel(
  code: string,
  t: (key: string) => string
): string {
  const keys: Record<string, string> = {
    SCHEDULED_PRICE:
      'Cancel the scheduled customer price before publishing a new change.',
    SCHEDULED_PROVIDER_RATE:
      'Cancel the scheduled provider rate before publishing a new change.',
    LIMITED_PRICE_SPECIAL:
      'Resolve the limited-price special conflict before publishing.',
    NO_CHANGES: 'NO_CHANGES',
    PRICE_VALIDATION: 'Resolve the price validation issue before publishing.',
    BELOW_BREAK_EVEN: 'Below break-even',
    CUSTOMER_PRICE_NOT_ABOVE_COST:
      'Customer CNY price must be above the provider successful price.',
  }
  if (keys[code]) return t(keys[code])
  return t('Unknown')
}

function failureChargeLabel(
  value: 'NONE' | 'SAME_AS_SUCCESS' | 'FIXED',
  t: (key: string) => string
): string {
  if (value === 'NONE') return t('No failed-attempt cost')
  if (value === 'SAME_AS_SUCCESS') return t('Same as successful attempt')
  return t('Fixed failed-attempt cost')
}

function riskActionLabel(value: string, t: (key: string) => string): string {
  if (value === 'MANUAL_PAUSE') return t('Pause quality')
  if (value === 'TEMPORARY_LOSS') return t('Limited loss window')
  return t('Unknown')
}

export function UnifiedModelPricing(props: {
  onBack: () => void
  initialModelId?: string
  initialPublicationId?: string
  tab?: 'current' | 'set' | 'history'
  onTabChange?: (tab: 'current' | 'set' | 'history') => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage ?? i18n.language)
  const queryClient = useQueryClient()
  const workspace = useQuery({
    queryKey: ['canvas-cloud', 'model-pricing'],
    queryFn: getCanvasModelPricingWorkspace,
  })
  const [modelId, setModelId] = useState('')
  const [tab, setTab] = useState<'current' | 'set' | 'history'>(
    props.tab ?? 'current'
  )
  const [billingUnit, setBillingUnit] = useState<CanvasBillingUnit>('REQUEST')
  const [inputMode, setInputMode] = useState<'POINTS' | 'CNY'>('POINTS')
  const [pendingInputMode, setPendingInputMode] = useState<
    'POINTS' | 'CNY' | null
  >(null)
  const [cnyDrafts, setCnyDrafts] = useState<Record<string, CnyScopeDraft>>({})
  const [cnyTouched, setCnyTouched] = useState<Record<string, boolean>>({})
  const [cnyFieldErrors, setCnyFieldErrors] = useState<Record<string, string>>(
    {}
  )
  const [cnyHasEdits, setCnyHasEdits] = useState(false)
  const [activeScopeId, setActiveScopeId] = useState('')
  const [activePriceGroupId, setActivePriceGroupId] = useState('')
  const [drafts, setDrafts] = useState<ScopeDraft[]>([])
  const [questionnaires, setQuestionnaires] = useState<
    Record<string, PricingAnswers>
  >({})
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [publishIdempotencyKey, setPublishIdempotencyKey] = useState<
    string | null
  >(null)
  const [confirming, setConfirming] = useState(false)
  const [validationErrors, setValidationErrors] = useState<
    PricingValidationIssue[]
  >([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [questionnaireTouched, setQuestionnaireTouched] = useState<
    Record<string, boolean>
  >({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [publishedScopeIds, setPublishedScopeIds] = useState<string[] | null>(
    null
  )
  const [publishedPlanKeys, setPublishedPlanKeys] = useState<string[]>([])
  const [restorationError, setRestorationError] = useState(false)
  const form = useForm<PricingMetaValues>({
    resolver: zodResolver(pricingMetaSchema),
    mode: 'onTouched',
    defaultValues: {
      decisionSummary: '',
      effectiveAt: '',
      effectiveMode: 'IMMEDIATE',
    },
  })
  const riskForm = useForm<ProviderRiskFormValues>({
    resolver: zodResolver(providerRiskFormSchema),
    mode: 'onTouched',
    defaultValues: {
      decisionType: 'TEMPORARY_LOSS',
      lossEndsAt: '',
      maxExpectedLossPoints: '',
      reason: '',
    },
  })
  const decisionSummary = form.watch('decisionSummary')
  const effectiveAt = form.watch('effectiveAt')
  const effectiveMode = form.watch('effectiveMode')
  const [hasEdits, setHasEdits] = useState(false)
  const [pendingTab, setPendingTab] = useState<
    'current' | 'set' | 'history' | 'back' | null
  >(null)
  const [initializedModelId, setInitializedModelId] = useState<string | null>(
    null
  )
  const pricingRequestStateRef = useRef({
    inputMode,
    billingUnit,
    activeScopeId,
    activePriceGroupId,
    cnyDrafts,
  })
  pricingRequestStateRef.current = {
    inputMode,
    billingUnit,
    activeScopeId,
    activePriceGroupId,
    cnyDrafts,
  }

  useEffect(() => {
    if (props.initialModelId) setModelId(props.initialModelId)
  }, [props.initialModelId])
  useEffect(() => {
    if (props.tab) setTab(props.tab)
  }, [props.tab])
  const changeTab = (next: 'current' | 'set' | 'history') => {
    if (next === tab) return
    if (isDirty) {
      setPendingTab(next)
      return
    }
    if (props.onTabChange) {
      props.onTabChange(next)
      return
    }
    setTab(next)
  }
  const confirmTabChange = () => {
    if (!pendingTab) return
    discardPricingDraft()
    if (pendingTab === 'back') {
      setPendingTab(null)
      props.onBack()
      return
    }
    if (props.onTabChange) {
      props.onTabChange(pendingTab)
      setPendingTab(null)
      return
    }
    setTab(pendingTab)
    setPendingTab(null)
  }

  const cancelTabChange = () => {
    setPendingTab(null)
  }

  function discardPricingDraft() {
    previewRevision.current += 1
    setDrafts([])
    setQuestionnaires({})
    setQuestionnaireTouched({})
    setValidationErrors([])
    setFieldErrors({})
    setSubmitAttempted(false)
    setPreviewId(null)
    setPublishIdempotencyKey(null)
    setConfirming(false)
    setHasEdits(false)
    setPublishedScopeIds(null)
    setPublishedPlanKeys([])
    setCnyDrafts({})
    setCnyTouched({})
    setCnyFieldErrors({})
    setCnyHasEdits(false)
    form.reset({
      decisionSummary: '',
      effectiveAt: '',
      effectiveMode: 'IMMEDIATE',
    })
    riskForm.reset({
      decisionType: 'TEMPORARY_LOSS',
      lossEndsAt: '',
      maxExpectedLossPoints: '',
      reason: '',
    })
    preview.reset()
    publication.reset()
    setInitializedModelId(null)
  }

  const questionnaireKey = `${activeScopeId}:${activePriceGroupId}`
  const questionnaire = questionnaires[questionnaireKey] ?? emptyQuestionnaire
  const activeCnyScope = cnyDrafts[activeScopeId]
  const cnyDraft: CnyPricingDraft = {
    provider: activeCnyScope?.provider ?? { scalar: '' },
    customer: activeCnyScope?.customers[activePriceGroupId] ?? { scalar: '' },
  }
  const setQuestionnaire = (
    update: (current: PricingAnswers) => PricingAnswers
  ) => {
    setQuestionnaires((current) => ({
      ...current,
      [questionnaireKey]: update(
        current[questionnaireKey] ?? emptyQuestionnaire
      ),
    }))
  }

  const workspaceSelected = useMemo(
    () => workspace.data?.models.find((model) => model.id === modelId) ?? null,
    [modelId, workspace.data?.models]
  )
  const detail = useQuery({
    queryKey: ['canvas-cloud', 'model-pricing', modelId, 'detail'],
    queryFn: () => getCanvasModelPricingModel(modelId),
    enabled: Boolean(modelId),
  })
  const selected = workspaceSelected ?? detail.data?.model ?? null
  const issuanceRates = useQuery({
    queryKey: ['canvas-cloud', 'point-issuance-rates'],
    queryFn: getCanvasPointIssuanceRates,
  })
  useEffect(() => {
    if (
      !selected ||
      !detail.data ||
      initializedModelId === detail.data.model.id
    ) {
      return
    }
    setInitializedModelId(detail.data.model.id)
    setBillingUnit(
      selected.billingUnit ?? selected.allowedBillingUnits[0] ?? 'REQUEST'
    )
    setDrafts((currentDrafts) =>
      detail.data.pricingScopes.map((scope): ScopeDraft => {
        const restoredProvider = scope.prices.find(
          (price) => price.current?.originalInput?.inputMode === 'POINTS'
        )?.current?.originalInput
        let restoredNativeAmount = editableRmb(
          scope.currentProviderRate?.normalizedAmountMinor
        )
        if (restoredProvider?.inputMode === 'POINTS') {
          restoredNativeAmount = restoredProvider.providerRate.nativeAmount
        }
        if (selected.billingUnit === 'MILLION_TOKENS') {
          restoredNativeAmount = '0'
        }
        const restoredFailurePolicy =
          restoredProvider?.inputMode === 'POINTS'
            ? restoredProvider.providerRate.failureChargePolicy
            : scope.currentProviderRate?.failureChargePolicy
        const restoredFailureAmount =
          restoredFailurePolicy?.mode === 'FIXED'
            ? editableRmb(
                'normalizedAmountMinor' in restoredFailurePolicy
                  ? restoredFailurePolicy.normalizedAmountMinor
                  : restoredFailurePolicy.nativeAmount
              )
            : ''
        const retained = publishedScopeIds?.includes(
          scope.parameterCombinationId
        )
          ? undefined
          : currentDrafts.find(
              (draft) => draft.combinationId === scope.parameterCombinationId
            )
        if (retained) return retained
        return {
          combinationId: scope.parameterCombinationId,
          costEdited: false,
          nativeAmount: restoredNativeAmount,
          // New publications are RMB-only. Existing original-currency facts remain
          // available in history, but must never be silently reused as an RMB edit.
          currency: 'CNY',
          exchangeRate: '1',
          exchangeSource: 'manual',
          exchangeAsOf: new Date().toISOString(),
          failureChargeMode: restoredFailurePolicy?.mode ?? 'NONE',
          failureNativeAmount: restoredFailureAmount,
          input: editableRmb(
            restoredProvider?.inputMode === 'POINTS'
              ? restoredProvider.providerRate.tokenRates?.input
              : scope.currentProviderRate?.normalizedTokenRates?.input
          ),
          output: editableRmb(
            scope.currentProviderRate?.normalizedTokenRates?.output
          ),
          cacheRead: editableRmb(
            scope.currentProviderRate?.normalizedTokenRates?.cacheRead
          ),
          cacheWrite: editableRmb(
            scope.currentProviderRate?.normalizedTokenRates?.cacheWrite
          ),
          prices: scope.prices.map((price) => ({
            priceGroupId: price.priceGroupId,
            sourcePriceVersionId: price.current?.id ?? null,
            action: price.current ? 'KEEP' : 'SET',
            points: price.current?.points ?? '',
            input: price.current?.tokenRates?.input ?? '',
            output: price.current?.tokenRates?.output ?? '',
            cacheRead: price.current?.tokenRates?.cacheRead ?? '',
            cacheWrite: price.current?.tokenRates?.cacheWrite ?? '',
            ...(!publishedPlanKeys.includes(
              `${scope.parameterCombinationId}:${price.priceGroupId}`
            )
              ? currentDrafts
                  .find(
                    (draft) =>
                      draft.combinationId === scope.parameterCombinationId
                  )
                  ?.prices.find(
                    (draft) => draft.priceGroupId === price.priceGroupId
                  )
              : undefined),
          })),
        }
      })
    )
    const initialQuestionnaires = Object.fromEntries(
      detail.data.pricingScopes.flatMap((scope) =>
        scope.prices.map((price) => {
          const current = price.current
          const restored =
            current?.originalInput?.inputMode === 'POINTS'
              ? current.originalInput
              : null
          return [
            `${scope.parameterCombinationId}:${price.priceGroupId}`,
            current && current.inputMode !== 'CNY'
              ? {
                  targetMarginPercent: String(
                    Number(
                      restored?.targetMarginRate ??
                        current.questionnaire.targetMarginRate
                    ) * 100
                  ),
                  successProbabilityPercent: String(
                    Number(
                      restored?.successProbability ??
                        current.questionnaire.successProbability
                    ) * 100
                  ),
                  successfulTaskCostRmb:
                    current.questionnaire.successfulTaskCostRmb ?? '',
                  failedUnrecoverableCostRmb:
                    current.questionnaire.failedUnrecoverableCostRmb ?? '',
                  otherVariableCostRmb: editableRmb(
                    restored?.otherVariableCostRmb ??
                      current.questionnaire.otherVariableCostRmb
                  ),
                  riskBufferRmb: editableRmb(
                    restored?.riskBufferRmb ??
                      current.questionnaire.riskBufferRmb
                  ),
                  evidenceRefs: current.questionnaire.evidenceRefs,
                  proposedPoints: restored?.points ?? current.points,
                  tokenCategoryAssumptions:
                    restored?.tokenCategoryAssumptions ??
                    current.questionnaire.tokenCategoryAssumptions ??
                    {},
                }
              : emptyQuestionnaire,
          ]
        })
      )
    )
    setQuestionnaires((current) =>
      Object.fromEntries(
        Object.entries(initialQuestionnaires).map(([key, value]) => {
          return [
            key,
            publishedPlanKeys.includes(key) ? value : (current[key] ?? value),
          ]
        })
      )
    )
    setCnyDrafts(
      Object.fromEntries(
        detail.data.pricingScopes.map((scope) => {
          const cnyInputs = scope.prices.flatMap((price) =>
            price.current?.originalInput?.inputMode === 'CNY'
              ? [[price.priceGroupId, price.current.originalInput] as const]
              : []
          )
          const provider = cnyInputs[0]?.[1].providerSuccessPriceCny
          let providerDraft: Record<string, string> = {}
          if (provider) {
            providerDraft =
              typeof provider === 'string' ? { scalar: provider } : provider
          } else if (
            !scope.enabled &&
            !scope.prices.some((price) => price.current)
          ) {
            providerDraft = currentProviderCnyDraft(
              scope.currentProviderRate,
              scope.currentProviderRate?.billingUnit
            )
          }
          return [
            scope.parameterCombinationId,
            {
              provider: providerDraft,
              customers: Object.fromEntries(
                cnyInputs.map(([priceGroupId, input]) => [
                  priceGroupId,
                  typeof input.customerPriceCny === 'string'
                    ? { scalar: input.customerPriceCny }
                    : input.customerPriceCny,
                ])
              ),
            },
          ]
        })
      )
    )
    setPublishedScopeIds(null)
    setPreviewId(null)
    setPublishIdempotencyKey(null)
    setValidationErrors([])
    setSubmitAttempted(false)
    form.reset({
      decisionSummary: '',
      effectiveAt: '',
      effectiveMode: 'IMMEDIATE',
    })
    setHasEdits(false)
    setActiveScopeId(
      detail.data.pricingScopes.find((scope) => scope.enabled)
        ?.parameterCombinationId ??
        detail.data.pricingScopes[0]?.parameterCombinationId ??
        ''
    )
    setActivePriceGroupId(detail.data.priceGroups[0]?.id ?? '')
  }, [
    detail.data,
    form,
    initializedModelId,
    selected,
    publishedPlanKeys,
    publishedScopeIds,
  ])

  useEffect(() => {
    if (!detail.data || !activeScopeId || !activePriceGroupId) return
    const current = detail.data.pricingScopes
      .find((scope) => scope.parameterCombinationId === activeScopeId)
      ?.prices.find(
        (price) => price.priceGroupId === activePriceGroupId
      )?.current
    if (!current) {
      setRestorationError(false)
      if (!hasEdits && !cnyHasEdits) setInputMode('POINTS')
      return
    }
    if (current.inputMode !== 'POINTS' && current.inputMode !== 'CNY') {
      setRestorationError(true)
      return
    }
    if (hasEdits || cnyHasEdits) {
      setRestorationError(false)
      return
    }
    setInputMode(current.inputMode)
    setRestorationError(Boolean(current.restorationError))
    if (current.restorationError || !current.originalInput) return
    if (current.originalInput.inputMode === 'CNY') {
      const original = current.originalInput
      setCnyDrafts((drafts) => ({
        ...drafts,
        [activeScopeId]: {
          provider:
            typeof original.providerSuccessPriceCny === 'string'
              ? { scalar: original.providerSuccessPriceCny }
              : original.providerSuccessPriceCny,
          customers: {
            ...drafts[activeScopeId]?.customers,
            [activePriceGroupId]:
              typeof original.customerPriceCny === 'string'
                ? { scalar: original.customerPriceCny }
                : original.customerPriceCny,
          },
        },
      }))
      setDrafts((drafts) =>
        drafts.map((scope) =>
          scope.combinationId === activeScopeId
            ? {
                ...scope,
                nativeAmount: '',
                input: '',
                output: '',
                cacheRead: '',
                cacheWrite: '',
                failureNativeAmount: '',
                prices: scope.prices.map((price) =>
                  price.priceGroupId === activePriceGroupId
                    ? {
                        ...price,
                        points: '',
                        input: '',
                        output: '',
                        cacheRead: '',
                        cacheWrite: '',
                      }
                    : price
                ),
              }
            : scope
        )
      )
      return
    }
    const original = current.originalInput
    setDrafts((drafts) =>
      drafts.map((scope) =>
        scope.combinationId === activeScopeId
          ? {
              ...scope,
              nativeAmount: original.providerRate.nativeAmount,
              currency: original.providerRate.currency,
              exchangeRate: original.providerRate.exchangeRateSnapshot.rate,
              exchangeSource: original.providerRate.exchangeRateSnapshot.source,
              exchangeAsOf: original.providerRate.exchangeRateSnapshot.asOf,
              failureChargeMode: original.providerRate.failureChargePolicy.mode,
              failureNativeAmount:
                original.providerRate.failureChargePolicy.mode === 'FIXED'
                  ? original.providerRate.failureChargePolicy.nativeAmount
                  : '',
              input: original.providerRate.tokenRates?.input ?? '',
              output: original.providerRate.tokenRates?.output ?? '',
              cacheRead: original.providerRate.tokenRates?.cacheRead ?? '',
              cacheWrite: original.providerRate.tokenRates?.cacheWrite ?? '',
              prices: scope.prices.map((price) =>
                price.priceGroupId === activePriceGroupId
                  ? {
                      ...price,
                      points: original.points,
                      input: original.tokenRates?.input ?? '',
                      output: original.tokenRates?.output ?? '',
                      cacheRead: original.tokenRates?.cacheRead ?? '',
                      cacheWrite: original.tokenRates?.cacheWrite ?? '',
                    }
                  : price
              ),
            }
          : scope
      )
    )
    setCnyDrafts((drafts) => ({
      ...drafts,
      [activeScopeId]: {
        provider: {},
        customers: {
          ...drafts[activeScopeId]?.customers,
          [activePriceGroupId]: {},
        },
      },
    }))
  }, [activePriceGroupId, activeScopeId, cnyHasEdits, detail.data, hasEdits])

  const previewRevision = useRef(0)
  const cnyCalculationRevision = useRef(0)
  const [latestCnyCalculation, setLatestCnyCalculation] =
    useState<CanvasModelPricingCnyCalculation | null>(null)
  const [cnyRetryRevision, setCnyRetryRevision] = useState(0)
  const [cnyCalculationError, setCnyCalculationError] = useState(false)
  const cnyCalculation = useMutation({
    mutationFn: (input: {
      revision: number
      scopes: CanvasModelPricingCnyScope[]
    }) =>
      calculateCanvasModelPricingCny({
        customerModelId: modelId,
        billingUnit,
        scopes: input.scopes,
      }),
    onMutate: () => setCnyCalculationError(false),
    onSuccess: (result, input) => {
      if (input.revision !== cnyCalculationRevision.current) return
      setLatestCnyCalculation(result)
      setCnyFieldErrors(
        Object.fromEntries(
          result.fieldErrors.flatMap((error) =>
            (error.tokenCategories ?? ['scalar']).map((category) => [
              `${error.parameterCombinationId}:${error.priceGroupId}:customer:${category}`,
              t(
                'Customer CNY price must be above the provider successful price.'
              ),
            ])
          )
        )
      )
    },
    onError: (_error, input) => {
      if (input.revision !== cnyCalculationRevision.current) return
      setCnyCalculationError(true)
    },
  })
  const calculateCny = cnyCalculation.mutate
  useEffect(() => {
    cnyCalculationRevision.current += 1
    setLatestCnyCalculation(null)
    setCnyCalculationError(false)
    if (
      inputMode !== 'CNY' ||
      !selected ||
      !detail.data ||
      !activeScopeId ||
      !activePriceGroupId
    ) {
      return
    }
    const scopes = completeCnyCalculationScopes({
      detail: detail.data,
      drafts: cnyDrafts,
      billingUnit,
      currentBillingUnit: selected.billingUnit,
      tokenCategories: selected.tokenCategories,
      activeScopeId,
      activePriceGroupId,
    })
    if (!scopes) return
    const revision = cnyCalculationRevision.current
    const timeout = window.setTimeout(() => {
      calculateCny({
        revision,
        scopes,
      })
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [
    activePriceGroupId,
    activeScopeId,
    billingUnit,
    calculateCny,
    cnyDrafts,
    detail.data,
    inputMode,
    selected,
    cnyRetryRevision,
  ])
  const preview = useMutation({
    mutationFn: ({
      scopes,
      costRiskResolution,
      calculationIdentity,
    }: {
      scopes: CanvasModelPricingScope[] | CanvasModelPricingCnyScope[]
      revision: number
      calculationIdentity?: CanvasModelPricingCnyCalculationIdentity
      costRiskResolution?:
        | {
            type: 'TEMPORARY_LOSS'
            lossEndsAt: string
            maxExpectedLossPoints: string
            reason: string
          }
        | { type: 'MANUAL_PAUSE'; reason: string }
    }) => {
      const common = {
        customerModelId: modelId,
        billingUnit,
        effectiveMode,
        ...(effectiveMode === 'SCHEDULED'
          ? { effectiveAt: new Date(effectiveAt).toISOString() }
          : {}),
        decisionSummary: decisionSummary.trim(),
      }
      if (inputMode === 'CNY') {
        if (!calculationIdentity) {
          return Promise.reject(new Error('CNY calculation is required'))
        }
        return previewCanvasModelPricing({
          ...common,
          inputMode: 'CNY',
          calculationIdentity,
          scopes: scopes as CanvasModelPricingCnyScope[],
        })
      }
      return previewCanvasModelPricing({
        ...common,
        inputMode: 'POINTS',
        scopes: scopes as CanvasModelPricingScope[],
        costRiskResolution,
      })
    },
    onSuccess: (result, variables) => {
      if (variables.revision !== previewRevision.current) return
      setPreviewId(result.id)
      setPublishIdempotencyKey(`web-model-pricing-${crypto.randomUUID()}`)
      setConfirming(true)
    },
    onError: (error, variables) => {
      if (variables.revision === previewRevision.current) {
        const pricingField = cnyPricingFailureField(error)
        if (inputMode === 'CNY' && pricingField) {
          const key = `${pricingField.parameterCombinationId}:${pricingField.priceGroupId}:customer:${pricingField.tokenCategory ?? 'scalar'}`
          setCnyFieldErrors((current) => ({
            ...current,
            [key]: t(
              'This CNY price cannot be converted to an exact point value. Adjust the price.'
            ),
          }))
          setCnyTouched((current) => ({ ...current, [key]: true }))
          setActiveScopeId(pricingField.parameterCombinationId)
          setActivePriceGroupId(pricingField.priceGroupId)
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>(
                `[id="cny-pricing-${pricingField.parameterCombinationId}-${pricingField.priceGroupId}-customer${pricingField.tokenCategory ? `-${pricingField.tokenCategory}` : ''}"]`
              )
              ?.focus()
          })
          return
        }
        if (inputMode === 'CNY') {
          setLatestCnyCalculation(null)
          setCnyRetryRevision((current) => current + 1)
        }
        toast.error(
          t(
            getServerErrorMessageKey(error) ??
              'Pricing preview could not be created'
          )
        )
      }
    },
  })
  const publication = useMutation({
    mutationFn: () =>
      publishCanvasModelPricing(previewId ?? '', publishIdempotencyKey ?? ''),
    onSuccess: async () => {
      const publishedPreview = preview.data
      setConfirming(false)
      setPreviewId(null)
      setPublishIdempotencyKey(null)
      setHasEdits(false)
      if (publishedPreview?.inputMode === 'CNY') {
        setLatestCnyCalculation(null)
        setCnyRetryRevision(0)
        setCnyDrafts({})
        setCnyTouched({})
        setCnyFieldErrors({})
        setCnyHasEdits(false)
      }
      form.reset({
        decisionSummary: '',
        effectiveAt: '',
        effectiveMode: 'IMMEDIATE',
      })
      setTab('set')
      props.onTabChange?.('set')
      toast.success(t('Model pricing published'))
      const changedScopeIds =
        publishedPreview?.scopes.map((scope) => scope.parameterCombinationId) ??
        []
      setPublishedScopeIds(changedScopeIds)
      const submittedPlanKeys =
        publishedPreview?.scopes.flatMap((scope) =>
          scope.prices.map(
            (price) => `${scope.parameterCombinationId}:${price.priceGroupId}`
          )
        ) ?? []
      setPublishedPlanKeys(submittedPlanKeys)
      preview.reset()
      publication.reset()
      await detail.refetch()
      setInitializedModelId(null)
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

  function invalidatePreview(options?: { keepConfirmation?: boolean }) {
    previewRevision.current += 1
    setPreviewId(null)
    setPublishIdempotencyKey(null)
    if (!options?.keepConfirmation) setConfirming(false)
  }

  useEffect(() => {
    if (!detail.data || !activeScopeId || !activePriceGroupId) return
    const price = detail.data.pricingScopes
      .find((scope) => scope.parameterCombinationId === activeScopeId)
      ?.prices.find((item) => item.priceGroupId === activePriceGroupId)?.current
    if (!price) return
  }, [activePriceGroupId, activeScopeId, detail.data])

  function updateScope(
    index: number,
    key: Exclude<keyof ScopeDraft, 'combinationId' | 'prices' | 'costEdited'>,
    value: string
  ) {
    setHasEdits(true)
    invalidatePreview()
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[`${index}:${key}`]
      if (key === 'failureChargeMode') {
        delete next[`${index}:failureNativeAmount`]
      }
      return next
    })
    setDrafts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, costEdited: true, [key]: value } : item
      )
    )
  }
  function updatePrice(
    scopeIndex: number,
    priceIndex: number,
    key: Exclude<keyof PriceDraft, 'priceGroupId'>,
    value: string
  ) {
    setHasEdits(true)
    invalidatePreview()
    setDrafts((current) =>
      current.map((scope, itemIndex) =>
        itemIndex === scopeIndex
          ? {
              ...scope,
              prices: scope.prices.map((price, priceItemIndex) =>
                priceItemIndex === priceIndex
                  ? { ...price, action: 'SET', [key]: value }
                  : price
              ),
            }
          : scope
      )
    )
  }
  function updateTokenAssumption(
    category: CanvasTokenCategory,
    field: 'otherVariableCostRmb' | 'riskBufferRmb',
    value: string
  ) {
    setHasEdits(true)
    invalidatePreview()
    setQuestionnaire((current) => ({
      ...current,
      tokenCategoryAssumptions: {
        ...current.tokenCategoryAssumptions,
        [category]: {
          otherVariableCostRmb: '',
          riskBufferRmb: '',
          ...current.tokenCategoryAssumptions[category],
          [field]: value,
        },
      },
    }))
    const scopeIndex = drafts.findIndex(
      (scope) => scope.combinationId === activeScopeId
    )
    const priceIndex =
      drafts[scopeIndex]?.prices.findIndex(
        (price) => price.priceGroupId === activePriceGroupId
      ) ?? -1
    if (scopeIndex >= 0 && priceIndex >= 0) {
      updatePrice(scopeIndex, priceIndex, 'action', 'SET')
    }
  }
  const isDirty = Boolean(
    drafts.length &&
    (decisionSummary.trim() ||
      effectiveMode === 'SCHEDULED' ||
      billingUnit !==
        (selected?.billingUnit ?? selected?.allowedBillingUnits[0]) ||
      (inputMode === 'POINTS' ? hasEdits : cnyHasEdits))
  )

  function switchInputMode(next: 'POINTS' | 'CNY') {
    if (next === inputMode) return
    if (isDirty) {
      setPendingInputMode(next)
      return
    }
    setInputMode(next)
    form.reset({
      decisionSummary: '',
      effectiveAt: '',
      effectiveMode: 'IMMEDIATE',
    })
    setSubmitAttempted(false)
    setValidationErrors([])
    invalidatePreview()
  }

  function confirmInputModeChange() {
    if (!pendingInputMode) return
    if (inputMode === 'POINTS') {
      setHasEdits(false)
      setDrafts([])
      setQuestionnaires({})
      setQuestionnaireTouched({})
      setInitializedModelId(null)
    } else {
      setCnyDrafts({})
      setCnyTouched({})
      setCnyFieldErrors({})
      setCnyHasEdits(false)
    }
    setInputMode(pendingInputMode)
    setPendingInputMode(null)
    form.reset({
      decisionSummary: '',
      effectiveAt: '',
      effectiveMode: 'IMMEDIATE',
    })
    setSubmitAttempted(false)
    setValidationErrors([])
    invalidatePreview()
  }

  function handleBillingUnitChange(next: CanvasBillingUnit) {
    if (next === billingUnit) return
    setBillingUnit(next)
    invalidatePreview()
    setValidationErrors([])
    setHasEdits(true)
    setCnyDrafts(
      Object.fromEntries(
        (detail.data?.pricingScopes ?? [])
          .filter(
            (scope) =>
              !scope.enabled &&
              scope.currentProviderRate &&
              !scope.prices.some((price) => price.current)
          )
          .map((scope) => {
            return [
              scope.parameterCombinationId,
              {
                provider: currentProviderCnyDraft(
                  scope.currentProviderRate,
                  next
                ),
                customers: {},
              },
            ]
          })
      )
    )
    setCnyTouched({})
    setCnyFieldErrors({})
    setCnyHasEdits(inputMode === 'CNY')
    setQuestionnaires((current) =>
      Object.fromEntries(
        Object.entries(current).map(([key, answers]) => [
          key,
          { ...answers, proposedPoints: '', tokenCategoryAssumptions: {} },
        ])
      )
    )
    setDrafts((current) =>
      current.map((scope) => ({
        ...scope,
        nativeAmount: '',
        failureNativeAmount: '',
        input: '',
        output: '',
        cacheRead: '',
        cacheWrite: '',
        prices: scope.prices.map((price) => ({
          ...price,
          action: 'SET',
          points: '',
          input: '',
          output: '',
          cacheRead: '',
          cacheWrite: '',
        })),
      }))
    )
  }

  function validatePricingDrafts(includePrices: boolean) {
    if (!selected || !detail.data) {
      return {
        errors: [t('Select a pricing scope')],
        summaryErrors: [{ message: t('Select a pricing scope') }],
        inputErrors: {} as Record<string, string>,
        isUnitChange: false,
        draftsToSubmit: [] as ScopeDraft[],
      }
    }
    const errors: string[] = []
    const inputErrors: Record<string, string> = {}
    const costSummaryErrors: PricingValidationIssue[] = []
    const fieldIssues: PricingValidationIssue[] = []
    const isUnitChange =
      selected.billingUnit !== null && billingUnit !== selected.billingUnit
    const draftsToSubmit = isUnitChange
      ? drafts
      : drafts.filter((draft) => draft.combinationId === activeScopeId)
    if (!draftsToSubmit.length) errors.push(t('Select a pricing scope'))
    for (const draft of draftsToSubmit) {
      const scope = detail.data.pricingScopes.find(
        (item) => item.parameterCombinationId === draft.combinationId
      )
      const scopeName = scope
        ? scopeLabel(
            { key: scope.combinationKey, parameters: scope.parameters },
            t
          )
        : t('Unknown scope')
      const scopeIndex = drafts.findIndex(
        (candidate) => candidate.combinationId === draft.combinationId
      )
      const keepCost =
        !isUnitChange &&
        !draft.costEdited &&
        Boolean(scope?.currentProviderRate)
      if (!keepCost && billingUnit !== 'MILLION_TOKENS') {
        const error = amountError(draft.nativeAmount, 'successful', t)
        if (error) {
          inputErrors[`${scopeIndex}:nativeAmount`] = error
          costSummaryErrors.push({
            message: `${scopeName}: ${error}`,
            fieldId: `provider-cost-${draft.combinationId}`,
          })
        }
      }
      if (
        !keepCost &&
        billingUnit === 'MILLION_TOKENS' &&
        !selected.tokenCategories.every((category) =>
          isRmbAmount(draft[category])
        )
      ) {
        const message = `${scopeName}: ${t('Enter every required token rate')}`
        errors.push(message)
        fieldIssues.push({
          message,
          scopeId: draft.combinationId,
          fieldId: `provider-${draft.combinationId}-${selected.tokenCategories.find((category) => !isRmbAmount(draft[category]))}`,
        })
      }
      if (!keepCost && draft.failureChargeMode === 'FIXED') {
        const error = amountError(draft.failureNativeAmount, 'failed', t)
        if (error) {
          inputErrors[`${scopeIndex}:failureNativeAmount`] = error
          costSummaryErrors.push({
            message: `${scopeName}: ${error}`,
            fieldId: `failure-cost-${draft.combinationId}`,
          })
        }
      }
      if (
        !keepCost &&
        billingUnit === 'MILLION_TOKENS' &&
        draft.failureChargeMode === 'FIXED'
      ) {
        errors.push(
          `${scopeName}: ${t('Token pricing does not support a fixed failed-attempt cost')}`
        )
      }
      for (const price of draft.prices.filter((candidate) => {
        const current = scope?.prices.find(
          (item) => item.priceGroupId === candidate.priceGroupId
        )?.current
        if (isUnitChange) return scope?.enabled !== false || Boolean(current)
        return (
          (!keepCost && Boolean(current)) ||
          candidate.priceGroupId === activePriceGroupId
        )
      })) {
        const current = scope?.prices.find(
          (item) => item.priceGroupId === price.priceGroupId
        )?.current
        const planName =
          scope?.prices.find((item) => item.priceGroupId === price.priceGroupId)
            ?.priceGroupName ?? t('Price plan')
        if (!isUnitChange && price.action === 'KEEP' && current) {
          if (
            !keepCost &&
            billingUnit === 'MILLION_TOKENS' &&
            !selected.tokenCategories.every(
              (category) =>
                current.questionnaire.tokenCategoryAssumptions?.[category]
            )
          ) {
            errors.push(
              `${scopeName} · ${planName}: ${t('Complete each Token category cost assumption before keeping its price after a provider cost change.')}`
            )
          }
          continue
        }
        const answers =
          questionnaires[`${draft.combinationId}:${price.priceGroupId}`] ??
          emptyQuestionnaire
        for (const [field, message] of Object.entries(
          questionnaireValidation(
            { ...answers, proposedPoints: price.points },
            includePrices && billingUnit !== 'MILLION_TOKENS',
            billingUnit !== 'MILLION_TOKENS'
          )
        )) {
          const label = `${scopeName} · ${planName}: ${t(message)}`
          errors.push(label)
          const fieldSuffixes: Record<string, string> = {
            successProbabilityPercent: 'success-rate',
            otherVariableCostRmb: 'other-cost',
            riskBufferRmb: 'risk-buffer',
            targetMarginPercent: 'target-margin',
            proposedPoints: 'proposed-points',
          }
          const fieldSuffix = fieldSuffixes[field]
          fieldIssues.push({
            message: label,
            scopeId: draft.combinationId,
            planId: price.priceGroupId,
            fieldId:
              field === 'proposedPoints'
                ? `model-pricing-price-${draft.combinationId}-${price.priceGroupId}-proposed-points`
                : `model-pricing-${fieldSuffix}`,
          })
        }
        if (billingUnit === 'MILLION_TOKENS') {
          for (const category of selected.tokenCategories) {
            const values = answers.tokenCategoryAssumptions[category]
            if (
              !values ||
              !isRmbAmount(values.otherVariableCostRmb) ||
              !isRmbAmount(values.riskBufferRmb)
            ) {
              const message = `${scopeName} · ${planName} · ${t(category)}: ${t('Enter the additional cost and risk buffer for this Token category.')}`
              errors.push(message)
              fieldIssues.push({
                message,
                scopeId: draft.combinationId,
                planId: price.priceGroupId,
                fieldId: `token-basis-${draft.combinationId}-${price.priceGroupId}-token-${!values || !isRmbAmount(values.otherVariableCostRmb) ? 'other' : 'buffer'}-${category}`,
              })
            }
          }
        }
        if (!includePrices) continue
        if (billingUnit === 'MILLION_TOKENS') {
          if (!hasRequiredTokenRates(price, selected.tokenCategories)) {
            const message = `${scopeName}: ${t('Enter every required customer token rate')}`
            errors.push(message)
            fieldIssues.push({
              message,
              scopeId: draft.combinationId,
              planId: price.priceGroupId,
              fieldId: `token-price-${draft.combinationId}-${price.priceGroupId}-token-rate-${selected.tokenCategories.find((category) => !isFixedDecimal(price[category]))}`,
            })
          }
        } else if (!isNonnegativeInteger(price.points)) {
          errors.push(`${scopeName}: ${t('Enter a positive customer price')}`)
        }
      }
    }
    const summaryErrors: PricingValidationIssue[] = errors.map(
      (message) =>
        fieldIssues.find((issue) => issue.message === message) ?? { message }
    )
    if (costSummaryErrors.length > 1 || summaryErrors.length > 0) {
      summaryErrors.push(...costSummaryErrors)
    }
    return {
      errors: [...errors, ...costSummaryErrors.map(({ message }) => message)],
      summaryErrors,
      inputErrors,
      firstIssue: costSummaryErrors[0] ?? fieldIssues[0],
      isUnitChange,
      draftsToSubmit,
    }
  }

  function focusPricingIssue(issue?: PricingValidationIssue) {
    if (issue?.scopeId) setActiveScopeId(issue.scopeId)
    if (issue?.planId) setActivePriceGroupId(issue.planId)
    requestAnimationFrame(() => {
      const field = issue?.fieldId
        ? document.querySelector<HTMLElement>(`[id="${issue.fieldId}"]`)
        : document.querySelector<HTMLElement>('[aria-invalid="true"]')
      field?.focus()
      field?.scrollIntoView?.({ block: 'nearest' })
    })
  }

  async function requestPreview(includeRiskResolution = false) {
    if (!selected || !detail.data) return
    const draftRevision = previewRevision.current
    setSubmitAttempted(true)
    const formValid = await form.trigger()
    const meta = form.getValues()
    if (inputMode === 'CNY') {
      const currentRequestState = pricingRequestStateRef.current
      if (
        draftRevision !== previewRevision.current ||
        currentRequestState.inputMode !== 'CNY' ||
        currentRequestState.billingUnit !== billingUnit ||
        currentRequestState.activeScopeId !== activeScopeId ||
        currentRequestState.activePriceGroupId !== activePriceGroupId ||
        currentRequestState.cnyDrafts !== cnyDrafts
      ) {
        return
      }
      const fields =
        billingUnit === 'MILLION_TOKENS'
          ? selected.tokenCategories
          : (['scalar'] as const)
      const isUnitChange =
        selected.billingUnit !== null && selected.billingUnit !== billingUnit
      const relevantScopes = isUnitChange
        ? detail.data.pricingScopes.filter(
            (scope) =>
              scope.enabled ||
              Boolean(scope.currentProviderRate) ||
              scope.prices.some((price) => price.current)
          )
        : detail.data.pricingScopes.filter(
            (scope) => scope.parameterCombinationId === activeScopeId
          )
      const issues: PricingValidationIssue[] = []
      const touched: Record<string, boolean> = {}
      const scopes: CanvasModelPricingCnyScope[] = relevantScopes.map(
        (scope) => {
          const scopeDraft = cnyDrafts[scope.parameterCombinationId] ?? {
            provider: {},
            customers: {},
          }
          const relevantPrices = scope.prices.filter((price) => {
            if (isUnitChange) return scope.enabled || Boolean(price.current)
            return (
              Boolean(price.current) ||
              price.priceGroupId === activePriceGroupId
            )
          })
          for (const field of fields) {
            if (!isPositiveRmbAmount(scopeDraft.provider[field] ?? '')) {
              const groupId =
                relevantPrices[0]?.priceGroupId ?? activePriceGroupId
              touched[
                `${scope.parameterCombinationId}:${groupId}:provider:${field}`
              ] = true
              issues.push({
                message: t('Enter an amount above 0 with up to 2 decimals'),
                scopeId: scope.parameterCombinationId,
                planId: groupId,
                fieldId: `cny-pricing-${scope.parameterCombinationId}-${groupId}-provider${field === 'scalar' ? '' : `-${field}`}`,
              })
            }
          }
          return {
            parameterCombinationId: scope.parameterCombinationId,
            providerSuccessPriceCny:
              billingUnit === 'MILLION_TOKENS'
                ? cnyTokenRates(scopeDraft.provider, selected.tokenCategories)
                : (scopeDraft.provider.scalar ?? ''),
            prices: relevantPrices.map((price) => {
              const customer = scopeDraft.customers[price.priceGroupId] ?? {}
              for (const field of fields) {
                if (!isPositiveRmbAmount(customer[field] ?? '')) {
                  touched[
                    `${scope.parameterCombinationId}:${price.priceGroupId}:customer:${field}`
                  ] = true
                  issues.push({
                    message: t('Enter an amount above 0 with up to 2 decimals'),
                    scopeId: scope.parameterCombinationId,
                    planId: price.priceGroupId,
                    fieldId: `cny-pricing-${scope.parameterCombinationId}-${price.priceGroupId}-customer${field === 'scalar' ? '' : `-${field}`}`,
                  })
                }
              }
              return {
                priceGroupId: price.priceGroupId,
                ...(price.current?.id
                  ? { sourcePriceVersionId: price.current.id }
                  : {}),
                customerPriceCny:
                  billingUnit === 'MILLION_TOKENS'
                    ? cnyTokenRates(customer, selected.tokenCategories)
                    : (customer.scalar ?? ''),
              }
            }),
          }
        }
      )
      setCnyTouched((current) => ({ ...current, ...touched }))
      if (!formValid || issues.length > 0) {
        setValidationErrors(issues)
        focusPricingIssue(issues[0])
        return
      }
      const readyRequestState = pricingRequestStateRef.current
      if (
        draftRevision !== previewRevision.current ||
        readyRequestState.inputMode !== 'CNY' ||
        readyRequestState.billingUnit !== billingUnit ||
        readyRequestState.activeScopeId !== activeScopeId ||
        readyRequestState.activePriceGroupId !== activePriceGroupId ||
        readyRequestState.cnyDrafts !== cnyDrafts
      ) {
        return
      }
      setValidationErrors([])
      let currentCalculation: CanvasModelPricingCnyCalculation
      try {
        currentCalculation = await calculateCanvasModelPricingCny({
          customerModelId: modelId,
          billingUnit,
          scopes,
        })
      } catch {
        if (draftRevision === previewRevision.current) {
          setLatestCnyCalculation(null)
          setCnyCalculationError(true)
        }
        return
      }
      if (draftRevision !== previewRevision.current) return
      setLatestCnyCalculation(currentCalculation)
      const revision = ++previewRevision.current
      preview.mutate({
        revision,
        scopes,
        calculationIdentity: currentCalculation.inputIdentity,
      })
      return
    }
    let riskValid = includeRiskResolution ? await riskForm.trigger() : true
    const riskMeta = riskForm.getValues()
    if (
      includeRiskResolution &&
      riskMeta.decisionType === 'TEMPORARY_LOSS' &&
      meta.effectiveMode === 'SCHEDULED' &&
      new Date(riskMeta.lossEndsAt).getTime() <=
        new Date(meta.effectiveAt).getTime()
    ) {
      riskForm.setError('lossEndsAt', {
        message: 'Loss deadline must be after the scheduled effective time',
      })
      riskValid = false
    }
    const {
      errors,
      summaryErrors,
      inputErrors,
      firstIssue,
      isUnitChange,
      draftsToSubmit,
    } = validatePricingDrafts(true)
    if (
      meta.effectiveMode === 'SCHEDULED' &&
      meta.effectiveAt &&
      Number.isNaN(new Date(meta.effectiveAt).getTime())
    ) {
      errors.push(t('Enter a valid effective time'))
    }
    if (draftRevision !== previewRevision.current) return
    setFieldErrors(inputErrors)
    if (errors.length || !formValid || !riskValid) {
      setValidationErrors(summaryErrors)
      focusPricingIssue(firstIssue)
      return
    }
    setValidationErrors([])
    const scopes = draftsToSubmit.map((draft) => {
      const currentProviderRate = detail.data?.pricingScopes.find(
        (scope) => scope.parameterCombinationId === draft.combinationId
      )?.currentProviderRate
      return {
        parameterCombinationId: draft.combinationId,
        providerRate:
          !isUnitChange && !draft.costEdited && currentProviderRate?.id
            ? {
                action: 'KEEP' as const,
                sourceProviderRateVersionId: currentProviderRate.id,
              }
            : {
                nativeAmount:
                  billingUnit === 'MILLION_TOKENS'
                    ? draft.input
                    : draft.nativeAmount,
                currency: draft.currency,
                exchangeRateSnapshot: {
                  rate: draft.exchangeRate,
                  source: draft.exchangeSource,
                  asOf: draft.exchangeAsOf,
                },
                ...(billingUnit === 'MILLION_TOKENS'
                  ? {
                      tokenRates: tokenRates(draft, selected.tokenCategories),
                    }
                  : {}),
                failureChargePolicy:
                  draft.failureChargeMode === 'FIXED'
                    ? {
                        mode: 'FIXED' as const,
                        nativeAmount: draft.failureNativeAmount,
                      }
                    : { mode: draft.failureChargeMode },
              },
        prices: draft.prices
          .filter((price) => {
            const scope = detail.data?.pricingScopes.find(
              (scope) => scope.parameterCombinationId === draft.combinationId
            )
            const current = scope?.prices.find(
              (candidate) => candidate.priceGroupId === price.priceGroupId
            )?.current
            if (isUnitChange) {
              return scope?.enabled !== false || Boolean(current)
            }
            return (
              ((draft.costEdited || !scope?.currentProviderRate) &&
                Boolean(current)) ||
              price.priceGroupId === activePriceGroupId
            )
          })
          .map((price) => {
            const current = detail.data?.pricingScopes
              .find(
                (scope) => scope.parameterCombinationId === draft.combinationId
              )
              ?.prices.find(
                (candidate) => candidate.priceGroupId === price.priceGroupId
              )?.current
            const priceQuestionnaire =
              questionnaires[`${draft.combinationId}:${price.priceGroupId}`] ??
              emptyQuestionnaire
            const changing = isUnitChange || price.action === 'SET'
            if (!changing && current) {
              return {
                priceGroupId: price.priceGroupId,
                action: 'KEEP' as const,
                sourcePriceVersionId: price.sourcePriceVersionId ?? undefined,
              }
            }
            return {
              priceGroupId: price.priceGroupId,
              action: 'SET' as const,
              ...(price.sourcePriceVersionId
                ? { sourcePriceVersionId: price.sourcePriceVersionId }
                : {}),
              ...(billingUnit === 'MILLION_TOKENS'
                ? {
                    tokenRates: tokenRates(price, selected.tokenCategories),
                    tokenCategoryAssumptions:
                      priceQuestionnaire.tokenCategoryAssumptions,
                  }
                : {
                    points: price.points || undefined,
                    otherVariableCostRmb:
                      priceQuestionnaire.otherVariableCostRmb,
                    riskBufferRmb: priceQuestionnaire.riskBufferRmb,
                  }),
              targetMarginRate: String(
                Number(priceQuestionnaire.targetMarginPercent) / 100
              ),
              successProbability: String(
                Number(priceQuestionnaire.successProbabilityPercent) / 100
              ),
              decisionSummary: decisionSummary.trim(),
              evidenceRefs: priceQuestionnaire.evidenceRefs,
            }
          }),
      }
    })
    const riskValues = riskForm.getValues()
    const revision = ++previewRevision.current
    setPreviewId(null)
    setPublishIdempotencyKey(null)
    preview.mutate({
      scopes,
      revision,
      ...(includeRiskResolution
        ? {
            costRiskResolution:
              riskValues.decisionType === 'TEMPORARY_LOSS'
                ? {
                    type: 'TEMPORARY_LOSS' as const,
                    lossEndsAt: new Date(riskValues.lossEndsAt).toISOString(),
                    maxExpectedLossPoints: riskValues.maxExpectedLossPoints,
                    reason: riskValues.reason,
                  }
                : { type: 'MANUAL_PAUSE' as const, reason: riskValues.reason },
          }
        : {}),
    })
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
  if (!detail.data || initializedModelId !== detail.data.model.id) {
    return (
      <Card>
        <CardContent>{t('Loading model pricing...')}</CardContent>
      </Card>
    )
  }

  const activeDraft = drafts.find(
    (draft) => draft.combinationId === activeScopeId
  )
  const isBillingUnitChange =
    selected.billingUnit !== null && billingUnit !== selected.billingUnit
  const selectedScopeCostRmb = activeDraft
    ? normalizedRmb(activeDraft.nativeAmount, activeDraft.exchangeRate)
    : ''
  let selectedScopeFailureCostRmb = '0'
  if (activeDraft?.failureChargeMode === 'SAME_AS_SUCCESS') {
    selectedScopeFailureCostRmb = selectedScopeCostRmb
  }
  if (activeDraft?.failureChargeMode === 'FIXED') {
    selectedScopeFailureCostRmb = activeDraft.failureNativeAmount
  }
  const questionnaireAnswers = {
    ...questionnaire,
    successfulTaskCostRmb: selectedScopeCostRmb,
    failedUnrecoverableCostRmb: selectedScopeFailureCostRmb,
  }
  const previewDetails = preview.data
    ? [
        { label: t('Model'), value: selected.name },
        {
          label: t('Effective mode'),
          value:
            effectiveMode === 'SCHEDULED'
              ? `${new Date(preview.data.effectiveAt).toLocaleString(locale)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
              : t('Immediately'),
        },
        {
          label: t('Point issuance rate'),
          value: `${formatExactRmbReference(preview.data.pointIssuanceRate.pointsPerRmb, locale)} ${t('points per RMB')}`,
        },
        ...(decisionSummary.trim()
          ? [{ label: t('Change reason'), value: decisionSummary.trim() }]
          : []),
      ]
    : []
  const previewRiskDetails = preview.data
    ? preview.data.scopes.flatMap((scope) =>
        scope.prices.flatMap((price) =>
          (price.proposed?.assumptions?.tokenCategoryRisks ?? []).map(
            (risk) => ({
              label: `${scopeLabel({ key: scope.combinationKey, parameters: scope.parameters }, t)} · ${detail.data.priceGroups.find((plan) => plan.id === price.priceGroupId)?.internalName ?? t('Not recorded')} · ${t(risk.category)}`,
              value: `${t('Break-even')}: ${risk.pricingBreakEvenPointsCeil ?? risk.breakEvenPointsCeil} ${t('points per million tokens')} · ${t('Target margin floor')}: ${risk.targetMarginPointsCeil ?? t('Not recorded')} ${t('points per million tokens')}${(risk.belowPricingBreakEven ?? risk.belowBreakEven) ? ` · ${t('Below break-even')}` : ''}`,
            })
          )
        )
      )
    : []
  const previewComparisons =
    preview.data?.scopes.flatMap((scope) => {
      const combination = scopeLabel(
        { key: scope.combinationKey, parameters: scope.parameters },
        t
      )
      if (billingUnit === 'MILLION_TOKENS') {
        return [
          ...selected.tokenCategories.map((category) => ({
            scope: combination,
            scopeId: scope.parameterCombinationId,
            field: `${t(category)} · ${t('Service provider cost')}${scope.costChanged ? '' : ` · ${t('Keep current')}`}`,
            before: tokenCostFact(
              scope.currentProviderRate,
              category,
              t,
              locale
            ),
            after: tokenCostFact(
              scope.proposedProviderRate ?? scope.currentProviderRate,
              category,
              t,
              locale
            ),
          })),
          {
            scope: combination,
            scopeId: scope.parameterCombinationId,
            field: t('Failed-attempt cost'),
            before: failureCostSummary(scope.currentProviderRate, t, locale),
            after: failureCostSummary(
              scope.proposedProviderRate ?? scope.currentProviderRate,
              t,
              locale
            ),
          },
          ...scope.prices.flatMap((price) =>
            selected.tokenCategories.flatMap((category) => {
              const priceGroup =
                detail.data.priceGroups.find(
                  (plan) => plan.id === price.priceGroupId
                )?.internalName ?? t('Not recorded')
              const after = price.proposed ?? price.current
              return [
                {
                  scope: combination,
                  scopeId: scope.parameterCombinationId,
                  priceGroupId: price.priceGroupId,
                  priceGroup,
                  field: `${t(category)} · ${t('Customer price')}${price.changed ? '' : ` · ${t('Keep current')}`}`,
                  before:
                    price.current?.tokenRates?.[category] === undefined
                      ? t('Not recorded')
                      : `${price.current.tokenRates[category]} ${t('points per million tokens')}`,
                  after:
                    after?.tokenRates?.[category] === undefined
                      ? t('Not recorded')
                      : `${after.tokenRates[category]} ${t('points per million tokens')}`,
                },
                ...(['otherVariableCostRmb', 'riskBufferRmb'] as const).map(
                  (field) => ({
                    scope: combination,
                    scopeId: scope.parameterCombinationId,
                    priceGroupId: price.priceGroupId,
                    priceGroup,
                    field: `${t(category)} · ${t(
                      field === 'otherVariableCostRmb'
                        ? 'Additional cost per million tokens'
                        : 'Risk buffer per successful million tokens'
                    )}`,
                    before:
                      price.current?.questionnaire.tokenCategoryAssumptions?.[
                        category
                      ]?.[field] === undefined
                        ? t('Not recorded')
                        : `${price.current.questionnaire.tokenCategoryAssumptions[category]?.[field]} ${t('RMB per million tokens')}`,
                    after:
                      after?.questionnaire.tokenCategoryAssumptions?.[
                        category
                      ]?.[field] === undefined
                        ? t('Not recorded')
                        : `${after.questionnaire.tokenCategoryAssumptions[category]?.[field]} ${t('RMB per million tokens')}`,
                  })
                ),
              ]
            })
          ),
        ]
      }
      return [
        {
          scope: combination,
          scopeId: scope.parameterCombinationId,
          field: `${t('Service provider cost')}${scope.costChanged ? '' : ` · ${t('Keep current')}`}`,
          before: providerCostSummary(scope.currentProviderRate, t, locale),
          after: providerCostSummary(
            scope.proposedProviderRate ?? scope.currentProviderRate,
            t,
            locale
          ),
        },
        {
          scope: combination,
          scopeId: scope.parameterCombinationId,
          field: t('Failed-attempt cost'),
          before: failureCostSummary(scope.currentProviderRate, t, locale),
          after: failureCostSummary(
            scope.proposedProviderRate ?? scope.currentProviderRate,
            t,
            locale
          ),
        },
        ...scope.prices.map((price) => ({
          scope: combination,
          scopeId: scope.parameterCombinationId,
          priceGroupId: price.priceGroupId,
          priceGroup:
            detail.data.priceGroups.find(
              (plan) => plan.id === price.priceGroupId
            )?.internalName ?? t('Not recorded'),
          field: `${t('Customer price')}${price.changed ? '' : ` · ${t('Keep current')}`}`,
          before: customerPriceSummary(price.current, t),
          after: (
            <>
              <div>
                {customerPriceSummary(price.proposed ?? price.current, t)}
              </div>
              {price.calculation && (
                <div className='text-muted-foreground text-sm'>
                  {t('Target margin points')}:{' '}
                  {price.calculation.targetMarginPointsCeil} {t('points')}
                  {' / '}
                  {billingUnitLabel(billingUnit, t)}
                </div>
              )}
            </>
          ),
        })),
      ]
    }) ?? []

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
        onDiscard={discardPricingDraft}
      />
      <ConfirmDialog
        open={Boolean(pendingTab)}
        onOpenChange={(open) => {
          if (!open) cancelTabChange()
        }}
        title={t('Leave unpublished pricing changes?')}
        desc={t(
          'The current pricing changes have not been published. They will be lost if you leave. Are you sure you want to leave?'
        )}
        confirmText={t('Discard changes and leave')}
        cancelBtnText={t('Keep editing')}
        destructive
        handleConfirm={confirmTabChange}
      />
      <ConfirmDialog
        open={Boolean(pendingInputMode)}
        onOpenChange={(open) => {
          if (!open) setPendingInputMode(null)
        }}
        title={t('Discard pricing input?')}
        desc={t(
          'Switching pricing mode discards the unpublished inputs, effective settings, and change reason in this form.'
        )}
        confirmText={t('Discard and switch')}
        cancelBtnText={t('Keep editing')}
        destructive
        handleConfirm={confirmInputModeChange}
      />
      {isDirty ? (
        <div
          role='status'
          className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm'
        >
          {t('Current changes have not been published.')}
        </div>
      ) : null}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2'>
          <Button
            variant='outline'
            onClick={() => {
              if (isDirty) {
                setPendingTab('back')
                return
              }
              props.onBack()
            }}
          >
            {t('Back to model list')}
          </Button>
          <h2 className='max-w-full min-w-0 text-sm font-medium break-words'>
            {selected.name}
          </h2>
          <span className='text-muted-foreground text-sm'>
            {t(selected.capability, { defaultValue: t('Unknown') })}
          </span>
        </div>
        <div className='flex flex-wrap gap-2 self-start'>
          <Link
            className={cn(buttonVariants({ variant: 'outline' }))}
            to='/canvas-cloud/$section'
            params={{ section: 'provider-configuration' }}
            search={{ modelId: selected.id }}
          >
            {t('Manage API Key bindings')}
          </Link>
        </div>
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (value === 'current' || value === 'set' || value === 'history') {
            changeTab(value)
          }
        }}
      >
        <CanvasManagementTabsList>
          <CanvasManagementTabsTrigger value='current'>
            {t('Current pricing')}
          </CanvasManagementTabsTrigger>
          <CanvasManagementTabsTrigger value='set'>
            {t('Set prices')}
          </CanvasManagementTabsTrigger>
          <CanvasManagementTabsTrigger value='history'>
            {t('History versions')}
          </CanvasManagementTabsTrigger>
        </CanvasManagementTabsList>
        <TabsContent value='current' className='mt-4 space-y-4'>
          <CurrentModelPricingTable
            detail={detail.data}
            onAdjust={(scopeId, planId) => {
              setActiveScopeId(scopeId)
              setActivePriceGroupId(planId)
              changeTab('set')
            }}
          />
        </TabsContent>
        <TabsContent
          value='set'
          className={cn(
            'mt-4 max-w-3xl space-y-4',
            restorationError && '[&>*:not([role=alert])]:hidden'
          )}
        >
          {restorationError ? (
            <p role='alert' className='text-destructive text-sm'>
              {t('Pricing is incomplete')}
            </p>
          ) : null}
          <div
            className={
              selected.allowedBillingUnits.length === 1
                ? 'grid gap-3 sm:grid-cols-[max-content_minmax(10rem,16rem)_minmax(0,1fr)] sm:gap-x-6'
                : 'grid gap-3 sm:grid-cols-[minmax(8rem,12rem)_minmax(10rem,16rem)_minmax(0,1fr)]'
            }
          >
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='model-pricing-unit'>{t('Billing unit')}</Label>
              {selected.allowedBillingUnits.length === 1 ? (
                <p
                  id='model-pricing-unit'
                  className='flex min-h-9 items-center text-sm'
                >
                  {billingUnitLabel(billingUnit, t)}
                </p>
              ) : (
                <Select
                  value={billingUnit}
                  onValueChange={(value) =>
                    handleBillingUnitChange(value as CanvasBillingUnit)
                  }
                >
                  <SelectTrigger id='model-pricing-unit' className='w-full'>
                    <SelectValue>
                      {billingUnitLabel(billingUnit, t)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {selected.allowedBillingUnits.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {billingUnitLabel(unit, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='model-pricing-scope'>{t('Pricing scope')}</Label>
              <Select
                value={activeScopeId}
                onValueChange={(value) => {
                  setActiveScopeId(value ?? '')
                  invalidatePreview()
                }}
              >
                <SelectTrigger id='model-pricing-scope' className='w-full'>
                  <SelectValue>
                    {scopeLabel(
                      selected.combinations.find(
                        (item) => item.id === activeScopeId
                      ),
                      t
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selected.combinations
                    .filter((item) => isBillingUnitChange || item.enabled)
                    .map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {scopeLabel(item, t)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='model-pricing-group'>{t('Price plan')}</Label>
              <Select
                value={activePriceGroupId}
                onValueChange={(value) => {
                  setActivePriceGroupId(value ?? '')
                  invalidatePreview()
                }}
              >
                <SelectTrigger id='model-pricing-group' className='w-full'>
                  <SelectValue>
                    {detail.data?.priceGroups.find(
                      (item) => item.id === activePriceGroupId
                    )?.internalName ?? t('Price plan')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(detail.data?.priceGroups ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.internalName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className='space-y-2'>
            <legend className='text-sm font-medium'>
              {t('Pricing input mode')} *
            </legend>
            <div className='flex flex-wrap gap-4'>
              {(['POINTS', 'CNY'] as const).map((mode) => (
                <label key={mode} className='flex items-center gap-2 text-sm'>
                  <input
                    type='radio'
                    name='pricing-input-mode'
                    value={mode}
                    checked={inputMode === mode}
                    onChange={() => switchInputMode(mode)}
                  />
                  {t(mode === 'POINTS' ? 'Points pricing' : 'CNY pricing')}
                </label>
              ))}
            </div>
          </fieldset>
          {validationErrors.length > 0 && (
            <div
              role='alert'
              className='border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm'
            >
              <p className='font-medium'>
                {t('Review the required pricing values')}
              </p>
              <ul className='mt-1 list-disc pl-5'>
                {validationErrors
                  .filter(
                    (error, index, errors) =>
                      index ===
                      errors.findIndex(
                        (candidate) =>
                          candidate.message === error.message &&
                          candidate.fieldId === error.fieldId
                      )
                  )
                  .map((error) => (
                    <li key={`${error.message}:${error.fieldId ?? 'summary'}`}>
                      {error.fieldId ? (
                        <button
                          type='button'
                          className='text-left underline'
                          onClick={() => focusPricingIssue(error)}
                        >
                          {error.message}
                        </button>
                      ) : (
                        error.message
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {inputMode === 'POINTS' ? (
            <>
              <div className='space-y-5'>
                <h3 className='font-medium'>{t('Cost and assumptions')}</h3>
                {isBillingUnitChange && (
                  <p className='text-sm font-medium'>
                    {t('Cost and assumptions')} ·{' '}
                    {scopeLabel(
                      selected.combinations.find(
                        (item) => item.id === activeScopeId
                      ),
                      t
                    )}{' '}
                    ·{' '}
                    {
                      detail.data.priceGroups.find(
                        (item) => item.id === activePriceGroupId
                      )?.internalName
                    }
                  </p>
                )}
                <PricingQuestionnaire
                  idPrefix='model-pricing'
                  answers={questionnaireAnswers}
                  errors={Object.fromEntries(
                    Object.entries(
                      questionnaireValidation(
                        questionnaireAnswers,
                        false,
                        billingUnit !== 'MILLION_TOKENS'
                      )
                    )
                      .filter(
                        ([field]) =>
                          submitAttempted ||
                          questionnaireTouched[`${questionnaireKey}:${field}`]
                      )
                      .map(([field, message]) => [field, t(message)])
                  )}
                  onBlur={(field) =>
                    setQuestionnaireTouched((current) => ({
                      ...current,
                      [`${questionnaireKey}:${field}`]: true,
                    }))
                  }
                  providerCostEditor={
                    <div className='space-y-4'>
                      {(isBillingUnitChange
                        ? drafts
                        : drafts.filter(
                            (draft) => draft.combinationId === activeScopeId
                          )
                      ).map((draft) => {
                        const scopeIndex = drafts.findIndex(
                          (candidate) =>
                            candidate.combinationId === draft.combinationId
                        )
                        const combination = selected.combinations.find(
                          (item) => item.id === draft.combinationId
                        )
                        return (
                          <div key={draft.combinationId} className='space-y-3'>
                            {isBillingUnitChange && (
                              <div className='font-medium'>
                                {scopeLabel(combination, t)}
                              </div>
                            )}
                            {billingUnit !== 'MILLION_TOKENS' ? (
                              <Field
                                id={`provider-cost-${draft.combinationId}`}
                                label={t('Successful call cost')}
                                unit={`${t('RMB')} / ${billingUnitLabel(billingUnit, t)}`}
                                className='w-full max-w-xs'
                                ariaLabel={
                                  isBillingUnitChange
                                    ? `${t('Service provider cost')} · ${scopeLabel(combination, t)}`
                                    : t('Service provider cost')
                                }
                                value={draft.nativeAmount}
                                onChange={(value) =>
                                  updateScope(scopeIndex, 'nativeAmount', value)
                                }
                                error={
                                  fieldErrors[`${scopeIndex}:nativeAmount`]
                                }
                                onBlur={() => {
                                  const error = amountError(
                                    draft.nativeAmount,
                                    'successful',
                                    t
                                  )
                                  if (error) {
                                    setFieldErrors((current) => ({
                                      ...current,
                                      [`${scopeIndex}:nativeAmount`]: error,
                                    }))
                                  }
                                }}
                              />
                            ) : (
                              <TokenFields
                                idPrefix={`provider-${draft.combinationId}`}
                                rmb={
                                  draft.costEdited ||
                                  isBillingUnitChange ||
                                  !detail.data.pricingScopes.find(
                                    (scope) =>
                                      scope.parameterCombinationId ===
                                      draft.combinationId
                                  )?.currentProviderRate
                                }
                                showErrors={validationErrors.length > 0}
                                categories={selected.tokenCategories}
                                draft={draft}
                                onChange={(key, value) =>
                                  updateScope(scopeIndex, key, value)
                                }
                              />
                            )}
                            <div className='w-full max-w-xs space-y-3'>
                              <div className='w-full max-w-xs'>
                                <Label
                                  htmlFor={`model-pricing-failure-${draft.combinationId}`}
                                >
                                  {t('Failed-attempt cost')}
                                </Label>
                                <Select
                                  value={draft.failureChargeMode}
                                  onValueChange={(value) =>
                                    updateScope(
                                      scopeIndex,
                                      'failureChargeMode',
                                      value ?? 'NONE'
                                    )
                                  }
                                >
                                  <SelectTrigger
                                    id={`model-pricing-failure-${draft.combinationId}`}
                                    className='w-full'
                                  >
                                    <SelectValue>
                                      {failureChargeLabel(
                                        draft.failureChargeMode,
                                        t
                                      )}
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value='NONE'>
                                      {t('No failed-attempt cost')}
                                    </SelectItem>
                                    <SelectItem value='SAME_AS_SUCCESS'>
                                      {t('Same as successful attempt')}
                                    </SelectItem>
                                    {billingUnit !== 'MILLION_TOKENS' && (
                                      <SelectItem value='FIXED'>
                                        {t('Fixed failed-attempt cost')}
                                      </SelectItem>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              {draft.failureChargeMode === 'FIXED' && (
                                <Field
                                  id={`failure-cost-${draft.combinationId}`}
                                  label={t('Failed call cost')}
                                  unit={`${t('RMB')} / ${billingUnitLabel(billingUnit, t)}`}
                                  className='w-full max-w-xs'
                                  ariaLabel={t('Failed call cost')}
                                  value={draft.failureNativeAmount}
                                  onChange={(value) =>
                                    updateScope(
                                      scopeIndex,
                                      'failureNativeAmount',
                                      value
                                    )
                                  }
                                  error={
                                    fieldErrors[
                                      `${scopeIndex}:failureNativeAmount`
                                    ]
                                  }
                                  onBlur={() => {
                                    const error = amountError(
                                      draft.failureNativeAmount,
                                      'failed',
                                      t
                                    )
                                    if (error) {
                                      setFieldErrors((current) => ({
                                        ...current,
                                        [`${scopeIndex}:failureNativeAmount`]:
                                          error,
                                      }))
                                    }
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {billingUnit === 'MILLION_TOKENS' && activeDraft && (
                        <TokenPricingQuestionnaire
                          idPrefix={`token-basis-${activeScopeId}-${activePriceGroupId}`}
                          stage='basis'
                          categories={selected.tokenCategories}
                          providerRates={activeDraft}
                          categoryAssumptions={
                            questionnaire.tokenCategoryAssumptions
                          }
                          successProbabilityPercent={
                            questionnaire.successProbabilityPercent
                          }
                          targetMarginPercent={
                            questionnaire.targetMarginPercent
                          }
                          customerRates={
                            activeDraft.prices.find(
                              (price) =>
                                price.priceGroupId === activePriceGroupId
                            ) ?? {}
                          }
                          failureMode={
                            activeDraft.failureChargeMode === 'SAME_AS_SUCCESS'
                              ? 'SAME_AS_SUCCESS'
                              : 'NONE'
                          }
                          pointsPerRmb={String(
                            issuanceRates.data?.find(
                              (rate) => rate.status === 'PUBLISHED'
                            )?.pointsPerRmb ?? ''
                          )}
                          showErrors={submitAttempted}
                          onAssumptionChange={updateTokenAssumption}
                          onRateChange={() => {}}
                        />
                      )}
                    </div>
                  }
                  providerCostRmb={selectedScopeCostRmb}
                  pointsPerRmb={String(
                    issuanceRates.data?.find(
                      (rate) => rate.status === 'PUBLISHED'
                    )?.pointsPerRmb ?? ''
                  )}
                  billingUnitLabel={billingUnitLabel(billingUnit, t)}
                  showProposedPoints={false}
                  showCalculation={billingUnit !== 'MILLION_TOKENS'}
                  showAdditionalCosts={billingUnit !== 'MILLION_TOKENS'}
                  currentPoints={
                    detail.data?.pricingScopes
                      .find(
                        (scope) =>
                          scope.parameterCombinationId === activeScopeId
                      )
                      ?.prices.find(
                        (price) => price.priceGroupId === activePriceGroupId
                      )?.current?.points
                  }
                  onChange={(key, value) => {
                    setHasEdits(true)
                    invalidatePreview()
                    setQuestionnaire((current) => ({
                      ...current,
                      [key]: value,
                    }))
                    setDrafts((current) =>
                      current.map((scope) =>
                        scope.combinationId !== activeScopeId
                          ? scope
                          : {
                              ...scope,
                              prices: scope.prices.map((price) =>
                                price.priceGroupId !== activePriceGroupId
                                  ? price
                                  : {
                                      ...price,
                                      action: 'SET',
                                      ...(key === 'proposedPoints'
                                        ? { points: value }
                                        : {}),
                                    }
                              ),
                            }
                      )
                    )
                  }}
                />
              </div>
              {(isBillingUnitChange
                ? drafts
                : drafts.filter(
                    (draft) => draft.combinationId === activeScopeId
                  )
              ).map((draft) => {
                let failureCostRmb = '0'
                if (draft.failureChargeMode === 'SAME_AS_SUCCESS') {
                  failureCostRmb = draft.nativeAmount
                }
                if (draft.failureChargeMode === 'FIXED') {
                  failureCostRmb = draft.failureNativeAmount
                }
                const scopeIndex = drafts.findIndex(
                  (candidate) => candidate.combinationId === draft.combinationId
                )
                const combination = selected.combinations.find(
                  (item) => item.id === draft.combinationId
                )
                return (
                  <section
                    key={draft.combinationId}
                    className={
                      isBillingUnitChange
                        ? 'space-y-4 rounded-lg border p-4'
                        : 'space-y-4'
                    }
                  >
                    {isBillingUnitChange && (
                      <CardHeader>
                        <CardTitle>{scopeLabel(combination, t)}</CardTitle>
                        <CardDescription>
                          {!detail.data.pricingScopes.find(
                            (scope) =>
                              scope.parameterCombinationId ===
                              draft.combinationId
                          )?.enabled
                            ? ` · ${t('Disabled')}`
                            : ''}
                        </CardDescription>
                      </CardHeader>
                    )}
                    <div className='space-y-4'>
                      <div className='space-y-3'>
                        {draft.prices.map((price, priceIndex) => {
                          const scope = detail.data.pricingScopes.find(
                            (scope) =>
                              scope.parameterCombinationId ===
                              draft.combinationId
                          )
                          if (
                            isBillingUnitChange &&
                            scope?.enabled === false &&
                            !scope.prices.find(
                              (candidate) =>
                                candidate.priceGroupId === price.priceGroupId
                            )?.current
                          ) {
                            return null
                          }
                          if (
                            !isBillingUnitChange &&
                            price.priceGroupId !== activePriceGroupId
                          ) {
                            return null
                          }
                          const group = workspace.data?.priceGroups.find(
                            (item) => item.id === price.priceGroupId
                          )
                          return (
                            <div
                              className={
                                isBillingUnitChange
                                  ? 'rounded-lg border p-3'
                                  : 'min-w-0'
                              }
                              key={price.priceGroupId}
                            >
                              {isBillingUnitChange && (
                                <div className='mb-3 font-medium break-words'>
                                  {group?.internalName ?? t('Price plan')}
                                </div>
                              )}
                              {billingUnit === 'MILLION_TOKENS' && (
                                <TokenPricingQuestionnaire
                                  idPrefix={`token-price-${draft.combinationId}-${price.priceGroupId}`}
                                  stage='price'
                                  questionNumber={4}
                                  priceAction={price.action}
                                  categories={selected.tokenCategories}
                                  providerRates={draft}
                                  categoryAssumptions={
                                    (
                                      questionnaires[
                                        `${draft.combinationId}:${price.priceGroupId}`
                                      ] ?? emptyQuestionnaire
                                    ).tokenCategoryAssumptions
                                  }
                                  successProbabilityPercent={
                                    (
                                      questionnaires[
                                        `${draft.combinationId}:${price.priceGroupId}`
                                      ] ?? emptyQuestionnaire
                                    ).successProbabilityPercent
                                  }
                                  targetMarginPercent={
                                    (
                                      questionnaires[
                                        `${draft.combinationId}:${price.priceGroupId}`
                                      ] ?? emptyQuestionnaire
                                    ).targetMarginPercent
                                  }
                                  customerRates={price}
                                  currentRates={
                                    !isBillingUnitChange
                                      ? (scope?.prices.find(
                                          (item) =>
                                            item.priceGroupId ===
                                            price.priceGroupId
                                        )?.current?.tokenRates ?? undefined)
                                      : undefined
                                  }
                                  failureMode={
                                    draft.failureChargeMode ===
                                    'SAME_AS_SUCCESS'
                                      ? 'SAME_AS_SUCCESS'
                                      : 'NONE'
                                  }
                                  pointsPerRmb={String(
                                    issuanceRates.data?.find(
                                      (rate) => rate.status === 'PUBLISHED'
                                    )?.pointsPerRmb ?? ''
                                  )}
                                  showErrors={submitAttempted}
                                  onAssumptionChange={updateTokenAssumption}
                                  onRateChange={(category, value) =>
                                    updatePrice(
                                      scopeIndex,
                                      priceIndex,
                                      category,
                                      value
                                    )
                                  }
                                  onKeepCurrent={() => {
                                    const current = scope?.prices.find(
                                      (item) =>
                                        item.priceGroupId === price.priceGroupId
                                    )?.current
                                    if (
                                      !current?.tokenRates ||
                                      isBillingUnitChange
                                    ) {
                                      return
                                    }
                                    for (const category of selected.tokenCategories) {
                                      updatePrice(
                                        scopeIndex,
                                        priceIndex,
                                        category,
                                        current.tokenRates[category] ?? ''
                                      )
                                    }
                                    updatePrice(
                                      scopeIndex,
                                      priceIndex,
                                      'action',
                                      'KEEP'
                                    )
                                  }}
                                />
                              )}
                              {billingUnit !== 'MILLION_TOKENS' && (
                                <PricingQuestionnaire
                                  idPrefix={`model-pricing-price-${draft.combinationId}-${price.priceGroupId}`}
                                  answers={{
                                    ...(questionnaires[
                                      `${draft.combinationId}:${price.priceGroupId}`
                                    ] ?? emptyQuestionnaire),
                                    successfulTaskCostRmb: normalizedRmb(
                                      draft.nativeAmount,
                                      draft.exchangeRate
                                    ),
                                    failedUnrecoverableCostRmb: failureCostRmb,
                                  }}
                                  providerCostRmb={draft.nativeAmount}
                                  pointsPerRmb={String(
                                    issuanceRates.data?.find(
                                      (rate) => rate.status === 'PUBLISHED'
                                    )?.pointsPerRmb ?? ''
                                  )}
                                  billingUnitLabel={billingUnitLabel(
                                    billingUnit,
                                    t
                                  )}
                                  showBasis={false}
                                  proposedQuestionNumber={6}
                                  priceAction={price.action}
                                  errors={Object.fromEntries(
                                    Object.entries(
                                      questionnaireValidation(
                                        questionnaires[
                                          `${draft.combinationId}:${price.priceGroupId}`
                                        ] ?? emptyQuestionnaire,
                                        true
                                      )
                                    )
                                      .filter(
                                        ([field]) =>
                                          submitAttempted ||
                                          questionnaireTouched[
                                            `${draft.combinationId}:${price.priceGroupId}:${field}`
                                          ]
                                      )
                                      .map(([field, message]) => [
                                        field,
                                        t(message),
                                      ])
                                  )}
                                  onBlur={(field) =>
                                    setQuestionnaireTouched((current) => ({
                                      ...current,
                                      [`${draft.combinationId}:${price.priceGroupId}:${field}`]: true,
                                    }))
                                  }
                                  showProposedPoints
                                  onKeepCurrent={() => {
                                    const current = detail.data?.pricingScopes
                                      .find(
                                        (scope) =>
                                          scope.parameterCombinationId ===
                                          draft.combinationId
                                      )
                                      ?.prices.find(
                                        (candidate) =>
                                          candidate.priceGroupId ===
                                          price.priceGroupId
                                      )?.current
                                    if (!current?.id || isBillingUnitChange) {
                                      return
                                    }
                                    const sourcePriceVersionId = current.id
                                    setHasEdits(true)
                                    invalidatePreview()
                                    setDrafts((drafts) =>
                                      drafts.map((scope) =>
                                        scope.combinationId !==
                                        draft.combinationId
                                          ? scope
                                          : {
                                              ...scope,
                                              prices: scope.prices.map(
                                                (candidate) =>
                                                  candidate.priceGroupId !==
                                                  price.priceGroupId
                                                    ? candidate
                                                    : {
                                                        ...candidate,
                                                        action: 'KEEP',
                                                        points: current.points,
                                                        sourcePriceVersionId,
                                                      }
                                              ),
                                            }
                                      )
                                    )
                                    const key = `${draft.combinationId}:${price.priceGroupId}`
                                    setQuestionnaires((answers) => ({
                                      ...answers,
                                      [key]: {
                                        ...(answers[key] ?? emptyQuestionnaire),
                                        proposedPoints: current.points,
                                      },
                                    }))
                                  }}
                                  currentPoints={
                                    isBillingUnitChange
                                      ? undefined
                                      : detail.data.pricingScopes
                                          .find(
                                            (scope) =>
                                              scope.parameterCombinationId ===
                                              draft.combinationId
                                          )
                                          ?.prices.find(
                                            (candidate) =>
                                              candidate.priceGroupId ===
                                              price.priceGroupId
                                          )?.current?.points
                                  }
                                  onChange={(key, value) => {
                                    setHasEdits(true)
                                    invalidatePreview()
                                    const keyId = `${draft.combinationId}:${price.priceGroupId}`
                                    setQuestionnaires((current) => ({
                                      ...current,
                                      [keyId]: {
                                        ...(current[keyId] ??
                                          emptyQuestionnaire),
                                        [key]: value,
                                      },
                                    }))
                                    if (key === 'proposedPoints') {
                                      const priceIndex = draft.prices.findIndex(
                                        (candidate) =>
                                          candidate.priceGroupId ===
                                          price.priceGroupId
                                      )
                                      if (priceIndex >= 0) {
                                        updatePrice(
                                          scopeIndex,
                                          priceIndex,
                                          'points',
                                          value
                                        )
                                      }
                                    }
                                  }}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </section>
                )
              })}
            </>
          ) : (
            <div className='space-y-3'>
              {cnyCalculation.isPending ? (
                <p role='status'>{t('Calculating…')}</p>
              ) : null}
              {cnyCalculationError ? (
                <div role='alert' className='space-y-2'>
                  <p>{t('Pricing preview could not be created')}</p>
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() =>
                      setCnyRetryRevision((current) => current + 1)
                    }
                  >
                    {t('Retry')}
                  </Button>
                </div>
              ) : null}
              <CnyPricingQuestionnaire
                idPrefix={`cny-pricing-${activeScopeId}-${activePriceGroupId}`}
                billingUnit={billingUnit}
                categories={selected.tokenCategories}
                draft={cnyDraft}
                errors={Object.fromEntries(
                  Object.entries(cnyTouched)
                    .filter(
                      ([key, touched]) =>
                        touched && key.startsWith(`${questionnaireKey}:`)
                    )
                    .map(([key]) => {
                      const field = key.slice(questionnaireKey.length + 1)
                      const value = field.startsWith('provider:')
                        ? cnyDraft.provider[field.slice('provider:'.length)]
                        : cnyDraft.customer[field.slice('customer:'.length)]
                      return [
                        field,
                        cnyFieldErrors[key] ??
                          (isPositiveRmbAmount(value ?? '')
                            ? undefined
                            : t(
                                'Enter an amount above 0 with up to 2 decimals'
                              )),
                      ]
                    })
                )}
                calculation={
                  preview.data
                    ? preview.data.scopes
                        .find(
                          (scope) =>
                            scope.parameterCombinationId === activeScopeId
                        )
                        ?.prices.find(
                          (price) => price.priceGroupId === activePriceGroupId
                        )?.proposed?.cnyCalculation
                    : cnyCalculationDisplay(
                        latestCnyCalculation?.scopes
                          .find(
                            (scope) =>
                              scope.parameterCombinationId === activeScopeId
                          )
                          ?.prices.find(
                            (price) => price.priceGroupId === activePriceGroupId
                          ),
                        billingUnit === 'MILLION_TOKENS'
                          ? cnyTokenRates(
                              cnyDraft.provider,
                              selected.tokenCategories
                            )
                          : (cnyDraft.provider.scalar ?? ''),
                        billingUnit === 'MILLION_TOKENS'
                          ? cnyTokenRates(
                              cnyDraft.customer,
                              selected.tokenCategories
                            )
                          : (cnyDraft.customer.scalar ?? '')
                      )
                }
                points={
                  billingUnit === 'MILLION_TOKENS'
                    ? (latestCnyCalculation?.scopes
                        .find(
                          (scope) =>
                            scope.parameterCombinationId === activeScopeId
                        )
                        ?.prices.find(
                          (price) => price.priceGroupId === activePriceGroupId
                        )?.normalizedTokenRates ?? undefined)
                    : latestCnyCalculation?.scopes
                        .find(
                          (scope) =>
                            scope.parameterCombinationId === activeScopeId
                        )
                        ?.prices.find(
                          (price) => price.priceGroupId === activePriceGroupId
                        )?.normalizedPoints
                }
                pointsPerRmb={
                  (preview.data ?? latestCnyCalculation)?.pointIssuanceRate
                    .pointsPerRmb
                }
                onBlur={(side, field) =>
                  setCnyTouched((current) => ({
                    ...current,
                    [`${questionnaireKey}:${side}:${field}`]: true,
                  }))
                }
                onChange={(side, field, value) => {
                  setCnyHasEdits(true)
                  invalidatePreview()
                  const errorKey = `${questionnaireKey}:${side}:${field}`
                  setCnyFieldErrors((current) => {
                    const next = { ...current }
                    delete next[errorKey]
                    return next
                  })
                  setCnyDrafts((current) => {
                    const scopeDraft = current[activeScopeId] ?? {
                      provider: {},
                      customers: {},
                    }
                    if (side === 'provider') {
                      return {
                        ...current,
                        [activeScopeId]: {
                          ...scopeDraft,
                          provider: {
                            ...scopeDraft.provider,
                            [field]: value,
                          },
                        },
                      }
                    }
                    return {
                      ...current,
                      [activeScopeId]: {
                        ...scopeDraft,
                        customers: {
                          ...scopeDraft.customers,
                          [activePriceGroupId]: {
                            ...scopeDraft.customers[activePriceGroupId],
                            [field]: value,
                          },
                        },
                      },
                    }
                  })
                }}
              />
            </div>
          )}
          <div className='max-w-3xl space-y-4'>
            <fieldset className='space-y-2'>
              <legend className='text-sm font-medium'>
                {t('Effective mode')}
              </legend>
              <div className='flex flex-wrap gap-4'>
                {(['IMMEDIATE', 'SCHEDULED'] as const).map((mode) => (
                  <label key={mode} className='flex items-center gap-2 text-sm'>
                    <input
                      type='radio'
                      value={mode}
                      {...form.register('effectiveMode')}
                      checked={effectiveMode === mode}
                      onChange={() => {
                        form.setValue('effectiveMode', mode, {
                          shouldDirty: true,
                        })
                        form.clearErrors('effectiveAt')
                        invalidatePreview()
                      }}
                    />
                    {t(
                      mode === 'IMMEDIATE'
                        ? 'Immediately'
                        : 'Schedule for later'
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
            {effectiveMode === 'SCHEDULED' && (
              <div className='space-y-2'>
                <Label htmlFor='model-pricing-effective'>
                  {t('Effective at')} *
                </Label>
                <Input
                  id='model-pricing-effective'
                  type='datetime-local'
                  {...form.register('effectiveAt')}
                  aria-invalid={Boolean(form.formState.errors.effectiveAt)}
                  aria-describedby='model-pricing-effective-help model-pricing-effective-error'
                  onChange={(event) => {
                    form.setValue('effectiveAt', event.target.value, {
                      shouldDirty: true,
                      shouldTouch: true,
                      shouldValidate: submitAttempted,
                    })
                    invalidatePreview()
                  }}
                />
                <p
                  id='model-pricing-effective-help'
                  className='text-muted-foreground text-xs'
                >
                  {t('Uses your current time zone')}:{' '}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
                {form.formState.errors.effectiveAt?.message && (
                  <p
                    id='model-pricing-effective-error'
                    role='alert'
                    className='text-destructive text-xs'
                  >
                    {t(form.formState.errors.effectiveAt.message)}
                  </p>
                )}
              </div>
            )}
            <div className='space-y-2'>
              <Label htmlFor='model-pricing-reason'>
                {t('Change reason (optional)')}
              </Label>
              <Input
                id='model-pricing-reason'
                {...form.register('decisionSummary')}
                aria-invalid={Boolean(form.formState.errors.decisionSummary)}
                aria-describedby={
                  form.formState.errors.decisionSummary
                    ? 'model-pricing-reason-error'
                    : undefined
                }
                onChange={(event) => {
                  form.setValue('decisionSummary', event.target.value, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: submitAttempted,
                  })
                  invalidatePreview()
                }}
              />
              {form.formState.errors.decisionSummary?.message && (
                <p
                  id='model-pricing-reason-error'
                  role='alert'
                  className='text-destructive text-xs'
                >
                  {t(form.formState.errors.decisionSummary.message)}
                </p>
              )}
            </div>
          </div>
          <div className='flex justify-end'>
            <Button
              disabled={
                restorationError || preview.isPending || publication.isPending
              }
              onClick={() => void requestPreview()}
            >
              {t('Preview and publish')}
            </Button>
          </div>
        </TabsContent>
        <TabsContent value='history' className='mt-4'>
          <UnifiedModelPricingHistory
            modelId={modelId}
            detail={detail.data}
            initialPublicationId={props.initialPublicationId}
          />
        </TabsContent>
      </Tabs>
      <PricingActionConfirmation
        open={confirming}
        onOpenChange={setConfirming}
        title={t('Confirm pricing publication')}
        description={t('Review the changes and their effective schedule.')}
        details={previewDetails}
        comparisonRows={previewComparisons}
        confirmLabel={t('Confirm and publish')}
        confirmDisabled={
          !preview.data?.canPublish || !previewId || !publishIdempotencyKey
        }
        pending={publication.isPending}
        onConfirm={() => {
          if (
            !preview.data?.canPublish ||
            !previewId ||
            !publishIdempotencyKey
          ) {
            return
          }
          if (
            effectiveMode === 'SCHEDULED' &&
            new Date(effectiveAt).getTime() <= Date.now()
          ) {
            invalidatePreview()
            form.setError('effectiveAt', {
              message:
                'The scheduled time has passed. Choose a new time and preview again.',
            })
            form.setFocus('effectiveAt')
            return
          }
          publication.mutate()
        }}
      >
        {previewRiskDetails.length > 0 && (
          <dl className='space-y-2 text-sm'>
            {previewRiskDetails.map((risk) => (
              <div
                key={risk.label}
                className='space-y-1 [overflow-wrap:anywhere]'
              >
                <dt className='font-medium'>{risk.label}</dt>
                <dd>{risk.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {preview.data?.conflicts.map((conflict) => (
          <p
            key={`${conflict.code}:${conflict.parameterCombinationId ?? ''}:${conflict.priceGroupId ?? ''}`}
            className='text-destructive text-sm'
          >
            {pricingConflictLabel(conflict.code, t)}
            {conflict.categories?.length
              ? ` · ${conflict.categories.map((category) => t(category)).join(', ')}`
              : ''}
          </p>
        ))}
        {preview.data?.conflicts.some((conflict) =>
          ['SCHEDULED_PRICE', 'SCHEDULED_PROVIDER_RATE'].includes(conflict.code)
        ) && (
          <Button
            variant='outline'
            onClick={() => {
              setConfirming(false)
              changeTab('history')
            }}
          >
            {t('History versions')}
          </Button>
        )}
        {preview.data?.conflicts.some(
          (conflict) => conflict.code === 'BELOW_BREAK_EVEN'
        ) && (
          <div className='border-destructive/40 bg-destructive/5 space-y-3 rounded-lg border p-3'>
            <p className='font-medium'>{t('Below break-even')}</p>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Choose a pause or a limited loss window, then create a new preview.'
              )}
            </p>
            <Select
              value={riskForm.watch('decisionType')}
              onValueChange={(value) => {
                riskForm.setValue(
                  'decisionType',
                  value as 'MANUAL_PAUSE' | 'TEMPORARY_LOSS',
                  { shouldTouch: true }
                )
                invalidatePreview({ keepConfirmation: true })
              }}
            >
              <SelectTrigger aria-label={t('Risk action')}>
                <SelectValue>
                  {riskActionLabel(riskForm.watch('decisionType'), t)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='MANUAL_PAUSE'>
                  {t('Pause quality')}
                </SelectItem>
                <SelectItem value='TEMPORARY_LOSS'>
                  {t('Limited loss window')}
                </SelectItem>
              </SelectContent>
            </Select>
            {riskForm.watch('decisionType') === 'TEMPORARY_LOSS' && (
              <div className='grid gap-3 sm:grid-cols-2'>
                <div>
                  <Label htmlFor='model-pricing-loss-ends'>
                    {t('Loss deadline')}
                  </Label>
                  <Input
                    id='model-pricing-loss-ends'
                    aria-invalid={Boolean(riskForm.formState.errors.lossEndsAt)}
                    aria-describedby={
                      riskForm.formState.errors.lossEndsAt
                        ? 'model-pricing-loss-ends-error'
                        : undefined
                    }
                    type='datetime-local'
                    {...riskForm.register('lossEndsAt')}
                    onChange={(event) => {
                      riskForm.setValue('lossEndsAt', event.target.value, {
                        shouldTouch: true,
                      })
                      invalidatePreview({ keepConfirmation: true })
                    }}
                  />
                  {riskForm.formState.errors.lossEndsAt?.message && (
                    <p
                      id='model-pricing-loss-ends-error'
                      role='alert'
                      className='text-destructive mt-1 text-xs'
                    >
                      {t(riskForm.formState.errors.lossEndsAt.message)}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor='model-pricing-loss-budget'>
                    {t('Maximum expected loss points')}
                  </Label>
                  <Input
                    id='model-pricing-loss-budget'
                    aria-invalid={Boolean(
                      riskForm.formState.errors.maxExpectedLossPoints
                    )}
                    aria-describedby={
                      riskForm.formState.errors.maxExpectedLossPoints
                        ? 'model-pricing-loss-budget-error'
                        : undefined
                    }
                    inputMode='numeric'
                    {...riskForm.register('maxExpectedLossPoints')}
                    onChange={(event) => {
                      riskForm.setValue(
                        'maxExpectedLossPoints',
                        event.target.value,
                        { shouldTouch: true }
                      )
                      invalidatePreview({ keepConfirmation: true })
                    }}
                  />
                  {riskForm.formState.errors.maxExpectedLossPoints?.message && (
                    <p
                      id='model-pricing-loss-budget-error'
                      role='alert'
                      className='text-destructive mt-1 text-xs'
                    >
                      {t(
                        riskForm.formState.errors.maxExpectedLossPoints.message
                      )}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div>
              <Label htmlFor='model-pricing-risk-reason'>{t('Reason')}</Label>
              <Input
                id='model-pricing-risk-reason'
                aria-invalid={Boolean(riskForm.formState.errors.reason)}
                aria-describedby={
                  riskForm.formState.errors.reason
                    ? 'model-pricing-risk-reason-error'
                    : undefined
                }
                maxLength={2000}
                {...riskForm.register('reason')}
                onChange={(event) => {
                  riskForm.setValue('reason', event.target.value, {
                    shouldTouch: true,
                  })
                  invalidatePreview({ keepConfirmation: true })
                }}
              />
              {riskForm.formState.errors.reason?.message && (
                <p
                  id='model-pricing-risk-reason-error'
                  role='alert'
                  className='text-destructive mt-1 text-xs'
                >
                  {t(riskForm.formState.errors.reason.message)}
                </p>
              )}
            </div>
            <Button
              type='button'
              variant='outline'
              disabled={preview.isPending}
              onClick={() => void requestPreview(true)}
            >
              {t('Preview with risk resolution')}
            </Button>
          </div>
        )}
      </PricingActionConfirmation>
    </div>
  )
}

function CurrentModelPricingTable(props: {
  detail: CanvasModelPricingDetail
  onAdjust: (scopeId: string, planId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage ?? i18n.language)
  const onAdjust = props.onAdjust
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const tableContentRef = useRef<HTMLDivElement>(null)
  const [actionColumnSize, setActionColumnSize] = useState(128)
  const qualityOnly =
    props.detail.pricingScopes.length > 0 &&
    props.detail.pricingScopes.every((scope) => {
      const keys = Object.keys(scope.parameters)
      return keys.length === 1 && keys[0] === 'quality'
    })
  const combinationTitle = t(qualityOnly ? 'Quality' : 'Parameter combination')
  const rows = useMemo(
    () =>
      props.detail.pricingScopes.flatMap((scope) =>
        scope.prices.map((price) => ({
          id: `${scope.parameterCombinationId}:${price.priceGroupId}`,
          scope,
          price,
          combination: qualityOnly
            ? String(scope.parameters.quality)
            : scopeLabel(
                { key: scope.combinationKey, parameters: scope.parameters },
                t
              ),
          plan: price.priceGroupName,
        }))
      ),
    [props.detail, t, qualityOnly]
  )
  type PricingRow = (typeof rows)[number]
  const columns = useMemo<ColumnDef<PricingRow, unknown>[]>(
    () => [
      {
        accessorKey: 'combination',
        size: qualityOnly ? 128 : 208,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={combinationTitle} />
        ),
        meta: { label: combinationTitle },
        filterFn: (row, id, values: string[]) =>
          values.includes(row.getValue(id)),
        cell: ({ row }) => (
          <div>
            {row.original.combination}
            {row.original.scope.enabled === false && (
              <span className='text-muted-foreground ml-2'>
                {t('Disabled')}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'plan',
        size: 256,
        cell: ({ row }) => (
          <span className='break-words whitespace-normal'>
            {row.original.plan}
          </span>
        ),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Price plan')} />
        ),
        meta: { label: t('Price plan') },
        filterFn: (row, id, values: string[]) =>
          values.includes(row.getValue(id)),
      },
      {
        id: 'cost',
        size: 208,
        header: t('Service provider cost'),
        meta: {
          label: t('Service provider cost'),
          className: 'text-right tabular-nums',
        },
        cell: ({ row }) => {
          const rate = row.original.scope.currentProviderRate
          if (!rate) return <span>{t('Not configured')}</span>
          if (rate.billingUnit === 'MILLION_TOKENS') {
            return (
              <span className='whitespace-normal'>{`${tokenRateSummary(rate.normalizedTokenRates, t, (amount) => formatExactRmbReference(amount, locale, 2))} ${t('RMB')} / ${billingUnitLabel(rate.billingUnit, t)}`}</span>
            )
          }
          return (
            <span className='whitespace-normal'>{`${formatExactRmbReference(rate.normalizedAmountMinor, locale, 2)} ${t('RMB')} / ${billingUnitLabel(rate.billingUnit, t)}`}</span>
          )
        },
      },
      {
        id: 'price',
        size: 208,
        header: t('Customer price'),
        meta: {
          label: t('Customer price'),
          className: 'text-right tabular-nums',
        },
        cell: ({ row }) => {
          const price = row.original.price.current
          if (!price) return <span>{t('Not priced')}</span>
          return (
            <span className='whitespace-normal'>
              {customerPriceSummary(price, t)}
            </span>
          )
        },
      },
      {
        id: 'actions',
        size: actionColumnSize,
        enableHiding: false,
        header: t('Actions'),
        cell: ({ row }) => (
          <div data-model-pricing-actions className='w-max whitespace-nowrap'>
            <Button
              variant='outline'
              data-testid='adjust-pricing'
              disabled={row.original.scope.enabled === false}
              onClick={() =>
                onAdjust(
                  row.original.scope.parameterCombinationId,
                  row.original.price.priceGroupId
                )
              }
            >
              {t(row.original.price.current ? 'Adjust pricing' : 'Set price')}
            </Button>
          </div>
        ),
      },
    ],
    [actionColumnSize, t, locale, onAdjust, combinationTitle, qualityOnly]
  )
  const { table } = useDataTable({
    data: rows,
    columns,
    columnFilters,
    onColumnFiltersChange: setColumnFilters,
    globalFilter,
    onGlobalFilterChange: setGlobalFilter,
    getRowId: (row) => row.id,
    initialPagination: { pageIndex: 0, pageSize: 20 },
  })
  const visibleColumns = table.getVisibleLeafColumns()
  const flexibleColumn =
    visibleColumns.find((column) => column.id === 'plan') ??
    visibleColumns.find((column) => column.id === 'combination')
  const minimumTableWidth = visibleColumns.reduce(
    (width, column) => width + column.getSize(),
    0
  )
  const pagination = table.getState().pagination
  useLayoutEffect(() => {
    const actions = tableContentRef.current?.querySelector<HTMLElement>(
      '[data-model-pricing-actions]'
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
  }, [pagination.pageIndex, pagination.pageSize, rows, t])
  return (
    <div ref={tableContentRef} className='min-w-0 space-y-3'>
      <DataTableToolbar
        table={table}
        filterPanel={
          <DataTableColumnFilterPanel activeCount={columnFilters.length}>
            {[
              {
                columnId: 'combination',
                title: combinationTitle,
                allLabel: t('All combinations'),
                options: [...new Set(rows.map((row) => row.combination))].map(
                  (value) => ({ value, label: value })
                ),
              },
              {
                columnId: 'plan',
                title: t('Price plan'),
                allLabel: t('All price plans'),
                options: props.detail.priceGroups.map((plan) => ({
                  value: plan.internalName,
                  label: plan.internalName,
                })),
              },
            ].map((filter) => {
              const column = table.getColumn(filter.columnId)
              const value =
                (column?.getFilterValue() as string[] | undefined)?.[0] ?? 'ALL'
              return (
                <DataTableColumnFilterField
                  key={filter.columnId}
                  label={filter.title}
                  htmlFor={`current-pricing-filter-${filter.columnId}`}
                >
                  <Select
                    value={value}
                    onValueChange={(next) =>
                      column?.setFilterValue(
                        next && next !== 'ALL' ? [next] : undefined
                      )
                    }
                  >
                    <SelectTrigger
                      id={`current-pricing-filter-${filter.columnId}`}
                      className='w-full'
                    >
                      <CanvasLocalizedSelectValue
                        value={value}
                        displayValue={
                          filter.options.find(
                            (option) => option.value === value
                          )?.label ?? filter.allLabel
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='ALL'>{filter.allLabel}</SelectItem>
                      {filter.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DataTableColumnFilterField>
              )
            })}
          </DataTableColumnFilterPanel>
        }
        hasAdditionalFilters={columnFilters.length > 0}
        onReset={() => {
          setColumnFilters([])
          setGlobalFilter('')
          table.setPageIndex(0)
        }}
      />
      <DataTableView
        table={table}
        tableContainerClassName='overflow-x-auto'
        tableClassName={
          flexibleColumn
            ? 'w-full min-w-(--model-pricing-table-min-width) table-fixed'
            : 'w-(--model-pricing-table-min-width) min-w-(--model-pricing-table-min-width) table-fixed'
        }
        containerProps={{
          style: {
            '--model-pricing-table-min-width': `${minimumTableWidth}px`,
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
          const numeric = columnId === 'cost' || columnId === 'price'
          if (section === 'header') {
            return numeric
              ? 'px-2 text-right tabular-nums [&>div]:justify-end [&_button]:justify-end'
              : 'px-2'
          }
          return numeric
            ? 'px-2 py-2 align-middle whitespace-normal text-right tabular-nums'
            : 'px-2 py-2 align-middle whitespace-normal break-words'
        }}
        tableBodyClassName='[&>tr]:h-auto'
        emptyTitle={t('No records found. Try adjusting your filters.')}
      />
      <DataTablePagination table={table} />
    </div>
  )
}

function providerCostSummary(
  rate: CanvasModelPricingProviderRate | null,
  t: (key: string) => string,
  locale?: string
): string {
  if (!rate?.billingUnit) return '—'
  const currency = rate.currency === 'CNY' ? t('RMB') : rate.currency
  const amount =
    rate.billingUnit === 'MILLION_TOKENS'
      ? tokenRateSummary(rate.tokenRates, t)
      : formatExactRmbReference(
          rate.nativeAmount,
          locale,
          rate.currency === 'CNY' ? 2 : undefined
        )
  const exchange =
    rate.currency !== 'CNY'
      ? ` · ${t('Exchange rate')}: ${rate.exchangeRateSnapshot.rate}`
      : ''
  return `${amount} ${currency} / ${billingUnitLabel(rate.billingUnit, t)}${exchange}`
}

function failureCostSummary(
  rate: CanvasModelPricingProviderRate | null,
  t: (key: string) => string,
  locale?: string
): string {
  if (!rate?.failureChargePolicy) return '—'
  const policy = rate.failureChargePolicy
  if (policy.mode !== 'FIXED') return failureChargeLabel(policy.mode, t)
  return `${failureChargeLabel(policy.mode, t)} · ${formatExactRmbReference(policy.nativeAmount ?? '', locale, rate.currency === 'CNY' ? 2 : undefined)} ${rate.currency === 'CNY' ? t('RMB') : rate.currency} / ${billingUnitLabel(rate.billingUnit, t)}`
}

function customerPriceSummary(
  price: CanvasModelPricingPriceSnapshot | null,
  t: (key: string) => string
): string {
  if (!price?.billingUnit) return '—'
  const amount =
    price.billingUnit === 'MILLION_TOKENS'
      ? tokenRateSummary(price.tokenRates, t)
      : price.points
  return `${amount} ${t('points')} / ${billingUnitLabel(price.billingUnit, t)}`
}

function normalizedRmb(nativeAmount: string, exchangeRate: string) {
  return isFixedDecimal(nativeAmount) && isPositiveDecimal(exchangeRate)
    ? nativeAmount
    : ''
}

function isRmbAmount(value: string) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)
}

function amountError(
  value: string,
  kind: 'successful' | 'failed',
  t: (key: string) => string
) {
  if (!value.trim()) {
    return t(
      kind === 'successful'
        ? 'Enter the successful call cost.'
        : 'Enter the failed call cost.'
    )
  }
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return t('Enter a non-negative amount.')
  }
  if (!isRmbAmount(value)) {
    return t('Amounts support at most two decimal places.')
  }
  return undefined
}

function isFixedDecimal(value: string) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(value)
}

function isPositiveDecimal(value: string) {
  return isRmbAmount(value) && Number(value) > 0
}

function isPositiveRmbAmount(value: string) {
  return isRmbAmount(value) && Number(value) > 0
}

function cnyPricingFailureField(error: unknown): {
  parameterCombinationId: string
  priceGroupId: string
  tokenCategory?: CanvasTokenCategory
} | null {
  if (!error || typeof error !== 'object') return null
  const details = (error as { response?: { data?: { details?: unknown } } })
    .response?.data?.details
  if (!details || typeof details !== 'object') return null
  const value = details as Record<string, unknown>
  if (
    value.reason !== 'exactPointConversionRequired' ||
    typeof value.parameterCombinationId !== 'string' ||
    typeof value.priceGroupId !== 'string'
  ) {
    return null
  }
  const tokenCategory = value.tokenCategory
  return {
    parameterCombinationId: value.parameterCombinationId,
    priceGroupId: value.priceGroupId,
    ...(typeof tokenCategory === 'string' &&
    ['input', 'output', 'cacheRead', 'cacheWrite'].includes(tokenCategory)
      ? { tokenCategory: tokenCategory as CanvasTokenCategory }
      : {}),
  }
}

function isNonnegativeInteger(value: string) {
  return /^(?:0|[1-9]\d*)$/.test(value)
}

function hasRequiredTokenRates(
  draft: Pick<
    ScopeDraft | PriceDraft,
    'input' | 'output' | 'cacheRead' | 'cacheWrite'
  >,
  categories: CanvasTokenCategory[]
) {
  return categories.every((category) => isFixedDecimal(draft[category]))
}

function tokenCostFact(
  rate: CanvasModelPricingProviderRate | null | undefined,
  category: CanvasTokenCategory,
  t: (key: string) => string,
  locale: string | undefined
) {
  const amount = rate?.tokenRates?.[category]
  if (amount === undefined || !rate) return t('Not recorded')
  return `${formatExactRmbReference(amount, locale, 8)} ${rate.currency} / ${t('per million tokens')}`
}

function tokenRateSummary(
  rates: CanvasModelPricingTokenRateVector | null,
  t: (key: string) => string,
  formatAmount: (amount: string) => string = (amount) => amount
) {
  if (!rates) return '—'
  return Object.entries(rates)
    .map(([category, amount]) => `${t(category)}: ${formatAmount(amount)}`)
    .join(' · ')
}

function Field(props: {
  id?: string
  label: string
  ariaLabel?: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  className?: string
  unit?: string
}) {
  const id =
    props.id ??
    `model-pricing-${props.label.replaceAll(' ', '-').toLocaleLowerCase()}`
  return (
    <div className={props.className}>
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        aria-label={props.ariaLabel}
        inputMode='decimal'
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={props.onBlur}
        aria-invalid={Boolean(props.error)}
        aria-describedby={
          [props.unit ? `${id}-unit` : '', props.error ? `${id}-error` : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
      />
      {props.unit && (
        <p id={`${id}-unit`} className='text-muted-foreground mt-1 text-xs'>
          {props.unit}
        </p>
      )}
      {props.error && (
        <p
          id={`${id}-error`}
          className='text-destructive mt-1 text-xs'
          role='alert'
        >
          {props.error}
        </p>
      )}
    </div>
  )
}
function TokenFields(props: {
  idPrefix: string
  rmb?: boolean
  showErrors?: boolean
  categories: CanvasTokenCategory[]
  draft: {
    input: string
    output: string
    cacheRead: string
    cacheWrite: string
  }
  onChange: (
    key: 'input' | 'output' | 'cacheRead' | 'cacheWrite',
    value: string
  ) => void
}) {
  const { t } = useTranslation()
  const [touched, setTouched] = useState<
    Partial<Record<CanvasTokenCategory, boolean>>
  >({})
  return (
    <div className='grid gap-3 md:grid-cols-4'>
      {props.categories.map((category) => (
        <Field
          key={category}
          id={`${props.idPrefix}-${category}`}
          label={`${t(category)} · ${t('RMB')} / ${t('per million tokens')}`}
          value={props.draft[category]}
          onChange={(value) => props.onChange(category, value)}
          onBlur={() =>
            setTouched((current) => ({ ...current, [category]: true }))
          }
          error={
            (touched[category] || props.showErrors) &&
            !(props.rmb
              ? isRmbAmount(props.draft[category])
              : isFixedDecimal(props.draft[category]))
              ? t(
                  props.rmb
                    ? 'Enter a valid service provider cost'
                    : 'Enter every required customer token rate'
                )
              : undefined
          }
        />
      ))}
    </div>
  )
}
