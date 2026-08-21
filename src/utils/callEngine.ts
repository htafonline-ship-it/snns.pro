import { RTC_CONFIG, getMediaStream } from './webrtc';
import { zegoService } from './zegoService';

export type SignalSender = (data: Record<string, unknown>) => void;

export class CallEngine {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private targetUid: string | null = null;
  private sendSignal: SignalSender | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private isCaller = false;
  private isZegoActive = false;

  public onRemoteStream?: (stream: MediaStream) => void;
  public onLocalStream?: (stream: MediaStream) => void;
  public onError?: (err: Error) => void;

  /**
   * Initialize and acquire local media
   */
  async startLocalMedia(
    callType: 'video' | 'audio',
    facingMode: 'user' | 'environment' = 'user',
    displayName = 'مستخدم'
  ): Promise<MediaStream> {
    try {
      this.localStream = await getMediaStream(callType, facingMode, displayName);
      if (this.onLocalStream && this.localStream) {
        this.onLocalStream(this.localStream);
      }
      return this.localStream;
    } catch (err: any) {
      console.warn('[CallEngine] getMediaStream fallback error:', err);
      // Generate synthetic fallback
      this.localStream = await getMediaStream('audio', facingMode, displayName);
      return this.localStream;
    }
  }

  /**
   * Setup WebRTC PeerConnection
   */
  private createPeerConnection(targetUid: string, sendSignal: SignalSender): RTCPeerConnection {
    if (this.peerConnection) {
      this.closePeerConnection();
    }

    this.targetUid = targetUid;
    this.sendSignal = sendSignal;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.peerConnection = pc;

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.sendSignal && this.targetUid) {
        this.sendSignal({
          type: 'webrtc-ice-candidate',
          target_id: this.targetUid,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('[CallEngine] Remote track received:', event.track.kind);
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
      } else {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);
      }

      if (this.onRemoteStream && this.remoteStream) {
        this.onRemoteStream(this.remoteStream);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[CallEngine] ICE connection state:', pc.iceConnectionState);
    };

    return pc;
  }

  /**
   * Caller: Initiate WebRTC connection by creating an Offer
   */
  async startCallerPeer(
    targetUid: string,
    sendSignal: SignalSender,
    roomId: string,
    currentUid: string,
    currentName: string,
    callType: 'video' | 'audio'
  ) {
    this.isCaller = true;
    const pc = this.createPeerConnection(targetUid, sendSignal);

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      });
      await pc.setLocalDescription(offer);

      sendSignal({
        type: 'webrtc-offer',
        target_id: targetUid,
        sdp: offer,
        roomId,
      });
    } catch (err: any) {
      console.error('[CallEngine] Failed to create WebRTC offer:', err);
    }
  }

  /**
   * Callee: Handle WebRTC Offer and return Answer
   */
  async handleOffer(
    sdp: RTCSessionDescriptionInit,
    targetUid: string,
    sendSignal: SignalSender,
    roomId: string,
    currentUid: string,
    currentName: string,
    callType: 'video' | 'audio'
  ) {
    this.isCaller = false;
    const pc = this.createPeerConnection(targetUid, sendSignal);

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Flush queued candidates
      while (this.pendingCandidates.length > 0) {
        const cand = this.pendingCandidates.shift();
        if (cand) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal({
        type: 'webrtc-answer',
        target_id: targetUid,
        sdp: answer,
        roomId,
      });
    } catch (err: any) {
      console.error('[CallEngine] Failed to handle WebRTC offer:', err);
    }
  }

  /**
   * Caller: Handle WebRTC Answer from Callee
   */
  async handleAnswer(sdp: RTCSessionDescriptionInit) {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));

      // Flush queued candidates
      while (this.pendingCandidates.length > 0) {
        const cand = this.pendingCandidates.shift();
        if (cand) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        }
      }
    } catch (err: any) {
      console.error('[CallEngine] Failed to set remote description answer:', err);
    }
  }

  /**
   * Handle incoming ICE candidate
   */
  async handleIceCandidate(candidate: RTCIceCandidateInit) {
    if (this.peerConnection && this.peerConnection.remoteDescription) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('[CallEngine] Error adding ICE candidate:', err);
      }
    } else {
      this.pendingCandidates.push(candidate);
    }
  }

  /**
   * Toggle Audio Mute
   */
  toggleAudio(): boolean {
    if (this.isZegoActive) {
      zegoService.toggleAudio();
    }
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const isEnabled = audioTracks[0].enabled;
        audioTracks.forEach((t) => (t.enabled = !isEnabled));
        return !isEnabled;
      }
    }
    return false;
  }

  /**
   * Toggle Video Mute
   */
  toggleVideo(): boolean {
    if (this.isZegoActive) {
      zegoService.toggleVideo();
    }
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const isEnabled = videoTracks[0].enabled;
        videoTracks.forEach((t) => (t.enabled = !isEnabled));
        return !isEnabled;
      }
    }
    return false;
  }

  /**
   * Switch Camera
   */
  async switchCamera(facingMode: 'user' | 'environment', displayName = 'مستخدم'): Promise<MediaStream | null> {
    try {
      const newStream = await getMediaStream('video', facingMode, displayName);
      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop());
      }
      this.localStream = newStream;

      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders();
        const newVideoTrack = newStream.getVideoTracks()[0];
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender && newVideoTrack) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }

      if (this.onLocalStream) {
        this.onLocalStream(newStream);
      }
      return newStream;
    } catch (e) {
      console.warn('[CallEngine] Failed to switch camera:', e);
      return this.localStream;
    }
  }

  /**
   * Close and Clean Up Call
   */
  closePeerConnection() {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch (e) {}
      this.peerConnection = null;
    }

    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      this.localStream = null;
    }

    if (this.isZegoActive) {
      zegoService.leaveRoom().catch(() => {});
      this.isZegoActive = false;
    }

    this.remoteStream = null;
    this.pendingCandidates = [];
    this.targetUid = null;
    this.sendSignal = null;
  }
}

export const callEngine = new CallEngine();
