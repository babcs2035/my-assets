import type { Metadata } from "next";
import { getProviders } from "@/actions/accounts";
import { NewAccountForm } from "@/components/accounts/new-account-form";

export const dynamic = "force-dynamic";

/**
 * 新規口座追加ページメタデータである．
 */
export const metadata: Metadata = {
  title: "新規口座追加 | My Assets",
  description: "新しい口座を登録するページ",
};

export default async function NewAccountPage() {
  const providers = await getProviders();

  return <NewAccountForm providers={providers} />;
}
