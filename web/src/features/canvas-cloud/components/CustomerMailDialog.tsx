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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { getServerErrorCode } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import {
  customerNoticeQueryKeys,
  getActiveCustomerCount,
  sendCustomerMail,
  sendTestCustomerMail,
  type CustomerMailAudience,
} from '../customer-notices-api'
import { mailFailureMessageKey } from '../lib/customer-mail-messages'

const SUBJECT_LIMIT = 60
const BODY_LIMIT = 5000

// COMMUNITY-CONVENTION-001: one plain-text mail to the customers selected in 客户管理, or to every active customer.
// Cloud queues one mail per customer and New API sends each by user ID; inactive customers are skipped.
export function CustomerMailDialog(props: {
  audience: CustomerMailAudience
  onClose: () => void
  onSent?: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const id = useId()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [tried, setTried] = useState<Record<string, boolean>>({})
  const [confirming, setConfirming] = useState(false)
  const attempt = useRef<{ content: string; key: string } | null>(null)
  const everyone = props.audience.kind === 'allActive'
  const audienceCount = useQuery({
    queryKey: customerNoticeQueryKeys.audience,
    queryFn: ({ signal }) => getActiveCustomerCount(signal),
    enabled: everyone,
  })
  const selected =
    props.audience.kind === 'selected' ? props.audience.customers : []
  const skipped = selected.filter(
    (customer) => customer.status !== 'ACTIVE'
  ).length
  const sendCount = everyone
    ? (audienceCount.data?.activeCustomers ?? null)
    : selected.length - skipped

  const subjectError = subject.trim() ? undefined : 'Enter a subject.'
  const bodyError = body.trim() ? undefined : 'Enter the mail text.'
  const showSubjectError = tried.subject && subjectError
  const showBodyError = tried.body && bodyError

  const test = useMutation({
    mutationFn: () =>
      sendTestCustomerMail({
        kind: 'MANUAL',
        subject: subject.trim(),
        body: body.trim(),
      }),
    onSuccess: (result) =>
      toast.success(
        result.addressMasked
          ? t('Test mail sent to {{address}}', {
              address: result.addressMasked,
            })
          : t('Test mail sent')
      ),
    onError: (error) => toast.error(t(mailFailureMessageKey(error))),
  })
  const send = useMutation({
    mutationFn: () => {
      const content = JSON.stringify({
        audience: props.audience.kind,
        subject: subject.trim(),
        body: body.trim(),
        ids: selected.map((customer) => customer.customerId),
      })
      // A retry of the same mail reuses its idempotency key, so a send whose response was lost is not repeated.
      if (attempt.current?.content !== content) {
        attempt.current = {
          content,
          key: `web-customer-mail-${crypto.randomUUID()}`,
        }
      }
      return sendCustomerMail({
        audience: props.audience,
        subject: subject.trim(),
        body: body.trim(),
        idempotencyKey: attempt.current.key,
      })
    },
    onSuccess: async (result) => {
      setConfirming(false)
      toast.success(
        t('Sending {{count}} mails; see Email notifications for the results', {
          count: result.queued,
        })
      )
      await queryClient.invalidateQueries({
        queryKey: customerNoticeQueryKeys.mails,
      })
      props.onSent?.()
      props.onClose()
    },
    onError: (error) => {
      setConfirming(false)
      toast.error(
        t(
          getServerErrorCode(error) === 'EMAIL_NOT_CONFIGURED'
            ? 'Mail is not set up in this environment.'
            : 'Unable to send the mail. Please try again.'
        )
      )
    },
  })

  const validate = (fields: string[]) => {
    setTried((value) => ({
      ...value,
      ...Object.fromEntries(fields.map((field) => [field, true])),
    }))
    return !subjectError && !bodyError
  }

  return (
    <Dialog
      open
      onOpenChange={(open) =>
        !open && !send.isPending ? props.onClose() : undefined
      }
    >
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Send email')}</DialogTitle>
          <DialogDescription className='sr-only'>
            {t('Each customer gets their own copy.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (
              !validate(['subject', 'body']) ||
              sendCount === 0 ||
              sendCount === null
            ) {
              return
            }
            setConfirming(true)
          }}
        >
          <div className='space-y-1.5'>
            <p className='text-sm font-medium'>
              {everyone
                ? t('Recipients: every active customer ({{count}})', {
                    count: audienceCount.data?.activeCustomers ?? '…',
                  })
                : t('Recipients ({{count}})', { count: selected.length })}
            </p>
            {everyone ? null : (
              <ul
                className='flex max-h-28 flex-wrap gap-1.5 overflow-auto'
                aria-label={t('Recipients')}
              >
                {selected.map((customer) => (
                  <li
                    key={customer.customerId}
                    className={cn(
                      'bg-muted rounded-full px-2.5 py-0.5 text-sm',
                      customer.status !== 'ACTIVE' &&
                        'text-muted-foreground line-through'
                    )}
                  >
                    {customer.username ?? '—'}
                  </li>
                ))}
              </ul>
            )}
            {skipped > 0 ? (
              <p className='text-muted-foreground text-xs'>
                {t('{{count}} customers are not active and will be skipped.', {
                  count: skipped,
                })}
              </p>
            ) : null}
            {everyone ? (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Customers who are active when the mail is sent; suspended and closed customers are left out.'
                )}
              </p>
            ) : null}
          </div>
          <div className='space-y-1'>
            <Label htmlFor={`${id}-subject`}>{t('Subject')}</Label>
            <div className='border-input flex overflow-hidden rounded-lg border'>
              <span className='bg-muted text-muted-foreground flex items-center px-2.5 text-sm whitespace-nowrap'>
                {t('【{{brand}}】', { brand: t('Canvas Cloud') })}
              </span>
              <Input
                id={`${id}-subject`}
                className='rounded-none border-0 shadow-none focus-visible:ring-0'
                value={subject}
                maxLength={SUBJECT_LIMIT}
                aria-required='true'
                aria-invalid={Boolean(showSubjectError)}
                aria-describedby={
                  showSubjectError ? `${id}-subject-error` : undefined
                }
                onBlur={() =>
                  setTried((value) => ({ ...value, subject: true }))
                }
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            {showSubjectError ? (
              <p
                id={`${id}-subject-error`}
                role='alert'
                className='text-destructive text-xs'
              >
                {t(subjectError)}
              </p>
            ) : null}
          </div>
          <div className='space-y-1'>
            <Label htmlFor={`${id}-body`}>{t('Mail text')}</Label>
            <Textarea
              id={`${id}-body`}
              value={body}
              rows={8}
              maxLength={BODY_LIMIT}
              aria-required='true'
              aria-invalid={Boolean(showBodyError)}
              aria-describedby={`${id}-body-help${showBodyError ? ` ${id}-body-error` : ''}`}
              onBlur={() => setTried((value) => ({ ...value, body: true }))}
              onChange={(event) => setBody(event.target.value)}
            />
            <p id={`${id}-body-help`} className='text-muted-foreground text-xs'>
              {t('Plain text; line breaks are kept.')}
            </p>
            {showBodyError ? (
              <p
                id={`${id}-body-error`}
                role='alert'
                className='text-destructive text-xs'
              >
                {t(bodyError)}
              </p>
            ) : null}
          </div>
          <DialogFooter className='sm:justify-between'>
            <Button
              type='button'
              variant='outline'
              disabled={test.isPending || send.isPending}
              onClick={() => {
                if (validate(['subject', 'body'])) test.mutate()
              }}
            >
              {t('Send a test mail to me')}
            </Button>
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={send.isPending}
                onClick={props.onClose}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='submit'
                disabled={
                  send.isPending || sendCount === 0 || sendCount === null
                }
              >
                {t('Send')}
              </Button>
            </div>
          </DialogFooter>
        </form>
        <ConfirmDialog
          open={confirming}
          onOpenChange={(open) =>
            !open && !send.isPending ? setConfirming(false) : undefined
          }
          title={t('Send to {{count}} customers?', { count: sendCount ?? 0 })}
          desc={
            skipped > 0
              ? t(
                  'Mails cannot be recalled once sent. {{count}} more customers are skipped.',
                  { count: skipped }
                )
              : t('Mails cannot be recalled once sent.')
          }
          confirmText={t('Send')}
          isLoading={send.isPending}
          handleConfirm={() => send.mutate()}
        />
      </DialogContent>
    </Dialog>
  )
}
