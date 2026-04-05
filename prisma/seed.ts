import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

console.log("Current working directory:", process.cwd());
console.log("DATABASE_URL:", process.env.DATABASE_URL); // keep log

const connectionString = `${process.env.DATABASE_URL}`;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // 既存データのチェック
  const existingCategoryCount = await prisma.mainCategory.count();
  const existingProviderCount = await prisma.provider.count();

  // 1. デフォルトカテゴリの作成（既存データがなければ）
  if (existingCategoryCount > 0) {
    console.log(
      `Categories already exist (${existingCategoryCount} found). Skipping category seeding.`,
    );
  } else {
    const categoryData: {
      name: string;
      type: "EXPENSE" | "INCOME";
      subs: string[];
    }[] = [
      {
        name: "食費",
        type: "EXPENSE",
        subs: ["食料品", "外食", "カフェ", "デリバリー"],
      },
      {
        name: "日用品",
        type: "EXPENSE",
        subs: ["生活雑貨", "医薬品", "衛生用品"],
      },
      {
        name: "住居",
        type: "EXPENSE",
        subs: ["家賃", "水道光熱費", "通信費", "修繕費"],
      },
      {
        name: "交通",
        type: "EXPENSE",
        subs: ["電車・バス", "タクシー", "ガソリン", "駐車場"],
      },
      {
        name: "趣味・娯楽",
        type: "EXPENSE",
        subs: ["書籍", "映画・音楽", "ゲーム", "旅行"],
      },
      {
        name: "衣服・美容",
        type: "EXPENSE",
        subs: ["衣類", "クリーニング", "美容院"],
      },
      {
        name: "医療・保険",
        type: "EXPENSE",
        subs: ["医療費", "保険料", "薬代"],
      },
      {
        name: "教育・教養",
        type: "EXPENSE",
        subs: ["学費", "書籍・教材", "セミナー"],
      },
      {
        name: "収入",
        type: "INCOME",
        subs: ["給与", "副業", "配当", "利息", "ポイント"],
      },
      {
        name: "その他",
        type: "EXPENSE",
        subs: ["手数料", "税金", "寄付", "雑費"],
      },
    ];

    // タイプごとの sortOrder カウンタ
    const sortCounters: Record<string, number> = { EXPENSE: 0, INCOME: 0 };

    for (const cat of categoryData) {
      const order = sortCounters[cat.type]++;
      const mainCategory = await prisma.mainCategory.create({
        data: { name: cat.name, type: cat.type, sortOrder: order },
      });

      let subOrder = 0;
      for (const sub of cat.subs) {
        await prisma.subCategoryItem.create({
          data: {
            name: sub,
            mainCategoryId: mainCategory.id,
            sortOrder: subOrder,
          },
        });
        subOrder++;
      }
    }

    console.log("Categories seeded");
  }

  // 2. デフォルト Provider（カスタム）の作成（既存データがなければ）
  if (existingProviderCount > 0) {
    console.log(
      `Providers already exist (${existingProviderCount} found). Skipping provider seeding.`,
    );
  } else {
    await prisma.provider.create({
      data: {
        name: "manual",
        type: "custom",
        isActive: true,
      },
    });

    console.log("Default provider seeded");
  }

  console.log("Seeding complete!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
