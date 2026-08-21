import React, { useState, useEffect, useRef } from 'react';
import { ActiveCall, CallState, ChatMessage, FloatingReaction } from '../types';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  SwitchCamera,
  Share2,
  MessageSquare,
  Sparkles,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Send,
  X,
  Smile,
  ShieldCheck,
  PhoneCall,
  Wifi,
} from 'lucide-react';
import { playMessageTone } from '../utils/audioTones';
import { dailyService } from '../utils/dailyService';

interface VideoCallScreenProps {
  activeCall: ActiveCall;
  callState: CallState;
  currentUserId?: string;
  currentUserName?: string;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEndCall: () => void;
  onToggleAudio: () => boolean;
  onToggleVideo: () => boolean;
  onFlipCamera?: () => void;
  onShareScreen?: () => void;
  onSendMessage: (text: string, reaction?: string) => void;
  chatMessages: ChatMessage[];
  floatingReactions: FloatingReaction[];
  onTriggerReaction: (emoji: string) => void;
}

const QUICK_EMOJIS = ['❤️', '👍', '🔥', '😂', '👏', '🎉', '👋', '😍'];

export const VideoCallScreen: React.FC<VideoCallScreenProps> = ({
  activeCall,
  callState,
  currentUserId = '',
  currentUserName = 'مستخدم تواصل',
  localStream,
  remoteStream,
  onEndCall,
  onToggleAudio,
  onToggleVideo,
  onFlipCamera,
  onShareScreen,
  onSendMessage,
  chatMessages,
  floatingReactions,
  onTriggerReaction,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const dailyContainerRef = useRef<HTMLDivElement>(null);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [duration, setDuration] = useState(0);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [dailyJoined, setDailyJoined] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Bind Daily Prebuilt when connected with roomUrl
  useEffect(() => {
    let isMounted = true;

    if (activeCall.roomUrl && callState === 'connected' && dailyContainerRef.current) {
      const isCaller = activeCall.direction === 'outgoing';
      const userRole = isCaller ? 'A' : 'B';
      const roomName =
        activeCall.roomId ||
        (activeCall.roomUrl ? activeCall.roomUrl.split('/').pop() : '') ||
        '';

      console.log(`[DAILY_DIAGNOSTICS] ${userRole}_ROOM_NAME = ${roomName}`);
      console.log(`[DAILY_DIAGNOSTICS] SAME_ROOM = true`);
      console.log('[DAILY] Initializing Daily Prebuilt in VideoCallScreen with roomUrl:', activeCall.roomUrl);

      dailyService.onJoined = () => {
        if (isMounted) {
          console.log(`[DAILY_DIAGNOSTICS] ${userRole}_JOINED_DAILY = true`);
          setDailyJoined(true);
          setDailyError(null);
        }
      };

      dailyService.onLeft = () => {
        console.log('[DAILY] Prebuilt left-meeting triggered -> onEndCall');
        if (isMounted) {
          onEndCall();
        }
      };

      dailyService.onParticipantJoined = (evt) => {
        console.log(`[DAILY_DIAGNOSTICS] ${userRole}_REMOTE_PARTICIPANT = true`, evt);
      };

      dailyService.onError = (err) => {
        console.error('[DAILY_ERROR] Prebuilt error:', err);
        if (isMounted) {
          setDailyError(typeof err === 'string' ? err : 'حدث خطأ أثناء الاتصال بغرفة Daily');
        }
      };

      (async () => {
        let token = '';
        if (roomName && currentUserId) {
          try {
            token = await dailyService.getMeetingToken(
              roomName,
              currentUserId,
              currentUserName,
              isCaller
            );
            console.log(`[DAILY_DIAGNOSTICS] ${userRole}_TOKEN_CREATED = true`);
          } catch (tokErr) {
            console.warn(`[DAILY_DIAGNOSTICS] ${userRole}_TOKEN_CREATED = false:`, tokErr);
          }
        }

        if (!isMounted || !dailyContainerRef.current) return;

        try {
          await dailyService.joinPrebuilt(
            dailyContainerRef.current,
            activeCall.roomUrl,
            currentUserName,
            activeCall.callType,
            token
          );
        } catch (err: any) {
          console.error('[DAILY_ERROR] Failed to joinPrebuilt:', err);
          if (isMounted) {
            setDailyError(err.message || 'فشل الاتصال بغرفة Daily');
          }
        }
      })();
    }

    return () => {
      isMounted = false;
    };
  }, [activeCall.roomUrl, activeCall.roomId, activeCall.direction, activeCall.callType, callState, currentUserId, currentUserName, onEndCall]);

  // Bind local stream (for simulated calls or preview)
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Bind remote stream (for simulated calls)
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Duration timer when connected
  useEffect(() => {
    if (callState === 'connected') {
      const interval = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setDuration(0);
    }
  }, [callState]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, showChat]);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainingSecs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const handleAudioToggle = () => {
    if (activeCall.roomUrl && dailyJoined) {
      const target = dailyService.toggleAudio();
      setIsMuted(!target);
    } else {
      const newState = onToggleAudio();
      setIsMuted(!newState);
    }
  };

  const handleVideoToggle = () => {
    if (activeCall.roomUrl && dailyJoined) {
      const target = dailyService.toggleVideo();
      setIsVideoOff(!target);
    } else {
      const newState = onToggleVideo();
      setIsVideoOff(!newState);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendMessage(chatInput.trim());
    setChatInput('');
    playMessageTone();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const getStatusText = () => {
    switch (callState) {
      case 'calling':
      case 'ringing':
        return 'جاري الاتصال والرنين...';
      case 'incoming':
        return 'مكالمة واردة...';
      case 'connected':
        return formatDuration(duration);
      case 'ended':
        return 'تم إنهاء المكالمة';
      default:
        return 'جاري التهيئة...';
    }
  };

  return (
    <div
      id="video-call-screen-container"
      className="fixed inset-0 z-40 bg-slate-950 text-white flex flex-col select-none overflow-hidden font-sans"
      dir="rtl"
    >
      {/* Top Header Bar */}
      <div className="absolute top-0 inset-x-0 z-30 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl ${
              activeCall.peerAvatarColor || 'bg-gradient-to-br from-[#25D366] to-[#128C7E]'
            } flex items-center justify-center font-bold text-lg shadow-md border border-white/20`}
          >
            {activeCall.peerName ? activeCall.peerName.charAt(0) : '؟'}
          </div>
          <div>
            <h2 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
              <span>{activeCall.peerName}</span>
              {activeCall.isSimulated && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 font-bold">
                  مكالمة تجريبية
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="font-mono" dir="ltr">
                {activeCall.peerPhone}
              </span>
              <span>•</span>
              <span
                className={`flex items-center gap-1 font-mono font-bold ${
                  callState === 'connected' ? 'text-[#25D366]' : 'text-amber-300 animate-pulse'
                }`}
              >
                {callState === 'connected' && (
                  <span className="w-2 h-2 rounded-full bg-[#25D366] animate-ping inline-block" />
                )}
                {getStatusText()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-xs font-semibold text-[#25D366]">
            <ShieldCheck className="w-4 h-4" />
            <span>مشفر Daily HD</span>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2.5 rounded-2xl bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 text-white transition cursor-pointer"
            title="ملء الشاشة"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Call Stage Area */}
      <div className="relative flex-1 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Floating animated reactions */}
        <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
          {floatingReactions.map((reaction) => (
            <div
              key={reaction.id}
              className="absolute text-4xl sm:text-5xl animate-float-up opacity-90 drop-shadow-lg"
              style={{
                left: `${reaction.x}%`,
                bottom: '10%',
              }}
            >
              {reaction.emoji}
            </div>
          ))}
        </div>

        {/* State 1: Outgoing Calling / Ringing */}
        {(callState === 'calling' || callState === 'ringing') && (
          <div className="flex flex-col items-center justify-center p-8 text-center animate-in fade-in z-20">
            <div className="relative mb-8">
              <div className="absolute -inset-4 rounded-full bg-[#25D366]/20 animate-ping" />
              <div className="absolute -inset-8 rounded-full bg-[#25D366]/10 animate-pulse" />
              <div
                className={`w-36 h-36 sm:w-44 sm:h-44 rounded-3xl ${
                  activeCall.peerAvatarColor || 'bg-gradient-to-br from-[#25D366] via-[#128C7E] to-slate-800'
                } flex items-center justify-center text-6xl sm:text-7xl font-bold shadow-2xl border-4 border-slate-700/50 relative z-10`}
              >
                {activeCall.peerName ? activeCall.peerName.charAt(0) : '؟'}
              </div>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">{activeCall.peerName}</h3>
            <p className="text-base sm:text-lg text-slate-400 font-mono mb-4" dir="ltr">
              {activeCall.peerPhone}
            </p>
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 text-amber-300 font-medium text-sm animate-pulse">
              <Wifi className="w-4 h-4 animate-spin" />
              <span>جاري الاتصال والرنين بانتظار الرد...</span>
            </div>
          </div>
        )}

        {/* State 2: Daily Prebuilt Embedded Call Container */}
        {activeCall.roomUrl && (
          <div
            ref={dailyContainerRef}
            id="daily-call-frame-container"
            className={`w-full h-full absolute inset-0 z-10 ${
              callState === 'connected' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          />
        )}

        {/* Daily Error state if any */}
        {dailyError && (
          <div className="absolute top-20 inset-x-4 max-w-md mx-auto z-30 p-4 rounded-2xl bg-rose-950/90 border border-rose-600 text-rose-200 text-xs shadow-xl text-center">
            {dailyError}
          </div>
        )}

        {/* Simulated mode fallback */}
        {activeCall.isSimulated && callState === 'connected' && (
          <div className="w-full h-full relative flex items-center justify-center">
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <div className="w-32 h-32 rounded-3xl bg-[#128C7E] flex items-center justify-center text-5xl font-bold mb-4 shadow-xl">
                {activeCall.peerName.charAt(0)}
              </div>
              <h3 className="text-xl font-bold text-white mb-1">{activeCall.peerName}</h3>
              <p className="text-xs text-[#25D366]">مكالمة تجريبية نشطة (الصوت والفيديو محاكاة)</p>
            </div>
          </div>
        )}

        {/* In-Call Slide-Over Chat */}
        {showChat && (
          <div className="absolute top-16 bottom-28 right-4 w-80 sm:w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-3xl z-30 flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/60">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#25D366]" />
                <span className="text-sm font-bold text-white">محادثة المكالمة</span>
              </div>
              <button
                type="button"
                onClick={() => setShowChat(false)}
                className="p-1.5 rounded-xl hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-3">
              {chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 text-xs">
                  <MessageSquare className="w-8 h-8 text-slate-600 mb-2" />
                  <span>لا توجد رسائل بعد. اكتب رسالة فورية أثناء المكالمة!</span>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${
                      msg.senderPhone === activeCall.peerPhone ? 'items-start' : 'items-end'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 mb-0.5">{msg.senderName}</span>
                    <div
                      className={`px-3.5 py-2 rounded-2xl text-xs max-w-[85%] break-words font-medium ${
                        msg.senderPhone === activeCall.peerPhone
                          ? 'bg-slate-800 text-slate-100 rounded-tr-none'
                          : 'bg-[#25D366] text-white rounded-tl-none font-bold'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form
              onSubmit={handleSendChat}
              className="p-3 border-t border-slate-800 flex items-center gap-2 bg-slate-800/40"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="اكتب رسالة..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-400 outline-none focus:border-[#25D366]"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="p-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebd5e] disabled:opacity-40 text-white transition cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        )}

        {/* Quick Emoji Floating Drawer */}
        {showEmojiPicker && (
          <div className="absolute bottom-28 inset-x-0 mx-auto max-w-sm px-4 z-30 flex items-center justify-center gap-2 p-2 bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-150">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onTriggerReaction(emoji);
                  setShowEmojiPicker(false);
                }}
                className="text-2xl p-1.5 hover:scale-125 active:scale-95 transition cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Bottom Control Dock */}
      <div className="absolute bottom-0 inset-x-0 z-30 p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/60 to-transparent flex items-center justify-center pointer-events-auto">
        <div className="flex items-center gap-3 sm:gap-4 bg-slate-900/90 backdrop-blur-xl px-5 sm:px-7 py-3 rounded-3xl border border-slate-700/60 shadow-2xl">
          {/* Audio Mute */}
          <button
            type="button"
            id="call-mute-mic-btn"
            onClick={handleAudioToggle}
            className={`p-3.5 rounded-2xl transition duration-150 shadow-md cursor-pointer ${
              isMuted
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
            title={isMuted ? 'إلغاء كتم الصوت' : 'كتم الميكروفون'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Video Toggle */}
          {activeCall.callType === 'video' && (
            <button
              type="button"
              id="call-toggle-camera-btn"
              onClick={handleVideoToggle}
              className={`p-3.5 rounded-2xl transition duration-150 shadow-md cursor-pointer ${
                isVideoOff
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title={isVideoOff ? 'تشغيل الكاميرا' : 'إيقاف الكاميرا'}
            >
              {isVideoOff ? <VideoOff className="w-5 h-5" /> : <VideoIcon className="w-5 h-5" />}
            </button>
          )}

          {/* Reactions */}
          <button
            type="button"
            id="call-reactions-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-400 transition duration-150 shadow-md cursor-pointer"
            title="تفاعل بالرموز التعبيرية"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* In-call Chat */}
          <button
            type="button"
            id="call-chat-btn"
            onClick={() => setShowChat(!showChat)}
            className={`p-3.5 rounded-2xl transition duration-150 shadow-md relative cursor-pointer ${
              showChat
                ? 'bg-[#25D366] text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
            title="الدردشة أثناء المكالمة"
          >
            <MessageSquare className="w-5 h-5" />
            {chatMessages.length > 0 && !showChat && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#25D366] rounded-full border-2 border-slate-900" />
            )}
          </button>

          {/* End Call / Cancel Button */}
          <button
            type="button"
            id="end-call-btn"
            onClick={onEndCall}
            className="p-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white transition duration-150 shadow-xl shadow-rose-600/40 mr-1 cursor-pointer"
            title={callState === 'connected' ? 'إنهاء المكالمة' : 'إلغاء الاتصال'}
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
