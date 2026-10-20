"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAdminAuth } from "@/components/admin/AdminAuthContext";
import { QuotationBuilder } from "@/components/admin/QuotationBuilder";
import { internalFetch, type ApiJson } from "@/lib/internal/access";
import type { CustomQuotationDTO } from "@/lib/customQuotation/types";

/** Edit a quotation: opens the form pre-filled; saving adds a new version. */
export default function EditCustomQuotationPage() {
  const { onUnauthorized } = useAdminAuth();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [quotation, setQuotation] = useState<CustomQuotationDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await internalFetch("ADMIN", `/api/admin/custom-quotes/${id}`);
        if (res.status === 401) return onUnauthorized();
        const data = (await res.json()) as ApiJson<{ quotation?: CustomQuotationDTO }>;
        if (!res.ok || !data.quotation) return setError(data?.error ?? "Could not load the quotation.");
        // Only the latest version can be edited; send anyone else to it.
        if (!data.quotation.isLatest) {
          const latest = data.quotation.versions?.[data.quotation.versions.length - 1];
          return router.replace(`/admin/custom-quotes/${latest?.id ?? id}/edit`);
        }
        setQuotation(data.quotation);
      } catch {
        setError("Network error. Please try again.");
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <main className="min-h-dvh bg-stone-50 px-4 py-4 sm:px-8 sm:py-6">
      <div className="mx-auto max-w-4xl">
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        {!quotation && !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-stone-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {quotation && (
          <QuotationBuilder
            editing={quotation}
            onUnauthorized={onUnauthorized}
            onCancel={() => router.push(`/admin/custom-quotes/${quotation.id}`)}
          />
        )}
      </div>
    </main>
  );
}
