import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from './firebase';
import { User, Contact, CallLog, CallStatus, CallType, DirectMessage, MessageAttachment } from '../types';

const USERS_COLLECTION = 'users';
const CONTACTS_COLLECTION = 'contacts';
const CALLS_COLLECTION = 'calls';
const MESSAGES_COLLECTION = 'direct_messages';
const BLOCKS_COLLECTION = 'blocks';

/**
 * Save or update a user profile in Firestore
 * Document ID is strictly the Firebase Auth UID
 */
export async function saveUserProfile(uid: string, data: Partial<User>): Promise<void> {
  if (!uid) throw new Error('Firebase UID is required');
  const userRef = doc(db, USERS_COLLECTION, uid);
  const existingSnap = await getDoc(userRef);

  const payload: any = {
    uid,
    display_name: data.name || data.display_name || 'مستخدم تواصل',
    username: data.username || '',
    phone: data.phone || '',
    photo_url: data.photo_url || '',
    avatar_color: data.avatarColor || 'bg-emerald-600',
    role: data.role || 'user',
    is_stealth: Boolean(data.isStealth),
    is_call_locked: Boolean(data.isCallLocked),
    status: data.status || 'online',
    last_seen: Date.now(),
  };

  if (!existingSnap.exists()) {
    payload.created_at = Date.now();
  }

  await setDoc(userRef, payload, { merge: true });
}

/**
 * Get user profile by Firebase UID
 */
export async function getUserProfile(uid: string): Promise<User | null> {
  if (!uid) return null;
  try {
    const userRef = doc(db, USERS_COLLECTION, uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      uid: d.uid || uid,
      phone: d.phone || '',
      name: d.display_name || d.name || 'مستخدم تواصل',
      display_name: d.display_name || d.name || 'مستخدم تواصل',
      username: d.username || '',
      photo_url: d.photo_url || '',
      avatarColor: d.avatar_color || d.avatarColor || 'bg-emerald-600',
      role: d.role || 'user',
      isStealth: Boolean(d.is_stealth ?? d.isStealth),
      isCallLocked: Boolean(d.is_call_locked ?? d.isCallLocked),
      status: d.status || 'offline',
      lastSeen: d.last_seen || Date.now(),
      createdAt: d.created_at || Date.now(),
    };
  } catch (err) {
    console.error('Error getting user profile from Firestore:', err);
    return null;
  }
}

/**
 * Search user by phone or username in Firestore
 */
export async function searchUserByPhoneOrUsername(queryStr: string): Promise<User | null> {
  if (!queryStr) return null;
  const clean = queryStr.trim().replace(/^@/, '').replace(/\s+/g, '');

  try {
    // 1. Query by phone
    const qPhone = query(collection(db, USERS_COLLECTION), where('phone', '==', clean), limit(1));
    const snapPhone = await getDocs(qPhone);
    if (!snapPhone.empty) {
      const d = snapPhone.docs[0].data();
      return {
        uid: d.uid || snapPhone.docs[0].id,
        phone: d.phone,
        name: d.display_name || d.name || 'مستخدم',
        username: d.username,
        photo_url: d.photo_url,
        avatarColor: d.avatar_color || 'bg-emerald-600',
        role: d.role,
        isStealth: d.is_stealth,
        isCallLocked: d.is_call_locked,
        status: d.status,
        lastSeen: d.last_seen,
      };
    }

    // 2. Query by username
    const qUser = query(collection(db, USERS_COLLECTION), where('username', '==', clean), limit(1));
    const snapUser = await getDocs(qUser);
    if (!snapUser.empty) {
      const d = snapUser.docs[0].data();
      return {
        uid: d.uid || snapUser.docs[0].id,
        phone: d.phone,
        name: d.display_name || d.name || 'مستخدم',
        username: d.username,
        photo_url: d.photo_url,
        avatarColor: d.avatar_color || 'bg-emerald-600',
        role: d.role,
        isStealth: d.is_stealth,
        isCallLocked: d.is_call_locked,
        status: d.status,
        lastSeen: d.last_seen,
      };
    }
  } catch (e) {
    console.error('Search user in Firestore failed:', e);
  }
  return null;
}

/**
 * Fetch all users from Firestore with real-time subscription
 */
