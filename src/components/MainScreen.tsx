import React, { useState, useEffect, useRef } from 'react';
import { User, CallType, CallLog, Contact } from '../types';
import {
  Phone,
  Video,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Search,
  LogOut,
  Sparkles,
  Camera,
  Mic,
  ShieldCheck,
  CheckCircle,
  Delete,
  UserCheck,
  Copy,
  Check,
  Play,
  RotateCcw,
  Clock,
  Crown,
  EyeOff,
  Eye,
  Trash2,
  Lock,
  Unlock,
  Activity,
  Server,
  Users,
  UserPlus,
  Edit3,
  AtSign,
  X,
  User as UserIcon,
  ShieldAlert,
  MessageSquare,
} from 'lucide-react';
import {
  subscribeAllUsers,
  subscribeContacts,
  subscribeUserCalls,
  addContact,
  deleteContact,
  saveUserProfile,
  searchUserByPhoneOrUsername,
} from '../lib/firestoreService';
import { getMediaStream } from '../utils/webrtc';
import { ChatView } from './ChatView';

interface MainScreenProps {
  currentUser: User;
  onLogout: () => void;
  onStartCall: (targetUser: User, callType: CallType, isSimulated?: boolean) => void;
  onlineUids: string[];
  isWsConnected: boolean;
}

