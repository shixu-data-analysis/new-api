/* Copyright (C) 2023-2026 QuantumNous; licensed under GNU AGPL v3 or later. */
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { toIntlLocale } from '@/i18n/languages'

import { taskErrorCategoryLabels } from '../task-error-categories'
import type { TaskOutputOutcome } from '../task-output-outcomes'
import { billingLabels, executionLabels } from '../task-status-labels'

const retrievalSteps: Record<
  NonNullable<TaskOutputOutcome['retrieval']>['step'],
  string
> = {
  DOWNLOAD: 'Result download',
  VALIDATION: 'Result content check',
  STORAGE: 'Result storage',
}

function retrievalDetail(
  retrieval: NonNullable<TaskOutputOutcome['retrieval']>,
  t: TFunction
): string {
  const { httpStatus, failure } = retrieval.lastDetails
  if (typeof httpStatus === 'number') {
    return t('HTTP {{status}}', { status: httpStatus })
  }
  if (failure === 'TIMEOUT') return t('Connection timed out')
  if (failure === 'CONNECTION') return t('Connection failed')
  return t(
    taskErrorCategoryLabels[retrieval.lastReasonCode] ??
      'Unknown error category'
  )
}

/**
 * The results of one call that did not simply succeed, one line each, under the call's own fields: what happened to the
 * result, why, and its points; a result fetched only after failed attempts adds how often and the last failure.
 */
export function CallResults({
  outcomes,
}: {
  outcomes: ReadonlyArray<TaskOutputOutcome>
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  if (outcomes.length === 0) return null
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'medium' })
  const points = new Intl.NumberFormat(locale)
  return (
    <section className='space-y-2'>
      <h4 className='text-sm font-medium'>{t('Results')}</h4>
      <ul className='space-y-2'>
        {outcomes.map((outcome) => {
          const failed = outcome.executionStatus === 'CONFIRMED_FAILED'
          let billing = t(billingLabels[outcome.billingStatus] ?? 'Unknown')
          if (outcome.wholeRequest) {
            billing = t('Billed per whole request, no points of its own')
          } else if (outcome.points !== null) {
            billing = t('{{status}} {{points}} points', {
              status: billing,
              points: points.format(BigInt(outcome.points)),
            })
          }
          const facts = [
            outcome.errorCode
              ? t(
                  taskErrorCategoryLabels[outcome.errorCode] ??
                    'Unknown error category'
                )
              : null,
            outcome.manualResult ? t('Manual result applied') : null,
            billing,
          ].filter(Boolean)
          const retrieval = outcome.retrieval
          return (
            <li
              key={outcome.outputIndex}
              className='grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 text-sm'
            >
              <span className='font-medium'>
                {t('Result {{position}}', {
                  position: outcome.outputIndex + 1,
                })}
              </span>
              <span className='min-w-0'>
                <span className={failed ? 'text-destructive' : undefined}>
                  {t(executionLabels[outcome.executionStatus] ?? 'Unknown')}
                </span>
                {facts.map((fact) => ` · ${fact}`)}
                {retrieval ? (
                  <span className='text-muted-foreground mt-1 block text-xs'>
                    {t(
                      outcome.executionStatus === 'SUCCEEDED'
                        ? '{{step}} failures: {{failures}}, last at {{time}}: {{detail}}; then succeeded'
                        : '{{step}} failures: {{failures}}, last at {{time}}: {{detail}}',
                      {
                        step: t(retrievalSteps[retrieval.step]),
                        failures: retrieval.failures,
                        time: time.format(new Date(retrieval.lastAt)),
                        detail: retrievalDetail(retrieval, t),
                        interpolation: { escapeValue: false },
                      }
                    )}
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
