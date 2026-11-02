import { describe, expect, it } from 'vitest'

import {
  blankChannelDraft,
  channelIssues,
  movePollTaskId,
  type ChannelDraft,
} from '../catalog-channel-draft'
import {
  assetRequest,
  pollRequest,
  readResponseSample,
  sampleResponse,
} from '../catalog-channel-response'

function videoTask(): ChannelDraft {
  const draft = blankChannelDraft('video.generate')
  draft.submit.path = '/v1/videos'
  draft.poll = {
    method: 'GET',
    path: '/v1/videos/{taskId}',
    taskIdIn: 'path',
    queryName: '',
  }
  draft.taskIdPath = 'data.id'
  draft.statusPath = 'data.status'
  draft.states = {
    pending: 'queued',
    running: 'running',
    succeeded: 'done',
    failed: 'failed',
  }
  draft.outputPaths = 'data.video_url'
  draft.errorPaths = 'error.message'
  return draft
}

describe('answers of a task', () => {
  it('reads only the task ID from the submit answer, from its own path when it has one', () => {
    const draft = videoTask()
    draft.submitTaskId = 'id'
    const submit = sampleResponse(draft, 'submit', 'boom')
    expect(JSON.parse(submit.text)).toEqual({ id: 'task_123' })
    expect(submit.sources).toEqual([
      { what: 'taskId', path: 'id', fromSubmit: true },
    ])
    const done = sampleResponse(draft, 'succeeded', 'boom')
    expect(JSON.parse(done.text)).toEqual({
      data: {
        id: 'task_123',
        status: 'done',
        video_url: 'https://example.com/out.mp4',
      },
    })
    expect(done.sources.map((source) => source.what)).toEqual([
      'taskId',
      'status',
      'result',
    ])
  })

  it('marks paths that read nothing and a status that matches no state value', () => {
    const readings = readResponseSample(
      videoTask(),
      '{"data":{"id":"t1","status":"processing"}}'
    )
    expect(readings.map(({ what, bad }) => [what, bad])).toEqual([
      ['taskId', false],
      ['status', true],
      ['result', true],
      ['error', true],
    ])
    expect(readings[1].state).toBeNull()
    expect(readings[2].tried).toEqual(['data.video_url'])
    expect(() => readResponseSample(videoTask(), '{')).toThrow(SyntaxError)
  })
})

describe('the poll request', () => {
  it('moves the task ID between the path and a query parameter', () => {
    const draft = videoTask()
    const query = movePollTaskId(draft.poll, 'query')
    expect(query).toMatchObject({
      path: '/v1/videos',
      queryName: 'taskId',
      taskIdIn: 'query',
    })
    expect(pollRequest({ ...draft, poll: query })).toMatchObject({
      path: '/v1/videos',
      queryName: 'taskId',
      submitIdPath: 'data.id',
    })
    expect(movePollTaskId(query, 'path')).toMatchObject({
      path: '/v1/videos/{taskId}',
    })
  })

  it('reports a task ID placeholder left in the path of a query parameter', () => {
    const draft = videoTask()
    draft.poll = { ...draft.poll, taskIdIn: 'query', queryName: 'id' }
    expect(pollRequest(draft)).toEqual({
      issue: 'placeholderInPath',
      placeholder: '{taskId}',
    })
    expect(
      channelIssues(draft).find((issue) => issue.path === 'poll.path')?.values
    ).toEqual({
      placeholder: '{taskId}',
    })
  })
})

describe('the upload request', () => {
  it('renders the upload body and the status check of one sample material', () => {
    const draft = videoTask()
    draft.workflow = 'asset-async'
    draft.media.image = 'provider-asset'
    draft.prepareAsset = {
      method: 'POST',
      path: '/v1/assets',
      format: 'application/json',
    }
    draft.pollAsset = { method: 'GET', path: '/v1/assets/{assetId}' }
    draft.asset.image = {
      ...draft.asset.image,
      body: '{"url":{"$ref":"request.mediaPublicUrl"},"type":{"$ref":"request.mediaAssetType"}}',
      remoteIdPaths: 'id',
      readyValues: 'Active',
    }
    const request = assetRequest(draft)
    if (request.issue) throw new Error(request.issue)
    expect(JSON.parse('text' in request.body ? request.body.text : '')).toEqual(
      {
        url: 'https://media.preview.example/inputs/image-reference-1.png',
        type: 'Image',
      }
    )
    expect(request.poll).toMatchObject({
      path: '/v1/assets/remote-image-reference-1.png',
      idPath: 'id',
      readyValues: ['Active'],
    })
    const answer = sampleResponse(draft, 'asset', 'boom')
    expect(JSON.parse(answer.text)).toEqual({
      id: 'remote-image-reference-1.png',
    })
  })
})
