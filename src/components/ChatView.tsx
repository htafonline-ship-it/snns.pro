import React, { useState, useEffect, useRef } from 'react';
import { User, DirectMessage, CallType, Contact, MessageAttachment } from '../types';
import {
  sendDirectMessage,
  subscribeConversationMessages,
  subscribeUserMessages,
  deleteMessageForMe,
  deleteMessageForEveryone,
  blockUser,
  unblockUser,
  subscribeBlockedUsers,
} from '../lib/firestoreService';
import {
  processImageFile,
  processGenericFile,
  formatFileSize,
  ProcessedAttachment,
} from '../utils/fileUtils';
import {
  MessageSquare,
  Send,
  Video,
  Phone,
  Search,
  CheckCheck,
  Trash2,
  Smile,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Lock,
  UserCheck,
  Paperclip,
  Image as ImageIcon,
  FileText,
  X,
  Download,
  Eye,
  Loader2,
  Music,
  Ban,
  UserX,
  ShieldAlert,
  AlertCircle,
  MoreVertical,
} from 'lucide-react';

interface ChatViewProps {
  currentUser: User;
  allUsers: User[];
  contacts: Contact[];
  onlineUids: string[];
  onStartCall: (targetUser: User, callType: CallType) => void;
  initialTargetUser?: User | null;
  onClearInitialTarget?: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({
  currentUser,
  allUsers,
  contacts,
  onlineUids,
  onStartCall,
  initialTargetUser,
  onClearInitialTarget,
}) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(initialTargetUser || null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [recentMessages, setRecentMessages] = useState<DirectMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  
  // Blocked Users State
  const [blockedUids, setBlockedUids] = useState<string[]>([]);
  const [blockingInProgress, setBlockingInProgress] = useState(false);

  // Message Delete Modal State
  const [messageToDelete, setMessageToDelete] = useState<DirectMessage | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);

  // Pending Attachment State
  const [pendingAttachment, setPendingAttachment] = useState<ProcessedAttachment | null>(null);
  const [processingFile, setProcessingFile] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Lightbox Modal for Fullscreen Image View
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name?: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto select initialTargetUser
  useEffect(() => {
    if (initialTargetUser) {
      setSelectedUser(initialTargetUser);
    }
  }, [initialTargetUser]);

  // Subscribe to blocked users list
  useEffect(() => {
    if (!currentUser.uid) return;
    const unsub = subscribeBlockedUsers(currentUser.uid, (uids) => {
      setBlockedUids(uids);
    });
    return () => unsub();
  }, [currentUser.uid]);

  // Subscribe to all recent user messages for sidebar conversation list
  useEffect(() => {
    if (!currentUser.uid) return;
    const unsub = subscribeUserMessages(currentUser.uid, (allRecent) => {
      setRecentMessages(allRecent);
    });
    return () => unsub();
  }, [currentUser.uid]);

