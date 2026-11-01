/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const EditorPageContext = createContext<{ editing: boolean; setEditing: (editing: boolean) => void }>({ editing: false, setEditing: () => {} })

/** A model or Channel editor takes over the page: its own title, no tabs of 模型管理. */
export function ModelManagementEditorPageProvider(props: { children: ReactNode }) {
  const [editing, setEditing] = useState(false)
  const value = useMemo(() => ({ editing, setEditing }), [editing])
  return <EditorPageContext.Provider value={value}>{props.children}</EditorPageContext.Provider>
}

export function useModelManagementEditing() {
  return useContext(EditorPageContext).editing
}

export function useModelManagementEditorPage(active = true) {
  const { setEditing } = useContext(EditorPageContext)
  useEffect(() => {
    if (!active) return
    setEditing(true)
    return () => setEditing(false)
  }, [active, setEditing])
}
