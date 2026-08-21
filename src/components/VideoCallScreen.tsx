import React, { useEffect, useMemo, useState } from 'react';
import { ActiveCall, CallState, ChatMessage, FloatingReaction } from '../types';
import {
  PhoneOff,
  Loader2,
  AlertTriangle,
  Video,
  Mic,
  ShieldCheck,
} from 'lucide-react';
import { dailyService } from '../utils/dailyService';

interface VideoCallScreenProps {
  activeCall: ActiveCall;
  callState: CallState;
  currentUserId?: string;
  currentUserName?: string;

  // نبقي هذه الخصائص للتوافق مع App.tsx الحالي
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

export const VideoCallScreen: React.FC<VideoCallScreenProps> = ({
  activeCall,
  callState,
  currentUserId = '',
  currentUserName = 'مستخدم SNNS',
  onEndCall,
}) => {
  const [meetingToken, setMeetingToken] = useState('');
  const [loadingToken, setLoadingToken] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);

  const roomName = useMemo(() => {
    if (activeCall.roomId) {
      return activeCall.roomId;
    }

    if (activeCall.roomUrl) {
      return activeCall.roomUrl.split('/').filter(Boolean).pop() || '';
    }

    return '';
  }, [activeCall.roomId, activeCall.roomUrl]);

  const isConnected = callState === 'connected';

  /*
   * جلب Meeting Token فقط بعد قبول المكالمة.
   * لا ننشئ غرفة جديدة هنا.
   */
  useEffect(() => {
    let cancelled = false;

    const prepareDaily = async () => {
      if (!isConnected) {
        return;
      }

      if (!activeCall.roomUrl) {
        setError('رابط غرفة الاتصال غير موجود');
        return;
      }

      if (!roomName) {
        setError('اسم غرفة الاتصال غير موجود');
        return;
      }

      if (!currentUserId) {
        setError('تعذر تحديد هوية المستخدم');
        return;
      }

      setLoadingToken(true);
      setError('');

      try {
        console.log('[DAILY_SIMPLE] PREPARE_START');
        console.log('[DAILY_SIMPLE] CURRENT_UID =', currentUserId);
        console.log('[DAILY_SIMPLE] ROOM_NAME =', roomName);
        console.log('[DAILY_SIMPLE] ROOM_URL =', activeCall.roomUrl);

        const token = await dailyService.getMeetingToken(
          roomName,
          currentUserName,
          activeCall.direction === 'outgoing',
          currentUserId
        );

        if (cancelled) return;

        if (!token) {
          throw new Error('لم يرجع الخادم Meeting Token');
        }

        console.log('[DAILY_SIMPLE] TOKEN_CREATED = true');

        setMeetingToken(token);
      } catch (err: any) {
        if (cancelled) return;

        console.error('[DAILY_SIMPLE] TOKEN_ERROR', err);

        setError(
          err?.message ||
            'فشل الحصول على تصريح دخول غرفة المكالمة'
        );
      } finally {
        if (!cancelled) {
          setLoadingToken(false);
        }
      }
    };

    prepareDaily();

    return () => {
      cancelled = true;
    };
  }, [
    isConnected,
    activeCall.roomUrl,
    activeCall.direction,
    roomName,
    currentUserId,
    currentUserName,
  ]);

  /*
   * عداد مدة المكالمة
   */
  useEffect(() => {
    if (!isConnected) {
      setSeconds(0);
      return;
    }

    const timer = window.setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isConnected]);

