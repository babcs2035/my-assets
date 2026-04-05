"use client";

import type { Provider } from "@prisma/client";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createMainAccount } from "@/actions/accounts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function NewAccountForm({ providers }: { providers: Provider[] }) {
  const router = useRouter();
  const [providerId, setProviderId] = useState<string>("");
  const [accountLabel, setAccountLabel] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateAccount = async () => {
    setIsSubmitting(true);
    try {
      await createMainAccount({
        label: accountLabel,
        providerId,
      });
      toast.success("口座を作成しました", {
        description: accountLabel,
      });
      // 少し遅延させてtoastを表示してからリダイレクト
      setTimeout(() => {
        router.push("/accounts");
        router.refresh();
      }, 500);
    } catch {
      toast.error("口座の作成に失敗しました");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link href="/accounts">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            口座を追加
          </h1>
          <p className="text-sm text-zinc-500">
            登録済みのプロバイダーから口座を追加します
          </p>
        </div>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>口座の設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">プロバイダー</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger id="provider">
                <SelectValue placeholder="プロバイダーを選択してください" />
              </SelectTrigger>
              <SelectContent>
                {providers.length > 0 ? (
                  providers.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.type === "mf" ? "MoneyForward" : "カスタム"})
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-sm text-zinc-500 text-center">
                    設定画面からプロバイダーを登録してください
                  </div>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-zinc-500 mt-1">
              ※ 新しいプロバイダーは設定画面から追加します
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-label">金融機関名</Label>
            <Input
              id="account-label"
              placeholder="例: 住信SBIネット銀行"
              value={accountLabel}
              onChange={e => setAccountLabel(e.target.value)}
            />
            <p className="text-xs text-zinc-500 mt-1">
              ※ MoneyForward に表示される金融機関名と一致させてください
            </p>
          </div>
          <Button
            onClick={handleCreateAccount}
            disabled={!providerId || !accountLabel || isSubmitting}
            className="w-full mt-4"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSubmitting ? "作成中..." : "口座を作成"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
