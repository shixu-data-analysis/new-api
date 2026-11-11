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
import { getServerErrorCode } from '@/lib/server-error-message'

import type { CustomerMailFailureReason } from '../customer-notices-api'

/** Why a test mail did not arrive, as the administrator can act on it. */
export function mailFailureMessageKey(error: unknown): string {
  const code = getServerErrorCode(error)
  if (code === 'EMAIL_NOT_CONFIGURED') {
    return 'Mail is not set up in this environment.'
  }
  const reason = (
    error as { response?: { data?: { details?: { reason?: string } } } }
  ).response?.data?.details?.reason
  if (reason === 'NO_ADDRESS') return 'Your account has no email address.'
  if (reason === 'RATE_LIMITED') {
    return 'Too many mails at once. Try again in a minute.'
  }
  return 'The mail was not sent. Please try again.'
}

/** Why one recipient was not mailed. */
export const MAIL_FAILURE_REASON_KEYS: Record<
  CustomerMailFailureReason,
  string
> = {
  NO_ADDRESS: 'No email address',
  NOT_CONFIGURED: 'Mail is not set up',
  REJECTED: 'Refused by the mail server',
  CUSTOMER_INACTIVE: 'Customer no longer active',
  INTERNAL_ERROR: 'System error',
}
