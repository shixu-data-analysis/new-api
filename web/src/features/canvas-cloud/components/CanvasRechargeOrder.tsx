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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { formatCanvasDateTime } from '../formatters'
import type { CanvasAdminRechargeOrder } from '../types'
import { BusinessTerm } from './BusinessTerm'
import { CopyableText } from './CopyableText'

export function CanvasRechargeOrderSummary({
  order,
  showCustomer = false,
  showCorrectionDetails = false,
  actions,
}: {
  order: CanvasAdminRechargeOrder
  showCustomer?: boolean
  showCorrectionDetails?: boolean
  actions?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-wrap items-start justify-between gap-3'>
      <div>
        <h3 className='font-semibold'>{t('Selected order')}</h3>
        <CopyableText value={order.orderNumber} />
        <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm'>
          {showCustomer ? (
            <span>
              {t('{{label}}: ', { label: t('Customer') })}
              {order.customerName ? (
                <CopyableText value={order.customerName} />
              ) : (
                (order.customerEmailMasked ?? '—')
              )}
            </span>
          ) : null}
          <span>
            {t('{{label}}: ', { label: t('Status') })}
            <BusinessTerm kind='rechargeOrderStatus' value={order.status} />
          </span>
          <span>
            {t('{{label}}: ', { label: t('Expected Paid points') })}
            {order.expectedPaidPoints}
          </span>
          <span>
            {t('{{label}}: ', { label: t('Issued Paid points') })}
            {order.issuedPaidPoints}
          </span>
          <span>
            {t('{{label}}: ', {
              label: t('Available Paid points for this order'),
            })}
            {order.availablePaidPoints}
          </span>
          {showCorrectionDetails ? (
            <span>
              {t('{{label}}: ', { label: t('Remaining correctable points') })}
              {order.remainingCorrectionPoints}
            </span>
          ) : null}
          <span>
            {t('{{label}}: ', { label: t('Order created at') })}
            {formatCanvasDateTime(order.createdAt)}
          </span>
          <span>
            {t('{{label}}: ', { label: t('Recharge code redeemed at') })}
            {formatCanvasDateTime(order.redeemedAt, t('Not redeemed'))}
          </span>
        </div>
      </div>
      {actions}
    </div>
  )
}
