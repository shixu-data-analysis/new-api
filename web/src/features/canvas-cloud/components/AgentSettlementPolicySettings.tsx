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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toIntlLocale } from '@/i18n/languages'

import {
  agentEarningsQueryKeys,
  getAgentSettlementPolicy,
  publishAgentSettlementPolicy,
} from '../agent-earnings-api'
import {
  formatBasisPointsPercent,
  rmbMinorToInput,
} from '../agent-earnings-format'
import type { AdminAgentSettlementPolicy } from '../agent-earnings-types'
import {
  agentSettlementPolicySchema,
  type AgentSettlementPolicyValues,
} from '../lib/agent-settlement-policy-schema'
import {
  PricingActionConfirmation,
  type ConfirmationDetail,
} from './PricingActionConfirmation'

type Field = keyof AgentSettlementPolicyValues
const fields: Array<{
  name: Field
  label: string
  unit: string
  explanation: string
}> = [
  {
    name: 'minWithdrawal',
    label: 'Minimum withdrawal amount',
    unit: 'CNY',
    explanation:
      'The minimum amount of each withdrawal request, judged on the withdrawal amount before tax. Changes affect only requests submitted afterwards.',
  },
  {
    name: 'maxWithdrawal',
    label: 'Maximum single withdrawal amount',
    unit: 'CNY',
    explanation:
      'The maximum amount of each withdrawal request, judged on the withdrawal amount before tax. A larger balance is withdrawn in several requests. Changes affect only requests submitted afterwards.',
  },
  {
    name: 'taxRatePercent',
    label: 'Withholding tax rate',
    unit: '%',
    explanation:
      'Tax withheld at this rate on each withdrawal; net payment = withdrawal amount − withholding tax. There is no tax now, so keep 0. Changes affect only requests submitted afterwards.',
  },
  {
    name: 'expirySharePercent',
    label: 'Expired-points share ratio',
    unit: '%',
    explanation:
      "When a customer's paid points expire, this share of what the expired points cost joins the agent's earnings. Changes affect only expiries that happen afterwards.",
  },
]

function toValues(
  policy: AdminAgentSettlementPolicy
): AgentSettlementPolicyValues {
  return {
    minWithdrawal: rmbMinorToInput(BigInt(policy.minWithdrawalMinor)),
    maxWithdrawal: rmbMinorToInput(BigInt(policy.maxWithdrawalMinor)),
    taxRatePercent: formatBasisPointsPercent(policy.taxRateBasisPoints).replace(
      '%',
      ''
    ),
    expirySharePercent: formatBasisPointsPercent(
      policy.expiryShareRateBasisPoints
    ).replace('%', ''),
  }
}

/** "Agent settlement rules": the four parameters every agent page reads; publishing creates a new version and an audit. */
export function AgentSettlementPolicySettings() {
  const { t } = useTranslation()
  const policy = useQuery({
    queryKey: [...agentEarningsQueryKeys.all, 'policy'],
    queryFn: ({ signal }) => getAgentSettlementPolicy(signal),
  })
  return (
    <Card>
      <CardContent className='pt-6'>
        {policy.isPending ? (
          <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
        ) : null}
        {policy.isError ? (
          <Button variant='outline' onClick={() => void policy.refetch()}>
            {t('Retry')}
          </Button>
        ) : null}
        {policy.data ? <PolicyForm policy={policy.data} /> : null}
      </CardContent>
    </Card>
  )
}