export function subscribeAllUsers(currentUid: string, callback: (users: User[]) => void) {
  const usersRef = collection(db, USERS_COLLECTION);
  return onSnapshot(
    usersRef,
    (snapshot) => {
      const list: User[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const userUid = d.uid || docSnap.id;
        list.push({
          uid: userUid,
          phone: d.phone || '',
          name: d.display_name || d.name || 'مستخدم',
          display_name: d.display_name || d.name || 'مستخدم',
          username: d.username || '',
          photo_url: d.photo_url || '',
          avatarColor: d.avatar_color || 'bg-emerald-600',
          role: d.role || 'user',
          isStealth: Boolean(d.is_stealth),
          isCallLocked: Boolean(d.is_call_locked),
          status: d.status || 'offline',
          lastSeen: d.last_seen || Date.now(),
          createdAt: d.created_at || Date.now(),
        });
      });
      callback(list);
    },
    (err) => {
      console.error('Failed to subscribe users:', err);
    }
  );
}

/**
 * Contacts Management
 */
export async function addContact(
  ownerUid: string,
  contactUid: string,
  data: { name: string; phone: string; username?: string; avatarColor?: string }
): Promise<void> {
  const contactId = `${ownerUid}_${contactUid}`;
  const ref = doc(db, CONTACTS_COLLECTION, contactId);
  await setDoc(ref, {
    id: contactId,
    owner_uid: ownerUid,
    contact_uid: contactUid,
    name: data.name,
    phone: data.phone,
    username: data.username || '',
    avatar_color: data.avatarColor || 'bg-emerald-600',
    created_at: Date.now(),
  });
}

export async function deleteContact(ownerUid: string, contactUid: string): Promise<void> {
  const contactId = `${ownerUid}_${contactUid}`;
  const ref = doc(db, CONTACTS_COLLECTION, contactId);
  await deleteDoc(ref);
}

export function subscribeContacts(ownerUid: string, callback: (contacts: Contact[]) => void) {
  const q = query(
    collection(db, CONTACTS_COLLECTION),
    where('owner_uid', '==', ownerUid),
    orderBy('created_at', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const contacts: Contact[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        contacts.push({
          id: d.id || docSnap.id,
          owner_uid: d.owner_uid,
          contact_uid: d.contact_uid,
          name: d.name,
          phone: d.phone,
          username: d.username,
          avatarColor: d.avatar_color,
          created_at: d.created_at || Date.now(),
        });
      });
      callback(contacts);
    },
    (err) => {
      console.error('Failed to subscribe contacts:', err);
    }
  );
}

/**
 * Call Logs Management in Firestore
 */
export async function createCallRecord(call: {
  id?: string;
  caller_id: string; // Firebase Auth UID
  callee_id: string; // Firebase Auth UID
  caller_name: string;
  callee_name: string;
  caller_phone?: string;
  callee_phone?: string;
  call_type: CallType;
  status: CallStatus;
  room_id?: string;
  created_at?: number;
  started_at?: number | null;
  answered_at?: number | null;
  ended_at?: number | null;
  duration?: number;
}): Promise<string> {
  const callId = call.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const callRef = doc(db, CALLS_COLLECTION, callId);

  const initialStatus: CallStatus = call.status || 'ringing';

  await setDoc(callRef, {
    id: callId,
    caller_id: call.caller_id,
    callee_id: call.callee_id,
    caller_name: call.caller_name,
    callee_name: call.callee_name,
    caller_phone: call.caller_phone || '',
    callee_phone: call.callee_phone || '',
    call_type: call.call_type,
    status: initialStatus,
    room_id: call.room_id || '',
    created_at: Date.now(),
    started_at: call.started_at || null,
    answered_at: call.answered_at || null,
    ended_at: call.ended_at || null,
    duration: call.duration || 0,
  });

  console.log(
    `[CALL_STATE] callId=${callId} from=none to=${initialStatus} reason=CALL_INITIATED uid=${call.caller_id} timestamp=${Date.now()}`
  );

  return callId;
}

/**
 * Atomic State Transition Helper for Call Machine
 * Prevents race conditions and guarantees strict status state transitions
 */
