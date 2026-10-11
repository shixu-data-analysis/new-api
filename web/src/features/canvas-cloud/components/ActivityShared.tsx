/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Copy } from 'lucide-react'
import { useEffect, useContext, useRef, useState, type ReactNode } from 'react'
import {
  get,
  useFormState,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SelectContent as BaseSelectContent } from '@/components/ui/select'

import { ActivityRecordNavigationContext, minorToCny } from '../activity-shared'
import type {
  CanvasEligibilityBasis,
  CanvasTokenCategoryCostReference,
} from '../activity-types'
import { revealCanvasCode } from '../api'
import { copyText } from '../copy-text'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasServerTableState } from '../use-server-table-state'
import { CanvasCodeRevealButton } from './CanvasCodeRevealButton'
import { CanvasServerTable } from './CanvasServerTable'

export function SelectContent(props: { children: ReactNode }) {
  return (
    <BaseSelectContent
      align='start'
      alignItemWithTrigger={false}
      className='w-max max-w-[calc(100vw-2rem)] min-w-(--anchor-width) **:data-[slot=select-item-text]:min-w-0 **:data-[slot=select-item-text]:break-words **:data-[slot=select-item-text]:whitespace-normal'
    >
      {props.children}
    </BaseSelectContent>
  )
}

export function ActivityRecordLink(props: {
  href: string
  focusId: string
  children: ReactNode
  className?: string
}) {
  const navigation = useContext(ActivityRecordNavigationContext)
  const ref = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (navigation?.restoreFocusId !== props.focusId) return
    window.scrollTo({ top: navigation.restoreScrollY ?? 0 })
    ref.current?.focus()
  }, [navigation?.restoreFocusId, navigation?.restoreScrollY, props.focusId])
  return (
    <a
      ref={ref}
      href={props.href}
      className={props.className ?? 'text-primary hover:underline'}
      onClick={() => navigation?.capture(props.focusId)}
    >
      {props.children}
    </a>
  )
}

export type TokenCategoryCostReferenceDisplay = Omit<
  CanvasTokenCategoryCostReference,
  'basePoints' | 'specialPoints'
> & {
  basePoints: string | null
  specialPoints: string | null
}

export function TokenCategoryCostReferences(props: {
  references: TokenCategoryCostReferenceDisplay[] | null
  historical?: boolean
}) {
  const { t } = useTranslation()
  if (!props.references?.length) return null
  return (
    <div className='space-y-3 rounded-md border p-3 text-sm lg:col-span-2'>
      <p className='font-medium'>{t('Token category pricing reference')}</p>
      {props.references.map((reference) => {
        const cannotEvaluate =
          reference.specialPriceRmb === null ||
          reference.differenceRmb === null ||
          reference.belowCostReference === null
        let belowCostReference = '—'
        if (reference.belowCostReference !== null) {
          belowCostReference = reference.belowCostReference ? t('Yes') : t('No')
        }
        return (
          <div
            className='space-y-2 border-t pt-3 first:border-t-0 first:pt-0'
            key={reference.category}
          >
            <p className='font-medium'>
              {t(`Token category ${reference.category}`)}
            </p>
            <dl className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              <TokenCategoryCostFact
                label={t('Base → special')}
                value={`${reference.basePoints ?? '—'} → ${reference.specialPoints ?? '—'}`}
              />
              <TokenCategoryCostFact
                label={t('Points per RMB')}
                value={reference.baseRatePointsPerRmb ?? '—'}
              />
              <TokenCategoryCostFact
                label={t('Pricing cost reference')}
                value={reference.kPricingRmb ?? '—'}
                rmb
              />
              <TokenCategoryCostFact
                label={t('Special price (RMB)')}
                value={reference.specialPriceRmb ?? '—'}
                rmb
              />
              <TokenCategoryCostFact
                label={t('Difference (RMB)')}
                value={reference.differenceRmb ?? '—'}
                rmb
              />
              <TokenCategoryCostFact
                label={t('Below cost reference')}
                value={belowCostReference}
              />
            </dl>
            {cannotEvaluate ? (
              <p className='text-muted-foreground'>
                {t('This category cannot be evaluated yet.')}
              </p>
            ) : null}
          </div>
        )
      })}
      {props.historical ? (
        <p className='text-muted-foreground'>
          {t(
            'Historical pricing facts are frozen at publication and may differ from current pricing.'
          )}
        </p>
      ) : null}
    </div>
  )
}

function TokenCategoryCostFact(props: {
  label: string
  value: string
  rmb?: boolean
}) {
  return (
    <div>
      <dt className='text-muted-foreground'>{props.label}</dt>
      <dd className='tabular-nums'>
        {props.rmb && props.value !== '—' ? `¥${props.value}` : props.value}
      </dd>
    </div>
  )
}

