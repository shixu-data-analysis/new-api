/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useQuery } from '@tanstack/react-query'
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import {
  getCanvasClientPresentation,
  publishCanvasClientPresentation,
} from '../api'
import {
  PRESENTATION_CAPABILITIES,
  buildPublication,
  hasPresentationChanges,
  initialDraftState,
  modelsWithoutName,
  presentationChanges,
  presentationDraftReducer,
  type PresentationCapability,
  type PresentationDraftAction,
  type PresentationDraftState,
} from '../lib/client-presentation-draft'
import {
  PRESENTATION_TYPE_COUNT_KEYS,
  PRESENTATION_TYPE_EMPTY_KEYS,
} from '../lib/model-presentation-labels'
import { CanvasLocalizedSelectValue } from './CanvasLocalizedSelectValue'
import { ClientPresentationBatchBar } from './ClientPresentationBatchBar'
import { ClientPresentationLeaveGuard } from './ClientPresentationLeaveGuard'
import { ClientPresentationModelEditor } from './ClientPresentationModelEditor'
import {
  ClientPresentationModelRow,
  type MoveAction,
} from './ClientPresentationModelRow'
import { ClientPresentationPreview } from './ClientPresentationPreview'
import { ModelBadgeManager } from './ModelBadgeManager'
import { PresentationSegmented } from './PresentationSegmented'

const queryKey = ['canvas-cloud', 'admin-client-presentation'] as const

const visibilityFilters = ['ALL', 'VISIBLE', 'HIDDEN'] as const
type VisibilityFilter = (typeof visibilityFilters)[number]
const visibilityLabelKeys: Record<VisibilityFilter, string> = {
  ALL: 'All',
  VISIBLE: 'Visible to customers',
  HIDDEN: 'Hidden from customers',
}

function isVisibilityFilter(value: unknown): value is VisibilityFilter {
  return (visibilityFilters as readonly unknown[]).includes(value)
}

const typeOrderKeys: Record<PresentationCapability, string> = {
  'image.generate': 'Image order',
  'video.generate': 'Video order',
  'chat.generate': 'Chat order',
}

function draftReducer(
  state: PresentationDraftState | null,
  action: PresentationDraftAction
) {
  if (action.type === 'load') return initialDraftState(action.data)
  return state ? presentationDraftReducer(state, action) : state
}

