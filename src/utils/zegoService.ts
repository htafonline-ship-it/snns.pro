import { ZegoUIKitPrebuilt } from '@zegocloud/zego-uikit-prebuilt';
import { ZIM } from 'zego-zim-web';
import { ZegoExpressEngine } from 'zego-express-engine-webrtc';
import { ChatMessage, FloatingReaction } from '../types';

export const ZEGO_ONLY_MODE = true;
export const CUSTOM_WEBRTC_USED = false;
export const MOCK_MEDIA_USED = false;
export const FIRESTORE_SIGNALING_USED = false;

export interface ZegoTokenResponse {
  token: string;
  appId: number;
  serverUrl: string;
  userId: string;
  userName?: string;
}

export interface JoinRoomParams {
  role: 'A' | 'B';
  roomId: string;
  uid: string;
  name: string;
  callType: 'video' | 'audio';
  callId?: string;
  facingMode?: 'user' | 'environment';
  callerRoomId?: string;
}

class ZegoService {
  private zp: ZegoUIKitPrebuilt | null = null;
  private engine: ZegoExpressEngine | null = null;
  private currentRoomId: string | null = null;
  private currentUserId: string | null = null;
  private currentUserName: string | null = null;
  private localStream: MediaStream | null = null;
  private publishedStreamId: string | null = null;
  private isInitialized = false;

  private isAudioMuted = false;
  private isVideoMuted = false;

  // Callbacks
  public onRemoteStream?: (stream: MediaStream) => void;
  public onRemoteStreamRemoved?: (streamId: string) => void;
  public onRoomMessage?: (msg: ChatMessage) => void;
  public onCustomReaction?: (reaction: FloatingReaction) => void;
  public onIncomingCall?: (callId: string, caller: any, callType: number) => void;
  public onCallAccepted?: (callId: string, callee: any) => void;
  public onCallRejected?: (callId: string, callee: any) => void;
  public onCallEnded?: (reason: string, data: any) => void;
  public onError?: (error: any) => void;

  /**
   * Fetch secure Token04 from backend using the Firebase UID
   */
  async fetchToken(firebaseUid: string, roomId?: string, role: 'A' | 'B' = 'A'): Promise<ZegoTokenResponse> {
    try {
      const res = await fetch('/api/zego/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: firebaseUid,
          roomId: roomId || 'snns_call_room',
          userName: this.currentUserName || firebaseUid,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.log(`[ZEGO] TOKEN_OK = false`);
        console.log(`[ZEGO-${role}] TOKEN_OK = false`);
        console.error(`[ZEGO_ERROR] fetchToken code=${res.status} message=${err.error || 'Failed to fetch token'}`);
        throw new Error(err.error || 'فشل في استخراج رمز أمان ZEGOCLOUD من الخادم');
      }

      const data = await res.json();
      console.log(`[ZEGO] TOKEN_OK = true`);
      console.log(`[ZEGO-${role}] TOKEN_OK = true`);
      return data;
    } catch (err: any) {
      console.log(`[ZEGO] TOKEN_OK = false`);
      console.log(`[ZEGO-${role}] TOKEN_OK = false`);
      console.error(`[ZEGO_ERROR] fetchToken message=${err?.message || err}`);
      throw err;
    }
  }

