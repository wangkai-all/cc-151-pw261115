import { useMemo, useState, type ReactNode } from 'react'
import type { AnalysisResult, ProductDetail } from '../analysis/types'
import type { FactorKey } from '../analysis/decompose'
import {
  deltaClass,
  fmtMoney,
  fmtPrice,
  fmtPct,
  fmtQty,
  fmtSignedMoney,
} from '../lib/format'

interface Props {
  result: AnalysisResult
  onOpenProductFactor: (d: ProductDetail, factor: FactorKey) => void
}

type SortKey =
  | 'productName'
  | 'kind'
  | 'qty0'
  | 'qty1'
  | 'price0'
  | 'price1'
  | 'rev0'
  | 'rev1'
  | 'delta'
  | 'volume'
  | 'mix'
  | 'price'

const KIND_ORDER = { common: 0, new: 1, exited: 2 }
const KIND_LABEL = { common: '共同', new: '新增', exited: '退出' }

export function ProductTable({ result, onOpenProductFactor }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('delta')
  const [asc, setAsc] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo(() => {
    const val = (d: ProductDetail): number | string => {
      switch (sortKey) {
        case 'productName':
          return d.productName
        case 'kind':
          return KIND_ORDER[d.kind]
        case 'price0':
          return d.price0 ?? Number.NEGATIVE_INFINITY
        case 'price1':
          return d.price1 ?? Number.NEGATIVE_INFINITY
        case 'delta':
          return d.rev1 - d.rev0
        case 'volume':
          return d.effects?.volume.contribution ?? 0
        case 'mix':
          return d.effects?.mix.contribution ?? 0
        case 'price':
          return d.effects?.price.contribution ?? 0
        default:
          return d[sortKey] as number
      }
    }
    const sorted = [...result.productDetails].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      const cmp =
        typeof va === 'string' || typeof vb === 'string'
          ? String(va).localeCompare(String(vb), 'zh-CN')
          : (va as number) - (vb as number)
      return asc ? cmp : -cmp
    })
    return sorted
  }, [result, sortKey, asc])

  const header = (key: SortKey, label: string, alignRight = true) => (
    <th
      className={`sortable ${alignRight ? '' : 'text'}`}
      onClick={() => {
        if (sortKey === key) setAsc(!asc)
        else {
          setSortKey(key)
          setAsc(false)
        }
      }}
      aria-sort={sortKey === key ? (asc ? 'ascending' : 'descending') : undefined}
    >
      {label}
      {sortKey === key ? (asc ? ' ▲' : ' ▼') : ''}
    </th>
  )

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 26 }} />
            {header('productName', '商品', false)}
            {header('qty0', '基期销量')}
            {header('qty1', '当期销量')}
            {header('price0', '基期均价')}
            {header('price1', '当期均价')}
            {header('rev0', '基期收入')}
            {header('rev1', '当期收入')}
            {header('delta', '收入差')}
            {header('volume', '销量效应')}
            {header('mix', '结构效应')}
            {header('price', '价格效应')}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const isOpen = expanded === d.productId
            const delta = d.rev1 - d.rev0
            return (
              <RowGroup
                key={d.productId}
                d={d}
                isOpen={isOpen}
                delta={delta}
                onToggle={() => setExpanded(isOpen ? null : d.productId)}
                headerCells={
                  <>
                    <td style={{ width: 26 }}>
                      <button
                        className="mini-link"
                        aria-label={isOpen ? '收起' : '展开'}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? '▾' : '▸'}
                      </button>
                    </td>
                    <td className="text" style={{ whiteSpace: 'normal', minWidth: 150 }}>
                      {d.productName}
                      <span className={`tag ${d.kind}`}>{KIND_LABEL[d.kind]}</span>
                    </td>
                    <td>{fmtQty(d.qty0)}</td>
                    <td>{fmtQty(d.qty1)}</td>
                    <td>{fmtPrice(d.price0)}</td>
                    <td>{fmtPrice(d.price1)}</td>
                    <td>{fmtMoney(d.rev0)}</td>
                    <td>{fmtMoney(d.rev1)}</td>
                    <td className={deltaClass(delta)}>
                      <strong>{fmtSignedMoney(delta)}</strong>
                    </td>
                    <EffectCell d={d} factor="volume" onOpenFactor={onOpenProductFactorLocal} />
                    <EffectCell d={d} factor="mix" onOpenFactor={onOpenProductFactorLocal} />
                    <EffectCell d={d} factor="price" onOpenFactor={onOpenProductFactorLocal} />
                  </>
                }
              />
            )

            function onOpenProductFactorLocal(f: FactorKey) {
              onOpenProductFactor(d, f)
            }
          })}
        </tbody>
      </table>
    </div>
  )
}

