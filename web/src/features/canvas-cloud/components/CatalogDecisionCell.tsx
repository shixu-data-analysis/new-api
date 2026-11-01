/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMemo, useState } from 'react'
import { createContext, useContext } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

import { diffCatalogJson } from '../catalog-json-diff'
import type { ModelCatalogDecision } from '../generated/model-catalog-import'
import { CatalogJsonDiff } from './CatalogJsonDiff'

interface CatalogDecisionState {
  decisions: ModelCatalogDecision[]
  busy: boolean
  onToggle: (decision: ModelCatalogDecision, overridden: boolean) => void
}

const CatalogDecisionContext = createContext<CatalogDecisionState>({
  decisions: [],
  busy: false,
  onToggle: () => undefined,
})

export const CatalogDecisionProvider = CatalogDecisionContext.Provider

export function useCatalogDecision(
  resourceType: ModelCatalogDecision['resourceType'],
  key: string
) {
  const state = useContext(CatalogDecisionContext)
  return useMemo(
    () => ({
      ...state,
      decision: state.decisions.find(
        (entry) => entry.resourceType === resourceType && entry.key === key
      ),
    }),
    [state, resourceType, key]
  )
}

/** A row of the import table whose object an administrator changed: kept unless the importer selects the Bundle version. */
export function CatalogDecisionCell(props: {
  resourceType: ModelCatalogDecision['resourceType']
  objectKey: string
}) {
  const { t } = useTranslation()
  const { decision, busy, onToggle } = useCatalogDecision(
    props.resourceType,
    props.objectKey
  )
  const [open, setOpen] = useState(false)
  if (!decision) return null
  const id = `catalog-decision-${props.resourceType}-${props.objectKey}`
  const broken = decision.impact.filter((change) => !change.after.ok)
  return (
    <div className='space-y-1'>
      <p>{t('An administrator changed this object; the current version stays by default.')}</p>
      <div className='flex items-center gap-2'>
        <Checkbox
          id={id}
          checked={decision.overridden}
          disabled={busy}
          onCheckedChange={(next) => onToggle(decision, next === true)}
        />
        <Label htmlFor={id} className='font-normal'>
          {t('Overwrite with the Bundle')}
        </Label>
        <button
          type='button'
          className='text-primary text-sm hover:underline'
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? t('Collapse') : t('View details')}
        </button>
      </div>
      {decision.overridden && decision.impact.length > 0 ? (
        <p className={broken.length ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
          {broken.length
            ? t('{{count}} models would not work with the Bundle version', { count: broken.length })
            : t('The request of {{count}} models changes', { count: decision.impact.length })}
        </p>
      ) : null}
      {open ? (
        <div className='space-y-2'>
          <CatalogJsonDiff
            title={t('Admin version and Bundle version')}
            summary={t('Current version on the left, Bundle version on the right')}
            diff={diffCatalogJson(decision.definition.current, decision.definition.proposed)}
          />
          {decision.impact.map((change) => (
            <div key={change.productKey} className='rounded-lg border p-2 text-xs'>
              <p className='font-medium'>{change.displayName}</p>
              {change.after.ok ? (
                <CatalogJsonDiff
                  title={t('Request')}
                  summary={change.after.url}
                  diff={diffCatalogJson(change.before?.ok ? change.before.body : null, change.after.body)}
                />
              ) : (
                <p role='alert' className='text-destructive font-mono [overflow-wrap:anywhere]'>
                  {change.after.reason}: {change.after.message}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