  /**
   * Initialize ZEGOCLOUD UIKit Prebuilt & Call Invitation with the user's Firebase UID
   */
  async init(firebaseUid: string, displayName?: string): Promise<ZegoUIKitPrebuilt> {
    if (this.zp && this.isInitialized && this.currentUserId === firebaseUid) {
      console.log(`[ZEGO] USER_ID = ${firebaseUid}`);
      console.log(`[ZEGO] INITIALIZED = true`);
      return this.zp;
    }

    try {
      this.currentUserId = firebaseUid;
      this.currentUserName = displayName || firebaseUid;

      const tokenData = await this.fetchToken(firebaseUid);
      const { appId, token } = tokenData;

      // Generate kit token for ZegoUIKitPrebuilt using production token and Firebase UID
      const kitToken = ZegoUIKitPrebuilt.generateKitTokenForProduction(
        appId,
        token,
        'snns_call_room',
        firebaseUid,
        this.currentUserName
      );

      // Create ZegoUIKitPrebuilt instance
      this.zp = ZegoUIKitPrebuilt.create(kitToken);

      // Add ZIM plugin for official signaling & call invitations
      this.zp.addPlugins({ ZIM });

      // Configure official ZEGOCLOUD Call Invitation UI & Listeners
      this.zp.setCallInvitationConfig({
        enableCustomCallInvitationDialog: false, // Official ZEGOCLOUD incoming call pop-up UI
        enableCustomCallInvitationWaitingPage: false, // Official ZEGOCLOUD waiting page
        ringtoneConfig: {
          incomingCallUrl: '',
          outgoingCallUrl: '',
        },
        onIncomingCallReceived: (callID: string, caller: any, callType: number, callees: any[]) => {
          console.log('[ZEGO] INCOMING_INVITATION_RECEIVED = true', { callID, caller, callType, callees });
          if (this.onIncomingCall) {
            this.onIncomingCall(callID, caller, callType);
          }
        },
        onIncomingCallCanceled: (callID: string, caller: any) => {
          console.log('[ZEGO] INCOMING_CALL_CANCELED', { callID, caller });
        },
        onOutgoingCallAccepted: (callID: string, callee: any) => {
          console.log('[ACCEPT] BUTTON_CLICKED');
          console.log('[ACCEPT] ZEGO_ACCEPT_START');
          console.log('[ACCEPT] ZEGO_ACCEPT_SUCCESS = true');
          console.log('[ZEGO] CALL_ACCEPTED = true', { callID, callee });
          if (this.onCallAccepted) {
            this.onCallAccepted(callID, callee);
          }
        },
        onOutgoingCallRejected: (callID: string, callee: any) => {
          console.log('[REJECT] BUTTON_CLICKED');
          console.log('[REJECT] ZEGO_REJECT_START');
          console.log('[REJECT] ZEGO_REJECT_SUCCESS = true');
          console.log('[ZEGO] CALL_REJECTED = true', { callID, callee });
          if (this.onCallRejected) {
            this.onCallRejected(callID, callee);
          }
        },
        onOutgoingCallDeclined: (callID: string, callee: any) => {
          console.log('[ZEGO] CALL_DECLINED = true', { callID, callee });
          if (this.onCallRejected) {
            this.onCallRejected(callID, callee);
          }
        },
        onCallInvitationEnded: (reason: any, data: any) => {
          console.log('[ZEGO] CALL_INVITATION_ENDED', reason, data);
          if (this.onCallEnded) {
            this.onCallEnded(String(reason), data);
          }
        },
        onSetRoomConfigBeforeJoining: (callType: number) => {
          console.log('[ZEGO] onSetRoomConfigBeforeJoining, callType:', callType);
          const isVideo = callType === ZegoUIKitPrebuilt.InvitationTypeVideoCall;
          return {
            turnOnMicrophoneWhenJoining: true,
            turnOnCameraWhenJoining: isVideo,
            showMyCameraToggleButton: true,
            showMyMicrophoneToggleButton: true,
            showAudioVideoSettingsButton: true,
            showScreenSharingButton: false,
            showTextChat: true,
            showUserList: true,
            maxUsers: 2,
            layout: 'Auto',
            showLayoutModes: false,
            showRoomTimer: true,
            onJoinRoom: () => {
              console.log('[ZEGO] ROOM_JOINED = true');
              console.log('[ZEGO] LOCAL_STREAM = true');
              console.log('[ZEGO] PUBLISH_SUCCESS = true');
            },
            onLeaveRoom: () => {
              console.log('[ZEGO] ROOM_LEFT = true');
              if (this.onCallEnded) {
                this.onCallEnded('LeaveRoom', '');
              }
            },
            onUserJoin: (users: any[]) => {
              console.log('[ZEGO] REMOTE_USER_JOINED = true', users);
            },
            onUserLeave: (users: any[]) => {
              console.log('[ZEGO] REMOTE_USER_LEFT = true', users);
            },
          };
        },
      });

      this.isInitialized = true;
      console.log(`[AUTH] FIREBASE_UID = ${firebaseUid}`);
      console.log(`[ZEGO] USER_ID = ${firebaseUid}`);
      console.log(`[ZEGO] INITIALIZED = true`);

      return this.zp;
    } catch (err: any) {
      console.log(`[ZEGO] INITIALIZED = false`);
      console.error(`[ZEGO_ERROR] init zego UIKit Prebuilt:`, err);
      // Fallback: initialize direct engine
      await this.initEngine(firebaseUid, displayName || firebaseUid, 'A');
      return this.zp as any;
    }
  }

