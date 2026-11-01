/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { sameDocument } from '../../catalog-channel-draft'
import type { CatalogEditPlan } from '../../catalog-edit-api'
import type { CatalogJson } from '../../catalog-edit-types'

/** Confirms a new version of a Channel: what versions change and what each model's request becomes. */
export function ChannelPublishDialog(props: { plan: CatalogEditPlan; baseProfile: CatalogJson | null; profile: CatalogJson; contractChanged: boolean; busy: boolean; error?: string; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation()
  const { plan } = props
  const blocked = plan.requestChanges.filter((change) => !change.after.ok)
  const nothing = plan.action === 'NO_CHANGES'
  const channel = plan.changes.find((change) => change.resourceType === 'PROVIDER_CHANNEL' && change.action !== 'REUSE')
  const versions = [
    t('Adapter profile: {{before}} → new admin version', { before: String(props.baseProfile?.version ?? '') }),
    props.contractChanged ? t('API contract: changed') : t('API contract: unchanged'),
    ...(channel ? [t('Channel configuration: v{{before}} → v{{after}}', { before: channel.currentVersion ?? '', after: channel.proposedVersion ?? '' })] : []),
  ]
  const requestChanged = (change: CatalogEditPlan['requestChanges'][number]) => !sameDocument(change.before, change.after)
  const versionOf = (productKey: string) => {
    const model = plan.models.find((entry) => entry.productKey === productKey)
    return model && model.action !== 'NO_OP' ? ` v${model.currentVersion} → v${model.proposedVersion}` : ''
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) props.onClose() }}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{nothing ? t('There is nothing to publish.') : blocked.length ? t('{{count}} models block the publication', { count: blocked.length }) : t('Publish a new version of the Channel configuration?')}</DialogTitle>
        </DialogHeader>
        {nothing ? null : (
          <div className='space-y-3 text-sm'>
            <ul className='list-disc space-y-1 pl-5'>{versions.map((entry) => <li key={entry} className='break-all'>{entry}</li>)}</ul>
            <div className='font-medium'>{t('Affected models ({{count}})', { count: plan.requestChanges.length })}</div>
            {plan.requestChanges.length ? (
              <dl className='grid max-h-64 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 overflow-auto text-xs'>
                {plan.requestChanges.flatMap((change) => [
                  <dt key={`${change.productKey}-name`} className='break-all'>{change.displayName}{versionOf(change.productKey)}</dt>,
                  <dd key={`${change.productKey}-value`} className={`m-0 [overflow-wrap:anywhere] ${change.after.ok ? '' : 'text-destructive'}`}>
                    {change.after.ok ? (requestChanged(change) ? `${change.after.method} ${change.after.url}` : t('Request unchanged')) : `${change.after.reason}: ${change.after.message}`}
                  </dd>,
                ])}
              </dl>
            ) : <p className='text-muted-foreground text-xs'>{t('This Channel configuration has no models.')}</p>}
            <p className='text-muted-foreground text-xs'>{t('New tasks use the new version; quoted and running tasks keep the frozen old version.')}</p>
            {props.error ? <p role='alert' className='text-destructive'>{props.error}</p> : null}
          </div>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={props.onClose}>{t('Cancel')}</Button>
          <Button disabled={plan.blocking || blocked.length > 0 || nothing || props.busy} onClick={props.onConfirm}>{t('Publish')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
