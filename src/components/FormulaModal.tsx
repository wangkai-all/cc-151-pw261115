import type { ReactNode } from 'react'
import type { FactorEffect } from '../analysis/types'
import type { FactorKey } from '../analysis/decompose'
import { ALL_ORDERS } from '../analysis/decompose'
import { fmtMoney, fmtPrice, fmtQty, fmtSignedMoney } from '../lib/format'

interface FactorModalProps {
  effect: FactorEffect
  scopeTitle: string
  /** 两期总量/结构/价格的输入值说明行 */
  inputs: { label: string; v0: string; v1: string }[]
  onClose: () => void
}

const FACTOR_FORMULA: Record<FactorKey, string> = {
  volume: 'ΔR_销量效应 = 平均边际[ Q × Σ w × p 中，仅把总销量 Q 由 Q₀ 替换为 Q₁ ]',
  mix: 'ΔR_结构效应 = 平均边际[ Q × Σ w × p 中，仅把结构向量 w 由 w₀ 替换为 w₁ ]',
  price: 'ΔR_价格效应 = 平均边际[ Q × Σ w × p 中，仅把价格向量 p 由 p₀ 替换为 p₁ ]',
}

/** 贡献值点击后的公式抽屉：数量/均价输入 + 6 顺序边际 + Shapley 平均 */
export function FormulaModal({ effect, scopeTitle, inputs, onClose }: FactorModalProps) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${effect.label}贡献公式`}
    >
      <div className="modal">
        <button className="close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
        <h2>
          {effect.label}效应 · 贡献 {fmtSignedMoney(effect.contribution, 2)} 元
        </h2>
        <div className="modal-sub">{scopeTitle} · 全排列平均边际贡献（Shapley 值）</div>

        <h3 style={{ margin: '14px 0 6px' }}>参与计算的输入值</h3>
        <div className="formula-box">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', color: 'var(--text-muted)' }}>输入</th>
                <th style={{ textAlign: 'right', color: 'var(--text-muted)' }}>基期 (t=0)</th>
                <th style={{ textAlign: 'right', color: 'var(--text-muted)' }}>当期 (t=1)</th>
              </tr>
            </thead>
            <tbody>
              {inputs.map((r) => (
                <tr key={r.label}>
                  <td style={{ textAlign: 'left' }}>{r.label}</td>
                  <td style={{ textAlign: 'right' }}>{r.v0}</td>
                  <td style={{ textAlign: 'right' }}>{r.v1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 style={{ margin: '14px 0 6px' }}>计算公式</h3>
        <div className="formula-box">
          <div className="formula">
            <span className="dim">收入恒等式：</span>R<sub>t</sub> = Q<sub>t</sub> × Σ<sub>i</sub> w
            <sub>i,t</sub> × p<sub>i,t</sub>
          </div>
          <div className="formula">
            <span className="dim">其中：</span>Q = 总销量，w<sub>i</sub> = q<sub>i</sub>/Q = 销量占比，p
            <sub>i</sub> = 销售额/销量 = 成交均价
          </div>
          <div className="formula" style={{ marginTop: 6 }}>{FACTOR_FORMULA[effect.factor]}</div>
          <div className="formula">
            <span className="dim">Shapley 平均：</span>
            贡献 = (1/3!) × Σ<sub>6 种顺序</sub> 该因素在该顺序下的边际贡献
          </div>
        </div>

        <h3 style={{ margin: '14px 0 6px' }}>
          3! = 6 种替换顺序下的边际贡献（消除人为顺序影响）
        </h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="text">替换顺序（基期→当期）</th>
                <th>本因素边际贡献（元）</th>
              </tr>
            </thead>
            <tbody>
              {effect.orderMarginals.map((m, i) => (
                <tr key={i}>
                  <td className="text">
                    {ALL_ORDERS[i] && (
                      <span className="muted">第 {i + 1} 序：</span>
                    )}
                    {m.order.join(' → ')}
                  </td>
                  <td className={m.marginal >= 0 ? 'delta-pos' : 'delta-neg'}>
                    {fmtSignedMoney(m.marginal, 2)}
                  </td>
                </tr>
              ))}
              <tr className="total">
                <td className="text" style={{ fontWeight: 700 }}>
                  算术平均 = Shapley 贡献
                </td>
                <td style={{ fontWeight: 700 }}>{fmtSignedMoney(effect.contribution, 2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export interface ProductModalInput {
  productName: string
  effect: FactorEffect
  qty0: number
  qty1: number
  price0: number | null
  price1: number | null
}

/** 逐商品的公式弹窗（单商品结构 w≡1，结构效应为 0） */
export function ProductFormulaModal({ input, onClose }: { input: ProductModalInput; onClose: () => void }) {
  const { effect, productName, qty0, qty1, price0, price1 } = input
  return (
    <FormulaModal
      effect={effect}
      scopeTitle={`商品：${productName}`}
      onClose={onClose}
      inputs={[
        { label: '销量 q（件）', v0: fmtQty(qty0), v1: fmtQty(qty1) },
        { label: '销量占比 w', v0: '100.0%', v1: '100.0%（单商品恒为 1）' },
        { label: '成交均价 p（元/件）', v0: fmtPrice(price0), v1: fmtPrice(price1) },
        {
          label: '收入 R = q × p（元）',
          v0: fmtMoney(qty0 * (price0 ?? 0), 2),
          v1: fmtMoney(qty1 * (price1 ?? 0), 2),
        },
      ]}
    />
  )
}

export function InfoModal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal">
        <button className="close" onClick={onClose} aria-label="关闭">
          ✕
        </button>
        <h2>{title}</h2>
        <div style={{ marginTop: 10 }}>{children}</div>
      </div>
    </div>
  )
}