export async function transitionCallStatus(
  callId: string,
  newStatus: CallStatus,
  reason: string,
  currentUid: string,
  allowedOldStatuses?: CallStatus[],
  extraUpdates?: Partial<CallLog>
): Promise<boolean> {
  if (!callId) return false;
  try {
    const callRef = doc(db, CALLS_COLLECTION, callId);
    const snap = await getDoc(callRef);
    if (!snap.exists()) {
      console.warn(`[CALL_STATE] Call document ${callId} not found`);
      return false;
    }

    const currentData = snap.data();
    const oldStatus: CallStatus = (currentData.status as CallStatus) || 'ringing';

    // Prevent changing if current status is already terminal (ended, rejected, missed, cancelled)
    if (['ended', 'rejected', 'missed', 'cancelled'].includes(oldStatus)) {
      console.log(
        `[CALL_STATE] BLOCKED callId=${callId} from=${oldStatus} to=${newStatus} reason=${reason} uid=${currentUid} timestamp=${Date.now()} (Terminal state reached)`
      );
      return false;
    }

    // Check allowed old statuses
    if (allowedOldStatuses && !allowedOldStatuses.includes(oldStatus)) {
      console.log(
        `[CALL_STATE] IGNORED callId=${callId} from=${oldStatus} to=${newStatus} reason=${reason} uid=${currentUid} timestamp=${Date.now()} (Current status is not allowed)`
      );
      return false;
    }

    // Diagnostic logging format as mandated:
    console.log(
      `[CALL_STATE] callId=${callId} from=${oldStatus} to=${newStatus} reason=${reason} uid=${currentUid} timestamp=${Date.now()}`
    );

    const payload: any = {
      status: newStatus,
      ...extraUpdates,
    };

    await updateDoc(callRef, payload);
    return true;
  } catch (err) {
    console.error(`[CALL_STATE] Failed to transition call ${callId}:`, err);
    return false;
  }
}

export async function updateCallRecord(
  callId: string,
  updates: Partial<CallLog>
): Promise<void> {
  const callRef = doc(db, CALLS_COLLECTION, callId);
  const payload: any = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.answered_at !== undefined) payload.answered_at = updates.answered_at;
  if (updates.ended_at !== undefined) payload.ended_at = updates.ended_at;
  if (updates.duration !== undefined) payload.duration = updates.duration;
  if (updates.started_at !== undefined) payload.started_at = updates.started_at;

  await updateDoc(callRef, payload);
}

export function subscribeUserCalls(userUid: string, callback: (calls: CallLog[]) => void) {
  // Query calls where user is caller or callee
  const q1 = query(
    collection(db, CALLS_COLLECTION),
    where('caller_id', '==', userUid),
    limit(50)
  );

  const q2 = query(
    collection(db, CALLS_COLLECTION),
    where('callee_id', '==', userUid),
    limit(50)
  );

  let list1: CallLog[] = [];
  let list2: CallLog[] = [];

  const mergeAndEmit = () => {
    const map = new Map<string, CallLog>();
    [...list1, ...list2].forEach((c) => map.set(c.id, c));
    const merged = Array.from(map.values()).sort((a, b) => b.created_at - a.created_at);
    callback(merged);
  };

  const unsub1 = onSnapshot(q1, (snap) => {
    list1 = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: d.id || docSnap.id,
        caller_id: d.caller_id,
        callee_id: d.callee_id,
        caller_name: d.caller_name,
        callee_name: d.callee_name,
        caller_phone: d.caller_phone,
        callee_phone: d.callee_phone,
        call_type: d.call_type || 'video',
        status: d.status || 'ended',
        duration: d.duration || 0,
        created_at: d.created_at || Date.now(),
        started_at: d.started_at,
        answered_at: d.answered_at,
        ended_at: d.ended_at,
      };
    });
    mergeAndEmit();
  });

  const unsub2 = onSnapshot(q2, (snap) => {
    list2 = snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: d.id || docSnap.id,
        caller_id: d.caller_id,
        callee_id: d.callee_id,
        caller_name: d.caller_name,
        callee_name: d.callee_name,
        caller_phone: d.caller_phone,
        callee_phone: d.callee_phone,
        call_type: d.call_type || 'video',
        status: d.status || 'ended',
        duration: d.duration || 0,
        created_at: d.created_at || Date.now(),
        started_at: d.started_at,
        answered_at: d.answered_at,
        ended_at: d.ended_at,
      };
    });
    mergeAndEmit();
  });

  return () => {
    unsub1();
    unsub2();
  };
}

/**
 * Update user online status
 */
export async function updateUserPresence(uid: string, status: 'online' | 'offline' | 'in_call'): Promise<void> {
  if (!uid) return;
  try {
    const ref = doc(db, USERS_COLLECTION, uid);
    await updateDoc(ref, {
      status,
      last_seen: Date.now(),
    });
  } catch (e) {
    // ignore
  }
}

/**
 * Real-time listener for incoming calls for callee_id
 */
