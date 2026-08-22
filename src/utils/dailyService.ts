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

export interface DailyParticipantInfo {
  sessionId: string;
  userName: string;
  userId: string;
  isLocal: boolean;
  audio: boolean;
  video: boolean;
  joinedAt?: number;
}

export interface DailyRoomStateSummary {
  participantCount: number;
  hasBothJoined: boolean;
  localParticipant: DailyParticipantInfo | null;
  remoteParticipants: DailyParticipantInfo[];
  allParticipants: DailyParticipantInfo[];
}

class DailyService {
  private callFrame: DailyCall | null = null;
  private currentRoomUrl: string | null = null;
  private currentRoomName: string | null = null;

  // Real-time event callbacks
  public onJoined?: (summary: DailyRoomStateSummary) => void;
  public onLeft?: () => void;
  public onParticipantJoined?: (event: any, summary: DailyRoomStateSummary) => void;
  public onParticipantLeft?: (event: any, summary: DailyRoomStateSummary) => void;
  public onParticipantUpdated?: (event: any, summary: DailyRoomStateSummary) => void;
  public onParticipantCountChange?: (
    count: number,
    hasBothJoined: boolean,
    summary: DailyRoomStateSummary
  ) => void;
  public onBothUsersJoined?: (summary: DailyRoomStateSummary) => void;
  public onError?: (error: any) => void;

  /**
   * Calculate current participants breakdown and true participant count from the Daily call frame
   */
  public getParticipantsSummary(): DailyRoomStateSummary {
    if (!this.callFrame) {
      return {
        participantCount: 0,
        hasBothJoined: false,
        localParticipant: null,
        remoteParticipants: [],
        allParticipants: [],
      };
    }

    try {
      const rawParticipants: any = this.callFrame.participants() || {};
      let localParticipant: DailyParticipantInfo | null = null;
      const remoteParticipants: DailyParticipantInfo[] = [];

      if (rawParticipants && rawParticipants.local) {
        const l = rawParticipants.local;
        localParticipant = {
          sessionId: l.session_id || 'local',
          userName: l.user_name || 'مستخدم',
          userId: l.user_id || '',
          isLocal: true,
          audio: Boolean(l.audio),
          video: Boolean(l.video),
        };
      }

      Object.entries(rawParticipants).forEach(([key, val]: [string, any]) => {
        if (key === 'local' || !val) return;
        if (val.session_id && !val.local) {
          remoteParticipants.push({
            sessionId: val.session_id,
            userName: val.user_name || 'مستخدم',
            userId: val.user_id || '',
            isLocal: false,
            audio: Boolean(val.audio),
            video: Boolean(val.video),
          });
        }
      });

      const allParticipants = localParticipant
        ? [localParticipant, ...remoteParticipants]
        : remoteParticipants;

      const participantCount = allParticipants.length;
      const hasBothJoined = participantCount >= 2;

      return {
        participantCount,
        hasBothJoined,
        localParticipant,
        remoteParticipants,
        allParticipants,
      };
    } catch (err) {
      console.warn('[DAILY] Error getting participants summary:', err);
      return {
        participantCount: 0,
        hasBothJoined: false,
        localParticipant: null,
        remoteParticipants: [],
        allParticipants: [],
      };
    }
  }

