/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { CatalogEditPlan } from '../../catalog-edit-api'
import { requestText } from '../../catalog-edit-logic'
import {
  catalogModelTabCounts,
  catalogSharedChanges,
  catalogSharedChangeKind,
  reviewCatalogModel,
} from '../../catalog-plan-review'
import { CatalogModelPreview } from '../CatalogModelPreview'
import { CatalogSharedResources } from '../CatalogSharedResources'
import {
  PricingActionConfirmation,
  type ConfirmationDetail,
} from '../PricingActionConfirmation'
import { PromptReferenceRewrites } from './PromptReferenceRewrites'

/** The same preview the import page shows: an admin edit and a Bundle go through one plan. */
function versionChange(change: {
  currentVersion: number | null
  proposedVersion: number | null
}): string {
  return change.currentVersion === null
    ? `v${change.proposedVersion}`
    : `v${change.currentVersion} → v${change.proposedVersion}`
}

export function ModelPublishPreview(props: {
  plan: CatalogEditPlan
  title: string
  capability: string
  /** Which kind of admin version this is: edit, new or copy. */
  sourceLabel: string
  modelKey: string | null
  changes: string[]
  copySource: string | null
  busy: boolean
  error?: string
  onBack: () => void
  onConfirm: () => void
  confirmDetails?: ConfirmationDetail[]
  together?: boolean
  /** Models published together on one page. */
  modelCount?: number
  /** What else the publication does, such as a new API Key group or models left unbound. */
  confirmNotes?: string[]
  boundOnPublish?: Record<string, string>
}) {
  const { t } = useTranslation()
  const { plan } = props
  const [tab, setTab] = useState<'models' | 'shared'>('models')
  const [confirming, setConfirming] = useState(false)
  // Several models name their count, published alone or together with a new Channel configuration.
  const several = (props.modelCount ?? 1) > 1
  let confirmTitle = t('Confirm publication?')
  if (props.together) {
    confirmTitle = several
      ? t('Publish together with {{count}} models?', {
          count: props.modelCount,
        })
      : t('Publish together?')
  } else if (several) {
    confirmTitle = t('Publish {{count}} models?', { count: props.modelCount })
  }
  const reviews = useMemo(
    () =>
      plan.models
        .filter((model) => model.action !== 'NO_OP' && model.action !== 'REUSE')
        .map((model) =>
          reviewCatalogModel(model, plan.changes, plan.diagnostics)
        ),
    [plan]
  )
  const shared = useMemo(() => catalogSharedChanges(plan.changes), [plan])
  const counts = catalogModelTabCounts(reviews)
  const sharedChanged = shared.filter(
    (change) => catalogSharedChangeKind(change) !== 'UNCHANGED'
  ).length
  const blockers = plan.diagnostics.filter(
    (diagnostic) => diagnostic.severity !== 'WARNING'
  )
  const nothing = plan.action === 'NO_CHANGES'
  const edited =
    reviews.find((review) => review.model.productKey === props.modelKey) ??
    reviews[0]
  const versionText = edited ? versionChange(edited.model) : ''
  const needsPricing = reviews.some((review) =>
    review.model.pricing.some((price) => price.status !== 'REUSE')
  )
  let explanation = t(
    'New model after publication: the technical configuration can be tested, it awaits pricing and customer display is off. A Bundle import does not update or delete it.'
  )
  if (props.modelKey && edited?.model.currentVersion !== null) {
    explanation = needsPricing
      ? t('{{count}} changes make a new admin version {{version}}.', {
          count: props.changes.length,
          version: `v${edited?.model.proposedVersion}`,
        })
      : t(
          '{{count}} changes make a new admin version {{version}}; price continuity, task snapshots and audit are not affected.',
          {
            count: props.changes.length,
            version: `v${edited?.model.proposedVersion}`,
          }
        )
  } else if (!props.modelKey && !edited) explanation = ''
  const description = [
    props.sourceLabel,
    props.modelKey,
    versionText,
    nothing ? '' : t('Validated'),
  ]
    .filter(Boolean)
    .join(' · ')
  const requests = useMemo(
    () =>
      Object.fromEntries(
        plan.requestChanges.flatMap((change) =>
          change.after.ok
            ? [
                [
                  change.productKey,
                  requestText(
                    change.after,
                    t('API Key of the selected group, hidden')
                  ),
                ],
              ]
            : []
        )
      ),
    [plan, t]
  )
  const followerKeys = useMemo(
    () =>
      reviews
        .filter(
          (review) => !plan.editedModelKeys.includes(review.model.productKey)
        )
        .map((review) => review.model.productKey),
    [plan, reviews]
  )
  const channelVersions = plan.changes.filter(
    (change) =>
      change.resourceType === 'PROVIDER_CHANNEL' &&
      (change.action === 'CREATE' || change.action === 'CREATE_VERSION')
  )
  return (
    <div className='space-y-4'>
      <div className='flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2'>
        <Button variant='outline' size='sm' onClick={props.onBack}>
          {t('Back to editing')}
        </Button>
        <h3 className='text-sm font-medium'>{props.title}</h3>
        <span className='text-muted-foreground text-sm'>
          {props.capability}
        </span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('Publication preview')}</CardTitle>
          <CardDescription className='[overflow-wrap:anywhere]'>
            {description}
          </CardDescription>
          <CardAction>
            <Button
              disabled={plan.blocking || props.busy || nothing}
              onClick={() => setConfirming(true)}
            >
              {t('Confirm publication')}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className='space-y-4'>
          {plan.blocking ? (
            <div
              role='alert'
              className='border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm'
            >
              <div className='font-medium'>
                {t('Cannot publish: {{count}} items must be resolved first', {
                  count: blockers.length,
                })}
              </div>
            </div>
          ) : null}
          {!plan.blocking && nothing ? (
            <p className='text-muted-foreground text-sm'>
              {t('There is nothing to publish.')}
            </p>
          ) : null}
          {!plan.blocking && !nothing ? (
            <>
              <p className='text-sm'>
                {t(
                  'Validated. Before publishing, check this change, its pricing effect and the request sent to the upstream.'
                )}
              </p>
              {explanation ? (
                <p className='text-muted-foreground text-sm'>{explanation}</p>
              ) : null}
            </>
          ) : null}
          <PromptReferenceRewrites plan={plan} />
          {props.error ? (
            <p role='alert' className='text-destructive text-sm'>
              {props.error}
            </p>
          ) : null}
          {props.copySource ? (
            <p className='text-sm'>
              {t(
                'Technical configuration and the API Key group come from {{source}}; later changes of it do not affect the new model. Prices are not reused. After pricing, the customer display still has to be turned on by hand.',
                { source: props.copySource }
              )}
            </p>
          ) : null}
          {channelVersions.length ? (
            <p className='text-muted-foreground font-mono text-xs [overflow-wrap:anywhere] tabular-nums'>
              {channelVersions
                .map((change) => `${change.key} ${versionChange(change)}`)
                .join(t(', '))}
            </p>
          ) : null}
          {followerKeys.length ? (
            <p className='text-muted-foreground text-xs'>
              {t(
                'Follows the Channel configuration; its own settings do not change.'
              )}{' '}
              {followerKeys.join(t(', '))}
            </p>
          ) : null}
          <Tabs
            value={tab}
            onValueChange={(next) => setTab(next as 'models' | 'shared')}
          >
            <TabsList className='max-w-full justify-start overflow-x-auto'>
              <TabsTrigger value='models' className='flex-none'>
                {t('Models')}{' '}
                <span className='rounded-full bg-blue-100 px-2 text-xs font-medium text-blue-800 dark:bg-blue-500/20 dark:text-blue-200'>
                  {t('{{count}} models changed', { count: counts.changed })}
                </span>
                {counts.blocked > 0 ? (
                  <span className='bg-destructive/10 text-destructive rounded-full px-2 text-xs font-medium'>
                    {t('{{count}} block publication', {
                      count: counts.blocked,
                    })}
                  </span>
                ) : null}
                {counts.pending > 0 ? (
                  <span className='rounded-full bg-orange-100 px-2 text-xs font-medium text-orange-800 dark:bg-orange-500/20 dark:text-orange-200'>
                    {t('{{count}} models pending', { count: counts.pending })}
                  </span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value='shared' className='flex-none'>
                {t('Shared resources')}{' '}
                <span className='rounded-full bg-blue-100 px-2 text-xs font-medium text-blue-800 dark:bg-blue-500/20 dark:text-blue-200'>
                  {t('{{count}} resources changed', { count: sharedChanged })}
                </span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value='models' className='mt-2' keepMounted>
              <CatalogModelPreview
                reviews={reviews}
                changes={plan.changes}
                focus={null}
                requests={requests}
                {...(props.boundOnPublish
                  ? { boundOnPublish: props.boundOnPublish }
                  : {})}
                onViewChannel={() => setTab('shared')}
              />
            </TabsContent>
            <TabsContent value='shared' className='mt-2' keepMounted>
              <CatalogSharedResources
                plan={plan}
                changes={shared}
                reviews={reviews}
                focus={null}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      <PricingActionConfirmation
        open={confirming}
        onOpenChange={setConfirming}
        title={confirmTitle}
        description={t(
          'Publishing writes to the audit trail: operator, time, versions before and after.'
        )}
        details={
          props.confirmDetails ?? [
            ...reviews.map((review) => ({
              key: review.model.productKey,
              label: review.model.displayName,
              value:
                review.model.currentVersion === null
                  ? `v${review.model.proposedVersion}`
                  : `v${review.model.currentVersion} → v${review.model.proposedVersion}`,
            })),
            ...channelVersions.map((change) => ({
              key: change.key,
              label: change.key,
              value:
                change.currentVersion === null
                  ? `v${change.proposedVersion}`
                  : `v${change.currentVersion} → v${change.proposedVersion}`,
            })),
          ]
        }
        confirmLabel={props.together ? t('Publish together') : t('Publish')}
        pending={props.busy}
        onConfirm={props.onConfirm}
      >
        {props.confirmNotes?.map((note) => (
          <p key={note} className='text-sm'>
            {note}
          </p>
        ))}
      </PricingActionConfirmation>
    </div>
  )
}
