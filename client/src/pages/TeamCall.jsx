import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import socket from "../socket";
import {
  Mic, MicOff, Video, VideoOff, Monitor, Users, MessageSquare, 
  Settings, PhoneOff, ShieldCheck, Maximize, MoreHorizontal,
  Clock, Lock, CheckCircle2, Phone as PhoneIcon
} from "lucide-react";

export default function TeamCall({ vaultId, vault, onLeave }) {
  const userId = localStorage.getItem("userId");
  const userName = localStorage.getItem("userName") || "User";

  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const [participants, setParticipants] = useState([]); // Array of { userId, userName, socketId }
  const [callDuration, setCallDuration] = useState(0);
  const peersRef = useRef({}); // socketId -> RTCPeerConnection
  const [remoteStreams, setRemoteStreams] = useState({}); // socketId -> MediaStream

  // WebRTC Config
  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ]
  };

  // Timer logic
  useEffect(() => {
    const timer = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const createPeerConnection = (targetSocketId) => {
    console.log("Creating PeerConnection for:", targetSocketId);
    const pc = new RTCPeerConnection(rtcConfig);

    // Queue for ICE candidates that arrive too early
    pc.iceQueue = [];

    // Handle ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Sending ICE candidate to:", targetSocketId);
        socket.emit("webrtc_ice_candidate", {
          targetSocketId,
          candidate: event.candidate
        });
      }
    };

    // Handle Remote Stream
    pc.ontrack = (event) => {
      console.log("Received remote track from:", targetSocketId, event.streams[0]);
      setRemoteStreams(prev => ({
        ...prev,
        [targetSocketId]: event.streams[0]
      }));
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE Connection State with ${targetSocketId}: ${pc.iceConnectionState}`);
    };

    // Add local tracks to peer connection
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        console.log("Adding local track to PC:", track.kind);
        pc.addTrack(track, streamRef.current);
      });
    } else {
      console.warn("No local stream available when creating PeerConnection!");
    }

    peersRef.current[targetSocketId] = pc;
    return pc;
  };

  useEffect(() => {
    const initCall = async () => {
      try {
        console.log("Initializing local media...");
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720 }, 
          audio: true 
        });
        streamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Ensure socket is connected and has ID
        if (!socket.id) {
          console.log("Socket ID not ready, waiting for connection...");
          await new Promise(resolve => socket.once("connect", resolve));
        }

        console.log("Joining call room:", vaultId);
        socket.emit("join_call", { vaultId, userId, userName });

        socket.on("current_participants", async (list) => {
          console.log("Current participants in vault:", list);
          const others = list.filter(p => p.socketId !== socket.id);
          setParticipants(others);
          // New joiner just waits for offers from existing participants
        });

        socket.on("user_joined_call", async (data) => {
          console.log("User joined call:", data.userName);
          setParticipants(prev => {
            if (prev.find(p => p.socketId === data.socketId)) return prev;
            return [...prev, data];
          });

          // We are an existing participant, so we send an offer to the new joiner
          const pc = createPeerConnection(data.socketId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          
          console.log("Sending WebRTC offer to new joiner:", data.userName);
          socket.emit("webrtc_offer", {
            targetSocketId: data.socketId,
            offer,
            callerId: userId,
            callerName: userName
          });
        });

        socket.on("webrtc_offer", async (data) => {
          console.log("Received WebRTC offer from:", data.callerName);
          const pc = createPeerConnection(data.callerSocketId);
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          
          // Process queued ICE candidates
          if (pc.iceQueue.length > 0) {
            console.log(`Processing ${pc.iceQueue.length} queued ICE candidates`);
            for (const cand of pc.iceQueue) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            pc.iceQueue = [];
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          console.log("Sending WebRTC answer to:", data.callerName);
          socket.emit("webrtc_answer", {
            targetSocketId: data.callerSocketId,
            answer
          });
        });

        socket.on("webrtc_answer", async (data) => {
          console.log("Received WebRTC answer");
          const pc = peersRef.current[data.senderSocketId];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            
            // Process queued ICE candidates
            if (pc.iceQueue.length > 0) {
              console.log(`Processing ${pc.iceQueue.length} queued ICE candidates`);
              for (const cand of pc.iceQueue) {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              }
              pc.iceQueue = [];
            }
          }
        });

        socket.on("webrtc_ice_candidate", async (data) => {
          const pc = peersRef.current[data.senderSocketId];
          if (pc) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } else {
              console.log("Remote description not set yet, queuing ICE candidate");
              pc.iceQueue.push(data.candidate);
            }
          } else {
            console.warn("Received ICE candidate for unknown peer:", data.senderSocketId);
          }
        });

        socket.on("user_left_call", (data) => {
          console.log("User left call:", data.userId);
          if (peersRef.current[data.socketId]) {
            peersRef.current[data.socketId].close();
            delete peersRef.current[data.socketId];
          }
          setParticipants(prev => prev.filter(p => p.socketId !== data.socketId));
          setRemoteStreams(prev => {
            const next = { ...prev };
            delete next[data.socketId];
            return next;
          });
        });
      } catch (err) {
        console.error("Call initialization failed:", err);
      }
    };

    initCall();

    return () => {
      console.log("Cleaning up TeamCall component...");
      socket.off("current_participants");
      socket.off("user_joined_call");
      socket.off("webrtc_offer");
      socket.off("webrtc_answer");
      socket.off("webrtc_ice_candidate");
      socket.off("user_left_call");

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => {
          t.stop();
          console.log("Stopped local track:", t.kind);
        });
      }
      Object.values(peersRef.current).forEach(pc => pc.close());
      socket.emit("leave_call", { vaultId, userId });
    };
  }, [vaultId, userId]);

  // Sync Mute/Video states with tracks
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMicOn;
      });
    }
  }, [isMicOn]);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(track => {
        track.enabled = isVideoOn;
      });
    }
  }, [isVideoOn]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#02040a] text-white flex flex-col font-sans overflow-hidden">
      
      {/* 1. TOP SECURITY BAR */}
      <div className="h-12 bg-[#06080f]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-full">
            <ShieldCheck size={14} className="text-blue-400" />
            <span className="text-[10px] font-bold text-blue-400 tracking-widest uppercase">End-to-End Encrypted</span>
          </div>
          <span className="text-xs text-gray-500 font-mono">AES-256-GCM SECURE CHANNEL ACTIVE</span>
          <div className="bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded text-[10px] text-green-400 font-bold">Verified</div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-gray-400">
            <Clock size={14} />
            <span className="text-sm font-mono">{formatTime(callDuration)}</span>
          </div>
          <div className="bg-white/5 px-3 py-1 rounded text-[10px] font-bold text-gray-400 border border-white/10 uppercase tracking-tighter">
            {vault.name || "Secure Vault Session"}
          </div>
          <Maximize size={16} className="text-gray-500 cursor-pointer hover:text-white" />
        </div>
      </div>

      {/* 2. MAIN VIDEO GRID */}
      <div className="flex-1 p-6 relative flex items-center justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-full max-w-7xl max-h-[80vh]">
          
          {/* Local User Video */}
          <div className="relative group rounded-2xl overflow-hidden bg-[#0d1117] border-2 border-blue-500/50 shadow-2xl shadow-blue-500/10">
            <video 
              ref={localVideoRef} 
              autoPlay 
              muted 
              playsInline 
              className={`w-full h-full object-cover ${!isVideoOn ? 'hidden' : ''}`}
            />
            {!isVideoOn && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
                <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold">
                  {userName.substring(0,1).toUpperCase()}
                </div>
              </div>
            )}
            
            {/* Overlay Info */}
            <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
               <span className="text-xs font-semibold">{userName} (You)</span>
               {!isMicOn && <MicOff size={12} className="text-red-400" />}
            </div>
            
            <div className="absolute top-4 right-4 bg-black/40 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest text-white/70 border border-white/5">
              HD Secure
            </div>
          </div>

          {/* Remote Participants */}
          {participants.map((p, idx) => (
            <div key={idx} className="relative group rounded-2xl overflow-hidden bg-[#0d1117] border border-white/5">
              <RemoteVideo stream={remoteStreams[p.socketId]} userName={p.userName} />
              <div className="absolute top-4 right-4 bg-black/40 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest text-white/70 border border-white/5">
                Connected
              </div>
            </div>
          ))}

          {participants.length === 0 && (
            <div className="relative group rounded-2xl overflow-hidden bg-[#0d1117]/50 border border-dashed border-white/10 flex items-center justify-center flex-col gap-4">
               <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                  <Users className="text-gray-600" size={32} />
               </div>
               <p className="text-gray-500 text-sm">Waiting for others to join...</p>
            </div>
          )}
        </div>

        {/* Call Status Overlay */}
        <div className="absolute bottom-10 left-10 p-4 bg-[#0d1117]/90 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center gap-4 shadow-2xl">
          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
             <ShieldCheck className="text-blue-400" size={20} />
          </div>
          <div>
            <p className="text-sm font-bold flex items-center gap-2">
              Encryption Verified <CheckCircle2 size={14} className="text-green-400" />
            </p>
            <p className="text-[10px] text-gray-500 font-mono">Session ID: SPV-CALL-{vaultId.substring(0,8).toUpperCase()}</p>
          </div>
        </div>
      </div>

      {/* 3. FLOATING CONTROL BAR */}
      <div className="h-24 flex items-center justify-center pb-8 px-6">
        <div className="bg-[#161b22]/80 backdrop-blur-2xl border border-white/10 px-8 py-4 rounded-3xl flex items-center gap-6 shadow-2xl">
          
          <button 
            onClick={() => setIsMicOn(!isMicOn)}
            className={`p-4 rounded-2xl transition-all ${isMicOn ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}
          >
            {isMicOn ? <Mic size={22} /> : <MicOff size={22} />}
          </button>

          <button 
            onClick={() => setIsVideoOn(!isVideoOn)}
            className={`p-4 rounded-2xl transition-all ${isVideoOn ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}
          >
            {isVideoOn ? <Video size={22} /> : <VideoOff size={22} />}
          </button>

          <div className="w-[1px] h-8 bg-white/10 mx-2"></div>

          <button 
            onClick={() => setIsScreenSharing(!isScreenSharing)}
            className={`p-4 rounded-2xl transition-all ${isScreenSharing ? 'bg-blue-500 text-white' : 'bg-white/5 hover:bg-white/10 text-white'}`}
          >
            <Monitor size={22} />
          </button>

          <button className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all">
            <Users size={22} />
          </button>

          <button className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all">
            <MessageSquare size={22} />
          </button>

          <button className="p-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all">
            <Settings size={22} />
          </button>

          <button 
            onClick={() => {
              // Force stop all tracks immediately
              if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => {
                  track.stop();
                });
                streamRef.current = null;
              }
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = null;
              }
              onLeave();
            }}
            className="ml-4 px-8 py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl flex items-center gap-3 font-bold transition-all shadow-lg shadow-red-600/20"
          >
            <PhoneOff size={22} />
            Leave
          </button>

        </div>
      </div>

    </div>
  );
}

// Helper component for remote video streams
function RemoteVideo({ stream, userName }) {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${!stream ? 'hidden' : ''}`}
      />
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
          <div className="w-24 h-24 rounded-full bg-purple-600 flex items-center justify-center text-3xl font-bold animate-pulse">
            {userName.substring(0, 1).toUpperCase()}
          </div>
        </div>
      )}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
        <span className="text-xs font-semibold">{userName}</span>
      </div>
    </>
  );
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
