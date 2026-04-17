/** Görev ataması ekleri — Storage bucket ve URL yardımcıları */

export const STAFF_TASK_MEDIA_BUCKET = 'staff-task-media';

const VIDEO_EXT = /\.(mp4|mov|webm|m4v)(\?|#|$)/i;

export function isAssignmentMediaVideoUrl(url: string): boolean {
  const u = (url || '').toLowerCase();
  return VIDEO_EXT.test(u) || u.includes('/video/');
}

export const MAX_ASSIGNMENT_ATTACHMENTS = 6;
