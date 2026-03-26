// Valoria Hotel - Sohbet mesajı sonrası alıcılara push bildirimi gönderir
// Kullanım: POST { conversationId, excludeAppToken?, excludeStaffId?, title, body, data? }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  conversationId: string;
  excludeAppToken?: string | null;
  excludeStaffId?: string | null;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
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
    const body = (await req.json()) as Body;
    const { conversationId, excludeAppToken, excludeStaffId, title, body: messageBody, data = {} } = body;
    if (!conversationId || !title?.trim()) {
      return new Response(
        JSON.stringify({ error: "conversationId ve title gerekli" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    let excludeGuestId: string | null = null;
    if (excludeAppToken) {
      const { data: guestRow } = await supabase
        .from("guests")
        .select("id")
        .eq("app_token", excludeAppToken)
        .maybeSingle();
      excludeGuestId = (guestRow as { id: string } | null)?.id ?? null;
    }

    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("participant_id, participant_type")
      .eq("conversation_id", conversationId)
      .is("left_at", null);

    const guestIds: string[] = [];
    const staffIds: string[] = [];
    for (const p of participants ?? []) {
      const row = p as { participant_id: string; participant_type: string };
      if (row.participant_type === "guest") {
        if (excludeGuestId && row.participant_id === excludeGuestId) continue;
        guestIds.push(row.participant_id);
      } else if (row.participant_type === "staff" || row.participant_type === "admin") {
        if (excludeStaffId && row.participant_id === excludeStaffId) continue;
        staffIds.push(row.participant_id);
      }
    }

    if (guestIds.length === 0 && staffIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "Bildirilecek alıcı yok" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const titleTrim = title.trim();
    const bodyTrim = messageBody?.trim() ?? null;
    const payload = { ...data, screen: "messages" };

    // Bildirimlerim sayfasında görünsün: staff/admin alıcılarına notifications tablosuna insert
    if (staffIds.length > 0) {
      const rows = staffIds.map((sid) => ({
        staff_id: sid,
        guest_id: null,
        title: titleTrim,
        body: bodyTrim,
        category: "guest",
        notification_type: "message",
        data: payload,
        sent_via: "both",
        sent_at: new Date().toISOString(),
      }));
      await supabase.from("notifications").insert(rows);
    }

    const tokens: string[] = [];
    if (guestIds.length > 0) {
      const { data: rows } = await supabase
        .from("push_tokens")
        .select("token")
        .in("guest_id", guestIds)
        .not("token", "is", null);
      for (const r of rows ?? []) {
        const t = (r as { token: string }).token?.trim();
        if (t && t.startsWith("ExponentPushToken")) tokens.push(t);
      }
    }
    if (staffIds.length > 0) {
      const { data: rows } = await supabase
        .from("push_tokens")
        .select("token")
        .in("staff_id", staffIds)
        .not("token", "is", null);
      for (const r of rows ?? []) {
        const t = (r as { token: string }).token?.trim();
        if (t && t.startsWith("ExponentPushToken")) tokens.push(t);
      }
    }

    const uniqueTokens = [...new Set(tokens)];
    if (uniqueTokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, message: "Kayıtlı push token yok" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const messages = uniqueTokens.map((to) => ({
      to,
      title: title.trim(),
      body: messageBody?.trim() ?? undefined,
      channelId: "valoria_urgent",
      priority: "high" as const,
      sound: "default" as const,
      interruptionLevel: "active" as const,
      data: payload,
    }));

    let sent = 0;
    let failed = 0;
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const chunk = messages.slice(i, i + BATCH_SIZE);
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        failed += chunk.length;
        continue;
      }
      const result = (await res.json()) as { data?: { status: string }[] | { status: string } };
      const raw = result.data;
      const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
      for (const item of list) {
        if (item.status === "ok") sent++;
        else failed++;
      }
    }

    return new Response(
      JSON.stringify({ sent, failed, total: uniqueTokens.length }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
