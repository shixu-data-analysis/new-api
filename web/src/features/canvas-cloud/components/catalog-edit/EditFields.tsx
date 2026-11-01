/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { TFunction } from 'i18next'
import type { ReactNode } from 'react'
import { createContext, useContext, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PageFooterPortal } from '@/components/layout/components/page-footer'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'

/** A Profile stores the workflow as an identifier; pages show this name. */
export function workflowLabel(t: TFunction, workflow: unknown): string {
  if (workflow === 'sync') return t('Synchronous (result returned directly)')
  if (workflow === 'async') return t('Asynchronous (query after submit)')
  if (workflow === 'asset-async') return t('Upload materials, then asynchronous')
  return String(workflow ?? '')
}

export function workflowShortLabel(t: TFunction, workflow: unknown): string {
  if (workflow === 'sync') return t('Synchronous')
  if (workflow === 'async') return t('Asynchronous')
  return workflowLabel(t, workflow)
}

/** Leaving an editor with unpublished changes asks first. */
export function LeaveConfirm(props: { open: boolean; onOpenChange: (open: boolean) => void; onLeave: () => void }) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={props.open} onOpenChange={props.onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Leave the unpublished changes?')}</AlertDialogTitle>
          <AlertDialogDescription>{t('If you leave, these changes are not kept.')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('Keep editing')}</AlertDialogCancel>
          <AlertDialogAction variant='destructive' onClick={props.onLeave}>{t('Leave')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** The actions of an editor, in the page footer every long admin page uses. */
export function EditorFooter(props: { children: ReactNode }) {
  return (
    <PageFooterPortal>
      <div className='flex flex-wrap items-center gap-3'>{props.children}</div>
    </PageFooterPortal>
  )
}

export function EditSection(props: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section className='bg-card grid max-w-3xl gap-3 rounded-xl border p-4 text-sm'>
      <div className='space-y-1'>
        <h3 className='font-medium'>{props.title}</h3>
        {props.description ? (
          <p className='text-muted-foreground text-xs'>{props.description}</p>
        ) : null}
      </div>
      <div className='grid gap-3 md:grid-cols-2'>{props.children}</div>
    </section>
  )
}

/** Label, control, help and error of one form field. `was` marks a changed value and shows the published one. */
/** What a marked field differs from: the published version, or the source of a copy. */
export const ComparedWithContext = createContext<'version' | 'source'>('version')

export function RetireReasonSelect(props: { id: string; value: string; onChange: (next: string) => void }) {
  const { t } = useTranslation()
  return (
    <NativeSelect id={props.id} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
      <NativeSelectOption value=''>{t('Please select')}</NativeSelectOption>
      <NativeSelectOption value='UPSTREAM_DISCONTINUED'>{t('Discontinued by the upstream')}</NativeSelectOption>
      <NativeSelectOption value='REPLACED'>{t('Replaced by another model')}</NativeSelectOption>
      <NativeSelectOption value='CONFIGURATION_MISTAKE'>{t('Set up by mistake')}</NativeSelectOption>
      <NativeSelectOption value='OTHER'>{t('Other')}</NativeSelectOption>
    </NativeSelect>
  )
}

export function UnsupportedFieldsBadge(props: { paths: string[] }) {
  const { t } = useTranslation()
  if (!props.paths.length) return null
  return (
    <span className='text-primary bg-primary/10 ml-1 inline-block rounded-md px-1.5 font-sans text-xs font-medium' title={t('The Bundle has fields this page cannot edit yet: {{paths}}', { paths: props.paths.join(', ') })}>
      {t('Has unsupported fields')}
    </span>
  )
}

export function EditField(props: {
  label: string
  help?: ReactNode
  error?: string
  wide?: boolean
  was?: string
  children: (controlId: string, describedBy: string | undefined) => ReactNode
}) {
  const { t } = useTranslation()
  const id = useId()
  const comparedWith = useContext(ComparedWithContext)
  const hint = props.help || props.error ? `${id}-hint` : undefined
  return (
    <div data-edit-field className={`min-w-0 space-y-1 ${props.wide ? 'md:col-span-2' : ''}`}>
      <div className='flex flex-wrap items-center gap-2'>
        <Label htmlFor={id}>{props.label}</Label>
        {props.was !== undefined ? (
          <span className='text-primary bg-primary/10 rounded-md px-1.5 text-xs font-medium'>
            {comparedWith === 'source' ? t('Differs from the source model') : t('Modified')}
          </span>
        ) : null}
      </div>
      {props.children(id, hint)}
      {props.was !== undefined ? (
        <p className='text-muted-foreground text-xs'>
          {comparedWith === 'source' ? t('Source model: {{value}}', { value: props.was }) : t('Original: {{value}}', { value: props.was })}
        </p>
      ) : null}
      {props.help ? (
        <p id={hint} className='text-muted-foreground text-xs'>
          {props.help}
        </p>
      ) : null}
      {props.error ? (
        <p role='alert' className='text-destructive text-xs'>
          {props.error}
        </p>
      ) : null}
    </div>
  )
}

export function NumberField(props: {
  label: string
  value: unknown
  onChange: (next: number | undefined) => void
  placeholder?: string
  help?: string
  error?: string
  was?: string
}) {
  return (
    <EditField
      label={props.label}
      help={props.help}
      error={props.error}
      was={props.was}
    >
      {(id, describedBy) => (
        <Input
          id={id}
          type='number'
          aria-describedby={describedBy}
          aria-invalid={props.error ? true : undefined}
          placeholder={props.placeholder}
          value={typeof props.value === 'number' ? props.value : ''}
          onChange={(event) =>
            props.onChange(
              event.target.value === '' ? undefined : Number(event.target.value)
            )
          }
        />
      )}
    </EditField>
  )
}

export function SwitchField(props: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  const id = useId()
  return (
    <div className='inline-flex min-h-8 items-center gap-2'>
      <Switch
        id={id}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onChange}
      />
      <Label htmlFor={id} className='font-normal'>
        {props.label}
      </Label>
    </div>
  )
}

