import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import forge from "node-forge";
import { io } from "socket.io-client";
import { Hash, Lock, Search, UserPlus, Info, Paperclip, Smile, Send, CheckCheck, Check } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const socket = io(API_URL);

export default function VaultChat({ vaultId, vault, setShowInvite, isActive, onUnreadChange, onNewToast, onOnlineUsersChange, compact = false }) {
  const userId = localStorage.getItem("userId");
  const userName = localStorage.getItem("userName") || "User"; 
  
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [chatKey, setChatKey] = useState(null); 
  const [memberDetailsMap, setMemberDetailsMap] = useState({});
  
  const [typingUsers, setTypingUsers] = useState({});
  const messagesEndRef = useRef(null);
  
  const [unreadCounts, setUnreadCounts] = useState({});

  // UI Toggles
  const [showDetailsPanel, setShowDetailsPanel] = useState(!compact);
  const [activeDetailsTab, setActiveDetailsTab] = useState("DETAILS");
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    const fetchMemberDetails = async () => {
      const map = {};
      if (vault.members) {
        for (let m of vault.members) {
          try {
            const res = await axios.get(`${API_URL}/api/user/${m.userId}`);
            map[m.userId] = { name: res.data.name, role: m.role, profilePicture: res.data.profilePicture || "" };
          } catch(e) {
            map[m.userId] = { name: m.userId.substring(0,6), role: m.role };
          }
        }
      }
      setMemberDetailsMap(map);
    };
    fetchMemberDetails();
  }, [vault.members]);

  useEffect(() => {
    const initChat = async () => {
      try {
        const privateKeyPem = localStorage.getItem("privateKey");
        if (!privateKeyPem) return;
        const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
        
        let res = await axios.post(`${API_URL}/api/vault/${vaultId}/chat/key`, { userId });
        
        let aesKey;
        if (res.data.encryptedChatKey) {
           aesKey = privateKey.decrypt(forge.util.decode64(res.data.encryptedChatKey), "RSA-OAEP");
        } else {
           const isOwner = vault.userId === userId;
           if (isOwner) {
             aesKey = forge.random.getBytesSync(32); 
             const userRes = await axios.get(`${API_URL}/api/user/${userId}`);
             const publicKeyPem = userRes.data.publicKey;
             const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
             const encryptedChatKey = forge.util.encode64(publicKey.encrypt(aesKey, "RSA-OAEP"));
             await axios.post(`${API_URL}/api/vault/${vaultId}/chat/key`, { userId, encryptedChatKey });
           } else {
             console.warn("Member missing chat key - awaiting owner share");
             setChatKey(null);
             return;
           }
        }
        
        setChatKey(aesKey);

        // Simple auto-share for owner
        if (vault.userId === userId && aesKey && vault.members) {
          for (const member of vault.members) {
            if (member.userId === userId) continue;
            try {
              const checkRes = await axios.post(`${API_URL}/api/vault/${vaultId}/chat/key`, { userId: member.userId });
              if (checkRes.data.encryptedChatKey) continue;
              const memberUserRes = await axios.get(`${API_URL}/api/user/${member.userId}`);
              if (!memberUserRes.data.publicKey) continue;
              const memberPubKey = forge.pki.publicKeyFromPem(memberUserRes.data.publicKey);
              const encryptedForMember = forge.util.encode64(memberPubKey.encrypt(aesKey, "RSA-OAEP"));
              await axios.post(`${API_URL}/api/vault/${vaultId}/chat/share`, {
                targetUserId: member.userId,
                encryptedChatKey: encryptedForMember
              });
            } catch (e) {}
          }
        }
      } catch (err) {
        console.error("Chat init error", err);
      }
    };
    initChat();
  }, [vaultId, vault.userId, vault.members]);

  useEffect(() => {
    if (!vaultId || !userId) return;
    
    // Fetch channels
    const fetchChannels = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/vault/${vaultId}/channels`);
        setChannels(res.data);
        if (res.data.length > 0) setActiveChannel(res.data[0]);
      } catch (err) {
        console.error(err);
      }
    };
    
    // Fetch unread counts
    const fetchUnread = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/vault/${vaultId}/unread?userId=${userId}`);
        setUnreadCounts(res.data);
        
        // Notify parent
        const total = Object.values(res.data).reduce((a,b) => a+b, 0);
        if (onUnreadChange) onUnreadChange(total);
      } catch (err) {
        console.error(err);
      }
    };
    
    fetchChannels();
    fetchUnread();
  }, [vaultId, userId]);

  // Handle Online Users
  useEffect(() => {
    if (!userId) return;
    
    const onConnect = () => {
      socket.emit("user_connected", userId);
    };

    if (socket.connected) {
      onConnect();
    }

    socket.on("connect", onConnect);
    socket.emit("get_online_users");
    
    const handleOnlineUsers = (users) => {
      console.log("Online users received:", users);
      if (onOnlineUsersChange) onOnlineUsersChange(users);
    };
    
    socket.on("online_users_update", handleOnlineUsers);
    
    return () => {
      socket.off("connect", onConnect);
      socket.off("online_users_update", handleOnlineUsers);
    };
  }, [userId, onOnlineUsersChange]);

  useEffect(() => {
    if (!activeChannel) return;
    
    socket.emit("join_channel", activeChannel._id);
    
    const fetchMessages = async () => {
      try {
        const res = await axios.get(`${API_URL}/api/channels/${activeChannel._id}/messages`);
        
        const decrypted = await Promise.all(res.data.map(m => decryptMessage(m)));
        setMessages(decrypted);
        
        // Mark as read when opened
        socket.emit("mark_read", { channelId: activeChannel._id, userId });
        
        // Clear unread count for this channel
        setUnreadCounts(prev => {
           const updated = { ...prev, [activeChannel._id]: 0 };
           const total = Object.values(updated).reduce((a,b) => a+b, 0);
           if (onUnreadChange) onUnreadChange(total);
           return updated;
        });
      } catch (err) {
        console.error(err);
      }
    };
    
    fetchMessages();
  }, [activeChannel, chatKey]);

  useEffect(() => {
    const handleNewMessage = (msg) => {
      if (activeChannel && msg.channelId === activeChannel._id) {
        decryptMessage(msg).then(decrypted => {
           setMessages(prev => [...prev, decrypted]);
           if (msg.senderId !== userId && !msg.readBy.includes(userId)) {
             if (isActive) {
               socket.emit("mark_read", { channelId: activeChannel._id, userId });
             } else {
               // We are in chat tab but not viewing it, increment unread globally
               setUnreadCounts(prev => {
                 const updated = { ...prev, [msg.channelId]: (prev[msg.channelId] || 0) + 1 };
                 const total = Object.values(updated).reduce((a,b) => a+b, 0);
                 if (onUnreadChange) onUnreadChange(total);
                 return updated;
               });
               if (onNewToast) {
                 const senderName = memberDetailsMap[msg.senderId]?.name || "Someone";
                 onNewToast({ title: `New message from ${senderName}`, body: decrypted.content });
               }
             }
           }
        });
      } else {
        // Increment unread count for the other channel
        setUnreadCounts(prev => {
          const updated = { ...prev, [msg.channelId]: (prev[msg.channelId] || 0) + 1 };
          const total = Object.values(updated).reduce((a,b) => a+b, 0);
          if (onUnreadChange) onUnreadChange(total);
          return updated;
        });
        if (onNewToast && msg.senderId !== userId) {
          decryptMessage(msg).then(decrypted => {
             const senderName = memberDetailsMap[msg.senderId]?.name || "Someone";
             onNewToast({ title: `New message from ${senderName}`, body: decrypted.content });
          });
        }
      }
    };
    
    socket.on("new_message", handleNewMessage);
    
    socket.on("message_read", (data) => {
      if (data.channelId === activeChannel?._id) {
        setMessages(prev => prev.map(m => {
           if (!m.readBy.includes(data.userId)) {
             return { ...m, readBy: [...m.readBy, data.userId] };
           }
           return m;
        }));
      }
    });

    socket.on("typing", (data) => {
      if (data.userId !== userId) {
        setTypingUsers(prev => ({ ...prev, [data.userId]: data.isTyping }));
      }
    });

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("message_read");
      socket.off("typing");
    };
  }, [activeChannel, chatKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const decryptMessage = async (msg) => {
    if (!chatKey) return { ...msg, content: "[Encrypted Message]" };
    try {
      const iv = forge.util.decode64(msg.iv);
      const tag = forge.util.decode64(msg.tag);
      const encrypted = forge.util.decode64(msg.encryptedContent);
      
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        new Uint8Array(chatKey.split("").map(c => c.charCodeAt(0))),
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );
      
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv.split("").map(c => c.charCodeAt(0))), tagLength: 128 },
        cryptoKey,
        new Uint8Array([...encrypted.split("").map(c => c.charCodeAt(0)), ...tag.split("").map(c => c.charCodeAt(0))])
      );
      
      const content = new TextDecoder().decode(decryptedBuffer);
      return { ...msg, content };
    } catch(err) {
      console.error(err);
      return { ...msg, content: "[Encrypted Message]" };
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chatKey || !activeChannel) return;
    
    const text = newMessage;
    setNewMessage("");
    socket.emit("typing", { channelId: activeChannel._id, userId, isTyping: false });

    const ivArray = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);
    
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      new Uint8Array(chatKey.split("").map(c => c.charCodeAt(0))),
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );
    
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: ivArray, tagLength: 128 },
      cryptoKey,
      encodedText
    );
    
    const encryptedData = new Uint8Array(encryptedBuffer);
    const tagArray = encryptedData.slice(-16);
    const ciphertextArray = encryptedData.slice(0, -16);
    
    const payload = {
      channelId: activeChannel._id,
      vaultId,
      senderId: userId,
      encryptedContent: forge.util.encode64(String.fromCharCode.apply(null, ciphertextArray)),
      iv: forge.util.encode64(String.fromCharCode.apply(null, ivArray)),
      tag: forge.util.encode64(String.fromCharCode.apply(null, tagArray)),
      readBy: [userId]
    };
    
    socket.emit("send_message", payload);
  };
  
  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    socket.emit("typing", { channelId: activeChannel._id, userId, isTyping: e.target.value.length > 0 });
  };
  
  const formatDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  
  const getMemberDetails = (uid) => {
    return memberDetailsMap[uid] || { name: uid.substring(0,6), role: "Member" };
  };

  const isOtherTyping = Object.values(typingUsers).some(t => t);

  return (
    <div className="flex h-full w-full text-white overflow-hidden bg-[#0b0f1a] font-sans">
      {/* 1. LEFT SIDEBAR - VAULT DIRECTORY */}
      {!compact && (
        <div className="w-64 bg-[#06080f] border-r border-white/5 flex flex-col">
        <div className="p-4 flex justify-between items-center border-b border-white/5">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Lock size={16} className="text-blue-400" /> Vault Directory
          </h2>
          <span className="text-gray-400 cursor-pointer hover:text-white">+</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3">
          <div className="mb-6">
            <p className="text-xs font-semibold text-gray-500 mb-2 tracking-wider">ACTIVE CHANNELS</p>
            {channels.filter(c => c.type === 'channel').map(c => (
              <div 
                key={c._id}
                onClick={() => setActiveChannel(c)}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer ${activeChannel?._id === c._id ? 'bg-[#1b233a] text-white' : 'text-gray-400 hover:bg-white/5'}`}
              >
                <Hash size={16} />
                {c.name}
                {unreadCounts[c._id] > 0 && (
                  <span className="ml-auto bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {unreadCounts[c._id]}
                  </span>
                )}
              </div>
            ))}
          </div>
          
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2 tracking-wider">DIRECT MESSAGES</p>
            {vault.members?.filter(m => m.userId !== userId).map((m, i) => {
              const mName = memberDetailsMap[m.userId]?.name || m.userId.substring(0,6);
              return (
                <div key={i} className="flex items-center gap-2 p-2 rounded cursor-pointer text-gray-400 hover:bg-white/5">
                  {memberDetailsMap[m.userId]?.profilePicture ? (
                    <img src={memberDetailsMap[m.userId].profilePicture} className="w-5 h-5 rounded-full object-cover" alt="" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-blue-500 relative flex justify-center items-center text-[10px] text-white">
                      {mName.substring(0,2).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border border-[#06080f]"></div>
                  {mName}
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="p-4 m-3 bg-[#111422] rounded-lg border border-blue-500/20">
          <h3 className="text-xs font-bold text-blue-400 flex items-center gap-1 mb-1">
            <Lock size={12}/> VAULT SECURE
          </h3>
          <p className="text-[10px] text-gray-400 leading-tight">All communications in this vault are encrypted locally before transit.</p>
        </div>
      </div>
      )}

      {/* 2. MAIN CHAT FEED */}
      <div className="flex-1 flex flex-col bg-[#0b0f1a] relative">
        {/* Header */}
        <div className="h-16 border-b border-white/5 flex justify-between items-center px-6 bg-[#06080f]/50">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Hash size={20} className="text-gray-400"/> {activeChannel?.name || "Loading..."}
            </h2>
            <p className="text-xs text-gray-400">{vault.members?.length || 1} members active</p>
          </div>
          <div className="flex items-center gap-4 text-gray-400">
            {showSearch && (
              <input type="text" placeholder="Search messages..." className="bg-[#111] border border-white/10 rounded px-3 py-1.5 text-xs outline-none text-white w-48" />
            )}
            <Search size={20} className="cursor-pointer hover:text-white" onClick={() => setShowSearch(!showSearch)} />
            <UserPlus size={20} className="cursor-pointer hover:text-white" onClick={() => setShowInvite && setShowInvite(true)} />
            <Info size={20} className={`cursor-pointer hover:text-white ${showDetailsPanel ? 'text-blue-400' : ''}`} onClick={() => setShowDetailsPanel(!showDetailsPanel)} />
          </div>
        </div>
        
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-center my-6">
            <div className="flex-1 h-[1px] bg-white/5"></div>
            <span className="px-4 text-[10px] font-bold tracking-wider text-gray-500 uppercase">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            <div className="flex-1 h-[1px] bg-white/5"></div>
          </div>

          {messages.map((m, i) => {
            const isMe = m.senderId === userId;
            const details = getMemberDetails(m.senderId);
            const showRead = isMe && m.readBy.length > 1; 
            
            return (
              <div key={i} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-[70%] gap-3 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                  
                  {/* Avatar */}
                  <div className="flex-shrink-0 mt-1">
                    {details.profilePicture ? (
                      <div className="w-8 h-8 rounded-full relative">
                        <img src={details.profilePicture} className="w-8 h-8 rounded-full object-cover shadow-lg" alt="" />
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0b0f1a]"></div>
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-xs shadow-lg relative">
                        {details.name?.substring(0,2).toUpperCase() || "U"}
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0b0f1a]"></div>
                      </div>
                    )}
                  </div>
                  
                  {/* Message Content */}
                  <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="font-semibold text-sm">{details.name || "User"}</span>
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{details.role || "MEMBER"}</span>
                    </div>
                    
                    <div className={`px-4 py-3 rounded-2xl shadow-sm ${
                      isMe 
                        ? 'bg-[#5b6cf7] text-white rounded-tr-sm' 
                        : 'bg-[#1e2335] text-gray-200 rounded-tl-sm'
                    }`}>
                      <p className="text-sm leading-relaxed">{m.content}</p>
                    </div>
                    
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] text-gray-500">{formatDate(m.timestamp)}</span>
                      {isMe && (
                        showRead ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} className="text-gray-500" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Typing indicator */}
        <div className="h-6 px-6">
          {isOtherTyping && (
            <div className="text-xs text-gray-500 italic flex items-center gap-2">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-pulse"></span>
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-pulse" style={{animationDelay: "0.1s"}}></span>
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-pulse" style={{animationDelay: "0.2s"}}></span>
              </span>
              Someone is typing...
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-6 pb-6 bg-[#0b0f1a]">
          <form onSubmit={handleSendMessage} className="bg-[#151a2a] border border-white/5 rounded-xl flex flex-col focus-within:border-blue-500/50 transition-colors">
            <div className="flex p-2 items-center">
              <button type="button" className="p-2 text-gray-400 hover:text-white"><Paperclip size={18} /></button>
              <input 
                type="text" 
                value={newMessage}
                onChange={handleTyping}
                placeholder={`Message #${activeChannel?.name || "..."}`}
                className="flex-1 bg-transparent border-none outline-none text-sm px-2 text-white placeholder-gray-500"
              />
              <button type="button" className="p-2 text-gray-400 hover:text-white"><Smile size={18} /></button>
              <button type="submit" disabled={!newMessage.trim()} className="p-2 ml-1 bg-white/5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-50"><Send size={16} /></button>
            </div>
            <div className="flex justify-between items-center px-4 pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-[#06080f] px-2 py-0.5 rounded text-[10px] font-bold text-gray-400">
                   <Lock size={10} /> E2E ACTIVE
                </div>
                <span className="text-[10px] text-gray-600 font-mono">Key ID: vault-{vaultId.substring(0,4)}</span>
              </div>
              <span className="text-[10px] text-gray-500">Markdown supported</span>
            </div>
          </form>
        </div>
      </div>

      {/* 3. RIGHT SIDEBAR - DETAILS */}
      {showDetailsPanel && (
        <div className="w-72 bg-[#06080f] border-l border-white/5 flex flex-col">
          <div className="flex text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-white/5">
            <div onClick={() => setActiveDetailsTab("DETAILS")} className={`flex-1 text-center py-4 cursor-pointer transition-colors ${activeDetailsTab === "DETAILS" ? "border-b-2 border-blue-500 text-blue-400" : "hover:text-gray-300"}`}>DETAILS</div>
            <div onClick={() => setActiveDetailsTab("FILES")} className={`flex-1 text-center py-4 cursor-pointer transition-colors ${activeDetailsTab === "FILES" ? "border-b-2 border-blue-500 text-blue-400" : "hover:text-gray-300"}`}>FILES</div>
          </div>
          
          {activeDetailsTab === "DETAILS" ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-8">
                <h4 className="text-[10px] font-bold text-gray-500 mb-3 tracking-widest">VAULT DESCRIPTION</h4>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {vault.description || "No description provided."}
                </p>
                <div className="flex gap-2 mt-3">
                  <span className="px-2 py-1 rounded bg-white/5 text-[10px] text-gray-400 border border-white/10">#stealth</span>
                  <span className="px-2 py-1 rounded bg-white/5 text-[10px] text-gray-400 border border-white/10">#milestone-1</span>
                </div>
              </div>
              
              <div className="mb-8">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-[10px] font-bold text-gray-500 tracking-widest">MEMBERS — {vault.members?.length || 1}</h4>
                  <span className="text-[10px] text-blue-400 cursor-pointer" onClick={() => setShowAllMembers(!showAllMembers)}>
                    {showAllMembers ? "Show Less" : "View All"}
                  </span>
                </div>
                <div className="space-y-3">
                  {vault.members?.slice(0, showAllMembers ? vault.members.length : 2).map((m, i) => {
                    const isMe = m.userId === userId;
                    const mName = memberDetailsMap[m.userId]?.name || m.userId.substring(0,6);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        {memberDetailsMap[m.userId]?.profilePicture ? (
                          <div className="w-8 h-8 rounded-full relative">
                            <img src={memberDetailsMap[m.userId].profilePicture} className="w-8 h-8 rounded-full object-cover" alt="" />
                            <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border border-[#06080f]"></div>
                          </div>
                        ) : (
                          <div className={`w-8 h-8 rounded-full ${isMe ? 'bg-blue-600' : 'bg-purple-600'} flex items-center justify-center text-xs font-bold relative`}>
                            {mName.substring(0,2).toUpperCase()}
                            <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 rounded-full border border-[#06080f]"></div>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold">{isMe ? "You" : mName}</p>
                          <p className="text-[10px] text-gray-500 uppercase">{m.role}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-[10px] font-bold text-gray-500 tracking-widest">RECENT CONTEXT</h4>
                  <span className="text-[10px] text-blue-400 cursor-pointer" onClick={() => setShowAllFiles(!showAllFiles)}>
                    {showAllFiles ? "Show Less" : "Full List"}
                  </span>
                </div>
                <div className="space-y-2">
                  {vault.files?.slice(0, showAllFiles ? vault.files.length : 2).map((f, i) => (
                    <div key={i} className="p-3 bg-[#111422] rounded-lg border border-white/5 flex items-center gap-3">
                      <div className="p-2 bg-white/5 rounded text-gray-400">
                        <Paperclip size={14} />
                      </div>
                      <div className="flex-1 truncate">
                        <p className="text-xs font-medium truncate">{f.name}</p>
                        <p className="text-[9px] text-gray-500">{(f.size/1024).toFixed(1)} KB • {new Date(f.createdAt).toLocaleDateString()}</p>
                      </div>
                      <span className="text-[8px] font-bold text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30">Encrypted</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              <h4 className="text-[10px] font-bold text-gray-500 tracking-widest mb-4">ALL FILES IN VAULT</h4>
              <div className="space-y-2">
                {vault.files?.map((f, i) => (
                  <div key={i} className="p-3 bg-[#111422] rounded-lg border border-white/5 flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded text-gray-400">
                      <Paperclip size={14} />
                    </div>
                    <div className="flex-1 truncate">
                      <p className="text-xs font-medium truncate">{f.name}</p>
                      <p className="text-[9px] text-gray-500">{(f.size/1024).toFixed(1)} KB</p>
                    </div>
                    <span className="text-[8px] font-bold text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/30">Encrypted</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
    </div>
  );
}
