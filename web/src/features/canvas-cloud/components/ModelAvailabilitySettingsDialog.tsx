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

import { TagInput } from '@/components/tag-input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  modelAvailabilityErrorKey,
  saveModelAvailabilitySettings,
  type AvailabilityOverview,
  type CustomRule,
  type ListSource,
} from '../model-availability-api'
import { CanvasRowAction } from './CanvasRowAction'
import { ModelAvailabilityRuleDialog } from './ModelAvailabilityRuleDialog'
import { NotificationSendTo } from './NotificationSendTo'

const SOURCE_LABELS: Record<ListSource, string> = {
  V1_MODELS: 'Model list /v1/models',
  PUBLIC_PRICING: 'Public prices /api/pricing',
  CUSTOM: 'Custom rule',
  OFF: 'Do not probe',
}

interface ProviderDraft {
  source: ListSource
  rule: CustomRule | null
  confirmUntested: boolean
  untested: boolean
}

const wholeNumber = (value: string, max: number) =>
  /^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= max

// The server stores keywords lower-cased without repeats (MODEL-LISTING-ALERT-001); the page shows them the same way.
const KEYWORD_LIMIT = 50
const KEYWORD_LENGTH = 64
const normalKeywords = (keywords: string[]) => [
  ...new Set(keywords.map((keyword) => keyword.trim().toLowerCase())),
]

/** A bounded whole number: a narrow box, its range below, red while out of range. */
function WholeNumberField(props: {
  id: string
  label: string
  help: string
  value: string
  valid: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        inputMode='numeric'
        className='w-28'
        value={props.value}
        aria-invalid={!props.valid}
        aria-describedby={`${props.id}-help`}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <p
        id={`${props.id}-help`}
        className={
          props.valid
            ? 'text-muted-foreground text-sm'
            : 'text-destructive text-sm'
        }
      >
        {props.help}
      </p>
    </div>
  )
}

function GroupTitle(props: { children: string; first?: boolean }) {
  return (
    <h3
      className={
        props.first
          ? 'text-sm font-semibold'
          : 'border-t pt-4 text-sm font-semibold'
      }
    >
      {props.children}
    </h3>
  )
}

