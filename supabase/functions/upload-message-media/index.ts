// Valoria Hotel - Sesli mesaj / medya yükleme (misafir app_token ile)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "message-media";
const MAX_DECODED_BYTES = 1_200_000; // ~1.2MB (Edge Function body limit’e uygun)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Base64 string’i normalize eder (Android’de satır sonu/boşluk gelebilir). */
function normalizeBase64(input: unknown): string | undefined {
  if (input == null) return undefined;
  if (typeof input === "string") {
    return input.replace(/\s/g, "");
  }
  return undefined;
}

function jsonResponse(obj: { error: string }, status: number) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  let raw: Record<string, unknown>;
  try {
    const body = await req.json();
    raw = body as Record<string, unknown>;
  } catch (parseErr) {
    console.error("[upload-message-media] req.json hatası:", parseErr instanceof Error ? parseErr.message : parseErr);
    return jsonResponse(
      { error: "İstek geçersiz veya çok büyük. Lütfen daha küçük bir resim deneyin." },
      400
    );
  }

  try {
    const app_token = typeof raw.app_token === "string" ? raw.app_token.trim() : undefined;
    const conversation_id = typeof raw.conversation_id === "string" ? raw.conversation_id.trim() : undefined;
    const audio_base64 = normalizeBase64(raw.audio_base64) ?? raw.audio_base64;
    const image_base64 = normalizeBase64(raw.image_base64) ?? raw.image_base64;
    const mime_type = (raw.mime_type as string) || "audio/m4a";
    const isImage = Boolean(image_base64);
    const wantSignedUrl = !audio_base64 && !image_base64 && raw.request_signed_upload === true;

    if (!app_token || !conversation_id) {
      console.warn("[upload-message-media] Eksik parametre:", { hasToken: !!app_token, hasConv: !!conversation_id });
      return jsonResponse({ error: "app_token ve conversation_id gerekli" }, 400);
    }
    if (!wantSignedUrl && !audio_base64 && !image_base64) {
      return jsonResponse({ error: "audio_base64, image_base64 veya request_signed_upload gerekli" }, 400);
    }

    const { data: guest } = await supabase
      .from("guests")
      .select("id")
      .eq("app_token", app_token)
      .single();
    if (!guest) {
      console.warn("[upload-message-media] Geçersiz app_token");
      return jsonResponse({ error: "Geçersiz token" }, 401);
    }
    const { data: part } = await supabase
      .from("conversation_participants")
      .select("id")
      .eq("conversation_id", conversation_id)
      .eq("participant_id", guest.id)
      .eq("participant_type", "guest")
      .is("left_at", null)
      .single();
    if (!part) {
      console.warn("[upload-message-media] Konuşmaya katılım yok, conversation_id=", conversation_id);
      return jsonResponse({ error: "Bu sohbete erişim yok" }, 403);
    }

    const contentType = (raw.mime_type as string) || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : "jpg";
    const path = `images/${crypto.randomUUID()}.${ext}`;

    if (wantSignedUrl) {
      const { data: signedData, error: signedErr } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
      if (signedErr || !signedData?.token) {
        console.error("[upload-message-media] createSignedUploadUrl hatası:", signedErr?.message);
        return jsonResponse({ error: "Yükleme linki oluşturulamadı." }, 500);
      }
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return new Response(
        JSON.stringify({ path, token: signedData.token, url: urlData.publicUrl }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const base64 = isImage ? image_base64 : audio_base64;
    const mimeForDecode = isImage ? (mime_type || "image/jpeg") : mime_type;
    let pathVoice: string;
    if (isImage) {
      pathVoice = path;
    } else {
      const extVoice = mimeForDecode.includes("mpeg") || mimeForDecode.includes("mp3") ? "mp3" : "m4a";
      pathVoice = `voice/${crypto.randomUUID()}.${extVoice}`;
    }
    let binary: Uint8Array;
    try {
      const normalized = typeof base64 === "string" ? base64.replace(/\s/g, "") : String(base64).replace(/\s/g, "");
      binary = Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
    } catch (e) {
      console.error("[upload-message-media] atob hatası:", e instanceof Error ? e.message : e);
      return jsonResponse({ error: "Geçersiz base64. Resim çok büyük veya bozuk olabilir." }, 400);
    }
    if (binary.length > MAX_DECODED_BYTES) {
      console.warn("[upload-message-media] Dosya boyutu aşıldı:", binary.length, "max:", MAX_DECODED_BYTES);
      return jsonResponse({ error: "Resim çok büyük. Lütfen daha küçük bir resim seçin veya sıkıştırılmış gönderin." }, 413);
    }
    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(pathVoice, binary, {
      contentType: mimeForDecode,
      upsert: false,
    });
    if (uploadErr) {
      console.error("[upload-message-media] Storage upload hatası:", uploadErr.message);
      return jsonResponse({ error: "Yükleme hatası: " + uploadErr.message }, 500);
    }
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(pathVoice);
    return new Response(JSON.stringify({ url: urlData.publicUrl }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[upload-message-media] Beklenmeyen hata:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Sunucu hatası" }, 500);
  }
});