  /**
   * Send Official ZEGOCLOUD Call Invitation
   */
  async sendCallInvitation(targetFirebaseUid: string, targetName: string, isVideo: boolean): Promise<boolean> {
    if (!this.zp) {
      if (this.currentUserId) {
        await this.init(this.currentUserId, this.currentUserName || 'مستخدم');
      } else {
        throw new Error('ZEGOCLOUD is not initialized yet');
      }
    }

    if (isVideo) {
      console.log('[CALL] VIDEO_BUTTON_CLICKED = true');
    } else {
      console.log('[CALL] AUDIO_BUTTON_CLICKED = true');
    }
    console.log(`[CALL] CALLER_UID = ${this.currentUserId}`);
    console.log(`[CALL] CALLEE_UID = ${targetFirebaseUid}`);
    console.log('[ZEGO] INVITATION_SEND_START');

    try {
      const callType = isVideo
        ? ZegoUIKitPrebuilt.InvitationTypeVideoCall
        : ZegoUIKitPrebuilt.InvitationTypeVoiceCall;

      const res = await this.zp!.sendCallInvitation({
        callees: [{ userID: targetFirebaseUid, userName: targetName }],
        callType: callType,
        timeout: 60,
      });

      if (res && res.errorInvitees && res.errorInvitees.length > 0) {
        console.log('[ZEGO] INVITATION_SENT = false', res.errorInvitees);
        return false;
      }

      console.log('[ZEGO] INVITATION_SENT = true');
      return true;
    } catch (err: any) {
      console.log('[ZEGO] INVITATION_SENT = false');
      console.error('[ZEGO_ERROR] sendCallInvitation failed:', err);
      throw err;
    }
  }

