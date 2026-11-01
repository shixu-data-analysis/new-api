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
import { useMutation } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import {
  emailFailureKey,
  modelAvailabilityErrorKey,
  testModelAvailabilityEmail,
} from '../model-availability-api'
import { alertEmailsIssue, parseAlertEmails } from '../model-availability-rules'

/** Addresses of the alert mails. Empty means no mails. The test uses what is typed, before it is saved. */
export function ModelAvailabilityEmailField(props: {
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [touched, setTouched] = useState(false)
  const emails = parseAlertEmails(props.value)
  const issue = alertEmailsIssue(emails)
  const describedBy = `${id}-help`
  const test = useMutation({
    mutationFn: () => testModelAvailabilityEmail(emails),
  })
  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{t('Alert email addresses')}</Label>
      <Textarea
        id={id}
        rows={3}
        value={props.value}
        aria-invalid={touched && Boolean(issue)}
        aria-describedby={describedBy}
        onBlur={() => setTouched(true)}
        onChange={(event) => {
          props.onChange(event.target.value)
          test.reset()
        }}
      />
      <p id={describedBy} className='text-muted-foreground text-sm'>
        {t(
          'One per line, up to 10. Leave empty to send no mail. New missing models and possible charges are mailed at once, and missing models still not disabled once a day.'
        )}
      </p>
      {touched && issue ? (
        <p role='alert' className='text-destructive text-sm'>
          {t(issue)}
        </p>
      ) : null}
      <Button
        type='button'
        variant='outline'
        disabled={emails.length === 0 || Boolean(issue) || test.isPending}
        onClick={() => test.mutate()}
      >
        {test.isPending ? t('Sending...') : t('Send a test email')}
      </Button>
      {test.isError ? (
        <p role='alert' className='text-destructive text-sm'>
          {t(
            modelAvailabilityErrorKey(test.error) ??
              'The request failed. Check the fields and try again.'
          )}
        </p>
      ) : null}
      {test.data?.results.map((result) => (
        <p
          key={result.to}
          role='status'
          className={result.ok ? 'text-sm' : 'text-destructive text-sm'}
        >
          {t('{{label}}: ', { label: result.to })}
          {result.ok ? t('Sent') : t(emailFailureKey(result.reason))}
        </p>
      ))}
    </div>
  )
}
