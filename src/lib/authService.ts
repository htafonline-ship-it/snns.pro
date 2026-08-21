import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from './firebase';
import { saveUserProfile, getUserProfile, updateUserPresence } from './firestoreService';
import { User } from '../types';

/**
 * Format phone or username into Firebase Auth compatible email
 */
export function formatAuthEmail(identifier: string): string {
  const clean = identifier.trim().replace(/\s+/g, '').toLowerCase();
  if (clean.includes('@')) {
    return clean;
  }
  return `${clean}@tawasul.internal`;
}

/**
 * Sign in using Google (Default provisioned provider in Firebase)
 */
export async function loginWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  
  const userCredential = await signInWithPopup(auth, provider);
  const firebaseUser = userCredential.user;
  const firebaseUid = firebaseUser.uid;

  let profile = await getUserProfile(firebaseUid);
  if (!profile) {
    const colors = [
      'bg-emerald-600',
      'bg-blue-600',
      'bg-indigo-600',
      'bg-purple-600',
      'bg-rose-600',
      'bg-amber-600',
      'bg-teal-600',
      'bg-cyan-600',
    ];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];
    const email = firebaseUser.email || '';
    const name = firebaseUser.displayName || email.split('@')[0] || 'مستخدم تواصل';
    const cleanUsername = (email.split('@')[0] || `user_${firebaseUid.substring(0, 5)}`).replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Check if admin
    const isAdmin =
      email.toLowerCase() === 'htaf.online@gmail.com' ||
      cleanUsername.includes('1007363904') ||
      cleanUsername === 'admin';

    profile = {
      uid: firebaseUid,
      phone: email.split('@')[0] || firebaseUid.substring(0, 8),
      name: name,
      display_name: name,
      username: cleanUsername,
      photo_url: firebaseUser.photoURL || undefined,
      avatarColor,
      role: isAdmin ? 'admin' : 'user',
      isStealth: isAdmin,
      isCallLocked: false,
      status: 'online',
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };
    await saveUserProfile(firebaseUid, profile);
  } else {
    await updateUserPresence(firebaseUid, 'online');
  }

  return profile;
}

/**
 * Register a new user in Firebase Authentication and Firestore
 * Guaranteed: `uid === Firebase Auth UID`
 */
export async function registerWithFirebase(params: {
  phone: string;
  name: string;
  password: string;
  username?: string;
  role?: 'admin' | 'user';
  isStealth?: boolean;
}): Promise<User> {
  const { phone, name, password, username, role, isStealth } = params;
  const email = formatAuthEmail(phone);

  const colors = [
    'bg-emerald-600',
    'bg-blue-600',
    'bg-indigo-600',
    'bg-purple-600',
    'bg-rose-600',
    'bg-amber-600',
    'bg-teal-600',
    'bg-cyan-600',
  ];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  let userCredential;
  try {
    userCredential = await createUserWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    if (err.code === 'auth/email-already-in-use') {
      // If already registered in auth, sign in
      userCredential = await signInWithEmailAndPassword(auth, email, password);
    } else if (err.code === 'auth/operation-not-allowed') {
      throw new Error(
        'موفر البريد/كلمة المرور غير مفعّل في Firebase Authentication. يرجى تسجيل الدخول السريع عبر زر Google أدناه، أو تفعيل Email/Password في Firebase Console.'
      );
    } else {
      throw err;
    }
  }

  const firebaseUid = userCredential.user.uid;

  const userData: User = {
    uid: firebaseUid, // Strictly Firebase Auth UID
    phone: phone.trim().replace(/\s+/g, ''),
    name: name.trim(),
    display_name: name.trim(),
    username: (username || '').trim().replace(/\s+/g, '_'),
    avatarColor,
    role: role || (phone === '1007363904' ? 'admin' : 'user'),
    isStealth: isStealth ?? phone === '1007363904',
    isCallLocked: false,
    status: 'online',
    lastSeen: Date.now(),
    createdAt: Date.now(),
  };

  // Save to Firestore users/{firebase_uid}
  await saveUserProfile(firebaseUid, userData);
  return userData;
}

/**
 * Sign in existing user with Firebase Authentication
 */
export async function loginWithFirebase(
  identifier: string,
  password: string
): Promise<User> {
  const email = formatAuthEmail(identifier);
  let userCredential;

  try {
    userCredential = await signInWithEmailAndPassword(auth, email, password);
  } catch (err: any) {
    if (err.code === 'auth/operation-not-allowed') {
      throw new Error(
        'موفر البريد/كلمة المرور غير مفعّل في Firebase Authentication. يرجى تسجيل الدخول السريع عبر زر Google أدناه، أو تفعيل Email/Password في Firebase Console.'
      );
    }
    
    // If account doesn't exist yet in Auth, auto-provision for requested demo/admin numbers
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      const clean = identifier.trim().replace(/\s+/g, '');
      const isReqAdmin = clean === '1007363904' || clean === 'admin';
      const isReqUser = clean === '139213' || clean === 'stealth_user';

      if (isReqAdmin || isReqUser) {
        return await registerWithFirebase({
          phone: isReqAdmin ? '1007363904' : '139213',
          name: isReqAdmin ? 'المشرف العام (Admin)' : 'المستخدم المحمي (Secure User)',
          password: password,
          username: isReqAdmin ? 'admin' : 'stealth_user',
          role: isReqAdmin ? 'admin' : 'user',
          isStealth: isReqAdmin,
        });
      }
    }
    throw err;
  }

  const firebaseUid = userCredential.user.uid;

  // Retrieve user document from Firestore
  let profile = await getUserProfile(firebaseUid);
  if (!profile) {
    // Bootstrap profile if missing
    profile = {
      uid: firebaseUid,
      phone: identifier.trim().replace(/\s+/g, ''),
      name: identifier.trim(),
      avatarColor: 'bg-emerald-600',
      role: identifier === '1007363904' ? 'admin' : 'user',
      isStealth: identifier === '1007363904',
      isCallLocked: false,
      status: 'online',
      lastSeen: Date.now(),
    };
    await saveUserProfile(firebaseUid, profile);
  } else {
    await updateUserPresence(firebaseUid, 'online');
  }

  return profile;
}

/**
 * Sign out
 */
export async function logoutUser(uid?: string): Promise<void> {
  if (uid) {
    await updateUserPresence(uid, 'offline');
  }
  await firebaseSignOut(auth);
}

export const logoutFromFirebase = logoutUser;

/**
 * Subscribe to auth changes
 */
export function onAuthUserChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      const profile = await getUserProfile(firebaseUser.uid);
      callback(profile);
    } else {
      callback(null);
    }
  });
}

export const subscribeAuth = onAuthUserChanged;

