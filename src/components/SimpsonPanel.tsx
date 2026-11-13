import type { AnalysisResult } from '../analysis/types'
import { fmtMoney, fmtPct, fmtPrice } from '../lib/format'

interface Props {
  result: AnalysisResult
}

/**
 * 结构悖论面板：共同商品单价全部下降（左，均为负向），
 * 但共同商品整体均价上升（右）——差异完全来自销量结构 w 的变化。
 */
export function SimpsonPanel({ result }: Props) {
  const common = result.productDetails.filter((d) => d.kind === 'common')

  const commonQty0 = common.reduce((a, d) => a + d.qty0, 0)
  const commonQty1 = common.reduce((a, d) => a + d.qty1, 0)
  const commonRev0 = common.reduce((a, d) => a + d.rev0, 0)
  const commonRev1 = common.reduce((a, d) => a + d.rev1, 0)
  const avg0 = commonRev0 / commonQty0
  const avg1 = commonRev1 / commonQty1

  // 单品价格变化率（全部为负）
  const priceChanges = common
    .map((d) => ({
      name: d.productName,
      p0: d.price0!,
      p1: d.price1!,
      pct: d.price1! / d.price0! - 1,
      w0: d.qty0 / commonQty0,
      w1: d.qty1 / commonQty1,
    }))
    .sort((a, b) => a.pct - b.pct)

  const avgPct = avg1 / avg0 - 1

  return (
    <div className="callout">
      <h2>整体均价上升，但每个单品都在降价</h2>
      <p>
        下表 {common.length} 个共同商品的成交单价全部低于基期（左半，变化率均为负），
        但共同商品整体均价由 <strong>{fmtPrice(avg0)}</strong> 升至{' '}
        <strong>{fmtPrice(avg1)}</strong>（<span className="delta-pos">{fmtPct(avgPct)}</span>
        ）。原因是高价商品的销量占比 w 上升——这是<strong>结构效应</strong>，不是涨价。
      </p>

      <div className="mini-bars">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
          }}
          className="simpson-grid"
        >
          <div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
              各共同商品成交单价变化率（全部下降）
            </div>
            {priceChanges.map((c) => (
              <MiniBar
                key={c.name}
                label={c.name}
                pct={c.pct}
                detail={`${fmtPrice(c.p0)} → ${fmtPrice(c.p1)} 元`}
              />
            ))}
          </div>
          <div>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
              共同商品整体均价（Σw·p，反而上升）
            </div>
            <MiniBar
              label="整体加权均价"
              pct={avgPct}
              detail={`${fmtPrice(avg0)} → ${fmtPrice(avg1)} 元/件`}
              emphasize
            />
            <div
              className="table-wrap"
              style={{ marginTop: 14 }}
            >
              <table className="data" style={{ fontSize: 12 }}>
                <thead>
                  <tr>
                    <th className="text">商品</th>
                    <th>基期占比 w₀</th>
                    <th>当期占比 w₁</th>
                    <th>占比变化</th>
                  </tr>
                </thead>
                <tbody>
                  {priceChanges.map((c) => (
                    <tr key={c.name}>
                      <td className="text" style={{ whiteSpace: 'normal', minWidth: 120 }}>
                        {c.name}
                      </td>
                      <td>{(c.w0 * 100).toFixed(1)}%</td>
                      <td>{(c.w1 * 100).toFixed(1)}%</td>
                      <td className={c.w1 >= c.w0 ? 'delta-pos' : 'delta-neg'}>
                        {fmtPct(c.w1 - c.w0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, marginTop: 10 }}>
              反事实检验：若结构保持 w₀ 不变、仅套用当期各品单价 p₁，均价为{' '}
              <strong>
                {fmtMoney(
                  priceChanges.reduce((a, c) => a + c.w0 * c.p1, 0),
                  2,
                )}
              </strong>{' '}
              元/件（低于基期 {fmtPrice(avg0)}）；实际升至 {fmtPrice(avg1)} 的差额全部由 w
              的移动解释，即页面中的<strong>商品结构效应</strong>。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MiniBar({
  label,
  pct,
  detail,
  emphasize = false,
}: {
  label: string
  pct: number
  detail: string
  emphasize?: boolean
}) {
  // 零轴在中间，左侧为负，右侧为正；统一量程
  const maxAbs = 0.25
  const clamped = Math.max(-maxAbs, Math.min(maxAbs, pct))
  const widthPct = (Math.abs(clamped) / maxAbs) * 50
  const positive = pct >= 0
  return (
    <div style={{ marginBottom: 9 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12,
          marginBottom: 3,
        }}
      >
        <span style={{ color: emphasize ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {label}
        </span>
        <span className={positive ? 'delta-pos' : 'delta-neg'} style={{ fontWeight: emphasize ? 700 : 600 }}>
          {fmtPct(pct)}
        </span>
      </div>
      <div style={{ position: 'relative', height: 10, background: 'var(--grid)', borderRadius: 5 }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: positive ? '50%' : `${50 - widthPct}%`,
            width: `${widthPct}%`,
            background: positive ? 'var(--pos-fill)' : 'var(--neg)',
            borderRadius: 4,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: -2,
            bottom: -2,
            width: 1.5,
            background: 'var(--baseline)',
          }}
        />
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
        {detail}
      </div>
    </div>
  )
}
