import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

console.log("Current working directory:", process.cwd());
console.log("DATABASE_URL:", process.env.DATABASE_URL); // keep log

const connectionString = `${process.env.DATABASE_URL}`;

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // 1. デフォルトカテゴリの作成
  const categoryData = [
    {
      name: "食費",
      subs: ["食料品", "外食", "カフェ", "デリバリー"],
    },
    {
      name: "日用品",
      subs: ["生活雑貨", "医薬品", "衛生用品"],
    },
    {
      name: "住居",
      subs: ["家賃", "水道光熱費", "通信費", "修繕費"],
    },
    {
      name: "交通",
      subs: ["電車・バス", "タクシー", "ガソリン", "駐車場"],
    },
    {
      name: "趣味・娯楽",
      subs: ["書籍", "映画・音楽", "ゲーム", "旅行"],
    },
    {
      name: "衣服・美容",
      subs: ["衣類", "クリーニング", "美容院"],
    },
    {
      name: "医療・保険",
      subs: ["医療費", "保険料", "薬代"],
    },
    {
      name: "教育・教養",
      subs: ["学費", "書籍・教材", "セミナー"],
    },
    {
      name: "収入",
      subs: ["給与", "副業", "配当", "利息", "ポイント"],
    },
    {
      name: "その他",
      subs: ["手数料", "税金", "寄付", "雑費"],
    },
  ];

  for (const cat of categoryData) {
    const mainCategory = await prisma.mainCategory.upsert({
      where: { name: cat.name },
      update: {},
      create: { name: cat.name },
    });

    for (const sub of cat.subs) {
      await prisma.subCategoryItem.upsert({
        where: {
          mainCategoryId_name: {
            mainCategoryId: mainCategory.id,
            name: sub,
          },
        },
        update: {},
        create: {
          name: sub,
          mainCategoryId: mainCategory.id,
        },
      });
    }
  }

  console.log("✅ Categories seeded");

  // 2. デフォルト Provider（手動）の作成
  await prisma.provider.upsert({
    where: { name: "manual" },
    update: {},
    create: {
      name: "manual",
      type: "manual",
      isActive: true,
    },
  });

  console.log("✅ Default provider seeded");
  console.log("🎉 Seeding complete!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
