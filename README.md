# 账本

两个人（或几个人）一起记账、月底算清谁该给谁多少钱。纯前端，部署在 GitHub Pages；账目以 JSON 存在一个**私有** GitHub 仓库里，每次修改都是一个 commit。

## 功能

- 记一笔：金额支持算式（`86.4+20`），选分类、付款人、日期、备注
- 分摊方式：平分（可勾选参与的人，一键“只算某人”）、按比例、指定金额
- 明细：按日期分组，按分类筛选，点一笔可修改，导出 CSV（Excel 直接打开不乱码）
- 结算：谁付给谁多少、每人实付 / 应担 / 差额、分类占比；可标记本月已结清
- 设置：成员改名 / 添加，分类增删排序，货币符号
- 切回页面时自动拉取对方最新记录；两人同时写入时自动重试合并

## 部署（一次性）

**1. 应用仓库（公开）**

把这个项目推到一个新仓库，比如 `ledger`。然后在仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。推送到 `main` 后会自动跑测试、构建并发布，地址是 `https://<你的用户名>.github.io/ledger/`。

**2. 数据仓库（私有）**

新建一个私有仓库，比如 `ledger-data`，创建时勾选 *Add a README*（空仓库没有分支，没法写入）。

**3. 创建 token**

GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token：

- Repository access：Only select repositories → 只选 `ledger-data`
- Permissions → Repository permissions → **Contents: Read and write**
- 过期时间按需设置，过期后在应用设置里换新的即可

最简单的做法是由数据仓库的所有者建这一个 token，私下发给另一方，两人共用。它只能读写这一个仓库。
如果希望各用各的 token，可以把数据仓库放到一个两人都在的 GitHub organization 下，每人用自己的 fine-grained token 选这个 organization 作为 resource owner。

**4. 在应用里连接**

打开 Pages 地址 → 设置 → 填仓库所有者、仓库名、token → 连接。第一次会让你创建账本（填成员），然后在“我是谁”里选自己。另一个人在自己的手机/电脑上做同样的第 4 步即可。

> token 只存在当前浏览器的 localStorage 里，不会上传到任何地方。换设备需要重新填。公共电脑用完请在设置里点“在这台设备上退出”。

## 数据格式

```
ledger-data/
├── config.json          # 成员、分类、货币符号
└── months/
    ├── 2026-09.json     # 当月所有支出 + 是否已结清
    └── 2026-10.json
```

金额统一以**分**为整数存储。单笔支出：

```json
{
  "id": "…", "date": "2026-09-18", "amount": 10640, "payerId": "a1b2c3d4",
  "category": "买菜", "note": "Costco",
  "split": { "type": "equal", "participants": ["a1b2c3d4", "e5f6g7h8"] },
  "createdBy": "a1b2c3d4", "createdAt": "2026-09-18T20:15:00.000Z"
}
```

`split.type` 可以是 `equal`（participants）、`ratio`（weights，比如 `{a: 6, b: 4}`）或 `exact`（amounts，单位分）。

结算算法：每人差额 = 实付 − 应担；欠款方按金额从大到小依次付给应收方。两人时就是一笔转账，多人时转账次数最少。

## 本地开发

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # 结算与金额解析的单元测试
npm run build
```

## 目录

```
src/
├── App.tsx                  # 页面状态、读写流程
├── lib/
│   ├── github.ts            # GitHub Contents API 读写 + 冲突重试
│   ├── settle.ts            # 分摊、差额、转账计算
│   ├── settle.test.ts
│   ├── money.ts / dates.ts / types.ts
└── components/
    ├── ExpenseForm.tsx      # 记一笔 / 修改
    ├── ExpenseList.tsx      # 明细 + CSV 导出
    ├── Summary.tsx          # 结算
    └── SettingsView.tsx     # 连接、成员、分类
```