  const durationText = useMemo(() => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;

    return `${String(min).padStart(2, '0')}:${String(sec).padStart(
      2,
      '0'
    )}`;
  }, [seconds]);

  /*
   * Daily Prebuilt يقبل Meeting Token داخل الرابط.
   */
  const dailyUrl = useMemo(() => {
    if (!activeCall.roomUrl || !meetingToken) {
      return '';
    }

    const separator = activeCall.roomUrl.includes('?') ? '&' : '?';

    return `${activeCall.roomUrl}${separator}t=${encodeURIComponent(
      meetingToken
    )}`;
  }, [activeCall.roomUrl, meetingToken]);

  const statusText = () => {
    switch (callState) {
      case 'calling':
        return 'جاري الاتصال...';

      case 'ringing':
        return 'جاري الرنين...';

      case 'incoming':
        return 'مكالمة واردة';

      case 'connected':
        return durationText;

      case 'ended':
        return 'انتهت المكالمة';

      default:
        return 'جاري التهيئة...';
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[9999] bg-[#07111f] text-white flex flex-col"
    >
      {/* Header */}
      <header className="h-[72px] shrink-0 flex items-center justify-between px-4 sm:px-6 border-b border-white/10 bg-[#07111f]">
        <div className="flex items-center gap-3">
          <div
            className={`w-11 h-11 rounded-2xl ${
              activeCall.peerAvatarColor || 'bg-emerald-600'
            } flex items-center justify-center text-lg font-black`}
          >
            {activeCall.peerName?.charAt(0) || '؟'}
          </div>

          <div>
            <h2 className="font-black text-sm sm:text-base">
              {activeCall.peerName}
            </h2>

            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
              {activeCall.callType === 'video' ? (
                <Video className="w-3.5 h-3.5" />
              ) : (
                <Mic className="w-3.5 h-3.5" />
              )}

              <span>
                {activeCall.callType === 'video'
                  ? 'مكالمة فيديو'
                  : 'مكالمة صوتية'}
              </span>

              <span>•</span>

              <span
                className={
                  isConnected
                    ? 'text-emerald-400 font-bold'
                    : 'text-amber-300'
                }
              >
                {statusText()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-[11px] font-bold">
            <ShieldCheck className="w-4 h-4" />
            Daily
          </div>

          <button
            type="button"
            onClick={onEndCall}
            className="h-11 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 active:scale-95 transition text-white flex items-center gap-2 font-bold text-xs"
          >
            <PhoneOff className="w-4 h-4" />
            إنهاء
          </button>
        </div>
      </header>

      {/* Call area */}
      <main className="relative flex-1 min-h-0">
        {!isConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className={`w-24 h-24 rounded-[28px] ${
                activeCall.peerAvatarColor || 'bg-emerald-600'
              } flex items-center justify-center text-4xl font-black shadow-2xl mb-5`}
            >
              {activeCall.peerName?.charAt(0) || '؟'}
            </div>

            <h2 className="font-black text-xl mb-2">
              {activeCall.peerName}
            </h2>

            <p className="text-sm text-amber-300 animate-pulse">
              {statusText()}
            </p>
          </div>
        )}

        {isConnected && loadingToken && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#07111f]">
            <Loader2 className="w-9 h-9 animate-spin text-emerald-400 mb-4" />

            <h3 className="font-bold">
              جاري تجهيز المكالمة...
            </h3>

            <p className="text-xs text-slate-400 mt-2">
              يتم تأمين الدخول إلى الغرفة
            </p>
          </div>
        )}

        {isConnected && error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#07111f] p-5">
            <div className="max-w-sm w-full rounded-3xl bg-white text-slate-900 p-7 text-center shadow-2xl">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-red-500" />
              </div>

              <h3 className="font-black text-lg mb-2">
                تعذر فتح المكالمة
              </h3>

              <p className="text-xs text-slate-500 leading-6">
                {error}
              </p>

              <button
                type="button"
                onClick={onEndCall}
                className="w-full h-11 mt-6 rounded-xl bg-slate-900 text-white font-bold text-sm"
              >
                إغلاق
              </button>
            </div>
          </div>
        )}

        {isConnected && dailyUrl && !error && (
          <iframe
            key={dailyUrl}
            src={dailyUrl}
            title="SNNS Daily Call"
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            allowFullScreen
            className="absolute inset-0 w-full h-full border-0 bg-[#07111f]"
            onLoad={() => {
              console.log('[DAILY_SIMPLE] IFRAME_LOADED = true');
              console.log(
                '[DAILY_SIMPLE] ROOM_NAME =',
                roomName
              );
            }}
          />
        )}
      </main>
    </div>
  );
};