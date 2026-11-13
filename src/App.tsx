import { useEffect, useMemo, useState } from 'react'
import { analyze, listDimensions, type FactorKey } from './analysis/decompose'
import type { FactorEffect, ProductDetail, SalesFact } from './analysis/types'
import { buildSampleFacts, PERIODS, STORES, CATEGORIES, SIMPSON_NOTE } from './analysis/sampleData'
import { WaterfallChart, type WaterfallItem } from './components/WaterfallChart'
import { ProductTable } from './components/ProductTable'
import { ReconcileTable } from './components/ReconcileTable'
import { SimpsonPanel } from './components/SimpsonPanel'
import { FormulaModal, ProductFormulaModal, InfoModal } from './components/FormulaModal'
import {
  deltaClass,
  exportProductCsv,
  fmtMoney,
  fmtPct,
  fmtPrice,
  fmtQty,
  fmtSignedMoney,
} from './lib/format'

const FACTS: SalesFact[] = buildSampleFacts()

type ModalState =
  | { kind: 'factor'; effect: FactorEffect; inputs: { label: string; v0: string; v1: string }[]; scope: string }
  | { kind: 'product'; detail: ProductDetail; factor: FactorKey }
  | { kind: 'method' }
  | null

export default function App() {
  const dims = useMemo(() => listDimensions(FACTS), [])
  const [period0, setPeriod0] = useState<string>(PERIODS[0].id)
  const [period1, setPeriod1] = useState<string>(PERIODS[1].id)
  const [stores, setStores] = useState<string[] | null>(null)
  const [categories, setCategories] = useState<string[] | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () =>
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') as
        | 'light'
        | 'dark',
  )

  // 主题属性挂到 :root，与 CSS 的 :root[data-theme] 选择器对应
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // 筛选变化后从原始事实重新聚合；禁止跨不兼容分组相加
  const result = useMemo(
    () => analyze(FACTS, period0, period1, { stores, categories }),
    [period0, period1, stores, categories],
  )

  const toggleSet = (
    value: string,
    current: string[] | null,
    all: string[],
    setter: (v: string[] | null) => void,
  ) => {
    const selected = current ?? [...all]
    const next = selected.includes(value)
      ? selected.filter((x) => x !== value)
      : [...selected, value]
    setter(next.length === all.length ? null : next)
  }

  const waterfallItems: WaterfallItem[] = useMemo(() => {
    const e = result.common.effects
    return [
      { key: 'base', label: '基期正向销售额', value: result.totalRevenue0, kind: 'total' },
      { key: 'volume', label: '总销量效应', value: e.volume.contribution, kind: e.volume.contribution >= 0 ? 'pos' : 'neg' },
      { key: 'mix', label: '商品结构效应', value: e.mix.contribution, kind: e.mix.contribution >= 0 ? 'pos' : 'neg' },
      { key: 'price', label: '单品价格效应', value: e.price.contribution, kind: e.price.contribution >= 0 ? 'pos' : 'neg' },
      { key: 'new', label: '新增商品', value: result.newRevenue, kind: 'pos' },
      { key: 'exited', label: '退出商品', value: -result.exitedRevenue, kind: 'neg' },
      { key: 'end', label: '当期正向销售额', value: result.totalRevenue1, kind: 'total' },
    ]
  }, [result])

  const openTotalFactor = (factor: FactorKey) => {
    const e = result.common.effects[factor]
    const c0 = result.common
    const inputs =
      factor === 'volume'
        ? [
            { label: '共同商品总销量 Q（件）', v0: fmtQty(c0.qty0), v1: fmtQty(c0.qty1) },
            { label: '结构向量 w（各品销量占比）', v0: 'w₀（见逐商品表）', v1: 'w₁（见逐商品表）' },
            { label: '价格向量 p（各品成交均价）', v0: 'p₀（见逐商品表）', v1: 'p₁（见逐商品表）' },
          ]
        : factor === 'mix'
          ? [
              { label: '总销量 Q（件）', v0: fmtQty(c0.qty0), v1: fmtQty(c0.qty1) },
              ...result.productDetails
                .filter((d) => d.kind === 'common')
                .map((d) => ({
                  label: `占比 w：${d.productName}`,
                  v0: ((d.qty0 / c0.qty0) * 100).toFixed(2) + '%',
                  v1: ((d.qty1 / c0.qty1) * 100).toFixed(2) + '%',
                })),
            ]
          : [
              { label: '总销量 Q（件）', v0: fmtQty(c0.qty0), v1: fmtQty(c0.qty1) },
              ...result.productDetails
                .filter((d) => d.kind === 'common')
                .map((d) => ({
                  label: `均价 p：${d.productName}（元/件）`,
                  v0: fmtPrice(d.price0),
                  v1: fmtPrice(d.price1),
                })),
            ]
    setModal({ kind: 'factor', effect: e, inputs, scope: `总量级（${result.common.productIds.length} 个共同商品）` })
  }

  const grossDelta = result.totalRevenue1 - result.totalRevenue0
  const netDelta = result.totalNetRevenue1 - result.totalNetRevenue0
  const periodLabel = (id: string) => PERIODS.find((p) => p.id === id)?.label ?? id

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>收入变动因素拆解分析</h1>
          <p className="subtitle">
            三因素全排列平均边际贡献（Shapley）· 总量 → 结构 → 单品逐层下钻 · 数值分解而非因果证明
          </p>
        </div>
        <button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
          {theme === 'light' ? '🌙 深色模式' : '☀️ 浅色模式'}
        </button>
      </header>

      {/* 期间与筛选 */}
      <section className="card">
        <h2>分析期间与范围（筛选后从原始事实重新聚合）</h2>
        <div className="filters">
          <div className="filter-group">
            <div className="label">基期 / 当期选择</div>
            <div className="period-tabs">
              {PERIODS.map((p) => {
                const isBase = period0 === p.id
                const isCur = period1 === p.id
                return (
                  <span key={p.id} className="chips">
                    <button
                      className="chip"
                      aria-pressed={isBase}
                      onClick={() => setPeriod0(p.id)}
                      title="设为基期"
                    >
                      基期：{p.label}
                    </button>
                    <button
                      className="chip"
                      aria-pressed={isCur}
                      onClick={() => setPeriod1(p.id)}
                      title="设为当期"
                    >
                      当期：{p.label}
                    </button>
                  </span>
                )
              })}
            </div>
          </div>
        </div>
        <div className="filters" style={{ marginTop: 14 }}>
          <FilterChips
            title="门店"
            all={dims.stores}
            selected={stores}
            labels={Object.fromEntries(STORES.map((s) => [s.id, s.label]))}
            onToggle={(v) => toggleSet(v, stores, dims.stores, setStores)}
            onReset={() => setStores(null)}
          />
          <FilterChips
            title="品类"
            all={dims.categories}
            selected={categories}
            labels={Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]))}
            onToggle={(v) => toggleSet(v, categories, dims.categories, setCategories)}
            onReset={() => setCategories(null)}
          />
        </div>
        {period0 === period1 && (
          <p className="delta-neg" style={{ marginTop: 10, marginBottom: 0 }}>
            基期与当期不能相同，请选择两个不同期间。
          </p>
        )}
      </section>

      {/* KPI 总览 */}
      <section className="card">
        <h2>
          总额概览 · {periodLabel(period0)} → {periodLabel(period1)}
        </h2>
        <div className="kpi-grid">
          <Kpi label="基期正向销售额" value={fmtMoney(result.totalRevenue0)} sub={`销量 ${fmtQty(result.totalQty0)} 件`} />
          <Kpi label="当期正向销售额" value={fmtMoney(result.totalRevenue1)} sub={`销量 ${fmtQty(result.totalQty1)} 件`} />
          <Kpi
            label="正向销售额变动"
            value={fmtSignedMoney(grossDelta)}
            sub={fmtPct(result.totalRevenue0 ? grossDelta / result.totalRevenue0 : 0)}
            valueClass={deltaClass(grossDelta)}
          />
          <Kpi
            label="净收入变动（含退货/调整）"
            value={fmtSignedMoney(netDelta)}
            sub={`基期 ${fmtMoney(result.totalNetRevenue0)} → 当期 ${fmtMoney(result.totalNetRevenue1)}`}
            valueClass={deltaClass(netDelta)}
          />
          <Kpi
            label="整体成交均价"
            value={`${fmtPrice(result.avgPrice0)} → ${fmtPrice(result.avgPrice1)}`}
            sub={
              result.avgPrice0 && result.avgPrice1
                ? fmtPct(result.avgPrice1 / result.avgPrice0 - 1)
                : ''
            }
            valueClass={
              result.avgPrice0 && result.avgPrice1 && result.avgPrice1 > result.avgPrice0
                ? 'delta-pos'
                : 'delta-neg'
            }
          />
          <Kpi
            label="共同 / 新增 / 退出商品"
            value={`${result.common.productIds.length} / ${result.newProducts.length} / ${result.exitedProducts.length}`}
            sub="新增与退出不参与同品三因素"
          />
        </div>
      </section>

      {/* 结构悖论样本 */}
      <SimpsonPanel result={result} />
      <p className="muted" style={{ fontSize: 12.5, margin: '6px 2px 16px' }}>
        <strong style={{ color: 'var(--text-secondary)' }}>样本说明：</strong>
        {SIMPSON_NOTE.description}
      </p>

      {/* 瀑布图 */}
      <section className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>收入变动瀑布拆解（点击因素贡献值查看公式）</h2>
          <button className="mini-link" onClick={() => setModal({ kind: 'method' })}>
            拆解方法与口径说明
          </button>
        </div>
        <WaterfallChart
          items={waterfallItems}
          colors={{ total: 'total-fill', pos: 'pos-fill', neg: 'neg' }}
        />
        <div className="legend">
          <span><i className="swatch" style={{ background: 'var(--total-fill)' }} />期间总额</span>
          <span><i className="swatch" style={{ background: 'var(--pos-fill)' }} />正向贡献 / 新增</span>
          <span><i className="swatch" style={{ background: 'var(--neg)' }} />负向贡献 / 退出</span>
        </div>
        <h3>共同商品三因素贡献（加总 = 共同商品实际收入差 {fmtSignedMoney(result.reconcile.commonActualDelta, 2)} 元）</h3>
        <div className="kpi-grid">
          {(['volume', 'mix', 'price'] as FactorKey[]).map((f) => {
            const e = result.common.effects[f]
            return (
              <button
                key={f}
                className="kpi"
                style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)', font: 'inherit' }}
                onClick={() => openTotalFactor(f)}
                title="点击查看数量、均价与公式"
              >
                <div className="k-label">{e.label}效应（共同商品）</div>
                <div className={`k-value ${deltaClass(e.contribution)}`}>
                  {fmtSignedMoney(e.contribution)}
                </div>
                <div className="k-sub muted">点击查看 6 顺序边际与公式</div>
              </button>
            )
          })}
        </div>
      </section>

      {/* 逐商品表 */}
      <section className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>
            逐商品明细（{result.productDetails.length} 个）· 点行展开，点贡献值看公式
          </h2>
          <button
            className="primary"
            onClick={() =>
              exportProductCsv(
                result.productDetails.map((d) => ({
                  productId: d.productId,
                  productName: d.productName,
                  category: d.category,
                  kind: d.kind,
                  qty0: d.qty0,
                  qty1: d.qty1,
                  price0: d.price0,
                  price1: d.price1,
                  rev0: d.rev0,
                  rev1: d.rev1,
                  volumeEffect: d.effects?.volume.contribution,
                  mixEffect: d.effects?.mix.contribution,
                  priceEffect: d.effects?.price.contribution,
                  returnAmount0: d.returnAmount0,
                  returnAmount1: d.returnAmount1,
                  adjustmentAmount0: d.adjustmentAmount0,
                  adjustmentAmount1: d.adjustmentAmount1,
                })),
                `收入拆解_${period0}_vs_${period1}${stores ? '_门店筛选' : ''}${categories ? '_品类筛选' : ''}.csv`,
              )
            }
          >
            导出逐商品级 CSV
          </button>
        </div>
        <ProductTable
          result={result}
          onOpenProductFactor={(d, factor) => setModal({ kind: 'product', detail: d, factor })}
        />
      </section>

      {/* 恒等式核对 */}
      <section className="card">
        <h2>恒等式核对（残差应仅为浮点误差）</h2>
        <ReconcileTable result={result} />
        <h3>退货与其他调整（独立核对，不进入三因素）</h3>
        <div className="kpi-grid">
          <Kpi label="退货：基期 → 当期" value={`${fmtMoney(result.returns.period0)} → ${fmtMoney(result.returns.period1)}`} sub={`变动 ${fmtSignedMoney(result.returns.delta)} 元`} />
          <Kpi label="其他调整：基期 → 当期" value={`${fmtMoney(result.adjustments.period0)} → ${fmtMoney(result.adjustments.period1)}`} sub={`变动 ${fmtSignedMoney(result.adjustments.delta)} 元`} />
        </div>
      </section>

      <div className="disclaimer">
        <strong>口径与免责说明：</strong
        >本页结果是对已发生收入差额的<strong>数值分解</strong>——在 R = Q × Σw·p
        恒等式下，把差额按全排列平均边际贡献（Shapley 值）分配给总销量、商品结构、单品价格三个因素。
        它<strong>不构成</strong>对价格或销量为何变化的因果证明；因素间可能相互影响（如调价影响销量），
        分解只回答“差额在数学上各由多少构成”，不回答“为什么”。新增/退出商品因缺少另一期的真实成交单价，
        单独列示且不补零；退货与其他调整独立核对。筛选门店/品类后所有总量与结构均从原始事实重新聚合，
        不把不同分组基准下的因素贡献直接相加。
      </div>

      {/* 弹窗 */}
      {modal?.kind === 'factor' && (
        <FormulaModal
          effect={modal.effect}
          scopeTitle={modal.scope}
          inputs={modal.inputs}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'product' && modal.detail.effects && (
        <ProductFormulaModal
          input={{
            productName: modal.detail.productName,
            effect: modal.detail.effects[modal.factor],
            qty0: modal.detail.qty0,
            qty1: modal.detail.qty1,
            price0: modal.detail.price0,
            price1: modal.detail.price1,
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'method' && <MethodModal onClose={() => setModal(null)} />}
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  valueClass = '',
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="kpi">
      <div className="k-label">{label}</div>
      <div className={`k-value ${valueClass}`}>{value}</div>
      {sub && <div className="k-sub">{sub}</div>}
    </div>
  )
}

function FilterChips({
  title,
  all,
  selected,
  labels,
  onToggle,
  onReset,
}: {
  title: string
  all: string[]
  selected: string[] | null
  labels: Record<string, string>
  onToggle: (v: string) => void
  onReset: () => void
}) {
  const active = selected ?? all
  return (
    <div className="filter-group">
      <div className="label">
        <span>{title}（{active.length}/{all.length}）</span>
        {selected !== null && <button onClick={onReset}>全选</button>}
      </div>
      <div className="chips">
        {all.map((v) => (
          <button
            key={v}
            className="chip"
            aria-pressed={active.includes(v)}
            onClick={() => onToggle(v)}
          >
            {labels[v] ?? v}
          </button>
        ))}
      </div>
    </div>
  )
}

function MethodModal({ onClose }: { onClose: () => void }) {
  return (
    <InfoModal title="拆解方法与口径说明" onClose={onClose}>
      <div className="formula-box">
        <div className="formula">
          <span className="dim">收入恒等式：</span>R<sub>t</sub> = Q<sub>t</sub> × Σ<sub>i</sub> w
          <sub>i,t</sub> × p<sub>i,t</sub>
        </div>
        <div className="formula">Q<sub>t</sub> = Σ<sub>i</sub> q<sub>i,t</sub>（总销量）</div>
        <div className="formula">w<sub>i,t</sub> = q<sub>i,t</sub> / Q<sub>t</sub>（销量占比/商品结构）</div>
        <div className="formula">p<sub>i,t</sub> = 正向销售额 / 销量（成交均价）</div>
      </div>
      <p>
        对总销量 V、结构 M、价格 P 三个因素，枚举 3! = 6 种全部替换顺序。在每个顺序中，依次把一个因素由基期取值替换为当期取值，
        替换前后的收入差即该因素在该顺序下的边际贡献；每个因素取 6 个边际贡献的算术平均，即为其 Shapley 贡献。
        该平均满足可加性（三因素之和严格等于共同商品实际收入差）、对称性（与因素命名/排列无关）、
        虚拟性（某因素两期不变则贡献为 0），从而消除人为选择计算顺序的影响。
      </p>
      <p>
        <strong>口径边界：</strong>仅两期均有正向销售的“共同商品”进入三因素；新增商品（无基期单价）与退出商品（无当期单价）
        单独列示，绝不补零价混入同品涨价。退货与其他调整不满足“量×价”结构，独立核对，只进入净收入恒等式。
        单商品下钻时其结构占比 w≡1，结构效应恒为 0，销量与价格效应之和等于该商品收入差。
      </p>
      <p>
        <strong>筛选：</strong>门店或品类筛选后，总量、占比、均价全部从原始事实在当前范围内重新聚合计算；
        各分组（如各门店）因结构基准不同，其因素贡献不能直接相加得到整体因素贡献——可加的只有原始金额总量。
      </p>
    </InfoModal>
  )
}
