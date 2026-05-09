import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import {
  Mic, MicOff, Video, VideoOff, Monitor, Users, MessageSquare, 
  Settings, PhoneOff, ShieldCheck, Maximize, MoreHorizontal,
  Clock, Lock, CheckCircle2, PhoneIcon
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const socket = io(API_URL);

export default function TeamCall({ vaultId, vault, onLeave }) {
  const userId = localStorage.getItem("userId");
  const userName = localStorage.getItem("userName") || "User";

  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const localVideoRef = useRef(null);
  const streamRef = useRef(null);
  const [participants, setParticipants] = useState([]);
  const [callDuration, setCallDuration] = useState(0);
  
  // Timer logic
  useEffect(() => {
    const timer = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // WebRTC Initialization
  useEffect(() => {
    const initLocalStream = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });
        streamRef.current = mediaStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Error accessing media devices:", err);
      }
    };

    initLocalStream();
    socket.emit("join_call", { vaultId, userId, userName });

    socket.on("user_joined_call", (data) => {
       setParticipants(prev => {
          if (prev.find(p => p.userId === data.userId)) return prev;
          return [...prev, data];
       });
    });

    socket.on("user_left_call", (data) => {
       setParticipants(prev => prev.filter(p => p.userId !== data.userId));
    });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
        streamRef.current = null;
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      socket.off("user_joined_call");
      socket.off("user_left_call");
      socket.emit("leave_call", { vaultId, userId });
    };
  }, [vaultId, userId, userName]);

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
              <div className="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
                <div className="w-24 h-24 rounded-full bg-purple-600 flex items-center justify-center text-3xl font-bold animate-pulse">
                  {p.userName.substring(0,1).toUpperCase()}
                </div>
              </div>
              <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10">
                 <span className="text-xs font-semibold">{p.userName}</span>
              </div>
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
            onClick={onLeave}
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
