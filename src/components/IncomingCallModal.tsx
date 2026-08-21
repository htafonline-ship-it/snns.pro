import React, { useEffect } from 'react';
import { ActiveCall } from '../types';
import { Phone, PhoneOff, Video, Mic, ShieldCheck, Check } from 'lucide-react';

interface IncomingCallModalProps {
  call: ActiveCall;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  call,
  onAccept,
  onReject,
}) => {
  useEffect(() => {
    console.log('[INCOMING] INCOMING_CALL_UI = true');
    console.log('[INCOMING] ACCEPT_BUTTON_VISIBLE = true');
    console.log('[INCOMING] REJECT_BUTTON_VISIBLE = true');
  }, []);

  const handleAccept = () => {
    console.log('[ACCEPT] BUTTON_CLICKED');
    onAccept();
  };

  const handleReject = () => {
    console.log('[REJECT] BUTTON_CLICKED');
    onReject();
  };

  return (
    <div
      id="incoming-call-overlay"
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200 pointer-events-auto"
      dir="rtl"
    >
      <div className="w-full max-w-sm bg-white rounded-3xl p-8 shadow-2xl border border-gray-100 text-center relative overflow-hidden flex flex-col items-center">
        
        {/* Ambient glow */}
        <div className="absolute -top-20 -right-20 w-48 h-48 bg-[#25D366]/20 rounded-full blur-2xl pointer-events-none" />

        {/* Pulsing ring animation */}
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-full bg-[#25D366]/30 animate-ping" />
          <div className="absolute -inset-3 rounded-full bg-[#25D366]/20 animate-pulse" />
          <div className={`w-24 h-24 rounded-2xl ${call.peerAvatarColor || 'bg-gradient-to-br from-[#25D366] to-[#128C7E]'} flex items-center justify-center text-white text-3xl font-bold shadow-xl shadow-green-100 relative z-10`}>
            {call.peerName ? call.peerName.charAt(0) : '؟'}
          </div>
          <div className="absolute -bottom-1 -left-1 bg-white p-1.5 rounded-xl border border-gray-200 shadow z-20">
            {call.callType === 'video' ? (
              <Video className="w-5 h-5 text-[#128C7E]" />
            ) : (
              <Mic className="w-5 h-5 text-[#128C7E]" />
            )}
          </div>
        </div>

        <span className="text-xs font-bold uppercase tracking-widest text-[#128C7E] mb-1 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse" />
          {call.callType === 'video' ? 'مكالمة فيديو واردة' : 'مكالمة صوتية واردة'}
        </span>

        <h2 className="text-2xl font-bold text-gray-900 mb-1">{call.peerName}</h2>
        
        {call.peerUsername && (
          <p className="text-xs font-bold text-[#128C7E] mb-1" dir="ltr">
            @{call.peerUsername}
          </p>
        )}

        <p className="text-gray-500 font-mono text-xs mb-2" dir="ltr">
          {call.peerPhone || 'معرّف موثق'}
        </p>

        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold mb-8">
          <ShieldCheck className="w-3 h-3 text-emerald-600" />
          <span>مكالمة واردة بانتظار الرد</span>
        </div>

        {/* Action Buttons: Green Accept & Red Decline */}
        <div className="flex items-center justify-around w-full gap-6">
          {/* Reject / Decline Button */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              id="reject-incoming-call-btn"
              data-testid="reject-incoming-call-btn"
              onClick={handleReject}
              className="w-16 h-16 rounded-2xl bg-rose-500 hover:bg-rose-600 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-200 transition duration-150 cursor-pointer"
              title="رفض المكالمة"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
            <span className="text-xs font-bold text-gray-700">رفض</span>
          </div>

          {/* Accept Button */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              id="accept-incoming-call-btn"
              data-testid="accept-incoming-call-btn"
              onClick={handleAccept}
              className="w-16 h-16 rounded-2xl bg-[#25D366] hover:bg-[#1ebd5e] active:scale-95 text-white flex items-center justify-center shadow-lg shadow-green-300 transition duration-150 animate-bounce cursor-pointer"
              title="قبول المكالمة"
            >
              {call.callType === 'video' ? (
                <Video className="w-7 h-7" />
              ) : (
                <Phone className="w-7 h-7" />
              )}
            </button>
            <span className="text-xs font-bold text-[#128C7E]">قبول</span>
          </div>
        </div>
      </div>
    </div>
  );
};
