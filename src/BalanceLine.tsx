// BalanceLine.tsx — saldo na conta do provedor (aba API). DeepSeek e OpenRouter
// deixam ler pela API; nos outros, um link abre a página de cobrança do site.
import { invoke } from "@tauri-apps/api/core";
import { useT } from "./i18n/useT";
import type { Balance } from "./types";
import { ArrowOutIcon } from "./ui/icons";

// "Baixo" ≈ menos de 1 dólar (o yuan vale ~1/7 de dólar).
const LOW: Record<string, number> = { USD: 1, CNY: 7 };

export function isLowBalance(b: Balance | null): boolean {
  return b?.kind === "remaining" && b.amount < (LOW[b.currency] ?? 1);
}

export function formatMoney(amount: number, currency: string, localeTag: string): string {
  try {
    return new Intl.NumberFormat(localeTag, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export default function BalanceLine({ balance }: { balance: Balance | null }) {
  const { t, locale } = useT();
  const localeTag = locale === "pt-BR" ? "pt-BR" : "en-US";
  if (!balance) return null;
  if (balance.kind === "unsupported") {
    const url = balance.billing_url;
    if (!url) return null;
    return (
      <p className="balance">
        <button type="button" className="balance-link" onClick={() => { invoke("open_url", { url }).catch(console.error); }}>
          {t("balance.site")} <ArrowOutIcon size={12} />
        </button>
      </p>
    );
  }
  const amount = formatMoney(balance.amount, balance.currency, localeTag);
  if (balance.kind === "used") return <p className="balance">{t("balance.used", { amount })}</p>;
  const low = isLowBalance(balance);
  return (
    <p className={"balance" + (low ? " low" : "")}>
      <span>{t("balance.remaining", { amount })}</span>
      {low && <span className="badge amber">{t("balance.low")}</span>}
    </p>
  );
}
