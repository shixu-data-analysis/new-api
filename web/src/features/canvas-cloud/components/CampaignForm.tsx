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
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebounce } from '@/hooks'
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasAdminCustomers } from '../api'
import { previewCanvasCampaign } from '../campaign-api'
import type {
  CanvasCampaign,
  CanvasCampaignDraft,
  CanvasCampaignPreview,
  CanvasCampaignKind,
} from '../campaign-types'
import {
  formatExactPointQuantity,
  formatExactRmbReference,
} from '../point-conversion-types'

const campaignKinds: Exclude<CanvasCampaignKind, 'TASK_PRICE_SPECIAL'>[] = [
  'RECHARGE_BONUS',
  'INVITE_BONUS',
  'MANUAL_BONUS',
]

const maxPointQuantity = 9_223_372_036_854_775_807n
function isPointQuantity(value: string): boolean {
  return /^[1-9]\d{0,18}$/u.test(value) && BigInt(value) <= maxPointQuantity
}
const positiveInteger = z.string().trim().refine(isPointQuantity)
const campaignFormSchema = z
  .object({
    name: z.string().trim().min(1).max(128),
    kind: z.enum(['RECHARGE_BONUS', 'INVITE_BONUS', 'MANUAL_BONUS']),
    bonusPoints: positiveInteger,
    bonusTtlDays: z.coerce.number().int().min(1).max(3650),
    startsAt: z.string().min(1),
    endsAt: z.string().min(1),
    pointBudget: positiveInteger,
    referenceBudgetMinor: z
      .string()
      .trim()
      .refine(
        (value) =>
          /^(0|[1-9]\d{0,18})$/u.test(value) &&
          BigInt(value) <= maxPointQuantity
      ),
    maxParticipants: positiveInteger,
    expectedParticipants: positiveInteger,
    customerIds: z.array(z.string().uuid()).max(100),
    rechargeAmountMinor: z.string().trim(),
    reason: z.string().trim().min(1).max(255),
  })
  .superRefine((value, context) => {
    const startsAt = new Date(value.startsAt)
    const endsAt = new Date(value.endsAt)
    if (
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime())
    ) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'Enter valid campaign dates',
      })
    } else if (endsAt <= startsAt || endsAt <= new Date()) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'Campaign end must follow start and be in the future',
      })
    }
    if (
      isPointQuantity(value.pointBudget) &&
      isPointQuantity(value.bonusPoints) &&
      BigInt(value.pointBudget) < BigInt(value.bonusPoints)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['pointBudget'],
        message: 'Budget must cover one participation',
      })
    }
    if (
      isPointQuantity(value.expectedParticipants) &&
      isPointQuantity(value.maxParticipants) &&
      BigInt(value.expectedParticipants) > BigInt(value.maxParticipants)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['expectedParticipants'],
        message: 'Scenario exceeds participant limit',
      })
    }
    if (
      value.kind === 'RECHARGE_BONUS' &&
      !/^[1-9]\d{0,18}$/u.test(value.rechargeAmountMinor)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['rechargeAmountMinor'],
        message: 'Recharge amount is required',
      })
    }
    if (value.kind !== 'MANUAL_BONUS' && value.customerIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['customerIds'],
        message: 'Only manual campaigns may scope existing customers',
      })
    }
  })

type CampaignFormValues = z.infer<typeof campaignFormSchema>

function datetimeLocal(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function initialValues(campaign?: CanvasCampaign | null): CampaignFormValues {
  const draft = campaign?.draft
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 86_400_000)
  return {
    name: draft?.name ?? '',
    kind: draft?.kind ?? 'MANUAL_BONUS',
    bonusPoints: draft?.bonusPoints ?? '100',
    bonusTtlDays: draft?.bonusTtlDays ?? 30,
    startsAt: datetimeLocal(draft?.startsAt ?? now.toISOString()),
    endsAt: datetimeLocal(draft?.endsAt ?? tomorrow.toISOString()),
    pointBudget: draft?.pointBudget ?? '1000',
    referenceBudgetMinor: draft?.referenceBudgetMinor ?? '0',
    maxParticipants: draft?.maxParticipants ?? '10',
    expectedParticipants: draft?.expectedParticipants ?? '10',
    customerIds: draft?.customerIds ?? [],
    rechargeAmountMinor: draft?.rechargeAmountMinor ?? '',
    reason: draft?.reason ?? '',
  }
}

function apiDraft(values: CampaignFormValues): CanvasCampaignDraft {
  const { rechargeAmountMinor, ...draft } = values
  return {
    ...draft,
    startsAt: new Date(values.startsAt).toISOString(),
    endsAt: new Date(values.endsAt).toISOString(),
    ...(values.kind === 'RECHARGE_BONUS' ? { rechargeAmountMinor } : {}),
  }
}