function PolicyForm(props: { policy: AdminAgentSettlementPolicy }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const current = toValues(props.policy)
  const form = useForm<AgentSettlementPolicyValues>({
    resolver: zodResolver(agentSettlementPolicySchema),
    defaultValues: current,
    mode: 'onTouched',
  })
  const { errors, isDirty } = form.formState
  const [review, setReview] = useState<{
    values: AgentSettlementPolicyValues
    details: ConfirmationDetail[]
  } | null>(null)
  const { reset } = form
  useEffect(() => {
    reset(toValues(props.policy), {
      keepDirtyValues: true,
      keepDirty: true,
      keepTouched: true,
      keepErrors: true,
    })
  }, [props.policy, reset])
  const publish = useMutation({
    mutationFn: (values: AgentSettlementPolicyValues) =>
      publishAgentSettlementPolicy(values),
    onSuccess: (result) => {
      setReview(null)
      reset(toValues(result))
      queryClient.setQueryData(
        [...agentEarningsQueryKeys.all, 'policy'],
        result
      )
      void queryClient.invalidateQueries({
        queryKey: agentEarningsQueryKeys.all,
      })
      toast.success(t('Agent settlement rules updated'))
    },
    onError: () => toast.error(t('Agent settlement rules update failed')),
  })
  const dateFormatter = new Intl.DateTimeFormat(
    toIntlLocale(i18n.resolvedLanguage ?? i18n.language),
    { dateStyle: 'medium', timeStyle: 'short' }
  )
  const display = (name: Field, value: string) =>
    name === 'minWithdrawal' || name === 'maxWithdrawal'
      ? `¥${value}`
      : `${value}%`
  return (
    <>
      <form
        noValidate
        aria-label={t('Agent settlement rules')}
        className='grid gap-4'
        onSubmit={form.handleSubmit((values) => {
          // Compare normalized numbers so "50" and "50.00" are no change.
          const changed = fields.filter(
            (field) =>
              Number(values[field.name]) !== Number(current[field.name])
          )
          if (changed.length === 0) return
          setReview({
            values,
            details: changed.map((field) => ({
              label: t(field.label),
              value: `${display(field.name, current[field.name])} → ${display(field.name, values[field.name].trim())}`,
            })),
          })
        })}
      >
        <div className='grid gap-4 md:grid-cols-2'>
          {fields.map((field) => (
            <div key={field.name} className='min-w-0 space-y-2'>
              <Label htmlFor={`agent-policy-${field.name}`}>
                {t(field.label)} <span className='text-destructive'>*</span>
              </Label>
              <div className='flex items-center gap-2'>
                <Input
                  id={`agent-policy-${field.name}`}
                  inputMode='decimal'
                  className='max-w-52 tabular-nums'
                  {...form.register(field.name)}
                  disabled={publish.isPending}
                  aria-required='true'
                  aria-invalid={Boolean(errors[field.name])}
                  aria-describedby={`agent-policy-${field.name}-explanation${errors[field.name] ? ` agent-policy-${field.name}-error` : ''}`}
                />
                <span className='text-muted-foreground shrink-0 text-sm'>
                  {field.unit === 'CNY' ? t('CNY') : field.unit}
                </span>
              </div>
              {errors[field.name] ? (
                <p
                  id={`agent-policy-${field.name}-error`}
                  role='alert'
                  className='text-destructive text-xs'
                >
                  {t(errors[field.name]?.message ?? 'This field is required')}
                </p>
              ) : null}
              <p
                id={`agent-policy-${field.name}-explanation`}
                className='text-muted-foreground text-sm'
              >
                {t(field.explanation)}
              </p>
              <div className='text-muted-foreground flex flex-wrap items-center gap-2 text-xs'>
                <Badge variant='secondary'>
                  {props.policy.version == null
                    ? t('Default configuration')
                    : `v${props.policy.version}`}
                </Badge>
                {props.policy.version != null && props.policy.effectiveAt ? (
                  <span>
                    {dateFormatter.format(new Date(props.policy.effectiveAt))}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <div className='flex justify-end'>
          <Button type='submit' disabled={!isDirty || publish.isPending}>
            {t('Review rule changes')}
          </Button>
        </div>
      </form>
      <PricingActionConfirmation
        open={review !== null}
        onOpenChange={(open) => {
          if (!open && !publish.isPending) setReview(null)
        }}
        title={t('Confirm agent settlement rule changes')}
        description={t(
          'Confirmation publishes immutable configuration versions. Historical quotes and completed ledger facts are not recalculated.'
        )}
        details={review?.details ?? []}
        confirmLabel={t('Confirm change')}
        pending={publish.isPending}
        onConfirm={() => {
          if (review) publish.mutate(review.values)
        }}
      />
    </>
  )
}
