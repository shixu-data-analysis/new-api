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
import { useTranslation } from 'react-i18next'

import type { CanvasAdminTaskRecordDetail } from '../types'
import { DetailValue } from './DetailValue'

// Which provider address check stopped a task before it was sent; Cloud records the check, never the host.
const providerUrlRejectionKeys: Record<string, string> = {
  URL_NOT_HTTPS: 'The provider address is not credential-free HTTPS',
  URL_LOCALHOST: 'The provider address points to this machine',
  URL_FORBIDDEN_NETWORK:
    'The provider host resolves to a private or reserved network',
  URL_DNS_CHANGED: 'The provider host resolved differently during the task',
  URL_DNS_NOT_FOUND: 'The provider host does not exist',
  URL_DNS_UNAVAILABLE:
    'The provider host could not be resolved at that moment; retrying usually works',
}

/** Why a task stopped before it reached the provider, shown alike in task details and the operation log. */
export function PreflightDiagnosticDetails(props: {
  diagnostic: NonNullable<CanvasAdminTaskRecordDetail['preflightDiagnostic']>
}) {
  const { t } = useTranslation()
  return (
    <dl className='grid gap-4 sm:grid-cols-2'>
      <DetailValue label='Failure stage'>
        <span className='font-mono select-text'>{props.diagnostic.stage}</span>
      </DetailValue>
      <DetailValue label='Specific reason'>
        {props.diagnostic.reason === 'BODY_TEMPLATE_INVALID'
          ? `${t('Request template invalid')} · `
          : null}
        <span className='font-mono select-text'>{props.diagnostic.reason}</span>
      </DetailValue>
      {props.diagnostic.detail ? (
        <DetailValue
          label={
            props.diagnostic.reason === 'PROVIDER_URL_REJECTED'
              ? 'Provider address check'
              : 'Template error'
          }
        >
          {props.diagnostic.detail === 'INTEGER_CONVERSION_FAILED'
            ? `${t('Integer conversion failed')} · `
            : null}
          {providerUrlRejectionKeys[props.diagnostic.detail]
            ? `${t(providerUrlRejectionKeys[props.diagnostic.detail])} · `
            : null}
          <span className='font-mono select-text'>
            {props.diagnostic.detail}
          </span>
        </DetailValue>
      ) : null}
      {props.diagnostic.field ? (
        <DetailValue label='Field path'>
          <span className='font-mono select-text'>
            {props.diagnostic.field}
          </span>
        </DetailValue>
      ) : null}
      {props.diagnostic.rule ? (
        <DetailValue label='Validation rule'>
          <span className='font-mono select-text'>{props.diagnostic.rule}</span>
        </DetailValue>
      ) : null}
    </dl>
  )
}
