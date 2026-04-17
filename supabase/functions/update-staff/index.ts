// Valoria Hotel - Admin: Çalışan bilgilerini ve şifresini güncelleme
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STAFF_ROLES = ["admin", "reception_chief", "receptionist", "housekeeping", "technical", "security"] as const;
const CONTRACT_TYPES = ["full_time", "fixed_term", "seasonal", "intern", "other"] as const;

function normalizeContractType(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  return CONTRACT_TYPES.includes(s as (typeof CONTRACT_TYPES)[number]) ? s : null;
}

type UpdateStaffBody = {
  staff_id: string;
  access_token?: string | null;
  password?: string | null;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  department?: string | null;
  position?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  id_number?: string | null;
  address?: string | null;
  hire_date?: string | null;
  personnel_no?: string | null;
  salary?: number | null;
  sgk_no?: string | null;
  app_permissions?: Record<string, boolean> | null;
  work_days?: number[] | null;
  shift_type?: string | null;
  notes?: string | null;
  is_active?: boolean | null;
  verification_badge?: 'blue' | 'yellow' | null;
  organization_id?: string | null;
  contract_type?: string | null;
  termination_date?: string | null;
  internal_extension?: string | null;
  certifications_summary?: string | null;
  kvkk_consent_at?: string | null;
  drives_vehicle?: boolean | null;
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

  let body: UpdateStaffBody;
  try {
    body = (await req.json()) as UpdateStaffBody;
  } catch {
    return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
  const tokenFromHeader = authHeader?.replace(/^Bearer\s+/i, "").trim();
  const token = tokenFromHeader || (body.access_token && String(body.access_token).trim()) || null;
  if (!token) {
    return new Response(JSON.stringify({ error: "Yetkisiz: Token gönderilmedi" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const supabaseUser = createClient(supabaseUrl, anonKey);

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Geçersiz oturum veya token süresi dolmuş" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const { data: caller } = await supabaseAdmin
    .from("staff")
    .select("id, role")
    .eq("auth_id", user.id)
    .eq("is_active", true)
    .single();
  if (!caller || caller.role !== "admin") {
    return new Response(JSON.stringify({ error: "Sadece admin çalışan güncelleyebilir" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { staff_id } = body;
  if (!staff_id) {
    return new Response(JSON.stringify({ error: "staff_id gerekli" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const { data: staffRow, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("id, auth_id, email")
    .eq("id", staff_id)
    .single();
  if (staffErr || !staffRow) {
    return new Response(JSON.stringify({ error: "Çalışan bulunamadı" }), {
      status: 404,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const authId = staffRow.auth_id;

  if (body.password != null && String(body.password).trim() !== "") {
    const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(authId, {
      password: String(body.password).trim(),
    });
    if (updateAuthErr) {
      return new Response(
        JSON.stringify({ error: "Şifre güncellenemedi: " + updateAuthErr.message }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
  }

  if (body.email != null && String(body.email).trim() !== "" && body.email.trim() !== staffRow.email) {
    const { error: updateEmailErr } = await supabaseAdmin.auth.admin.updateUserById(authId, {
      email: String(body.email).trim().toLowerCase(),
    });
    if (updateEmailErr) {
      return new Response(
        JSON.stringify({ error: "E-posta güncellenemedi: " + updateEmailErr.message }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
  }

  const role = body.role != null && STAFF_ROLES.includes(body.role as typeof STAFF_ROLES[number])
    ? body.role
    : undefined;

  const staffUpdate: Record<string, unknown> = {};
  if (body.full_name !== undefined) staffUpdate.full_name = body.full_name?.trim() ?? null;
  if (body.email !== undefined) staffUpdate.email = body.email?.trim()?.toLowerCase() ?? null;
  if (role !== undefined) staffUpdate.role = role;
  if (body.department !== undefined) staffUpdate.department = body.department?.trim() ?? null;
  if (body.position !== undefined) staffUpdate.position = body.position?.trim() ?? null;
  if (body.phone !== undefined) staffUpdate.phone = body.phone?.trim() ?? null;
  if (body.birth_date !== undefined) staffUpdate.birth_date = body.birth_date || null;
  if (body.id_number !== undefined) staffUpdate.id_number = body.id_number?.trim() ?? null;
  if (body.address !== undefined) staffUpdate.address = body.address?.trim() ?? null;
  if (body.hire_date !== undefined) staffUpdate.hire_date = body.hire_date || null;
  if (body.personnel_no !== undefined) staffUpdate.personnel_no = body.personnel_no?.trim() ?? null;
  if (body.salary !== undefined) staffUpdate.salary = body.salary ?? null;
  if (body.sgk_no !== undefined) staffUpdate.sgk_no = body.sgk_no?.trim() ?? null;
  if (body.app_permissions !== undefined) staffUpdate.app_permissions = body.app_permissions ?? {};
  if (body.work_days !== undefined) staffUpdate.work_days = body.work_days ?? [1, 2, 3, 4, 5];
  if (body.shift_type !== undefined) staffUpdate.shift_type = body.shift_type?.trim() ?? null;
  if (body.notes !== undefined) staffUpdate.notes = body.notes?.trim() ?? null;
  if (body.is_active !== undefined) staffUpdate.is_active = body.is_active ?? true;
  if (body.verification_badge !== undefined) {
    const v = body.verification_badge;
    staffUpdate.verification_badge = (v === 'blue' || v === 'yellow') ? v : null;
  }

  if (body.organization_id !== undefined && body.organization_id !== null && String(body.organization_id).trim() !== "") {
    const oid = String(body.organization_id).trim();
    const { data: orgRow, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .select("id")
      .eq("id", oid)
      .maybeSingle();
    if (orgErr || !orgRow?.id) {
      return new Response(JSON.stringify({ error: "Geçersiz işletme seçimi." }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    staffUpdate.organization_id = oid;
  }

  if (body.contract_type !== undefined) {
    staffUpdate.contract_type = body.contract_type === null || body.contract_type === ""
      ? null
      : normalizeContractType(body.contract_type);
  }
  if (body.termination_date !== undefined) {
    const t = body.termination_date;
    staffUpdate.termination_date = t && String(t).trim() ? String(t).trim().slice(0, 10) : null;
  }
  if (body.internal_extension !== undefined) {
    staffUpdate.internal_extension = body.internal_extension?.trim() ?? null;
  }
  if (body.certifications_summary !== undefined) {
    staffUpdate.certifications_summary = body.certifications_summary?.trim() ?? null;
  }
  if (body.kvkk_consent_at !== undefined) {
    const k = body.kvkk_consent_at;
    staffUpdate.kvkk_consent_at = k && String(k).trim() ? String(k).trim().slice(0, 10) : null;
  }
  if (body.drives_vehicle !== undefined) {
    staffUpdate.drives_vehicle = body.drives_vehicle === true;
  }

  if (Object.keys(staffUpdate).length > 0) {
    const { error: updateErr } = await supabaseAdmin
      .from("staff")
      .update(staffUpdate)
      .eq("id", staff_id);
    if (updateErr) {
      return new Response(
        JSON.stringify({ error: "Çalışan kaydı güncellenemedi: " + updateErr.message }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
  }

  return new Response(
    JSON.stringify({ ok: true, message: "Güncellendi" }),
    { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
  );
});
