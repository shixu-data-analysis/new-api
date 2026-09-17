/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function ModelTagFilterButton(props: {
  label: string
  count: number
  selected: boolean
  onClick: () => void
}) {
  return (
    <Button
      type='button'
      variant={props.selected ? 'default' : 'outline'}
      className={cn(
        'gap-2',
        !props.selected &&
          'border-primary/40 hover:border-primary hover:bg-primary/10'
      )}
      aria-label={`${props.label} ${props.count}`}
      aria-pressed={props.selected}
      onClick={props.onClick}
    >
      {props.label}
      <Badge
        className={cn(
          'min-w-5 px-1.5 font-semibold tabular-nums',
          props.selected
            ? 'bg-primary-foreground text-primary'
            : 'bg-primary text-primary-foreground'
        )}
      >
        {props.count}
      </Badge>
    </Button>
  )
}
