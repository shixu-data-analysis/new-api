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
import { useMutation, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Calculator } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import {
  getCanvasPointIssuanceRates,
  getCanvasAdminTestingModels,
  publishConfirmedCanvasInitialPrice,
  publishConfirmedCanvasPointIssuanceRate,
  publishConfirmedCanvasPriceChange,
} from '../api'
import {
  DEFAULT_TARGET_MARGIN_PERCENT,
  calculateQuestionnairePricing,
  probabilityDecimalToPercent,
  probabilityPercentToDecimal,
  type PricingQuestionnaireAnswers,
} from '../pricing-simulation'
import type {
  CanvasAdminWorkspace,
  CanvasPointIssuanceRateVersion,
} from '../types'
import { BusinessTerm } from './BusinessTerm'
import { PriceGroupManagement } from './PriceGroupManagement'
import { PricingActionConfirmation } from './PricingActionConfirmation'
import { PricingQuestionnaire } from './PricingQuestionnaire'
import { PricingRecordsTable } from './PricingRecordsTable'
import { PricingTableColumnHeader } from './PricingTableColumnHeader'

type Price = CanvasAdminWorkspace['prices'][number]

const fieldKeys = [
  'MODEL',
  'PRICE_GROUP',
  'COMBINATION',
  'VERSION',
  'STATUS',
  'POINTS',
  'BASE_RATE',
  'ISSUANCE_RATE',
  'RATE_VERSION',
  'RATE_STATUS',
  'RATE_DECISION',
  'RATE_CREATED',
  'RATE_APPROVED',
  'RATE_EFFECTIVE',
  'APPROVAL_REASON',
  'TARGET_MARGIN_RATE',
  'SUCCESS_PROBABILITY',
  'K_THEORY',
  'SUCCESS_COST',
  'FAILURE_COST',
  'OTHER_COST',
  'K_ACTUAL',
  'K_PRICING',
  'RISK_BUFFER',
  'BREAK_EVEN',
  'TARGET_MARGIN_POINTS',
  'ASSUMPTIONS',
  'DECISION',
  'CREATED',
  'APPROVED',
  'EFFECTIVE',
  'ACTION',
] as const

function PricingField(props: { value: (typeof fieldKeys)[number] }) {
  return <BusinessTerm kind='pricingField' value={props.value} />
}

function pricingColumn<TData>(
  id: string,
  term: (typeof fieldKeys)[number],
  accessorFn: (row: TData) => unknown,
  cell: (row: TData) => React.ReactNode
): ColumnDef<TData, unknown> {
  return {
    id,
    accessorFn,
    header: ({ column }) => (
      <PricingTableColumnHeader column={column} term={term} />
    ),
    cell: ({ row }) => cell(row.original),
  }
}

function dateTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
}

function businessDecimal(value: string, maximumFractionDigits = 2): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(numeric)
}

function editableDecimal(value: string): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return numeric.toFixed(2).replace(/\.?0+$/, '')
}

function visiblePricingAssumptions(
  snapshot: Record<string, unknown>
): Record<string, unknown> {
  const {
    decisionSummary: _decision,
    evidenceRefs: _evidence,
    ...visible
  } = snapshot
  return visible
}

function serverErrorPayload(error: unknown): {
  code: string | null
  message: string | null
} {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return { code: null, message: null }
  }
  const response = error.response
  if (!response || typeof response !== 'object' || !('data' in response)) {
    return { code: null, message: null }
  }
  const data = response.data
  if (!data || typeof data !== 'object') {
    return { code: null, message: null }
  }
  return {
    code: 'code' in data && typeof data.code === 'string' ? data.code : null,
    message:
      'message' in data && typeof data.message === 'string'
        ? data.message
        : null,
  }
}

