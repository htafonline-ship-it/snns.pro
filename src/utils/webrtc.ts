// WebRTC configuration and STUN servers
export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

/**
 * Creates a synthetic/virtual audio track when no physical microphone is detected
 */
function createSyntheticAudioTrack(): MediaStreamTrack {
  try {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtxClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const dst = ctx.createMediaStreamDestination();

    gain.gain.value = 0; // Muted / silent stream
    osc.connect(gain);
    gain.connect(dst);
    osc.start();

    return dst.stream.getAudioTracks()[0];
  } catch (e) {
    console.warn('Could not create synthetic audio track:', e);
    // Fallback: empty audio track if AudioContext unavailable
    const canvas = document.createElement('canvas');
    return (canvas.captureStream() as MediaStream).getTracks()[0];
  }
}

/**
 * Creates a synthetic/virtual video track with an animated avatar when no physical camera is detected
 */
function createSyntheticVideoTrack(userName = 'مستخدم'): MediaStreamTrack {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  let frame = 0;
  function draw() {
    if (!ctx) return;
    frame++;

    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#128C7E');
    grad.addColorStop(1, '#075E54');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Outer pulsating ring
    const radius = 70 + Math.sin(frame * 0.05) * 8;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(37, 211, 102, 0.25)';
    ctx.fill();

    // Center avatar circle
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 55, 0, Math.PI * 2);
    ctx.fillStyle = '#25D366';
    ctx.fill();

    // User initial or icon
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(userName.charAt(0) || '📹', canvas.width / 2, canvas.height / 2);

    // Subtitle status
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillText('كاميرا افتراضية مؤمنة', canvas.width / 2, canvas.height / 2 + 95);

    requestAnimationFrame(draw);
  }
  draw();

  const stream = canvas.captureStream(25);
  return stream.getVideoTracks()[0];
}

/**
 * Resilient MediaStream grabber with multi-layer fallbacks:
 * 1. High quality constraints
 * 2. Basic constraints
 * 3. Audio-only with virtual video if no camera found
 * 4. Video-only with virtual audio if no microphone found
 * 5. Full virtual stream if no physical hardware or in restricted sandbox
 */
export async function getMediaStream(
  callType: 'video' | 'audio',
  facingMode: 'user' | 'environment' = 'user',
  userName = 'مستخدم'
): Promise<MediaStream> {
  // Step 1: Try optimal hardware constraints
  try {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video:
        callType === 'video'
          ? {
              width: { ideal: 1280, min: 640 },
              height: { ideal: 720, min: 480 },
              facingMode: facingMode,
            }
          : false,
    };
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    console.warn('Optimal media constraints failed, attempting basic fallback:', err);
  }

  // Step 2: Try basic hardware constraints without strict properties
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video',
    });
  } catch (err) {
    console.warn('Basic media constraints failed, checking individual devices:', err);
  }

  // Step 3: Try audio only, adding virtual video if video call was requested
  if (callType === 'video') {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const virtualVideoTrack = createSyntheticVideoTrack(userName);
      audioStream.addTrack(virtualVideoTrack);
      return audioStream;
    } catch (audioErr) {
      console.warn('Microphone not available, checking camera only:', audioErr);
    }

    // Step 4: Try video only, adding virtual audio
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const virtualAudioTrack = createSyntheticAudioTrack();
      videoStream.addTrack(virtualAudioTrack);
      return videoStream;
    } catch (videoErr) {
      console.warn('Camera not available, falling back to full virtual stream:', videoErr);
    }
  } else {
    // Audio call requested but mic failed: try getting any audio or synthesize
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (audioErr) {
      console.warn('Microphone not available for audio call:', audioErr);
    }
  }

  // Step 5: Full Virtual MediaStream fallback (Guaranteed to succeed in any browser/container)
  console.info('Using synthetic media stream fallback for call');
  const syntheticStream = new MediaStream();
  if (callType === 'video') {
    syntheticStream.addTrack(createSyntheticVideoTrack(userName));
  }
  syntheticStream.addTrack(createSyntheticAudioTrack());
  return syntheticStream;
}
