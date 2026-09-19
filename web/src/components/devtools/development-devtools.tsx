/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { ChevronDown, DatabaseZap, Route } from 'lucide-react'
import { useState } from 'react'

type ActiveDevtools = 'query' | 'router' | null

const floatingButtonClass =
  'bg-background text-foreground flex h-10 items-center gap-2 rounded-md border px-3 text-xs font-medium shadow-lg'

export function DevelopmentDevtools() {
  const [active, setActive] = useState<ActiveDevtools>(null)

  if (!active) {
    return (
      <div className='fixed bottom-3 left-3 z-[2147483647] flex items-center gap-2'>
        <button
          type='button'
          aria-label='Open TanStack Query Devtools'
          className={floatingButtonClass}
          onClick={() => setActive('query')}
        >
          <DatabaseZap className='size-4' />
          Query
        </button>
        <button
          type='button'
          aria-label='Open TanStack Router Devtools'
          className={floatingButtonClass}
          onClick={() => setActive('router')}
        >
          <Route className='size-4' />
          Router
        </button>
      </div>
    )
  }

  return (
    <aside
      aria-label={`TanStack ${active === 'query' ? 'Query' : 'Router'} Devtools`}
      className='bg-background fixed inset-x-0 bottom-0 z-[2147483647] border-t shadow-2xl'
    >
      <button
        type='button'
        aria-label={`Collapse TanStack ${active === 'query' ? 'Query' : 'Router'} Devtools`}
        className='bg-background text-foreground absolute top-1 right-1 z-10 flex size-9 items-center justify-center rounded-md border shadow-sm'
        onClick={() => setActive(null)}
      >
        <ChevronDown className='size-5' />
      </button>
      {active === 'query' ? (
        <ReactQueryDevtoolsPanel
          onClose={() => setActive(null)}
          style={{ height: 'min(500px, 55vh)' }}
        />
      ) : (
        <TanStackRouterDevtoolsPanel
          isOpen
          setIsOpen={(open) => setActive(open ? 'router' : null)}
          style={{ height: 'min(500px, 55vh)' }}
        />
      )}
    </aside>
  )
}
