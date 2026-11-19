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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { formatCanvasDateTime } from '../formatters'
import {
  ignoreModelListings,
  type ListedModel,
} from '../model-availability-api'

// MODEL-LISTING-ALERT-001: the new provider models on the 上下架监测 page and the way to dismiss them.

const entryKey = (model: ListedModel) =>
  `${model.providerId}\n${model.upstreamId}`

function useIgnoreListings(onChanged: () => void) {
  return useMutation({
    mutationFn: (selection: Parameters<typeof ignoreModelListings>[0]) =>
      ignoreModelListings(selection),
    onSettled: onChanged,
  })
}

/** The newest time among the rows shown; ISO times of one format compare as text. */
const newestFirstSeen = (models: ListedModel[]) =>
  models.reduce(
    (newest, model) =>
      model.firstSeenAt > newest ? model.firstSeenAt : newest,
    ''
  )

function IgnoreFailed() {
  const { t } = useTranslation()
  return (
    <p role='alert' className='text-destructive text-sm'>
      {t('Ignoring failed. Try again.')}
    </p>
  )
}

/** Ignores what was shown when it was clicked: one found while the administrator confirmed is newer and stays listed. */
export function IgnoreAllListingsButton(props: {
  models: ListedModel[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState<ListedModel[] | null>(null)
  const ignore = useIgnoreListings(props.onChanged)
  return (
    <>
      <Button
        variant='outline'
        disabled={props.models.length === 0}
        onClick={() => setConfirming(props.models)}
      >
        {t('Ignore all ({{count}})', { count: props.models.length })}
      </Button>
      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
        title={t('Ignore all new models?')}
        desc={t(
          '{{count}} models leave the list and cannot be restored. Alerts already sent are not affected.',
          { count: confirming?.length ?? 0 }
        )}
        confirmText={t('Ignore all')}
        isLoading={ignore.isPending}
        handleConfirm={() => {
          if (!confirming) return
          ignore.mutate(
            { firstSeenThrough: newestFirstSeen(confirming) },
            { onSuccess: () => setConfirming(null) }
          )
        }}
      >
        {ignore.isError ? <IgnoreFailed /> : null}
      </ConfirmDialog>
    </>
  )
}

export function ModelListingTable(props: {
  models: ListedModel[]
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const ignore = useIgnoreListings(props.onChanged)
  if (props.models.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        {t(
          'No new models. Only models that appeared after the baseline, contain a keyword and are not yet added are listed.'
        )}
      </p>
    )
  }
  return (
    <div className='space-y-2'>
      {ignore.isError ? <IgnoreFailed /> : null}
      <div className='overflow-x-auto rounded-lg border'>
        <Table className='min-w-[680px]'>
          <TableHeader>
            <TableRow>
              <TableHead>
                {t('New models ({{count}})', { count: props.models.length })}
              </TableHead>
              <TableHead>{t('API provider')}</TableHead>
              <TableHead>{t('First found')}</TableHead>
              <TableHead className='text-center'>{t('Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.models.map((model) => (
              <TableRow key={entryKey(model)}>
                <TableCell className='font-mono'>{model.upstreamId}</TableCell>
                <TableCell>{model.providerName}</TableCell>
                <TableCell className='tabular-nums'>
                  {formatCanvasDateTime(model.firstSeenAt)}
                </TableCell>
                <TableCell className='text-center'>
                  <Button
                    size='sm'
                    variant='outline'
                    disabled={ignore.isPending}
                    aria-label={t('Ignore {{model}}', {
                      model: model.upstreamId,
                    })}
                    onClick={() =>
                      ignore.mutate({
                        items: [
                          {
                            providerId: model.providerId,
                            upstreamId: model.upstreamId,
                          },
                        ],
                      })
                    }
                  >
                    {t('Ignore')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
