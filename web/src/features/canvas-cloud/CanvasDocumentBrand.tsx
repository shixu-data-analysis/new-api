/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useSystemConfig } from '@/hooks/use-system-config'
import { applyFaviconToDom } from '@/lib/dom-utils'

import { getCanvasProductName, isCanvasBrandContext } from './brand'
import { lingCatStudioIcon } from './lingcat-icon'

function updateMeta(
  selector: string,
  attribute: 'name' | 'property',
  key: string,
  content: string
): () => void {
  let element = document.querySelector<HTMLMetaElement>(selector)
  const previous = element?.content
  const created = !element
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.content = content
  const meta = element
  return () => {
    if (created) meta.remove()
    else meta.content = previous ?? ''
  }
}

export function CanvasDocumentBrand() {
  const { i18n } = useTranslation()
  const { systemName, logo } = useSystemConfig()
  const pathname = useLocation({ select: (location) => location.pathname })
  const redirect = new URLSearchParams(window.location.search).get('redirect')
  const canvasBrand = isCanvasBrandContext(systemName, pathname, redirect)
  const productName = getCanvasProductName(
    i18n.resolvedLanguage ?? i18n.language
  )

  useEffect(() => {
    if (!canvasBrand) return
    const previousTitle = document.title
    const previousIcon =
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? logo
    document.title = productName
    const restoreMeta = [
      updateMeta('meta[name="title"]', 'name', 'title', productName),
      updateMeta(
        'meta[name="description"]',
        'name',
        'description',
        productName
      ),
      updateMeta(
        'meta[property="og:title"]',
        'property',
        'og:title',
        productName
      ),
      updateMeta(
        'meta[property="og:description"]',
        'property',
        'og:description',
        productName
      ),
      updateMeta(
        'meta[name="twitter:title"]',
        'name',
        'twitter:title',
        productName
      ),
      updateMeta(
        'meta[name="twitter:description"]',
        'name',
        'twitter:description',
        productName
      ),
    ]
    applyFaviconToDom(lingCatStudioIcon)
    return () => {
      document.title = previousTitle
      restoreMeta.forEach((restore) => restore())
      applyFaviconToDom(previousIcon)
    }
  }, [canvasBrand, logo, productName])

  return null
}
