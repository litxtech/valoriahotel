// Valoria Hotel - Admin: başka kullanıcının şifresini değiştir
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Body = {
  target_auth_id: string;
  new_password: string;
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

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? null;
  if (!token) {
    return new Response(JSON.stringify({ success: false, error: "Yetkisiz: Token gerekli" }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return new Response(JSON.stringify({ success: false, error: "Sunucu yapılandırma hatası" }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ success: false, error: "Oturum bulunamadı" }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { data: adminStaff } = await supabaseAdmin
    .from("staff")
    .select("id")
    .eq("auth_id", user.id)
    .eq("role", "admin")
    .eq("is_active", true)
    .maybeSingle();
  if (!adminStaff) {
    return new Response(JSON.stringify({ success: false, error: "Yetkisiz: Sadece admin şifre değiştirebilir" }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ success: false, error: "Geçersiz JSON" }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { target_auth_id, new_password } = body;
  if (!target_auth_id || !new_password || new_password.length < 6) {
    return new Response(JSON.stringify({ success: false, error: "target_auth_id ve new_password (en az 6 karakter) gerekli" }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(target_auth_id, {
    password: new_password,
  });
  if (updateErr) {
    return new Response(JSON.stringify({ success: false, error: updateErr.message || "Şifre güncellenemedi" }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
