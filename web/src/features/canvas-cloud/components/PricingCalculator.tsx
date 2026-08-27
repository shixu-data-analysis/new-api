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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import { getCanvasPointIssuanceRates } from '../api'
import {
  DEFAULT_TARGET_MARGIN_PERCENT,
  type PricingQuestionnaireAnswers,
} from '../pricing-simulation'
import { PricingQuestionnaire } from './PricingQuestionnaire'

export function PricingCalculator() {
  const { t } = useTranslation()
  const rates = useQuery({
    queryKey: ['canvas-cloud', 'point-issuance-rates'],
    queryFn: getCanvasPointIssuanceRates,
  })
  const publishedRate = rates.data?.find((rate) => rate.status === 'PUBLISHED')
  const [pointsPerRmb, setPointsPerRmb] = useState('50')
  const [answers, setAnswers] = useState<PricingQuestionnaireAnswers>({
    targetMarginPercent: DEFAULT_TARGET_MARGIN_PERCENT,
    successProbabilityPercent: '90',
    successfulTaskCostRmb: '2',
    failedUnrecoverableCostRmb: '0.5',
    otherVariableCostRmb: '0.1',
    riskBufferRmb: '0.2',
    proposedPoints: '150',
  })

  useEffect(() => {
    if (publishedRate) {
      setPointsPerRmb(String(Number(publishedRate.pointsPerRmb)))
    }
  }, [publishedRate])

  return (
    <div className='mx-auto w-full max-w-5xl space-y-4'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Pricing simulator')}</CardTitle>
          <CardDescription>
            {t(
              'Answer four questions to calculate a consistent price recommendation. This page never changes published pricing.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            aria-label={t('Pricing simulator')}
            onSubmit={(event) => event.preventDefault()}
          >
            <PricingQuestionnaire
              idPrefix='sim'
              answers={answers}
              pointsPerRmb={pointsPerRmb}
              onChange={(key, value) =>
                setAnswers((current) => ({ ...current, [key]: value }))
              }
            />
          </form>
          <p className='text-muted-foreground mt-4 text-xs leading-5'>
            {t('Simulation has no side effects')}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
