// Yeni feed gönderisi: müşteri görünürlüğündeki paylaşımlarda tüm aktif misafirlere in-app + Expo push.
// JWT ile gönderi sahibi doğrulanır (personel veya misafir); service role ile toplu bildirim.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = { postId?: string };

function expoDisplayBody(messageBody: string | null | undefined): string {
  const b = (messageBody ?? "").trim();
  return b.length > 0 ? b : "Yeni bildirim";
}

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
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Authorization gerekli" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Geçersiz oturum" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const uid = userData.user.id;

    const { postId } = (await req.json()) as Body;
    if (!postId || typeof postId !== "string") {
      return new Response(JSON.stringify({ error: "postId gerekli" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: post, error: postErr } = await supabase
      .from("feed_posts")
      .select("id, visibility, staff_id, guest_id, title")
      .eq("id", postId)
      .maybeSingle();

    if (postErr || !post) {
      return new Response(JSON.stringify({ error: "Gönderi bulunamadı" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const vis = post.visibility as string;
    if (vis !== "customers" && vis !== "guests_only") {
      return new Response(
        JSON.stringify({ skipped: true, reason: "not_customer_facing" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    let authorOk = false;
    if (post.staff_id) {
      const { data: st } = await supabase
        .from("staff")
        .select("auth_id")
        .eq("id", post.staff_id)
        .maybeSingle();
      authorOk = (st as { auth_id?: string } | null)?.auth_id === uid;
    } else if (post.guest_id) {
      const { data: g } = await supabase
        .from("guests")
        .select("auth_user_id")
        .eq("id", post.guest_id)
        .maybeSingle();
      authorOk = (g as { auth_user_id?: string } | null)?.auth_user_id === uid;
    }

    if (!authorOk) {
      return new Response(JSON.stringify({ error: "Bu gönderiyi bildirim için yetkiniz yok" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let authorName = "Bir kullanıcı";
    if (post.staff_id) {
      const { data: st } = await supabase
        .from("staff")
        .select("full_name")
        .eq("id", post.staff_id)
        .maybeSingle();
      const n = (st as { full_name?: string } | null)?.full_name?.trim();
      if (n) authorName = n;
    } else if (post.guest_id) {
      const { data: g } = await supabase
        .from("guests")
        .select("full_name")
        .eq("id", post.guest_id)
        .maybeSingle();
      const n = (g as { full_name?: string } | null)?.full_name?.trim();
      if (n) authorName = n;
    }

    const titleText = ((post.title as string) ?? "").trim();
    const snippet = titleText.slice(0, 80) + (titleText.length > 80 ? "…" : "");
    const bodyMain = `${authorName} yeni bir gönderi paylaştı`;
    const body = snippet.length > 0 ? `${bodyMain}: ${snippet}` : bodyMain;
    const notifTitle = "Yeni gönderi";

    const { data: guestRows, error: guestsErr } = await supabase
      .from("guests")
      .select("id")
      .in("status", ["pending", "checked_in"]);

    if (guestsErr) {
      return new Response(JSON.stringify({ error: guestsErr.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const authorGuestId = post.guest_id as string | null;
    const guestIds = (guestRows ?? [])
      .map((r: { id: string }) => r.id)
      .filter((id: string) => id !== authorGuestId);

    if (guestIds.length === 0) {
      return new Response(
        JSON.stringify({ inserted: 0, pushSent: 0, message: "Hedef misafir yok" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const pushData = {
      url: "/customer/feed/[id]",
      postId,
      screen: "customer_feed",
    };

    const now = new Date().toISOString();
    const rows = guestIds.map((guestId: string) => ({
      guest_id: guestId,
      staff_id: null,
      title: notifTitle,
      body,
      category: "guest",
      notification_type: "feed_post",
      data: { postId, url: "/customer/feed/[id]" },
      created_by: post.staff_id ?? null,
      sent_via: "both",
      sent_at: now,
    }));

    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250);
      const { error: insErr } = await supabase.from("notifications").insert(chunk);
      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
    }

    const { data: tokenRows } = await supabase
      .from("push_tokens")
      .select("token")
      .in("guest_id", guestIds)
      .not("token", "is", null);

    const tokens: string[] = [];
    for (const r of tokenRows ?? []) {
      const t = (r as { token: string }).token?.trim();
      if (t && t.startsWith("ExponentPushToken")) tokens.push(t);
    }
    const uniqueTokens = [...new Set(tokens)];
    const displayBody = expoDisplayBody(body);

    let sent = 0;
    let failed = 0;
    if (uniqueTokens.length > 0) {
      const messages = uniqueTokens.map((to) => ({
        to,
        title: notifTitle.trim(),
        body: displayBody,
        priority: "high" as const,
        sound: "default" as const,
        interruptionLevel: "active" as const,
        data: { ...pushData, screen: "notifications" },
      }));

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
        const result = (await res.json()) as {
          data?: ({ status: string }[] | { status: string });
        };
        const raw = result.data;
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        for (const item of list) {
          if (item.status === "ok") sent++;
          else failed++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        inserted: guestIds.length,
        pushTargets: uniqueTokens.length,
        pushSent: sent,
        pushFailed: failed,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
