import { getProviders } from "@/actions/accounts";
import { NewAccountForm } from "@/components/accounts/new-account-form";

export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  const providers = await getProviders();

  return <NewAccountForm providers={providers} />;
}