/** Multi-select of short values. */
export function ValuePills(props: {
  options: string[]
  selected: string[]
  labels?: Record<string, string>
  label: string
  onToggle: (value: string) => void
}) {
  return (
    <div
      className='flex flex-wrap gap-1.5'
      role='group'
      aria-label={props.label}
    >
      {props.options.map((option) => {
        const on = props.selected.includes(option)
        return (
          <Button
            key={option}
            type='button'
            size='sm'
            variant={on ? 'default' : 'outline'}
            aria-pressed={on}
            onClick={() => props.onToggle(option)}
          >
            {props.labels?.[option] ?? option}
          </Button>
        )
      })}
    </div>
  )
}

/** Adds a typed value after checking it; the check belongs to the caller. */
export function ValueAdder(props: {
  placeholder: string
  actionLabel: string
  fieldLabel: string
  normalize?: (value: string) => string
  validate: (value: string) => string | undefined
  onAdd: (value: string) => void
}) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string>()
  const add = () => {
    const issue = props.validate(value)
    setError(issue)
    if (issue) return
    props.onAdd(value)
    setValue('')
  }
  return (
    <div className='space-y-1'>
      <div className='flex items-center gap-2'>
        <Input
          aria-label={props.fieldLabel}
          aria-invalid={error ? true : undefined}
          className='flex-1'
          placeholder={props.placeholder}
          value={value}
          onChange={(event) => {
            setValue(props.normalize?.(event.target.value) ?? event.target.value)
            setError(undefined)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            add()
          }}
        />
        <Button type='button' size='sm' variant='outline' onClick={add}>
          {props.actionLabel}
        </Button>
      </div>
      {error ? (
        <p role='alert' className='text-destructive text-xs'>
          {error}
        </p>
      ) : null}
    </div>
  )
}