/** "模型管理 › 客户端展示": icons, colors, badges, order, names and descriptions, published together. */
export function ClientPresentationManager(props: {
  initialModelKey?: string
  onOpenModelCategories: () => void
}) {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey,
    queryFn: getCanvasClientPresentation,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
  const [state, dispatch] = useReducer(draftReducer, null)
  const [capability, setCapability] =
    useState<PresentationCapability>('image.generate')
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [visibility, setVisibility] = useState<VisibilityFilter>('ALL')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [conflict, setConflict] = useState(false)
  // Publishing and reloading replace the draft, so edits wait until they finish.
  const [locked, setLockedState] = useState(false)
  const lockedRef = useRef(false)
  const setLocked = (value: boolean) => {
    lockedRef.current = value
    setLockedState(value)
  }
  const editDispatch = useCallback((action: PresentationDraftAction) => {
    if (!lockedRef.current) dispatch(action)
  }, [])
  const attempt = useRef<{ body: string; key: string } | null>(null)
  const dragFrom = useRef<{ modelKey: string; index: number } | null>(null)
  const pendingFocus = useRef<{ modelKey: string; action: MoveAction } | null>(
    null
  )
  const listRef = useRef<HTMLOListElement>(null)
  // Stable row callbacks: rows of unchanged models skip rendering while another model is edited.
  const toggleRow = useCallback((modelKey: string) => {
    setSelected((current) => (current === modelKey ? null : modelKey))
  }, [])
  const checkRow = useCallback((modelKey: string, checked: boolean) => {
    setPicked((current) => {
      const next = new Set(current)
      if (checked) next.add(modelKey)
      else next.delete(modelKey)
      return next
    })
  }, [])
  const moveRow = useCallback(
    (modelKey: string, to: number, action?: MoveAction) => {
      if (action) pendingFocus.current = { modelKey, action }
      editDispatch({
        type: 'moveMany',
        capability,
        modelKeys: [modelKey],
        target: to + 1,
      })
    },
    [capability, editDispatch]
  )
  const dragRow = useCallback((modelKey: string, index: number) => {
    dragFrom.current = { modelKey, index }
  }, [])
  const dropRow = useCallback(
    (index: number) => {
      const from = dragFrom.current
      dragFrom.current = null
      if (from && from.index !== index) moveRow(from.modelKey, index)
    },
    [moveRow]
  )
  // The bulk bar sticks right below the toolbar, whose height changes when it wraps.
  const [toolbarHeight, setToolbarHeight] = useState(0)
  const toolbarRef = useCallback((toolbar: HTMLDivElement | null) => {
    if (!toolbar || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() =>
      setToolbarHeight(toolbar.offsetHeight)
    )
    observer.observe(toolbar)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (state || !query.data) return
    dispatch({ type: 'load', data: query.data })
    const initial = query.data.models.find(
      (model) => model.modelKey === props.initialModelKey
    )
    const first = initial ?? query.data.models[0]
    if (first) {
      setCapability(first.capability)
      setSelected(first.modelKey)
    }
  }, [query.data, state, props.initialModelKey])

  const loaded = Boolean(state)
  useEffect(() => {
    // "编辑展示信息" in the model list opens this tab with that model selected and focused.
    if (!loaded || !props.initialModelKey) return
    const model = state?.draft.models[props.initialModelKey]
    if (!model) return
    setCapability(model.capability)
    setSelected(model.modelKey)
    setSearch('')
    const frame = requestAnimationFrame(() => {
      const row = listRef.current?.querySelector<HTMLElement>(
        `[data-model-key="${CSS.escape(model.modelKey)}"]`
      )
      row?.scrollIntoView({ block: 'nearest' })
      row
        ?.querySelector<HTMLInputElement>(
          'input[id^="client-presentation-name-"]'
        )
        ?.focus()
    })
    return () => cancelAnimationFrame(frame)
    // Runs when the requested model changes, not on every draft edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, props.initialModelKey])

  const changes = useMemo(
    () => (state ? presentationChanges(state) : null),
    [state]
  )
  const dirty = Boolean(changes && hasPresentationChanges(changes))
  const unnamed = state ? modelsWithoutName(state.draft) : []

  useLayoutEffect(() => {
    const focus = pendingFocus.current
    if (!focus) return
    pendingFocus.current = null
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-model-key="${CSS.escape(focus.modelKey)}"]`
    )
    const button =
      row?.querySelector<HTMLButtonElement>(
        `[data-move="${focus.action}"]:not(:disabled)`
      ) ?? row?.querySelector<HTMLButtonElement>('[data-move]:not(:disabled)')
    button?.focus()
  })

  // A failed reload keeps the loaded draft on screen; the error state is only for the first load.
  if (query.isError && !state) return <ErrorState />
  if (!state || !changes) return <LoadingState />

  const draft = state.draft
  const keys = draft.orders[capability]
  const normalizedSearch = search.trim().toLowerCase()
  const searching = Boolean(normalizedSearch)
  // Searching or filtering shows part of the order; moves still apply to the whole order.
  const filtering = searching || visibility !== 'ALL'
  const shown = keys
    .flatMap((modelKey, index) => {
      const model = draft.models[modelKey]
      return model ? [{ model, index }] : []
    })
    .filter(
      ({ model }) =>
        (!searching ||
          model.displayName.toLowerCase().includes(normalizedSearch) ||
          model.modelKey.toLowerCase().includes(normalizedSearch)) &&
        (visibility === 'ALL' ||
          model.customerVisible === (visibility === 'VISIBLE'))
    )

  const separator = t('list separator')
  const changeParts = [
    ...(changes.modelKeys.length
      ? [t('{{count}} models', { count: changes.modelKeys.length })]
      : []),
    ...changes.capabilities.map((item) => t(typeOrderKeys[item])),
    ...(changes.badges ? [t('Badges')] : []),
  ].join(separator)

  let status = {
    text: t('All published'),
    title: t(
      'All settings are published. After the client reloads the model catalog, it looks like the preview on the right.'
    ),
    tone: '',
  }
  if (conflict) {
    status = {
      text: t(
        'Content was changed by someone else; your changes are not published'
      ),
      title: t(
        'Content was changed by someone else; your changes are not published. The draft stays on the page; reloading discards your changes and loads the latest content.'
      ),
      tone: 'bad',
    }
  } else if (unnamed.length) {
    status = {
      text: t('{{count}} models have no name', { count: unnamed.length }),
      title: t('Fill in the names before publishing.'),
      tone: 'bad',
    }
  } else if (dirty) {
    status = {
      text: t('Unpublished: {{changes}}', { changes: changeParts }),
      title: t(
        'Unpublished changes: {{changes}}. The preview on the right shows the draft.',
        { changes: changeParts }
      ),
      tone: 'dirty',
    }
  }

  /** Loads the latest published state; on failure the draft, conflict state and attempt stay as they are. */
  async function reload(): Promise<boolean> {
    const result = await query.refetch()
    if (result.isError || !result.data) {
      toast.error(t('Unable to load the client presentation'))
      return false
    }
    dispatch({ type: 'load', data: result.data })
    setConflict(false)
    setPicked(new Set())
    attempt.current = null
    if (
      selected &&
      !result.data.models.some((model) => model.modelKey === selected)
    ) {
      setSelected(null)
    }
    return true
  }

  async function discard() {
    if (conflict) {
      setLocked(true)
      try {
        if (await reload()) toast.success(t('Latest content loaded'))
      } finally {
        setLocked(false)
      }
      return
    }
    dispatch({ type: 'discard' })
    setPicked(new Set())
    toast.success(t('Unpublished changes discarded'))
  }

  async function publish() {
    if (!state || !changes) return
    const body = buildPublication(state, changes)
    // The summary describes this draft, so it is taken before the page reloads the published state.
    const summary = changeParts
    const serialized = JSON.stringify(body)
    // A retry of the same draft reuses its idempotency key, so the server replays instead of failing.
    if (attempt.current?.body !== serialized) {
      attempt.current = {
        body: serialized,
        key: `web-client-presentation-${crypto.randomUUID()}`,
      }
    }
    setLocked(true)
    try {
      await publishCanvasClientPresentation({
        body,
        idempotencyKey: attempt.current.key,
      })
      if (await reload()) {
        toast.success(
          t(
            'Published: {{changes}}. It takes effect after the client reloads the model catalog.',
            { changes: summary }
          )
        )
      } else {
        toast.error(
          t(
            'Published, but the latest content could not be loaded. Reload the page.'
          )
        )
      }
    } catch (error) {
      const response = (
        error as { response?: { status?: number; data?: { code?: string } } }
      ).response
      if (
        response?.status === 409 &&
        response.data?.code === 'CLIENT_PRESENTATION_REVISION_CONFLICT'
      ) {
        setConflict(true)
        return
      }
      toast.error(
        response?.status === 422
          ? t('The server rejected these settings. Reload and check them.')
          : t('Publication failed. Try again.')
      )
    } finally {
      setLocked(false)
    }
  }

  const availableTypes = PRESENTATION_CAPABILITIES.filter(
    (item) => draft.orders[item].length > 0
  )
  let listContent
  if (!keys.length) {
    listContent = (
      <li className='text-muted-foreground px-4 py-12 text-center'>
        {t(PRESENTATION_TYPE_EMPTY_KEYS[capability])}
      </li>
    )
  } else if (!shown.length) {
    listContent = (
      <li className='text-muted-foreground px-4 py-12 text-center'>
        {t('No models match "{{search}}"', { search: search.trim() })}
      </li>
    )
  } else {
    listContent = shown.map(({ model, index }, visibleIndex) => (
      <ClientPresentationModelRow
        key={model.modelKey}
        model={model}
        index={index}
        total={keys.length}
        previousIndex={shown[visibleIndex - 1]?.index}
        nextIndex={shown[visibleIndex + 1]?.index}
        expanded={selected === model.modelKey}
        checked={picked.has(model.modelKey)}
        unsorted={state.unsorted.has(model.modelKey)}
        badges={draft.badges}
        onToggle={toggleRow}
        onCheckedChange={checkRow}
        onMove={moveRow}
        onDragStart={dragRow}
        onDrop={dropRow}
      >
        {selected === model.modelKey && (
          <ClientPresentationModelEditor
            model={model}
            badges={draft.badges}
            dispatch={editDispatch}
            onOpenModelCategories={props.onOpenModelCategories}
          />
        )}
      </ClientPresentationModelRow>
    ))
  }

  return (
    <div
      className='grid gap-3.5'
      style={
        {
          '--presentation-toolbar-height': `${toolbarHeight}px`,
        } as CSSProperties
      }
    >
      <ClientPresentationLeaveGuard when={dirty || conflict} />
      <div
        ref={toolbarRef}
        className='bg-background sticky top-0 z-10 flex max-w-[1240px] flex-wrap items-center justify-between gap-2.5 py-2'
      >
        {availableTypes.length > 0 && (
          <PresentationSegmented
            label={t('Generation type')}
            value={capability}
            options={availableTypes.map((item) => ({
              value: item,
              label: t(PRESENTATION_TYPE_COUNT_KEYS[item], {
                count: draft.orders[item].length,
              }),
            }))}
            onChange={(next) => {
              setCapability(next)
              setPicked(new Set())
              setSearch('')
              setVisibility('ALL')
              setSelected(draft.orders[next][0] ?? null)
            }}
          />
        )}
        <div className='ms-auto flex min-w-0 flex-wrap items-center justify-end gap-2'>
          <span
            role='status'
            title={status.title}
            className={cn(
              'max-w-[360px] truncate text-[12.5px]',
              status.tone === 'dirty' &&
                'font-semibold text-amber-700 dark:text-amber-400',
              status.tone === 'bad' && 'text-destructive font-semibold',
              !status.tone && 'text-muted-foreground'
            )}
          >
            {status.text}
          </span>
          <Button
            type='button'
            variant='outline'
            disabled={locked || (!conflict && !dirty)}
            onClick={() => void discard()}
          >
            {conflict ? t('Reload (discard my changes)') : t('Discard changes')}
          </Button>
          <Button
            type='button'
            disabled={conflict || !dirty || unnamed.length > 0 || locked}
            onClick={() => void publish()}
          >
            {t('Save and publish')}
          </Button>
        </div>
      </div>
      <p className='text-muted-foreground -mt-1 text-xs leading-normal'>
        {t(
          'Drag the handle or use the arrows to change the order; click a model to edit it. Each generation type keeps one order. When you are done, click "Save and publish" at the top right to publish everything; no approval is needed.'
        )}
      </p>
      <div
        className='grid max-w-[1240px] items-start gap-4 min-[1200px]:grid-cols-[minmax(0,1fr)_482px]'
        inert={locked}
        aria-busy={locked}
      >
        <Card className='min-w-0 overflow-visible p-2'>
          <div className='flex flex-wrap items-center gap-2 px-1 pt-1 pb-2'>
            <Input
              className='min-w-0 flex-[1_1_220px]'
              value={search}
              placeholder={t('Search model name or modelKey')}
              aria-label={t('Search models')}
              autoComplete='off'
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              value={visibility}
              onValueChange={(value) =>
                setVisibility(isVisibilityFilter(value) ? value : 'ALL')
              }
            >
              <SelectTrigger
                className='w-auto min-w-[120px]'
                aria-label={t('Customer display')}
              >
                <CanvasLocalizedSelectValue
                  value={visibility}
                  displayValue={t(visibilityLabelKeys[visibility])}
                />
              </SelectTrigger>
              <SelectContent>
                {visibilityFilters.map((filter) => (
                  <SelectItem key={filter} value={filter}>
                    {t(visibilityLabelKeys[filter])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ModelBadgeManager draft={draft} dispatch={editDispatch} />
            <span className='text-muted-foreground basis-full text-xs'>
              {filtering
                ? t('{{count}} found. Numbers are positions among all models', {
                    count: shown.length,
                  })
                : t('{{count}} in total', { count: keys.length })}
            </span>
            <ClientPresentationBatchBar
              capability={capability}
              shownKeys={shown.map(({ model }) => model.modelKey)}
              searching={filtering}
              picked={picked}
              onPickedChange={setPicked}
              draft={draft}
              dispatch={editDispatch}
            />
          </div>
          <ol ref={listRef} className='m-0 grid list-none gap-1 p-0'>
            {listContent}
          </ol>
        </Card>
        <ClientPresentationPreview
          key={capability}
          snapshot={draft}
          keys={keys}
          selected={selected}
          onSelect={(modelKey) => {
            setSelected(modelKey)
            requestAnimationFrame(() =>
              listRef.current
                ?.querySelector(`[data-model-key="${CSS.escape(modelKey)}"]`)
                ?.scrollIntoView({
                  block: 'nearest',
                  behavior: window.matchMedia(
                    '(prefers-reduced-motion: reduce)'
                  ).matches
                    ? 'auto'
                    : 'smooth',
                })
            )
          }}
        />
      </div>
    </div>
  )
}