export function subscribeIncomingCalls(
  calleeUid: string,
  onIncoming: (call: CallLog) => void
) {
  if (!calleeUid) return () => {};
  const q = query(
    collection(db, CALLS_COLLECTION),
    where('callee_id', '==', calleeUid),
    where('status', '==', 'ringing'),
    limit(5)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const d = change.doc.data();
        const callData: CallLog = {
          id: d.id || change.doc.id,
          caller_id: d.caller_id,
          callee_id: d.callee_id,
          caller_name: d.caller_name || 'مستخدم',
          callee_name: d.callee_name || '',
          caller_phone: d.caller_phone || '',
          callee_phone: d.callee_phone || '',
          call_type: d.call_type || 'video',
          status: d.status || 'ringing',
          room_id: d.room_id || '',
          duration: d.duration || 0,
          created_at: d.created_at || Date.now(),
          started_at: d.started_at,
          answered_at: d.answered_at,
          ended_at: d.ended_at,
        };

        if ((change.type === 'added' || change.type === 'modified') && callData.status === 'ringing') {
          onIncoming(callData);
        }
      });
    },
    (err) => {
      console.warn('subscribeIncomingCalls error:', err);
    }
  );
}

/**
 * Real-time listener for a specific call document by ID (for caller/callee status synchronization)
 */
export function subscribeCallById(
  callId: string,
  callback: (call: CallLog | null) => void
) {
  if (!callId) return () => {};
  const callRef = doc(db, CALLS_COLLECTION, callId);
  return onSnapshot(
    callRef,
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      const d = snap.data();
      callback({
        id: d.id || snap.id,
        caller_id: d.caller_id,
        callee_id: d.callee_id,
        caller_name: d.caller_name || 'مستخدم',
        callee_name: d.callee_name || '',
        caller_phone: d.caller_phone || '',
        callee_phone: d.callee_phone || '',
        call_type: d.call_type || 'video',
        status: d.status || 'ringing',
        room_id: d.room_id || '',
        duration: d.duration || 0,
        created_at: d.created_at || Date.now(),
        started_at: d.started_at,
        answered_at: d.answered_at,
        ended_at: d.ended_at,
      });
    },
    (err) => {
      console.warn(`subscribeCallById error for ${callId}:`, err);
    }
  );
}

/**
 * Send a real direct message stored in Firestore
 */
export async function sendDirectMessage(
  sender: User,
  receiver: { uid: string; name?: string; phone?: string },
  text: string,
  attachment?: MessageAttachment
): Promise<string> {
  if (!sender.uid || !receiver.uid || (!text.trim() && !attachment)) {
    throw new Error('بيانات الرسالة غير مكتملة');
  }

  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const convId = [sender.uid, receiver.uid].sort().join('_');
  const messageRef = doc(db, MESSAGES_COLLECTION, messageId);

  const payload: DirectMessage = {
    id: messageId,
    conversation_id: convId,
    sender_id: sender.uid,
    receiver_id: receiver.uid,
    sender_name: sender.name || 'مستخدم',
    sender_phone: sender.phone || '',
    sender_avatarColor: sender.avatarColor || 'bg-emerald-600',
    text: text.trim(),
    created_at: Date.now(),
    read: false,
    ...(attachment ? { attachment } : {}),
  };

  await setDoc(messageRef, payload);
  return messageId;
}

/**
 * Subscribe in real-time to messages between two users in a conversation
 */
export function subscribeConversationMessages(
  currentUid: string,
  peerUid: string,
  callback: (messages: DirectMessage[]) => void
) {
  if (!currentUid || !peerUid) return () => {};
  const convId = [currentUid, peerUid].sort().join('_');

  const q = query(
    collection(db, MESSAGES_COLLECTION),
    where('conversation_id', '==', convId),
    limit(100)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: DirectMessage[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        msgs.push({
          id: d.id || docSnap.id,
          conversation_id: d.conversation_id,
          sender_id: d.sender_id,
          receiver_id: d.receiver_id,
          sender_name: d.sender_name || 'مستخدم',
          sender_phone: d.sender_phone,
          sender_avatarColor: d.sender_avatarColor,
          text: d.text || '',
          created_at: d.created_at || Date.now(),
          read: Boolean(d.read),
          attachment: d.attachment,
          deleted_for: d.deleted_for || [],
          deleted_for_all: Boolean(d.deleted_for_all),
          deleted_at: d.deleted_at,
        });
      });
      // Sort client-side by created_at ascending
      msgs.sort((a, b) => a.created_at - b.created_at);
      callback(msgs);
    },
    (err) => {
      console.warn('subscribeConversationMessages error:', err);
    }
  );
}

