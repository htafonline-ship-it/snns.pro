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
   * Initialize Zego Engine with the user's Firebase UID
   */
  async init(firebaseUid: string, displayName?: string): Promise<ZegoExpressEngine> {
    return this.initEngine(firebaseUid, displayName || 'مستخدم', 'A');
  }

  /**
   * Initialize Zego Engine instance
   */
  async initEngine(firebaseUid: string, displayName: string, role: 'A' | 'B' = 'A'): Promise<ZegoExpressEngine> {
    if (this.engine && this.isInitialized && this.currentUserId === firebaseUid) {
      console.log(`[ZEGO] USER_ID = ${firebaseUid}`);
      console.log(`[ZEGO] INITIALIZED = true`);
      return this.engine;
    }

    try {
      const { appId, serverUrl } = await this.fetchToken(firebaseUid, undefined, role);

      this.currentUserId = firebaseUid;
      this.currentUserName = displayName;

      this.engine = new ZegoExpressEngine(appId, serverUrl);
      this.isInitialized = true;

      console.log(`[ZEGO] USER_ID = ${firebaseUid}`);
      console.log(`[ZEGO] INITIALIZED = true`);
      console.log(`[ZEGO-${role}] ENGINE_READY = true`);

      // Event listener: Stream updates (Remote stream added or removed)
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

      // Event listener: User updates (Remote user joins or leaves)
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
      console.log(`[ZEGO] INITIALIZED = false`);
      console.error(`[ZEGO_ERROR] initEngine message=${err?.message || err}`);
      throw err;
    }
  }

  /**
   * Main entry point to Join Room and Publish Stream
   */
  async joinAndPublish(params: JoinRoomParams): Promise<MediaStream | null> {
    const { role, roomId, uid, name, callType, callId, facingMode, callerRoomId } = params;

    console.log(`[ZEGO-${role}] UID = ${uid}`);
    if (callId) console.log(`[ZEGO-${role}] CALL_ID = ${callId}`);
    console.log(`[ZEGO-${role}] ROOM_ID = ${roomId}`);

    try {
      // 1. Initialize Engine
      await this.initEngine(uid, name, role);
      if (!this.engine) {
        throw new Error('ZegoExpressEngine not initialized');
      }

      // 2. Clean up any existing local stream before acquiring new device
      if (this.localStream) {
        try {
          this.localStream.getTracks().forEach((track) => track.stop());
          await this.engine.destroyStream(this.localStream);
        } catch (e) {}
        this.localStream = null;
      }

      // 3. Fetch Token for this room
      const tokenData = await this.fetchToken(uid, roomId, role);

      // 4. Login to ZEGOCLOUD Room
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

      // 5. Create Real Local Audio/Video Stream via ZEGOCLOUD
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
        console.warn(`[ZEGOCLOUD] createStream standard failed (code=${err1?.code}), trying basic camera config...`);

        try {
          stream = await this.engine.createStream({
            camera: {
              video: isVideo,
              audio: true,
            },
          });
        } catch (err2: any) {
          // If video device is in use, fallback to audio
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

          // Browser native getUserMedia fallback into custom Zego stream
          if (!stream && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
            try {
              const raw = await navigator.mediaDevices.getUserMedia({
                video: isVideo ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
                audio: true,
              });
              stream = await this.engine.createStream({
                custom: {
                  source: raw,
                },
              });
            } catch (err4: any) {
              console.error(`[ZEGO_ERROR] createStream all attempts failed:`, err4);
            }
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
        console.error(`[ZEGO_ERROR] createStream code=1103065 message=Could not access audio/video device`);
      }

      // 6. Start Publishing Stream to ZEGOCLOUD
      if (stream) {
        const streamId = `stream_${roomId}_${uid}`;
        this.publishedStreamId = streamId;

        const publishSuccess = this.engine.startPublishingStream(streamId, stream, {
          videoCodec: 'H264',
        });
        console.log('[ZEGO] PUBLISH_SUCCESS = true');
        console.log(`[ZEGO-${role}] PUBLISH_STREAM_SUCCESS = ${Boolean(publishSuccess !== false)}`);
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

  async leaveRoom() {
    if (!this.engine) return;

    if (this.publishedStreamId) {
      try {
        this.engine.stopPublishingStream(this.publishedStreamId);
      } catch (e) {}
      this.publishedStreamId = null;
    }

    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach((track) => track.stop());
        this.engine.destroyStream(this.localStream);
      } catch (e) {}
      this.localStream = null;
    }

    if (this.currentRoomId) {
      try {
        await this.engine.logoutRoom(this.currentRoomId);
      } catch (e) {}
      this.currentRoomId = null;
    }
  }
}

export const zegoService = new ZegoService();
