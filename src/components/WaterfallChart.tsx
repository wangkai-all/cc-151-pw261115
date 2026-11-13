import { useMemo, useState } from 'react'
import { fmtSignedMoney } from '../lib/format'

export interface WaterfallItem {
  key: string
  label: string
  /** 增量项为带符号贡献；total 项为绝对值（基期/期末总额） */
  value: number
  kind: 'total' | 'pos' | 'neg'
  /** 悬浮提示补充行 */
  hint?: string
}

interface Props {
  items: WaterfallItem[]
  /** 颜色变量名，对应 CSS 自定义属性 */
  colors: { total: string; pos: string; neg: string }
  height?: number
  valueSuffix?: string
}

interface BarGeom {
  x: number
  y: number
  w: number
  h: number
  item: WaterfallItem
  start: number
  end: number
  connectorY?: number
}

/**
 * 瀑布图：total 项从基线起柱；增量项为悬浮柱，虚线连接前后累计值。
 * 纯 SVG 实现，直接标注数值，悬浮显示明细。
 */
export function WaterfallChart({ items, colors, height = 300 }: Props) {
  const [hover, setHover] = useState<number | null>(null)

  const geom = useMemo(() => {
    const W = 960
    const H = height
    const padL = 56
    const padR = 16
    const padT = 24
    const padB = 64
    const plotW = W - padL - padR
    const plotH = H - padT - padB

    // 累计骨架
    let cum = 0
    const skeleton = items.map((it) => {
      if (it.kind === 'total') {
        const start = 0
        const end = it.value
        cum = it.value
        return { item: it, start, end, cumAfter: cum }
      }
      const start = cum
      const end = cum + it.value
      cum = end
      return { item: it, start, end, cumAfter: cum }
    })

    const allVals = skeleton.flatMap((s) => [s.start, s.end])
    const minV = Math.min(0, ...allVals)
    const maxV = Math.max(0, ...allVals)
    const span = maxV - minV || 1
    const y = (v: number) => padT + ((maxV - v) / span) * plotH
    const zeroY = y(0)

    const n = items.length
    const slot = plotW / n
    const barW = Math.min(64, slot * 0.62)

    const bars: BarGeom[] = skeleton.map((s, i) => {
      const x = padL + slot * i + (slot - barW) / 2
      const yTop = y(Math.max(s.start, s.end))
      const yBot = y(Math.min(s.start, s.end))
      return {
        x,
        w: barW,
        y: yTop,
        h: Math.max(2, yBot - yTop),
        item: s.item,
        start: s.start,
        end: s.end,
        connectorY: i < n - 1 ? y(s.cumAfter) : undefined,
      }
    })

    // y 轴刻度（4 条网格线）
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => minV + t * span)

    return { W, H, padL, padR, slot, y, zeroY, bars, ticks }
  }, [items, height])

  const colorOf = (kind: WaterfallItem['kind']) =>
    `var(--${colors[kind]})`

  return (
    <div style={{ position: 'relative' }}>
      <svg
        className="waterfall"
        viewBox={`0 0 ${geom.W} ${geom.H}`}
        role="img"
        aria-label="收入变动瀑布图"
        onMouseLeave={() => setHover(null)}
      >
        {/* 网格与 y 轴刻度 */}
        {geom.ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={geom.padL}
              x2={geom.W - geom.padR}
              y1={geom.y(t)}
              y2={geom.y(t)}
              stroke="var(--grid)"
              strokeWidth={1}
            />
            <text
              x={geom.padL - 8}
              y={geom.y(t) + 4}
              textAnchor="end"
              className="bar-label"
            >
              {Math.round(t / 1000)}k
            </text>
          </g>
        ))}
        {/* 零基线 */}
        <line
          x1={geom.padL}
          x2={geom.W - geom.padR}
          y1={geom.zeroY}
          y2={geom.zeroY}
          className="axis-line"
        />

        {geom.bars.map((b, i) => (
          <g
            key={b.item.key}
            onMouseEnter={() => setHover(i)}
            style={{ cursor: 'pointer' }}
          >
            {/* 命中区比柱更宽 */}
            <rect
              x={b.x - 6}
              y={0}
              width={b.w + 12}
              height={geom.H}
              fill="transparent"
            />
            {i < geom.bars.length - 1 && b.connectorY !== undefined && (
              <line
                x1={b.x + b.w}
                x2={b.x + geom.slot + (geom.slot - b.w) / 2 + 6}
                y1={b.connectorY}
                y2={b.connectorY}
                className="connector"
              />
            )}
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={4}
              fill={colorOf(b.item.kind)}
              stroke={hover === i ? 'var(--text-primary)' : 'transparent'}
              strokeWidth={1.5}
            />
            <text
              x={b.x + b.w / 2}
              y={b.item.kind === 'total' ? b.y - 7 : b.y - 7}
              textAnchor="middle"
              className="bar-value"
              fill={b.item.kind === 'neg' ? 'var(--neg)' : 'var(--text-primary)'}
            >
              {b.item.kind === 'total'
                ? Math.round(b.item.value).toLocaleString('zh-CN')
                : fmtSignedMoney(Math.round(b.item.value))}
            </text>
            <text
              x={b.x + b.w / 2}
              y={geom.H - 40}
              textAnchor="middle"
              className="bar-label"
            >
              {b.item.label.length > 8
                ? b.item.label.slice(0, 7) + '…'
                : b.item.label}
            </text>
          </g>
        ))}
      </svg>

      {hover !== null && (
        <Tooltip bar={geom.bars[hover]} />
      )}
    </div>
  )
}

function Tooltip({ bar }: { bar: BarGeom }) {
  // 粗略位置（按 viewBox 比例换算为百分比）
  const leftPct = (bar.x + bar.w / 2) / 960 * 100
  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPct}%`,
        top: 8,
        transform: 'translateX(-50%)',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
        padding: '10px 12px',
        minWidth: 190,
        pointerEvents: 'none',
        zIndex: 10,
      }}
    >
      <div style={{ fontWeight: 650, marginBottom: 4 }}>{bar.item.label}</div>
      {bar.item.kind === 'total' ? (
        <div className="nowrap">总额：{bar.item.value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 元</div>
      ) : (
        <>
          <div className="nowrap">
            贡献：
            <span style={{ color: bar.item.value >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 650 }}>
              {fmtSignedMoney(bar.item.value, 0)}
            </span>{' '}
            元
          </div>
          <div className="nowrap muted" style={{ fontSize: 12 }}>
            累计 {bar.end.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 元
          </div>
        </>
      )}
      {bar.item.hint && (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {bar.item.hint}
        </div>
      )}
    </div>
  )
}
