/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import { planCatalogEdit, sendCatalogRealCall } from '../../catalog-edit-api'
import type {
  CatalogEditDraft,
  CatalogModelDefinition,
  CatalogRealCallResult,
  ProviderRequestPreview,
} from '../../catalog-edit-types'
import { diffCatalogJson } from '../../catalog-json-diff'
import { CatalogJsonDiff } from '../CatalogJsonDiff'

export function requestText(request: Extract<ProviderRequestPreview, { ok: true }>, keyLabel: string): string {
  const body = request.body === null ? '' : `\n\n${JSON.stringify(request.body, null, 2)}`
  return `${request.method} ${request.url}\nAuthorization: Bearer <${keyLabel}>\nContent-Type: ${request.contentType ?? '-'}${body}`
}

export function ModelJsonView(props: {
  base: CatalogModelDefinition | null
  draft: CatalogModelDefinition
  draftPayload: () => CatalogEditDraft
  credentialGroupVersionId?: string
  credentialLabel?: string | undefined
  /** A new API provider has no group yet; its key is typed in the form and used for this one call. */
  apiKey?: string
}) {
  const { t } = useTranslation()
  const [sample, setSample] = useState<'default' | 'reference'>('default')
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<CatalogRealCallResult | null>(null)
  const payload = props.draftPayload()
  const ready = Boolean(props.draft.productKey)
  const planned = useQuery({
    queryKey: ['canvas-cloud', 'model-catalog', 'request-preview', sample, JSON.stringify(payload)],
    queryFn: () => planCatalogEdit(payload, { sampleImage: sample === 'reference' }),
    enabled: ready,
    retry: false,
  })
  const request = planned.data?.requestChanges.find((change) => change.productKey === props.draft.productKey)?.after
  const realCall = useMutation({
    mutationFn: (pollTaskId?: string) => sendCatalogRealCall({ draft: payload, modelKey: props.draft.productKey, ...(props.credentialGroupVersionId ? { credentialGroupVersionId: props.credentialGroupVersionId } : {}), ...(props.apiKey ? { apiKey: props.apiKey } : {}), ...(pollTaskId ? { pollTaskId } : {}) }),
    onSuccess: setResult,
  })
  const keyLabel = t('API Key of the selected group, hidden')
  // Design 11: a real call sends the default parameters. The reference example has no real image to send.
  const canCall = sample === 'default' && request?.ok === true && Boolean(props.credentialGroupVersionId || props.apiKey)
  return (
    <div className='space-y-4'>
      <CatalogJsonDiff title={t('Model configuration')} summary={props.base ? t('Compared with the current version') : t('New model')} diff={diffCatalogJson(props.base, props.draft)} copyText={JSON.stringify(props.draft, null, 2)} />
      <div className='space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm font-medium'>{t('Example')}</span>
          <NativeSelect aria-label={t('Example parameters')} className='w-56' value={sample} onChange={(event) => setSample(event.target.value as 'default' | 'reference')}>
            <NativeSelectOption value='default'>{t('Default parameters, no reference image')}</NativeSelectOption>
            <NativeSelectOption value='reference'>{t('Default parameters and one reference image')}</NativeSelectOption>
          </NativeSelect>
        </div>
        {!ready ? <p className='text-muted-foreground text-sm'>{t('Fill in the upstream model ID to see the request.')}</p> : null}
        {planned.isError ? <p role='alert' className='text-destructive text-sm'>{t('The request could not be generated. Correct the form first.')}</p> : null}
        {request?.ok ? (
          <>
            <pre className='overflow-x-auto rounded-lg border p-3 font-mono text-xs'>{requestText(request, keyLabel)}</pre>
            <p role='status' className='text-sm font-medium'>{t('The request matches the contract')}</p>
          </>
        ) : null}
        {request && !request.ok ? (
          <div role='alert' className='border-destructive/40 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm'>
            <p className='font-medium'>{t('The request does not match the contract, so it cannot be published')}</p>
            <p className='font-mono text-xs [overflow-wrap:anywhere]'>{request.reason}: {request.message}</p>
          </div>
        ) : null}
      </div>
      <div className='space-y-2'>
        <p className='text-sm font-medium'>{t('Real call')}</p>
        <Button variant='outline' className='text-destructive border-destructive/50' disabled={!canCall || realCall.isPending} onClick={() => setConfirming(true)}>
          {t('Call the upstream for real')}
        </Button>
        <p className='text-destructive text-xs'>{t('This calls the upstream with the real API Key and costs money.')}</p>
        {sample === 'reference' ? <p className='text-muted-foreground text-xs'>{t('A real call sends the default parameters without a reference image. Select that example to call.')}</p> : null}
        {realCall.isError ? <p role='alert' className='text-destructive text-sm'>{t('The real call was not sent. Wait a few seconds and try again.')}</p> : null}
        {result ? (
          <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm'>
            <dt className='text-muted-foreground'>{t('Sent')}</dt>
            <dd>{result.sent ? t('Yes') : t('No')}</dd>
            {result.response ? (
              <>
                <dt className='text-muted-foreground'>{t('HTTP status')}</dt>
                <dd>{result.response.status ?? (result.response.timedOut ? t('Timed out') : t('Network error'))}</dd>
                <dt className='text-muted-foreground'>{t('Upstream response')}</dt>
                <dd><pre className='max-h-72 overflow-auto font-mono text-xs [overflow-wrap:anywhere] whitespace-pre-wrap'>{result.response.body}</pre></dd>
              </>
            ) : null}
            {result.parsed ? (
              <>
                <dt className='text-muted-foreground'>{t('Read as')}</dt>
                <dd>{result.parsed.state}</dd>
                <dt className='text-muted-foreground'>{t('Results')}</dt>
                <dd className='font-mono text-xs [overflow-wrap:anywhere]'>{result.parsed.outputs.length ? JSON.stringify(result.parsed.outputs) : t('None found by the result paths')}</dd>
                <dt className='text-muted-foreground'>{t('Usage format')}</dt>
                <dd className='font-mono text-xs [overflow-wrap:anywhere]'>{result.parsed.usageProtocol ?? t('Does not read usage')}{result.parsed.usage ? ` ${JSON.stringify(result.parsed.usage)}` : ''}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Call the upstream for real?')}</AlertDialogTitle>
            <AlertDialogDescription className='text-destructive'>{t('This call sends the request with the real API Key and costs money. It is not billed to any customer, and it is written to the audit trail.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
            <dt className='text-muted-foreground'>{t('API Key group')}</dt>
            <dd className='m-0'>{props.credentialLabel ?? keyLabel}</dd>
            <dt className='text-muted-foreground'>{t('Request')}</dt>
            <dd className='m-0 font-mono'>{request?.ok ? <pre className='max-h-64 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]'>{requestText(request, keyLabel)}</pre> : null}</dd>
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={() => realCall.mutate(undefined)}>{t('Confirm the call, it costs money')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