export function AdminPricing(props: {
  prices: Price[]
  onChanged: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('prices')
  const [confirmation, setConfirmation] = useState<
    { kind: 'create-price' } | { kind: 'create-rate' } | null
  >(null)
  const published = useMemo(
    () => props.prices.filter((price) => price.status === 'PUBLISHED'),
    [props.prices]
  )
  const testingModels = useQuery({
    queryKey: ['canvas-cloud', 'admin-testing-models'],
    queryFn: getCanvasAdminTestingModels,
    enabled: activeTab === 'prices',
  })
  const initialTargets = useMemo(
    () =>
      (testingModels.data ?? []).flatMap((model) =>
        model.pricingTargets
          .filter((target) => !target.priced)
          .map((target) => ({ model, target }))
      ),
    [testingModels.data]
  )
  const [selectedId, setSelectedId] = useState(published[0]?.id ?? '')
  const selected =
    published.find((price) => price.id === selectedId) ?? published[0]
  const selectedInitial = initialTargets.find(
    ({ model, target }) =>
      `initial:${model.id}:${target.priceGroupId}:${target.parameterCombinationId}` ===
      selectedId
  )
  useEffect(() => {
    if (!selectedId && initialTargets[0]) {
      const { model, target } = initialTargets[0]
      setSelectedId(
        `initial:${model.id}:${target.priceGroupId}:${target.parameterCombinationId}`
      )
    }
  }, [initialTargets, selectedId])
  const [form, setForm] = useState({
    points: '',
    targetMarginPercent: DEFAULT_TARGET_MARGIN_PERCENT,
    successProbabilityPercent: '90',
    successfulTaskCostRmb: '0',
    failedUnrecoverableCostRmb: '0',
    otherVariableCostRmb: '0',
    riskBufferRmb: '0',
    decisionSummary: '',
  })
  const [priceTouched, setPriceTouched] = useState({
    points: false,
    targetMarginPercent: false,
    successProbabilityPercent: false,
    successfulTaskCostRmb: false,
    failedUnrecoverableCostRmb: false,
    otherVariableCostRmb: false,
    riskBufferRmb: false,
    decisionSummary: false,
  })
  const [priceSubmitted, setPriceSubmitted] = useState(false)
  const [rateForm, setRateForm] = useState({
    pointsPerRmb: '',
    decisionSummary: '',
  })
  const [rateTouched, setRateTouched] = useState({
    pointsPerRmb: false,
    decisionSummary: false,
  })
  const [rateSubmitted, setRateSubmitted] = useState(false)
  const rates = useQuery({
    queryKey: ['canvas-cloud', 'point-issuance-rates'],
    queryFn: getCanvasPointIssuanceRates,
    enabled: activeTab === 'rate' || activeTab === 'prices',
  })
  const trimmedRate = rateForm.pointsPerRmb.trim()
  const trimmedDecision = rateForm.decisionSummary.trim()
  const rateInputValid =
    /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(trimmedRate) &&
    Number(trimmedRate) > 0
  let rateValueError: string | null = null
  if (trimmedRate.length === 0) {
    rateValueError = t('This field is required')
  } else if (!rateInputValid) {
    rateValueError = t('Enter a positive value with up to 2 decimals')
  }
  let rateDecisionError: string | null = null
  if (trimmedDecision.length > 2000) {
    rateDecisionError = t('Use no more than 2000 characters')
  }
  const rateErrors = {
    pointsPerRmb: rateValueError,
    decisionSummary: rateDecisionError,
  }
  const rateFormValid = Object.values(rateErrors).every(
    (error) => error === null
  )
  const showRateError = (field: keyof typeof rateTouched) =>
    rateSubmitted || rateTouched[field]

  const priceValues = {
    points: form.points.trim(),
    targetMarginPercent: form.targetMarginPercent.trim(),
    targetMarginRate: probabilityPercentToDecimal(
      form.targetMarginPercent.trim()
    ),
    successProbabilityPercent: form.successProbabilityPercent.trim(),
    successProbability: probabilityPercentToDecimal(
      form.successProbabilityPercent.trim()
    ),
    successfulTaskCostRmb: form.successfulTaskCostRmb.trim(),
    failedUnrecoverableCostRmb: form.failedUnrecoverableCostRmb.trim(),
    otherVariableCostRmb: form.otherVariableCostRmb.trim(),
    riskBufferRmb: form.riskBufferRmb.trim(),
    decisionSummary: form.decisionSummary.trim(),
  }
  const decimalUpToTwo = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/
  const decimalUpToEight = /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/
  const requiredPriceError = (
    value: string,
    valid: boolean,
    invalidMessage: string
  ) => {
    if (value.length === 0) return t('This field is required')
    if (!valid) return t(invalidMessage)
    return null
  }
  const priceErrors = {
    points: requiredPriceError(
      priceValues.points,
      /^[1-9]\d*$/.test(priceValues.points),
      'Enter a positive integer'
    ),
    targetMarginPercent: requiredPriceError(
      priceValues.targetMarginPercent,
      decimalUpToTwo.test(priceValues.targetMarginPercent) &&
        Number(priceValues.targetMarginPercent) >= 0 &&
        Number(priceValues.targetMarginPercent) < 100,
      'Enter a percentage from 0 to below 100, with up to 2 decimals'
    ),
    successProbabilityPercent: requiredPriceError(
      priceValues.successProbabilityPercent,
      decimalUpToTwo.test(priceValues.successProbabilityPercent) &&
        Number(priceValues.successProbabilityPercent) > 0 &&
        Number(priceValues.successProbabilityPercent) <= 100,
      'Enter a percentage above 0 and at most 100, with up to 2 decimals'
    ),
    successfulTaskCostRmb: requiredPriceError(
      priceValues.successfulTaskCostRmb,
      decimalUpToEight.test(priceValues.successfulTaskCostRmb),
      'Enter a non-negative value with up to 8 decimals'
    ),
    failedUnrecoverableCostRmb: requiredPriceError(
      priceValues.failedUnrecoverableCostRmb,
      decimalUpToEight.test(priceValues.failedUnrecoverableCostRmb),
      'Enter a non-negative value with up to 8 decimals'
    ),
    otherVariableCostRmb: requiredPriceError(
      priceValues.otherVariableCostRmb,
      decimalUpToEight.test(priceValues.otherVariableCostRmb),
      'Enter a non-negative value with up to 8 decimals'
    ),
    riskBufferRmb: requiredPriceError(
      priceValues.riskBufferRmb,
      decimalUpToEight.test(priceValues.riskBufferRmb),
      'Enter a non-negative value with up to 8 decimals'
    ),
    decisionSummary:
      priceValues.decisionSummary.length > 2_000
        ? t('Use no more than 2000 characters')
        : null,
  }
  const priceFormValid = Object.values(priceErrors).every(
    (error) => error === null
  )
  const showPriceError = (field: keyof typeof priceTouched) =>
    priceSubmitted || priceTouched[field]
  const publishedIssuanceRate = rates.data?.find(
    (rate) => rate.status === 'PUBLISHED'
  )
  const questionnaireAnswers: PricingQuestionnaireAnswers = {
    targetMarginPercent: priceValues.targetMarginPercent,
    successProbabilityPercent: priceValues.successProbabilityPercent,
    successfulTaskCostRmb: priceValues.successfulTaskCostRmb,
    failedUnrecoverableCostRmb: priceValues.failedUnrecoverableCostRmb,
    otherVariableCostRmb: priceValues.otherVariableCostRmb,
    riskBufferRmb: priceValues.riskBufferRmb,
    proposedPoints: priceValues.points,
  }
  const questionnaireRate =
    publishedIssuanceRate?.pointsPerRmb ?? selected?.baseRatePointsPerRmb ?? '0'
  const questionnaireResult = calculateQuestionnairePricing(
    questionnaireAnswers,
    questionnaireRate
  )

  useEffect(() => {
    const current = rates.data?.find((rate) => rate.status === 'PUBLISHED')
    if (!current) return
    setRateForm((form) =>
      form.pointsPerRmb
        ? form
        : { ...form, pointsPerRmb: businessDecimal(current.pointsPerRmb) }
    )
  }, [rates.data])

  useEffect(() => {
    if (selectedInitial) {
      setForm((current) => ({
        ...current,
        points: '',
        targetMarginPercent: DEFAULT_TARGET_MARGIN_PERCENT,
        successProbabilityPercent: '90',
        successfulTaskCostRmb: '0',
        failedUnrecoverableCostRmb: '0',
        otherVariableCostRmb: '0',
        riskBufferRmb: '0',
      }))
      return
    }
    if (!selected) return
    const assumptions = selected.pricingAssumptionsSnapshot
    setForm((current) => ({
      ...current,
      points: selected.points,
      targetMarginPercent: probabilityDecimalToPercent(
        selected.targetMarginRate
      ),
      successProbabilityPercent: probabilityDecimalToPercent(
        selected.successProbability
      ),
      successfulTaskCostRmb:
        typeof assumptions.successfulTaskCostRmb === 'string'
          ? editableDecimal(assumptions.successfulTaskCostRmb)
          : editableDecimal(selected.kTheoryRmb),
      failedUnrecoverableCostRmb:
        typeof assumptions.failedUnrecoverableCostRmb === 'string'
          ? editableDecimal(assumptions.failedUnrecoverableCostRmb)
          : '0',
      otherVariableCostRmb:
        typeof assumptions.otherVariableCostRmb === 'string'
          ? editableDecimal(assumptions.otherVariableCostRmb)
          : '0',
      riskBufferRmb: editableDecimal(selected.riskBufferRmb),
    }))
  }, [selected, selectedInitial])

  const changed = async () => {
    await props.onChanged()
  }
  const publishPrice = useMutation({
    mutationFn: async () => {
      if (selectedInitial) {
        return publishConfirmedCanvasInitialPrice({
          customerModelId: selectedInitial.model.id,
          priceGroupId: selectedInitial.target.priceGroupId,
          parameterCombinationId: selectedInitial.target.parameterCombinationId,
          points: priceValues.points,
          targetMarginRate: priceValues.targetMarginRate,
          successProbability: priceValues.successProbability,
          successfulTaskCostRmb: priceValues.successfulTaskCostRmb,
          failedUnrecoverableCostRmb: priceValues.failedUnrecoverableCostRmb,
          otherVariableCostRmb: priceValues.otherVariableCostRmb,
          riskBufferRmb: priceValues.riskBufferRmb,
          ...(priceValues.decisionSummary
            ? { decisionSummary: priceValues.decisionSummary }
            : {}),
        })
      }
      if (!selected) throw new Error('No published price selected')
      return publishConfirmedCanvasPriceChange({
        sourcePriceVersionId: selected.id,
        points: priceValues.points,
        targetMarginRate: priceValues.targetMarginRate,
        successProbability: priceValues.successProbability,
        successfulTaskCostRmb: priceValues.successfulTaskCostRmb,
        failedUnrecoverableCostRmb: priceValues.failedUnrecoverableCostRmb,
        otherVariableCostRmb: priceValues.otherVariableCostRmb,
        riskBufferRmb: priceValues.riskBufferRmb,
        ...(priceValues.decisionSummary
          ? { decisionSummary: priceValues.decisionSummary }
          : {}),
      })
    },
    onSuccess: async () => {
      setConfirmation(null)
      toast.success(t('Price published'))
      setForm((current) => ({ ...current, decisionSummary: '' }))
      setPriceTouched({
        points: false,
        targetMarginPercent: false,
        successProbabilityPercent: false,
        successfulTaskCostRmb: false,
        failedUnrecoverableCostRmb: false,
        otherVariableCostRmb: false,
        riskBufferRmb: false,
        decisionSummary: false,
      })
      setPriceSubmitted(false)
      await changed()
      await testingModels.refetch()
    },
    onError: () => toast.error(t('Price publication failed')),
  })
  const refreshRates = async () => {
    await Promise.all([rates.refetch(), changed()])
  }
  const createRate = useMutation({
    mutationFn: () =>
      publishConfirmedCanvasPointIssuanceRate({
        pointsPerRmb: trimmedRate,
        ...(trimmedDecision ? { decisionSummary: trimmedDecision } : {}),
      }),
    onSuccess: async () => {
      setConfirmation(null)
      toast.success(t('Point issuance rate published'))
      setRateForm((current) => ({
        ...current,
        decisionSummary: '',
      }))
      setRateTouched({
        pointsPerRmb: false,
        decisionSummary: false,
      })
      setRateSubmitted(false)
      await refreshRates()
    },
    onError: (error) => {
      const failure = serverErrorPayload(error)
      let description: string
      if (failure.code === 'VALIDATION_FAILED') {
        description = t(
          'The submitted rate change did not pass server validation. Check the field requirements and try again.'
        )
      } else if (failure.code === 'UNAUTHORIZED') {
        description = t(
          'You are not authorized to manage point issuance rates.'
        )
      } else if (failure.code === 'IDEMPOTENCY_CONFLICT') {
        description = t(
          'This request conflicts with an earlier submission. Refresh the page and try again.'
        )
      } else if (failure.code === 'INVALID_STATE_TRANSITION') {
        description = t(
          'The rate workflow state changed. Refresh the page and try again.'
        )
      } else if (failure.message) {
        description = t('Server response: {{reason}}', {
          reason: failure.message,
        })
      } else {
        description = t(
          'The request failed before the server returned a reason.'
        )
      }
      toast.error(t('Point issuance rate publication failed'), {
        description,
        closeButton: false,
      })
    },
  })
  const rateColumns = useMemo<
    ColumnDef<CanvasPointIssuanceRateVersion, unknown>[]
  >(
    () => [
      pricingColumn(
        'version',
        'RATE_VERSION',
        (rate) => rate.version,
        (rate) => `v${rate.version}`
      ),
      pricingColumn(
        'status',
        'RATE_STATUS',
        (rate) => t(rate.status),
        (rate) => t(rate.status)
      ),
      pricingColumn(
        'rate',
        'ISSUANCE_RATE',
        (rate) => Number(rate.pointsPerRmb),
        (rate) => `${businessDecimal(rate.pointsPerRmb)} ${t('points per RMB')}`
      ),
      pricingColumn(
        'created',
        'RATE_CREATED',
        (rate) => rate.createdAt,
        (rate) => dateTime(rate.createdAt)
      ),
      pricingColumn(
        'approved',
        'RATE_APPROVED',
        (rate) => rate.approvedAt ?? '',
        (rate) => dateTime(rate.approvedAt)
      ),
      pricingColumn(
        'effective',
        'RATE_EFFECTIVE',
        (rate) => rate.effectiveAt ?? '',
        (rate) => dateTime(rate.effectiveAt)
      ),
    ],
    [t]
  )
  const rateFilters = useMemo(
    () => [
      { columnId: 'version', label: t('Rate version') },
      { columnId: 'status', label: t('Status') },
      { columnId: 'rate', label: t('Point issuance rate') },
      { columnId: 'created', label: t('Created') },
      { columnId: 'approved', label: t('Approved') },
      { columnId: 'effective', label: t('Effective') },
    ],
    [t]
  )
  const priceColumns = useMemo<ColumnDef<Price, unknown>[]>(
    () => [
      pricingColumn(
        'model',
        'MODEL',
        (price) => `${price.modelName} ${price.modelKey}`,
        (price) => (
          <div className='min-w-48'>
            <div className='font-medium'>{price.modelName}</div>
            <div className='text-muted-foreground text-xs'>
              {price.modelKey}
            </div>
          </div>
        )
      ),
      pricingColumn(
        'priceGroup',
        'PRICE_GROUP',
        (price) => `${price.priceGroup} ${price.priceGroupCode}`,
        (price) => (
          <div className='min-w-44'>
            <div>{price.priceGroup}</div>
            <div className='text-muted-foreground text-xs'>
              {price.priceGroupCode}
            </div>
          </div>
        )
      ),
      pricingColumn(
        'combination',
        'COMBINATION',
        (price) => price.combinationKey,
        (price) => price.combinationKey
      ),
      pricingColumn(
        'version',
        'VERSION',
        (price) => price.version,
        (price) => `v${price.version}`
      ),
      pricingColumn(
        'status',
        'STATUS',
        (price) => t(price.status),
        (price) => t(price.status)
      ),
      pricingColumn(
        'points',
        'POINTS',
        (price) => Number(price.points),
        (price) => `${price.points} ${t('points')}`
      ),
      pricingColumn(
        'baseRate',
        'BASE_RATE',
        (price) => Number(price.baseRatePointsPerRmb),
        (price) =>
          `${businessDecimal(price.baseRatePointsPerRmb)} ${t('points per RMB')}`
      ),
      pricingColumn(
        'targetMargin',
        'TARGET_MARGIN_RATE',
        (price) => Number(price.targetMarginRate),
        (price) => `${Number(price.targetMarginRate) * 100}%`
      ),
      pricingColumn(
        'successProbability',
        'SUCCESS_PROBABILITY',
        (price) => Number(price.successProbability),
        (price) => businessDecimal(price.successProbability)
      ),
      pricingColumn(
        'successCost',
        'SUCCESS_COST',
        (price) =>
          Number(price.pricingAssumptionsSnapshot.successfulTaskCostRmb ?? 0),
        (price) =>
          `${businessDecimal(String(price.pricingAssumptionsSnapshot.successfulTaskCostRmb ?? 0))} ${t('RMB')}`
      ),
      pricingColumn(
        'failureCost',
        'FAILURE_COST',
        (price) =>
          Number(
            price.pricingAssumptionsSnapshot.failedUnrecoverableCostRmb ?? 0
          ),
        (price) =>
          `${businessDecimal(String(price.pricingAssumptionsSnapshot.failedUnrecoverableCostRmb ?? 0))} ${t('RMB')}`
      ),
      pricingColumn(
        'otherCost',
        'OTHER_COST',
        (price) =>
          Number(price.pricingAssumptionsSnapshot.otherVariableCostRmb ?? 0),
        (price) =>
          `${businessDecimal(String(price.pricingAssumptionsSnapshot.otherVariableCostRmb ?? 0))} ${t('RMB')}`
      ),
      pricingColumn(
        'kTheory',
        'K_THEORY',
        (price) => Number(price.kTheoryRmb),
        (price) => `${businessDecimal(price.kTheoryRmb)} ${t('RMB')}`
      ),
      pricingColumn(
        'kActual',
        'K_ACTUAL',
        (price) => (price.kActualRmb === null ? -1 : Number(price.kActualRmb)),
        (price) =>
          price.kActualRmb === null
            ? t('Not eligible or unavailable')
            : `${businessDecimal(price.kActualRmb)} ${t('RMB')}`
      ),
      pricingColumn(
        'kPricing',
        'K_PRICING',
        (price) => Number(price.kPricingRmb),
        (price) => `${businessDecimal(price.kPricingRmb)} ${t('RMB')}`
      ),
      pricingColumn(
        'riskBuffer',
        'RISK_BUFFER',
        (price) => Number(price.riskBufferRmb),
        (price) => `${businessDecimal(price.riskBufferRmb)} ${t('RMB')}`
      ),
      pricingColumn(
        'breakEven',
        'BREAK_EVEN',
        (price) => Number(price.breakEvenPoints),
        (price) => `${price.breakEvenPoints} ${t('points')}`
      ),
      pricingColumn(
        'targetMarginPoints',
        'TARGET_MARGIN_POINTS',
        (price) => Number(price.targetMarginPoints),
        (price) => `${price.targetMarginPoints} ${t('points')}`
      ),
      pricingColumn(
        'created',
        'CREATED',
        (price) => price.createdAt,
        (price) => dateTime(price.createdAt)
      ),
      pricingColumn(
        'approved',
        'APPROVED',
        (price) => price.approvedAt ?? '',
        (price) => dateTime(price.approvedAt)
      ),
      pricingColumn(
        'effective',
        'EFFECTIVE',
        (price) => price.effectiveAt ?? '',
        (price) => dateTime(price.effectiveAt)
      ),
      pricingColumn(
        'assumptions',
        'ASSUMPTIONS',
        (price) =>
          JSON.stringify(
            visiblePricingAssumptions(price.pricingAssumptionsSnapshot)
          ),
        (price) => {
          const assumptions = visiblePricingAssumptions(
            price.pricingAssumptionsSnapshot
          )
          return (
            <details className='max-w-80 min-w-48'>
              <summary className='cursor-pointer text-sm font-medium'>
                {t('Show pricing assumptions')}
              </summary>
              <pre className='bg-muted/40 mt-2 max-h-56 overflow-auto rounded-md p-2 text-xs whitespace-pre-wrap'>
                {JSON.stringify(assumptions, null, 2)}
              </pre>
            </details>
          )
        }
      ),
    ],
    [t]
  )
  const priceFilters = useMemo(
    () =>
      [
        ['model', 'Model'],
        ['priceGroup', 'Price group'],
        ['combination', 'Parameter combination'],
        ['version', 'Version'],
        ['status', 'Status'],
        ['points', 'Points'],
        ['baseRate', 'Base rate'],
        ['targetMargin', 'Target margin rate'],
        ['successProbability', 'Success probability'],
        ['successCost', 'Successful task cost'],
        ['failureCost', 'Failed unrecoverable cost'],
        ['otherCost', 'Other variable cost'],
        ['kTheory', 'K_theory'],
        ['kActual', 'K_actual'],
        ['kPricing', 'K_pricing'],
        ['riskBuffer', 'Risk buffer'],
        ['breakEven', 'Break-even'],
        ['targetMarginPoints', 'Target margin floor'],
        ['created', 'Created'],
        ['approved', 'Approved'],
        ['effective', 'Effective'],
        ['assumptions', 'Pricing assumptions'],
      ].map(([columnId, label]) => ({ columnId, label: t(label) })),
    [t]
  )

  const confirmationDetails = (() => {
    if (!confirmation) return []
    if (confirmation.kind === 'create-rate') {
      return [
        {
          label: t('Point issuance rate'),
          value: `${trimmedRate} ${t('points per RMB')}`,
        },
        {
          label: t('Decision summary'),
          value: trimmedDecision || t('Not provided'),
        },
      ]
    }
    if (confirmation.kind === 'create-price') {
      return [
        {
          label: t('Published price source'),
          value: selectedInitial?.model.name ?? selected?.modelName ?? '—',
        },
        { label: t('Points'), value: `${priceValues.points} ${t('points')}` },
        {
          label: t('Target margin rate'),
          value: `${priceValues.targetMarginPercent}%`,
        },
        {
          label: t('Expected success rate'),
          value: `${priceValues.successProbabilityPercent}%`,
        },
        {
          label: t('Service provider cost when successful'),
          value: `${priceValues.successfulTaskCostRmb} ${t('RMB')}`,
        },
        {
          label: t('Unrecoverable service provider cost when failed'),
          value: `${priceValues.failedUnrecoverableCostRmb} ${t('RMB')}`,
        },
        {
          label: t('Other variable cost for every attempt'),
          value: `${priceValues.otherVariableCostRmb} ${t('RMB')}`,
        },
        {
          label: t('Risk buffer'),
          value: `${priceValues.riskBufferRmb} ${t('RMB')}`,
        },
        ...(questionnaireResult
          ? [
              {
                label: t('Break-even'),
                value: `${questionnaireResult.breakEvenPoints} ${t('points')}`,
              },
              {
                label: t('Target margin floor'),
                value: `${questionnaireResult.targetMarginPoints} ${t('points')}`,
              },
            ]
          : []),
      ]
    }
    return []
  })()

  const confirmAction = () => {
    if (!confirmation) return
    if (confirmation.kind === 'create-price') publishPrice.mutate()
    if (confirmation.kind === 'create-rate') createRate.mutate()
  }

  const confirmationPending = publishPrice.isPending || createRate.isPending

  return (
    <div className='mx-auto w-full max-w-7xl space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Canvas pricing')}</CardTitle>
          <CardAction>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => {
                const popup = window.open(
                  '/canvas-cloud/pricing-calculator',
                  'canvas-pricing-calculator',
                  'popup=yes,width=760,height=900,resizable=yes,scrollbars=yes'
                )
                popup?.focus()
              }}
            >
              <Calculator />
              {t('Open pricing calculator')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className='h-auto max-w-full flex-wrap justify-start gap-1'>
              <TabsTrigger className='min-h-9 px-3' value='prices'>
                {t('Model prices')}
              </TabsTrigger>
              <TabsTrigger className='min-h-9 px-3' value='groups'>
                {t('Price groups')}
              </TabsTrigger>
              <TabsTrigger className='min-h-9 px-3' value='rate'>
                {t('Point issuance rate')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {activeTab === 'rate' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('Point issuance rate')}</CardTitle>
            <CardDescription>
              {t(
                'The published rate applies only to new prices and new recharge facts. Historical snapshots are never recalculated.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <form
              aria-label={t('Adjust point issuance rate')}
              className='bg-muted/20 max-w-5xl overflow-hidden rounded-xl border'
              onSubmit={(event) => {
                event.preventDefault()
                setRateSubmitted(true)
                if (!rateFormValid) return
                setConfirmation({ kind: 'create-rate' })
              }}
            >
              <div className='border-b px-4 py-3'>
                <div className='text-sm font-medium'>
                  {t('Adjust point issuance rate')}
                </div>
              </div>
              <div className='space-y-4 p-4'>
                <div className='grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]'>
                  <div className='space-y-1'>
                    <Label htmlFor='issuance-rate-value'>
                      <PricingField value='ISSUANCE_RATE' />
                      <span
                        className='text-destructive ml-1'
                        aria-hidden='true'
                      >
                        *
                      </span>
                    </Label>
                    <Input
                      id='issuance-rate-value'
                      inputMode='decimal'
                      value={rateForm.pointsPerRmb}
                      onChange={(event) =>
                        setRateForm((current) => ({
                          ...current,
                          pointsPerRmb: event.target.value,
                        }))
                      }
                      onBlur={() =>
                        setRateTouched((current) => ({
                          ...current,
                          pointsPerRmb: true,
                        }))
                      }
                      aria-required='true'
                      aria-describedby={`issuance-rate-unit${showRateError('pointsPerRmb') && rateErrors.pointsPerRmb ? ' issuance-rate-error' : ''}`}
                      aria-invalid={
                        showRateError('pointsPerRmb') &&
                        Boolean(rateErrors.pointsPerRmb)
                      }
                    />
                    <div
                      id='issuance-rate-unit'
                      className='text-muted-foreground text-xs'
                    >
                      {t('points per RMB, up to 2 decimals')}
                    </div>
                    {showRateError('pointsPerRmb') &&
                      rateErrors.pointsPerRmb && (
                        <div
                          id='issuance-rate-error'
                          className='text-destructive text-xs'
                          role='alert'
                        >
                          {rateErrors.pointsPerRmb}
                        </div>
                      )}
                  </div>
                  <div className='space-y-1'>
                    <Label htmlFor='issuance-rate-decision'>
                      <PricingField value='RATE_DECISION' />
                    </Label>
                    <Input
                      id='issuance-rate-decision'
                      value={rateForm.decisionSummary}
                      onChange={(event) =>
                        setRateForm((current) => ({
                          ...current,
                          decisionSummary: event.target.value,
                        }))
                      }
                      onBlur={() =>
                        setRateTouched((current) => ({
                          ...current,
                          decisionSummary: true,
                        }))
                      }
                      aria-describedby={
                        showRateError('decisionSummary') &&
                        rateErrors.decisionSummary
                          ? 'issuance-rate-decision-help issuance-rate-decision-error'
                          : 'issuance-rate-decision-help'
                      }
                      aria-invalid={
                        showRateError('decisionSummary') &&
                        Boolean(rateErrors.decisionSummary)
                      }
                    />
                    <div
                      id='issuance-rate-decision-help'
                      className='text-muted-foreground text-xs'
                    >
                      {t('Optional, up to 2000 characters')}
                    </div>
                    {showRateError('decisionSummary') &&
                      rateErrors.decisionSummary && (
                        <div
                          id='issuance-rate-decision-error'
                          className='text-destructive text-xs'
                          role='alert'
                        >
                          {rateErrors.decisionSummary}
                        </div>
                      )}
                  </div>
                </div>
                <div className='flex justify-end border-t pt-4'>
                  <Button
                    type='submit'
                    className='w-full sm:w-auto'
                    disabled={createRate.isPending}
                  >
                    {t('Review rate change')}
                  </Button>
                </div>
              </div>
            </form>
            {rates.isPending && (
              <div className='text-muted-foreground text-sm'>
                {t('Loading')}
              </div>
            )}
            {rates.isError && (
              <Button variant='outline' onClick={() => void rates.refetch()}>
                {t('Retry')}
              </Button>
            )}
            <div className='space-y-3'>
              <div>
                <h3 className='text-sm font-semibold'>{t('Rate records')}</h3>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {t(
                    'Changes requiring action appear first; published history is paginated.'
                  )}
                </p>
              </div>
              <PricingRecordsTable
                columns={rateColumns}
                data={rates.data ?? []}
                filters={rateFilters}
                getRowId={(rate) => rate.id}
                initialSorting={[{ id: 'version', desc: true }]}
                emptyTitle={t('No rate records')}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'groups' && <PriceGroupManagement />}

      {activeTab === 'prices' && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('Adjust model price')}</CardTitle>
              <CardDescription>
                {t(
                  'Review the editable inputs, then confirm the change. The published source remains immutable and the confirmed change enters approval.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                aria-label={t('Adjust model price')}
                className='space-y-4'
                onSubmit={(event) => {
                  event.preventDefault()
                  setPriceSubmitted(true)
                  if (!priceFormValid) return
                  setConfirmation({ kind: 'create-price' })
                }}
              >
                <div className='space-y-1'>
                  <Label htmlFor='pricing-source'>{t('Pricing target')}</Label>
                  <select
                    id='pricing-source'
                    className='border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3'
                    value={selectedInitial ? selectedId : (selected?.id ?? '')}
                    onChange={(event) => setSelectedId(event.target.value)}
                  >
                    {published.map((price) => (
                      <option key={price.id} value={price.id}>
                        {price.modelName} · {price.priceGroup} ·{' '}
                        {price.combinationKey} · v{price.version}
                      </option>
                    ))}
                    {initialTargets.map(({ model, target }) => {
                      const value = `initial:${model.id}:${target.priceGroupId}:${target.parameterCombinationId}`
                      return (
                        <option key={value} value={value}>
                          {model.name} · {target.priceGroupName} ·{' '}
                          {target.combinationKey} · {t('Not priced')}
                        </option>
                      )
                    })}
                  </select>
                </div>
                <PricingQuestionnaire
                  idPrefix='pricing'
                  answers={questionnaireAnswers}
                  pointsPerRmb={questionnaireRate}
                  currentPoints={selected?.points}
                  errors={Object.fromEntries(
                    Object.entries(priceErrors)
                      .filter(([key]) => key !== 'decisionSummary')
                      .map(([key, error]) => [
                        key === 'points' ? 'proposedPoints' : key,
                        showPriceError(key as keyof typeof priceTouched)
                          ? error
                          : null,
                      ])
                  )}
                  onChange={(key, value) =>
                    setForm((current) => ({
                      ...current,
                      [key === 'proposedPoints' ? 'points' : key]: value,
                    }))
                  }
                  onBlur={(key) =>
                    setPriceTouched((current) => ({
                      ...current,
                      [key === 'proposedPoints' ? 'points' : key]: true,
                    }))
                  }
                />
                <div className='max-w-3xl space-y-1'>
                  <Label htmlFor='pricing-decision'>
                    <PricingField value='DECISION' />
                  </Label>
                  <Textarea
                    id='pricing-decision'
                    aria-label={t('Decision summary')}
                    value={form.decisionSummary}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        decisionSummary: event.target.value,
                      }))
                    }
                    onBlur={() =>
                      setPriceTouched((current) => ({
                        ...current,
                        decisionSummary: true,
                      }))
                    }
                    aria-describedby={`pricing-decision-help${showPriceError('decisionSummary') && priceErrors.decisionSummary ? ' pricing-decision-error' : ''}`}
                    aria-invalid={
                      showPriceError('decisionSummary') &&
                      Boolean(priceErrors.decisionSummary)
                    }
                  />
                  <div
                    id='pricing-decision-help'
                    className='text-muted-foreground text-xs'
                  >
                    {t('Optional, up to 2000 characters')}
                  </div>
                  {showPriceError('decisionSummary') &&
                    priceErrors.decisionSummary && (
                      <div
                        id='pricing-decision-error'
                        className='text-destructive text-xs'
                        role='alert'
                      >
                        {priceErrors.decisionSummary}
                      </div>
                    )}
                </div>
                <Button
                  type='submit'
                  className='w-full sm:w-auto'
                  disabled={
                    (!selected && !selectedInitial) || publishPrice.isPending
                  }
                >
                  {t('Review price change')}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Price versions')}</CardTitle>
              <CardDescription>
                {t(
                  'All pricing inputs, derived values, snapshots, audit facts, and workflow states are shown below.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <div>
                <h3 className='text-sm font-semibold'>
                  {t('Price version records')}
                </h3>
                <p className='text-muted-foreground mt-1 text-xs'>
                  {t(
                    'Changes requiring action appear first; published history is paginated.'
                  )}
                </p>
              </div>
              <PricingRecordsTable
                columns={priceColumns}
                data={props.prices}
                filters={priceFilters}
                getRowId={(price) => price.id}
                initialSorting={[{ id: 'created', desc: true }]}
                emptyTitle={t('No price version records')}
              />
            </CardContent>
          </Card>
        </>
      )}

      <PricingActionConfirmation
        open={confirmation !== null}
        onOpenChange={(open) => !open && setConfirmation(null)}
        title={t('Confirm pricing change')}
        description={t(
          'Review the values below. Confirmation approves and publishes the change in one protected operation; published history remains immutable.'
        )}
        details={confirmationDetails}
        confirmLabel={t('Confirm change')}
        pending={confirmationPending}
        onConfirm={confirmAction}
      />
    </div>
  )
}