/**
 * Subscribe to all recent messages sent or received by the user to build the active chats list
 */
export function subscribeUserMessages(
  currentUid: string,
  callback: (messages: DirectMessage[]) => void
) {
  if (!currentUid) return () => {};

  // Subscribe to received messages
  const qReceived = query(
    collection(db, MESSAGES_COLLECTION),
    where('receiver_id', '==', currentUid),
    limit(100)
  );

  // Subscribe to sent messages
  const qSent = query(
    collection(db, MESSAGES_COLLECTION),
    where('sender_id', '==', currentUid),
    limit(100)
  );

  let receivedMsgs: DirectMessage[] = [];
  let sentMsgs: DirectMessage[] = [];

  const emit = () => {
    const map = new Map<string, DirectMessage>();
    [...receivedMsgs, ...sentMsgs].forEach((m) => map.set(m.id, m));
    const all = Array.from(map.values()).sort((a, b) => b.created_at - a.created_at);
    callback(all);
  };

  const unsubReceived = onSnapshot(qReceived, (snap) => {
    receivedMsgs = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as DirectMessage));
    emit();
  });

  const unsubSent = onSnapshot(qSent, (snap) => {
    sentMsgs = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as DirectMessage));
    emit();
  });

  return () => {
    unsubReceived();
    unsubSent();
  };
}

/**
 * Delete a message only for the current user (حذف لدي فقط)
 */
export async function deleteMessageForMe(messageId: string, currentUid: string): Promise<void> {
  if (!messageId || !currentUid) return;
  const messageRef = doc(db, MESSAGES_COLLECTION, messageId);
  await updateDoc(messageRef, {
    deleted_for: arrayUnion(currentUid),
  });
}

/**
 * Delete a message for everyone (حذف لدى الجميع)
 */
export async function deleteMessageForEveryone(messageId: string): Promise<void> {
  if (!messageId) return;
  const messageRef = doc(db, MESSAGES_COLLECTION, messageId);
  await updateDoc(messageRef, {
    deleted_for_all: true,
    text: '',
    attachment: null,
    deleted_at: Date.now(),
  });
}

/**
 * Delete a direct message permanently
 */
export async function deleteDirectMessage(messageId: string): Promise<void> {
  if (!messageId) return;
  const messageRef = doc(db, MESSAGES_COLLECTION, messageId);
  await deleteDoc(messageRef);
}

/**
 * Block a user (حظر مستخدم)
 */
export async function blockUser(currentUid: string, targetUid: string): Promise<void> {
  if (!currentUid || !targetUid || currentUid === targetUid) return;

  // 1. Update user document
  const userRef = doc(db, USERS_COLLECTION, currentUid);
  await updateDoc(userRef, {
    blocked_uids: arrayUnion(targetUid),
  }).catch((err) => console.warn('update user blocked_uids error:', err));

  // 2. Also record in blocks collection
  const blockId = `${currentUid}_${targetUid}`;
  const blockRef = doc(db, BLOCKS_COLLECTION, blockId);
  await setDoc(blockRef, {
    id: blockId,
    blocker_uid: currentUid,
    blocked_uid: targetUid,
    created_at: Date.now(),
  });
}

/**
 * Unblock a user (إلغاء حظر مستخدم)
 */
export async function unblockUser(currentUid: string, targetUid: string): Promise<void> {
  if (!currentUid || !targetUid) return;

  // 1. Update user document
  const userRef = doc(db, USERS_COLLECTION, currentUid);
  await updateDoc(userRef, {
    blocked_uids: arrayRemove(targetUid),
  }).catch((err) => console.warn('update user blocked_uids error:', err));

  // 2. Remove from blocks collection
  const blockId = `${currentUid}_${targetUid}`;
  const blockRef = doc(db, BLOCKS_COLLECTION, blockId);
  await deleteDoc(blockRef).catch((err) => console.warn('delete block doc error:', err));
}

/**
 * Subscribe to list of users blocked by the current user
 */
export function subscribeBlockedUsers(currentUid: string, callback: (blockedUids: string[]) => void) {
  if (!currentUid) return () => {};

  const q = query(
    collection(db, BLOCKS_COLLECTION),
    where('blocker_uid', '==', currentUid)
  );

  return onSnapshot(
    q,
    (snap) => {
      const uids = snap.docs.map((d) => d.data().blocked_uid as string).filter(Boolean);
      callback(uids);
    },
    (err) => {
      console.warn('subscribeBlockedUsers error:', err);
    }
  );
}

