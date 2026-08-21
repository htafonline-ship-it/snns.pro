import DailyIframe, { DailyCall } from '@daily-co/daily-js';
import { auth } from '../lib/firebase';

export interface DailyRoomResponse {
  url: string;
  name: string;
  roomId?: string;
  roomUrl?: string;
  ROOM_PRIVACY?: string;
  FIREBASE_BACKEND_AUTH_VERIFIED?: boolean;
}

export interface DailyTokenResponse {
  token: string;
  roomName: string;
  userId: string;
  TOKEN_CREATED: boolean;
  FIREBASE_BACKEND_AUTH_VERIFIED?: boolean;
}

class DailyService {
  private callFrame: DailyCall | null = null;
  private currentRoomUrl: string | null = null;

  public onJoined?: () => void;
  public onLeft?: () => void;
  public onParticipantJoined?: (event: any) => void;
  public onParticipantLeft?: (event: any) => void;
  public onError?: (error: any) => void;

  /**
   * Request backend to create a single Private Daily Room using DAILY_API_KEY
   * Attaches Firebase ID Token in Authorization header
   */
  async createRoom(
    callType: 'video' | 'audio',
    callerUid: string,
    calleeUid: string
  ): Promise<DailyRoomResponse> {
    console.log('[DAILY] CREATE_ROOM_START', { callType, callerUid, calleeUid });

    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error('المستخدم غير مسجل الدخول في Firebase');
    }

    try {
      const res = await fetch('/api/daily/room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ callType, callerUid, calleeUid }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[DAILY_ERROR] createRoom failed:', data);
        const errMsg =
          data.error ||
          data.DAILY_RESPONSE_ERROR ||
          data.message ||
          `فشل في إنشاء غرفة Daily.co عبر الخادم (HTTP ${res.status})`;
        throw new Error(errMsg);
      }

