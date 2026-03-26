// Valoria Hotel - Expo Push bildirimleri gönderir (push_tokens tablosundan token alır)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PushBody = {
  guestIds?: string[];
  staffIds?: string[];
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
    const body = (await req.json()) as PushBody;
    const { guestIds = [], staffIds = [], title, body: messageBody, data = {} } = body;
    if (!title || (guestIds.length === 0 && staffIds.length === 0)) {
      return new Response(
        JSON.stringify({ error: "title ve (guestIds veya staffIds) gerekli" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
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

    const messages: {
      to: string;
      title: string;
      body?: string;
      channelId?: string;
      priority?: "high";
      sound?: "default";
      interruptionLevel?: "active";
      data?: Record<string, unknown>;
    }[] = uniqueTokens.map(
      (to) => ({
        to,
        title,
        body: messageBody ?? undefined,
        channelId: "valoria_urgent",
        priority: "high",
        sound: "default",
        interruptionLevel: "active" as const,
        data: { ...data, screen: "notifications" },
      })
    );

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
