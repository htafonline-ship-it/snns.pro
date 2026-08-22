import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActiveCall, CallState, ChatMessage, FloatingReaction } from '../types';
import {
  PhoneOff,
  Loader2,
  AlertTriangle,
  Video,
  Mic,
  ShieldCheck,
  Users,
  UserCheck,
} from 'lucide-react';
import { dailyService, DailyRoomStateSummary } from '../utils/dailyService';

interface VideoCallScreenProps {
  activeCall: ActiveCall;
  callState: CallState;
  currentUserId?: string;
  currentUserName?: string;

  // الخصائص للتوافق مع App.tsx
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
  currentUserName = 'مستخدم تواصل',
  onEndCall,
}) => {
  const [meetingToken, setMeetingToken] = useState('');
  const [loadingToken, setLoadingToken] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);

  // Real-time participant state from Daily events
  const [participantCount, setParticipantCount] = useState<number>(0);
  const [bothUsersJoined, setBothUsersJoined] = useState<boolean>(false);
  const [isRoomJoined, setIsRoomJoined] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const roomName = useMemo(() => {
    if (activeCall.roomId && !activeCall.roomId.startsWith('http')) {
      return activeCall.roomId.split('?')[0].trim();
    }

    if (activeCall.roomUrl) {
      const clean = activeCall.roomUrl.split('?')[0].trim();
      return clean.split('/').filter(Boolean).pop() || '';
    }

    return '';
  }, [activeCall.roomId, activeCall.roomUrl]);

  const effectiveRoomUrl = useMemo(() => {
    if (activeCall.roomUrl && activeCall.roomUrl.startsWith('http')) {
      return activeCall.roomUrl.split('?')[0].trim();
    }
    if (activeCall.roomId && activeCall.roomId.startsWith('http')) {
      return activeCall.roomId.split('?')[0].trim();
    }
    return activeCall.roomUrl || '';
  }, [activeCall.roomUrl, activeCall.roomId]);

  const isConnected = callState === 'connected';

  /*
   * 1. جلب Meeting Token عند قبول المكالمة
   */
  useEffect(() => {
    let cancelled = false;

    const prepareDaily = async () => {
      if (!isConnected) {
        return;
      }

      if (!effectiveRoomUrl) {
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
        console.log('[DAILY] PREPARE_START');
        console.log('[DAILY] CURRENT_UID =', currentUserId);
        console.log('[DAILY] ROOM_NAME =', roomName);
        console.log('[DAILY] ROOM_URL =', effectiveRoomUrl);

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

        console.log('[DAILY] TOKEN_CREATED = true');
        setMeetingToken(token);
      } catch (err: any) {
        if (cancelled) return;
        console.error('[DAILY] TOKEN_ERROR', err);
        setError(err?.message || 'فشل الحصول على تصريح دخول غرفة المكالمة');
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
    effectiveRoomUrl,
    activeCall.direction,
    roomName,
    currentUserId,
    currentUserName,
  ]);

  /*
   * 2. تهيئة Daily Prebuilt والاستماع للأحداث الحية لعدد المشاركين
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!isConnected || !meetingToken || !effectiveRoomUrl || !container) {
      return;
    }

    let isMounted = true;

    // إعداد مستمعي الأحداث الحية في dailyService
    dailyService.onJoined = (summary: DailyRoomStateSummary) => {
      if (!isMounted) return;
      setIsRoomJoined(true);
      setParticipantCount(summary.participantCount);
      setBothUsersJoined(summary.hasBothJoined);
      console.log('[DAILY_EVENT] onJoined -> PARTICIPANT_COUNT =', summary.participantCount);
    };

    dailyService.onParticipantCountChange = (
      count: number,
      hasBoth: boolean,
      summary: DailyRoomStateSummary
    ) => {
      if (!isMounted) return;
      setParticipantCount(count);
      setBothUsersJoined(hasBoth);
      console.log(
        `[DAILY_EVENT] onParticipantCountChange -> PARTICIPANT_COUNT = ${count}, BOTH_JOINED = ${hasBoth}`
      );
    };

    dailyService.onBothUsersJoined = (summary: DailyRoomStateSummary) => {
      if (!isMounted) return;
      setBothUsersJoined(true);
      console.log('[DAILY_EVENT] onBothUsersJoined -> TWO_USERS_VERIFIED = true', summary);
    };

    dailyService.onLeft = () => {
      if (!isMounted) return;
      setIsRoomJoined(false);
      setParticipantCount(0);
      setBothUsersJoined(false);
      onEndCall();
    };

    dailyService.onError = (errMsg: any) => {
      if (!isMounted) return;
      console.error('[DAILY_EVENT] onError ->', errMsg);
      setError(typeof errMsg === 'string' ? errMsg : 'حدث خطأ في اتصال الغرفة');
    };

    // الانضمام الفعلي للغرفة
    dailyService
      .joinPrebuilt(
        container,
        effectiveRoomUrl,
        currentUserName,
        activeCall.callType,
        meetingToken
      )
      .then(() => {
        if (!isMounted) return;
        const initialSummary = dailyService.getParticipantsSummary();
        setParticipantCount(initialSummary.participantCount);
        setBothUsersJoined(initialSummary.hasBothJoined);
      })
      .catch((joinErr: any) => {
        if (!isMounted) return;
        console.error('[DAILY_JOIN_ERR]', joinErr);
        setError(joinErr?.message || 'تعذر الانضمام إلى غرفة المكالمة');
      });

    return () => {
      isMounted = false;
      dailyService.leave();
    };
  }, [
    isConnected,
    meetingToken,
    effectiveRoomUrl,
    activeCall.callType,
    currentUserName,
    onEndCall,
  ]);

  /*
   * 3. عداد مدة المكالمة (يعمل بناءً على اتصال الغرفة وتأكيد المشاركين)
   */
  useEffect(() => {
    if (!isConnected || !isRoomJoined) {
      setSeconds(0);
      return;
    }

    const timer = window.setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isConnected, isRoomJoined]);

  const durationText = useMemo(() => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }, [seconds]);

  const statusText = () => {
    switch (callState) {
      case 'calling':
        return 'جاري الاتصال...';
      case 'ringing':
        return 'جاري الرنين...';
      case 'incoming':
        return 'مكالمة واردة';
      case 'connected':
        if (bothUsersJoined) {
          return `${durationText} (متصل بالطرفين)`;
        } else if (isRoomJoined) {
          return 'في الغرفة • بانتظار انضمام الطرف الآخر...';
        }
        return 'جاري دخول الغرفة...';
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
                  bothUsersJoined
                    ? 'text-emerald-400 font-bold'
                    : isConnected
                    ? 'text-amber-300 font-medium'
                    : 'text-slate-400'
                }
              >
                {statusText()}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Real-time Participant Count Badge */}
          {isRoomJoined && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-colors ${
                bothUsersJoined
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/20 animate-pulse'
              }`}
            >
              {bothUsersJoined ? (
                <UserCheck className="w-3.5 h-3.5" />
              ) : (
                <Users className="w-3.5 h-3.5" />
              )}
              <span>
                {bothUsersJoined
                  ? `طرفان متصلان (${participantCount})`
                  : `مشارك (${participantCount})`}
              </span>
            </div>
          )}

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
              جاري تجهيز وتأمين المكالمة...
            </h3>

            <p className="text-xs text-slate-400 mt-2">
              يتم إصدار تصريح الدخول ومطابقة هوية الغرفة
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

        {/* Real-time waiting banner when local user is alone in the Daily room */}
        {isConnected && isRoomJoined && !bothUsersJoined && !error && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-slate-900/90 backdrop-blur border border-amber-500/30 text-amber-200 text-xs px-4 py-2 rounded-2xl shadow-lg flex items-center gap-2 pointer-events-none animate-pulse">
            <Users className="w-4 h-4 text-amber-400" />
            <span>
              أنت متصل في الغرفة • بانتظار انضمام {activeCall.peerName}... (المشاركون: {participantCount})
            </span>
          </div>
        )}

        {/* Container for Daily Prebuilt call with full real-time event listeners */}
        <div
          ref={containerRef}
          className={`absolute inset-0 w-full h-full bg-[#07111f] ${
            isConnected && !error ? 'block' : 'hidden'
          }`}
        />
      </main>
    </div>
  );
};
