import type { AnalysisResult } from '../analysis/types'
import { deltaClass, fmtMoney, fmtSignedMoney } from '../lib/format'

/** 恒等式核对表：把 7 个组件逐项列示并与实际差额对账，展示残差 */
export function ReconcileTable({ result }: { result: AnalysisResult }) {
  const { reconcile } = result
  const grossDelta = result.totalRevenue1 - result.totalRevenue0
  const netDelta = result.totalNetRevenue1 - result.totalNetRevenue0

  return (
    <div className="table-wrap">
      <table className="reconcile">
        <tbody>
          {reconcile.items.map((it) => (
            <tr key={it.key}>
              <td>{it.label}</td>
              <td className={deltaClass(it.amount)} style={{ width: 160 }}>
                {fmtSignedMoney(it.amount, 2)}
              </td>
            </tr>
          ))}
          <tr className="total">
            <td>组件加总（共同三因素 + 新增 − 退出 + 退货 + 调整）</td>
            <td className={deltaClass(netDelta)}>
              {fmtSignedMoney(
                reconcile.items.reduce((a, i) => a + i.amount, 0),
                2,
              )}
            </td>
          </tr>
          <tr>
            <td>实际净收入差（净收入₁ − 净收入₀）</td>
            <td className={deltaClass(netDelta)}>{fmtSignedMoney(netDelta, 2)}</td>
          </tr>
          <tr>
            <td>净口径残差（应为浮点误差量级）</td>
            <td className={Math.abs(reconcile.netResidual) < 1e-6 ? 'muted' : 'delta-neg'}>
              {fmtMoney(reconcile.netResidual, 4)}
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ border: 'none', paddingTop: 10 }}>
              <span className="muted">
                正向销售口径：共同三因素 + 新增 − 退出 ={' '}
                {fmtSignedMoney(reconcile.sumComponents, 2)}，实际正向销售差 ={' '}
                {fmtSignedMoney(grossDelta, 2)}，残差{' '}
                <span
                  className={
                    Math.abs(reconcile.residual) < 1e-6 ? 'muted' : 'delta-neg'
                  }
                >
                  {fmtMoney(reconcile.residual, 4)}
                </span>
                ；共同商品实际收入差 {fmtSignedMoney(reconcile.commonActualDelta, 2)} 与三因素加总严格相等。
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
