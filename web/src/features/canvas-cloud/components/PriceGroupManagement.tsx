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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
  approveCanvasPriceGroup,
  createCanvasPriceGroupDraft,
  getCanvasPriceGroups,
  publishCanvasPriceGroup,
} from '../api'
import type { CanvasPriceGroupVersion } from '../types'
import { BusinessTerm } from './BusinessTerm'

function dateTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
}

function GroupDetail(props: { label: string; value: string }) {
  return (
    <div className='min-w-0 space-y-1'>
      <div className='text-muted-foreground text-xs font-medium'>
        <BusinessTerm kind='pricingField' value={props.label} />
      </div>
      <div className='text-sm break-words'>{props.value}</div>
    </div>
  )
}

export function PriceGroupManagement() {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    code: '',
    internalName: '',
    approvalReason: '',
  })
  const [touched, setTouched] = useState({ code: false, internalName: false })
  const [approvalTouched, setApprovalTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const groups = useQuery({
    queryKey: ['canvas-cloud', 'price-groups'],
    queryFn: getCanvasPriceGroups,
  })
  const code = form.code.trim().toUpperCase()
  const internalName = form.internalName.trim()
  const requiredError = (value: string, valid: boolean, message: string) => {
    if (value.length === 0) return t('This field is required')
    if (!valid) return t(message)
    return null
  }
  const codeError = requiredError(
    code,
    /^[A-Z][A-Z0-9_-]{1,63}$/.test(code),
    'Use 2 to 64 uppercase letters, numbers, underscores, or hyphens'
  )
  const nameError = requiredError(
    internalName,
    internalName.length <= 128,
    'Use no more than 128 characters'
  )
  const approvalReason = form.approvalReason.trim()
  let approvalError: string | null = null
  if (approvalReason.length === 0) {
    approvalError = t('This field is required')
  } else if (approvalReason.length < 8) {
    approvalError = t('Enter at least 8 characters')
  } else if (approvalReason.length > 2000) {
    approvalError = t('Use no more than 2000 characters')
  }
  const refresh = async () => {
    await groups.refetch()
  }
  const createDraft = useMutation({
    mutationFn: () => createCanvasPriceGroupDraft({ code, internalName }),
    onSuccess: async () => {
      toast.success(t('Price group draft created'))
      setForm((current) => ({ ...current, code: '', internalName: '' }))
      setTouched({ code: false, internalName: false })
      setSubmitted(false)
      await refresh()
    },
    onError: () => toast.error(t('Price group draft failed')),
  })
  const approve = useMutation({
    mutationFn: (id: string) => approveCanvasPriceGroup(id, approvalReason),
    onSuccess: async () => {
      toast.success(t('Price group approved'))
      await refresh()
    },
    onError: () => toast.error(t('Price group approval failed')),
  })
  const publish = useMutation({
    mutationFn: publishCanvasPriceGroup,
    onSuccess: async () => {
      toast.success(t('Price group published'))
      await refresh()
    },
    onError: () => toast.error(t('Price group publication failed')),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Price groups')}</CardTitle>
        <CardDescription>
          {t(
            'Price groups define internal customer pricing segments. New groups require draft, PLATFORM_ADMIN approval, and publication before pricing can reference them.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <form
          aria-label={t('Create price group draft')}
          className='bg-muted/20 max-w-5xl rounded-xl border p-4'
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
            if (codeError || nameError) return
            createDraft.mutate()
          }}
        >
          <div className='grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_auto] lg:items-start'>
            <div className='space-y-1'>
              <Label htmlFor='price-group-code'>
                <BusinessTerm kind='pricingField' value='PRICE_GROUP_CODE' />
                <span className='text-destructive ml-1' aria-hidden='true'>
                  *
                </span>
              </Label>
              <Input
                id='price-group-code'
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    code: event.target.value.toUpperCase(),
                  }))
                }
                onBlur={() =>
                  setTouched((current) => ({ ...current, code: true }))
                }
                aria-required='true'
                aria-describedby={`price-group-code-help${(submitted || touched.code) && codeError ? ' price-group-code-error' : ''}`}
                aria-invalid={(submitted || touched.code) && Boolean(codeError)}
              />
              <div
                id='price-group-code-help'
                className='text-muted-foreground text-xs'
              >
                {t('Stable internal code, 2 to 64 characters')}
              </div>
              {(submitted || touched.code) && codeError && (
                <div
                  id='price-group-code-error'
                  className='text-destructive text-xs'
                  role='alert'
                >
                  {codeError}
                </div>
              )}
            </div>
            <div className='space-y-1'>
              <Label htmlFor='price-group-name'>
                <BusinessTerm kind='pricingField' value='PRICE_GROUP_NAME' />
                <span className='text-destructive ml-1' aria-hidden='true'>
                  *
                </span>
              </Label>
              <Input
                id='price-group-name'
                value={form.internalName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    internalName: event.target.value,
                  }))
                }
                onBlur={() =>
                  setTouched((current) => ({ ...current, internalName: true }))
                }
                aria-required='true'
                aria-describedby={`price-group-name-help${(submitted || touched.internalName) && nameError ? ' price-group-name-error' : ''}`}
                aria-invalid={
                  (submitted || touched.internalName) && Boolean(nameError)
                }
              />
              <div
                id='price-group-name-help'
                className='text-muted-foreground text-xs'
              >
                {t('Administrator-facing name, up to 128 characters')}
              </div>
              {(submitted || touched.internalName) && nameError && (
                <div
                  id='price-group-name-error'
                  className='text-destructive text-xs'
                  role='alert'
                >
                  {nameError}
                </div>
              )}
            </div>
            <Button
              type='submit'
              className='w-full lg:mt-6 lg:w-auto'
              disabled={createDraft.isPending}
            >
              {t('Create group draft')}
            </Button>
          </div>
        </form>

        {(groups.data ?? []).some((group) => group.status === 'DRAFT') && (
          <div className='max-w-2xl space-y-1'>
            <Label htmlFor='price-group-approval-reason'>
              <BusinessTerm kind='pricingField' value='APPROVAL_REASON' />
            </Label>
            <Input
              id='price-group-approval-reason'
              value={form.approvalReason}
              onChange={(event) => {
                setApprovalTouched(true)
                setForm((current) => ({
                  ...current,
                  approvalReason: event.target.value,
                }))
              }}
              onBlur={() => setApprovalTouched(true)}
              aria-required='true'
              aria-describedby={`price-group-approval-help${approvalTouched && approvalError ? ' price-group-approval-error' : ''}`}
              aria-invalid={
                approvalTouched && approvalError ? 'true' : undefined
              }
            />
            <div
              id='price-group-approval-help'
              className='text-muted-foreground text-xs'
            >
              {t('Required for approval, 8 to 2000 characters')}
            </div>
            {approvalTouched && approvalError && (
              <div
                id='price-group-approval-error'
                className='text-destructive text-xs'
                role='alert'
              >
                {approvalError}
              </div>
            )}
          </div>
        )}
        {groups.isPending && (
          <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
        )}
        {groups.isError && (
          <Button variant='outline' onClick={() => void groups.refetch()}>
            {t('Retry')}
          </Button>
        )}
        <div className='space-y-3'>
          {(groups.data ?? []).map((group: CanvasPriceGroupVersion) => (
            <div key={group.id} className='rounded-xl border p-3 sm:p-4'>
              <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
                <div className='grid min-w-0 flex-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7'>
                  <GroupDetail label='PRICE_GROUP_CODE' value={group.code} />
                  <GroupDetail
                    label='PRICE_GROUP_NAME'
                    value={group.internalName}
                  />
                  <GroupDetail
                    label='GROUP_VERSION'
                    value={`v${group.version}`}
                  />
                  <GroupDetail label='GROUP_STATUS' value={t(group.status)} />
                  <GroupDetail
                    label='GROUP_CREATED'
                    value={dateTime(group.createdAt)}
                  />
                  <GroupDetail
                    label='GROUP_APPROVED'
                    value={dateTime(group.approvedAt)}
                  />
                  <GroupDetail
                    label='GROUP_EFFECTIVE'
                    value={dateTime(group.effectiveAt)}
                  />
                </div>
                <div className='flex flex-wrap gap-2'>
                  {group.status === 'DRAFT' && (
                    <Button
                      size='sm'
                      variant='outline'
                      disabled={approve.isPending || Boolean(approvalError)}
                      onClick={() => approve.mutate(group.id)}
                    >
                      {t('Approve')}
                    </Button>
                  )}
                  {group.status === 'APPROVED' && (
                    <Button
                      size='sm'
                      disabled={publish.isPending}
                      onClick={() => publish.mutate(group.id)}
                    >
                      {t('Publish')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
