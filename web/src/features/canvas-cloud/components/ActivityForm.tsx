/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, HeaderContext } from '@tanstack/react-table'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { DataTableColumnHeader } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectItem, SelectTrigger } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import {
  createCanvasBonusActivity,
  createCanvasManualBonusMemberSelection,
  createCanvasManualBonusActivity,
  getCanvasEligibleActivityCustomers,
  getCanvasCurrentManualGrantEligibilityBasis,
  resolveCanvasEligibleActivityCustomers,
  updateCanvasManualBonusActivity,
} from '../activity-api'
import { minorToCny } from '../activity-shared'
import type {
  CanvasActivityEligibleCustomer,
  CanvasBonusActivity,
  CanvasManualGrantPlan,
  CanvasManualGrantScope,
  CanvasManualGrantUpdateScope,
} from '../activity-types'
import { isCanvasDateRangeValid } from '../date-range'
import { useServerTableState } from '../use-server-table-state'
import { EligibilityBasisContent, SelectContent } from './ActivityShared'
import { CanvasDateRangeFilter } from './CanvasDateRangeFilter'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { CanvasServerTable } from './CanvasServerTable'
import { LimitedPriceActivityForm } from './LimitedPriceActivityForm'

export type CreateType =
  | 'MANUAL_BONUS'
  | 'RECHARGE_BONUS'
  | 'INVITE_BONUS'
  | 'TASK_PRICE_SPECIAL'

const EMPTY_CUSTOMER_IDS: string[] = []

const baseSchema = z.object({
  name: z.string().trim().min(1).max(128),
  points: z.string().regex(/^[1-9]\d{0,18}$/u),
  ttlDays: z.coerce.number().int().min(1).max(3650),
  reason: z.string().trim().min(1).max(255),
})

const manualSchema = baseSchema
  .extend({
    scope: z.enum(['SELECTED', 'RECHARGE_THRESHOLD']),
    schedule: z.enum(['IMMEDIATE', 'SCHEDULED']),
    scheduledAt: z.string(),
    minimumRechargeRmb: z.string(),
    redeemedFrom: z.string(),
    redeemedTo: z.string(),
    customerIds: z.array(z.string()),
    selectionToken: z.string(),
    selectedCustomerCount: z.number().int().nonnegative(),
    editingExistingMembers: z.boolean(),
    addedCustomerIds: z.array(z.string()),
    removedCustomerIds: z.array(z.string()),
    clearBaseline: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      value.schedule === 'SCHEDULED' &&
      new Date(value.scheduledAt) <= new Date()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['scheduledAt'],
        message: 'Scheduled time must be in the future',
      })
    }
    if (
      value.scope === 'RECHARGE_THRESHOLD' &&
      !value.editingExistingMembers &&
      value.customerIds.length === 0 &&
      !value.selectionToken
    ) {
      context.addIssue({
        code: 'custom',
        path: ['customerIds'],
        message: 'Select at least one eligible customer',
      })
    }
    if (
      value.scope === 'SELECTED' &&
      !value.editingExistingMembers &&
      value.customerIds.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['customerIds'],
        message: 'Select at least one eligible customer',
      })
    }
    if (
      value.scope === 'RECHARGE_THRESHOLD' &&
      cnyThresholdToMinor(value.minimumRechargeRmb) === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['minimumRechargeRmb'],
        message: 'Enter a valid recharge amount',
      })
    }
    if (
      value.scope === 'RECHARGE_THRESHOLD' &&
      value.redeemedFrom &&
      value.redeemedTo &&
      new Date(value.redeemedFrom) > new Date(value.redeemedTo)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['redeemedTo'],
        message: 'End time must not be earlier than start time',
      })
    }
  })

type BaseValues = z.infer<typeof baseSchema>

type ManualValues = z.infer<typeof manualSchema>

type ActivityConflict = {
  reason?: string
  affectedCustomerTotal: number
  affectedCustomers: Array<{
    customerId?: string
    customer?: string
    reason?: string
  }>
}

