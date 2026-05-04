import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import axios from "axios";
const notificationSound = new Audio("/notification.mp3");

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const socket = io(API_URL);

export default function ChatSection({ vaultId, userId, onNewMessage }) {
    // 🔔 Ask notification permission ONCE
    useEffect(() => {
        Notification.requestPermission();
    }, []);
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");

    useEffect(() => {
        socket.emit("join-vault", vaultId);

        axios.get(`${API_URL}/api/chat/${vaultId}`)
            .then(res => setMessages(res.data));

            socket.on("receive-message", (msg) => {
                setMessages(prev => [...prev, msg]);
              
                if (msg.senderId !== userId) {
              
                  new Notification("New Message", {
                    body: msg.message
                  });
              
                  notificationSound.play().catch(() => {});
              
                  // 🔴 notify parent
                  if (onNewMessage) onNewMessage(msg);
                }
              });

        return () => socket.off("receive-message");
    }, [vaultId]);

    const sendMessage = async () => {
        if (!text.trim()) return;

        const msg = {
            vaultId,
            senderId: userId,
            message: text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        await axios.post(API_URL + "/api/chat", msg);
        socket.emit("send-message", msg);

        setText("");
    };

    return (
        <div className="flex-1 flex flex-col bg-[#02030a]">

            {/* 🔥 TOP HEADER (LIKE IMAGE) */}
            <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
                <div>
                    <h2 className="font-semibold text-lg"># development-core</h2>
                    <p className="text-xs text-gray-400">
                        {messages.length} messages
                    </p>
                </div>
            </div>

            {/* 🔥 CHAT BODY */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

                {messages.map((m, i) => (
                    <div key={i} className="flex flex-col">

                        {/* USER NAME */}
                        <div className="text-xs text-gray-400 mb-1">
                            {m.senderId === userId ? "You" : "Member"} • {m.time}
                        </div>

                        {/* MESSAGE BUBBLE */}
                        <div
                            className={`max-w-[55%] px-4 py-3 rounded-xl text-sm ${m.senderId === userId
                                ? "bg-purple-600 ml-auto"
                                : "bg-[#0b0f1a]"
                                }`}
                        >
                            {m.message}
                        </div>
                        
                    </div>
                ))}

            </div>

            {/* 🔥 INPUT BAR (MATCH IMAGE STYLE) */}
            <div className="p-4 border-t border-white/10">
                <div className="flex items-center bg-[#0b0f1a] rounded-xl px-3 py-2 border border-white/10">

                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder="Message #development-core..."
                        className="flex-1 bg-transparent outline-none text-sm"
                    />

                    <button
                        onClick={sendMessage}
                        className="ml-3 px-4 py-1 bg-purple-600 rounded-lg text-sm"
                    >
                        Send
                    </button>
                    
                </div>
            </div>

        </div>
    );
}