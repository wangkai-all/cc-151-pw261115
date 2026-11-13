// 通用格式化与导出工具

export function fmtMoney(v: number, digits = 0): string {
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  return (
    sign +
    abs.toLocaleString('zh-CN', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  )
}

export function fmtSignedMoney(v: number, digits = 0): string {
  return (v >= 0 ? '+' : '') + fmtMoney(v, digits)
}

export function fmtQty(v: number): string {
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 1 })
}

export function fmtPrice(v: number | null): string {
  return v === null ? '—' : fmtMoney(v, 2)
}

export function fmtPct(v: number): string {
  return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'
}

export function deltaClass(v: number): string {
  if (Math.abs(v) < 1e-9) return ''
  return v > 0 ? 'delta-pos' : 'delta-neg'
}

/** 导出逐商品级 CSV（带 UTF-8 BOM，Excel 可直接打开） */
export function exportProductCsv(
  rows: {
    productId: string
    productName: string
    category: string
    kind: string
    qty0: number
    qty1: number
    price0: number | null
    price1: number | null
    rev0: number
    rev1: number
    volumeEffect?: number
    mixEffect?: number
    priceEffect?: number
    returnAmount0: number
    returnAmount1: number
    adjustmentAmount0: number
    adjustmentAmount1: number
  }[],
  filename: string,
): void {
  const header = [
    '商品编码', '商品名称', '品类', '商品类型',
    '基期销量', '当期销量',
    '基期成交均价', '当期成交均价',
    '基期正向销售额', '当期正向销售额', '收入差',
    '总销量效应(Shapley)', '商品结构效应(Shapley)', '单品价格效应(Shapley)',
    '基期退货金额', '当期退货金额',
    '基期其他调整', '当期其他调整',
  ]
  const kindLabel: Record<string, string> = {
    common: '共同商品',
    new: '新增商品',
    exited: '退出商品',
  }
  const lines = rows.map((r) =>
    [
      r.productId,
      r.productName,
      r.category,
      kindLabel[r.kind] ?? r.kind,
      r.qty0,
      r.qty1,
      r.price0 === null ? '' : r.price0.toFixed(4),
      r.price1 === null ? '' : r.price1.toFixed(4),
      r.rev0.toFixed(2),
      r.rev1.toFixed(2),
      (r.rev1 - r.rev0).toFixed(2),
      r.volumeEffect?.toFixed(2) ?? '',
      r.mixEffect?.toFixed(2) ?? '',
      r.priceEffect?.toFixed(2) ?? '',
      r.returnAmount0.toFixed(2),
      r.returnAmount1.toFixed(2),
      r.adjustmentAmount0.toFixed(2),
      r.adjustmentAmount1.toFixed(2),
    ]
      .map(csvCell)
      .join(','),
  )
  const csv = '﻿' + [header.join(','), ...lines].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
