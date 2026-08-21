import express from 'express';
import http from 'http';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

// ZEGOCLOUD Server Configuration
// ZEGO_SERVER_SECRET is strictly guarded on backend and NEVER exposed to frontend
const ZEGO_APP_ID = Number(process.env.ZEGO_APP_ID) || 366567418;
const ZEGO_SERVER_SECRET = process.env.ZEGO_SERVER_SECRET || '0123456789abcdef0123456789abcdef';
const DAILY_API_KEY = process.env.DAILY_API_KEY || '';

console.log(`ACTIVE_ZEGO_APP_ID = ${ZEGO_APP_ID}`);
console.log(`DAILY_API_KEY_PRESENT = ${Boolean(DAILY_API_KEY)}`);

export enum ZegoErrorCode {
  success = 0,
  appIDInvalid = 1,
  userIDInvalid = 3,
  secretInvalid = 5,
  effectiveTimeInSecondsInvalid = 6,
}

export interface ZegoToken04Payload {
  app_id: number;
  user_id: string;
  nonce: number;
  ctime: number;
  expire: number;
  payload: string;
}

/**
 * Official ZEGOCLOUD Token04 Generation Function
 * Encrypts token parameters according to official ZEGOCLOUD specifications
 * Signature: generateToken04(appID, userID, secret, effectiveTimeInSeconds, payload)
 */
export function generateToken04(
  appId: number,
  userId: string,
  secret: string,
  effectiveTimeInSeconds: number,
  payload: string = ''
): string {
  if (!appId || typeof appId !== 'number') {
    throw new Error(`ZEGO appID invalid (code: ${ZegoErrorCode.appIDInvalid})`);
  }
  if (!userId || typeof userId !== 'string') {
    throw new Error(`ZEGO userID invalid (code: ${ZegoErrorCode.userIDInvalid})`);
  }
  if (!secret || typeof secret !== 'string' || secret.length !== 32) {
    throw new Error(`ZEGO secret must be 32 characters string (code: ${ZegoErrorCode.secretInvalid})`);
  }
  if (!effectiveTimeInSeconds || typeof effectiveTimeInSeconds !== 'number') {
    throw new Error(`ZEGO effectiveTimeInSeconds invalid (code: ${ZegoErrorCode.effectiveTimeInSecondsInvalid})`);
  }

  const createTime = Math.floor(Date.now() / 1000);
  const expireTime = createTime + effectiveTimeInSeconds;
  const nonce = Math.floor(Math.random() * 2147483647);

  const plainText: ZegoToken04Payload = {
    app_id: appId,
    user_id: userId, // Real Firebase UID
    nonce: nonce,
    ctime: createTime,
    expire: expireTime,
    payload: payload || '',
  };

  const plainTextStr = JSON.stringify(plainText);
  const iv = crypto.randomBytes(16);

  // Official ZEGOCLOUD 32-character secret encryption with aes-256-cbc
  const key = Buffer.from(secret, 'utf8');
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(true);
  const encrypted = Buffer.concat([cipher.update(plainTextStr, 'utf8'), cipher.final()]);

  // Pack buffer format: [expireTime (8B), ivLength (2B), iv (16B), cipherLength (2B), ciphertext]
  const b1 = Buffer.alloc(8);
  b1.writeBigInt64BE(BigInt(expireTime), 0);

  const b2 = Buffer.alloc(2);
  b2.writeUInt16BE(iv.length, 0);

  const b3 = Buffer.alloc(2);
  b3.writeUInt16BE(encrypted.length, 0);

  const packed = Buffer.concat([b1, b2, iv, b3, encrypted]);
  return '04' + packed.toString('base64');
}

// Map of active connected Firebase UIDs to their WebSocket instances: firebase_uid -> WebSocket
const activeSockets = new Map<string, WebSocket>();

