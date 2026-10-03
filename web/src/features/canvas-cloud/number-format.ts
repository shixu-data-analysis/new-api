/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

export function formatBusinessNumber(
  value: string | number,
  maximumFractionDigits = 2
): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(numeric)
}

export function formatBusinessPercentFromRate(value: string): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  return formatBusinessNumber(numeric * 100)
}

/** Formats an integer string through Intl without first losing precision to Number. */
export function formatExactPointQuantity(
  value: string,
  locale?: string
): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    BigInt(value)
  )
}

/** Keeps the server's fixed decimal reference precise while applying locale grouping. */
export function formatExactRmbReference(
  value: string,
  locale?: string,
  fractionDigits?: number
): string {
  if (fractionDigits !== undefined) {
    const match = /^(-?)(\d+)(?:\.(\d*))?$/u.exec(value)
    if (!match || !Number.isInteger(fractionDigits) || fractionDigits < 0) {
      throw new RangeError('Invalid fixed decimal value')
    }
    const [, sign = '', integer = '0', sourceFraction = ''] = match
    const scale = 10n ** BigInt(fractionDigits)
    const keptFraction = sourceFraction
      .slice(0, fractionDigits)
      .padEnd(fractionDigits, '0')
    let scaled = BigInt(integer) * scale + BigInt(keptFraction || '0')
    if ((sourceFraction[fractionDigits] ?? '0') >= '5') scaled += 1n
    const formattedInteger = formatExactPointQuantity(
      (scaled / scale).toString(),
      locale
    )
    const parts = new Intl.NumberFormat(locale).formatToParts(-1.1)
    const minus = parts.find((part) => part.type === 'minusSign')?.value ?? '-'
    if (fractionDigits === 0) {
      return `${sign && scaled ? minus : ''}${formattedInteger}`
    }
    const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.'
    return `${sign && scaled ? minus : ''}${formattedInteger}${decimal}${(
      scaled % scale
    )
      .toString()
      .padStart(fractionDigits, '0')}`
  }
  const [integer, fraction = ''] = value.split('.')
  const formattedInteger = formatExactPointQuantity(integer, locale)
  const significantFraction = fraction.replace(/0+$/u, '')
  if (!significantFraction) return formattedInteger
  const parts = new Intl.NumberFormat(locale).formatToParts(-1.1)
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.'
  const minus = parts.find((part) => part.type === 'minusSign')?.value ?? '-'
  const signedInteger =
    integer === '-0' ? `${minus}${formattedInteger}` : formattedInteger
  return `${signedInteger}${decimal}${significantFraction}`
}
