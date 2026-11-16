/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { JsonValueField } from '../catalog-edit/TextModelFields'

const field = (value: unknown, onValid = vi.fn(), onIssue = vi.fn()) => (
  <JsonValueField
    label='Input tiers'
    rows={2}
    value={value}
    error={undefined}
    was={undefined}
    issueOf={(text) =>
      text.trim() && !text.trim().startsWith('[') ? 'bad' : ''
    }
    onValid={onValid}
    onIssue={onIssue}
  />
)

describe('JSON value field', () => {
  it('keeps what is typed, and takes a draft replaced from outside with its issue cleared', () => {
    const onValid = vi.fn()
    const onIssue = vi.fn()
    const view = render(field([272000], onValid, onIssue))
    const box = screen.getByRole('textbox', { name: 'Input tiers' })
    expect(box).toHaveValue('[\n  272000\n]')
    fireEvent.change(box, { target: { value: '27' } })
    expect(onIssue).toHaveBeenLastCalledWith('bad')
    expect(screen.getByText('bad')).toBeInTheDocument()
    // The draft did not change while the box held an issue, so the box keeps what was typed.
    view.rerender(field([272000], onValid, onIssue))
    expect(box).toHaveValue('27')
    // Filled from JSON: the box shows the new draft and its issue is gone.
    view.rerender(field([128000, 272000], onValid, onIssue))
    expect(box).toHaveValue('[\n  128000,\n  272000\n]')
    expect(onIssue).toHaveBeenLastCalledWith(undefined)
    expect(screen.queryByText('bad')).not.toBeInTheDocument()
    // Valid typing sets the draft, and the draft coming back does not reset the box.
    fireEvent.change(box, { target: { value: '[100000]' } })
    expect(onValid).toHaveBeenLastCalledWith([100000])
    view.rerender(field([100000], onValid, onIssue))
    expect(box).toHaveValue('[100000]')
  })
})
