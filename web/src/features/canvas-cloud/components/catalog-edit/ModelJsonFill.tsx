/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import type {
  CatalogModelDefinition,
  CurrentCatalogView,
} from '../../catalog-edit-types'
import {
  modelJsonExample,
  type JsonIssue,
  type ModelJsonPlace,
} from '../../catalog-json-fill'
import { JsonFillDialog } from './JsonFillDialog'

/** Fills one model, a group of them, or changes an edited one, from models.json items. */
export function ModelJsonFill(props: {
  catalog: CurrentCatalogView
  place: ModelJsonPlace
  /** A page adding models takes a group as [ … ], one tab each. */
  several: boolean
  editing: boolean
  current: CatalogModelDefinition
  fill: (parsed: unknown) => JsonIssue | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { place, editing, several } = props
  const sources = props.catalog.bundle.models.filter(
    (model) => !place.channelId || model.release.channelId === place.channelId
  )
  let summary = t(
    'Paste one model of models.json in a Bundle. Its Channel configuration must exist.'
  )
  if (several) {
    summary = t(
      'Paste one model of models.json in a Bundle, or a group as [ … ]. Its Channel configuration must exist.'
    )
  }
  if (editing) {
    summary = t(
      'Change the definition of this model; the product key, Channel configuration and generation type cannot change.'
    )
  }
  const rows: Array<[string, string, string]> = [
    [
      'productKey',
      t('Product key, "provider code.type.upstream model ID"'),
      editing ? t('Cannot change') : t('Can be left out; made by the rule'),
    ],
    [
      'capability',
      t('Generation type'),
      t('Required, the same as the Channel configuration'),
    ],
    [
      'release.channelId',
      t('The Channel configuration it belongs to'),
      place.channelId
        ? t('Required, only {{id}}', { id: place.channelId })
        : t('Required; the Channel configuration must exist'),
    ],
    ['release.execution.providerModel', t('Upstream model ID'), t('Required')],
    [
      'release.publicInteraction',
      t('Parameters, defaults and reference limits'),
      t('Required'),
    ],
  ]
  return (
    <JsonFillDialog
      title={
        editing ? t('Edit this model with JSON') : t('Fill models from JSON')
      }
      summary={summary}
      heads={[t('Key'), t('What it holds'), t('Required')]}
      rows={[
        ...rows.map(([key, ...cells]) => ({
          key,
          cells: [
            <code key='key' className='font-mono'>
              {key}
            </code>,
            ...cells,
          ],
        })),
        {
          key: 'others',
          cells: [
            t('displayName, description and the other keys'),
            t('As in models.json'),
            t('As needed'),
          ],
        },
      ]}
      notes={[
        t(
          'Write the content as an item of models.json in a Bundle: change an example below, or take an existing model from an exported Bundle.'
        ),
        ...(several
          ? [t('Adding several at once, each model gets a tab.')]
          : []),
        t(
          'Prices, customer display, API Key and categories are not in the JSON; set them after publishing as usual.'
        ),
      ]}
      placeholder={`{
  "productKey": "acme.video.wan-2.5",      ← ${t('can be left out when adding')}
  "displayName": "Acme Wan 2.5",
  "capability": "video.generate",
  "sourceKind": "relay",
  "release": {
    "channelId": "acme.wan-video",          ← ${t('the Channel configuration must exist')}
    "execution": { "providerModel": { "modelId": "wan-2.5" } },
    "publicInteraction": { "paramSchema": { … }, "defaultParams": { … }, "referenceLimits": { … } }
  }
}`}
      // Editing starts from the current definition, so only what changes needs typing.
      {...(editing
        ? { initialText: JSON.stringify(props.current, null, 2) }
        : {})}
      {...(editing || !sources.length
        ? {}
        : {
            example: {
              label: t('Make an example from a model'),
              options: sources.map((model) => ({
                value: model.productKey,
                label: `${model.displayName} (${model.productKey})`,
              })),
              make: (key: string) => modelJsonExample(props.catalog, key),
            },
          })}
      confirmFor={(parsed) =>
        Array.isArray(parsed) && parsed.length > 1
          ? t('Fill in {{count}} models', { count: parsed.length })
          : t('Fill in')
      }
      fill={props.fill}
      onClose={props.onClose}
    />
  )
}
