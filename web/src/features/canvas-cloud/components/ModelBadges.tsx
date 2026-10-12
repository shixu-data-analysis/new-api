/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { visibleModelBadges } from '../lib/model-icons'

/** Up to two badges after a model name; badge text is not translated. */
export function ModelBadges(props: {
  badges: ReadonlyArray<{ name: string; color: string }> | undefined
}) {
  return (
    <>
      {visibleModelBadges(props.badges).map((badge) => (
        <span
          key={badge.name}
          className='model-badge'
          data-model-color={badge.color}
        >
          {badge.name}
        </span>
      ))}
    </>
  )
}
