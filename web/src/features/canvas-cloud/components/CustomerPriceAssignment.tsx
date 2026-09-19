/*
Copyright (C) 2023-2026 QuantumNous
This program is free software under the GNU Affero General Public License version 3 or later.
*/
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTableColumnHeader } from '@/components/data-table'
import {
  sideDrawerContentClassName,
  sideDrawerFooterClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
  SideDrawerSection,
} from '@/components/drawer-layout'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

import {
  assignCanvasCustomerPriceGroup,
  getCanvasCustomerPriceAssignments,
  getCanvasPriceGroups,
} from '../api'
import {
  customerPriceAssignmentSchema,
  type CustomerPriceAssignmentValues,
} from '../form-validation'
import { formatCanvasDateTime } from '../formatters'
import type { CanvasCustomerPriceAssignment } from '../types'
import { useServerTableState } from '../use-server-table-state'
import { CanvasServerTable } from './CanvasServerTable'

type Drawer = 'adjust' | 'history' | null

export function CustomerPriceAssignment(props: {
  customerId: string
  customerName?: string
}) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const state = useServerTableState('effectiveAt')
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [review, setReview] = useState<
    | (CustomerPriceAssignmentValues & {
        key: string
        plan: string
        current: string
      })
    | null
  >(null)
  const submitting = useRef(false)
  const query = useQuery({
    queryKey: [
      'canvas-cloud',
      'customer-price-assignments',
      props.customerId,
      state.query,
    ],
    queryFn: ({ signal }) =>
      getCanvasCustomerPriceAssignments(
        props.customerId,
        {
          page: state.query.page,
          pageSize: state.query.pageSize,
          sortOrder: state.query.sortOrder,
          ...(state.query.search ? { group: state.query.search } : {}),
        },
        signal
      ),
  })
  const groups = useQuery({
    queryKey: ['canvas-cloud', 'price-groups'],
    queryFn: getCanvasPriceGroups,
  })
  const form = useForm<CustomerPriceAssignmentValues>({
    resolver: zodResolver(customerPriceAssignmentSchema),
    mode: 'onTouched',
    defaultValues: { priceGroupId: '', reason: '' },
  })
  const formDirty = form.formState.isDirty
  const current = query.data?.currentGroup
  const currentLabel = current
    ? `${current.internalName} · v${current.version}`
    : '—'
  const available = (groups.data ?? []).filter(
    (group) => group.status === 'PUBLISHED' && group.id !== current?.id
  )
  const disabled =
    query.isFetching || groups.isFetching || query.isError || groups.isError
  const mutation = useMutation({
    mutationFn: (value: NonNullable<typeof review>) =>
      assignCanvasCustomerPriceGroup(
        props.customerId,
        { priceGroupId: value.priceGroupId, reason: value.reason },
        value.key
      ),
    onSuccess: async () => {
      form.reset()
      setReview(null)
      setDrawer(null)
      toast.success(t('Price plan updated'))
      await client.invalidateQueries({
        queryKey: [
          'canvas-cloud',
          'customer-price-assignments',
          props.customerId,
        ],
      })
      await client.invalidateQueries({
        queryKey: ['canvas-cloud', 'admin-customer', props.customerId],
      })
    },
    onError: () =>
      toast.error(
        t('Price plan change failed. Refresh the current plan before retrying.')
      ),
    onSettled: () => {
      submitting.current = false
    },
  })
  const columns = useMemo<ColumnDef<CanvasCustomerPriceAssignment, unknown>[]>(
    () => [
      {
        accessorKey: 'internalName',
        header: t('Price plan'),
        enableSorting: false,
        cell: ({ row }) =>
          `${row.original.internalName} · v${row.original.version}`,
      },
      {
        accessorKey: 'reason',
        header: t('Reason'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.reason === 'INVITE_REGISTRATION'
            ? t('Invite registration')
            : row.original.reason,
      },
      {
        accessorKey: 'actorName',
        header: t('Operator'),
        enableSorting: false,
        cell: ({ row }) => row.original.actorName ?? t('Unknown'),
      },
      {
        accessorKey: 'effectiveAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Effective at')} />
        ),
        cell: ({ row }) => formatCanvasDateTime(row.original.effectiveAt),
      },
      {
        accessorKey: 'endedAt',
        header: t('Ended at'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.endedAt
            ? formatCanvasDateTime(row.original.endedAt)
            : t('Current'),
      },
    ],
    [t]
  )
  const close = () => {
    if (mutation.isPending) return
    submitting.current = false
    form.reset()
    setReview(null)
    setDrawer(null)
  }
  const requestClose = () => {
    if (mutation.isPending) return
    if (drawer === 'adjust' && formDirty) setDiscardOpen(true)
    else close()
  }
  return (
    <div className='mt-4 flex flex-wrap items-center gap-2 border-t pt-4 text-sm'>
      <span>
        {t('Price plan')}: <strong>{currentLabel}</strong>
      </span>
      <Button
        type='button'
        size='sm'
        variant='outline'
        disabled={disabled}
        onClick={() => setDrawer('adjust')}
      >
        {t('Adjust')}
      </Button>
      <Button
        type='button'
        size='sm'
        variant='ghost'
        onClick={() => setDrawer('history')}
      >
        {t('View history')}
      </Button>
      {query.isError || groups.isError ? (
        <span role='alert' className='flex flex-wrap items-center gap-2'>
          {t('Unable to load price plans or assignment history')}
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => {
              void query.refetch()
              void groups.refetch()
            }}
          >
            {t('Retry')}
          </Button>
        </span>
      ) : null}

      <Sheet
        open={drawer === 'adjust'}
        onOpenChange={(open) => !open && requestClose()}
      >
        <SheetContent
          className={sideDrawerContentClassName('sm:max-w-[560px]')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>
              {review
                ? t('Confirm adjustment · {{username}}', {
                    username: props.customerName ?? t('Unknown'),
                  })
                : t('Adjust price plan · {{username}}', {
                    username: props.customerName ?? t('Unknown'),
                  })}
            </SheetTitle>
            <SheetDescription>
              {t(
                'Only new quotes use the new plan. Existing quotes and tasks keep their original prices.'
              )}
            </SheetDescription>
          </SheetHeader>
          {review ? (
            <div className={sideDrawerFormClassName()}>
              <SideDrawerSection>
                <dl className='grid gap-4'>
                  <div>
                    <dt className='text-muted-foreground text-sm'>
                      {t('Current price plan')}
                    </dt>
                    <dd>{review.current}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground text-sm'>
                      {t('New price plan')}
                    </dt>
                    <dd>{review.plan}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground text-sm'>
                      {t('Reason')}
                    </dt>
                    <dd className='break-words'>{review.reason}</dd>
                  </div>
                </dl>
              </SideDrawerSection>
            </div>
          ) : (
            <Form {...form}>
              <form
                id='customer-price-plan-form'
                className={sideDrawerFormClassName()}
                onSubmit={form.handleSubmit((value) => {
                  const group = available.find(
                    (item) => item.id === value.priceGroupId
                  )
                  if (!group) return
                  setReview({
                    ...value,
                    key: `customer-price:${crypto.randomUUID()}`,
                    plan: `${group.internalName} · v${group.version}`,
                    current: currentLabel,
                  })
                })}
              >
                <SideDrawerSection>
                  <p className='text-sm'>
                    {t('Current price plan')}: {currentLabel}
                  </p>
                  <FormField
                    control={form.control}
                    name='priceGroupId'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('New price plan')} *</FormLabel>
                        <FormControl>
                          <NativeSelect
                            {...field}
                            disabled={disabled || available.length === 0}
                          >
                            <NativeSelectOption value=''>
                              {t('Select a published price plan')}
                            </NativeSelectOption>
                            {available.map((group) => (
                              <NativeSelectOption
                                key={group.id}
                                value={group.id}
                              >
                                {group.internalName} · v{group.version}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name='reason'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Adjustment reason')} *</FormLabel>
                        <FormControl>
                          <Textarea rows={4} maxLength={255} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!groups.isLoading &&
                  !groups.isError &&
                  available.length === 0 ? (
                    <p className='text-muted-foreground text-sm'>
                      {t('No other published price plans')}
                    </p>
                  ) : null}
                </SideDrawerSection>
              </form>
            </Form>
          )}
          <SheetFooter className={sideDrawerFooterClassName()}>
            <Button
              type='button'
              variant='outline'
              disabled={mutation.isPending}
              onClick={() => (review ? setReview(null) : requestClose())}
            >
              {review ? t('Back to edit') : t('Cancel')}
            </Button>
            <Button
              type={review ? 'button' : 'submit'}
              form={review ? undefined : 'customer-price-plan-form'}
              disabled={
                mutation.isPending ||
                (!review && (disabled || available.length === 0))
              }
              onClick={
                review
                  ? () => {
                      if (submitting.current) return
                      submitting.current = true
                      mutation.mutate(review)
                    }
                  : undefined
              }
            >
              {review ? t('Confirm adjustment') : t('Next')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Discard changes?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Your unsaved entries will be lost.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Keep editing')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false)
                close()
              }}
            >
              {t('Discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet
        open={drawer === 'history'}
        onOpenChange={(open) => !open && close()}
      >
        <SheetContent
          className={sideDrawerContentClassName('sm:max-w-[880px]')}
        >
          <SheetHeader className={sideDrawerHeaderClassName()}>
            <SheetTitle>
              {t('Price plan history · {{username}}', {
                username: props.customerName ?? t('Unknown'),
              })}
            </SheetTitle>
            <SheetDescription>
              {t('Current price plan')}: {currentLabel}
            </SheetDescription>
          </SheetHeader>
          <div className={sideDrawerFormClassName()}>
            <CanvasServerTable
              data={query.data?.items ?? []}
              columns={columns}
              total={query.data?.total ?? 0}
              state={state}
              searchLabel={t('Price plan')}
              loading={query.isFetching}
              error={query.isError}
              errorTitle={t('Unable to load price plans or assignment history')}
              onRetry={() => void query.refetch()}
              emptyTitle={t('No price plan history')}
              filteredEmptyTitle={t('No matching results')}
              getRowId={(row) => row.id}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