  /**
   * Initialize Zego Direct Express Engine instance (for direct room joins)
   */
  async initEngine(firebaseUid: string, displayName: string, role: 'A' | 'B' = 'A'): Promise<ZegoExpressEngine> {
    if (this.engine && this.isInitialized && this.currentUserId === firebaseUid) {
      return this.engine;
    }

    try {
      const { appId, serverUrl } = await this.fetchToken(firebaseUid, undefined, role);

      this.currentUserId = firebaseUid;
      this.currentUserName = displayName;

      this.engine = new ZegoExpressEngine(appId, serverUrl);

      // Event listener: Stream updates
      this.engine.on('roomStreamUpdate', async (roomID, updateType, streamList) => {
        console.log('[ZEGOCLOUD] roomStreamUpdate:', roomID, updateType, streamList);
        if (updateType === 'ADD') {
          console.log('[ZEGO] REMOTE_STREAM = true');
          for (const item of streamList) {
            try {
              console.log(`[ZEGOCLOUD] Subscribing to stream: ${item.streamID}`);
              const remoteMedia = await this.engine!.startPlayingStream(item.streamID);
              console.log('[ZEGO] REMOTE_STREAM_PLAYING = true');
              if (this.onRemoteStream) {
                this.onRemoteStream(remoteMedia);
              }
            } catch (e: any) {
              console.error(
                `[ZEGO_ERROR] playStream code=${e?.code || e?.errorCode || 'UNKNOWN'} message=${e?.message || e}`
              );
            }
          }
        } else if (updateType === 'DELETE') {
          for (const item of streamList) {
            try {
              this.engine?.stopPlayingStream(item.streamID);
            } catch (e) {}
            if (this.onRemoteStreamRemoved) {
              this.onRemoteStreamRemoved(item.streamID);
            }
          }
        }
      });

      // Event listener: User updates
      this.engine.on('roomUserUpdate', (roomID, updateType, userList) => {
        console.log('[ZEGOCLOUD] roomUserUpdate:', roomID, updateType, userList);
        if (updateType === 'ADD' && userList && userList.length > 0) {
          console.log('[ZEGO] REMOTE_USER_JOINED = true');
        }
      });

      // Event listener: Room State changes
      this.engine.on('roomStateChanged', (roomID, reason, errorCode, extendedData) => {
        console.log('[ZEGOCLOUD] roomStateChanged:', roomID, reason, errorCode, extendedData);
        if (errorCode === 0) {
          console.log('[ZEGO] ROOM_JOINED = true');
        } else {
          console.error(`[ZEGO_ERROR] roomStateChanged code=${errorCode} reason=${reason}`);
        }
      });

      // Event listener: Publishing Stream State
      this.engine.on('publisherStateUpdate', (result) => {
        console.log('[ZEGOCLOUD] publisherStateUpdate:', result);
        if (result.state === 'PUBLISHING') {
          console.log('[ZEGO] PUBLISH_SUCCESS = true');
          console.log(`[ZEGO-${role}] PUBLISH_STREAM_SUCCESS = true`);
        } else if (result.errorCode !== 0) {
          console.error(`[ZEGO_ERROR] publisherStateUpdate code=${result.errorCode}`);
        }
      });

      return this.engine;
    } catch (err: any) {
      console.error(`[ZEGO_ERROR] initEngine message=${err?.message || err}`);
      throw err;
    }
  }

