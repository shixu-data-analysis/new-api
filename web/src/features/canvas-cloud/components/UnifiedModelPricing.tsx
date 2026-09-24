/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Button } from '@/components/ui/button'
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

import {
  calculateCanvasModelPricingCny,
  getCanvasModelPricingModel,
  getCanvasModelPricingWorkspace,
  previewCanvasModelPricing,
  publishCanvasModelPricing,
} from '../api'
import { pricingLoadErrorTitle } from '../model-pricing-error'
import { formatExactRmbReference } from '../point-conversion-types'
import { pricingScopeLabel as scopeLabel } from '../pricing-scope-label'
import type {
  CanvasBillingUnit,
  CanvasModelPricingCnyScope,
  CanvasModelPricingCnyCalculation,
  CanvasModelPricingCnyCalculationIdentity,
  CanvasModelPricingCnyValue,
  CanvasModelPricingDetail,
  CanvasModelPricingPriceSnapshot,
  CanvasModelPricingTokenRateVector,
  CanvasTokenCategory,
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
import { UnifiedModelPricingHistory } from './UnifiedModelPricingHistory'

type PricingValidationIssue = {
  message: string
  fieldId?: string
  scopeId?: string
  planId?: string
}
type CnyScopeDraft = {
  provider: Record<string, string>
  inviters: Record<string, Record<string, string>>
  customers: Record<string, Record<string, string>>
}

function cnyDraftFields(
  value: CanvasModelPricingCnyValue | null | undefined
): Record<string, string> {
  if (typeof value === 'string') return { scalar: value }
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
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
  inviterDisplayPriceCny: CanvasModelPricingCnyScope['prices'][number]['inviterDisplayPriceCny'],
  customerPriceCny: CanvasModelPricingCnyScope['prices'][number]['customerPriceCny']
) {
  if (!price) return undefined
  return {
    providerSuccessPriceCny,
    inviterDisplayPriceCny,
    customerPriceCny,
    inviterMinusProviderCny: price.inviterMinusProviderCny,
    customerMinusInviterCny: price.customerMinusInviterCny,
  }
}

function completeCnyCalculationScopes(input: {
  detail: CanvasModelPricingDetail
  drafts: Record<string, CnyScopeDraft>
  billingUnit: CanvasBillingUnit
  currentBillingUnit: CanvasBillingUnit | null
  billingUnitState: CanvasModelPricingDetail['model']['billingUnitState']
  tokenCategories: CanvasTokenCategory[]
  activeScopeId: string
  activePriceGroupId: string
}): CanvasModelPricingCnyScope[] | null {
  const fields =
    input.billingUnit === 'MILLION_TOKENS'
      ? input.tokenCategories
      : (['scalar'] as const)
  const isUnitChange =
    input.billingUnitState === 'MIXED' ||
    (input.currentBillingUnit !== null &&
      input.currentBillingUnit !== input.billingUnit)
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
          !fields.every((field) =>
            isRmbAmount4(draft.inviters[price.priceGroupId]?.[field] ?? '')
          ) ||
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
          inviterDisplayPriceCny:
            input.billingUnit === 'MILLION_TOKENS'
              ? cnyTokenRates(
                  draft.inviters[price.priceGroupId],
                  input.tokenCategories
                )
              : (draft.inviters[price.priceGroupId]?.scalar ?? ''),
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
  const [billingUnitChoiceConfirmed, setBillingUnitChoiceConfirmed] =
    useState(true)
  const [cnyDrafts, setCnyDrafts] = useState<Record<string, CnyScopeDraft>>({})
  const [cnyTouched, setCnyTouched] = useState<Record<string, boolean>>({})
  const [cnyFieldErrors, setCnyFieldErrors] = useState<Record<string, string>>(
    {}
  )
  const [cnyHasEdits, setCnyHasEdits] = useState(false)
  const [activeScopeId, setActiveScopeId] = useState('')
  const [activePriceGroupId, setActivePriceGroupId] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [publishIdempotencyKey, setPublishIdempotencyKey] = useState<
    string | null
  >(null)
  const [confirming, setConfirming] = useState(false)
  const [validationErrors, setValidationErrors] = useState<
    PricingValidationIssue[]
  >([])
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const form = useForm<PricingMetaValues>({
    resolver: zodResolver(pricingMetaSchema),
    mode: 'onTouched',
    defaultValues: {
      decisionSummary: '',
      effectiveAt: '',
      effectiveMode: 'IMMEDIATE',
    },
  })
  const decisionSummary = form.watch('decisionSummary')
  const effectiveAt = form.watch('effectiveAt')
  const effectiveMode = form.watch('effectiveMode')
  const [pendingTab, setPendingTab] = useState<
    'current' | 'set' | 'history' | 'back' | null
  >(null)
  const [initializedModelId, setInitializedModelId] = useState<string | null>(
    null
  )
  const pricingRequestStateRef = useRef({
    billingUnit,
    activeScopeId,
    activePriceGroupId,
    cnyDrafts,
  })
  pricingRequestStateRef.current = {
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
    setValidationErrors([])
    setSubmitAttempted(false)
    setPreviewId(null)
    setPublishIdempotencyKey(null)
    setConfirming(false)
    setCnyDrafts({})
    setCnyTouched({})
    setCnyFieldErrors({})
    setCnyHasEdits(false)
    form.reset({
      decisionSummary: '',
      effectiveAt: '',
      effectiveMode: 'IMMEDIATE',
    })
    preview.reset()
    publication.reset()
    setInitializedModelId(null)
  }

  const questionnaireKey = `${activeScopeId}:${activePriceGroupId}`
  const activeCnyScope = cnyDrafts[activeScopeId]
  const cnyDraft: CnyPricingDraft = {
    provider: activeCnyScope?.provider ?? { scalar: '' },
    inviter: activeCnyScope?.inviters[activePriceGroupId] ?? { scalar: '' },
    customer: activeCnyScope?.customers[activePriceGroupId] ?? { scalar: '' },
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
  const selected = detail.data?.model ?? workspaceSelected ?? null
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
    setBillingUnitChoiceConfirmed(selected.billingUnitState !== 'MIXED')
    setCnyDrafts(
      Object.fromEntries(
        detail.data.pricingScopes.map((scope) => {
          const cnyInputs = scope.prices.flatMap((price) =>
            price.current?.originalCnyValues
              ? [[price.priceGroupId, price.current.originalCnyValues] as const]
              : []
          )
          const provider = scope.originalProviderSuccessPriceCny
          return [
            scope.parameterCombinationId,
            {
              provider: cnyDraftFields(provider),
              inviters: Object.fromEntries(
                cnyInputs.map(([priceGroupId, input]) => [
                  priceGroupId,
                  cnyDraftFields(input.inviterDisplayPriceCny),
                ])
              ),
              customers: Object.fromEntries(
                cnyInputs.map(([priceGroupId, input]) => [
                  priceGroupId,
                  cnyDraftFields(input.customerPriceCny),
                ])
              ),
            },
          ]
        })
      )
    )
    setPreviewId(null)
    setPublishIdempotencyKey(null)
    setValidationErrors([])
    setSubmitAttempted(false)
    form.reset({
      decisionSummary: '',
      effectiveAt: '',
      effectiveMode: 'IMMEDIATE',
    })
    setActiveScopeId(
      detail.data.pricingScopes.find((scope) => scope.enabled)
        ?.parameterCombinationId ??
        detail.data.pricingScopes[0]?.parameterCombinationId ??
        ''
    )
    setActivePriceGroupId(detail.data.priceGroups[0]?.id ?? '')
  }, [detail.data, form, initializedModelId, selected])

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
              `${error.parameterCombinationId}:${error.priceGroupId}:${error.field === 'inviterDisplayPriceCny' ? 'inviter' : 'customer'}:${category}`,
              t(
                error.field === 'inviterDisplayPriceCny'
                  ? 'Inviter display price must be at least provider cost.'
                  : 'Customer sale price must be at least inviter display price.'
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
      !selected ||
      !detail.data ||
      !activeScopeId ||
      !activePriceGroupId ||
      !billingUnitChoiceConfirmed
    ) {
      return
    }
    const scopes = completeCnyCalculationScopes({
      detail: detail.data,
      drafts: cnyDrafts,
      billingUnit,
      currentBillingUnit: selected.billingUnit,
      billingUnitState: selected.billingUnitState,
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
    billingUnitChoiceConfirmed,
    calculateCny,
    cnyDrafts,
    detail.data,
    selected,
    cnyRetryRevision,
  ])
  const preview = useMutation({
    mutationFn: ({
      scopes,
      calculationIdentity,
    }: {
      scopes: CanvasModelPricingCnyScope[]
      revision: number
      calculationIdentity: CanvasModelPricingCnyCalculationIdentity
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
      return previewCanvasModelPricing({
        ...common,
        inputMode: 'CNY',
        calculationIdentity,
        scopes,
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
        setLatestCnyCalculation(null)
        setCnyRetryRevision((current) => current + 1)
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
      setConfirming(false)
      setPreviewId(null)
      setPublishIdempotencyKey(null)
      setLatestCnyCalculation(null)
      setCnyRetryRevision(0)
      setCnyDrafts({})
      setCnyTouched({})
      setCnyFieldErrors({})
      setCnyHasEdits(false)
      form.reset({
        decisionSummary: '',
        effectiveAt: '',
        effectiveMode: 'IMMEDIATE',
      })
      toast.success(t('Model pricing published'))
      preview.reset()
      publication.reset()
      await detail.refetch()
      setInitializedModelId(null)
      await queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'model-pricing'],
      })
      setTab('current')
      props.onTabChange?.('current')
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

  const isDirty = Boolean(
    detail.data &&
    (decisionSummary.trim() ||
      effectiveMode === 'SCHEDULED' ||
      billingUnit !==
        (selected?.billingUnit ?? selected?.allowedBillingUnits[0]) ||
      cnyHasEdits)
  )

  function handleBillingUnitChange(next: CanvasBillingUnit) {
    if (next === billingUnit && billingUnitChoiceConfirmed) return
    setBillingUnit(next)
    setBillingUnitChoiceConfirmed(true)
    invalidatePreview()
    setValidationErrors([])
    setCnyDrafts(
      selected?.billingUnitState === 'MIXED'
        ? {}
        : Object.fromEntries(
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
                    provider: {},
                    inviters: {},
                    customers: {},
                  },
                ]
              })
          )
    )
    setCnyTouched({})
    setCnyFieldErrors({})
    setCnyHasEdits(true)
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

  async function requestPreview() {
    if (!selected || !detail.data) return
    if (!billingUnitChoiceConfirmed) return
    const draftRevision = previewRevision.current
    setSubmitAttempted(true)
    const formValid = await form.trigger()
    const currentRequestState = pricingRequestStateRef.current
    if (
      draftRevision !== previewRevision.current ||
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
      selected.billingUnitState === 'MIXED' ||
      (selected.billingUnit !== null && selected.billingUnit !== billingUnit)
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
    const scopes: CanvasModelPricingCnyScope[] = relevantScopes.map((scope) => {
      const scopeDraft = cnyDrafts[scope.parameterCombinationId] ?? {
        provider: {},
        inviters: {},
        customers: {},
      }
      const relevantPrices = scope.prices.filter((price) => {
        if (isUnitChange) return scope.enabled || Boolean(price.current)
        return (
          Boolean(price.current) || price.priceGroupId === activePriceGroupId
        )
      })
      for (const field of fields) {
        if (!isPositiveRmbAmount(scopeDraft.provider[field] ?? '')) {
          const groupId = relevantPrices[0]?.priceGroupId ?? activePriceGroupId
          touched[
            `${scope.parameterCombinationId}:${groupId}:provider:${field}`
          ] = true
          issues.push({
            message: t('Enter an amount above 0 with up to 4 decimals'),
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
          const inviter = scopeDraft.inviters[price.priceGroupId] ?? {}
          const customer = scopeDraft.customers[price.priceGroupId] ?? {}
          for (const field of fields) {
            if (
              !isRmbAmount4(inviter[field] ?? '') ||
              (isPositiveRmbAmount(scopeDraft.provider[field] ?? '') &&
                isRmbAmount4(inviter[field] ?? '') &&
                cnyScaled(inviter[field]) <
                  cnyScaled(scopeDraft.provider[field]))
            ) {
              touched[
                `${scope.parameterCombinationId}:${price.priceGroupId}:inviter:${field}`
              ] = true
              issues.push({
                message: t(
                  'Inviter display price must be at least provider cost, with up to 4 decimals.'
                ),
                scopeId: scope.parameterCombinationId,
                planId: price.priceGroupId,
                fieldId: `cny-pricing-${scope.parameterCombinationId}-${price.priceGroupId}-inviter${field === 'scalar' ? '' : `-${field}`}`,
              })
            }
            if (!isPositiveRmbAmount(customer[field] ?? '')) {
              touched[
                `${scope.parameterCombinationId}:${price.priceGroupId}:customer:${field}`
              ] = true
              issues.push({
                message: t('Enter an amount above 0 with up to 4 decimals'),
                scopeId: scope.parameterCombinationId,
                planId: price.priceGroupId,
                fieldId: `cny-pricing-${scope.parameterCombinationId}-${price.priceGroupId}-customer${field === 'scalar' ? '' : `-${field}`}`,
              })
            } else if (
              isRmbAmount4(inviter[field] ?? '') &&
              cnyScaled(customer[field]) < cnyScaled(inviter[field])
            ) {
              touched[
                `${scope.parameterCombinationId}:${price.priceGroupId}:customer:${field}`
              ] = true
              issues.push({
                message: t(
                  'Customer sale price must be at least inviter display price.'
                ),
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
            inviterDisplayPriceCny:
              billingUnit === 'MILLION_TOKENS'
                ? cnyTokenRates(inviter, selected.tokenCategories)
                : (inviter.scalar ?? ''),
            customerPriceCny:
              billingUnit === 'MILLION_TOKENS'
                ? cnyTokenRates(customer, selected.tokenCategories)
                : (customer.scalar ?? ''),
          }
        }),
      }
    })
    setCnyTouched((current) => ({ ...current, ...touched }))
    if (!formValid || issues.length > 0) {
      setValidationErrors(issues)
      focusPricingIssue(issues[0])
      return
    }
    const readyRequestState = pricingRequestStateRef.current
    if (
      draftRevision !== previewRevision.current ||
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

  const isBillingUnitChange =
    selected.billingUnitState === 'MIXED' ||
    (selected.billingUnit !== null && billingUnit !== selected.billingUnit)
  const activeCnyCalculationPrice = latestCnyCalculation?.scopes
    .find((scope) => scope.parameterCombinationId === activeScopeId)
    ?.prices.find((price) => price.priceGroupId === activePriceGroupId)
  let activeCnyPoints: CanvasModelPricingCnyValue | undefined
  if (latestCnyCalculation?.canPublish) {
    activeCnyPoints =
      billingUnit === 'MILLION_TOKENS'
        ? (activeCnyCalculationPrice?.normalizedTokenRates ?? undefined)
        : activeCnyCalculationPrice?.normalizedPoints
  }
  const activeCnyPreviewCalculation = preview.data?.scopes
    .find((scope) => scope.parameterCombinationId === activeScopeId)
    ?.prices.find((price) => price.priceGroupId === activePriceGroupId)
    ?.proposed?.cnyCalculation
  let activeCnyCalculationDisplay: React.ComponentProps<
    typeof CnyPricingQuestionnaire
  >['calculation'] = activeCnyPreviewCalculation
  if (!activeCnyCalculationDisplay && latestCnyCalculation?.canPublish) {
    activeCnyCalculationDisplay = cnyCalculationDisplay(
      activeCnyCalculationPrice,
      billingUnit === 'MILLION_TOKENS'
        ? cnyTokenRates(cnyDraft.provider, selected.tokenCategories)
        : (cnyDraft.provider.scalar ?? ''),
      billingUnit === 'MILLION_TOKENS'
        ? cnyTokenRates(cnyDraft.inviter, selected.tokenCategories)
        : (cnyDraft.inviter.scalar ?? ''),
      billingUnit === 'MILLION_TOKENS'
        ? cnyTokenRates(cnyDraft.customer, selected.tokenCategories)
        : (cnyDraft.customer.scalar ?? '')
    )
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
  const cnyPreviewComparisons =
    preview.data?.scopes.flatMap((scope) => {
      const draft = cnyDrafts[scope.parameterCombinationId]
      return scope.prices.flatMap((price) => {
        const current = price.current?.originalCnyValues
        const groupName =
          detail.data.priceGroups.find(
            (group) => group.id === price.priceGroupId
          )?.internalName ?? t('Price plan')
        const fields =
          billingUnit === 'MILLION_TOKENS'
            ? selected.tokenCategories
            : (['scalar'] as const)
        return fields.flatMap((field) => {
          const values = [
            {
              label: t('Provider cost'),
              previous: scope.currentProviderRate
                ? detail.data.pricingScopes.find(
                    (item) =>
                      item.parameterCombinationId ===
                      scope.parameterCombinationId
                  )?.originalProviderSuccessPriceCny
                : null,
              next: draft?.provider[field],
            },
            {
              label: t('Inviter (agent) display price'),
              previous: current?.inviterDisplayPriceCny,
              next: draft?.inviters[price.priceGroupId]?.[field],
            },
            {
              label: t('Customer sale price'),
              previous: current?.customerPriceCny,
              next: draft?.customers[price.priceGroupId]?.[field],
            },
          ]
          const rows = values.map(({ label, previous, next }) => {
            let oldValue: string | null | undefined
            if (typeof previous === 'string') oldValue = previous
            else if (field === 'scalar') oldValue = null
            else oldValue = previous?.[field]
            let before = ''
            if (oldValue === null || oldValue === undefined) {
              before = price.current
                ? t('Original RMB value not recorded')
                : t('Not set')
            } else if (oldValue !== next) {
              before = `¥${oldValue}`
            }
            return {
              scope: scopeLabel(
                { key: scope.combinationKey, parameters: scope.parameters },
                t
              ),
              scopeId: scope.parameterCombinationId,
              priceGroupId: price.priceGroupId,
              priceGroup: groupName,
              field: `${billingUnit === 'MILLION_TOKENS' ? `${t(field)} · ` : ''}${label}`,
              before,
              after: `¥${next ?? ''}`,
            }
          })
          const normalized = price.proposed
          return [
            ...rows,
            {
              scope: scopeLabel(
                { key: scope.combinationKey, parameters: scope.parameters },
                t
              ),
              scopeId: scope.parameterCombinationId,
              priceGroupId: price.priceGroupId,
              priceGroup: groupName,
              field: `${billingUnit === 'MILLION_TOKENS' ? `${t(field)} · ` : ''}${t('Converted customer points')}`,
              before: '',
              after: `${field === 'scalar' ? (normalized?.points ?? '—') : (normalized?.tokenRates?.[field] ?? '—')} ${t('points')}`,
            },
          ]
        })
      })
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
        <TabsContent value='set' className='mt-4 max-w-3xl space-y-4'>
          {selected.billingUnitState === 'MIXED' ? (
            <p
              role='alert'
              className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm'
            >
              {t(
                'Published pricing contains mixed billing units. Choose one unit and re-enter every scope and price plan before publishing.'
              )}{' '}
              {selected.publishedBillingUnits
                .map((unit) => billingUnitLabel(unit, t))
                .join(' · ')}
            </p>
          ) : null}
          {detail.data.pricingScopes
            .find((scope) => scope.parameterCombinationId === activeScopeId)
            ?.prices.find((price) => price.priceGroupId === activePriceGroupId)
            ?.current?.inputMode === 'POINTS' ? (
            <p className='rounded-lg border p-3 text-sm'>
              {t('Current active version is legacy points pricing')} ·{' '}
              {t('Original customer points')}:{' '}
              {billingUnit === 'MILLION_TOKENS'
                ? selected.tokenCategories
                    .map(
                      (category) =>
                        `${t(category)} ${detail.data.pricingScopes.find((scope) => scope.parameterCombinationId === activeScopeId)?.prices.find((price) => price.priceGroupId === activePriceGroupId)?.current?.tokenRates?.[category] ?? '—'}`
                    )
                    .join(' · ')
                : detail.data.pricingScopes
                    .find(
                      (scope) => scope.parameterCombinationId === activeScopeId
                    )
                    ?.prices.find(
                      (price) => price.priceGroupId === activePriceGroupId
                    )?.current?.points}{' '}
              {t('points')} / {billingUnitLabel(billingUnit, t)}
            </p>
          ) : null}
          <div
            className={
              selected.allowedBillingUnits.length === 1 &&
              selected.billingUnitState !== 'MIXED'
                ? 'grid gap-3 sm:grid-cols-[max-content_minmax(10rem,16rem)_minmax(0,1fr)] sm:gap-x-6'
                : 'grid gap-3 sm:grid-cols-[minmax(8rem,12rem)_minmax(10rem,16rem)_minmax(0,1fr)]'
            }
          >
            <div className='min-w-0 space-y-2'>
              <Label htmlFor='model-pricing-unit'>{t('Billing unit')}</Label>
              {selected.allowedBillingUnits.length === 1 &&
              selected.billingUnitState !== 'MIXED' ? (
                <p
                  id='model-pricing-unit'
                  className='flex min-h-9 items-center text-sm'
                >
                  {billingUnitLabel(billingUnit, t)}
                </p>
              ) : (
                <Select
                  value={billingUnitChoiceConfirmed ? billingUnit : ''}
                  onValueChange={(value) =>
                    handleBillingUnitChange(value as CanvasBillingUnit)
                  }
                >
                  <SelectTrigger id='model-pricing-unit' className='w-full'>
                    <SelectValue placeholder={t('Billing unit')}>
                      {billingUnitChoiceConfirmed
                        ? billingUnitLabel(billingUnit, t)
                        : undefined}
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
          <div className='space-y-3'>
            {cnyCalculation.isPending ? (
              <p role='status'>{t('Calculating...')}</p>
            ) : null}
            {cnyCalculationError ? (
              <div role='alert' className='space-y-2'>
                <p>{t('Pricing preview could not be created')}</p>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setCnyRetryRevision((current) => current + 1)}
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
                    let value: string | undefined
                    if (field.startsWith('provider:')) {
                      value = cnyDraft.provider[field.slice('provider:'.length)]
                    } else if (field.startsWith('inviter:')) {
                      value = cnyDraft.inviter[field.slice('inviter:'.length)]
                    } else {
                      value = cnyDraft.customer[field.slice('customer:'.length)]
                    }
                    return [
                      field,
                      cnyFieldErrors[key] ??
                        ((
                          field.startsWith('inviter:')
                            ? isRmbAmount4(value ?? '')
                            : isPositiveRmbAmount(value ?? '')
                        )
                          ? undefined
                          : t(
                              field.startsWith('inviter:')
                                ? 'Enter an amount of at least 0 with up to 4 decimals'
                                : 'Enter an amount above 0 with up to 4 decimals'
                            )),
                    ]
                  })
              )}
              calculation={activeCnyCalculationDisplay}
              points={activeCnyPoints}
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
                    inviters: {},
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
                  if (side === 'inviter') {
                    return {
                      ...current,
                      [activeScopeId]: {
                        ...scopeDraft,
                        inviters: {
                          ...scopeDraft.inviters,
                          [activePriceGroupId]: {
                            ...scopeDraft.inviters[activePriceGroupId],
                            [field]: value,
                          },
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
                      disabled={
                        selected.billingUnitState === 'MIXED' &&
                        mode === 'SCHEDULED'
                      }
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
                preview.isPending ||
                publication.isPending ||
                !billingUnitChoiceConfirmed
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
        comparisonRows={cnyPreviewComparisons}
        compact
        cancelLabel={t('Return to editing')}
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
        header: t('Provider cost'),
        meta: {
          label: t('Provider cost'),
          className: 'text-right tabular-nums',
        },
        cell: ({ row }) => {
          const original = row.original.scope.originalProviderSuccessPriceCny
          if (original) {
            return (
              <span className='whitespace-normal'>
                {cnyValueSummary(
                  original,
                  row.original.price.current?.billingUnit ??
                    row.original.scope.currentProviderRate?.billingUnit ??
                    'REQUEST',
                  t
                )}
              </span>
            )
          }
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
        id: 'inviter',
        size: 208,
        header: t('Inviter (agent) display price'),
        meta: {
          label: t('Inviter (agent) display price'),
          className: 'text-right tabular-nums',
        },
        cell: ({ row }) => {
          const value =
            row.original.price.current?.originalCnyValues
              ?.inviterDisplayPriceCny
          return value
            ? cnyValueSummary(
                value,
                row.original.price.current?.billingUnit ?? 'REQUEST',
                t
              )
            : t('Not recorded')
        },
      },
      {
        id: 'price',
        size: 208,
        header: t('Customer sale price'),
        meta: {
          label: t('Customer sale price'),
          className: 'text-right tabular-nums',
        },
        cell: ({ row }) => {
          const price = row.original.price.current
          if (!price) return <span>{t('Not priced')}</span>
          const original = price.originalCnyValues?.customerPriceCny
          return (
            <span className='whitespace-normal'>
              {original ? (
                <>{cnyValueSummary(original, price.billingUnit, t)} · </>
              ) : null}
              {customerPriceSummary(price, t)}
            </span>
          )
        },
      },
      {
        id: 'scheduled',
        size: 256,
        header: t('Scheduled price'),
        meta: {
          label: t('Scheduled price'),
          className: 'text-right tabular-nums',
        },
        cell: ({ row }) => {
          const scheduled = row.original.price.scheduled
          if (!scheduled) return <span>—</span>
          const original = scheduled.originalCnyValues?.customerPriceCny
          return (
            <div className='space-y-1 whitespace-normal'>
              <p>
                {t('Effective at')}:{' '}
                {scheduled.effectiveAt
                  ? `${new Date(scheduled.effectiveAt).toLocaleString(locale)} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
                  : t('Not recorded')}
              </p>
              <p>
                {original ? (
                  <>{cnyValueSummary(original, scheduled.billingUnit, t)} · </>
                ) : null}
                {customerPriceSummary(scheduled, t)}
              </p>
            </div>
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
          const numeric =
            columnId === 'cost' ||
            columnId === 'price' ||
            columnId === 'scheduled'
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

function cnyValueSummary(
  value: CanvasModelPricingCnyValue,
  unit: CanvasBillingUnit,
  t: (key: string) => string
): string {
  const amount = typeof value === 'string' ? value : tokenRateSummary(value, t)
  return `${amount} ${t('RMB')} / ${billingUnitLabel(unit, t)}`
}

function isPositiveRmbAmount(value: string) {
  return isRmbAmount4(value) && Number(value) > 0
}

function isRmbAmount4(value: string) {
  return /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)
}

function cnyScaled(value: string): bigint {
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'))
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
