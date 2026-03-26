import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AcceptanceRecord = {
  id: string;
  guest_id?: string | null;
  room_id?: string | null;
  contract_lang: string;
  accepted_at: string;
};

type PrinterSettings = {
  enabled: boolean;
  email: string;
  print_type: "all" | "new_only" | "checkin_only";
};

function isMissingTableError(error: { code?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || error.status === 404;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const CONTRACT_TEMPLATE_HTML = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Valoria Sozlesme</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        color: #0f172a;
        margin: 28px;
      }
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 2px solid #1a365d;
        padding-bottom: 10px;
        margin-bottom: 20px;
      }
      .logo {
        font-size: 20px;
        font-weight: 700;
        color: #1a365d;
      }
      .meta {
        font-size: 12px;
        color: #475569;
        text-align: right;
      }
      .section-title {
        font-size: 15px;
        font-weight: 700;
        margin-top: 16px;
        margin-bottom: 8px;
      }
      .card {
        border: 1px solid #cbd5e1;
        border-radius: 10px;
        padding: 12px;
        margin-bottom: 12px;
        background: #f8fafc;
      }
      .line {
        margin-bottom: 4px;
        font-size: 13px;
      }
      .contract {
        white-space: pre-wrap;
        font-size: 13px;
        line-height: 1.5;
      }
      .signature {
        margin-top: 26px;
        display: flex;
        justify-content: space-between;
        gap: 18px;
      }
      .sign-box {
        flex: 1;
        border-top: 1px solid #0f172a;
        padding-top: 8px;
        font-size: 12px;
        min-height: 80px;
      }
      .foot {
        margin-top: 24px;
        font-size: 11px;
        color: #334155;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="logo">VALORIA HOTEL</div>
      <div class="meta">
        Oda: {{room_number}}<br />
        Dil: {{contract_lang}}<br />
        Onay: {{accepted_at}}
      </div>
    </div>

    <div class="section-title">Misafir Bilgileri</div>
    <div class="card">
      <div class="line"><strong>Ad Soyad:</strong> {{guest_name}}</div>
      <div class="line"><strong>Oda Numarasi:</strong> {{room_number}}</div>
      <div class="line"><strong>Onay Tarihi:</strong> {{accepted_at}}</div>
    </div>

    <div class="section-title">Sozlesme Metni</div>
    <div class="card contract">{{contract_content}}</div>

    <div class="signature">
      <div class="sign-box">Misafir Imza</div>
      <div class="sign-box">Yetkili Imza</div>
    </div>

    <div class="foot">
      T.C. Hazine ve Maliye Bakanligi duzenlemeleri kapsaminda kayit altina alinmistir.
    </div>
  </body>
</html>`;

async function resolvePrinterSettings(
  supabase: ReturnType<typeof createClient>,
): Promise<PrinterSettings> {
  let { data, error } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "printer")
    .order("updated_at", { ascending: false })
    .limit(1);

  if (isMissingTableError(error as any)) {
    const fallback = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "printer")
      .order("updated_at", { ascending: false })
      .limit(1);
    data = fallback.data as any;
    error = fallback.error as any;
  }

  if (error) {
    throw new Error(`Printer ayarlari okunamadi: ${error.message}`);
  }

  const value = (data?.[0]?.value ?? {}) as Partial<PrinterSettings>;
  return {
    enabled: value.enabled !== false,
    email: (value.email ?? "536w8897jy@hpeprint.com").trim(),
    print_type: (value.print_type as PrinterSettings["print_type"]) ?? "all",
  };
}

async function buildContractHtml(
  supabase: ReturnType<typeof createClient>,
  record: AcceptanceRecord,
): Promise<{ html: string; guestName: string; roomNumber: string }> {
  const [guestRes, roomRes, contractRes] = await Promise.all([
    record.guest_id
      ? supabase.from("guests").select("full_name, status").eq("id", record.guest_id).maybeSingle()
      : Promise.resolve({ data: null }),
    record.room_id
      ? supabase.from("rooms").select("room_number").eq("id", record.room_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("contract_templates")
      .select("content")
      .eq("lang", record.contract_lang)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const guestName = guestRes.data?.full_name?.trim() || "Misafir";
  const roomNumber = roomRes.data?.room_number?.trim() || "-";
  const acceptedAt = new Date(record.accepted_at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" });
  const contractContent = contractRes.data?.content?.trim() || "Sozlesme metni bulunamadi.";

  const html = CONTRACT_TEMPLATE_HTML
    .replaceAll("{{guest_name}}", escapeHtml(guestName))
    .replaceAll("{{room_number}}", escapeHtml(roomNumber))
    .replaceAll("{{contract_lang}}", escapeHtml(record.contract_lang))
    .replaceAll("{{accepted_at}}", escapeHtml(acceptedAt))
    .replaceAll("{{contract_content}}", escapeHtml(contractContent));

  return { html, guestName, roomNumber };
}

async function generatePdfFromHtml(html: string): Promise<Uint8Array> {
  const apiKey = Deno.env.get("PDFSHIFT_API_KEY");
  if (!apiKey) {
    throw new Error("PDFSHIFT_API_KEY tanimli degil");
  }

  const res = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source: html,
      landscape: false,
      use_print: false,
      sandbox: false,
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`PDF olusturulamadi: ${res.status} ${detail}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function sendEmailWithAttachment(opts: {
  to: string;
  subject: string;
  pdfBytes: Uint8Array;
}) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("PRINTER_FROM_EMAIL") || "Valoria <onboarding@resend.dev>";
  if (!resendApiKey) throw new Error("RESEND_API_KEY tanimli degil");

  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < opts.pdfBytes.length; i += chunkSize) {
    const chunk = opts.pdfBytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const contentBase64 = btoa(binary);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      html: "<p>Sozlesme otomatik olarak olusturulmus ve ektedir.</p>",
      attachments: [{ filename: "sozlesme.pdf", content: contentBase64 }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`E-posta gonderilemedi: ${res.status} ${detail}`);
  }
}