  /**
   * Log real-time participant status and metrics to console
   */
  private logParticipantStatus(eventContext: string): DailyRoomStateSummary {
    const summary = this.getParticipantsSummary();
    const { participantCount, hasBothJoined, localParticipant, remoteParticipants } = summary;

    console.log(`[DAILY_STATUS] === ${eventContext} ===`);
    console.log(`[DAILY_STATUS] ROOM_NAME = ${this.currentRoomName || 'unknown'}`);
    console.log(`[DAILY_STATUS] PARTICIPANT_COUNT = ${participantCount}`);
    console.log(`[DAILY_STATUS] TWO_USERS_JOINED = ${hasBothJoined}`);
    console.log(`[DAILY_STATUS] LOCAL_SESSION_ID = ${localParticipant?.sessionId || 'none'}`);
    console.log(
      `[DAILY_STATUS] REMOTE_PARTICIPANTS_COUNT = ${remoteParticipants.length}`
    );
    if (remoteParticipants.length > 0) {
      console.log(
        `[DAILY_STATUS] REMOTE_NAMES = [${remoteParticipants.map((r) => `${r.userName} (${r.sessionId})`).join(', ')}]`
      );
    }
    console.log(`[DAILY_STATUS] REALTIME_VERIFIED_ROOM = ${hasBothJoined}`);

    return summary;
  }

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
   * Attaches Firebase ID Token in Authorization header if available
   */
  async getMeetingToken(
    roomName: string,
    userName: string,
    isOwner: boolean = false,
    userId?: string
  ): Promise<string> {
    const idToken = await auth.currentUser?.getIdToken().catch(() => null);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (idToken) {
      headers.Authorization = `Bearer ${idToken}`;
    }

    console.log('[TOKEN] REQUEST_SENT = true');

    try {
      const res = await fetch('/api/daily/token', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          roomName,
          userName,
          isOwner,
          userId: userId || auth.currentUser?.uid || 'user_' + Date.now(),
        }),
      });

      console.log(`[TOKEN] HTTP_STATUS = ${res.status}`);
      const data = await res.json().catch(() => ({}));

      const tokenCreated = Boolean(data.token);
      console.log(`[TOKEN] TOKEN_CREATED = ${tokenCreated}`);
      console.log(`CALL_ROOM_NAME = ${roomName}`);
      console.log(`TOKEN_ROOM_NAME = ${data.roomName || roomName}`);
      console.log(
        `ROOM_NAME_MATCH = ${Boolean(roomName && (data.roomName === roomName || !data.roomName))}`
      );

      if (!res.ok || !data.token) {
        const errorMsg =
          data.error ||
          data.details?.error ||
          `فشل في إنشاء رمز الدخول (Token) للغرفة (HTTP ${res.status})`;
        console.error('[DAILY_TOKEN_ERROR] Token creation failed:', errorMsg);
        throw new Error(errorMsg);
      }

      return data.token;
    } catch (err: any) {
      console.error('[DAILY_TOKEN_ERROR] Exception:', err);
      throw err;
    }
  }

  /**
   * Embed and join Daily Prebuilt Call within a container element with real-time participant event monitoring
   */
  async joinPrebuilt(
    container: HTMLElement,
    roomUrl: string,
    userName: string,
    callType: 'video' | 'audio',
    token: string
  ): Promise<DailyCall> {
    console.log('[DAILY] JOIN_START');
    console.log('DAILY_JOIN_STARTED = true');
    console.log('ZEGO_ACTIVE = false');
    console.log('CUSTOM_WEBRTC_ACTIVE = false');

    if (!token) {
      console.log('[DAILY] JOIN_SUCCESS = false');
      console.log('[DAILY] ERROR_CODE = MISSING_TOKEN');
      console.log('[DAILY] ERROR_MESSAGE = Meeting Token is required');
      throw new Error('رمز الدخول (Meeting Token) مطلوب لدخول الغرفة الخاصة');
    }

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
    this.currentRoomName = roomUrl.split('/').filter(Boolean).pop() || null;

    // Real-time Event Listeners for Daily Room Participants
    frame.on('joined-meeting', () => {
      console.log('[DAILY] JOIN_SUCCESS = true');
      console.log('[DAILY] ERROR_CODE = NONE');
      console.log('[DAILY] ERROR_MESSAGE = NONE');
      console.log('[DAILY] JOINED_MEETING = true');

      const summary = this.logParticipantStatus('JOINED_MEETING');

      if (this.onJoined) this.onJoined(summary);
      if (this.onParticipantCountChange) {
        this.onParticipantCountChange(summary.participantCount, summary.hasBothJoined, summary);
      }
      if (summary.hasBothJoined && this.onBothUsersJoined) {
        this.onBothUsersJoined(summary);
      }
    });

    frame.on('left-meeting', () => {
      console.log('[DAILY] LEFT_MEETING = true');
      console.log('[DAILY_STATUS] PARTICIPANT_COUNT = 0');
      if (this.onLeft) this.onLeft();
    });

    frame.on('participant-joined', (e: any) => {
      console.log(
        `[DAILY] PARTICIPANT_JOINED: ${e?.participant?.user_name || e?.participant?.session_id}`
      );
      const summary = this.logParticipantStatus('PARTICIPANT_JOINED');

      if (this.onParticipantJoined) this.onParticipantJoined(e, summary);
      if (this.onParticipantCountChange) {
        this.onParticipantCountChange(summary.participantCount, summary.hasBothJoined, summary);
      }
      if (summary.hasBothJoined && this.onBothUsersJoined) {
        this.onBothUsersJoined(summary);
      }
    });

    frame.on('participant-updated', (e: any) => {
      const summary = this.logParticipantStatus('PARTICIPANT_UPDATED');
      if (this.onParticipantUpdated) this.onParticipantUpdated(e, summary);
      if (this.onParticipantCountChange) {
        this.onParticipantCountChange(summary.participantCount, summary.hasBothJoined, summary);
      }
    });

    frame.on('participant-left', (e: any) => {
      console.log(
        `[DAILY] PARTICIPANT_LEFT: ${e?.participant?.user_name || e?.participant?.session_id}`
      );
      const summary = this.logParticipantStatus('PARTICIPANT_LEFT');

      if (this.onParticipantLeft) this.onParticipantLeft(e, summary);
      if (this.onParticipantCountChange) {
        this.onParticipantCountChange(summary.participantCount, summary.hasBothJoined, summary);
      }
    });

    frame.on('track-started', (e: any) => {
      console.log(`[DAILY] TRACK_STARTED: ${e?.track?.kind} from ${e?.participant?.user_name || 'local'}`);
      this.logParticipantStatus('TRACK_STARTED');
    });

    frame.on('track-stopped', (e: any) => {
      console.log(`[DAILY] TRACK_STOPPED: ${e?.track?.kind} from ${e?.participant?.user_name || 'local'}`);
      this.logParticipantStatus('TRACK_STOPPED');
    });

    frame.on('error', (e: any) => {
      const errCode = e?.errorMsg || e?.type || e?.code || 'DAILY_FRAME_ERROR';
      const errMsg = e?.errorMsg || JSON.stringify(e);
      console.error('[DAILY_ERROR] call frame error:', e);
      console.log('[DAILY] JOIN_SUCCESS = false');
      console.log(`[DAILY] ERROR_CODE = ${errCode}`);
      console.log(`[DAILY] ERROR_MESSAGE = ${errMsg}`);
      if (this.onError) this.onError(errMsg);
    });

    frame.on('nonfatal-error', (e: any) => {
      console.warn('[DAILY_WARN] Non-fatal frame error:', e);
    });

    try {
      await frame.join({
        url: roomUrl,
        userName: userName,
        videoSource: callType === 'video',
        audioSource: true,
        token: token,
      });
      return frame;
    } catch (joinErr: any) {
      console.log('[DAILY] JOIN_SUCCESS = false');
      console.log(`[DAILY] ERROR_CODE = ${joinErr?.code || joinErr?.name || 'JOIN_EXCEPTION'}`);
      console.log(`[DAILY] ERROR_MESSAGE = ${joinErr?.message || 'Failed to join Daily room'}`);
      throw joinErr;
    }
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
      this.currentRoomName = null;
    }
  }

  getCallFrame(): DailyCall | null {
    return this.callFrame;
  }
}

export const dailyService = new DailyService();

