/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import './canvas-preview.css'
import './canvas-upscale-preview.css'
import { videoUpscalePanelRules } from '@pixmiao/model-catalog/display-rules'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { CatalogModelDefinition } from '../../catalog-edit-types'
import { CanvasPreviewSegmented } from './CanvasPreviewSegmented'

// Sources the preview can stand in for, portrait like most canvas videos, 10 seconds long.
const UPSCALE_SOURCES: Array<[string, { width: number; height: number }]> = [
  ['480P', { width: 480, height: 854 }],
  ['720P', { width: 720, height: 1280 }],
  ['1080P', { width: 1080, height: 1920 }],
]

/**
 * The upscale panel of the canvas video toolbar (Canvas Web VideoUpscaleControl), where an upscale model appears instead
 * of the generation panel. Its tiers and sizes are the shared upscale rules, as on the canvas.
 */
export function CanvasUpscalePreview(props: { model: CatalogModelDefinition }) {
  const { t } = useTranslation()
  const [sourceName, setSourceName] = useState('720P')
  const [picked, setPicked] = useState('')
  const source =
    UPSCALE_SOURCES.find(([name]) => name === sourceName)?.[1] ??
    UPSCALE_SOURCES[1][1]
  const { tiers } = videoUpscalePanelRules(
    props.model.release.publicInteraction,
    { ...source, durationMs: 10_000 }
  )
  const offered = tiers.filter((tier) => !tier.block)
  const tier =
    offered.find((entry) => entry.quality === picked) ?? offered[0] ?? null
  const highest = [...tiers].reverse().find((entry) => entry.block)
  const sameSize = offered.find((entry) => entry.sameSize)
  return (
    <>
      <div className='catalog-canvas catalog-canvas-upscale'>
        <CanvasPreviewSegmented
          title={t('Source video (preview)')}
          options={UPSCALE_SOURCES.map(([name]) => [name, name])}
          value={sourceName}
          onPick={setSourceName}
        />
        <div className='catalog-canvas-upscale-header'>
          <strong>{t('Upscale panel')}</strong>
          <span>{t('Length {{length}}', { length: '0:10' })}</span>
        </div>
        <section>
          <strong>{t('Model')}</strong>
          <div className='catalog-canvas-upscale-select'>
            {props.model.displayName || t('(unnamed model)')}
          </div>
        </section>
        <CanvasPreviewSegmented
          title={t('Quality tier')}
          options={tiers.map((entry) => [entry.quality, entry.quality])}
          value={tier?.quality ?? ''}
          onPick={setPicked}
          disabled={tiers
            .filter((entry) => entry.block)
            .map((entry) => entry.quality)}
        />
        {highest ? (
          <p className='catalog-canvas-hint'>
            {highest.block === 'SAME_AS_SOURCE'
              ? t(
                  '{{quality}} and below are not offered: this model only enlarges',
                  { quality: highest.quality }
                )
              : t(
                  '{{quality}} and below are under the source and not offered',
                  {
                    quality: highest.quality,
                  }
                )}
          </p>
        ) : null}
        {sameSize ? (
          <p className='catalog-canvas-hint'>
            {t('{{quality}} rebuilds at the source size without enlarging', {
              quality: sameSize.quality,
            })}
          </p>
        ) : null}
        <div className='catalog-canvas-upscale-row'>
          <span>{t('Expected size')}</span>
          <strong>
            {tier?.outputSize
              ? `${tier.outputSize.width} × ${tier.outputSize.height}`
              : '—'}
          </strong>
        </div>
        <div className='catalog-canvas-upscale-row'>
          <span>{t('Points')}</span>
          <strong>{t('Per second of the source, by the price')}</strong>
        </div>
        <div className='catalog-canvas-upscale-confirm'>
          {t('Start upscale')}
        </div>
      </div>
      <p className='catalog-canvas-note'>
        {t(
          'The video node toolbar offers this model under Upscale; it is not in the generation panel and sends no prompt.'
        )}
      </p>
    </>
  )
}
