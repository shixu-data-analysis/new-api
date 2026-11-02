import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import {
  blankChannelDraft,
  buildProfile,
  type ChannelDraft,
} from '../catalog-channel-draft'
import { ResponseCard } from '../components/catalog-edit/ChannelResponsePreview'
import { ChannelResponseSection } from '../components/catalog-edit/ChannelResponseSection'

function videoTask(): ChannelDraft {
  const draft = blankChannelDraft('video.generate')
  draft.poll = {
    method: 'GET',
    path: '/v1/videos/{taskId}',
    taskIdIn: 'path',
    queryName: '',
  }
  draft.taskIdPath = 'data.id'
  draft.statusPath = 'data.status'
  draft.states = {
    pending: '',
    running: 'running',
    succeeded: 'done',
    failed: 'failed',
  }
  return draft
}

let latest: ChannelDraft
function Harness() {
  const [draft, setDraft] = useState(videoTask)
  latest = draft
  return (
    <ChannelResponseSection
      draft={draft}
      set={(next) => setDraft((current) => ({ ...current, ...next }))}
      errorOf={() => undefined}
      pollPlaceholder='/v1/videos/{taskId}'
      defaultPollIntervalMs={20000}
      usageChoices={[]}
      taskPathHelp=''
      statusPathHelp=''
      dottedHelp=''
    />
  )
}

describe('submit response and polling', () => {
  it('keeps one task ID path until the query response has its own', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(
      screen.queryByLabelText('Task ID path in the query response')
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('switch', {
        name: 'The query response has the task ID elsewhere (rare)',
      })
    )
    const poll = screen.getByLabelText('Task ID path in the query response')
    await user.clear(poll)
    await user.type(poll, 'task.id')
    expect(latest).toMatchObject({
      submitTaskId: 'data.id',
      taskIdPath: 'task.id',
    })
    await user.click(
      screen.getByRole('switch', {
        name: 'The query response has the task ID elsewhere (rare)',
      })
    )
    expect(latest).toMatchObject({ submitTaskId: '', taskIdPath: 'data.id' })
  })

  it('moves the placeholder into the query parameter name', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.selectOptions(screen.getByLabelText('Task ID goes in'), 'query')
    expect(screen.getByLabelText('Query parameter')).toHaveValue('taskId')
    expect(latest.poll.path).toBe('/v1/videos')
  })
})

describe('checking pasted responses', () => {
  it('marks a status that matches no state value', async () => {
    const user = userEvent.setup()
    render(
      <ResponseCard
        draft={videoTask()}
        profile={buildProfile(videoTask(), null, 'x')}
      />
    )
    await user.click(
      screen.getByText('Paste a real upstream response to check the paths')
    )
    await user.click(screen.getByLabelText('Upstream response JSON'))
    await user.paste('{"data":{"id":"t1","status":"processing"}}')
    await user.click(screen.getByRole('button', { name: 'Check' }))
    expect(
      screen.getByText(
        'processing → matches no state value, so it stays in progress (from data.status)'
      )
    ).toHaveClass('text-destructive')
  })
})