  // Subscribe to active conversation messages
  useEffect(() => {
    if (!currentUser.uid || !selectedUser?.uid) {
      setMessages([]);
      return;
    }

    const unsub = subscribeConversationMessages(currentUser.uid, selectedUser.uid, (conversationMsgs) => {
      setMessages(conversationMsgs);
    });

    return () => unsub();
  }, [currentUser.uid, selectedUser?.uid]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Check if selected user is blocked
  const isSelectedUserBlocked = selectedUser ? blockedUids.includes(selectedUser.uid) : false;

  // Handle Block / Unblock User
  const handleToggleBlockUser = async () => {
    if (!selectedUser || !currentUser.uid || blockingInProgress) return;
    setBlockingInProgress(true);
    setShowUserMenu(false);

    try {
      if (isSelectedUserBlocked) {
        await unblockUser(currentUser.uid, selectedUser.uid);
      } else {
        const confirmBlock = window.confirm(`هل أنت متأكد من رغبتك في حظر ${selectedUser.name}؟ لن تتمكن من مراسلته أو استقبال مكالمات منه.`);
        if (confirmBlock) {
          await blockUser(currentUser.uid, selectedUser.uid);
        }
      }
    } catch (err: any) {
      console.error('Failed to update block state:', err);
      alert('حدث خطأ أثناء تعديل حالة الحظر');
    } finally {
      setBlockingInProgress(false);
    }
  };

  // Handle Delete for Me
  const handleDeleteForMe = async (msg: DirectMessage) => {
    setDeletingMessage(true);
    try {
      await deleteMessageForMe(msg.id, currentUser.uid);
      setMessageToDelete(null);
    } catch (err) {
      console.error('Failed to delete for me:', err);
      alert('فشل حذف الرسالة من طرفك');
    } finally {
      setDeletingMessage(false);
    }
  };

  // Handle Delete for Everyone
  const handleDeleteForEveryone = async (msg: DirectMessage) => {
    setDeletingMessage(true);
    try {
      await deleteMessageForEveryone(msg.id);
      setMessageToDelete(null);
    } catch (err) {
      console.error('Failed to delete for everyone:', err);
      alert('فشل حذف الرسالة لدى الجميع');
    } finally {
      setDeletingMessage(false);
    }
  };

  // Handle File Selection (Images)
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowAttachMenu(false);
    setProcessingFile(true);

    try {
      const processed = await processImageFile(file);
      setPendingAttachment(processed);
      inputRef.current?.focus();
    } catch (err: any) {
      console.error('Error processing image:', err);
      alert(err.message || 'فشل معالجة الصورة');
    } finally {
      setProcessingFile(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // Handle File Selection (Documents / Generic)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowAttachMenu(false);
    setProcessingFile(true);

    try {
      const processed = await processGenericFile(file);
      setPendingAttachment(processed);
      inputRef.current?.focus();
    } catch (err: any) {
      console.error('Error processing file:', err);
      alert(err.message || 'فشل معالجة الملف');
    } finally {
      setProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle Paste from Clipboard (e.g. Screenshot or image copy)
  const handlePaste = async (e: React.ClipboardEvent) => {
    if (isSelectedUserBlocked) return;
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setProcessingFile(true);
          try {
            const processed = await processImageFile(file);
            setPendingAttachment(processed);
          } catch (err: any) {
            console.error('Error pasting image:', err);
          } finally {
            setProcessingFile(false);
          }
          break;
        }
      }
    }
  };

  // Handle Drag and Drop
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (isSelectedUserBlocked) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setProcessingFile(true);
    try {
      if (file.type.startsWith('image/')) {
        const processed = await processImageFile(file);
        setPendingAttachment(processed);
      } else {
        const processed = await processGenericFile(file);
        setPendingAttachment(processed);
      }
    } catch (err: any) {
      alert(err.message || 'فشل تحميل الملف');
    } finally {
      setProcessingFile(false);
    }
  };

  // Quick Emoji reactions list
  const quickEmojis = ['👋', '❤️', '👍', '😂', '🔥', '✨', '🌹', '🤝', '📞', '📹', '🙏', '💯'];

