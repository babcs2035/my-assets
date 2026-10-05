// 入金明細を手動で振替にしたとき，相手側の明細も正の金額で作られていた不具合（TX-1，050ad8c で修正）の
// 既存データを直すスクリプトである．両側とも正の振替は一覧の重複排除で両方消え，画面から取り消せない．
// migration にしないのは，prisma migrate deploy がデプロイ時に自動で走り，件数を確かめる前に本番データが変わるためである．
// 既定は対象を表示するだけで，--apply を付けたときだけアプリが作った側（UUID の明細）の金額を負にする．
//
// 使い方: pnpm tsx scripts/repair-manual-transfer-signs.ts [--apply]

// prisma.ts は読み込み時に DATABASE_URL を読むので，それより前に .env を読み込む
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

// markTransactionAsTransfer が作る明細の ID は crypto.randomUUID()，同期で取り込んだ明細は SHA-256 の 16 進である
const GENERATED_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const apply = process.argv.includes("--apply");
  await prisma.$connect();

  // アプリの振替（手動と振替ルール）だけが transferId を持つ．スクレイパーのペアは対象にしない
  const positiveTransfers = await prisma.transaction.findMany({
    where: {
      isTransfer: true,
      transferId: { startsWith: "tf_" },
      amount: { gt: 0 },
    },
    select: {
      id: true,
      subAccountId: true,
      date: true,
      amount: true,
      desc: true,
      transferId: true,
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  const rowsByTransferId = new Map<string, typeof positiveTransfers>();
  for (const row of positiveTransfers) {
    const key = row.transferId as string;
    const rows = rowsByTransferId.get(key);
    if (rows) rows.push(row);
    else rowsByTransferId.set(key, [row]);
  }

  // 両側とも正で，ちょうど片側がアプリの生成した明細のペアだけを直す
  const targets: typeof positiveTransfers = [];
  for (const rows of rowsByTransferId.values()) {
    if (rows.length !== 2) continue;
    const generated = rows.filter(r => GENERATED_ID_PATTERN.test(r.id));
    if (generated.length === 1) targets.push(generated[0]);
  }

  console.log(`両側とも正の手動振替: ${targets.length} 件`);
  for (const t of targets) {
    console.log(
      `  ${t.date.toISOString().slice(0, 10)}  ${t.amount}  ${t.desc}  (id=${t.id}, transferId=${t.transferId})`,
    );
  }

  // TX-2 で二重になった可能性のある明細は自動では直さず，確認用に表示する．
  // 符号を直した後の金額で，振替先に同じ日付・同額の振替でない明細があれば，同期の入金と重複している
  console.log("\n同期の明細と重複している可能性のある生成明細:");
  const generatedTransfers = await prisma.transaction.findMany({
    where: { isTransfer: true, transferId: { startsWith: "tf_" } },
    select: {
      id: true,
      subAccountId: true,
      date: true,
      amount: true,
      desc: true,
    },
  });
  const targetIds = new Set(targets.map(t => t.id));
  let duplicateCount = 0;
  for (const g of generatedTransfers) {
    if (!GENERATED_ID_PATTERN.test(g.id)) continue;
    const amount = targetIds.has(g.id) ? -g.amount : g.amount;
    const synced = await prisma.transaction.findFirst({
      where: {
        subAccountId: g.subAccountId,
        date: g.date,
        amount,
        isTransfer: false,
      },
      select: { id: true },
    });
    if (!synced) continue;
    duplicateCount++;
    console.log(
      `  ${g.date.toISOString().slice(0, 10)}  ${amount}  ${g.desc}  (生成=${g.id}, 同期=${synced.id.slice(0, 12)}…)`,
    );
  }
  console.log(
    `  ${duplicateCount} 件（自動では直さない．取り消してから振替をやり直す）`,
  );

  if (!apply) {
    console.log(
      "\ndry-run のため変更していない．直すには --apply を付けて実行する．",
    );
    return;
  }

  await prisma.$transaction(
    targets.map(t =>
      prisma.transaction.update({
        where: { id: t.id },
        data: { amount: -t.amount },
      }),
    ),
  );
  console.log(`\n${targets.length} 件の生成明細の金額を負にした．`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