function EffectCell({
  d,
  factor,
  onOpenFactor,
}: {
  d: ProductDetail
  factor: FactorKey
  onOpenFactor: (f: FactorKey) => void
}) {
  if (d.kind !== 'common' || !d.effects) {
    return <td className="muted">—</td>
  }
  const e = d.effects[factor]
  return (
    <td
      className={`effect-cell ${deltaClass(e.contribution)}`}
      onClick={() => onOpenFactor(factor)}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault()
          onOpenFactor(factor)
        }
      }}
      title={`点击查看「${e.label}」贡献的数量、均价与公式`}
    >
      {fmtSignedMoney(e.contribution)}
    </td>
  )
}

function RowGroup({
  d,
  isOpen,
  delta,
  onToggle,
  headerCells,
}: {
  d: ProductDetail
  isOpen: boolean
  delta: number
  onToggle: () => void
  headerCells: ReactNode
}) {
  const pricePct =
    d.price0 !== null && d.price1 !== null && d.price0 !== 0
      ? d.price1 / d.price0 - 1
      : null
  const qtyPct = d.qty0 > 0 ? d.qty1 / d.qty0 - 1 : null
  return (
    <>
      <tr
        className={`detail-row ${isOpen ? 'expanded' : ''}`}
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
      >
        {headerCells}
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={12} style={{ padding: 0, borderBottom: '1px solid var(--grid)' }}>
            <div className="expand-pane" onClick={(e) => e.stopPropagation()}>
              <dl>
                <div>
                  <dt>商品编码 / 品类</dt>
                  <dd>
                    {d.productId} · {d.category}
                  </dd>
                </div>
                <div>
                  <dt>销量变化</dt>
                  <dd>
                    {fmtQty(d.qty0)} → {fmtQty(d.qty1)} 件
                    {qtyPct !== null && (
                      <span className={deltaClass(qtyPct)}> （{fmtPct(qtyPct)}）</span>
                    )}
                    {d.kind === 'new' && <span className="tag new">基期不存在，不补零价</span>}
                    {d.kind === 'exited' && <span className="tag exited">当期已退出</span>}
                  </dd>
                </div>
                <div>
                  <dt>成交均价变化</dt>
                  <dd>
                    {fmtPrice(d.price0)} → {fmtPrice(d.price1)} 元/件
                    {pricePct !== null && (
                      <span className={deltaClass(pricePct)}> （{fmtPct(pricePct)}）</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>正向收入差（q·p 口径）</dt>
                  <dd className={deltaClass(delta)}>
                    <strong>{fmtSignedMoney(delta, 2)} 元</strong>
                  </dd>
                </div>
                {d.effects && (
                  <div>
                    <dt>三因素加总核对</dt>
                    <dd>
                      {fmtSignedMoney(
                        d.effects.volume.contribution +
                          d.effects.mix.contribution +
                          d.effects.price.contribution,
                        2,
                      )}{' '}
                      元（单商品结构 w≡1，结构效应为 0）
                    </dd>
                  </div>
                )}
                <div>
                  <dt>退货金额（独立核对，不进三因素）</dt>
                  <dd>
                    {fmtMoney(d.returnAmount0)} → {fmtMoney(d.returnAmount1)} 元
                  </dd>
                </div>
                <div>
                  <dt>其他调整（独立核对）</dt>
                  <dd>
                    {fmtMoney(d.adjustmentAmount0)} → {fmtMoney(d.adjustmentAmount1)} 元
                  </dd>
                </div>
              </dl>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
