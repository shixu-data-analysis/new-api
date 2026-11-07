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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { writePath, type SentFields } from '../../catalog-edit-logic'
import type { CatalogModelDefinition } from '../../catalog-edit-types'
import { ModelParametersSection } from '../catalog-edit/ModelEditorSections'

// CATALOG-DURATION-CHOICES-001: the Length row offers a continuous range or fixed choices.
const sent: SentFields = {
  aspectRatio: [],
  quality: [],
  apiQuality: [],
  durationSeconds: ['seconds'],
  generateAudio: [],
  watermark: [],
  batchSize: [],
  background: [],
  modelFields: [],
}

function videoModel(
  paramSchema: Record<string, unknown>,
  defaultParams: Record<string, unknown>
) {
  return {
    productKey: 'test.video',
    displayName: 'Test video',
    capability: 'video.generate',
    release: {
      channelId: 'test.channel',
      execution: { providerModel: { modelId: 'test-video' } },
      publicInteraction: { paramSchema, defaultParams, referenceLimits: {} },
    },
  } as unknown as CatalogModelDefinition
}

function renderLength(
  initial: CatalogModelDefinition,
  otherModelsDurations: number[] = []
) {
  const latest: { draft: CatalogModelDefinition } = { draft: initial }
  function Harness() {
    const [draft, setDraft] = useState(initial)
    latest.draft = draft
    return (
      <ModelParametersSection
        draft={draft}
        base={null}
        sent={sent}
        catalogValues={(_capability, field) =>
          (field === 'durations'
            ? otherModelsDurations
            : []) as unknown as string[]
        }
        errors={{}}
        set={(keys, value) =>
          setDraft((current) =>
            writePath(
              current,
              ['release', 'publicInteraction', ...keys].join('\u0000'),
              value
            )
          )
        }
        was={() => undefined}
      />
    )
  }
  render(<Harness />)
  return {
    schema: () => latest.draft.release.publicInteraction.paramSchema,
    defaults: () => latest.draft.release.publicInteraction.defaultParams,
  }
}

const choiceButton = (seconds: number) =>
  within(screen.getByRole('group', { name: 'Length' })).getByRole('button', {
    name: `${seconds} s`,
  })

describe('Length row with fixed choices', () => {
  it('turns a range into its values and hides the per-resolution limit when fixed choices are chosen', async () => {
    const view = renderLength(
      videoModel(
        { durationRange: { min: 5, max: 15, step: 5 } },
        { durationSeconds: 5 }
      )
    )
    expect(
      screen.queryAllByLabelText('Limit duration by resolution')
    ).not.toHaveLength(0)

    await userEvent.selectOptions(
      screen.getByLabelText('Value mode'),
      'choices'
    )

    expect(view.schema()).toEqual({ durations: [5, 10, 15] })
    expect(choiceButton(10).getAttribute('aria-pressed')).toBe('true')
    expect(
      screen.queryAllByLabelText('Limit duration by resolution')
    ).toHaveLength(0)
  })

  it('adds a typed length in order and refuses a repeat or a part second', async () => {
    const view = renderLength(
      videoModel({ durations: [5, 10] }, { durationSeconds: 5 })
    )
    const input = screen.getByLabelText('Length to add')
    const add = screen.getByRole('button', { name: 'Add length' })

    await userEvent.type(input, '30')
    await userEvent.click(add)
    expect(view.schema().durations).toEqual([5, 10, 30])

    await userEvent.type(input, '10')
    await userEvent.click(add)
    expect(screen.getByRole('alert').textContent).toBe(
      'This length already exists'
    )

    await userEvent.clear(input)
    await userEvent.type(input, '7.5')
    await userEvent.click(add)
    expect(screen.getByRole('alert').textContent).toBe(
      'Enter a whole number of seconds'
    )
    expect(view.schema().durations).toEqual([5, 10, 30])
  })

  // The catalog holds this model's published version too, so a choice switched off stays on offer, as aspect ratios do.
  it('switches a lit choice off and turns on a length another model uses', async () => {
    const view = renderLength(
      videoModel({ durations: [5, 10] }, { durationSeconds: 10 }),
      [5, 8, 10]
    )
    expect(choiceButton(8).getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(choiceButton(5))
    await userEvent.click(choiceButton(8))

    expect(view.schema().durations).toEqual([8, 10])
    expect(choiceButton(5).getAttribute('aria-pressed')).toBe('false')
  })

  it('offers only the choices as the default', async () => {
    const view = renderLength(
      videoModel({ durations: [5, 10, 15, 30] }, { durationSeconds: 5 })
    )
    const select = screen
      .getAllByLabelText('Default')
      .find(
        (element): element is HTMLSelectElement =>
          element instanceof HTMLSelectElement &&
          [...element.options].some((option) => option.value === '30')
      )
    if (!select) throw new Error('the Length row has no Default select')
    expect(
      [...select.options].map((option) => option.value).filter(Boolean)
    ).toEqual(['5', '10', '15', '30'])

    await userEvent.selectOptions(select, '30')
    expect(view.defaults().durationSeconds).toBe(30)
  })

  it('turns choices back into a range stepping by their even gap, else by one second', async () => {
    const even = renderLength(
      videoModel({ durations: [5, 10, 15] }, { durationSeconds: 5 })
    )
    await userEvent.selectOptions(screen.getByLabelText('Value mode'), 'range')
    expect(even.schema()).toEqual({
      durationRange: { min: 5, max: 15, step: 5 },
    })
  })

  it('steps by one second when the choices are unevenly spaced', async () => {
    const uneven = renderLength(
      videoModel({ durations: [5, 10, 15, 30] }, { durationSeconds: 5 })
    )
    await userEvent.selectOptions(screen.getByLabelText('Value mode'), 'range')
    expect(uneven.schema()).toEqual({
      durationRange: { min: 5, max: 30, step: 1 },
    })
  })
})
