/**
 * Tapo kamera API yardımcıları
 * RTSP URL: rtsp://username:password@ip:554/stream1 (Tapo cihazlar için)
 */
import { supabase } from '@/lib/supabase';

export type RecordMode = 'motion' | 'continuous' | 'scheduled';

export type Camera = {
  id: string;
  name: string;
  location: string | null;
  ip_address: string;
  netmask: string | null;
  gateway: string | null;
  dns: string | null;
  username: string;
  password: string;
  record_mode: RecordMode;
  retention_days: number;
  schedule_start: string | null;
  schedule_end: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CameraPermission = {
  id: string;
  camera_id: string;
  staff_id: string;
  can_view: boolean;
  created_at: string;
};

export type CameraLog = {
  id: string;
  staff_id: string | null;
  staff_name: string | null;
  camera_id: string | null;
  camera_name: string | null;
  action: string;
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number | null;
  ip_address: string | null;
  created_at: string;
};

const RTSP_PORT = 554;
const STREAM_MAIN = 'stream1';
const STREAM_SUB = 'stream2';

/** Tapo RTSP stream URL - kimlik bilgisi URL'de (encodeURIComponent ile @ → %40) */
export function buildRtspUrl(camera: Pick<Camera, 'ip_address' | 'username' | 'password'>, substream = false): string {
  const user = encodeURIComponent(camera.username);
  const pass = encodeURIComponent(camera.password);
  const stream = substream ? STREAM_SUB : STREAM_MAIN;
  return `rtsp://${user}:${pass}@${camera.ip_address}:${RTSP_PORT}/${stream}`;
}

/** Kimlik bilgisi olmadan RTSP URL - VLC initOptions ile auth kullanılmalı (e-posta güvenli) */
export function buildRtspUrlNoCredentials(
  camera: Pick<Camera, 'ip_address'>,
  substream = false
): string {
  const stream = substream ? STREAM_SUB : STREAM_MAIN;
  return `rtsp://${camera.ip_address}:${RTSP_PORT}/${stream}`;
}

/** LibVLC initOptions. Son eleman Android bug yüzünden atlanır. */
export function buildRtspInitOptions(): string[] {
  return ['--rtsp-tcp', '--no-audio', '--network-caching=200', '--'];
}

/** Kamera listesi - admin tümünü, personel sadece yetkililerini görür */
export async function listCameras(): Promise<Camera[]> {
  const { data, error } = await supabase
    .from('cameras')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/** Admin: tüm kameralar (pasif dahil) */
export async function listCamerasAdmin(): Promise<Camera[]> {
  const { data, error } = await supabase
    .from('cameras')
    .select('*')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/** Tek kamera detayı */
export async function getCamera(id: string): Promise<Camera | null> {
  const { data, error } = await supabase.from('cameras').select('*').eq('id', id).single();
  if (error || !data) return null;
  return data as Camera;
}

/** Personelin kamera izleme yetkisi var mı? (En az 1 kameraya yetkisi varsa true) */
export async function staffHasCameraAccess(staffId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('camera_permissions')
    .select('id')
    .eq('staff_id', staffId)
    .eq('can_view', true)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/** Personelin yetkili olduğu kameralar */
export async function listCamerasForStaff(staffId: string): Promise<Camera[]> {
  const { data: perms } = await supabase
    .from('camera_permissions')
    .select('camera_id')
    .eq('staff_id', staffId)
    .eq('can_view', true);
  if (!perms?.length) return [];

  const ids = perms.map((p) => p.camera_id);
  const { data, error } = await supabase
    .from('cameras')
    .select('*')
    .in('id', ids)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

/** Admin: personelin yetkili olduğu kameralar (id listesi) */
export async function getCameraPermissionsByCamera(cameraId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('camera_permissions')
    .select('staff_id')
    .eq('camera_id', cameraId)
    .eq('can_view', true);
  if (error) throw error;
  return (data ?? []).map((p) => p.staff_id);
}

/** Admin: kamera yetkilerini güncelle */
export async function setCameraPermissions(cameraId: string, staffIds: string[]): Promise<void> {
  await supabase.from('camera_permissions').delete().eq('camera_id', cameraId);
  if (staffIds.length === 0) return;
  await supabase.from('camera_permissions').insert(
    staffIds.map((staff_id) => ({ camera_id: cameraId, staff_id, can_view: true }))
  );
}

/** Log ekle */
export type CameraLogAction =
  | 'izleme_basladi'
  | 'izleme_bitirdi'
  | 'kayit_baslatti'
  | 'kayit_durdurdu'
  | 'fotograf_cekti'
  | 'kayit_indirdi';

export async function insertCameraLog(params: {
  staff_id: string;
  staff_name: string;
  camera_id: string;
  camera_name: string;
  action: CameraLogAction;
  start_time?: string;
  end_time?: string;
  duration_seconds?: number;
  ip_address?: string;
}): Promise<void> {
  const { error } = await supabase.from('camera_logs').insert({
    staff_id: params.staff_id,
    staff_name: params.staff_name,
    camera_id: params.camera_id,
    camera_name: params.camera_name,
    action: params.action,
    start_time: params.start_time ?? null,
    end_time: params.end_time ?? null,
    duration_seconds: params.duration_seconds ?? null,
    ip_address: params.ip_address ?? null,
  });
  if (error) throw error;
}

/** Logları listele - admin tümünü, personel kendisini */
export async function listCameraLogs(params: {
  staffId?: string;
  cameraId?: string;
  limit?: number;
  fromDate?: string;
}): Promise<CameraLog[]> {
  let q = supabase
    .from('camera_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 50);

  if (params.staffId) q = q.eq('staff_id', params.staffId);
  if (params.cameraId) q = q.eq('camera_id', params.cameraId);
  if (params.fromDate) q = q.gte('created_at', params.fromDate);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CameraLog[];
}