  // Handle Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSelectedUserBlocked) {
      alert('لا يمكنك إرسال رسائل لمستخدم قمت بحظره. قم بإلغاء الحظر أولاً.');
      return;
    }
    if ((!inputMessage.trim() && !pendingAttachment) || !selectedUser || sending) return;

    const textToSend = inputMessage.trim();
    const attachmentToSend = pendingAttachment ? { ...pendingAttachment } : undefined;

    setInputMessage('');
    setPendingAttachment(null);
    setSending(true);

    try {
      await sendDirectMessage(
        currentUser,
        {
          uid: selectedUser.uid,
          name: selectedUser.name,
          phone: selectedUser.phone,
        },
        textToSend,
        attachmentToSend
      );
      inputRef.current?.focus();
    } catch (err) {
      console.error('Failed to send message:', err);
      alert('فشل إرسال الرسالة. يرجى التأكد من الاتصال بالإنترنت.');
    } finally {
      setSending(false);
    }
  };

  // Group conversations from recent messages
  const conversationsMap = new Map<string, { user: User; lastMessage: DirectMessage; unreadCount: number }>();

  recentMessages.forEach((msg) => {
    // Skip if deleted for current user
    if (msg.deleted_for && msg.deleted_for.includes(currentUser.uid)) return;

    const peerUid = msg.sender_id === currentUser.uid ? msg.receiver_id : msg.sender_id;
    if (!peerUid) return;

    if (!conversationsMap.has(peerUid)) {
      const foundUser = allUsers.find((u) => u.uid === peerUid) || {
        uid: peerUid,
        phone: msg.sender_id === currentUser.uid ? '' : (msg.sender_phone || ''),
        name: msg.sender_id === currentUser.uid ? 'مستخدم' : (msg.sender_name || 'مستخدم'),
        avatarColor: msg.sender_avatarColor || 'bg-emerald-600',
      };

      const isUnread = msg.receiver_id === currentUser.uid && !msg.read;
      conversationsMap.set(peerUid, {
        user: foundUser,
        lastMessage: msg,
        unreadCount: isUnread ? 1 : 0,
      });
    }
  });

  const conversationsList = Array.from(conversationsMap.values());

  // Filter users based on search
  const filteredUsers = allUsers.filter((u) => {
    if (u.uid === currentUser.uid) return false;
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      u.phone.includes(q) ||
      (u.username && u.username.toLowerCase().includes(q))
    );
  });

  // Filter messages for active conversation (hide if deleted for me)
  const visibleMessages = messages.filter((msg) => {
    if (msg.deleted_for && msg.deleted_for.includes(currentUser.uid)) {
      return false;
    }
    return true;
  });

  const formatMessageTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  const isPeerOnline = (uid: string) => onlineUids.includes(uid);

  return (
    <div
      className="w-full h-[calc(100vh-180px)] min-h-[550px] max-h-[850px] bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl flex overflow-hidden text-slate-100 relative"
      dir="rtl"
      onPaste={handlePaste}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Hidden File Inputs */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.zip,.rar,.xlsx,.pptx,audio/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Drag & Drop Visual Overlay */}
      {dragOver && !isSelectedUserBlocked && (
        <div className="absolute inset-0 z-50 bg-emerald-950/80 backdrop-blur-sm border-4 border-dashed border-emerald-400 flex flex-col items-center justify-center p-6 text-center">
          <ImageIcon className="w-16 h-16 text-emerald-400 mb-3 animate-bounce" />
          <h3 className="text-xl font-bold text-white mb-1">أفلت الصورة أو الملف هنا</h3>
          <p className="text-sm text-emerald-200">سيتم تجهيز المرفق للإرسال الفوري مثل الواتساب</p>
        </div>
      )}

      {/* 1. القائمة الجانبية على اليمين: قائمة الأسماء والمحادثات */}
      <aside className={`w-full md:w-80 lg:w-96 border-l border-slate-800/80 bg-slate-950/60 flex flex-col shrink-0 ${selectedUser ? 'hidden md:flex' : 'flex'}`}>
        
        {/* Header of Sidebar */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-400" />
            <h2 className="font-bold text-sm text-white">المحادثات المباشرة</h2>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
            {conversationsList.length} محادثة
          </span>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-800/60 bg-slate-950/30">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالاسم أو الرقم لبدء محادثة..."
              className="w-full bg-slate-900 border border-slate-700/80 rounded-2xl pr-10 pl-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>
        </div>

        {/* List of Contacts / Conversations (الأسماء على اليمين) */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 p-2 space-y-1">
          {searchQuery.trim() ? (
            // Search Results
            <div>
              <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                جهات الاتصال ({filteredUsers.length})
              </div>
              {filteredUsers.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  لا توجد نتائج مطابقة
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const online = isPeerOnline(user.uid);
                  const isSelected = selectedUser?.uid === user.uid;
                  const isBlocked = blockedUids.includes(user.uid);

                  return (
                    <button
                      key={user.uid}
                      type="button"
                      onClick={() => {
                        setSelectedUser(user);
                        setSearchQuery('');
                      }}
                      className={`w-full p-3 rounded-2xl flex items-center gap-3 transition text-right ${
                        isSelected
                          ? 'bg-emerald-600/20 border border-emerald-500/40'
                          : 'hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <div className={`w-11 h-11 rounded-2xl ${user.avatarColor || 'bg-emerald-600'} flex items-center justify-center text-white font-bold shadow-md text-sm`}>
                          {user.name ? user.name.charAt(0) : '؟'}
                        </div>
                        {online && (
                          <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-slate-950 absolute bottom-0 left-0" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate">{user.name}</h4>
                          {isBlocked && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                              محظور
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5" dir="ltr">
                          {user.phone}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ) : conversationsList.length > 0 ? (
            // Active Conversations List
            conversationsList.map(({ user, lastMessage, unreadCount }) => {
              const online = isPeerOnline(user.uid);
              const isSelected = selectedUser?.uid === user.uid;
              const isMe = lastMessage.sender_id === currentUser.uid;
              const isBlocked = blockedUids.includes(user.uid);

              return (
                <button
                  key={user.uid}
                  type="button"
                  onClick={() => setSelectedUser(user)}
                  className={`w-full p-3 rounded-2xl flex items-center gap-3 transition text-right ${
                    isSelected
                      ? 'bg-emerald-600/25 border border-emerald-500/40 shadow-inner'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-11 h-11 rounded-2xl ${user.avatarColor || 'bg-emerald-600'} flex items-center justify-center text-white font-bold shadow-md text-sm`}>
                      {user.name ? user.name.charAt(0) : '؟'}
                    </div>
                    {online && (
                      <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-slate-950 absolute bottom-0 left-0" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs sm:text-sm font-bold text-white truncate">{user.name}</h4>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatMessageTime(lastMessage.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-slate-400 truncate max-w-[170px] flex items-center gap-1">
                        {isMe && <span className="text-emerald-400 font-bold text-[11px]">أنت:</span>}
                        {lastMessage.deleted_for_all ? (
                          <span className="italic text-slate-500">🚫 تم حذف الرسالة</span>
                        ) : lastMessage.attachment ? (
                          <span className="text-emerald-300 flex items-center gap-1 font-semibold">
                            {lastMessage.attachment.type === 'image' ? (
                              <>
                                <ImageIcon className="w-3 h-3" />
                                <span>صورة</span>
                              </>
                            ) : lastMessage.attachment.type === 'audio' ? (
                              <>
                                <Music className="w-3 h-3" />
                                <span>تسجيل صوتي</span>
                              </>
                            ) : (
                              <>
                                <FileText className="w-3 h-3" />
                                <span>مستند</span>
                              </>
                            )}
                            {lastMessage.text && <span>• {lastMessage.text}</span>}
                          </span>
                        ) : (
                          <span className="truncate">{lastMessage.text}</span>
                        )}
                      </p>
                      <div className="flex items-center gap-1">
                        {isBlocked && (
                          <span className="w-2 h-2 rounded-full bg-rose-500" title="محظور" />
                        )}
                        {unreadCount > 0 && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            // Empty State in Sidebar -> list available users
            <div className="p-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center mx-auto mb-3 text-emerald-400">
                <UserCheck className="w-6 h-6" />
              </div>
              <p className="text-xs text-slate-300 font-bold mb-1">ابدأ محادثة جديدة</p>
              <p className="text-[11px] text-slate-500 mb-3">اختر مستخدماً من القائمة لإرسال رسالة:</p>
              <div className="space-y-1.5">
                {filteredUsers.slice(0, 6).map((user) => (
                  <button
                    key={user.uid}
                    type="button"
                    onClick={() => setSelectedUser(user)}
                    className="w-full p-2.5 rounded-xl bg-slate-800/40 hover:bg-slate-800 flex items-center gap-2.5 transition text-right"
                  >
                    <div className={`w-8 h-8 rounded-xl ${user.avatarColor || 'bg-emerald-600'} flex items-center justify-center text-white text-xs font-bold`}>
                      {user.name ? user.name.charAt(0) : '؟'}
                    </div>
                    <span className="text-xs font-bold text-slate-200 truncate flex-1">{user.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 2. منطقة المحادثة والرسائل في المنتصف / النص */}
      {selectedUser ? (
        <section className="flex-1 flex flex-col bg-slate-950/80 min-w-0 h-full relative">
          
          {/* رأس المحادثة (الاسم على اليمين، أزرار الاتصال والحظر على اليسار) */}
          <div className="p-3.5 sm:p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0 z-10 shadow-sm">
            
            {/* جهة اليمين: معلومات المستخدم المحدد */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  if (onClearInitialTarget) onClearInitialTarget();
                }}
                className="md:hidden p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                title="الرجوع للقائمة"
              >
                <ArrowRight className="w-5 h-5" />
              </button>

              <div className="relative shrink-0">
                <div className={`w-11 h-11 rounded-2xl ${selectedUser.avatarColor || 'bg-emerald-600'} flex items-center justify-center text-white font-bold shadow-md text-base`}>
                  {selectedUser.name ? selectedUser.name.charAt(0) : '؟'}
                </div>
                {isPeerOnline(selectedUser.uid) && (
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-slate-900 absolute bottom-0 left-0" />
                )}
              </div>

              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-1.5 truncate">
                  <span>{selectedUser.name}</span>
                  {isSelectedUserBlocked ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                      محظور
                    </span>
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </h3>
                <p className="text-[11px] text-slate-400 flex items-center gap-2">
                  {isSelectedUserBlocked ? (
                    <span className="text-rose-400 font-medium">تم حظر هذا المستخدم</span>
                  ) : isPeerOnline(selectedUser.uid) ? (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      متصل الآن
                    </span>
                  ) : (
                    <span className="text-slate-500">غير متصل</span>
                  )}
                  {selectedUser.phone && (
                    <span className="text-slate-500 font-mono" dir="ltr">
                      • {selectedUser.phone}
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* جهة اليسار: أزرار الاتصال السريع وقائمة الخيارات */}
            <div className="flex items-center gap-2 shrink-0 relative">
              <button
                type="button"
                id="chat-header-audio-call-btn"
                disabled={isSelectedUserBlocked}
                onClick={() => onStartCall(selectedUser, 'audio')}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-[#128C7E] disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 hover:text-white transition shadow-sm flex items-center gap-1 text-xs font-bold"
                title={isSelectedUserBlocked ? 'المستخدم محظور' : 'مكالمة صوتية'}
              >
                <Phone className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">صوتي</span>
              </button>

              <button
                type="button"
                id="chat-header-video-call-btn"
                disabled={isSelectedUserBlocked}
                onClick={() => onStartCall(selectedUser, 'video')}
                className="p-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebd5e] disabled:opacity-40 disabled:hover:bg-[#25D366] text-white transition shadow-md shadow-emerald-950/40 flex items-center gap-1 text-xs font-bold"
                title={isSelectedUserBlocked ? 'المستخدم محظور' : 'مكالمة فيديو'}
              >
                <Video className="w-4 h-4" />
                <span className="hidden sm:inline">فيديو</span>
              </button>

              {/* زر خيارات الحظر والمزيد */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  title="خيارات إضافية"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {showUserMenu && (
                  <div className="absolute left-0 top-full mt-2 w-48 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <button
                      type="button"
                      onClick={handleToggleBlockUser}
                      disabled={blockingInProgress}
                      className={`w-full p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                        isSelectedUserBlocked
                          ? 'bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30'
                          : 'bg-rose-600/20 text-rose-300 hover:bg-rose-600/30'
                      }`}
                    >
                      {isSelectedUserBlocked ? (
                        <>
                          <UserCheck className="w-4 h-4 text-emerald-400" />
                          <span>إلغاء حظر المستخدم</span>
                        </>
                      ) : (
                        <>
                          <Ban className="w-4 h-4 text-rose-400" />
                          <span>حظر هذا المستخدم</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* شريط تنبيه الحظر (في حال كان محظوراً) */}
          {isSelectedUserBlocked && (
            <div className="p-3 bg-rose-950/70 border-b border-rose-800/60 flex items-center justify-between px-4 text-xs shrink-0 text-rose-200">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                <span>لقد قمت بحظر هذا المستخدم. لن تتمكن من إرسال رسائل أو استقبال مكالمات منه.</span>
              </div>
              <button
                type="button"
                onClick={handleToggleBlockUser}
                disabled={blockingInProgress}
                className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded-xl font-bold transition text-xs shrink-0"
              >
                إلغاء الحظر
              </button>
            </div>
          )}

          {/* منتصف الشاشة: تدفق الرسائل المتبادلة في النص */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 bg-slate-950/50 min-h-0">
            
            {/* إشعار الأمان في المنتصف */}
            <div className="flex justify-center my-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-slate-400 text-[10px] shadow-sm">
                <Lock className="w-3 h-3 text-emerald-400" />
                <span>الرسائل والصور والمستندات مشفرة ومحفوظة سحابياً</span>
              </div>
            </div>

            {visibleMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                <div className="w-16 h-16 rounded-3xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-3">
                  <MessageSquare className="w-8 h-8 text-emerald-400" />
                </div>
                <h4 className="text-sm font-bold text-slate-200 mb-1">لا توجد رسائل</h4>
                <p className="text-xs text-slate-400 max-w-xs mb-4">
                  {isSelectedUserBlocked
                    ? 'المستخدم محظور حالياً.'
                    : `أرسل رسالتك الأولى أو شارك صورة أو مستنداً مع ${selectedUser.name}.`}
                </p>
                
                {!isSelectedUserBlocked && (
                  <div className="flex flex-wrap items-center justify-center gap-2 max-w-md">
                    {['مرحباً بك! 👋', 'السلام عليكم 🌹', 'جاهز للمكالمة؟ 📹', 'كيف حالك اليوم؟ ✨'].map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => setInputMessage(sample)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white border border-slate-700/60 transition"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              visibleMessages.map((msg) => {
                const isMe = msg.sender_id === currentUser.uid;
                const isDeletedForAll = msg.deleted_for_all;
                const att = msg.attachment;

                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${isMe ? 'justify-start' : 'justify-end'}`}
                  >
                    {!isMe && (
                      <div className={`w-7 h-7 rounded-lg ${selectedUser.avatarColor || 'bg-slate-700'} flex items-center justify-center text-white text-[11px] font-bold shrink-0 mb-1`}>
                        {selectedUser.name ? selectedUser.name.charAt(0) : '؟'}
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] sm:max-w-md rounded-2xl relative group overflow-hidden ${
                        isDeletedForAll
                          ? 'bg-slate-900/80 border border-slate-800 text-slate-400 italic px-4 py-2.5 rounded-2xl'
                          : isMe
                          ? 'bg-gradient-to-br from-[#128C7E] to-[#0d6e63] text-white rounded-br-none shadow-md shadow-teal-950/40 border border-teal-600/30'
                          : 'bg-slate-800/95 text-slate-100 rounded-bl-none border border-slate-700/80 shadow-sm'
                      }`}
                    >
                      {isDeletedForAll ? (
                        // رسالة محذوفة لدى الجميع
                        <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                          <Ban className="w-3.5 h-3.5 text-slate-500" />
                          <span>تم حذف هذه الرسالة</span>
                          <span className="text-[10px] text-slate-500 font-mono mr-auto">
                            {formatMessageTime(msg.created_at)}
                          </span>
                        </div>
                      ) : (
                        <>
                          {/* 1. Image Attachment Rendering */}
                          {att && att.type === 'image' && (
                            <div className="relative group/img cursor-pointer bg-black/20" onClick={() => setLightboxImage({ url: att.url, name: att.name })}>
                              <img
                                src={att.url}
                                alt={att.name || 'الصورة'}
                                referrerPolicy="no-referrer"
                                className="w-full max-h-72 object-cover rounded-t-2xl transition hover:opacity-95"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center gap-2">
                                <span className="p-2 rounded-full bg-black/60 text-white text-xs font-bold flex items-center gap-1">
                                  <Eye className="w-4 h-4" />
                                  <span>عرض الصورة</span>
                                </span>
                              </div>
                            </div>
                          )}

                          {/* 2. Document / File Attachment Rendering */}
                          {att && att.type === 'file' && (
                            <div className="p-3 bg-black/20 border-b border-white/10 flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 shrink-0">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-white truncate">{att.name || 'ملف مرفق'}</p>
                                <p className="text-[10px] text-slate-300 font-mono mt-0.5">
                                  {formatFileSize(att.size || 0)}
                                </p>
                              </div>
                              <a
                                href={att.url}
                                download={att.name || 'document'}
                                className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition shrink-0"
                                title="تحميل الملف"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          )}

                          {/* 3. Audio Attachment Rendering */}
                          {att && att.type === 'audio' && (
                            <div className="p-3 bg-black/20 border-b border-white/10">
                              <div className="flex items-center gap-2 mb-2">
                                <Music className="w-4 h-4 text-emerald-300" />
                                <span className="text-xs font-bold">{att.name || 'تسجيل صوتي'}</span>
                              </div>
                              <audio src={att.url} controls className="w-full h-8" />
                            </div>
                          )}

                          {/* Message Text Content */}
                          {msg.text && (
                            <div className="px-4 py-2.5">
                              <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                                {msg.text}
                              </p>
                            </div>
                          )}

                          {/* Footer Time & Status */}
                          <div className={`px-4 pb-2 pt-0.5 flex items-center justify-end gap-1.5 text-[10px] ${isMe ? 'text-emerald-100' : 'text-slate-400'} font-mono`}>
                            <span>{formatMessageTime(msg.created_at)}</span>
                            {isMe && <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />}
                          </div>

                          {/* زر خيارات الحذف (من طرفي أو من طرف الكل) */}
                          <button
                            type="button"
                            onClick={() => setMessageToDelete(msg)}
                            className="opacity-0 group-hover:opacity-100 absolute top-2 left-2 p-1.5 rounded-full bg-slate-900/90 text-rose-400 hover:text-rose-300 border border-slate-700 shadow-md transition"
                            title="خيارات حذف الرسالة"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pending Attachment Preview Bar before sending */}
          {pendingAttachment && !isSelectedUserBlocked && (
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-150 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                {pendingAttachment.type === 'image' ? (
                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-black/40 border border-emerald-500/40 shrink-0">
                    <img src={pendingAttachment.url} alt="معاينة" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
                    <FileText className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{pendingAttachment.name}</span>
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                    جاهز للإرسال • {formatFileSize(pendingAttachment.size)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPendingAttachment(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition"
                title="إلغاء المرفق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* شريط الإيموجي السريع */}
          {showEmojiPicker && !isSelectedUserBlocked && (
            <div className="px-4 py-2 bg-slate-900/95 border-t border-slate-800 flex items-center gap-2 overflow-x-auto shrink-0">
              {quickEmojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setInputMessage((prev) => prev + emoji);
                    setShowEmojiPicker(false);
                    inputRef.current?.focus();
                  }}
                  className="text-lg p-1.5 rounded-xl hover:bg-slate-800 transition transform hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Attachment Selection Menu Popover */}
          {showAttachMenu && !isSelectedUserBlocked && (
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-3 shrink-0 animate-in fade-in duration-150">
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-bold border border-emerald-500/30 transition active:scale-95"
              >
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                <span>إرسال صورة / فيديو</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-bold border border-blue-500/30 transition active:scale-95"
              >
                <FileText className="w-4 h-4 text-blue-400" />
                <span>إرسال مستند / ملف</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAttachMenu(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white mr-auto"
                title="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* شريط كتابة وإرسال الرسالة أسفل الشاشة (أو رسالة الحظر) */}
          {isSelectedUserBlocked ? (
            <div className="p-4 bg-slate-900 border-t border-slate-800 text-center text-xs text-rose-300 shrink-0 flex items-center justify-center gap-3">
              <Ban className="w-4 h-4 text-rose-400" />
              <span>لا يمكنك إرسال رسائل لأنك قمت بحظر هذا المستخدم.</span>
              <button
                type="button"
                onClick={handleToggleBlockUser}
                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold transition text-xs"
              >
                إلغاء الحظر الآن
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSendMessage}
              className="p-3 sm:p-4 bg-slate-900 border-t border-slate-800 flex items-center gap-2 shrink-0"
            >
              {/* Attachment Button */}
              <button
                type="button"
                onClick={() => {
                  setShowAttachMenu(!showAttachMenu);
                  setShowEmojiPicker(false);
                }}
                disabled={processingFile}
                className={`p-2.5 rounded-xl transition ${
                  showAttachMenu
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
                }`}
                title="إرفاق صورة أو مستند"
              >
                {processingFile ? (
                  <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </button>

              {/* Emoji Picker Button */}
              <button
                type="button"
                onClick={() => {
                  setShowEmojiPicker(!showEmojiPicker);
                  setShowAttachMenu(false);
                }}
                className="p-2.5 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition"
                title="إضافة رمز تعبيري"
              >
                <Smile className="w-5 h-5" />
              </button>

              {/* Message Input Field */}
              <input
                ref={inputRef}
                type="text"
                id="direct-message-input"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={
                  pendingAttachment
                    ? 'أضف تعليقاً على المرفق (اختياري)...'
                    : `اكتب رسالتك إلى ${selectedUser.name}...`
                }
                className="flex-1 bg-slate-950 border border-slate-700/80 rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition shadow-inner"
              />

              {/* Send Button */}
              <button
                type="submit"
                id="direct-message-send-btn"
                disabled={(!inputMessage.trim() && !pendingAttachment) || sending || processingFile}
                className="p-2.5 sm:px-4 sm:py-2.5 rounded-2xl bg-[#25D366] hover:bg-[#1ebd5e] disabled:opacity-40 disabled:hover:bg-[#25D366] text-white transition shadow-md shadow-green-950/40 cursor-pointer flex items-center gap-1.5 font-bold text-xs sm:text-sm"
                title="إرسال"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 rotate-180" />
                )}
                <span className="hidden sm:inline">إرسال</span>
              </button>
            </form>
          )}

        </section>
      ) : (
        // في حال لم يتم اختيار مستخدم بعد
        <div className="flex-1 hidden md:flex flex-col items-center justify-center p-8 text-center bg-slate-950/40">
          <div className="w-20 h-20 rounded-3xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center mb-4 text-emerald-400 shadow-xl">
            <MessageSquare className="w-10 h-10" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">منظومة المحادثات الفورية والحظر</h3>
          <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-6">
            اختر أي جهة اتصال من القائمة في اليمين للمراسلة، مشاركة الصور والمستندات، أو إدارة حظر وحذف الرسائل مثل الواتساب.
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-300 text-xs font-bold">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>يدعم حذف الرسائل من طرفك أو لدى الجميع وحظر جهات الاتصال</span>
          </div>
        </div>
      )}

      {/* Modal: Delete Message Options (حذف لدى الجميع vs حذف لدي فقط) */}
      {messageToDelete && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl text-right animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mb-4 text-rose-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-white text-center mb-2">
              حذف الرسالة؟
            </h3>
            <p className="text-xs text-slate-400 text-center mb-6 leading-relaxed">
              اختر نوع الحذف المطلوب. لن تتمكن من التراجع عن هذه العملية بعد تأكيدها.
            </p>

            <div className="space-y-2.5">
              {/* خيار الحذف لدى الجميع (متاح فقط لمرسل الرسالة) */}
              {messageToDelete.sender_id === currentUser.uid && (
                <button
                  type="button"
                  onClick={() => handleDeleteForEveryone(messageToDelete)}
                  disabled={deletingMessage}
                  className="w-full py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>حذف لدى الجميع (Delete for Everyone)</span>
                </button>
              )}

              {/* خيار الحذف لدي فقط (متاح دائماً) */}
              <button
                type="button"
                onClick={() => handleDeleteForMe(messageToDelete)}
                disabled={deletingMessage}
                className="w-full py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 border border-slate-700/80"
              >
                <span>حذف لدي فقط (Delete for Me)</span>
              </button>

              {/* إلغاء */}
              <button
                type="button"
                onClick={() => setMessageToDelete(null)}
                disabled={deletingMessage}
                className="w-full py-2.5 px-4 rounded-2xl bg-transparent hover:bg-slate-800/60 text-slate-400 hover:text-white font-bold text-xs transition"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Fullscreen Image Viewing */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setLightboxImage(null)}
        >
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
            <span className="text-sm font-bold text-white truncate max-w-xs">{lightboxImage.name || 'صورة'}</span>
            <div className="flex items-center gap-2">
              <a
                href={lightboxImage.url}
                download={lightboxImage.name || 'image.jpg'}
                onClick={(e) => e.stopPropagation()}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-emerald-600 text-white transition flex items-center gap-1.5 text-xs font-bold"
              >
                <Download className="w-4 h-4" />
                <span>تحميل</span>
              </a>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-rose-600 text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <img
            src={lightboxImage.url}
            alt={lightboxImage.name || 'صورة كاملة'}
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};
