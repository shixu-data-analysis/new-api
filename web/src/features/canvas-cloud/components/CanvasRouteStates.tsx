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
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { GeneralError } from '@/features/errors/general-error'

import { CanvasRouteFailure } from '../session-failure'

export function CanvasAccessDenied() {
  const { t } = useTranslation()
  return (
    <SectionPageLayout fluid={false}>
      <SectionPageLayout.Content>
        <ErrorState
          title={t('Access denied')}
          description={t('You do not have access to this Canvas section.')}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

export function CanvasSessionUnavailable(props: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <SectionPageLayout fluid={false}>
      <SectionPageLayout.Content>
        <ErrorState
          title={t('Canvas access unavailable')}
          description={t('Please try again later.')}
          onRetry={props.onRetry}
        />
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}

// Route error boundary for Canvas pages. Any other failure keeps the application's general error page.
export function CanvasRouteError(props: ErrorComponentProps) {
  const router = useRouter()
  if (!(props.error instanceof CanvasRouteFailure)) {
    return <GeneralError error={props.error} />
  }
  if (props.error.kind === 'forbidden') return <CanvasAccessDenied />
  return <CanvasSessionUnavailable onRetry={() => void router.invalidate()} />
}