export function EligibilityBasisContent(props: {
  basis: CanvasEligibilityBasis
}) {
  const { t } = useTranslation()
  return (
    <>
      <p>
        {t('{{label}}: ', { label: t('Checked at') })}
        {formatCanvasDateTime(props.basis.checkedAt)}
      </p>
      <p>
        {t('{{label}}: ', { label: t('Qualifying recharge amount') })}¥
        {minorToCny(props.basis.qualifyingAmountMinor)}
      </p>
      <div className='space-y-2'>
        {props.basis.orders.map((order) => (
          <div className='border-b pb-2' key={order.rechargeOrderId}>
            <p>{order.orderNumber}</p>
            <p className='text-muted-foreground'>
              {t('{{label}}: ', { label: t('Original amount') })}¥
              {minorToCny(order.originalAmountMinor)} ·{' '}
              {t('{{label}}: ', { label: t('Returned reference') })}¥
              {minorToCny(order.returnedReferenceAmountMinor)}
            </p>
            <p>
              {t('{{label}}: ', { label: t('Qualifying amount') })}¥
              {minorToCny(order.qualifyingAmountMinor)}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

// Reads the field error through useFormState so that a failed submit re-renders the message.
export function FormInput<TValues extends FieldValues>(props: {
  form: UseFormReturn<TValues>
  name: Path<TValues>
  label: string
  description?: string
  className?: string
  type?: string
  disabled?: boolean
  min?: number
  max?: number
  maxLength?: number
  inputMode?: 'numeric' | 'decimal'
}) {
  const { t } = useTranslation()
  const { errors } = useFormState({
    control: props.form.control,
    name: props.name,
  })
  const id = `activity-${props.name}`
  const error = (get(errors, props.name) as { message?: unknown } | undefined)
    ?.message
  const describedBy = [
    props.description ? `${id}-description` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={props.className}>
      <Label htmlFor={id}>{props.label}</Label>
      <Input
        id={id}
        type={props.type}
        min={props.min}
        max={props.max}
        maxLength={props.maxLength}
        inputMode={props.inputMode}
        disabled={props.disabled}
        {...props.form.register(props.name)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
      />
      {props.description ? (
        <p
          id={`${id}-description`}
          className='text-muted-foreground mt-1 text-xs'
        >
          {props.description}
        </p>
      ) : null}
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

export function ActivityRecordTable<
  TData extends { participationId: string },
>(props: {
  title: string
  table: CanvasServerTableState
  data: TData[]
  total: number
  columns: ColumnDef<TData, unknown>[]
  loading: boolean
  error: boolean
  onRetry: () => void
  emptyTitle: string
  filteredEmptyTitle: string
  getRowId: (item: TData) => string
  filters: ReactNode
  hasActiveFilters: boolean
  onReset: () => void
}) {
  return (
    <div className='space-y-3 border-t pt-4'>
      <h3 className='font-medium'>{props.title}</h3>
      <CanvasServerTable
        data={props.data}
        columns={props.columns}
        total={props.total}
        state={props.table}
        loading={props.loading}
        error={props.error}
        onRetry={props.onRetry}
        emptyTitle={props.emptyTitle}
        filteredEmptyTitle={props.filteredEmptyTitle}
        getRowId={props.getRowId}
        additionalFilters={props.filters}
        hasActiveFilters={props.hasActiveFilters}
        onResetFilters={props.onReset}
      />
    </div>
  )
}

// Same masked code, reveal and copy as the invite code page; each row is revealed on its own and both actions are audited.
export function GrantInviteCode(props: {
  inviteCodeId: string
  maskedCode: string
  allowedActions: Array<'DISPLAY' | 'COPY'>
}) {
  const { t } = useTranslation()
  const [revealedCode, setRevealedCode] = useState<string>()
  const reveal = useMutation({
    mutationFn: (action: 'DISPLAY' | 'COPY') =>
      revealCanvasCode('admin-invite', props.inviteCodeId, action).then(
        (result) => ({ ...result, action })
      ),
    onSuccess: async (result) => {
      if (result.action === 'COPY') {
        await copyText(result.code, {
          copied: t('Invite code copied'),
          failed: t('Failed to copy to clipboard'),
        })
        return
      }
      setRevealedCode(result.code)
    },
    onError: () => toast.error(t('Invite code could not be revealed')),
  })
  return (
    // Sized to its content so a mobile record card aligns it with the other values.
    <div className='inline-flex max-w-full items-start gap-1'>
      <span className='min-w-0 font-mono break-all'>
        {revealedCode ?? props.maskedCode}
      </span>
      {props.allowedActions.includes('DISPLAY') ? (
        <CanvasCodeRevealButton
          label={t(revealedCode ? 'Hide invite code' : 'Show invite code')}
          revealed={Boolean(revealedCode)}
          disabled={reveal.isPending && reveal.variables === 'DISPLAY'}
          onClick={() => {
            if (revealedCode) {
              setRevealedCode(undefined)
              return
            }
            reveal.mutate('DISPLAY')
          }}
        />
      ) : null}
      {props.allowedActions.includes('COPY') ? (
        <Button
          aria-label={t('Copy invite code')}
          disabled={reveal.isPending && reveal.variables === 'COPY'}
          size='icon-sm'
          title={t('Copy invite code')}
          type='button'
          variant='ghost'
          onClick={() => reveal.mutate('COPY')}
        >
          <Copy aria-hidden='true' className='size-4' />
        </Button>
      ) : null}
    </div>
  )
}