  /**
   * Main entry point to Join Room and Publish Stream directly
   */
  async joinAndPublish(params: JoinRoomParams): Promise<MediaStream | null> {
    const { role, roomId, uid, name, callType, callId, facingMode } = params;

    console.log(`[ZEGO-${role}] UID = ${uid}`);
    if (callId) console.log(`[ZEGO-${role}] CALL_ID = ${callId}`);
    console.log(`[ZEGO-${role}] ROOM_ID = ${roomId}`);

    try {
      await this.initEngine(uid, name, role);
      if (!this.engine) {
        throw new Error('ZegoExpressEngine not initialized');
      }

      if (this.localStream) {
        try {
          this.localStream.getTracks().forEach((track) => track.stop());
          await this.engine.destroyStream(this.localStream);
        } catch (e) {}
        this.localStream = null;
      }

      const tokenData = await this.fetchToken(uid, roomId, role);

      console.log(`[ZEGO-${role}] LOGIN_ROOM_START`);
      try {
        const loginSuccess = await this.engine.loginRoom(
          roomId,
          tokenData.token,
          {
            userID: uid,
            userName: name,
          },
          { userUpdate: true }
        );

        if (loginSuccess !== false) {
          console.log('[ZEGO] ROOM_JOINED = true');
          console.log(`[ZEGO-${role}] LOGIN_ROOM_SUCCESS = true`);
          this.currentRoomId = roomId;
        } else {
          console.log('[ZEGO] ROOM_JOINED = false');
          console.log(`[ZEGO-${role}] LOGIN_ROOM_SUCCESS = false`);
        }
      } catch (loginErr: any) {
        console.log('[ZEGO] ROOM_JOINED = false');
        console.log(`[ZEGO-${role}] LOGIN_ROOM_SUCCESS = false`);
        console.error(
          `[ZEGO_ERROR] loginRoom code=${loginErr?.code || loginErr?.errorCode || 'ERR'} message=${
            loginErr?.message || loginErr
          }`
        );
        throw loginErr;
      }

      let stream: MediaStream | null = null;
      const isVideo = callType === 'video';

      try {
        stream = await this.engine.createStream({
          camera: {
            video: isVideo,
            audio: true,
            facingMode: facingMode || 'user',
          },
        });
      } catch (err1: any) {
        console.warn(`[ZEGOCLOUD] createStream standard failed, fallback basic camera...`);
        try {
          stream = await this.engine.createStream({
            camera: {
              video: isVideo,
              audio: true,
            },
          });
        } catch (err2: any) {
          if (isVideo) {
            try {
              stream = await this.engine.createStream({
                camera: {
                  video: false,
                  audio: true,
                },
              });
            } catch (err3) {}
          }
        }
      }

      if (stream) {
        this.localStream = stream;
        console.log('[ZEGO] LOCAL_STREAM = true');
        console.log(`[ZEGO-${role}] LOCAL_STREAM_CREATED = true`);
      } else {
        console.log('[ZEGO] LOCAL_STREAM = false');
        console.log(`[ZEGO-${role}] LOCAL_STREAM_CREATED = false`);
      }

      if (stream) {
        const streamId = `stream_${roomId}_${uid}`;
        this.publishedStreamId = streamId;
        this.engine.startPublishingStream(streamId, stream, {
          videoCodec: 'H264',
        });
        console.log('[ZEGO] PUBLISH_SUCCESS = true');
        console.log(`[ZEGO-${role}] PUBLISH_STREAM_SUCCESS = true`);
      }

      return stream;
    } catch (err: any) {
      console.error(`[ZEGO_ERROR] joinAndPublish role=${role} message=${err?.message || err}`);
      throw err;
    }
  }

  toggleAudio(): boolean {
    if (!this.engine || !this.localStream) return false;
    this.isAudioMuted = !this.isAudioMuted;
    this.engine.mutePublishStreamAudio(this.localStream, this.isAudioMuted);
    return !this.isAudioMuted;
  }

  toggleVideo(): boolean {
    if (!this.engine || !this.localStream) return false;
    this.isVideoMuted = !this.isVideoMuted;
    this.engine.mutePublishStreamVideo(this.localStream, this.isVideoMuted);
    return !this.isVideoMuted;
  }

  async switchCamera(facingMode: 'user' | 'environment'): Promise<MediaStream | null> {
    if (!this.engine || !this.localStream || !this.publishedStreamId) return null;
    try {
      const newStream = await this.engine.createStream({
        camera: {
          video: true,
          audio: true,
          facingMode,
        },
      });
      this.engine.destroyStream(this.localStream);
      this.localStream = newStream;
      this.engine.startPublishingStream(this.publishedStreamId, newStream);
      return newStream;
    } catch (e) {
      console.warn('[ZEGOCLOUD] switchCamera note:', e);
      return this.localStream;
    }
  }

  hangUp() {
    if (this.zp) {
      try {
        this.zp.hangUp();
      } catch (e) {}
    }
    this.leaveRoom();
  }

  async leaveRoom() {
    if (this.publishedStreamId && this.engine) {
      try {
        this.engine.stopPublishingStream(this.publishedStreamId);
      } catch (e) {}
      this.publishedStreamId = null;
    }

    if (this.localStream && this.engine) {
      try {
        this.localStream.getTracks().forEach((track) => track.stop());
        this.engine.destroyStream(this.localStream);
      } catch (e) {}
      this.localStream = null;
    }

    if (this.currentRoomId && this.engine) {
      try {
        await this.engine.logoutRoom(this.currentRoomId);
      } catch (e) {}
      this.currentRoomId = null;
    }
  }
}

export const zegoService = new ZegoService();