      const data: DailyRoomResponse = await res.json();
      console.log('[DAILY] ROOM_CREATED = true', {
        roomName: data.name,
        roomUrl: data.url,
        privacy: data.ROOM_PRIVACY || 'private',
        authVerified: data.FIREBASE_BACKEND_AUTH_VERIFIED,
      });
      return data;
    } catch (err: any) {
      console.error('[DAILY_ERROR] createRoom exception:', err);
      throw err;
    }
  }

  /**
   * Request backend to generate a distinct Daily Meeting Token for authenticated Firebase user
   * Attaches Firebase ID Token in Authorization header
   */
  async getMeetingToken(
    roomName: string,
    userName: string,
    isOwner: boolean = false
  ): Promise<string> {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      throw new Error('المستخدم غير مسجل الدخول في Firebase');
    }

    console.log(`[DAILY_TOKEN] Requesting token for room=${roomName} (isOwner=${isOwner})`);
    try {
      const res = await fetch('/api/daily/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ roomName, userName, isOwner }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[DAILY_TOKEN_ERROR] Token creation failed:', data);
        throw new Error(data.error || `فشل في إنشاء رمز الدخول (Token) للغرفة`);
      }

      const data: DailyTokenResponse = await res.json();
      console.log(`[DAILY_TOKEN] TOKEN_CREATED = true`, {
        roomName: data.roomName,
        verifiedUserId: data.userId,
        authVerified: data.FIREBASE_BACKEND_AUTH_VERIFIED,
      });
      return data.token;
    } catch (err) {
      console.error('[DAILY_TOKEN_ERROR] Exception:', err);
      throw err;
    }
  }

  /**
   * Embed and join Daily Prebuilt Call within a container element
   */
  async joinPrebuilt(
    container: HTMLElement,
    roomUrl: string,
    userName: string,
    callType: 'video' | 'audio',
    token: string
  ): Promise<DailyCall> {
    if (!token) {
      throw new Error('رمز الدخول (Meeting Token) مطلوب لدخول الغرفة الخاصة');
    }

    console.log('[DAILY] JOIN_START', { roomUrl, userName, callType, hasToken: true });

    // Clean up any existing call frame
    await this.leave();

    // Ensure container is empty
    container.innerHTML = '';

    const frame = DailyIframe.createFrame(container, {
      iframeStyle: {
        width: '100%',
        height: '100%',
        border: 'none',
        borderRadius: '16px',
        backgroundColor: '#020617',
      },
      showLeaveButton: true,
      showFullscreenButton: true,
      showUserNameChangeUI: false,
      theme: {
        colors: {
          accent: '#128C7E',
          accentText: '#FFFFFF',
          background: '#020617',
          backgroundAccent: '#0f172a',
          baseText: '#FFFFFF',
          border: '#1e293b',
          mainAreaBg: '#020617',
          mainAreaBgAccent: '#0f172a',
        },
      },
    });

    this.callFrame = frame;
    this.currentRoomUrl = roomUrl;

    const logParticipants = (context: string) => {
      try {
        const p = frame.participants();
        const pKeys = Object.keys(p || {});
        const count = pKeys.length;
        const local = p.local;
        const remoteList = Object.values(p || {}).filter((part: any) => !part.local);
        const hasRemote = remoteList.length > 0;
        const remote = remoteList[0];

        console.log(`[DAILY_STATUS] ${context}:`);
        console.log(`[DAILY_STATUS] LOCAL_SESSION_ID = ${local?.session_id || 'none'}`);
        console.log(`[DAILY_STATUS] REMOTE_SESSION_ID = ${remote?.session_id || 'none'}`);
        console.log(`[DAILY_STATUS] PARTICIPANT_COUNT = ${count}`);
        console.log(`[DAILY_STATUS] REMOTE_PARTICIPANT = ${hasRemote}`);
        console.log(`[DAILY_STATUS] DAILY_AUDIO = ${Boolean(local?.audio)}`);
        console.log(`[DAILY_STATUS] DAILY_VIDEO = ${Boolean(local?.video)}`);
      } catch (err) {
        console.warn('[DAILY_STATUS_WARN]', err);
      }
    };

    frame.on('joined-meeting', () => {
      console.log('[DAILY] JOIN_SUCCESS = true');
      console.log('[DAILY] JOINED_MEETING = true');
      logParticipants('JOINED_MEETING');
      if (this.onJoined) this.onJoined();
    });

    frame.on('left-meeting', () => {
      console.log('[DAILY] LEFT_MEETING = true');
      if (this.onLeft) this.onLeft();
    });

    frame.on('participant-joined', (e) => {
      console.log('[DAILY] PARTICIPANT_JOINED', e);
      logParticipants('PARTICIPANT_JOINED');
      if (this.onParticipantJoined) this.onParticipantJoined(e);
    });

    frame.on('participant-updated', (e) => {
      logParticipants('PARTICIPANT_UPDATED');
    });

    frame.on('participant-left', (e) => {
      console.log('[DAILY] PARTICIPANT_LEFT', e);
      logParticipants('PARTICIPANT_LEFT');
      if (this.onParticipantLeft) this.onParticipantLeft(e);
    });

    frame.on('error', (e) => {
      console.error('[DAILY_ERROR] call frame error:', e);
      if (this.onError) this.onError(e);
    });

    await frame.join({
      url: roomUrl,
      userName: userName,
      videoSource: callType === 'video',
      audioSource: true,
      token: token,
    });

    return frame;
  }

  toggleAudio(state?: boolean): boolean {
    if (!this.callFrame) return false;
    const current = this.callFrame.localAudio();
    const target = state !== undefined ? state : !current;
    this.callFrame.setLocalAudio(target);
    return target;
  }

  toggleVideo(state?: boolean): boolean {
    if (!this.callFrame) return false;
    const current = this.callFrame.localVideo();
    const target = state !== undefined ? state : !current;
    this.callFrame.setLocalVideo(target);
    return target;
  }

  async leave() {
    if (this.callFrame) {
      try {
        console.log('[DAILY] LEAVE_START');
        await this.callFrame.leave();
        await this.callFrame.destroy();
        console.log('[DAILY] LEAVE_SUCCESS = true');
      } catch (e) {
        console.warn('[DAILY] leave/destroy notice:', e);
      }
      this.callFrame = null;
      this.currentRoomUrl = null;
    }
  }

  getCallFrame(): DailyCall | null {
    return this.callFrame;
  }
}

export const dailyService = new DailyService();
