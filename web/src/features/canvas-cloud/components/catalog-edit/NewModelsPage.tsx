/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  CatalogEditDraftModel,
  CatalogModelDefinition,
  CurrentCatalogView,
} from '../../catalog-edit-types'
import { ModelEditor, type EmbeddedModelEditor } from './ModelEditor'

interface ModelSlot {
  id: string
  model: CatalogModelDefinition | null
  credentialGroup: string
}

const blankSlot = (): ModelSlot => ({
  id: crypto.randomUUID(),
  model: null,
  credentialGroup: '',
})

/** One page for adding any number of models; only the model on screen is mounted, the others keep their draft here. */
export function NewModelsPage(props: {
  channelId: string
  catalogOverride?: CurrentCatalogView
  shared?: Pick<EmbeddedModelEditor, 'extraDraft' | 'wizard' | 'onNewChannel'>
  onClose: () => void
  onEditPresentation: (modelKey: string) => void
}) {
  const { t } = useTranslation()
  const [slots, setSlots] = useState<ModelSlot[]>(() => [blankSlot()])
  const [index, setIndex] = useState(0)
  const current = slots[index]
  // The latest draft of the slot on screen, kept without rendering again on each keystroke.
  const latest = useRef<Pick<ModelSlot, 'model' | 'credentialGroup'>>({
    model: current.model,
    credentialGroup: current.credentialGroup,
  })
  const apiKey = useRef('')
  const saved = (list: ModelSlot[]) =>
    list.map((slot, position) =>
      position === index ? { ...slot, ...latest.current } : slot
    )
  const show = (list: ModelSlot[], next: number) => {
    latest.current = {
      model: list[next].model,
      credentialGroup: list[next].credentialGroup,
    }
    setSlots(list)
    setIndex(next)
  }
  const others: CatalogEditDraftModel[] = slots.flatMap((slot, position) =>
    position !== index && slot.model
      ? [
          {
            baseVersion: null,
            definition: slot.model,
            ...(slot.credentialGroup
              ? { credentialGroupVersionId: slot.credentialGroup }
              : {}),
          },
        ]
      : []
  )
  return (
    <ModelEditor
      key={current.id}
      mode={{ kind: 'new', channelId: props.channelId }}
      {...(props.catalogOverride
        ? { catalogOverride: props.catalogOverride }
        : {})}
      onClose={props.onClose}
      onEditPresentation={props.onEditPresentation}
      embedded={{
        extraDraft: props.shared?.extraDraft ?? { providers: [], channels: [] },
        ...props.shared,
        apiKey: apiKey.current,
        onApiKeyChange: (next) => {
          apiKey.current = next
        },
        initialDraft: current.model,
        initialCredentialGroup: current.credentialGroup,
        others,
        onChange: (model, credentialGroup) => {
          latest.current = { model, credentialGroup }
        },
        slots: {
          tabs: slots.map((slot, position) => ({
            id: slot.id,
            name:
              (position === index
                ? latest.current.model?.displayName
                : slot.model?.displayName) ?? '',
          })),
          index,
          onShow: (next) => show(saved(slots), next),
          onAdd: () => {
            const list = saved(slots)
            show([...list, blankSlot()], list.length)
          },
          onCopy: () => {
            const list = saved(slots)
            const source = list[index]
            const copy = source.model
              ? {
                  ...structuredClone(source.model),
                  displayName: t('{{name}} copy', {
                    name: source.model.displayName,
                  }),
                  productKey: '',
                  release: {
                    ...structuredClone(source.model.release),
                    execution: { providerModel: { modelId: '' } },
                  },
                }
              : null
            show(
              [
                ...list,
                {
                  id: crypto.randomUUID(),
                  model: copy,
                  credentialGroup: source.credentialGroup,
                },
              ],
              list.length
            )
          },
          onRemove: () => {
            if (slots.length === 1) {
              latest.current = { model: null, credentialGroup: '' }
              show([blankSlot()], 0)
              return
            }
            const list = saved(slots).filter(
              (_, position) => position !== index
            )
            show(list, Math.max(0, index - 1))
          },
        },
      }}
    />
  )
}