async function insertPrinterLog(
  supabase: ReturnType<typeof createClient>,
  contractId: string | null,
  status: "success" | "failed" | "skipped",
  errorMessage?: string,
) {
  try {
    await supabase.from("printer_logs").insert({
      contract_id: contractId,
      sent_at: new Date().toISOString(),
      status,
      error_message: errorMessage ?? null,
    });
  } catch {
    // Log yazimi ana akisi bozmamali.
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const record = (body?.record ?? body) as AcceptanceRecord;
    const eventType = (body?.type ?? "INSERT") as string;
    const isTest = body?.test === true;
    if (!record?.id) throw new Error("record.id bulunamadi");

    const printer = await resolvePrinterSettings(supabase);
    if (!printer.enabled) {
      await insertPrinterLog(supabase, isTest ? null : record.id, "skipped", "Yazdirma ayari kapali");
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!isTest && eventType !== "INSERT") {
      await insertPrinterLog(supabase, isTest ? null : record.id, "skipped", `Desteklenmeyen event: ${eventType}`);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: guestRow } = record.guest_id
      ? await supabase.from("guests").select("status").eq("id", record.guest_id).maybeSingle()
      : { data: null };
    if (printer.print_type === "checkin_only" && guestRow?.status !== "checked_in") {
      await insertPrinterLog(supabase, isTest ? null : record.id, "skipped", "Sadece check-in secili");
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Test butonu yalnizca akisin ayakta oldugunu kontrol etsin; dis servis cagrisi yapmasin.
    if (isTest) {
      await insertPrinterLog(supabase, null, "skipped", "Test pingi basarili");
      return new Response(JSON.stringify({ ok: true, test: true }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const hasPdfShiftKey = !!Deno.env.get("PDFSHIFT_API_KEY");
    const hasResendKey = !!Deno.env.get("RESEND_API_KEY");
    if (!hasPdfShiftKey || !hasResendKey) {
      await insertPrinterLog(
        supabase,
        record.id,
        "skipped",
        "PDFSHIFT_API_KEY/RESEND_API_KEY eksik oldugu icin gonderim yapilmadi",
      );
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
        }),
        {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    const { html, guestName, roomNumber } = await buildContractHtml(supabase, record);
    const pdf = await generatePdfFromHtml(html);
    const subject = `Valoria Sozlesme - Oda ${roomNumber} - ${guestName}`;
    await sendEmailWithAttachment({
      to: printer.email,
      subject,
      pdfBytes: pdf,
    });

    await insertPrinterLog(supabase, isTest ? null : record.id, "success");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Beklenmeyen hata";
    try {
      const body = await req.clone().json();
      await insertPrinterLog(supabase, body?.test ? null : body?.record?.id ?? null, "failed", message);
    } catch {
      // no-op
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
