import DailyIframe, { DailyCall } from '@daily-co/daily-js';

export interface DailyRoomResponse {
  url: string;
  name: string;
  roomId?: string;
  roomUrl?: string;
}

export interface DailyTokenResponse {
  token: string;
  roomName: string;
  userId: string;
  TOKEN_CREATED: boolean;
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
   * Request backend to create a single Daily Room using DAILY_API_KEY
   */
  async createRoom(
    callType: 'video' | 'audio',
    callerUid: string,
    calleeUid: string
  ): Promise<DailyRoomResponse> {
    console.log('[DAILY] CREATE_ROOM_START', { callType, callerUid, calleeUid });
    try {
      const res = await fetch('/api/daily/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      console.log('[DAILY] ROOM_CREATED = true', data);
      return data;
    } catch (err: any) {
      console.error('[DAILY_ERROR] createRoom exception:', err);
      throw err;
    }
  }

  /**
   * Request backend to generate a distinct Daily Meeting Token for a specific user and room
   */
  async getMeetingToken(
    roomName: string,
    userId: string,
    userName: string,
    isOwner: boolean = false
  ): Promise<string> {
    console.log(`[DAILY_TOKEN] Requesting token for user=${userId} in room=${roomName}`);
    try {
      const res = await fetch('/api/daily/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName, userId, userName, isOwner }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[DAILY_TOKEN_ERROR] Token creation failed:', data);
        throw new Error(data.error || `فشل في إنشاء رمز الدخول (Token) للغرفة`);
      }

      const data: DailyTokenResponse = await res.json();
      console.log(`[DAILY_TOKEN] TOKEN_CREATED = true`, {
        roomName: data.roomName,
        userId: data.userId,
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
    token?: string
  ): Promise<DailyCall> {
    console.log('[DAILY] JOIN_START', { roomUrl, userName, callType, hasToken: Boolean(token) });

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
        const hasRemote = pKeys.some((k) => k !== 'local');
        console.log(`[DAILY] ${context} | PARTICIPANT_COUNT = ${count} | REMOTE_PARTICIPANT = ${hasRemote}`);
      } catch {
        // ignore
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
      console.log('[DAILY] PARTICIPANT_JOINED = true', e);
      logParticipants('PARTICIPANT_JOINED');
      if (this.onParticipantJoined) this.onParticipantJoined(e);
    });

    frame.on('participant-left', (e) => {
      console.log('[DAILY] PARTICIPANT_LEFT = true', e);
      logParticipants('PARTICIPANT_LEFT');
      if (this.onParticipantLeft) this.onParticipantLeft(e);
    });

    frame.on('error', (e) => {
      console.error('[DAILY_ERROR] call frame error:', e);
      if (this.onError) this.onError(e);
    });

    const joinOptions: any = {
      url: roomUrl,
      userName: userName,
      videoSource: callType === 'video',
      audioSource: true,
    };

    if (token) {
      joinOptions.token = token;
    }

    await frame.join(joinOptions);

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
