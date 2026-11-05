/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toIntlLocale } from '@/i18n/languages'

import { tierIssueKey } from '../lib/input-surcharge'
import type {
  CanvasInputSurchargeSetting,
  CanvasModelPricingModel,
  CanvasReferenceVideoTier,
} from '../types'

// INPUT-ASSET-BILLING-001: how reference materials are charged, chosen beside the billing unit and published with the
// prices. Reference videos by the generated quality or by their own short-edge tier; reference images per image beyond a
// free count. The tiers start from the model's qualities and can be edited here.

type VideoMode = 'NONE' | 'OUTPUT_QUALITY' | 'INPUT_TIER'
const VIDEO_MODE_KEYS: Record<VideoMode, string> = {
  NONE: 'Not charged',
  OUTPUT_QUALITY: 'By generated quality',
  INPUT_TIER: "By the reference video's quality",
}
type ImageMode = 'NONE' | 'PER_IMAGE'
const IMAGE_MODE_KEYS: Record<ImageMode, string> = {
  NONE: 'Not charged',
  PER_IMAGE: 'Per image',
}

export function InputSurchargeControls(props: {
  availability:
    | NonNullable<CanvasModelPricingModel['inputSurcharge']>['availability']
    | undefined
  value: CanvasInputSurchargeSetting | null
  onChange: (next: CanvasInputSurchargeSetting | null) => void
}) {
  const { t } = useTranslation()
  const [editingTiers, setEditingTiers] = useState(false)
  const availability = props.availability
  if (!availability || (!availability.video && !availability.image)) return null
  const value = props.value ?? {}
  const videoMode: VideoMode = value.video?.basis ?? 'NONE'
  const imageMode: ImageMode = value.image ? 'PER_IMAGE' : 'NONE'
  const change = (next: CanvasInputSurchargeSetting) =>
    props.onChange(next.video || next.image ? next : null)
  const changeVideo = (mode: VideoMode) => {
    const { video: _video, ...rest } = value
    if (mode === 'NONE') return change(rest)
    if (mode === 'OUTPUT_QUALITY') {
      return change({ ...rest, video: { basis: 'OUTPUT_QUALITY' } })
    }
    change({
      ...rest,
      video: {
        basis: 'INPUT_TIER',
        tiers: availability.defaultReferenceVideoTiers,
      },
    })
  }
  const changeImage = (
    mode: ImageMode,
    freeCount = value.image?.freeCount ?? 1
  ) => {
    const { image: _image, ...rest } = value
    change(mode === 'NONE' ? rest : { ...rest, image: { freeCount } })
  }
  const tiers = value.video?.basis === 'INPUT_TIER' ? value.video.tiers : null
  const changeTiers = (next: CanvasReferenceVideoTier[]) =>
    change({ ...value, video: { basis: 'INPUT_TIER', tiers: next } })
  return (
    <>
      {availability.video ? (
        <span className='inline-flex items-center gap-2'>
          <Label
            htmlFor='model-pricing-reference-video'
            className='text-foreground'
          >
            {t('Reference video')}
          </Label>
          <Select
            value={videoMode}
            onValueChange={(next) => changeVideo(next as VideoMode)}
          >
            <SelectTrigger
              id='model-pricing-reference-video'
              className='h-8 w-48'
            >
              <SelectValue>{t(VIDEO_MODE_KEYS[videoMode])}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(VIDEO_MODE_KEYS) as VideoMode[])
                .filter(
                  (mode) =>
                    mode !== 'INPUT_TIER' ||
                    availability.defaultReferenceVideoTiers.length > 0 ||
                    tiers
                )
                .map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(VIDEO_MODE_KEYS[mode])}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {tiers ? (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0'
              aria-expanded={editingTiers}
              onClick={() => setEditingTiers((current) => !current)}
            >
              {t('Edit tiers')}
            </Button>
          ) : null}
        </span>
      ) : null}
      {availability.image ? (
        <span className='inline-flex items-center gap-2'>
          <Label
            htmlFor='model-pricing-reference-image'
            className='text-foreground'
          >
            {t('Reference images')}
          </Label>
          <Select
            value={imageMode}
            onValueChange={(next) => changeImage(next as ImageMode)}
          >
            <SelectTrigger
              id='model-pricing-reference-image'
              className='h-8 w-32'
            >
              <SelectValue>{t(IMAGE_MODE_KEYS[imageMode])}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(IMAGE_MODE_KEYS) as ImageMode[]).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(IMAGE_MODE_KEYS[mode])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {value.image ? (
            <>
              <Label
                htmlFor='model-pricing-free-images'
                className='text-foreground'
              >
                {t('Free images')}
              </Label>
              <Input
                id='model-pricing-free-images'
                className='h-8 w-20 tabular-nums'
                type='number'
                min={0}
                max={100}
                inputMode='numeric'
                value={value.image.freeCount}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isSafeInteger(next) && next >= 0 && next <= 100) {
                    changeImage('PER_IMAGE', next)
                  }
                }}
              />
            </>
          ) : null}
        </span>
      ) : null}
      {tiers && editingTiers ? (
        <ReferenceVideoTierEditor
          tiers={tiers}
          defaults={availability.defaultReferenceVideoTiers}
          onChange={changeTiers}
        />
      ) : null}
    </>
  )
}

