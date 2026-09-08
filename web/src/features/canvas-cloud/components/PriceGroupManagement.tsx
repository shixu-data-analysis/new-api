import { useMutation, useQuery } from '@tanstack/react-query'
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
import type { ColumnDef } from '@tanstack/react-table'
import { type ReactNode, useMemo, useState } from 'react'
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
import { toIntlLocale } from '@/i18n/languages'

import { getCanvasPriceGroups, publishConfirmedCanvasPriceGroup } from '../api'
import { getCanvasBusinessTermLabelKey } from '../business-terms'
import type { CanvasPriceGroupVersion } from '../types'
import { BusinessTerm } from './BusinessTerm'
import { PricingActionConfirmation } from './PricingActionConfirmation'
import { PricingRecordsTable } from './PricingRecordsTable'
import { PricingTableColumnHeader } from './PricingTableColumnHeader'

function dateTime(value: string | null, language: string): string {
  return value
    ? new Intl.DateTimeFormat(toIntlLocale(language), {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—'
}

function groupColumn(
  id: string,
  term: string,
  accessorFn: (group: CanvasPriceGroupVersion) => unknown,
  cell: (group: CanvasPriceGroupVersion) => ReactNode
): ColumnDef<CanvasPriceGroupVersion, unknown> {
  return {
    id,
    accessorFn,
    header: ({ column }) => (
      <PricingTableColumnHeader column={column} term={term} />
    ),
    cell: ({ row }) => cell(row.original),
  }
}

export function PriceGroupManagement() {
  const { t, i18n } = useTranslation()
  const [form, setForm] = useState({
    internalName: '',
  })
  const [nameTouched, setNameTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const groups = useQuery({
    queryKey: ['canvas-cloud', 'price-groups'],
    queryFn: getCanvasPriceGroups,
  })
  const internalName = form.internalName.trim().normalize('NFC')
  const requiredError = (value: string, valid: boolean, message: string) => {
    if (value.length === 0) return t('This field is required')
    if (!valid) return t(message)
    return null
  }
  const nameError = requiredError(
    internalName,
    [...internalName].length <= 128,
    'Use no more than 128 characters'
  )
  const refresh = async () => {
    await groups.refetch()
  }
  const publishGroup = useMutation({
    mutationFn: () => publishConfirmedCanvasPriceGroup({ internalName }),
    onSuccess: async () => {
      setConfirmationOpen(false)
      toast.success(t('Price group published'))
      setForm((current) => ({ ...current, internalName: '' }))
      setNameTouched(false)
      setSubmitted(false)
      await refresh()
    },
    onError: () => toast.error(t('Price group publication failed')),
  })
  const groupColumns = useMemo<ColumnDef<CanvasPriceGroupVersion, unknown>[]>(
    () => [
      groupColumn(
        'code',
        'PRICE_GROUP_CODE',
        (group) => group.code,
        (group) => group.code
      ),
      groupColumn(
        'name',
        'PRICE_GROUP_NAME',
        (group) => group.internalName,
        (group) => group.internalName
      ),
      groupColumn(
        'version',
        'GROUP_VERSION',
        (group) => group.version,
        (group) => `v${group.version}`
      ),
      groupColumn(
        'status',
        'GROUP_STATUS',
        (group) =>
          t(getCanvasBusinessTermLabelKey('configStatus', group.status)),
        (group) => <BusinessTerm kind='configStatus' value={group.status} />
      ),
      groupColumn(
        'created',
        'GROUP_CREATED',
        (group) => group.createdAt,
        (group) =>
          dateTime(group.createdAt, i18n.resolvedLanguage ?? i18n.language)
      ),
      groupColumn(
        'approved',
        'GROUP_APPROVED',
        (group) => group.approvedAt ?? '',
        (group) =>
          dateTime(group.approvedAt, i18n.resolvedLanguage ?? i18n.language)
      ),
      groupColumn(
        'effective',
        'GROUP_EFFECTIVE',
        (group) => group.effectiveAt ?? '',
        (group) =>
          dateTime(group.effectiveAt, i18n.resolvedLanguage ?? i18n.language)
      ),
    ],
    [t, i18n.resolvedLanguage, i18n.language]
  )
  const groupFilters = useMemo(
    () => [
      { columnId: 'code', label: t('Price group code') },
      { columnId: 'name', label: t('Price group name') },
      { columnId: 'version', label: t('Group version') },
      { columnId: 'status', label: t('Status') },
    ],
    [t]
  )
  const confirmationDetails = [
    { label: t('Price group name'), value: internalName },
    { label: t('Price group code'), value: t('Generated automatically') },
  ]

  const confirmAction = () => {
    publishGroup.mutate()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Price plans')}</CardTitle>
        <CardDescription>
          {t(
            'Price groups define internal customer pricing segments. Review and confirm a new group before it is published for pricing.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <form
          aria-label={t('Create price group')}
          className='bg-muted/20 max-w-5xl rounded-xl border p-4'
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
            if (nameError) return
            setConfirmationOpen(true)
          }}
        >
          <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start'>
            <div className='space-y-1'>
              <Label htmlFor='price-group-name' className='min-h-5'>
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
                onBlur={() => setNameTouched(true)}
                aria-required='true'
                aria-describedby={
                  (submitted || nameTouched) && nameError
                    ? 'price-group-name-error'
                    : undefined
                }
                aria-invalid={(submitted || nameTouched) && Boolean(nameError)}
              />
              {(submitted || nameTouched) && nameError && (
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
              disabled={publishGroup.isPending}
            >
              {t('Review new price group')}
            </Button>
          </div>
        </form>

        {groups.isPending && (
          <div className='text-muted-foreground text-sm'>{t('Loading')}</div>
        )}
        {groups.isError && (
          <Button variant='outline' onClick={() => void groups.refetch()}>
            {t('Retry')}
          </Button>
        )}
        <div className='space-y-3'>
          <div>
            <h3 className='text-sm font-semibold'>
              {t('Price group records')}
            </h3>
          </div>
          <PricingRecordsTable
            columns={groupColumns}
            data={groups.data ?? []}
            filters={groupFilters}
            getRowId={(group) => group.id}
            initialSorting={[{ id: 'created', desc: true }]}
            emptyTitle={t('No price group records')}
          />
        </div>
        <PricingActionConfirmation
          open={confirmationOpen}
          onOpenChange={setConfirmationOpen}
          title={t('Confirm price group change')}
          description={t(
            'Review the values below. Confirmation approves and publishes the change in one protected operation; published history remains immutable.'
          )}
          details={confirmationDetails}
          confirmLabel={t('Confirm change')}
          pending={publishGroup.isPending}
          onConfirm={confirmAction}
        />
      </CardContent>
    </Card>
  )
}
