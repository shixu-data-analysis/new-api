/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMemo, useState, type ReactNode } from 'react'

import { EditorPageContext } from './model-management-editor-page-context'

/** A model or Channel editor takes over the page: its own title, no tabs of 模型管理. */
export function ModelManagementEditorPageProvider(props: {
  children: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const value = useMemo(() => ({ editing, setEditing }), [editing])
  return (
    <EditorPageContext.Provider value={value}>
      {props.children}
    </EditorPageContext.Provider>
  )
}
