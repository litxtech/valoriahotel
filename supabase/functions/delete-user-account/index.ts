// Valoria Hotel - KVKK/GDPR uyumlu hesap silme (kullanıcı kendi veya admin)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SelfDeleteBody = {
  mode: "self";
  password?: string;
  deletion_reason?: string;
};

type AdminDeleteBody = {
  mode: "admin";
  target_auth_id: string;
  user_type: "staff" | "guest";
  admin_reason: string;
  deletion_reason?: string;
};

type Body = SelfDeleteBody | AdminDeleteBody;

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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? null;
  if (!token) {
    return new Response(JSON.stringify({ error: "Yetkisiz: Token gerekli" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return new Response(JSON.stringify({ error: "Sunucu yapılandırma hatası" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Oturum bulunamadı" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  let targetAuthId: string;
  let userType: "staff" | "guest";
  let deletedBy: "user" | "admin";
  let deletionReason: string | null = null;
  let adminReason: string | null = null;
  let deletedByAdminId: string | null = null;

  if (body.mode === "self") {
    if (body.password) {
      const { error: signInErr } = await supabaseUser.auth.signInWithPassword({
        email: user.email ?? "",
        password: body.password,
      });
      if (signInErr) {
        return new Response(JSON.stringify({ error: "Şifre hatalı" }), {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
    }
    targetAuthId = user.id;
    deletedBy = "user";
    deletionReason = body.deletion_reason ?? null;
    const { data: staffRow } = await supabaseAdmin.from("staff").select("id").eq("auth_id", user.id).maybeSingle();
    userType = staffRow ? "staff" : "guest";
  } else {
    const { data: adminStaff } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("auth_id", user.id)
      .eq("role", "admin")
      .or("is_active.eq.true,is_active.is.null")
      .is("deleted_at", null)
      .maybeSingle();
    if (!adminStaff) {
      return new Response(JSON.stringify({ error: "Yetkisiz: Sadece admin hesap silebilir" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    targetAuthId = body.target_auth_id;
    userType = body.user_type;
    deletedBy = "admin";
    deletedByAdminId = adminStaff.id;
    adminReason = body.admin_reason ?? null;
    deletionReason = body.deletion_reason ?? null;
  }

  let userEmail: string | null = user.email ?? null;
  let userPhone: string | null = null;
  let accountAgeDays: number | null = null;

  if (userType === "staff") {
    const { data: s } = await supabaseAdmin.from("staff").select("email, phone, created_at").eq("auth_id", targetAuthId).maybeSingle();
    if (s) {
      userEmail = s.email ?? null;
      userPhone = s.phone ?? null;
      if (s.created_at) accountAgeDays = Math.floor((Date.now() - new Date(s.created_at).getTime()) / 86400000);
    }
  }
  if (deletedBy === "admin" && userType === "guest") {
    const authUser = await supabaseAdmin.auth.admin.getUserById(targetAuthId);
    userEmail = authUser.data.user?.email ?? null;
  }

  const logRow = {
    user_id: targetAuthId,
    user_type: userType,
    user_email: userEmail,
    user_phone: userPhone,
    deleted_by: deletedBy,
    deleted_by_admin_id: deletedByAdminId,
    deletion_reason: deletionReason,
    admin_reason: adminReason,
    account_age_days: accountAgeDays,
    total_stays: null as number | null,
    total_reviews: null as number | null,
  };

  const { error: logErr } = await supabaseAdmin.from("account_deletion_logs").insert(logRow);
  if (logErr) {
    console.error("account_deletion_logs insert", logErr);
  }

  if (deletedBy === "admin") {
    // Soft delete: işaretle; kullanıcı uygulama açtığında "Hesabınız silindi" görür, confirm-deleted-logout ile auth silinir
    const now = new Date().toISOString();
    const reason = adminReason ?? deletionReason ?? "Admin tarafından silindi";
    if (userType === "staff") {
      await supabaseAdmin
        .from("staff")
        .update({ deleted_at: now, deleted_by: deletedByAdminId, deletion_reason: reason })
        .eq("auth_id", targetAuthId);
    } else {
      const guestPayload = {
        deleted_at: now,
        deleted_by: deletedByAdminId,
        deletion_reason: reason,
        email: "silindi@" + targetAuthId.slice(0, 8) + ".local",
        full_name: "Silindi",
        phone: null,
        id_number: null,
      };
      const { data: byAuth } = await supabaseAdmin.from("guests").update(guestPayload).eq("auth_user_id", targetAuthId).select("id").maybeSingle();
      if (!byAuth && userEmail) {
        await supabaseAdmin.from("guests").update(guestPayload).eq("email", userEmail);
      }
    }
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (userType === "guest" && userEmail) {
    await supabaseAdmin
      .from("guests")
      .update({
        email: "silindi@" + targetAuthId.slice(0, 8) + ".local",
        full_name: "Silindi",
        phone: null,
        id_number: null,
      })
      .eq("email", userEmail);
  }

  const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(targetAuthId);
  if (deleteErr) {
    return new Response(JSON.stringify({ error: deleteErr.message || "Hesap silinemedi" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
