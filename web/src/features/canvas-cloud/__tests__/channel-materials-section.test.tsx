import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { blankChannelDraft, type ChannelDraft } from '../catalog-channel-draft'
import {
  withMeasuredAccepts,
  type MediaMode,
} from '../catalog-channel-materials'
import { ChannelMaterialsSection } from '../components/catalog-edit/ChannelMaterialsSection'

// A video interface that sends the prompt and every image in their own fields.
function videoDraft(): ChannelDraft {
  const draft = blankChannelDraft('video.generate')
  draft.submit.path = '/v1/videos'
  draft.rows = [
    { field: 'model', source: 'upstreamId', transform: '' },
    { field: 'prompt', source: 'prompt', transform: '' },
    { field: 'first_image', source: 'firstFrame', transform: '' },
    { field: 'images', source: 'imagesByRole', transform: '' },
  ]
  return withMeasuredAccepts(draft)
}

function Harness() {
  const [draft, setDraft] = useState(videoDraft)
  const [mode, setMode] = useState<MediaMode>()
  return (
    <ChannelMaterialsSection
      draft={draft}
      body='rows'
      mode={mode}
      onMode={setMode}
      onChange={setDraft}
      errorOf={() => undefined}
    />
  )
}

describe('prompt and materials of a video form', () => {
  it('shows the list field and the prompt send content after switching to one list', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByLabelText('Prompt goes in')).toHaveValue('prompt')
    await user.selectOptions(screen.getByLabelText('Send style'), 'list')
    expect(screen.getByLabelText('List field name')).toHaveValue('content')
    expect(screen.getByLabelText('Send content of the prompt')).toHaveValue(
      '{"type":"text","text":{{prompt}}}'
    )
    expect(screen.queryByLabelText('Prompt goes in')).not.toBeInTheDocument()
  })

  it('marks the first-frame mode as not supported when its frame is no longer received', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('tab', { name: 'First frame' }))
    expect(screen.getByLabelText('First frame goes in')).toHaveValue(
      'first_image'
    )
    await user.click(
      screen.getByRole('switch', { name: 'Receive the first frame' })
    )
    expect(
      screen.getByRole('tab', { name: 'First frame · not supported' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('switch', { name: 'Receive the first frame' })
    ).toHaveAttribute('aria-checked', 'false')
  })
})