export const MainScreen: React.FC<MainScreenProps> = ({
  currentUser,
  onLogout,
  onStartCall,
  onlineUids,
  isWsConnected,
}) => {
  const [userProfile, setUserProfile] = useState<User>(currentUser);
  const [activeTab, setActiveTab] = useState<'contacts' | 'chats' | 'history' | 'test' | 'admin'>('contacts');
  const [chatTargetUser, setChatTargetUser] = useState<User | null>(null);
  const [dialNumber, setDialNumber] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Stealth / Secure Hidden Mode state
  const [isStealthMode, setIsStealthMode] = useState<boolean>(true);
  const [isCallLocked, setIsCallLocked] = useState<boolean>(Boolean(userProfile.isCallLocked));

  // Modals state
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);

  // Add Contact Form
  const [contactInput, setContactInput] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);

  // Edit Profile Form
  const [editName, setEditName] = useState(userProfile.name);
  const [editUsername, setEditUsername] = useState(userProfile.username || '');
  const [editLoading, setEditLoading] = useState(false);

  // Admin Metrics state
  const [adminMetrics, setAdminMetrics] = useState<{
    onlineUsersCount: number;
    onlineUids: string[];
    serverUptimeSeconds: number;
  } | null>(null);

  // Test Camera and Audio state
  const testVideoRef = useRef<HTMLVideoElement>(null);
  const [testStream, setTestStream] = useState<MediaStream | null>(null);
  const [micVolume, setMicVolume] = useState(0);
  const [isTestCameraRunning, setIsTestCameraRunning] = useState(false);

  const isAdmin = userProfile.phone === '1007363904' || userProfile.role === 'admin';

  // Real-time Firestore Subscriptions
  useEffect(() => {
    // 1. Subscribe to all registered users in Firestore
    setLoadingUsers(true);
    const unsubUsers = subscribeAllUsers(currentUser.uid, (usersList) => {
      setAllUsers(usersList);
      setLoadingUsers(false);
    });

    // 2. Subscribe to user contacts
    const unsubContacts = subscribeContacts(currentUser.uid, (contactsList) => {
      setContacts(contactsList);
    });

    // 3. Subscribe to calls history
    const unsubCalls = subscribeUserCalls(currentUser.uid, (callsList) => {
      setCallHistory(callsList);
    });

    return () => {
      unsubUsers();
      unsubContacts();
      unsubCalls();
    };
  }, [currentUser.uid]);

  // Fetch admin metrics if admin
  useEffect(() => {
    if (!isAdmin) return;
    const fetchMetrics = async () => {
      try {
        const res = await fetch(`/api/admin/metrics?uid=${currentUser.uid}&phone=${currentUser.phone}`);
        if (res.ok) {
          const data = await res.json();
          setAdminMetrics(data);
        }
      } catch (err) {
        console.error('Failed to fetch admin metrics:', err);
      }
    };
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, [currentUser, isAdmin]);

  // Clean up test stream on unmount or tab switch
  useEffect(() => {
    if (activeTab !== 'test' && testStream) {
      testStream.getTracks().forEach((track) => track.stop());
      setTestStream(null);
      setIsTestCameraRunning(false);
    }
  }, [activeTab]);

  // Toggle Call Lock (إقفال الاتصال الوارد)
  const handleToggleCallLock = async () => {
    const nextState = !isCallLocked;
    setIsCallLocked(nextState);
    try {
      await saveUserProfile(currentUser.uid, { isCallLocked: nextState });
      setUserProfile((prev) => ({ ...prev, isCallLocked: nextState }));
    } catch (err) {
      console.error('Failed to update call lock state in Firestore:', err);
    }
  };

  // Handle Edit Profile
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setEditLoading(true);
    try {
      const updates = {
        name: editName.trim(),
        display_name: editName.trim(),
        username: editUsername.trim().replace(/\s+/g, '_'),
      };
      await saveUserProfile(currentUser.uid, updates);
      setUserProfile((prev) => ({ ...prev, ...updates }));
      setShowEditProfileModal(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setEditLoading(false);
    }
  };

  // Handle Add Contact
  const handleAddContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    setContactSuccess(null);

    if (!contactInput.trim()) {
      setContactError('يرجى إدخال رقم الهاتف أو اسم المستخدم للطرف الآخر');
      return;
    }

    setContactLoading(true);
    try {
      // Find target user in Firestore
      const targetUser = await searchUserByPhoneOrUsername(contactInput.trim());
      if (!targetUser) {
        setContactError('لم يتم العثور على مستخدم مسجل بهذا الرقم أو اسم المستخدم');
        setContactLoading(false);
        return;
      }

      if (targetUser.uid === currentUser.uid) {
        setContactError('لا يمكنك إضافة نفسك كجهة اتصال');
        setContactLoading(false);
        return;
      }

      await addContact(currentUser.uid, targetUser.uid, {
        name: contactName.trim() || targetUser.name,
        phone: targetUser.phone,
        username: targetUser.username,
        avatarColor: targetUser.avatarColor,
      });

      setContactSuccess(`تمت إضافة ${targetUser.name} بنجاح إلى جهات اتصالك`);
      setContactInput('');
      setContactName('');
      setTimeout(() => {
        setShowAddContactModal(false);
        setContactSuccess(null);
      }, 1500);
    } catch (err: any) {
      setContactError(err.message || 'حدث خطأ أثناء إضافة جهة الاتصال');
    } finally {
      setContactLoading(false);
    }
  };

  // Keypad dial handler
  const handleDialClick = (digit: string) => {
    setDialNumber((prev) => prev + digit);
  };

  const handleDialDelete = () => {
    setDialNumber((prev) => prev.slice(0, -1));
  };

  // Initiate call to dialed number
  const handleDialCall = async (type: CallType) => {
    if (!dialNumber.trim()) return;
    const clean = dialNumber.trim();

    // Check if matching in loaded users
    let target = allUsers.find(
      (u) =>
        u.phone === clean ||
        (u.username && u.username.toLowerCase() === clean.toLowerCase().replace('@', ''))
    );

    if (!target) {
      // Search in Firestore
      target = (await searchUserByPhoneOrUsername(clean)) || undefined;
    }

    if (target) {
      handleInitiateCall(target, type);
    } else {
      // Create transient target with requested identifier
      const pseudoTarget: User = {
        uid: `user_${clean}`,
        phone: clean,
        name: `مستخدم (${clean})`,
        avatarColor: 'bg-emerald-600',
      };
      handleInitiateCall(pseudoTarget, type);
    }
  };

  const handleInitiateCall = (targetUser: User, callType: CallType, isSimulated = false) => {
    stopHardwareTest();
    onStartCall(targetUser, callType, isSimulated);
  };

  // Camera & Mic Hardware Test
  const startHardwareTest = async () => {
    try {
      const stream = await getMediaStream('video', 'user', currentUser.name);
      setTestStream(stream);
      setIsTestCameraRunning(true);

      if (testVideoRef.current) {
        testVideoRef.current.srcObject = stream;
      }

      // Audio visualizer
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        const micSource = audioCtx.createMediaStreamSource(stream);
        micSource.connect(analyser);
        analyser.fftSize = 64;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const checkVolume = () => {
          if (!stream.active) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
          requestAnimationFrame(checkVolume);
        };
        checkVolume();
      } catch (e) {
        console.warn('AudioContext visualization not supported:', e);
      }
    } catch (err) {
      console.error('Hardware test failed:', err);
    }
  };

  const stopHardwareTest = () => {
    if (testStream) {
      testStream.getTracks().forEach((t) => t.stop());
      setTestStream(null);
      setIsTestCameraRunning(false);
      setMicVolume(0);
    }
  };

  // Filter users
  const isTargetAdmin = (u: User) => u.phone === '1007363904' || u.role === 'admin';

  const visibleUsers = allUsers.filter((u) => {
    // Current user doesn't call themselves
    if (u.uid === currentUser.uid) return false;
    // Non-admin users cannot see admin in directory for stealth
    if (!isAdmin && isTargetAdmin(u)) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      u.name.toLowerCase().includes(q) ||
      u.phone.includes(q) ||
      (u.username && u.username.toLowerCase().includes(q))
    );
  });

  const isUserOnline = (user: User) => {
    return onlineUids.includes(user.uid) || user.status === 'online';
  };

  const copyAppUrl = () => {
    navigator.clipboard.writeText(window.location.origin).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex flex-col font-sans select-none overflow-x-hidden" dir="rtl">
      
      {/* Top Professional Navigation Bar */}
      <header className="bg-[#128C7E] text-white shadow-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              <Video className="w-6 h-6 text-white stroke-[2.2]" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl sm:text-2xl tracking-tight leading-none text-white font-mono">
                SNNS
              </h1>
              <p className="text-[11px] text-white/80 font-medium mt-1">
                مكالمات فيديو وصوتية فائقة السرعة
              </p>
            </div>
          </div>

          {/* User Status, Call Lock & Profile Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Call Lock (إقفال الاتصال الوارد) Button */}
            <button
              type="button"
              id="call-lock-toggle-btn"
              onClick={handleToggleCallLock}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm ${
                isCallLocked
                  ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                  : 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
              }`}
              title={isCallLocked ? 'الاتصال الوارد مقفل (لا أحد يستطيع الاتصال بك)' : 'الاتصال الوارد متاح'}
            >
              {isCallLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {isCallLocked ? 'الاتصال مقفل (محمي)' : 'استقبال المكالمات'}
              </span>
            </button>

            {/* Profile Dropdown Badge */}
            <div
              onClick={() => setShowEditProfileModal(true)}
              className="flex items-center gap-2 bg-black/20 hover:bg-black/30 border border-white/10 px-3 py-1.5 rounded-xl cursor-pointer transition"
              title="تعديل الاسم واسم المستخدم"
            >
              <div className={`w-7 h-7 rounded-lg ${userProfile.avatarColor || 'bg-emerald-600'} flex items-center justify-center text-xs font-bold text-white shadow`}>
                {userProfile.name.charAt(0)}
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-white flex items-center gap-1">
                  <span>{userProfile.name}</span>
                  {isAdmin && <Crown className="w-3 h-3 text-amber-300" />}
                </div>
                <div className="text-[10px] text-white/70 font-mono" dir="ltr">
                  {userProfile.username ? `@${userProfile.username}` : userProfile.phone}
                </div>
              </div>
              <Edit3 className="w-3 h-3 text-white/60 hover:text-white" />
            </div>

            {/* Logout Button */}
            <button
              type="button"
              id="logout-btn"
              onClick={onLogout}
              className="p-2 rounded-xl bg-white/15 hover:bg-rose-600 text-white transition border border-white/10"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </header>

      {/* Main Multi-Tab Navigation Strip */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-16 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <div className="flex space-x-1 sm:space-x-4 space-x-reverse py-2">
            
            <button
              type="button"
              id="tab-contacts-btn"
              onClick={() => setActiveTab('contacts')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                activeTab === 'contacts'
                  ? 'bg-[#128C7E] text-white shadow-md shadow-teal-900/10'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>دليل جهات الاتصال</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${activeTab === 'contacts' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                {visibleUsers.length}
              </span>
            </button>

            <button
              type="button"
              id="tab-chats-btn"
              onClick={() => setActiveTab('chats')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                activeTab === 'chats'
                  ? 'bg-[#128C7E] text-white shadow-md shadow-teal-900/10'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>الرسائل والمحادثات</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500 text-white font-bold">
                مباشر
              </span>
            </button>

            <button
              type="button"
              id="tab-history-btn"
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                activeTab === 'history'
                  ? 'bg-[#128C7E] text-white shadow-md shadow-teal-900/10'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>سجل المكالمات</span>
              {callHistory.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${activeTab === 'history' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                  {callHistory.length}
                </span>
              )}
            </button>

            <button
              type="button"
              id="tab-test-btn"
              onClick={() => setActiveTab('test')}
              className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                activeTab === 'test'
                  ? 'bg-[#128C7E] text-white shadow-md shadow-teal-900/10'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>فحص الأجهزة & مكالمة تجريبية</span>
            </button>

            {isAdmin && (
              <button
                type="button"
                id="tab-admin-btn"
                onClick={() => setActiveTab('admin')}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition flex items-center gap-2 ${
                  activeTab === 'admin'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-900/20'
                    : 'text-amber-700 hover:bg-amber-50'
                }`}
              >
                <Crown className="w-4 h-4" />
                <span>لوحة التحكم الإدارية</span>
              </button>
            )}

          </div>

          {/* Quick Add Contact Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              id="open-add-contact-btn"
              onClick={() => setShowAddContactModal(true)}
              className="bg-[#25D366] hover:bg-[#1ebd5e] text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition transform active:scale-95"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">إضافة جهة اتصال</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        
        {/* Tab 1: Contacts Directory + Quick Dial Pad */}
    {activeTab === 'contacts' && (
  <div className="max-w-6xl mx-auto space-y-5">

    {/* Search */}
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-5 py-4 flex items-center gap-3">
      <Search className="w-5 h-5 text-gray-400 shrink-0" />

      <input
        type="text"
        id="search-users-input"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="ابحث بالاسم، اسم المستخدم، أو رقم الهاتف..."
        className="w-full text-sm outline-none text-gray-900 placeholder-gray-400 font-semibold bg-transparent"
      />

      {searchQuery && (
        <button
          type="button"
          onClick={() => setSearchQuery('')}
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowAddContactModal(true)}
        className="hidden sm:flex shrink-0 items-center gap-2 bg-[#25D366] hover:bg-[#1ebd5e] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition"
      >
        <UserPlus className="w-4 h-4" />
        إضافة جهة اتصال
      </button>
    </div>

    {/* Users */}
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-5 sm:p-6">

      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-[#128C7E]" />
            جهات الاتصال
          </h3>

          <p className="text-xs text-gray-400 mt-1">
            اختر المستخدم لبدء رسالة أو مكالمة
          </p>
        </div>

        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-[#128C7E] text-[11px] font-bold">
          <span className="w-2 h-2 rounded-full bg-[#25D366]" />
          {onlineUids.length} متصل الآن
        </span>
      </div>

      {loadingUsers ? (
        <div className="py-20 text-center text-gray-400 text-xs flex flex-col items-center">
          <span className="w-8 h-8 border-2 border-[#128C7E]/30 border-t-[#128C7E] rounded-full animate-spin mb-3" />
          <span>جاري تحميل جهات الاتصال...</span>
        </div>
      ) : visibleUsers.length === 0 ? (
        <div className="py-20 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-gray-300" />
          </div>

          <h4 className="font-bold text-gray-800 mb-1">
            لا توجد جهات اتصال
          </h4>

          <p className="text-xs text-gray-400 mb-5">
            أضف مستخدمًا للبدء بالتواصل
          </p>

          <button
            type="button"
            onClick={() => setShowAddContactModal(true)}
            className="px-5 py-2.5 bg-[#128C7E] text-white rounded-xl font-bold text-xs hover:bg-[#0e6b60] transition"
          >
            إضافة جهة اتصال
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleUsers.map((user) => {
            const isOnline = isUserOnline(user);
            const isLocked = Boolean(user.isCallLocked);

            return (
              <div
                key={user.uid}
                className="group rounded-2xl border border-gray-100 bg-gray-50/70 hover:bg-white hover:border-emerald-200 hover:shadow-lg hover:shadow-gray-100 transition-all duration-200 p-4"
              >
                {/* User info */}
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">

                    <div
                      className={`w-14 h-14 rounded-2xl ${
                        user.avatarColor || 'bg-emerald-600'
                      } flex items-center justify-center text-white text-xl font-black shadow-sm`}
                    >
                      {user.name.charAt(0)}
                    </div>

                    <span
                      className={`absolute -bottom-1 -left-1 w-4 h-4 rounded-full border-[3px] border-white ${
                        isOnline ? 'bg-[#25D366]' : 'bg-gray-400'
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-sm text-gray-900 truncate">
                        {user.name}
                      </h4>

                      {isLocked && (
                        <Lock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      )}
                    </div>

                    {user.username && (
                      <p
                        className="text-xs font-bold text-[#128C7E] truncate"
                        dir="ltr"
                      >
                        @{user.username}
                      </p>
                    )}

                    {user.phone && (
                      <p
                        className="text-[11px] text-gray-400 font-mono truncate mt-0.5"
                        dir="ltr"
                      >
                        {user.phone}
                      </p>
                    )}
                  </div>

                  <span
                    className={`shrink-0 text-[10px] px-2.5 py-1 rounded-full font-bold ${
                      isOnline
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isOnline ? 'متصل' : 'غير متصل'}
                  </span>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-200/70">

                  <button
                    type="button"
                    id={`chat-user-${user.uid}`}
                    onClick={() => {
                      setChatTargetUser(user);
                      setActiveTab('chats');
                    }}
                    className="h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <MessageSquare className="w-4 h-4 text-[#128C7E]" />
                    رسالة
                  </button>

                  <button
                    type="button"
                    id={`call-audio-${user.uid}`}
                    onClick={() => handleInitiateCall(user, 'audio')}
                    disabled={isLocked}
                    className="h-10 rounded-xl bg-[#128C7E] hover:bg-[#0e7166] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Phone className="w-4 h-4" />
                    صوتي
                  </button>

                  <button
                    type="button"
                    id={`call-video-${user.uid}`}
                    onClick={() => handleInitiateCall(user, 'video')}
                    disabled={isLocked}
                    className="h-10 rounded-xl bg-[#25D366] hover:bg-[#1fbd5c] disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Video className="w-4 h-4" />
                    فيديو
                  </button>

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* Mobile add button */}
    <button
      type="button"
      onClick={() => setShowAddContactModal(true)}
      className="sm:hidden w-full bg-[#25D366] text-white py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
    >
      <UserPlus className="w-4 h-4" />
      إضافة جهة اتصال
    </button>

  </div>
)}
        {/* Tab 2: Direct Messages (المحادثات النصية الحقيقية) */}
        {activeTab === 'chats' && (
          <div className="animate-in fade-in duration-200">
            <ChatView
              currentUser={currentUser}
              allUsers={allUsers}
              contacts={contacts}
              onlineUids={onlineUids}
              onStartCall={handleInitiateCall}
              initialTargetUser={chatTargetUser}
              onClearInitialTarget={() => setChatTargetUser(null)}
            />
          </div>
        )}

        {/* Tab 3: Call History */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-3xl border border-gray-200/90 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#128C7E]" />
                  <span>سجل المكالمات الموثق في Firestore</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  جميع المكالمات المسجلة لحسابك
                </p>
              </div>
            </div>

            {callHistory.length === 0 ? (
              <div className="py-20 text-center text-gray-400 text-xs flex flex-col items-center">
                <PhoneMissed className="w-12 h-12 text-gray-300 mb-3" />
                <p className="font-bold text-gray-600 text-sm mb-1">لا توجد مكالمات مسجلة بعد</p>
                <p className="text-gray-400">ستظهر هنا المكالمات الواردة والصادرة تلقائياً عند إجرائها.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {callHistory.map((call) => {
                    const isOutgoing = call.caller_id === currentUser.uid;
                    const peerName = isOutgoing ? call.callee_name : call.caller_name;
                    const peerPhone = isOutgoing ? call.callee_phone : call.caller_phone;

                    const getStatusBadge = () => {
                      switch (call.status) {
                        case 'ringing':
                        case 'initiated':
                          return { text: 'جاري الاتصال...', className: 'bg-amber-100 text-amber-800 animate-pulse' };
                        case 'accepted':
                          return { text: 'مقبولة', className: 'bg-teal-100 text-teal-800' };
                        case 'ended':
                          return { text: 'مكتملة', className: 'bg-emerald-100 text-emerald-800' };
                        case 'rejected':
                          return { text: 'مرفوضة', className: 'bg-rose-100 text-rose-700' };
                        case 'missed':
                          return { text: 'فائتة', className: 'bg-rose-100 text-rose-700' };
                        case 'cancelled':
                          return { text: 'ملغاة', className: 'bg-gray-100 text-gray-700' };
                        case 'failed':
                          return { text: 'فشل الاتصال', className: 'bg-red-100 text-red-800' };
                        default:
                          return { text: call.status || 'غير محدد', className: 'bg-gray-100 text-gray-600' };
                      }
                    };

                    const badge = getStatusBadge();

                    return (
                      <div key={call.id} className="py-4 flex items-center justify-between hover:bg-gray-50/80 px-3 rounded-2xl transition">
                        <div className="flex items-center gap-3.5">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                            call.status === 'missed' || call.status === 'rejected'
                              ? 'bg-rose-50 text-rose-600'
                              : isOutgoing
                              ? 'bg-emerald-50 text-emerald-600'
                              : 'bg-blue-50 text-blue-600'
                          }`}>
                            {call.status === 'missed' ? (
                              <PhoneMissed className="w-5 h-5" />
                            ) : isOutgoing ? (
                              <PhoneOutgoing className="w-5 h-5" />
                            ) : (
                              <PhoneIncoming className="w-5 h-5" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-gray-900">{peerName}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-bold">
                                {call.call_type === 'video' ? 'فيديو' : 'صوتي'}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${badge.className}`}>
                                {badge.text}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              <span className="font-mono" dir="ltr">{peerPhone}</span>
                              <span>•</span>
                              <span>{new Date(call.created_at).toLocaleTimeString('ar-SA')}</span>
                              {call.duration > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="font-mono text-emerald-700 font-bold">{call.duration} ثانية</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const target: User = {
                              uid: isOutgoing ? call.callee_id : call.caller_id,
                              phone: peerPhone || '',
                              name: peerName,
                              avatarColor: 'bg-emerald-600',
                            };
                            handleInitiateCall(target, call.call_type);
                          }}
                          className="p-2.5 rounded-xl bg-emerald-50 hover:bg-[#25D366] text-[#128C7E] hover:text-white transition shadow-sm"
                          title="إعادة الاتصال"
                        >
                          {call.call_type === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Hardware Test & Simulated Echo */}
        {activeTab === 'test' && (
          <div className="bg-white rounded-3xl border border-gray-200/90 shadow-sm p-6 sm:p-8 max-w-4xl mx-auto">
            <div className="text-center max-w-lg mx-auto mb-8">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#128C7E] flex items-center justify-center mx-auto mb-4 border border-emerald-200">
                <Camera className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">فحص الكاميرا والميكروفون</h3>
              <p className="text-xs sm:text-sm text-gray-500">
                تأكد من عمل أجهزة الإدخال والصوت ومستوى الحساسية قبل إجراء المكالمات المباشرة.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Video Camera Preview */}
              <div className="bg-slate-900 rounded-2xl overflow-hidden aspect-video relative flex items-center justify-center border-2 border-slate-800 shadow-inner">
                {isTestCameraRunning ? (
                  <video
                    ref={testVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                ) : (
                  <div className="text-center p-6 text-slate-500">
                    <Camera className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <p className="text-xs font-bold">الكاميرا متوقفة حالياً</p>
                  </div>
                )}

                {isTestCameraRunning && (
                  <span className="absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-md bg-[#25D366] text-emerald-950 font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-950 animate-ping" />
                    بث حي مباشر
                  </span>
                )}
              </div>

              {/* Controls & Mic Sensitivity Bar */}
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between text-xs font-bold text-gray-700 mb-2">
                    <span className="flex items-center gap-1.5">
                      <Mic className="w-4 h-4 text-[#128C7E]" />
                      مستوى حساسية الميكروفون
                    </span>
                    <span className="font-mono text-[#128C7E]">{micVolume}%</span>
                  </div>
                  
                  {/* Progress Bar */}
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden p-0.5 border border-gray-200">
                    <div
                      className="h-full bg-gradient-to-r from-[#25D366] to-[#128C7E] rounded-full transition-all duration-75"
                      style={{ width: `${micVolume}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-col gap-3">
                  {!isTestCameraRunning ? (
                    <button
                      type="button"
                      onClick={startHardwareTest}
                      className="w-full bg-[#128C7E] hover:bg-[#0f7267] text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition"
                    >
                      <Play className="w-4 h-4" />
                      <span>بدء تشغيل فحص الكاميرا والميكروفون</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopHardwareTest}
                      className="w-full bg-rose-600 hover:bg-rose-700 text-white py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md transition"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>إيقاف الفحص</span>
                    </button>
                  )}

                  {/* Simulated Call Trigger */}
                  <button
                    type="button"
                    onClick={() => {
                      const simulatedUser: User = {
                        uid: 'simulated-bot',
                        phone: '1007363904',
                        name: 'مساعد تواصل التجريبي (Echo Bot)',
                        avatarColor: 'bg-[#128C7E]',
                      };
                      handleInitiateCall(simulatedUser, 'video', true);
                    }}
                    className="w-full bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[#128C7E] py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    <Sparkles className="w-4 h-4 text-[#25D366]" />
                    <span>إجراء مكالمة مرئية تجريبية كاملة (Echo Simulation)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Admin Control Dashboard */}
        {activeTab === 'admin' && isAdmin && (
          <div className="bg-white rounded-3xl border border-amber-200 shadow-lg p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Crown className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">لوحة الإدارة المشفرة</h3>
                  <p className="text-xs text-gray-500 font-mono">حساب المشرف العام: {currentUser.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 rounded-full text-amber-800 text-xs font-bold border border-amber-200">
                <ShieldAlert className="w-4 h-4" />
                <span>صلاحيات المدير الكاملة</span>
              </div>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-500 font-bold block">إجمالي المستخدمين في Firestore</span>
                  <span className="text-2xl font-bold font-mono text-gray-900">{allUsers.length}</span>
                </div>
                <Users className="w-8 h-8 text-gray-400" />
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-emerald-700 font-bold block">المتصلون الآن بالخادم</span>
                  <span className="text-2xl font-bold font-mono text-emerald-900">{onlineUids.length}</span>
                </div>
                <Activity className="w-8 h-8 text-emerald-500" />
              </div>

              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-between">
                <div>
                  <span className="text-xs text-blue-700 font-bold block">المكالمات المسجلة</span>
                  <span className="text-2xl font-bold font-mono text-blue-900">{callHistory.length}</span>
                </div>
                <Server className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Modal 1: Add Contact */}
      {showAddContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100 text-right">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#25D366]" />
                <span>إضافة جهة اتصال جديدة</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddContactModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {contactError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold">
                {contactError}
              </div>
            )}

            {contactSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>{contactSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAddContactSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  رقم الهاتف أو اسم المستخدم للطرف الآخر
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={contactInput}
                  onChange={(e) => setContactInput(e.target.value)}
                  placeholder="05XXXXXXXX أو username"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-900 outline-none focus:ring-2 focus:ring-[#25D366]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  الاسم المخصص (اختياري)
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="مثال: صديقي يوسف"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-[#25D366]"
                />
              </div>

              <button
                type="submit"
                disabled={contactLoading}
                className="w-full bg-[#25D366] hover:bg-[#1ebd5e] text-white py-3 rounded-xl font-bold text-xs shadow-lg shadow-green-200/80 transition disabled:opacity-50"
              >
                {contactLoading ? 'جاري البحث والحفظ في Firestore...' : 'إضافة جهة الاتصال'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Edit Profile */}
      {showEditProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100 text-right">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#128C7E]" />
                <span>تعديل الملف الشخصي</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditProfileModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  الاسم المعروض (Display Name)
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 outline-none focus:ring-2 focus:ring-[#128C7E]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  اسم المستخدم (Username)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-900 outline-none focus:ring-2 focus:ring-[#128C7E]"
                />
              </div>

              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs">
                <span className="text-gray-500 block mb-1">Firebase Auth UID الموحد:</span>
                <span className="font-mono text-gray-800 text-[11px] select-all">{currentUser.uid}</span>
              </div>

              <button
                type="submit"
                disabled={editLoading}
                className="w-full bg-[#128C7E] hover:bg-[#0f7267] text-white py-3 rounded-xl font-bold text-xs shadow-lg shadow-teal-200/80 transition disabled:opacity-50"
              >
                {editLoading ? 'جاري الحفظ...' : 'حفظ التعديلات في Firestore'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
