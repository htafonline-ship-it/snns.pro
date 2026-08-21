import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, ActiveCall, CallState, CallType, ChatMessage, FloatingReaction } from './types';
import { AuthScreen } from './components/AuthScreen';
import { MainScreen } from './components/MainScreen';
import { VideoCallScreen } from './components/VideoCallScreen';
import { IncomingCallModal } from './components/IncomingCallModal';
import {
  playOutgoingRing,
  playIncomingRing,
  playConnectedTone,
  playEndTone,
  stopAllTones,
  playMessageTone,
} from './utils/audioTones';
import { subscribeAuth, logoutFromFirebase } from './lib/authService';
import {
  updateUserPresence,
  createCallRecord,
  updateCallRecord,
  transitionCallStatus,
  getUserProfile,
  subscribeIncomingCalls,
  subscribeCallById,
} from './lib/firestoreService';
import { zegoService } from './utils/zegoService';
import { callEngine } from './utils/callEngine';
import { dailyService } from './utils/dailyService';

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Active calling state
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callState, setCallState] = useState<CallState>('idle');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Incoming Call Ringing Pending State
  const [pendingIncomingCall, setPendingIncomingCall] = useState<{
    callId: string;
    roomId: string;
    roomUrl?: string;
    caller_id: string;
    caller_name: string;
    caller_phone: string;
    caller_avatarColor?: string;
    callType: CallType;
  } | null>(null);

  // In-Call Chat & Floating Reactions
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [currentFacingMode, setCurrentFacingMode] = useState<'user' | 'environment'>('user');

  // WebSocket signaling
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const [onlineUids, setOnlineUids] = useState<string[]>([]);
  const [isWsConnected, setIsWsConnected] = useState<boolean>(false);

  // Active call ref to avoid stale closures in ws handlers
  const activeCallRef = useRef<ActiveCall | null>(null);
  activeCallRef.current = activeCall;
  const currentCallDocIdRef = useRef<string | null>(null);
  const simulatedBotTimerRef = useRef<number | null>(null);
  const missedCallTimerRef = useRef<number | null>(null);

  const clearMissedCallTimer = useCallback(() => {
    if (missedCallTimerRef.current) {
      clearTimeout(missedCallTimerRef.current);
      missedCallTimerRef.current = null;
    }
  }, []);

  // Subscribe to Firebase Auth state change and initialize ZEGOCLOUD
  useEffect(() => {
    const unsubscribe = subscribeAuth(async (user) => {
      if (user) {
        setCurrentUser(user);
        await updateUserPresence(user.uid, 'online');
        console.log(`[AUTH] FIREBASE_UID = ${user.uid}`);
        console.log(`[ZEGO] USER_ID = ${user.uid}`);
        try {
          await zegoService.init(user.uid, user.name);
          console.log(`[ZEGO] INITIALIZED = true`);
        } catch (err) {
          console.warn('[ZEGO] INITIALIZED = false', err);
        }
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Update presence to offline on window unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentUser?.uid) {
        updateUserPresence(currentUser.uid, 'offline');
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentUser]);

  // Send WebSocket Signal Helper
  const sendWsSignal = useCallback((data: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // End Call Helper
  const endCall = useCallback(
    async (reason: string = 'normal', notifyPeer: boolean = true) => {
      clearMissedCallTimer();
      stopAllTones();
      playEndTone();

      if (simulatedBotTimerRef.current) {
        clearTimeout(simulatedBotTimerRef.current);
        simulatedBotTimerRef.current = null;
      }

      // 1. Close Daily, CallEngine, WebRTC & ZEGOCLOUD
      await dailyService.leave();
      await zegoService.leaveRoom();
      callEngine.closePeerConnection();

      // 2. Stop local stream tracks
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        setLocalStream(null);
      }
      setRemoteStream(null);

      // 3. Update call record in Firestore with atomic transition
      const callDocId = currentCallDocIdRef.current;
      const currentCall = activeCallRef.current;
      const currentUiState = callState;

      if (callDocId && currentUser) {
        if (currentUiState === 'calling' || currentUiState === 'ringing') {
          console.log('[CALL] CALLER_CANCELLED = true');
          await transitionCallStatus(
            callDocId,
            'cancelled',
            'CALLER_CANCELLED',
            currentUser.uid,
            ['ringing'],
            {
              ended_at: Date.now(),
            }
          );
        } else if (currentUiState === 'connected') {
          console.log('[CALL] CALL_ENDED = true');
          const durationSec = currentCall?.startedAt
            ? Math.round((Date.now() - currentCall.startedAt) / 1000)
            : 0;

          await transitionCallStatus(
            callDocId,
            'ended',
            'USER_ENDED',
            currentUser.uid,
            ['accepted', 'ringing'],
            {
              ended_at: Date.now(),
              duration: durationSec,
            }
          );
        }
        currentCallDocIdRef.current = null;
      }

      // 4. Send WebSocket notification if connected
      if (
        notifyPeer &&
        currentUser &&
        currentCall &&
        !currentCall.isSimulated &&
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN
      ) {
        const signalType =
          currentUiState === 'calling' || currentUiState === 'ringing'
            ? 'call-cancel'
            : 'call-ended';

        wsRef.current.send(
          JSON.stringify({
            type: signalType,
            caller_id: currentUser.uid,
            from_uid: currentUser.uid,
            to_uid: currentCall.peerUid || currentCall.peerPhone,
            callee_id: currentCall.peerUid || currentCall.peerPhone,
            callId: callDocId || currentCall.callId,
            reason,
          })
        );
      }

      setActiveCall(null);
      setCallState('idle');
      setPendingIncomingCall(null);
      setChatMessages([]);
      setFloatingReactions([]);
    },
    [currentUser, localStream, callState, clearMissedCallTimer]
  );

  // Subscribe to real-time incoming calls from Firestore (for Callee)
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeIncomingCalls(currentUser.uid, async (call) => {
      const isCallee = call.callee_id === currentUser.uid;
      const isRinging = call.status === 'ringing';

      console.log('[INCOMING] CALL_RECEIVED = true');
      console.log(`[INCOMING] CALL_ID = ${call.id}`);
      console.log(`[INCOMING] CALLER_ID = ${call.caller_id}`);
      console.log(`[INCOMING] CALLEE_ID = ${call.callee_id}`);
      console.log(`[INCOMING] CURRENT_UID = ${currentUser.uid}`);
      console.log(`[INCOMING] IS_CALLEE = ${isCallee}`);
      console.log(`[INCOMING] STATUS = ${call.status}`);

      if (isCallee && isRinging) {
        // Do not overwrite if already on an active call
        if (activeCallRef.current || pendingIncomingCall?.callId === call.id) {
          return;
        }

        const callerProfile = await getUserProfile(call.caller_id);
        const roomId = call.room_id || `room_${[call.caller_id, currentUser.uid].sort().join('_')}`;
        const roomUrl = call.room_url || '';

        setPendingIncomingCall({
          callId: call.id,
          roomId,
          roomUrl,
          caller_id: call.caller_id,
          caller_name: callerProfile?.name || call.caller_name || 'مستخدم تواصل',
          caller_phone: callerProfile?.phone || call.caller_phone || '',
          caller_avatarColor: callerProfile?.avatarColor,
          callType: call.call_type || 'video',
        });
        setCallState('incoming');
        playIncomingRing();
      }
    });

    return () => unsubscribe();
  }, [currentUser, pendingIncomingCall?.callId]);

  // Subscribe to active outgoing call status in Firestore (for Caller)
  useEffect(() => {
    const callDocId = currentCallDocIdRef.current;
    if (!callDocId || !currentUser || !activeCall || activeCall.direction !== 'outgoing') return;

    const unsubscribe = subscribeCallById(callDocId, (call) => {
      if (!call) return;
      console.log(`[CALL_STATE] Outgoing call ${callDocId} Firestore status: ${call.status}`);

      if (call.status === 'accepted' && (callState === 'calling' || callState === 'ringing')) {
        console.log('[CALL_STATE] FIRESTORE_STATUS = accepted');
        clearMissedCallTimer();
        stopAllTones();
        playConnectedTone();
        setCallState('connected');
        setActiveCall((prev) => (prev ? { ...prev, startedAt: call.answered_at || Date.now() } : null));
      } else if (call.status === 'rejected') {
        console.log('[CALL_STATE] FIRESTORE_STATUS = rejected');
        clearMissedCallTimer();
        stopAllTones();
        playEndTone();
        alert('تم رفض المكالمة من قبل الطرف الآخر');
        endCall('rejected', false);
      } else if (call.status === 'cancelled' || call.status === 'missed' || call.status === 'ended') {
        if (callState !== 'idle') {
          endCall(call.status, false);
        }
      }
    });

    return () => unsubscribe();
  }, [activeCall, callState, currentUser, endCall, clearMissedCallTimer]);
  useEffect(() => {
    callEngine.onLocalStream = (stream) => {
      setLocalStream(stream);
    };

    callEngine.onRemoteStream = (stream) => {
      console.log('Remote stream connected via CallEngine:', stream);
      stopAllTones();
      playConnectedTone();
      setRemoteStream(stream);
      setCallState('connected');
      setActiveCall((prev) => (prev ? { ...prev, startedAt: prev.startedAt || Date.now() } : null));
    };

    zegoService.onRemoteStream = (stream) => {
      console.log('ZEGOCLOUD remote stream received:', stream);
      stopAllTones();
      playConnectedTone();
      setRemoteStream(stream);
      setCallState('connected');
      setActiveCall((prev) => (prev ? { ...prev, startedAt: prev.startedAt || Date.now() } : null));
    };

    zegoService.onRemoteStreamRemoved = () => {
      console.log('ZEGOCLOUD remote stream removed');
    };

    zegoService.onRoomMessage = (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      playMessageTone();
    };

    zegoService.onCustomReaction = (reaction) => {
      const newReaction: FloatingReaction = {
        id: `react-${Date.now()}-${Math.random()}`,
        emoji: reaction.emoji,
        x: 20 + Math.random() * 60,
        y: 80,
      };
      setFloatingReactions((prev) => [...prev, newReaction]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
      }, 2200);
    };

    zegoService.onError = (err) => {
      console.log('ZEGOCLOUD note:', err);
    };
  }, []);

  // Connect WebSocket with resilient auto-reconnect
  useEffect(() => {
    if (!currentUser) return;

    let isUnmounted = false;

    function connectWs() {
      if (isUnmounted) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          setIsWsConnected(true);
          // Register presence with Firebase UID
          ws.send(
            JSON.stringify({
              type: 'register-session',
              uid: currentUser?.uid,
              phone: currentUser?.phone,
              name: currentUser?.name,
            })
          );
        };

        ws.onclose = () => {
          if (isUnmounted) return;
          setIsWsConnected(false);
          reconnectTimerRef.current = window.setTimeout(connectWs, 3000);
        };

        ws.onerror = () => {
          setIsWsConnected(false);
        };

        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'online-users-update': {
                if (Array.isArray(data.onlineUids)) {
                  setOnlineUids(data.onlineUids);
                }
                break;
              }

              case 'incoming-call': {
                // Incoming call from caller_id
                const callerUid = data.caller_id || data.from?.uid || data.from?.phone;
                const callerProfile = await getUserProfile(callerUid);

                setPendingIncomingCall({
                  callId: data.callId,
                  roomId: data.roomId,
                  roomUrl: data.roomUrl || data.roomId,
                  caller_id: callerUid,
                  caller_name: callerProfile?.name || data.caller_name || data.from?.name || 'مستخدم',
                  caller_phone: callerProfile?.phone || data.caller_phone || data.from?.phone || '',
                  caller_avatarColor: callerProfile?.avatarColor,
                  callType: data.callType || 'video',
                });
                setCallState('incoming');
                playIncomingRing();

                // Reply with call-ringing
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && currentUser) {
                  wsRef.current.send(
                    JSON.stringify({
                      type: 'call-ringing',
                      caller_id: callerUid,
                      callee_id: currentUser.uid,
                    })
                  );
                }
                break;
              }

              case 'call-ringing': {
                setCallState('ringing');
                break;
              }

              case 'call-accepted': {
                clearMissedCallTimer();
                stopAllTones();
                playConnectedTone();
                setCallState('connected');
                setActiveCall((prev) =>
                  prev
                    ? {
                        ...prev,
                        startedAt: Date.now(),
                        roomUrl: prev.roomUrl || data.roomUrl,
                        roomId: prev.roomId || data.roomId,
                      }
                    : null
                );
                break;
              }

              case 'webrtc-offer': {
                // Callee: received WebRTC offer from Caller -> respond with answer
                if (currentUser && data.sdp) {
                  const peerUid = data.from_id;
                  const roomId = data.roomId || `room_${[currentUser.uid, peerUid].sort().join('_')}`;
                  await callEngine.handleOffer(
                    data.sdp,
                    peerUid,
                    sendWsSignal,
                    roomId,
                    currentUser.uid,
                    currentUser.name,
                    activeCallRef.current?.callType || 'video'
                  );
                }
                break;
              }

              case 'webrtc-answer': {
                // Caller: received WebRTC answer from Callee
                if (data.sdp) {
                  await callEngine.handleAnswer(data.sdp);
                }
                break;
              }

              case 'webrtc-ice-candidate': {
                if (data.candidate) {
                  await callEngine.handleIceCandidate(data.candidate);
                }
                break;
              }

              case 'call-rejected': {
                clearMissedCallTimer();
                stopAllTones();
                alert(data.reason || 'تم رفض المكالمة من قبل الطرف الآخر');
                endCall('rejected', false);
                break;
              }

              case 'call-cancelled': {
                clearMissedCallTimer();
                stopAllTones();
                playEndTone();
                setPendingIncomingCall(null);
                setCallState('idle');
                break;
              }

              case 'call-unavailable': {
                clearMissedCallTimer();
                stopAllTones();
                if (currentCallDocIdRef.current && currentUser) {
                  await transitionCallStatus(
                    currentCallDocIdRef.current,
                    'missed',
                    'USER_UNAVAILABLE',
                    currentUser.uid,
                    ['ringing']
                  );
                }
                alert(data.reason || 'المستخدم غير متاح حالياً');
                endCall('unavailable', false);
                break;
              }

              case 'call-ended': {
                clearMissedCallTimer();
                endCall('ended_by_peer', false);
                break;
              }

              case 'call-chat': {
                if (data.text) {
                  setChatMessages((prev) => [
                    ...prev,
                    {
                      id: `chat-${Date.now()}-${Math.random()}`,
                      senderPhone: data.senderPhone || data.from_phone || data.from_uid || '',
                      senderName: data.senderName || data.from_name || 'الطرف الآخر',
                      text: data.text,
                      timestamp: data.timestamp || Date.now(),
                    },
                  ]);
                  playMessageTone();
                }
                if (data.reaction) {
                  const newReaction: FloatingReaction = {
                    id: `react-${Date.now()}-${Math.random()}`,
                    emoji: data.reaction,
                    x: 20 + Math.random() * 60,
                    y: 80,
                  };
                  setFloatingReactions((prev) => [...prev, newReaction]);
                  setTimeout(() => {
                    setFloatingReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
                  }, 2200);
                }
                break;
              }
            }
          } catch (err) {
            console.warn('Error parsing WebSocket message:', err);
          }
        };
      } catch (e) {
        console.warn('WebSocket init exception:', e);
      }
    }

    connectWs();

    return () => {
      isUnmounted = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [currentUser, endCall, sendWsSignal]);

  // Initiate an Outgoing Call with Daily.co + Firestore
  const handleStartCall = async (
    targetUser: User,
    callType: CallType,
    isSimulated = false
  ) => {
    if (!currentUser) return;
    if (targetUser.uid === currentUser.uid && !isSimulated) {
      alert('لا يمكنك الاتصال بحسابك الخاص. يمكنك تجربة المكالمة التجريبية في تبويب فحص الأجهزة!');
      return;
    }

    if (callType === 'video') {
      console.log('[CALL] VIDEO_BUTTON_CLICKED = true');
    } else {
      console.log('[CALL] AUDIO_BUTTON_CLICKED = true');
    }
    console.log(`[CALL] CALLER_UID = ${currentUser.uid}`);
    console.log(`[CALL] CALLEE_UID = ${targetUser.uid}`);
    console.log('[DAILY] CREATE_ROOM_START');

    try {
      let roomUrl = '';
      let roomId = '';

      if (!isSimulated) {
        try {
          const roomData = await dailyService.createRoom(callType, currentUser.uid, targetUser.uid);
          roomUrl = roomData.url;
          roomId = roomData.name;
          console.log('[DAILY] ROOM_CREATED = true', { roomUrl, roomId });
        } catch (dailyErr: any) {
          console.error('[DAILY_ERROR] Failed to create room:', dailyErr);
          alert(dailyErr.message || 'فشل في إنشاء غرفة Daily.co. يرجى التحقق من المفتاح في الإعدادات.');
          return;
        }
      } else {
        roomId = `room_sim_${currentUser.uid}_${Date.now()}`;
      }

      // Set active call state
      setActiveCall({
        peerUid: targetUser.uid,
        peerPhone: targetUser.phone,
        peerName: targetUser.name,
        peerUsername: targetUser.username,
        peerAvatarColor: targetUser.avatarColor,
        callType,
        direction: 'outgoing',
        roomId,
        roomUrl,
        isSimulated,
      });
      setCallState('calling');
      playOutgoingRing();

      // Create Call record in Firestore
      if (!isSimulated) {
        clearMissedCallTimer();

        const callDocId = await createCallRecord({
          caller_id: currentUser.uid,
          caller_name: currentUser.name,
          caller_phone: currentUser.phone,
          callee_id: targetUser.uid,
          callee_name: targetUser.name,
          callee_phone: targetUser.phone,
          call_type: callType,
          status: 'ringing',
          room_id: roomId,
          room_url: roomUrl,
          created_at: Date.now(),
          duration: 0,
        });
        currentCallDocIdRef.current = callDocId;

        // Set single missed call timer (40 seconds)
        missedCallTimerRef.current = window.setTimeout(async () => {
          const activeDocId = currentCallDocIdRef.current;
          if (activeDocId && currentUser) {
            console.log(`[CALL_STATE] RING_TIMEOUT triggered for callId=${activeDocId}`);
            await transitionCallStatus(
              activeDocId,
              'missed',
              'RING_TIMEOUT',
              currentUser.uid,
              ['ringing']
            );
            endCall('missed_timeout', true);
          }
        }, 40000);
      }

      // Handle Simulated Echo Mode
      if (isSimulated) {
        const simStream = await callEngine.startLocalMedia(callType, currentFacingMode, currentUser.name);
        setLocalStream(simStream);

        simulatedBotTimerRef.current = window.setTimeout(() => {
          stopAllTones();
          playConnectedTone();
          setRemoteStream(simStream);
          setCallState('connected');
          setActiveCall((prev) => (prev ? { ...prev, startedAt: Date.now() } : null));

          setTimeout(() => {
            setChatMessages((prev) => [
              ...prev,
              {
                id: `bot-msg-${Date.now()}`,
                senderPhone: targetUser.phone,
                senderName: targetUser.name,
                text: 'مرحباً بك! تم الاتصال بنجاح وتعمل الصورة والصوت بكل كفاءة 📹✨',
                timestamp: Date.now(),
              },
            ]);
          }, 1200);
        }, 2000);
        return;
      }

      // Send WebSocket Call Invitation to recipient
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'call-invitation',
            caller_id: currentUser.uid,
            caller_name: currentUser.name,
            caller_phone: currentUser.phone,
            callee_id: targetUser.uid,
            callType,
            roomId,
            roomUrl,
            callId: currentCallDocIdRef.current || `call_${Date.now()}`,
          })
        );
        console.log('[CALL] INVITATION_SENT = true');
      }
    } catch (err) {
      console.error('Call initiation error:', err);
      endCall('init_error', false);
    }
  };

  // Accept Incoming Call
  const handleAcceptIncomingCall = async () => {
    if (!pendingIncomingCall || !currentUser) return;
    const callInfo = { ...pendingIncomingCall };
    clearMissedCallTimer();
    stopAllTones();
    console.log('[ACCEPT] BUTTON_CLICKED = true');
    console.log('[ACCEPT] DAILY_ACCEPT_START');

    try {
      // 1. Update Firestore call document atomically FIRST
      if (callInfo.callId) {
        currentCallDocIdRef.current = callInfo.callId;
        await transitionCallStatus(
          callInfo.callId,
          'accepted',
          'USER_ACCEPTED',
          currentUser.uid,
          ['ringing'],
          {
            answered_at: Date.now(),
            started_at: Date.now(),
          }
        );
      }

      // 2. Close Incoming Call UI
      setPendingIncomingCall(null);

      // 3. Set Active Call State
      setActiveCall({
        callId: callInfo.callId,
        peerUid: callInfo.caller_id,
        peerPhone: callInfo.caller_phone,
        peerName: callInfo.caller_name,
        peerAvatarColor: callInfo.caller_avatarColor,
        callType: callInfo.callType,
        direction: 'incoming',
        roomId: callInfo.roomId,
        roomUrl: callInfo.roomUrl,
        startedAt: Date.now(),
      });
      setCallState('connected');
      playConnectedTone();

      // 4. Send WebSocket Call Accepted notice
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'call-accept',
            caller_id: callInfo.caller_id,
            callee_id: currentUser.uid,
            callId: callInfo.callId,
            roomId: callInfo.roomId,
            roomUrl: callInfo.roomUrl,
          })
        );
      }
      console.log('[ACCEPT] DAILY_ACCEPT_SUCCESS = true');
    } catch (err) {
      console.error('Failed to accept call:', err);
      handleRejectIncomingCall();
    }
  };

  // Reject Incoming Call
  const handleRejectIncomingCall = async () => {
    if (!pendingIncomingCall || !currentUser) return;
    const callInfo = { ...pendingIncomingCall };
    clearMissedCallTimer();
    stopAllTones();
    playEndTone();
    console.log('[REJECT] BUTTON_CLICKED = true');

    // 1. Update Firestore call document atomically
    if (callInfo.callId) {
      await transitionCallStatus(
        callInfo.callId,
        'rejected',
        'USER_REJECTED',
        currentUser.uid,
        ['ringing'],
        {
          ended_at: Date.now(),
        }
      );
      console.log('[CALL_STATE] FIRESTORE_STATUS = rejected');
    }

    // 2. Notify peer via WebSocket
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call-reject',
          caller_id: callInfo.caller_id,
          callee_id: currentUser.uid,
          reason: 'تم رفض المكالمة من قبل الطرف الآخر',
        })
      );
    }

    // 3. Close Incoming Call UI and reset state
    setPendingIncomingCall(null);
    setCallState('idle');
  };

  // Audio Toggle
  const handleToggleAudio = (): boolean => {
    const isMuted = zegoService.toggleAudio();
    callEngine.toggleAudio();
    return isMuted;
  };

  // Video Toggle
  const handleToggleVideo = (): boolean => {
    const isVideoOff = zegoService.toggleVideo();
    callEngine.toggleVideo();
    return isVideoOff;
  };

  // Flip Camera
  const handleFlipCamera = async () => {
    if (!activeCall || activeCall.callType !== 'video' || !currentUser) return;
    const newFacing = currentFacingMode === 'user' ? 'environment' : 'user';
    setCurrentFacingMode(newFacing);
    const newStream = await callEngine.switchCamera(newFacing, currentUser.name);
    if (newStream) {
      setLocalStream(newStream);
    }
  };

  // Send In-Call Message / Reaction
  const handleSendMessage = (text: string, reaction?: string) => {
    if (!activeCall || !currentUser) return;

    const newMsg: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random()}`,
      senderPhone: currentUser.phone,
      senderName: currentUser.name,
      text,
      timestamp: Date.now(),
    };

    setChatMessages((prev) => [...prev, newMsg]);

    if (!activeCall.isSimulated && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call-chat',
          from_uid: currentUser.uid,
          from_name: currentUser.name,
          from_phone: currentUser.phone,
          to_uid: activeCall.peerUid || activeCall.peerPhone,
          text,
          reaction,
        })
      );
    }
  };

  // Trigger floating reaction emoji
  const handleTriggerReaction = (emoji: string) => {
    const reaction: FloatingReaction = {
      id: `react-${Date.now()}-${Math.random()}`,
      emoji,
      x: 20 + Math.random() * 60,
      y: 80,
    };
    setFloatingReactions((prev) => [...prev, reaction]);
    setTimeout(() => {
      setFloatingReactions((prev) => prev.filter((r) => r.id !== reaction.id));
    }, 2200);

    if (activeCall && currentUser && !activeCall.isSimulated && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'call-chat',
          from_uid: currentUser.uid,
          from_name: currentUser.name,
          from_phone: currentUser.phone,
          to_uid: activeCall.peerUid || activeCall.peerPhone,
          reaction: emoji,
        })
      );
    }
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    zegoService.init(user.uid, user.name).catch((err) => {
      console.warn('[ZEGOCLOUD] init on login success warning:', err);
    });
  };

  const handleLogout = async () => {
    await endCall('logout', true);
    if (currentUser?.uid) {
      await updateUserPresence(currentUser.uid, 'offline');
    }
    await logoutFromFirebase();
    setCurrentUser(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F0F2F5] flex flex-col items-center justify-center font-sans text-emerald-900" dir="rtl">
        <div className="w-16 h-16 rounded-2xl bg-[#128C7E] flex items-center justify-center text-white shadow-xl mb-4 animate-bounce">
          <span className="w-8 h-8 border-3 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
        <p className="text-sm font-bold text-gray-700">جاري تهيئة بيئة تواصل و Firebase...</p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="w-full min-h-screen bg-slate-950 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Incoming Call Modal for Callee */}
      {pendingIncomingCall && !activeCall && (
        <IncomingCallModal
          call={{
            peerPhone: pendingIncomingCall.caller_phone,
            peerName: pendingIncomingCall.caller_name,
            peerAvatarColor: pendingIncomingCall.caller_avatarColor,
            callType: pendingIncomingCall.callType,
            direction: 'incoming',
            roomId: pendingIncomingCall.roomId,
            roomUrl: pendingIncomingCall.roomUrl,
          }}
          onAccept={handleAcceptIncomingCall}
          onReject={handleRejectIncomingCall}
        />
      )}

      {/* Active Video/Voice Call Screen */}
      {activeCall && (
        <VideoCallScreen
          activeCall={activeCall}
          callState={callState}
          currentUserId={currentUser.uid}
          currentUserName={currentUser.name}
          localStream={localStream}
          remoteStream={remoteStream}
          onEndCall={() => endCall('user_ended', true)}
          onToggleAudio={handleToggleAudio}
          onToggleVideo={handleToggleVideo}
          onFlipCamera={handleFlipCamera}
          onSendMessage={handleSendMessage}
          chatMessages={chatMessages}
          floatingReactions={floatingReactions}
          onTriggerReaction={handleTriggerReaction}
        />
      )}

      {/* Main App Dashboard */}
      <MainScreen
        currentUser={currentUser}
        onLogout={handleLogout}
        onStartCall={handleStartCall}
        onlineUids={onlineUids}
        isWsConnected={isWsConnected}
      />
    </div>
  );
}

export default App;
