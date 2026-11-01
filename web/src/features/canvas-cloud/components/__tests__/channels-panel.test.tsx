import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initialListState } from '../../model-management-navigation-state'
import { ChannelsPanel } from '../catalog-edit/ChannelsPanel'

const channel = (id: string, providerId: string) => ({ id, providerId, adapterProfile: { id, version: '1' }, internalOnly: true })
const profile = (id: string, kind: string, workflow: string) => ({ path: `profiles/${id}.json`, profile: { id, version: '1', kind, workflow, api: `${id}@1` } })
const model = (productKey: string, channelId: string) => ({ productKey, release: { channelId } })
const catalog = {
  bundle: {
    providers: [{ id: 'acme', internalName: 'Acme' }, { id: 'beta', internalName: 'Beta' }],
    channels: [channel('acme.image', 'acme'), channel('acme.video', 'acme'), channel('beta.chat', 'beta')],
    adapterProfiles: [profile('acme.image', 'image.generate', 'sync'), profile('acme.video', 'video.generate', 'async'), profile('beta.chat', 'chat.generate', 'sync')],
    openapiContracts: [],
    models: [model('a', 'acme.image'), model('b', 'acme.image')],
  },
  sources: { providers: {}, channels: {}, models: {} },
  versions: { providers: {}, channels: {}, models: {} },
}
const navigation = vi.hoisted(() => ({
  updateListState: vi.fn(),
  listState: {
    pagination: { pageIndex: 3, pageSize: 50 },
    disabledPagination: { pageIndex: 1, pageSize: 20 },
    sorting: [{ id: 'name', desc: true }],
    columnVisibility: { channel: false },
  },
}))
const retire = vi.hoisted(() => vi.fn((_input: unknown) => Promise.resolve({})))

vi.mock('../../catalog-edit-api', async (original) => ({
  ...(await original<typeof import('../../catalog-edit-api')>()),
  getCurrentCatalog: () => Promise.resolve(catalog),
  retireCatalogChannel: retire,
}))
vi.mock('../../model-management-navigation-hooks', () => ({ useOptionalModelManagementNavigation: () => navigation }))

function open(props: Parameters<typeof ChannelsPanel>[0] = {}) {
  render(<QueryClientProvider client={new QueryClient()}><ChannelsPanel {...props} /></QueryClientProvider>)
  return screen.findByText('beta.chat')
}
const shown = () => ['acme.image', 'acme.video', 'beta.chat'].filter((id) => screen.queryByText(id))

describe('Channels list', () => {
  beforeEach(() => {
    navigation.updateListState.mockClear()
    vi.spyOn(window.HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => undefined)
  })

  it('filters by API provider, generation type and call method together', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Acme' }))
    expect(shown()).toEqual(['acme.image', 'acme.video'])
    fireEvent.click(screen.getByRole('button', { name: 'Video generation' }))
    expect(shown()).toEqual(['acme.video'])
    fireEvent.click(screen.getByRole('button', { name: 'All types' }))
    fireEvent.click(screen.getByRole('button', { name: 'All API providers' }))
    expect(shown()).toHaveLength(3)
  })

  it('offers only the values that exist', async () => {
    await open()
    expect(screen.queryByRole('button', { name: 'Upload materials, then asynchronous' })).toBeNull()
    expect(screen.getByRole('button', { name: 'All call methods' })).toBeInTheDocument()
  })

  it('opens the model list filtered by the Channel from its model count, and has no link for none', async () => {
    const onViewModels = vi.fn()
    await open({ onViewModels })
    fireEvent.click(screen.getByRole('button', { name: 'View the 2 models of acme.image' }))
    expect(navigation.updateListState).toHaveBeenCalledWith({
      ...initialListState,
      channel: 'acme.image',
      showDisabled: true,
      pagination: { pageIndex: 0, pageSize: 50 },
      disabledPagination: { pageIndex: 0, pageSize: 20 },
      sorting: [{ id: 'name', desc: true }],
      columnVisibility: { channel: false },
    })
    expect(onViewModels).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /of beta\.chat/ })).toBeNull()
  })

  it('keeps and brings into view a Channel opened from a model, whatever the filters', async () => {
    await open({ focusChannel: 'beta.chat' })
    fireEvent.click(screen.getByRole('button', { name: 'Acme' }))
    expect(shown()).toEqual(['acme.image', 'acme.video', 'beta.chat'])
    expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('retires a Channel with no model after the code is typed, and sends what Cloud checks', async () => {
    const { ChannelRetireDialog } = await import('../catalog-edit/ChannelRetireDialog')
    render(<QueryClientProvider client={new QueryClient()}><ChannelRetireDialog channelCode='beta.chat' providerName='Beta' version={3} onClose={vi.fn()} /></QueryClientProvider>)
    const submit = screen.getByRole('button', { name: 'Retire the Channel configuration' })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Reason for retirement'), { target: { value: 'OTHER' } })
    fireEvent.change(screen.getByLabelText('Type the complete code beta.chat to confirm'), { target: { value: 'beta.cha' } })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type the complete code beta.chat to confirm'), { target: { value: 'beta.chat' } })
    fireEvent.click(submit)
    await vi.waitFor(() => expect(retire).toHaveBeenCalledOnce())
    expect(retire.mock.calls[0]![0]).toMatchObject({ channelCode: 'beta.chat', expectedVersion: 3, reasonCode: 'OTHER', confirmedChannelCode: 'beta.chat' })
  })
})
