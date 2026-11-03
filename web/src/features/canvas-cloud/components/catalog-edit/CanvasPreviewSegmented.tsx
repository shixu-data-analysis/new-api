/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
/** The option buttons of the canvas panels (Canvas Web `.qualitySegmented`), as the admin previews draw them. */
export function CanvasPreviewSegmented(props: {
  title: string
  options: Array<[string, string]>
  value: string
  onPick: (value: string) => void
  disabled?: readonly string[]
}) {
  return (
    <section>
      <strong>{props.title}</strong>
      <div className='qualitySegmented' role='group' aria-label={props.title}>
        {props.options.map(([value, label]) => (
          <button
            key={value}
            type='button'
            className={props.value === value ? 'active' : ''}
            aria-pressed={props.value === value}
            disabled={props.disabled?.includes(value)}
            onClick={() => props.onPick(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  )
}