export function ModelAvailabilitySettingsDialog(props: {
  overview: AvailabilityOverview
  initialRuleProviderId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  // The page keeps refreshing behind the dialog. The draft stays tied to what it was opened from, so a change made by
  // someone else meanwhile is refused as a conflict instead of being overwritten.
  const [opened] = useState(props.overview)
  const { settings, providers } = opened
  const [autoProbe, setAutoProbe] = useState(settings.autoProbeEnabled)
  const [interval, setInterval] = useState(String(settings.intervalHours))
  const [threshold, setThreshold] = useState(String(settings.threshold))
  const [keywords, setKeywords] = useState(settings.listingKeywords)
  const [retention, setRetention] = useState(
    String(settings.listingRetentionDays)
  )
  const [drafts, setDrafts] = useState<Record<string, ProviderDraft>>(() =>
    Object.fromEntries(
      providers.map((provider) => [
        provider.providerId,
        {
          source: provider.source,
          rule: provider.rule,
          confirmUntested: false,
          untested: provider.untested,
        },
      ])
    )
  )
  const initialCustom = providers.find(
    (provider) =>
      provider.providerId === props.initialRuleProviderId &&
      provider.source === 'CUSTOM'
  )
  const [ruleFor, setRuleFor] = useState<string | null>(
    initialCustom?.providerId ?? null
  )
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const ruleMissing = Object.values(drafts).some(
    (draft) => draft.source === 'CUSTOM' && !draft.rule
  )
  const intervalValid = wholeNumber(interval, 24)
  const thresholdValid = wholeNumber(threshold, 10)
  const retentionValid = wholeNumber(retention, 90)
  const keywordsValid =
    keywords.length <= KEYWORD_LIMIT &&
    keywords.every((keyword) => keyword.length <= KEYWORD_LENGTH)

  const isDirty =
    autoProbe !== settings.autoProbeEnabled ||
    interval !== String(settings.intervalHours) ||
    threshold !== String(settings.threshold) ||
    retention !== String(settings.listingRetentionDays) ||
    JSON.stringify(keywords) !== JSON.stringify(settings.listingKeywords) ||
    providers.some((provider) => {
      const draft = drafts[provider.providerId]
      return (
        draft?.source !== provider.source ||
        JSON.stringify(draft?.rule) !== JSON.stringify(provider.rule)
      )
    })

  const save = useMutation({
    mutationFn: () =>
      saveModelAvailabilitySettings({
        expectedVersion: settings.version,
        autoProbeEnabled: autoProbe,
        intervalHours: Number(interval),
        threshold: Number(threshold),
        listingKeywords: keywords,
        listingRetentionDays: Number(retention),
        providers: Object.fromEntries(
          Object.entries(drafts).map(([providerId, draft]) => [
            providerId,
            {
              source: draft.source,
              rule: draft.source === 'CUSTOM' ? draft.rule : null,
              confirmUntested: draft.confirmUntested,
            },
          ])
        ),
      }),
    onSuccess: () => {
      props.onSaved()
      props.onClose()
    },
  })

  const close = () => {
    if (save.isPending) return
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    props.onClose()
  }

  const editing = providers.find((provider) => provider.providerId === ruleFor)
  const editingDraft = ruleFor ? drafts[ruleFor] : undefined
  if (editing && ruleFor && editingDraft) {
    return (
      <ModelAvailabilityRuleDialog
        provider={editing}
        rule={editingDraft.rule}
        intervalHours={Number(interval) || settings.intervalHours}
        onCancel={() => setRuleFor(null)}
        onApply={(rule, untested) => {
          setDrafts((current) => ({
            ...current,
            [ruleFor]: {
              source: 'CUSTOM',
              rule,
              confirmUntested: untested,
              untested,
            },
          }))
          setRuleFor(null)
        }}
      />
    )
  }

  const leaveForNotifications = () => {
    if (!isDirty) return true
    setConfirmDiscard(true)
    return false
  }
  const hours = Number(interval) || settings.intervalHours
  const times = Number(threshold) || settings.threshold

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close()
      }}
    >
      <DialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Model listing monitor settings')}</DialogTitle>
        </DialogHeader>
        <div className='max-h-[60vh] space-y-4 overflow-y-auto pe-1'>
          <GroupTitle first>{t('Probing')}</GroupTitle>
          <div className='flex items-start gap-3'>
            <Switch
              id='availability-auto-probe'
              checked={autoProbe}
              onCheckedChange={setAutoProbe}
            />
            <div>
              <Label htmlFor='availability-auto-probe'>
                {t('Automatic probing')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'When off, the system does not probe on a schedule. Probe now still works.'
                )}
              </p>
            </div>
          </div>
          <WholeNumberField
            id='availability-interval'
            label={t('Probe every how many hours')}
            help={t('A whole number from 1 to 24.')}
            value={interval}
            valid={intervalValid}
            onChange={setInterval}
          />
          <div className='overflow-x-auto rounded-lg border'>
            <Table className='min-w-[560px]'>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('API provider')}</TableHead>
                  <TableHead>{t('List source')}</TableHead>
                  <TableHead>{t('Custom rule')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((provider) => {
                  const draft = drafts[provider.providerId]
                  if (!draft) return null
                  return (
                    <TableRow key={provider.providerId}>
                      <TableCell>
                        {provider.providerName}
                        {props.overview.coverage.unboundProviders.includes(
                          provider.providerName
                        ) ? (
                          <p className='text-muted-foreground text-xs'>
                            {t('No API Key group bound')}
                          </p>
                        ) : null}
                        {provider.pause ? (
                          <p className='text-destructive text-xs'>
                            {t('Paused. Test again, then save to resume.')}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <NativeSelect
                          aria-label={t('List source')}
                          value={draft.source}
                          onChange={(event) => {
                            const source = event.target.value as ListSource
                            setDrafts((current) => ({
                              ...current,
                              [provider.providerId]: { ...draft, source },
                            }))
                            if (source === 'CUSTOM' && !draft.rule) {
                              setRuleFor(provider.providerId)
                            }
                          }}
                        >
                          {(Object.keys(SOURCE_LABELS) as ListSource[]).map(
                            (source) => (
                              <NativeSelectOption key={source} value={source}>
                                {t(SOURCE_LABELS[source])}
                              </NativeSelectOption>
                            )
                          )}
                        </NativeSelect>
                      </TableCell>
                      <TableCell>
                        {draft.source === 'CUSTOM' ? (
                          <div className='space-y-1'>
                            <p className='text-muted-foreground text-sm'>
                              {!draft.rule && t('Not set up')}
                              {draft.rule?.type === 'LIST' &&
                                t('Read a model list')}
                              {draft.rule?.type === 'REQUEST' &&
                                t('Try each model')}
                              {draft.untested ? ` · ${t('Not tested')}` : ''}
                            </p>
                            <CanvasRowAction
                              onClick={() => setRuleFor(provider.providerId)}
                            >
                              {t('Edit rule')}
                            </CanvasRowAction>
                          </div>
                        ) : (
                          <span className='text-muted-foreground text-sm'>
                            -
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <GroupTitle>{t('Delisted models')}</GroupTitle>
          <WholeNumberField
            id='availability-threshold'
            label={t('Times in a row before an alert')}
            help={t(
              'A whole number from 1 to 10. It applies to missing models and failed probes.'
            )}
            value={threshold}
            valid={thresholdValid}
            onChange={setThreshold}
          />
          {autoProbe ? (
            <p className='text-muted-foreground text-sm'>
              {t(
                'While probes keep succeeding, an alert appears at most about {{hours}} hours after a model is removed.',
                { hours: hours * times }
              )}
            </p>
          ) : null}
          <NotificationSendTo
            eventId='availability.missing'
            label={t('Alerts go to')}
            onBeforeLeave={leaveForNotifications}
          />

          <GroupTitle>{t('Newly listed models')}</GroupTitle>
          <div className='space-y-1'>
            <Label htmlFor='listing-keywords'>{t('Keywords')}</Label>
            <TagInput
              inputId='listing-keywords'
              aria-describedby='listing-keywords-help'
              aria-invalid={!keywordsValid}
              placeholder={t('Type a keyword and press Enter')}
              value={keywords}
              onChange={(next) => setKeywords(normalKeywords(next))}
            />
            <p
              id='listing-keywords-help'
              className={
                keywordsValid
                  ? 'text-muted-foreground text-sm'
                  : 'text-destructive text-sm'
              }
            >
              {t(
                'Alerts when a model ID contains any keyword, ignoring case. No keywords, no alerts. Up to 50, each up to 64 characters.'
              )}
            </p>
          </div>
          <WholeNumberField
            id='listing-retention'
            label={t('Keep in the list for how many days')}
            help={t(
              'A whole number from 1 to 90, counted from when it was found.'
            )}
            value={retention}
            valid={retentionValid}
            onChange={setRetention}
          />
          <NotificationSendTo
            eventId='availability.listed'
            label={t('Alerts go to')}
            onBeforeLeave={leaveForNotifications}
          />
        </div>
        {save.isError ? (
          <p role='alert' className='text-destructive text-sm'>
            {t(
              modelAvailabilityErrorKey(save.error) ??
                'Saving failed. Try again.'
            )}
          </p>
        ) : null}
        <DialogFooter className='items-center'>
          {confirmDiscard ? (
            <>
              <span className='text-muted-foreground me-auto text-sm'>
                {t('Discard the unsaved changes?')}
              </span>
              <Button
                variant='outline'
                onClick={() => setConfirmDiscard(false)}
              >
                {t('Keep editing')}
              </Button>
              <Button variant='destructive' onClick={props.onClose}>
                {t('Discard changes')}
              </Button>
            </>
          ) : (
            <>
              {isDirty ? (
                <span className='text-muted-foreground me-auto text-sm'>
                  {t('Changes take effect after you click Save.')}
                </span>
              ) : null}
              <Button variant='outline' onClick={close}>
                {t('Cancel')}
              </Button>
              <Button
                disabled={
                  !intervalValid ||
                  !thresholdValid ||
                  !retentionValid ||
                  !keywordsValid ||
                  ruleMissing ||
                  save.isPending
                }
                onClick={() => save.mutate()}
              >
                {save.isPending ? t('Saving...') : t('Save')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
