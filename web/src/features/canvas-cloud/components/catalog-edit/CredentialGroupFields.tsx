/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import {
  NEW_GROUP,
  NO_GROUP,
  type GroupChoice,
  type GroupIssueField,
  type NewGroupDraft,
  type ProviderGroup,
} from '../../catalog-credential-groups'
import { EditField } from './EditFields'

/** The API Key group of a new or copied model; a new group's key is typed here and saved with the publication. */
export function CredentialGroupFields(props: {
  groups: ProviderGroup[]
  /** Without an API provider there is nothing to bind yet. */
  providerChosen: boolean
  choice: GroupChoice
  newGroup: NewGroupDraft
  copy: boolean
  errors: Partial<Record<GroupIssueField, string>>
  onChoice: (choice: GroupChoice) => void
  onNewGroup: (next: NewGroupDraft) => void
}) {
  const { t } = useTranslation()
  const { choice, newGroup } = props
  if (!props.providerChosen) {
    return (
      <EditField label={t('API Key group')}>
        {(id) => (
          <NativeSelect id={id} className='w-full' disabled value=''>
            <NativeSelectOption value=''>
              {t('Choose an API provider first')}
            </NativeSelectOption>
          </NativeSelect>
        )}
      </EditField>
    )
  }
  let help = t('Each model binds one group; one API provider can have several.')
  if (props.copy) help = t("Keeps the source model's API Key group by default")
  if (choice === NO_GROUP) {
    help = t(
      'After publishing the model has no API Key: it cannot make real calls or be shown to customers. Bind one later under Manage API Key bindings.'
    )
  }
  const pending = newGroup.name.trim()
  return (
    <>
      <EditField
        label={t('API Key group')}
        help={help}
        error={props.errors.credentialGroup}
      >
        {(id, describedBy) => (
          <NativeSelect
            id={id}
            className='w-full'
            aria-describedby={describedBy}
            aria-invalid={props.errors.credentialGroup ? true : undefined}
            value={choice}
            onChange={(event) => props.onChoice(event.target.value)}
          >
            <NativeSelectOption value=''>
              {t('Please select')}
            </NativeSelectOption>
            {props.groups.map((group) => (
              <NativeSelectOption key={group.versionId} value={group.versionId}>
                {t('{{name}} ({{count}} models)', {
                  name: group.name,
                  count: group.models,
                })}
              </NativeSelectOption>
            ))}
            <NativeSelectOption value={NEW_GROUP}>
              {pending && newGroup.apiKey
                ? t('{{name}} (new this time)', { name: pending })
                : t('+ New API Key group')}
            </NativeSelectOption>
            <NativeSelectOption value={NO_GROUP}>
              {t('Not bound for now')}
            </NativeSelectOption>
          </NativeSelect>
        )}
      </EditField>
      {choice === NEW_GROUP ? (
        <>
          <EditField
            label={t('API Key group name')}
            help={t('Unique within the API provider')}
            error={props.errors.newGroupName}
          >
            {(id, describedBy) => (
              <Input
                id={id}
                autoComplete='off'
                aria-describedby={describedBy}
                aria-invalid={props.errors.newGroupName ? true : undefined}
                value={newGroup.name}
                onChange={(event) =>
                  props.onNewGroup({ ...newGroup, name: event.target.value })
                }
              />
            )}
          </EditField>
          <EditField
            label='API Key'
            help={t(
              'Saved to this new group; it never goes into logs or the catalog'
            )}
            error={props.errors.apiKey}
          >
            {(id, describedBy) => (
              <Input
                id={id}
                type='password'
                autoComplete='off'
                placeholder={t('Saved when publishing; used by real calls')}
                aria-describedby={describedBy}
                aria-invalid={props.errors.apiKey ? true : undefined}
                value={newGroup.apiKey}
                onChange={(event) =>
                  props.onNewGroup({ ...newGroup, apiKey: event.target.value })
                }
              />
            )}
          </EditField>
        </>
      ) : null}
    </>
  )
}
