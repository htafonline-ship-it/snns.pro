export interface User {
  uid: string; // Strictly Firebase Auth UID
  phone: string;
  name: string; // display_name
  display_name?: string;
  username?: string;
  photo_url?: string;
  avatarColor: string;
  role?: 'admin' | 'user';
  isStealth?: boolean; // وضع الشبح (Ghost Mode): true = مخفي، false = غير مفعّل ومرئي للأجهزة القريبة
  isCallLocked?: boolean;
  isOnline?: boolean;
  lastSeen?: number;
  status?: 'online' | 'offline' | 'in_call';
  createdAt?: number;
  blocked_uids?: string[];
  latitude?: number;
  longitude?: number;
  lastLocationUpdate?: number;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
}

export interface Contact {
  id: string;
  owner_uid: string;
  contact_uid: string;
  name: string;
  phone: string;
  username?: string;
  avatarColor?: string;
  created_at: number;
}

export type CallType = 'video' | 'audio';

export type CallState =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'incoming'
  | 'connected'
  | 'ended';

export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'missed'
  | 'ended'
  | 'failed';

export interface ActiveCall {
  callId?: string;
  caller_id?: string; // Firebase Auth UID
  callee_id?: string; // Firebase Auth UID
  peerUid?: string; // The other party's UID
  peerPhone: string;
  peerName: string;
  peerUsername?: string;
  peerAvatarColor?: string;
  callType: CallType;
  direction: 'outgoing' | 'incoming';
  roomId?: string;
  roomUrl?: string;
  startedAt?: number;
  isSimulated?: boolean;
  isStealth?: boolean;
}

export interface CallLog {
  id: string;
  caller_id: string; // Firebase Auth UID of caller
  callee_id: string; // Firebase Auth UID of callee
  caller_name: string;
  callee_name: string;
  caller_phone?: string;
  callee_phone?: string;
  call_type: CallType;
  status: CallStatus;
  duration: number; // in seconds
  room_id?: string;
  room_url?: string;
  created_at: number;
  started_at?: number | null;
  answered_at?: number | null;
  ended_at?: number | null;
  isStealth?: boolean;
}

export interface ChatMessage {
  id: string;
  senderUid?: string;
  senderPhone: string;
  senderName: string;
  text: string;
  timestamp: number;
  isStealth?: boolean;
}

export type AttachmentType = 'image' | 'file' | 'audio';

export interface MessageAttachment {
  type: AttachmentType;
  url: string;
  name?: string;
  size?: number;
  mimeType?: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  sender_name: string;
  sender_phone?: string;
  sender_avatarColor?: string;
  text: string;
  created_at: number;
  read?: boolean;
  attachment?: MessageAttachment;
  deleted_for?: string[];
  deleted_for_all?: boolean;
  deleted_at?: number;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
  y: number;
}
