"use client";

import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createMainAccount, createProvider } from "@/actions/accounts";
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

export default function NewAccountPage() {
  const router = useRouter();
  const [step, setStep] = useState<"provider" | "account">("provider");
  const [providerName, setProviderName] = useState("");
  const [providerType, setProviderType] = useState<string>("mf");
  const [providerId, setProviderId] = useState<string>("");
  const [accountLabel, setAccountLabel] = useState("");
  const [mfUrlId, setMfUrlId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreateProvider = async () => {
    setIsSubmitting(true);
    try {
      const provider = await createProvider({
        name: providerName,
        type: providerType as "mf" | "custom",
      });
      setProviderId(provider.id);
      setStep("account");
      toast.success("プロバイダーを作成しました", {
        description: providerName,
      });
    } catch {
      toast.error("プロバイダーの作成に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async () => {
    setIsSubmitting(true);
    try {
      await createMainAccount({
        label: accountLabel,
        providerId,
        mfUrlId: mfUrlId || undefined,
      });
      toast.success("口座を作成しました", {
        description: accountLabel,
      });
      router.push("/accounts");
    } catch {
      toast.error("口座の作成に失敗しました");
    } finally {
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
            新しい金融機関と口座を登録します
          </p>
        </div>
      </div>

      {step === "provider" && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Step 1: プロバイダー設定</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider-name">
                プロバイダー名（1Password アイテム名）
              </Label>
              <Input
                id="provider-name"
                placeholder="例: MF_Main"
                value={providerName}
                onChange={e => setProviderName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-type">タイプ</Label>
              <Select value={providerType} onValueChange={setProviderType}>
                <SelectTrigger id="provider-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mf">MoneyForward</SelectItem>
                  <SelectItem value="custom">カスタム</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleCreateProvider}
              disabled={!providerName || isSubmitting}
              className="w-full"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSubmitting ? "作成中..." : "プロバイダーを作成して次へ"}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === "account" && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Step 2: 口座情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="account-label">金融機関名</Label>
              <Input
                id="account-label"
                placeholder="例: 住信SBIネット銀行"
                value={accountLabel}
                onChange={e => setAccountLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mf-url-id">MF URL ID（オプション）</Label>
              <Input
                id="mf-url-id"
                placeholder="URL から抽出した内部 ID"
                value={mfUrlId}
                onChange={e => setMfUrlId(e.target.value)}
              />
            </div>
            <Button
              onClick={handleCreateAccount}
              disabled={!accountLabel || isSubmitting}
              className="w-full"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSubmitting ? "作成中..." : "口座を作成"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