export function CampaignForm(props: {
  campaign: CanvasCampaign | null
  onSave: (draft: CanvasCampaignDraft, campaign: CanvasCampaign | null) => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const form = useForm<
    z.input<typeof campaignFormSchema>,
    unknown,
    CampaignFormValues
  >({
    resolver: zodResolver(campaignFormSchema),
    mode: 'onBlur',
    defaultValues: initialValues(props.campaign),
  })
  const kind = useWatch({ control: form.control, name: 'kind' })
  const customerIds = useWatch({ control: form.control, name: 'customerIds' })
  const [customerSearch, setCustomerSearch] = useState('')
  const debouncedCustomerSearch = useDebounce(customerSearch.trim(), 300)
  const customers = useQuery({
    queryKey: [
      'canvas-cloud',
      'admin',
      'campaign-customers',
      debouncedCustomerSearch,
    ],
    queryFn: ({ signal }) =>
      getCanvasAdminCustomers(
        {
          status: 'ACTIVE',
          pageSize: 20,
          ...(debouncedCustomerSearch
            ? { username: debouncedCustomerSearch }
            : {}),
          sortBy: 'customer',
          sortOrder: 'asc',
        },
        signal
      ),
  })
  const preview = useMutation({ mutationFn: previewCanvasCampaign })
  const resetPreview = preview.reset

  useEffect(() => {
    const subscription = form.watch(() => {
      if (preview.data) resetPreview()
    })
    return () => subscription.unsubscribe()
  }, [form, preview.data, resetPreview])

  useEffect(() => {
    form.reset(initialValues(props.campaign))
    resetPreview()
  }, [form, props.campaign, resetPreview])

  const fieldError = (name: keyof CampaignFormValues) =>
    form.formState.errors[name]?.message
  const review = form.handleSubmit((values) => preview.mutate(apiDraft(values)))
  const save = form.handleSubmit((values) =>
    props.onSave(apiDraft(values), props.campaign)
  )
  const supportsScope = kind === 'MANUAL_BONUS'

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {props.campaign
            ? t('Edit point campaign draft')
            : t('Create point campaign')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className='grid gap-4 lg:grid-cols-3'
          onSubmit={review}
          aria-label={t('Point campaign form')}
        >
          <CampaignField label={t('Campaign name')} error={fieldError('name')}>
            <Input
              {...form.register('name')}
              aria-invalid={Boolean(fieldError('name'))}
            />
          </CampaignField>
          <CampaignField label={t('Campaign kind')} error={fieldError('kind')}>
            <Select
              value={kind}
              onValueChange={(value) => {
                form.setValue('kind', value as CampaignFormValues['kind'], {
                  shouldValidate: true,
                })
                if (value !== 'MANUAL_BONUS') form.setValue('customerIds', [])
              }}
            >
              <SelectTrigger aria-label={t('Campaign kind')}>
                <SelectValue>{t(kind)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {campaignKinds.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampaignField>
          <CampaignField
            label={t('Bonus points')}
            error={fieldError('bonusPoints')}
          >
            <Input
              inputMode='numeric'
              {...form.register('bonusPoints')}
              aria-invalid={Boolean(fieldError('bonusPoints'))}
            />
          </CampaignField>
          <CampaignField
            label={t('Bonus validity (days)')}
            error={fieldError('bonusTtlDays')}
          >
            <Input
              type='number'
              min={1}
              max={3650}
              {...form.register('bonusTtlDays')}
              aria-invalid={Boolean(fieldError('bonusTtlDays'))}
            />
          </CampaignField>
          <CampaignField label={t('Starts at')} error={fieldError('startsAt')}>
            <Input
              type='datetime-local'
              {...form.register('startsAt')}
              aria-invalid={Boolean(fieldError('startsAt'))}
            />
          </CampaignField>
          <CampaignField label={t('Ends at')} error={fieldError('endsAt')}>
            <Input
              type='datetime-local'
              {...form.register('endsAt')}
              aria-invalid={Boolean(fieldError('endsAt'))}
            />
          </CampaignField>
          <CampaignField
            label={t('Point budget')}
            error={fieldError('pointBudget')}
          >
            <Input
              inputMode='numeric'
              {...form.register('pointBudget')}
              aria-invalid={Boolean(fieldError('pointBudget'))}
            />
          </CampaignField>
          <CampaignField
            label={t('Reference budget (minor RMB)')}
            error={fieldError('referenceBudgetMinor')}
          >
            <Input
              inputMode='numeric'
              {...form.register('referenceBudgetMinor')}
              aria-invalid={Boolean(fieldError('referenceBudgetMinor'))}
            />
          </CampaignField>
          <CampaignField
            label={t('Maximum participations')}
            error={fieldError('maxParticipants')}
          >
            <Input
              inputMode='numeric'
              {...form.register('maxParticipants')}
              aria-invalid={Boolean(fieldError('maxParticipants'))}
            />
          </CampaignField>
          <CampaignField
            label={t('Planned participations')}
            error={fieldError('expectedParticipants')}
          >
            <Input
              inputMode='numeric'
              {...form.register('expectedParticipants')}
              aria-invalid={Boolean(fieldError('expectedParticipants'))}
            />
          </CampaignField>
          {kind === 'RECHARGE_BONUS' ? (
            <CampaignField
              label={t('Recharge amount (minor RMB)')}
              error={fieldError('rechargeAmountMinor')}
            >
              <Input
                inputMode='numeric'
                {...form.register('rechargeAmountMinor')}
                aria-invalid={Boolean(fieldError('rechargeAmountMinor'))}
              />
            </CampaignField>
          ) : null}
          <CampaignField
            label={t('Approval reason')}
            error={fieldError('reason')}
            className='lg:col-span-2'
          >
            <Input
              {...form.register('reason')}
              aria-invalid={Boolean(fieldError('reason'))}
            />
          </CampaignField>
          {supportsScope ? (
            <div className='lg:col-span-3'>
              <Label>{t('Customer scope')}</Label>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t(
                  'Optional existing-customer scope. Leave empty to allow all eligible customers.'
                )}
              </p>
              <Input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder={t('Search active customers')}
                aria-label={t('Search active customers')}
              />
              {customers.isError ? (
                <p role='alert' className='text-destructive mt-1 text-sm'>
                  {t('Unable to load active customers')}
                </p>
              ) : null}
              <div className='mt-2 grid max-h-48 gap-2 overflow-y-auto rounded-md border p-3 sm:grid-cols-2'>
                {(customers.data?.items ?? []).map((customer) => {
                  const checked = customerIds.includes(customer.customerId)
                  return (
                    <label
                      key={customer.customerId}
                      className='flex min-w-0 items-center gap-2 text-sm'
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) =>
                          form.setValue(
                            'customerIds',
                            value
                              ? [...customerIds, customer.customerId]
                              : customerIds.filter(
                                  (id) => id !== customer.customerId
                                ),
                            { shouldValidate: true }
                          )
                        }
                      />
                      <span className='truncate'>
                        {customer.username ?? customer.customerId}
                      </span>
                    </label>
                  )
                })}
              </div>
              {fieldError('customerIds') ? (
                <p role='alert' className='text-destructive mt-1 text-sm'>
                  {fieldError('customerIds')}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className='flex flex-wrap justify-end gap-2 lg:col-span-3'>
            <Button type='submit' disabled={preview.isPending}>
              {t('Preview campaign')}
            </Button>
            <Button
              type='button'
              disabled={!preview.data || props.saving}
              onClick={save}
            >
              {t('Save campaign draft')}
            </Button>
          </div>
        </form>
        {preview.isError ? (
          <p role='alert' className='text-destructive mt-3 text-sm'>
            {t('Unable to preview campaign. Check the inputs and try again.')}
          </p>
        ) : null}
        {preview.data ? <CampaignPreview preview={preview.data} /> : null}
      </CardContent>
    </Card>
  )
}

function CampaignField(props: {
  label: string
  error?: string
  className?: string
  children: ReactNode
}) {
  const id = useId()
  const child = isValidElement<{ id?: string }>(props.children)
    ? cloneElement(props.children, { id })
    : props.children
  return (
    <div className={props.className}>
      <Label htmlFor={id}>{props.label}</Label>
      {child}
      {props.error ? (
        <p role='alert' className='text-destructive mt-1 text-sm'>
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

function CampaignPreview(props: { preview: CanvasCampaignPreview }) {
  const { t, i18n } = useTranslation()
  return (
    <div className='mt-4 grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4'>
      <PreviewValue
        label={t('Planned participations')}
        value={formatExactPointQuantity(
          props.preview.plannedParticipants,
          toIntlLocale(i18n.language)
        )}
      />
      <PreviewValue
        label={t('Planned bonus points')}
        value={formatExactPointQuantity(
          props.preview.plannedBonusPoints,
          toIntlLocale(i18n.language)
        )}
      />
      <PreviewValue
        label={t('Added points')}
        value={formatExactPointQuantity(
          props.preview.projection.addedPoints,
          toIntlLocale(i18n.language)
        )}
      />
      <PreviewValue
        label={t('Projected average RMB per point')}
        value={
          props.preview.projection.afterAverageRmbPerPoint
            ? `RMB ${formatExactRmbReference(props.preview.projection.afterAverageRmbPerPoint, toIntlLocale(i18n.language))}`
            : '—'
        }
      />
      <p className='text-muted-foreground text-xs sm:col-span-2 lg:col-span-4'>
        {t(
          'Preview values are planning assumptions. Actual participation, grants, and remaining Lots are recorded separately after publication.'
        )}
      </p>
    </div>
  )
}

function PreviewValue(props: { label: string; value: string }) {
  return (
    <div>
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='mt-1 font-medium tabular-nums'>{props.value}</div>
    </div>
  )
}