// Reverse lookup: socket -> firebase_uid
const socketToUid = new WeakMap<WebSocket, string>();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  /**
   * ZEGOCLOUD Secure Token Generation Endpoint
   * The client sends their verified Firebase UID
   * Backend generates Token04 using official generateToken04 without exposing ServerSecret
   */
  app.post('/api/zego/token', (req, res) => {
    try {
      const { userId, roomId } = req.body;
      if (!userId || typeof userId !== 'string') {
        return res.status(400).json({ error: 'معرّف المستخدم (Firebase UID) مطلوب' });
      }

      const cleanUserId = userId.trim();
      const appIdPresent = Boolean(ZEGO_APP_ID);
      const secretPresent = Boolean(ZEGO_SERVER_SECRET);
      const secretLength = ZEGO_SERVER_SECRET ? ZEGO_SERVER_SECRET.length : 0;

      // Verification logging as requested
      console.log(`ZEGO_APP_ID_PRESENT = ${appIdPresent}`);
      console.log(`ZEGO_SECRET_PRESENT = ${secretPresent}`);
      console.log(`ZEGO_SECRET_LENGTH = ${secretLength}`);
      console.log(`ZEGO_USER_ID = ${cleanUserId}`);

      const token = generateToken04(
        ZEGO_APP_ID,
        cleanUserId,
        ZEGO_SERVER_SECRET,
        3600,
        ''
      );

      const tokenGenerated = Boolean(token && token.startsWith('04'));
      console.log(`TOKEN_GENERATED = ${tokenGenerated}`);

      return res.json({
        token,
        appId: ZEGO_APP_ID,
        userId: cleanUserId,
        serverUrl: `wss://webliveroom${ZEGO_APP_ID}-api.coolzcloud.com/ws`,
        verification: {
          ZEGO_APP_ID_PRESENT: appIdPresent,
          ZEGO_SECRET_PRESENT: secretPresent,
          ZEGO_SECRET_LENGTH: secretLength,
          ZEGO_USER_ID: cleanUserId,
          TOKEN_GENERATED: tokenGenerated,
        },
      });
    } catch (err: any) {
      console.error('Failed to generate Zego token:', err);
      console.log(`TOKEN_GENERATED = false`);
      return res.status(500).json({
        error: err.message || 'خطأ في توليد رمز اتصال ZEGOCLOUD',
        debug: {
          file: 'server.ts',
          line: 63,
          function: 'generateToken04',
          secretLength: ZEGO_SERVER_SECRET ? ZEGO_SERVER_SECRET.length : 0,
        },
      });
    }
  });

  /**
   * ZEGOCLOUD Config (App ID and Server URL only, NEVER the secret)
   */
  app.get('/api/zego/config', (req, res) => {
    res.json({
      appId: ZEGO_APP_ID,
      serverUrl: `wss://webliveroom${ZEGO_APP_ID}-api.coolzcloud.com/ws`,
    });
  });

  /**
   * Daily.co Room Creation Endpoint
   * Automatically creates a single Daily Room for Audio/Video calls using DAILY_API_KEY
   */
  app.post('/api/daily/room', async (req, res) => {
    const apiKey = (process.env.DAILY_API_KEY || '').trim();
    const isKeyPresent = Boolean(apiKey);
    const keyLength = apiKey.length;

    console.log(`DAILY_API_KEY_PRESENT = ${isKeyPresent}`);
    console.log(`DAILY_API_KEY_LENGTH = ${keyLength}`);
    console.log(`DAILY_CREATE_ROOM_REQUEST = true`);

    if (!isKeyPresent) {
      console.log('DAILY_ROOM_CREATED = false');
      console.log('DAILY_RESPONSE_ERROR = DAILY_API_KEY is missing from environment variables');
      return res.status(400).json({
        DAILY_API_KEY_PRESENT: false,
        DAILY_ROOM_CREATED: false,
        error: 'مفتاح DAILY_API_KEY غير متوفر في متغيرات بيئة الخادم. يرجى إضافته في إعدادات المنصة (Settings).',
        missingKey: 'DAILY_API_KEY',
      });
    }

    try {
      const { callType, callerUid, calleeUid, roomId } = req.body;

      // Generate a clean room name
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const rawName = roomId ? `${roomId}_${randomSuffix}` : `snns_${Date.now()}_${randomSuffix}`;
      const roomName = rawName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 60);

      const isAudioOnly = callType === 'audio';

      const dailyRes = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          name: roomName,
          privacy: 'public',
          properties: {
            exp: Math.floor(Date.now() / 1000) + 7200, // 2 hours
            enable_chat: true,
            enable_screenshare: true,
            enable_knocking: false,
            start_video_off: isAudioOnly,
            start_audio_off: false,
          },
        }),
      });

      console.log(`DAILY_HTTP_STATUS = ${dailyRes.status}`);

      const data: any = await dailyRes.json();

      if (!dailyRes.ok) {
        const errorMsg = data.error || data.info || JSON.stringify(data);
        console.log(`DAILY_RESPONSE_ERROR = ${errorMsg}`);
        console.log(`DAILY_ROOM_CREATED = false`);

        return res.status(dailyRes.status).json({
          DAILY_API_KEY_PRESENT: true,
          DAILY_HTTP_STATUS: dailyRes.status,
          DAILY_RESPONSE_ERROR: errorMsg,
          DAILY_ROOM_CREATED: false,
          error: `خطأ Daily [${dailyRes.status}]: ${errorMsg}`,
          details: data,
        });
      }

      console.log(`DAILY_ROOM_CREATED = true`);
      console.log(`roomName = ${data.name}`);
      console.log(`roomUrl = ${data.url}`);

      return res.json({
        DAILY_API_KEY_PRESENT: true,
        DAILY_HTTP_STATUS: 200,
        DAILY_ROOM_CREATED: true,
        roomName: data.name,
        roomUrl: data.url,
        url: data.url,
        name: data.name,
        roomId: data.name,
      });
    } catch (err: any) {
      console.log(`DAILY_RESPONSE_ERROR = ${err.message}`);
      console.log(`DAILY_ROOM_CREATED = false`);
      return res.status(500).json({
        DAILY_API_KEY_PRESENT: true,
        DAILY_ROOM_CREATED: false,
        error: `خطأ اتصال الخادم بـ Daily API: ${err.message}`,
      });
    }
  });

  /**
   * Daily.co status/config endpoint
   */
  app.get('/api/daily/config', (req, res) => {
    const apiKey = (process.env.DAILY_API_KEY || '').trim();
    res.json({
      configured: Boolean(apiKey),
    });
  });

  // Admin server metrics
  app.get('/api/admin/metrics', (req, res) => {
    const adminPhone = req.query.phone as string;
    const adminUid = req.query.uid as string;
    if (adminPhone !== '1007363904' && !adminUid) {
      return res.status(403).json({ error: 'غير مصرح بالوصول إلى لوحة الإدارة' });
    }

    res.json({
      onlineUsersCount: activeSockets.size,
      onlineUids: Array.from(activeSockets.keys()),
      serverUptimeSeconds: Math.floor(process.uptime()),
    });
  });

  const server = http.createServer(app);

  // WebSocket Server for Instant Call Signaling & Presence
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  function broadcastOnlinePresence() {
    const onlineUids = Array.from(activeSockets.keys());
    const payload = JSON.stringify({
      type: 'online-presence-update',
      onlineUids,
    });

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wss.on('connection', (ws: WebSocket) => {
    let boundUid: string | null = null;

    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.type) {
          // Register session by Firebase Auth UID
          case 'register-session': {
            const uid = (data.uid || data.userId || '').trim();
            if (uid) {
              boundUid = uid;
              activeSockets.set(uid, ws);
              socketToUid.set(ws, uid);
              broadcastOnlinePresence();
            }
            break;
          }

          // Call Invitation: caller_id (Firebase UID) calls callee_id (Firebase UID)
          case 'call-invitation':
          case 'call-offer': {
            const callerUid = (data.caller_id || data.from || '').trim();
            const calleeUid = (data.callee_id || data.to || '').trim();

            if (!callerUid || !calleeUid) break;

            const targetSocket = activeSockets.get(calleeUid);

            if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
              targetSocket.send(
                JSON.stringify({
                  type: 'incoming-call',
                  callId: data.callId || `call_${Date.now()}`,
                  caller_id: callerUid, // Strictly Firebase Auth UID
                  callee_id: calleeUid, // Strictly Firebase Auth UID
                  caller_name: data.caller_name || '',
                  callType: data.callType || 'video',
                  roomId: data.roomId || [callerUid, calleeUid].sort().join('_'),
                  isStealth: data.isStealth,
                })
              );
            } else {
              // Notify caller that recipient is offline / unavailable
              ws.send(
                JSON.stringify({
                  type: 'call-unavailable',
                  callee_id: calleeUid,
                  reason: 'المستخدم غير متصل حالياً',
                })
              );
            }
            break;
          }

          // Recipient Ringing confirmation
          case 'call-ringing': {
            const callerUid = (data.caller_id || data.to || '').trim();
            const callerSocket = activeSockets.get(callerUid);
            if (callerSocket && callerSocket.readyState === WebSocket.OPEN) {
              callerSocket.send(
                JSON.stringify({
                  type: 'call-ringing',
                  callId: data.callId,
                  callee_id: data.callee_id || data.from,
                })
              );
            }
            break;
          }

          // Accept Call Invitation
          case 'call-accept':
          case 'call-answer': {
            const callerUid = (data.caller_id || data.to || '').trim();
            const callerSocket = activeSockets.get(callerUid);
            if (callerSocket && callerSocket.readyState === WebSocket.OPEN) {
              callerSocket.send(
                JSON.stringify({
                  type: 'call-accepted',
                  callId: data.callId,
                  callee_id: data.callee_id || data.from,
                  roomId: data.roomId,
                })
              );
            }
            break;
          }

          // Reject Call Invitation
          case 'call-reject': {
            const callerUid = (data.caller_id || data.to || '').trim();
            const callerSocket = activeSockets.get(callerUid);
            if (callerSocket && callerSocket.readyState === WebSocket.OPEN) {
              callerSocket.send(
                JSON.stringify({
                  type: 'call-rejected',
                  callId: data.callId,
                  callee_id: data.callee_id || data.from,
                  reason: data.reason || 'تم رفض المكالمة',
                })
              );
            }
            break;
          }

          // Cancel Outgoing Call Invitation
          case 'call-cancel': {
            const calleeUid = (data.callee_id || data.to || '').trim();
            const calleeSocket = activeSockets.get(calleeUid);
            if (calleeSocket && calleeSocket.readyState === WebSocket.OPEN) {
              calleeSocket.send(
                JSON.stringify({
                  type: 'call-cancelled',
                  callId: data.callId,
                  caller_id: data.caller_id || data.from,
                })
              );
            }
            break;
          }

          // End Active Call
          case 'call-end': {
            const peerUid = (data.peerUid || data.to || '').trim();
            const peerSocket = activeSockets.get(peerUid);
            if (peerSocket && peerSocket.readyState === WebSocket.OPEN) {
              peerSocket.send(
                JSON.stringify({
                  type: 'call-ended',
                  callId: data.callId,
                  from_uid: data.from_uid || data.from,
                })
              );
            }
            break;
          }

          // In-call chat message
          case 'call-chat': {
            const peerUid = (data.peerUid || data.to || data.to_uid || '').trim();
            const peerSocket = activeSockets.get(peerUid);
            if (peerSocket && peerSocket.readyState === WebSocket.OPEN) {
              peerSocket.send(
                JSON.stringify({
                  type: 'call-chat',
                  senderUid: data.senderUid || data.from_uid || boundUid,
                  senderPhone: data.senderPhone || data.from_phone,
                  senderName: data.senderName || data.from_name,
                  text: data.text,
                  reaction: data.reaction,
                  timestamp: Date.now(),
                })
              );
            }
            break;
          }

          // WebRTC P2P Direct Signaling (Offer, Answer, ICE Candidates)
          case 'webrtc-offer': {
            const targetUid = (data.target_id || data.to || data.callee_id || '').trim();
            const targetSocket = activeSockets.get(targetUid);
            if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
              targetSocket.send(
                JSON.stringify({
                  type: 'webrtc-offer',
                  sdp: data.sdp,
                  from_id: boundUid || data.from_id || data.caller_id,
                  callId: data.callId,
                  roomId: data.roomId,
                })
              );
            }
            break;
          }

          case 'webrtc-answer': {
            const targetUid = (data.target_id || data.to || data.caller_id || '').trim();
            const targetSocket = activeSockets.get(targetUid);
            if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
              targetSocket.send(
                JSON.stringify({
                  type: 'webrtc-answer',
                  sdp: data.sdp,
                  from_id: boundUid || data.from_id || data.callee_id,
                  callId: data.callId,
                  roomId: data.roomId,
                })
              );
            }
            break;
          }

          case 'webrtc-ice-candidate': {
            const targetUid = (data.target_id || data.to || data.peer_id || '').trim();
            const targetSocket = activeSockets.get(targetUid);
            if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
              targetSocket.send(
                JSON.stringify({
                  type: 'webrtc-ice-candidate',
                  candidate: data.candidate,
                  from_id: boundUid || data.from_id,
                  callId: data.callId,
                })
              );
            }
            break;
          }
        }
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    });

    ws.on('close', () => {
      if (boundUid && activeSockets.get(boundUid) === ws) {
        activeSockets.delete(boundUid);
        broadcastOnlinePresence();
      }
    });
  });

  // Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Tawasul Video Calling (Firebase + ZEGOCLOUD) running on port ${PORT}`);
  });
}

startServer();