function activityConflictFromError(
  error: unknown
): ActivityConflict | undefined {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined
  }
  const response = error.response as {
    status?: unknown
    data?: {
      reason?: unknown
      message?: unknown
      affectedCustomers?: unknown
      affectedCustomerTotal?: unknown
    }
  }
  if (
    response.status !== 409 ||
    !Array.isArray(response.data?.affectedCustomers)
  ) {
    return undefined
  }
  const affectedCustomers = response.data.affectedCustomers.filter(
    (customer): customer is ActivityConflict['affectedCustomers'][number] =>
      typeof customer === 'object' && customer !== null
  )
  const affectedCustomerTotal =
    typeof response.data.affectedCustomerTotal === 'number' &&
    Number.isSafeInteger(response.data.affectedCustomerTotal) &&
    response.data.affectedCustomerTotal >= affectedCustomers.length
      ? response.data.affectedCustomerTotal
      : affectedCustomers.length
  let reason: string | undefined
  if (typeof response.data.message === 'string') {
    reason = response.data.message
  } else if (typeof response.data.reason === 'string') {
    reason = response.data.reason
  }
  return {
    ...(reason ? { reason } : {}),
    affectedCustomerTotal,
    affectedCustomers,
  }
}

export function ActivityForm(props: {
  type: CreateType
  initialPlan?: CanvasManualGrantPlan
  onBack: () => void
  onSaved: (activity: CanvasManualGrantPlan | CanvasBonusActivity) => void
  onSpecialSaved?: (activityId: string) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const manual = props.type === 'MANUAL_BONUS'
  const limitedPrice = props.type === 'TASK_PRICE_SPECIAL'
  const form = useForm<ManualValues | BaseValues>({
    resolver: zodResolver(manual ? manualSchema : baseSchema) as never,
    mode: 'onBlur',
    defaultValues: manual
      ? {
          name: props.initialPlan?.name ?? '',
          points: props.initialPlan?.points ?? '',
          ttlDays: props.initialPlan?.ttlDays ?? 30,
          reason: props.initialPlan?.reason ?? '',
          scope: props.initialPlan?.scope.type ?? 'SELECTED',
          schedule: props.initialPlan?.schedule.mode ?? 'IMMEDIATE',
          scheduledAt:
            props.initialPlan?.schedule.mode === 'SCHEDULED'
              ? toDateTimeLocal(props.initialPlan.schedule.scheduledAt)
              : '',
          minimumRechargeRmb:
            props.initialPlan?.scope.type === 'RECHARGE_THRESHOLD'
              ? minorToCny(props.initialPlan.scope.minimumRechargeAmountMinor)
              : '',
          redeemedFrom:
            props.initialPlan?.scope.type === 'RECHARGE_THRESHOLD' &&
            props.initialPlan.scope.redeemedFrom
              ? toDateTimeLocal(props.initialPlan.scope.redeemedFrom)
              : '',
          redeemedTo:
            props.initialPlan?.scope.type === 'RECHARGE_THRESHOLD' &&
            props.initialPlan.scope.redeemedTo
              ? toDateTimeLocal(props.initialPlan.scope.redeemedTo)
              : '',
          customerIds: [],
          selectionToken: '',
          selectedCustomerCount: props.initialPlan?.memberCount ?? 0,
          editingExistingMembers: Boolean(props.initialPlan),
          addedCustomerIds: [],
          removedCustomerIds: [],
          clearBaseline: false,
        }
      : {
          name: '',
          points: '',
          ttlDays: 30,
          reason: '',
          editingExistingMembers: false,
          addedCustomerIds: [],
          removedCustomerIds: [],
          clearBaseline: false,
        },
  })
  const manualValues = useWatch({
    control: form.control,
  }) as Partial<ManualValues>
  const [conflict, setConflict] = useState<ActivityConflict>()
  const baselineSelection = useMutation({
    mutationFn: () =>
      createCanvasManualBonusMemberSelection(
        props.initialPlan?.activityId ?? ''
      ),
  })
  const baselineRequested = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!props.initialPlan) return
    const key = `${props.initialPlan.activityId}:${props.initialPlan.version}`
    if (baselineRequested.current === key) return
    baselineRequested.current = key
    baselineSelection.mutate()
  }, [baselineSelection, props.initialPlan])
  const save = useMutation({
    mutationFn: async (values: ManualValues | BaseValues) => {
      if (!manual) {
        if (limitedPrice) {
          throw new Error('Limited-price form requires published pricing data')
        }
        return createCanvasBonusActivity(
          props.type as 'RECHARGE_BONUS' | 'INVITE_BONUS',
          values
        )
      }
      const manualFormValues = values as ManualValues
      const scope: CanvasManualGrantScope =
        manualFormValues.scope === 'SELECTED'
          ? { type: 'SELECTED', customerIds: manualFormValues.customerIds }
          : {
              type: 'RECHARGE_THRESHOLD',
              minimumRechargeAmountMinor: cnyThresholdToMinor(
                manualFormValues.minimumRechargeRmb
              ) as string,
              currency: 'CNY',
              ...(manualFormValues.selectionToken
                ? { selectionToken: manualFormValues.selectionToken }
                : { customerIds: manualFormValues.customerIds }),
              ...(manualFormValues.redeemedFrom
                ? {
                    redeemedFrom: new Date(
                      manualFormValues.redeemedFrom
                    ).toISOString(),
                  }
                : {}),
              ...(manualFormValues.redeemedTo
                ? {
                    redeemedTo: new Date(
                      manualFormValues.redeemedTo
                    ).toISOString(),
                  }
                : {}),
            }
      if (props.initialPlan) {
        const memberSelection = baselineSelection.data
        if (!memberSelection) throw new Error('Member selection is loading')
        const updateScope: CanvasManualGrantUpdateScope =
          scope.type === 'SELECTED'
            ? {
                type: 'SELECTED',
                selectionToken: memberSelection.selectionToken,
                ...(manualFormValues.addedCustomerIds.length
                  ? { addedCustomerIds: manualFormValues.addedCustomerIds }
                  : {}),
                ...(manualFormValues.removedCustomerIds.length
                  ? { removedCustomerIds: manualFormValues.removedCustomerIds }
                  : {}),
                ...(manualFormValues.clearBaseline
                  ? { clearBaseline: true }
                  : {}),
              }
            : {
                type: 'RECHARGE_THRESHOLD',
                minimumRechargeAmountMinor: scope.minimumRechargeAmountMinor,
                currency: 'CNY',
                selectionToken: memberSelection.selectionToken,
                ...(scope.redeemedFrom
                  ? { redeemedFrom: scope.redeemedFrom }
                  : {}),
                ...(scope.redeemedTo ? { redeemedTo: scope.redeemedTo } : {}),
                ...(manualFormValues.addedCustomerIds.length
                  ? { addedCustomerIds: manualFormValues.addedCustomerIds }
                  : {}),
                ...(manualFormValues.removedCustomerIds.length
                  ? { removedCustomerIds: manualFormValues.removedCustomerIds }
                  : {}),
                ...(manualFormValues.clearBaseline
                  ? { clearBaseline: true }
                  : {}),
              }
        return updateCanvasManualBonusActivity(props.initialPlan.activityId, {
          expectedVersion: props.initialPlan.version,
          points: manualFormValues.points,
          ttlDays: manualFormValues.ttlDays,
          reason: manualFormValues.reason,
          scope: updateScope,
          schedule:
            manualFormValues.schedule === 'SCHEDULED'
              ? {
                  mode: 'SCHEDULED',
                  scheduledAt: new Date(
                    manualFormValues.scheduledAt
                  ).toISOString(),
                }
              : { mode: 'IMMEDIATE' },
        })
      }
      return createCanvasManualBonusActivity({
        name: manualFormValues.name,
        points: manualFormValues.points,
        ttlDays: manualFormValues.ttlDays,
        reason: manualFormValues.reason,
        scope,
        schedule:
          manualFormValues.schedule === 'SCHEDULED'
            ? {
                mode: 'SCHEDULED',
                scheduledAt: new Date(
                  manualFormValues.scheduledAt
                ).toISOString(),
              }
            : { mode: 'IMMEDIATE' },
      })
    },
    onSuccess: (activity) => {
      toast.success(
        t(props.initialPlan ? 'Activity updated' : 'Activity created')
      )
      void queryClient.invalidateQueries({
        queryKey: ['canvas-cloud', 'activities'],
      })
      props.onSaved(activity)
    },
    onError: (error) => {
      const nextConflict = activityConflictFromError(error)
      setConflict(nextConflict)
      if (!nextConflict) toast.error(t('Unable to create activity'))
    },
  })
  const submit = form.handleSubmit((values) => {
    setConflict(undefined)
    save.mutate(values)
  })
  let submitLabel = props.initialPlan ? 'Confirm update' : 'Confirm publish'
  if (!props.initialPlan && manualValues.schedule === 'SCHEDULED') {
    submitLabel = 'Confirm scheduled grant'
  } else if (!props.initialPlan && manual) {
    submitLabel = 'Confirm grant'
  }
  if (limitedPrice) {
    return (
      <LimitedPriceActivityForm
        onBack={props.onBack}
        onSaved={props.onSpecialSaved ?? props.onBack}
      />
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(props.initialPlan ? 'Edit manual grant' : props.type)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className='grid gap-4 lg:grid-cols-2' onSubmit={submit}>
          <FormInput
            form={form}
            name='name'
            label={t('Activity name')}
            className='lg:col-span-2'
            disabled={Boolean(props.initialPlan)}
          />
          <FormInput
            form={form}
            name='points'
            label={t(manual ? 'Points per customer' : 'Bonus points')}
            inputMode='numeric'
          />
          <FormInput
            form={form}
            name='ttlDays'
            label={t('Bonus validity (days)')}
            type='number'
            min={1}
            max={3650}
          />
          {manual ? (
            <>
              {props.initialPlan ? (
                <p className='text-muted-foreground lg:col-span-2'>
                  {t(
                    'The original plan remains effective until this update is confirmed.'
                  )}
                </p>
              ) : (
                <div>
                  <Label>{t('Grant timing')}</Label>
                  <Select
                    value={manualValues.schedule ?? 'IMMEDIATE'}
                    onValueChange={(value) =>
                      form.setValue(
                        'schedule',
                        value as ManualValues['schedule'],
                        { shouldValidate: true }
                      )
                    }
                  >
                    <SelectTrigger
                      className='w-full min-w-0'
                      aria-label={t('Grant timing')}
                    >
                      <CanvasLocalizedSelectValue
                        value={manualValues.schedule}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='IMMEDIATE'>
                        {t('Immediate grant')}
                      </SelectItem>
                      <SelectItem value='SCHEDULED'>
                        {t('Scheduled grant')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {manualValues.schedule === 'SCHEDULED' ? (
                <FormInput
                  form={form}
                  name='scheduledAt'
                  label={t('Scheduled time')}
                  type='datetime-local'
                />
              ) : null}
              <RecipientSelector
                form={form}
                values={manualValues}
                baselineSelection={baselineSelection.data}
                baselineLoading={baselineSelection.isPending}
              />
            </>
          ) : null}
          <FormInput
            form={form}
            name='reason'
            label={t('Reason')}
            className='lg:col-span-2'
          />
          {props.initialPlan ? (
            <ManualGrantChangeSummary
              plan={props.initialPlan}
              values={manualValues}
            />
          ) : null}
          {conflict ? <ActivityConflictNotice conflict={conflict} /> : null}
          <div className='flex justify-end gap-2 lg:col-span-2'>
            <Button type='button' variant='outline' onClick={props.onBack}>
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={save.isPending}>
              {t(submitLabel)}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function ActivityConflictNotice(props: { conflict: ActivityConflict }) {
  const { t } = useTranslation()
  const displayedCustomers = props.conflict.affectedCustomers.slice(0, 100)
  const hiddenCustomerCount = Math.max(
    0,
    props.conflict.affectedCustomerTotal - displayedCustomers.length
  )
  return (
    <div
      className='border-destructive text-destructive rounded-md border p-3 text-sm lg:col-span-2'
      role='alert'
    >
      <p>
        {props.conflict.reason
          ? t(props.conflict.reason)
          : t('Activity update conflict')}
      </p>
      {displayedCustomers.length ? (
        <>
          <p className='mt-2 font-medium'>{t('Affected customers')}</p>
          <ul className='mt-1 list-disc pl-5'>
            {displayedCustomers.map((customer) => (
              <li
                key={`${customer.customerId ?? customer.customer ?? 'customer'}-${customer.reason ?? ''}`}
              >
                {customer.customer ?? customer.customerId ?? t('Customer')}
                {customer.reason ? ` · ${t(customer.reason)}` : ''}
              </li>
            ))}
          </ul>
          {hiddenCustomerCount ? (
            <p className='mt-2'>
              {t('{{count}} more affected customers are not shown.', {
                count: hiddenCustomerCount,
              })}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ManualGrantChangeSummary(props: {
  plan: CanvasManualGrantPlan
  values: Partial<ManualValues>
}) {
  const { t } = useTranslation()
  const changes: string[] = []
  if (props.values.points && props.values.points !== props.plan.points) {
    changes.push(
      t('Points per customer: {{before}} → {{after}}', {
        before: props.plan.points,
        after: props.values.points,
      })
    )
  }
  if (props.values.ttlDays && props.values.ttlDays !== props.plan.ttlDays) {
    changes.push(
      t('Bonus validity: {{before}} → {{after}} days', {
        before: props.plan.ttlDays,
        after: props.values.ttlDays,
      })
    )
  }
  if (props.values.reason && props.values.reason !== props.plan.reason) {
    changes.push(t('Reason changed'))
  }
  const previousTime =
    props.plan.schedule.mode === 'SCHEDULED'
      ? toDateTimeLocal(props.plan.schedule.scheduledAt)
      : ''
  if (props.values.scheduledAt && props.values.scheduledAt !== previousTime) {
    changes.push(t('Scheduled time changed'))
  }
  if (!changes.length) return null
  return (
    <div className='rounded-md border p-3 text-sm lg:col-span-2'>
      <p className='font-medium'>{t('This update changes')}</p>
      <ul className='mt-1 list-disc pl-5'>
        {changes.map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
    </div>
  )
}

function FormInput(props: {
  form: ReturnType<typeof useForm<ManualValues | BaseValues>>
  name: keyof ManualValues
  label: string
  className?: string
  type?: string
  disabled?: boolean
  min?: number
  max?: number
  inputMode?: 'numeric' | 'decimal'
}) {
  const { t } = useTranslation()
  const id = `activity-${props.name}`
  const error = props.form.getFieldState(props.name as never).error?.message
  return (
    <div className={props.className}>
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type={props.type}
        min={props.min}
        max={props.max}
        inputMode={props.inputMode}
        disabled={props.disabled}
        {...props.form.register(props.name)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p
          id={`${id}-error`}
          role='alert'
          className='text-destructive mt-1 text-sm'
        >
          {t(String(error))}
        </p>
      ) : null}
    </div>
  )
}

function RecipientSelector(props: {
  form: ReturnType<typeof useForm<ManualValues | BaseValues>>
  values: Partial<ManualValues>
  baselineSelection?: {
    selectionToken: string
    count: number
    expiresAt: string
  }
  baselineLoading: boolean
}) {
  const { t } = useTranslation()
  const table = useServerTableState<'customer'>('customer')
  const resetPage = () =>
    table.setPagination((current) => ({ ...current, pageIndex: 0 }))
  const [basisCustomer, setBasisCustomer] = useState<{
    customerId: string
    customer: string
  }>()
  const [changedNames, setChangedNames] = useState<Record<string, string>>({})
  const editing = Boolean(props.values.editingExistingMembers)
  const addedCustomerIds = props.values.addedCustomerIds ?? EMPTY_CUSTOMER_IDS
  const removedCustomerIds =
    props.values.removedCustomerIds ?? EMPTY_CUSTOMER_IDS
  const clearBaseline = Boolean(props.values.clearBaseline)
  const threshold =
    props.values.scope === 'RECHARGE_THRESHOLD'
      ? cnyThresholdToMinor(props.values.minimumRechargeRmb ?? '')
      : null
  const selectAllMatching = useMutation({
    mutationFn: () =>
      resolveCanvasEligibleActivityCustomers({
        ...(table.query.search ? { username: table.query.search } : {}),
        minimumRechargeAmountMinor: threshold ?? undefined,
        currency: 'CNY',
        ...(props.values.redeemedFrom
          ? { redeemedFrom: new Date(props.values.redeemedFrom).toISOString() }
          : {}),
        ...(props.values.redeemedTo
          ? { redeemedTo: new Date(props.values.redeemedTo).toISOString() }
          : {}),
      }),
    onSuccess: (selection) => {
      props.form.setValue('selectionToken', selection.selectionToken, {
        shouldValidate: true,
      })
      props.form.setValue('selectedCustomerCount', selection.count)
      props.form.setValue('customerIds', [])
    },
    onError: () => toast.error(t('Unable to select matching customers')),
  })
  const clearSelection = () => {
    if (editing) {
      props.form.setValue('addedCustomerIds', [], { shouldValidate: true })
      props.form.setValue('removedCustomerIds', [], { shouldValidate: true })
      props.form.setValue('clearBaseline', true, { shouldValidate: true })
      return
    }
    props.form.setValue('customerIds', [], { shouldValidate: true })
    props.form.setValue('selectionToken', '', { shouldValidate: true })
    props.form.setValue('selectedCustomerCount', 0)
  }
  const selectionFilterKey = [
    props.values.scope,
    threshold,
    props.values.redeemedFrom,
    props.values.redeemedTo,
    table.query.search,
  ].join('|')
  const previousSelectionFilterKey = useRef(selectionFilterKey)
  useEffect(() => {
    if (previousSelectionFilterKey.current === selectionFilterKey) return
    previousSelectionFilterKey.current = selectionFilterKey
    if (editing) return
    props.form.setValue('customerIds', [], { shouldValidate: true })
    props.form.setValue('selectionToken', '', { shouldValidate: true })
    props.form.setValue('selectedCustomerCount', 0)
  }, [editing, props.form, selectionFilterKey])
  const customers = useQuery({
    queryKey: [
      'canvas-cloud',
      'activity-eligible-customers',
      table.query.page,
      table.query.pageSize,
      table.query.search,
      props.values.scope,
      threshold,
      props.values.redeemedFrom,
      props.values.redeemedTo,
      props.baselineSelection?.selectionToken,
    ],
    queryFn: ({ signal }) =>
      getCanvasEligibleActivityCustomers(
        {
          page: table.query.page,
          pageSize: table.query.pageSize,
          ...(table.query.search ? { username: table.query.search } : {}),
          ...(props.values.scope === 'RECHARGE_THRESHOLD' && threshold
            ? { minimumRechargeAmountMinor: threshold, currency: 'CNY' }
            : {}),
          ...(props.values.scope === 'RECHARGE_THRESHOLD' &&
          props.values.redeemedFrom
            ? {
                redeemedFrom: new Date(props.values.redeemedFrom).toISOString(),
              }
            : {}),
          ...(props.values.scope === 'RECHARGE_THRESHOLD' &&
          props.values.redeemedTo
            ? {
                redeemedTo: new Date(props.values.redeemedTo).toISOString(),
              }
            : {}),
          ...(props.baselineSelection
            ? { selectionToken: props.baselineSelection.selectionToken }
            : {}),
        },
        signal
      ),
    enabled:
      (!editing || Boolean(props.baselineSelection)) &&
      isCanvasDateRangeValid(
        props.values.redeemedFrom
          ? new Date(props.values.redeemedFrom)
          : undefined,
        props.values.redeemedTo ? new Date(props.values.redeemedTo) : undefined
      ),
    placeholderData: (previous) => previous,
  })
  const selected = props.values.customerIds ?? EMPTY_CUSTOMER_IDS
  let selectedCount = selected.length
  if (editing) {
    const baselineCount = clearBaseline
      ? 0
      : (props.baselineSelection?.count ??
        props.values.selectedCustomerCount ??
        0)
    selectedCount = Math.max(
      0,
      baselineCount - removedCustomerIds.length + addedCustomerIds.length
    )
  } else if (props.values.selectionToken) {
    selectedCount = props.values.selectedCustomerCount ?? 0
  }
  const visibleCustomers = useMemo(
    () => customers.data?.items ?? [],
    [customers.data?.items]
  )
  const isSelected = (customer: CanvasActivityEligibleCustomer) => {
    if (!editing) return selected.includes(customer.customerId)
    if (clearBaseline) return addedCustomerIds.includes(customer.customerId)
    if (customer.selected) {
      return !removedCustomerIds.includes(customer.customerId)
    }
    return addedCustomerIds.includes(customer.customerId)
  }
  const setMembership = (
    nextCustomers: CanvasActivityEligibleCustomer[],
    checked: boolean
  ) => {
    const currentValues = props.form.getValues() as ManualValues
    if (!editing) {
      const nextIds = nextCustomers.map((customer) => customer.customerId)
      const currentSelected = currentValues.customerIds ?? EMPTY_CUSTOMER_IDS
      props.form.setValue(
        'customerIds',
        checked
          ? [...new Set([...currentSelected, ...nextIds])]
          : currentSelected.filter((id) => !nextIds.includes(id)),
        { shouldValidate: true }
      )
      props.form.setValue('selectionToken', '')
      props.form.setValue('selectedCustomerCount', 0)
      return
    }
    const added = new Set(currentValues.addedCustomerIds ?? EMPTY_CUSTOMER_IDS)
    const removed = new Set(
      currentValues.removedCustomerIds ?? EMPTY_CUSTOMER_IDS
    )
    const names: Record<string, string> = {}
    for (const customer of nextCustomers) {
      names[customer.customerId] = customer.customer
      const isBaselineMember = customer.selected && !currentValues.clearBaseline
      if (isBaselineMember) {
        if (checked) removed.delete(customer.customerId)
        else removed.add(customer.customerId)
        added.delete(customer.customerId)
      } else if (checked) {
        added.add(customer.customerId)
      } else {
        added.delete(customer.customerId)
      }
    }
    setChangedNames((current) => ({ ...current, ...names }))
    props.form.setValue('addedCustomerIds', [...added], {
      shouldValidate: true,
    })
    props.form.setValue('removedCustomerIds', [...removed], {
      shouldValidate: true,
    })
  }
  const columns: ColumnDef<
    NonNullable<typeof customers.data>['items'][number],
    unknown
  >[] = [
    {
      id: 'select',
      enableSorting: false,
      header: () => {
        const visible = visibleCustomers
        const allVisibleSelected =
          visible.length > 0 &&
          visible.every((customer) => isSelected(customer))
        return (
          <Checkbox
            aria-label={t('Select current page')}
            checked={allVisibleSelected}
            onCheckedChange={(checked) => setMembership(visible, checked)}
          />
        )
      },
      cell: ({ row }) => (
        <Checkbox
          aria-label={t('Select customer {{customer}}', {
            customer: row.original.customer,
          })}
          checked={isSelected(row.original)}
          onCheckedChange={(checked) => setMembership([row.original], checked)}
        />
      ),
    },
    {
      id: 'customer',
      accessorKey: 'customer',
      meta: { label: t('Customer') },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Customer')} />
      ),
    },
    ...(props.values.scope === 'RECHARGE_THRESHOLD'
      ? [
          {
            id: 'qualifyingAmountMinor',
            accessorKey: 'qualifyingAmountMinor',
            meta: { label: t('Qualifying recharge amount') },
            header: ({
              column,
            }: HeaderContext<CanvasActivityEligibleCustomer, unknown>) => (
              <DataTableColumnHeader
                column={column}
                title={t('Qualifying recharge amount')}
              />
            ),
            cell: ({
              row,
            }: {
              row: {
                original: NonNullable<typeof customers.data>['items'][number]
              }
            }) => (
              <Button
                type='button'
                variant='link'
                className='h-auto p-0'
                onClick={() => setBasisCustomer(row.original)}
              >
                ¥{minorToCny(row.original.qualifyingAmountMinor)}
              </Button>
            ),
          },
        ]
      : []),
  ]
  return (
    <div className='space-y-3 lg:col-span-2'>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div>
          <Label>{t('Customer scope')}</Label>
          <Select
            value={props.values.scope ?? 'SELECTED'}
            onValueChange={(value) => {
              props.form.setValue('scope', value as ManualValues['scope'], {
                shouldValidate: true,
              })
              clearSelection()
              resetPage()
            }}
          >
            <SelectTrigger
              className='w-full min-w-0'
              aria-label={t('Customer scope')}
            >
              <CanvasLocalizedSelectValue
                value={props.values.scope}
                valueLabelKey={
                  props.values.scope === 'RECHARGE_THRESHOLD'
                    ? 'Recharge threshold'
                    : 'Selected customers'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='SELECTED'>
                {t('Selected customers')}
              </SelectItem>
              <SelectItem value='RECHARGE_THRESHOLD'>
                {t('Recharge threshold')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {props.values.scope === 'RECHARGE_THRESHOLD' ? (
          <>
            <FormInput
              form={props.form}
              name='minimumRechargeRmb'
              label={t('Minimum recharge amount (CNY)')}
              inputMode='decimal'
            />
            <div className='sm:col-span-2'>
              <p className='mb-2 text-sm font-medium'>{t('Redeemed time')}</p>
              <CanvasDateRangeFilter
                from={
                  props.values.redeemedFrom
                    ? new Date(props.values.redeemedFrom)
                    : undefined
                }
                to={
                  props.values.redeemedTo
                    ? new Date(props.values.redeemedTo)
                    : undefined
                }
                onFromChange={(value) => {
                  props.form.setValue(
                    'redeemedFrom',
                    value ? toDateTimeLocal(value.toISOString()) : '',
                    { shouldValidate: true }
                  )
                  resetPage()
                }}
                onToChange={(value) => {
                  props.form.setValue(
                    'redeemedTo',
                    value ? toDateTimeLocal(value.toISOString()) : '',
                    { shouldValidate: true }
                  )
                  resetPage()
                }}
              />
            </div>
          </>
        ) : null}
      </div>
      <CanvasServerTable
        data={customers.data?.items ?? []}
        columns={columns}
        total={customers.data?.total ?? 0}
        state={table}
        searchLabel={t('Customer')}
        loading={customers.isPending || customers.isFetching}
        error={customers.isError}
        onRetry={() => void customers.refetch()}
        emptyTitle={t('No eligible customers')}
        filteredEmptyTitle={t('No customers match the current filters')}
        getRowId={(item) => item.customerId}
      />
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-muted-foreground text-sm'>
          {t('Selected {{count}} customers · Planned total {{points}} points', {
            count: selectedCount,
            points:
              selectedCount &&
              props.values.points &&
              /^\d+$/u.test(props.values.points)
                ? (
                    BigInt(selectedCount) * BigInt(props.values.points)
                  ).toString()
                : '0',
          })}
        </p>
        {!editing &&
        props.values.scope === 'RECHARGE_THRESHOLD' &&
        !props.values.selectionToken &&
        visibleCustomers.length > 0 &&
        visibleCustomers.every((customer) => isSelected(customer)) &&
        customers.data?.total ? (
          <Button
            type='button'
            variant='outline'
            disabled={selectAllMatching.isPending}
            onClick={() => selectAllMatching.mutate()}
          >
            {t('Select all {{count}} matching customers', {
              count: customers.data.total,
            })}
          </Button>
        ) : null}
        {selectedCount > 0 ? (
          <Button type='button' variant='outline' onClick={clearSelection}>
            {t('Clear selection')}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <p className='text-muted-foreground text-sm'>
          {t(
            'Membership before {{before}} · Added {{added}} · Removed {{removed}} · After {{after}}',
            {
              before: props.baselineSelection?.count ?? 0,
              added: addedCustomerIds.length,
              removed: clearBaseline
                ? (props.baselineSelection?.count ?? 0)
                : removedCustomerIds.length,
              after: selectedCount,
            }
          )}{' '}
          {addedCustomerIds.length
            ? `${t('Added')}: ${addedCustomerIds.map((id) => changedNames[id] ?? id).join(', ')}`
            : null}{' '}
          {removedCustomerIds.length
            ? `${t('Removed')}: ${removedCustomerIds.map((id) => changedNames[id] ?? id).join(', ')}`
            : null}
        </p>
      ) : null}
      <CurrentEligibilityBasisSheet
        customer={basisCustomer}
        minimumRechargeAmountMinor={threshold}
        redeemedFrom={props.values.redeemedFrom}
        redeemedTo={props.values.redeemedTo}
        onClose={() => setBasisCustomer(undefined)}
      />
    </div>
  )
}

function CurrentEligibilityBasisSheet(props: {
  customer?: { customerId: string; customer: string }
  minimumRechargeAmountMinor: string | null
  redeemedFrom?: string
  redeemedTo?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const basis = useQuery({
    queryKey: [
      'canvas-cloud',
      'current-activity-eligibility-basis',
      props.customer?.customerId,
      props.minimumRechargeAmountMinor,
      props.redeemedFrom,
      props.redeemedTo,
    ],
    enabled:
      Boolean(props.customer && props.minimumRechargeAmountMinor) &&
      isCanvasDateRangeValid(
        props.redeemedFrom ? new Date(props.redeemedFrom) : undefined,
        props.redeemedTo ? new Date(props.redeemedTo) : undefined
      ),
    queryFn: ({ signal }) =>
      getCanvasCurrentManualGrantEligibilityBasis(
        props.customer?.customerId ?? '',
        {
          minimumRechargeAmountMinor: props.minimumRechargeAmountMinor ?? '1',
          currency: 'CNY',
          ...(props.redeemedFrom
            ? { redeemedFrom: new Date(props.redeemedFrom).toISOString() }
            : {}),
          ...(props.redeemedTo
            ? { redeemedTo: new Date(props.redeemedTo).toISOString() }
            : {}),
        },
        signal
      ),
  })
  return (
    <Sheet
      open={Boolean(props.customer)}
      onOpenChange={(open) => !open && props.onClose()}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {t('Eligibility basis')} · {props.customer?.customer}
          </SheetTitle>
        </SheetHeader>
        <div className='space-y-3 p-4 text-sm'>
          {basis.isPending ? <p>{t('Loading')}</p> : null}
          {basis.isError ? (
            <p role='alert'>{t('Unable to load eligibility basis')}</p>
          ) : null}
          {basis.data ? <EligibilityBasisContent basis={basis.data} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function cnyThresholdToMinor(value: string): string | null {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/u.exec(value.trim())
  if (!match?.[1]) return null
  const minor =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  return minor > 0n && minor <= 999_999_999_999_999_999n
    ? minor.toString()
    : null
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}
