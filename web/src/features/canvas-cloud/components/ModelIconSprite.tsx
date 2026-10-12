/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  MODEL_BRAND_ICON_PATHS,
  modelIconSymbolId,
  type ModelIconKey,
} from '../lib/model-icons'

const brandIcons = Object.entries(MODEL_BRAND_ICON_PATHS) as Array<
  [ModelIconKey, string]
>

/** Defines each brand mark once; icon tiles reference it with <use>. Mounted once by the layout. */
export function ModelIconSprite() {
  return (
    <svg
      width='0'
      height='0'
      className='absolute'
      aria-hidden='true'
      focusable='false'
    >
      <defs>
        {brandIcons.map(([key, path]) => (
          <symbol key={key} id={modelIconSymbolId(key)} viewBox='0 0 24 24'>
            <path fill='currentColor' fillRule='evenodd' d={path} />
          </symbol>
        ))}
      </defs>
    </svg>
  )
}