function ReferenceVideoTierEditor(props: {
  tiers: CanvasReferenceVideoTier[]
  defaults: CanvasReferenceVideoTier[]
  onChange: (next: CanvasReferenceVideoTier[]) => void
}) {
  const { t, i18n } = useTranslation()
  const issue = tierIssueKey(props.tiers)
  const update = (index: number, change: Partial<CanvasReferenceVideoTier>) =>
    props.onChange(
      props.tiers.map((tier, position) =>
        position === index ? { ...tier, ...change } : tier
      )
    )
  return (
    <div className='max-w-xl basis-full space-y-2'>
      <StaticDataTable
        data={props.tiers}
        getRowKey={(_tier, index) => index}
        emptyContent={t('Add at least one tier')}
        columns={[
          {
            id: 'name',
            header: t('Tier name'),
            cell: (tier: CanvasReferenceVideoTier) => {
              const index = props.tiers.indexOf(tier)
              return (
                <Input
                  aria-label={t('Name of tier {{index}}', { index: index + 1 })}
                  aria-invalid={issue ? true : undefined}
                  placeholder={t('Such as {{example}}', { example: '720P' })}
                  value={tier.name}
                  onChange={(event) =>
                    update(index, { name: event.target.value.trim() })
                  }
                />
              )
            },
          },
          {
            id: 'shortEdge',
            header: t('Largest short edge (px)'),
            cell: (tier: CanvasReferenceVideoTier) => {
              const index = props.tiers.indexOf(tier)
              return (
                <Input
                  aria-label={t('Largest short edge of tier {{index}}', {
                    index: index + 1,
                  })}
                  aria-invalid={issue ? true : undefined}
                  className='tabular-nums'
                  type='number'
                  min={1}
                  inputMode='numeric'
                  placeholder={t('Such as {{example}}', { example: '720' })}
                  value={
                    Number.isFinite(tier.maxShortEdgePx) &&
                    tier.maxShortEdgePx > 0
                      ? tier.maxShortEdgePx
                      : ''
                  }
                  onChange={(event) =>
                    update(index, {
                      maxShortEdgePx: Number(event.target.value),
                    })
                  }
                />
              )
            },
          },
          {
            id: 'remove',
            header: <span className='sr-only'>{t('Actions')}</span>,
            cell: (tier: CanvasReferenceVideoTier) => (
              <button
                type='button'
                className='text-muted-foreground text-sm hover:underline'
                onClick={() =>
                  props.onChange(props.tiers.filter((item) => item !== tier))
                }
              >
                {t('Delete')}
              </button>
            ),
          },
        ]}
      />
      <div className='flex flex-wrap items-center gap-3'>
        <button
          type='button'
          className='text-primary text-sm hover:underline'
          onClick={() =>
            props.onChange([...props.tiers, { name: '', maxShortEdgePx: 0 }])
          }
        >
          {t('Add tier')}
        </button>
        <button
          type='button'
          className='text-primary text-sm hover:underline'
          onClick={() => props.onChange(props.defaults)}
        >
          {t('Restore defaults')}
        </button>
      </div>
      {issue ? (
        <p role='alert' className='text-destructive text-xs'>
          {t(issue)}
        </p>
      ) : null}
      <p className='text-muted-foreground text-xs'>
        {t(
          'Defaults follow the model qualities: {{tiers}}. Tiers go from the smallest short edge up; a reference video above the highest tier cannot be submitted. A new tier must be priced before publishing.',
          {
            tiers: new Intl.ListFormat(
              toIntlLocale(i18n.resolvedLanguage || i18n.language),
              { type: 'unit' }
            ).format(
              props.defaults.map(
                (tier) => `${tier.name} ≤ ${tier.maxShortEdgePx}`
              )
            ),
          }
        )}
      </p>
    </div>
  )
}
