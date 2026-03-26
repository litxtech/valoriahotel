/**
 * Valoria Hotel - Realtime mesajlaşma tipleri ve API yardımcıları
 */

export type ParticipantType = 'guest' | 'staff' | 'admin';
export type ConversationType = 'direct' | 'group' | 'department';
export type MessageType = 'text' | 'image' | 'file' | 'location' | 'voice';

export interface Conversation {
  id: string;
  type: ConversationType;
  name: string | null;
  avatar: string | null;
  created_by: string | null;
  created_by_type: ParticipantType | null;
  created_at: string;
  updated_at: string;
  last_message_id: string | null;
  last_message_at: string | null;
}

export interface ConversationWithMeta extends Conversation {
  last_message_preview?: string | null;
  unread_count?: number;
  is_pinned?: boolean;
  is_muted?: boolean;
  /** Direct sohbetlerde karşı tarafın profil resmi (staff profile_image). */
  other_avatar?: string | null;
  other_participant?: { id: string; type: ParticipantType; name: string; avatar: string | null; is_online?: boolean; last_seen?: string | null };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_type: ParticipantType;
  sender_name: string | null;
  sender_avatar: string | null;
  message_type: MessageType;
  content: string | null;
  media_url: string | null;
  media_thumbnail: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_name?: string | null;
  is_delivered: boolean;
  delivered_at: string | null;
  is_read: boolean;
  read_at: string | null;
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  reply_to_id: string | null;
  scheduled_at: string | null;
  created_at: string;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  participant_id: string;
  participant_type: ParticipantType;
  role: string;
  joined_at: string;
  left_at: string | null;
  last_read_at: string | null;
  is_muted: boolean;
  is_pinned: boolean;
}

/** Mevcut kullanıcı: staff (auth) veya guest (app_token) */
export type MessagingActor =
  | { type: 'staff'; staffId: string; name: string; avatar: string | null; isAdmin: boolean }
  | { type: 'guest'; guestId: string; appToken: string; name: string; roomNumber: string | null };

export const MESSAGING_COLORS = {
  primary: '#C5A059',
  error: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  info: '#3B82F6',
  background: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#6B7280',
} as const;
