/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import './canvas-preview.css'
import { generationPanelRules } from '@pixmiao/model-catalog/display-rules'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { SentFields } from '../../catalog-edit-logic'
import type { CatalogModelDefinition } from '../../catalog-edit-types'
import { CanvasPreviewSegmented } from './CanvasPreviewSegmented'
import { CanvasUpscalePreview } from './CanvasUpscalePreview'

const ratioSize = (ratio: string) => {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio)
  const value = match ? Number(match[1]) / Number(match[2]) : Number.NaN
  if (!Number.isFinite(value) || value <= 0) return { width: 24, height: 16 }
  const [width, height] =
    value >= 1
      ? [Math.min(28, 17 * value), Math.min(28, 17 * value) / value]
      : [Math.min(24, 17 / value) * value, Math.min(24, 17 / value)]
  return { width: Math.round(width), height: Math.round(height) }
}

/**
 * What the canvas generation panel shows, for checking the form while editing. The rules come from the shared package;
 * the appearance is copied by hand from Canvas Web, which cannot be shared across frameworks.
 */
export function CanvasPreview(props: {
  model: CatalogModelDefinition
  sent: SentFields
}) {
  const { t } = useTranslation()
  const { model } = props
  const interaction = model.release.publicInteraction
  const [picks, setPicks] = useState<Record<string, string>>({})
  // A pick can name a resolution the model no longer has: the rules and the display read the same valid one.
  const qualityChoices = (interaction.paramSchema.qualities ?? []) as string[]
  const quality =
    picks.quality !== undefined && qualityChoices.includes(picks.quality)
      ? picks.quality
      : ((interaction.defaultParams.quality as string | undefined) ??
        qualityChoices[0])
  const rules = generationPanelRules({
    capability: model.capability,
    paramSchema: interaction.paramSchema,
    defaultParams: interaction.defaultParams,
    referenceLimits: interaction.referenceLimits,
    quality,
  })
  // An upscale model appears in the video toolbar's upscale panel, not in the generation panel (VIDEO-UPSCALE-001).
  if (rules.videoUpscale) {
    return (
      <aside
        aria-label={t('What the user sees')}
        className='grid min-w-0 gap-2 min-[1181px]:sticky min-[1181px]:top-0'
      >
        <div className='catalog-canvas-title'>{t('What the user sees')}</div>
        <CanvasUpscalePreview model={model} />
      </aside>
    )
  }
  const pick = (
    key: string,
    fallback: unknown,
    allowed?: readonly string[]
  ) => {
    if (
      picks[key] !== undefined &&
      (!allowed || allowed.includes(picks[key]))
    ) {
      return picks[key]
    }
    return fallback === undefined ? '' : String(fallback)
  }
  const set = (key: string) => (value: string) =>
    setPicks((current) => ({ ...current, [key]: value }))
  const video = model.capability === 'video.generate'
  const apiQualityLabels: Record<string, string> = {
    low: t('Low quality'),
    medium: t('Medium quality'),
    high: t('High quality'),
    auto: t('Auto'),
  }
  const modes: Array<[string, string]> = []
  if (rules.videoModes?.textToVideo) modes.push(['text', t('Text to video')])
  if (rules.videoModes?.imageToVideo) modes.push(['image', t('Image to video')])
  if (rules.videoModes?.firstLastFrame) {
    modes.push(['frames', t('First and last frames')])
  }
  if (rules.videoModes?.fullReference) modes.push(['full', t('Full reference')])
  const mode = pick('mode', modes.at(-1)?.[0], modes.map(([value]) => value))
  const limits = interaction.referenceLimits as Record<string, unknown>
  const kinds = [
    limits.supportsImageReference === true
      ? t('images {{min}}-{{max}}', {
          min: Number(limits.minImageReferences) || 0,
          max: limits.maxImageReferences ?? t('no limit'),
        })
      : '',
    limits.supportsVideoReference === true
      ? t('videos 0-{{max}}', {
          max: limits.maxVideoReferences ?? t('no limit'),
        })
      : '',
    limits.supportsAudioReference === true
      ? t('audio 0-{{max}}', {
          max: limits.maxAudioReferences ?? t('no limit'),
        })
      : '',
  ].filter(Boolean)
  const ratio = pick(
    'ratio',
    rules.defaultAspectRatio ?? rules.aspectRatios[0],
    rules.aspectRatios
  )
  const apiQuality = pick(
    'apiQuality',
    rules.defaultApiQuality ?? rules.apiQualities[0],
    rules.apiQualities
  )
  const durations = rules.durations
  const pickedDuration = Number(
    pick('duration', rules.defaultDuration ?? durations[0])
  )
  const [longest = pickedDuration] = durations.slice(-1)
  // Fixed choices show the nearest choice, so a default outside them still lights one; a range clamps to its ends.
  const shownDuration = () => {
    if (!durations.length) return pickedDuration
    if (!rules.durationDiscrete) {
      return Math.min(Math.max(pickedDuration, durations[0]), longest)
    }
    return durations.reduce((best, value) =>
      Math.abs(value - pickedDuration) < Math.abs(best - pickedDuration)
        ? value
        : best
    )
  }
  const duration = shownDuration()
  const batch = pick('batch', rules.defaultBatchSize ?? rules.batchOptions[0])
  const summary = (
    video
      ? [ratio, durations.length ? `${duration}S` : '', `x${batch || 1}`]
      : [
          ratio,
          rules.qualities.length ? quality : '',
          rules.apiQualities.length
            ? (apiQualityLabels[apiQuality] ?? apiQuality)
            : '',
          `x${batch || 1}`,
        ]
  )
    .filter(Boolean)
    .join(' · ')
  const references = pick('references', 'none')
  const backgroundBlocked =
    rules.transparentNeedsSingleAlphaImage && references !== 'alpha'
  const backgroundReason: Record<string, string> = {
    none: t('Add one reference image with transparency first.'),
    jpeg: t('This image has no transparency. Use a PNG with transparency.'),
    two: t('Transparent background supports one reference image only.'),
  }
  const hidden = Object.entries(interaction.defaultParams).filter(
    ([key, value]) =>
      props.sent.modelFields.some((field) => field.key === key) &&
      !rules.modelOptions.some((option) => option.key === key) &&
      value !== undefined
  )
  const ratioGrid = rules.aspectRatios.length ? (
    <section>
      <strong>{t('Aspect ratio')}</strong>
      <div className='aspectRatioGrid'>
        {rules.aspectRatios.map((value) => (
          <button
            key={value}
            type='button'
            className={value === ratio ? 'active' : ''}
            aria-pressed={value === ratio}
            onClick={() => set('ratio')(value)}
          >
            <span className='ratioIcon' style={ratioSize(value)} />
            <span>{value === 'adaptive' ? t('Adaptive') : value}</span>
          </button>
        ))}
      </div>
    </section>
  ) : null
  const durationControl = rules.durationDiscrete ? (
    <CanvasPreviewSegmented
      title={t('Length')}
      options={durations.map((value) => [String(value), `${value}S`])}
      value={String(duration)}
      onPick={set('duration')}
    />
  ) : (
    <section>
      <strong>{t('Length')}</strong>
      <div className='videoDurationControl'>
        <input
          className='catalog-canvas-range'
          aria-label={t('Length')}
          type='range'
          min={durations[0]}
          max={durations.at(-1)}
          step={durations.length > 1 ? durations[1] - durations[0] : 1}
          value={duration}
          onChange={(event) => set('duration')(event.target.value)}
        />
        <span className='videoDurationCurrent'>{duration}S</span>
      </div>
    </section>
  )
  const qualityControl = rules.qualities.length ? (
    <CanvasPreviewSegmented
      title={t('Quality tier')}
      options={rules.qualities.map((value) => [value, value])}
      value={quality}
      onPick={set('quality')}
    />
  ) : null
  return (
    <aside
      aria-label={t('What the user sees')}
      className='grid min-w-0 gap-2 min-[1181px]:sticky min-[1181px]:top-0'
    >
      <div className='catalog-canvas-title'>{t('What the user sees')}</div>
      <div className='catalog-canvas'>
        <div className='catalog-canvas-model'>
          {model.displayName || t('(unnamed model)')}
        </div>
        {modes.length ? (
          <CanvasPreviewSegmented
            title={t('Video mode')}
            options={modes}
            value={mode}
            onPick={set('mode')}
          />
        ) : null}
        {mode === 'full' && kinds.length ? (
          <p className='catalog-canvas-hint'>
            {t(
              'Full reference can use only a prompt; it also accepts {{kinds}}.',
              { kinds: kinds.join(t(', ')) }
            )}
          </p>
        ) : null}
        <div className='toolbarSelectLike'>
          {ratio && ratio !== 'adaptive' ? (
            <span className='ratioIcon' style={ratioSize(ratio)} />
          ) : null}
          <span>{summary}</span>
        </div>
        <div className='generationParamsPanel'>
          {video ? (
            <>
              {ratioGrid}
              {durations.length ? durationControl : null}
              {qualityControl}
            </>
          ) : (
            <>
              {rules.apiQualities.length ? (
                <CanvasPreviewSegmented
                  title={t('Image quality')}
                  options={rules.apiQualities.map((value) => [
                    value,
                    apiQualityLabels[value] ?? value,
                  ])}
                  value={apiQuality}
                  onPick={set('apiQuality')}
                />
              ) : null}
              {qualityControl}
              {ratioGrid}
            </>
          )}
          {rules.modelOptions.map((option) => (
            <CanvasPreviewSegmented
              key={option.key}
              title={option.label}
              options={
                option.type === 'boolean'
                  ? [
                      ['true', t('On')],
                      ['false', t('Off')],
                    ]
                  : option.values.map((value) => [
                      value.value,
                      value.label || value.value,
                    ])
              }
              value={pick(
                `option:${option.key}`,
                rules.optionDefaults[option.key]
              )}
              onPick={set(`option:${option.key}`)}
            />
          ))}
          {rules.supportsAudioGeneration ? (
            <CanvasPreviewSegmented
              title={t('Audio')}
              options={[
                ['true', t('On')],
                ['false', t('Off')],
              ]}
              value={pick('audio', rules.defaultGenerateAudio)}
              onPick={set('audio')}
            />
          ) : null}
          {rules.supportsTransparentBackground ? (
            <>
              {rules.transparentNeedsSingleAlphaImage ? (
                <CanvasPreviewSegmented
                  title={t('Reference images')}
                  options={[
                    ['none', t('None')],
                    ['alpha', t('One transparent PNG')],
                    ['jpeg', t('One JPEG')],
                    ['two', t('Two')],
                  ]}
                  value={references}
                  onPick={set('references')}
                />
              ) : null}
              <section>
                <strong>{t('Background')}</strong>
                <label className='checkboxLine'>
                  <input type='checkbox' disabled={backgroundBlocked} />
                  <span>{t('Transparent background')}</span>
                </label>
                {backgroundBlocked ? (
                  <p className='catalog-canvas-hint'>
                    {backgroundReason[references]}
                  </p>
                ) : null}
              </section>
            </>
          ) : null}
          {rules.batchOptions.length > 1 ? (
            <CanvasPreviewSegmented
              title={t('Number of results')}
              options={rules.batchOptions.map((value) => [
                String(value),
                String(value),
              ])}
              value={batch}
              onPick={set('batch')}
            />
          ) : null}
        </div>
      </div>
      {rules.regionEdit ? (
        <p className='catalog-canvas-note'>
          {t('The image node toolbar offers Region edit under Process.')}
        </p>
      ) : null}
      {hidden.length ? (
        <p className='catalog-canvas-note'>
          {t('Always sent, the user does not see them: {{values}}', {
            values: hidden
              .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
              .join(', '),
          })}
        </p>
      ) : null}
    </aside>
  )
}
