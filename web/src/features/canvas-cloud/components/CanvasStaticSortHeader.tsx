import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function CanvasStaticSortHeader({
  active,
  descending,
  label,
  onClick,
}: {
  active: boolean
  descending: boolean
  label: string
  onClick: () => void
}) {
  const { t } = useTranslation()
  let SortIcon = ArrowUpDown
  if (active) SortIcon = descending ? ArrowDown : ArrowUp

  return (
    <Button
      type='button'
      variant='ghost'
      size='sm'
      className='-ms-3 h-8 gap-1.5 px-3 font-semibold'
      aria-label={`${t('Sort by')} ${label}`}
      onClick={onClick}
    >
      <span>{label}</span>
      <SortIcon className='size-4 shrink-0' aria-hidden='true' />
    </Button>
  )
}
