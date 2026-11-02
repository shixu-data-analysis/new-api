/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  draftBinding,
  type GroupChoice,
  type NewGroupDraft,
} from '../../catalog-credential-groups'
import type {
  CatalogEditDraftModel,
  CatalogModelDefinition,
  CurrentCatalogView,
} from '../../catalog-edit-types'
import { ModelEditor, type EmbeddedModelEditor } from './ModelEditor'

interface ModelSlot {
  id: string
  model: CatalogModelDefinition | null
  credentialGroup: GroupChoice
  /** Fields its form would mark, counted when it was last on screen. */
  pending: number
}

const blankSlot = (): ModelSlot => ({
  id: crypto.randomUUID(),
  model: null,
  credentialGroup: '',
  pending: 0,
})

/** One page for adding any number of models; only the model on screen is mounted, the others keep their draft here. */
export function NewModelsPage(props: {
  channelId: string
  catalogOverride?: CurrentCatalogView
  shared?: Pick<EmbeddedModelEditor, 'extraDraft' | 'wizard' | 'onNewChannel'>
  /** Models pasted with a new Channel configuration: one tab each. */
  initialModels?: CatalogModelDefinition[]
  onClose: () => void
  onEditPresentation: (modelKey: string) => void
}) {
  const { t } = useTranslation()
  const [slots, setSlots] = useState<ModelSlot[]>(() =>
    props.initialModels?.length
      ? props.initialModels.map((model) => ({ ...blankSlot(), model }))
      : [blankSlot()]
  )
  const [index, setIndex] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const current = slots[index]
  // The latest draft of the slot on screen, kept without rendering again on each keystroke.
  const latest = useRef<
    Pick<ModelSlot, 'model' | 'credentialGroup' | 'pending'>
  >({
    model: current.model,
    credentialGroup: current.credentialGroup,
    pending: current.pending,
  })
  // One new API Key group per page: its name and key are typed once and every model can bind it.
  const newGroup = useRef<NewGroupDraft>({ name: '', apiKey: '' })
  const saved = (list: ModelSlot[]) =>
    list.map((slot, position) =>
      position === index ? { ...slot, ...latest.current } : slot
    )
  const show = (list: ModelSlot[], next: number, withErrors = false) => {
    latest.current = {
      model: list[next].model,
      credentialGroup: list[next].credentialGroup,
      pending: list[next].pending,
    }
    setShowErrors(withErrors)
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
              ? { credentialGroup: draftBinding(slot.credentialGroup) }
              : {}),
          },
        ]
      : []
  )
  const pendingAt = slots.findIndex(
    (slot, position) =>
      position !== index && slot.model !== null && slot.pending > 0
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
        newGroup: newGroup.current,
        onNewGroupChange: (next) => {
          newGroup.current = next
        },
        initialDraft: current.model,
        initialCredentialGroup: current.credentialGroup,
        showErrors,
        others,
        onChange: (model, credentialGroup, pending) => {
          latest.current = { model, credentialGroup, pending }
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
          pendingAt: pendingAt < 0 ? null : pendingAt,
          onShow: (next, withErrors) => show(saved(slots), next, withErrors),
          onAdd: () => {
            const list = saved(slots)
            show([...list, blankSlot()], list.length)
          },
          // Pasted models fill one tab each: an empty tab on screen takes the first, the rest follow.
          onFill: (models) => {
            const list = saved(slots)
            const filled = models.map((model) => ({ ...blankSlot(), model }))
            if (list[index].model === null) {
              show(
                [...list.slice(0, index), ...filled, ...list.slice(index + 1)],
                index
              )
              return
            }
            show([...list, ...filled], list.length)
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
                  pending: source.pending,
                },
              ],
              list.length
            )
          },
          onRemove: () => {
            if (slots.length === 1) {
              latest.current = { model: null, credentialGroup: '', pending: 0 }
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
