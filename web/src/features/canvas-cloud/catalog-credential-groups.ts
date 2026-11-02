/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
// The API Key group a new model binds: an API provider may have several groups, each holding one key; a model binds
// one, a group made on this page, or none for now. One new group per page, so every model on it can bind it.
import type {
  CatalogEditDraftModel,
  CurrentCatalogView,
} from './catalog-edit-types'

/** The group made on this page. */
export const NEW_GROUP = 'NEW'
/** Published without an API Key; it is bound later under the API Key bindings. */
export const NO_GROUP = 'NONE'

/** Not picked yet, the new group, none, or the version ID of a published group. */
export type GroupChoice = string

export interface NewGroupDraft {
  name: string
  apiKey: string
}

export interface ProviderGroup {
  versionId: string
  name: string
  /** Published models that bind it. */
  models: number
}

export function groupsOfProvider(
  catalog: CurrentCatalogView,
  providerId: string | undefined
): ProviderGroup[] {
  const bound = Object.values(catalog.modelCredentialGroups)
  return catalog.credentialGroups
    .filter((group) => group.providerId === providerId)
    .map((group) => ({
      versionId: group.versionId,
      name: group.name,
      models: bound.filter((versionId) => versionId === group.versionId).length,
    }))
}

/** A new model starts with the group its Channel's models share, a new group for a provider without one, otherwise a choice. */
export function defaultGroupChoice(
  catalog: CurrentCatalogView,
  providerId: string | undefined,
  channelId: string
): GroupChoice {
  if (!groupsOfProvider(catalog, providerId).length) return NEW_GROUP
  const used = new Set(
    catalog.bundle.models
      .filter((model) => model.release.channelId === channelId)
      .map(
        (model) => catalog.modelCredentialGroups[model.productKey] ?? NO_GROUP
      )
  )
  return used.size === 1 ? [...used][0] : ''
}

/** A copy keeps its source's group, and so stays unbound when its source is. */
export function copiedGroupChoice(
  catalog: CurrentCatalogView,
  sourceKey: string
): GroupChoice {
  return catalog.modelCredentialGroups[sourceKey] ?? NO_GROUP
}

/** The first of the provider's main account and its numbered accounts that no group of the provider has. */
export function suggestedGroupName(
  groups: ProviderGroup[],
  main: string,
  numbered: (n: number) => string
): string {
  const taken = new Set(groups.map((group) => group.name))
  if (!taken.has(main)) return main
  let n = 2
  while (taken.has(numbered(n))) n += 1
  return numbered(n)
}

/** What the draft states for a new model; Cloud binds exactly this. */
export function draftBinding(
  choice: GroupChoice
): CatalogEditDraftModel['credentialGroup'] {
  if (choice === NEW_GROUP) return 'NEW'
  if (choice === NO_GROUP) return null
  return { versionId: choice }
}

export type GroupIssueField = 'credentialGroup' | 'newGroupName' | 'apiKey'

/** What is missing before publishing, by field; the keys are i18n keys. */
export function groupIssues(
  choice: GroupChoice,
  newGroup: NewGroupDraft,
  groups: ProviderGroup[]
): Partial<Record<GroupIssueField, string>> {
  if (!choice) {
    return {
      credentialGroup: 'Choose an API Key group, or "Not bound for now"',
    }
  }
  if (choice !== NEW_GROUP) return {}
  const name = newGroup.name.trim()
  const issues: Partial<Record<GroupIssueField, string>> = {}
  if (!name) issues.newGroupName = 'Enter the group name'
  else if (groups.some((group) => group.name === name)) {
    issues.newGroupName =
      'This API provider already has an API Key group with this name'
  }
  if (!newGroup.apiKey) {
    issues.apiKey = 'Enter the API Key, or choose "Not bound for now"'
  }
  return issues
}
