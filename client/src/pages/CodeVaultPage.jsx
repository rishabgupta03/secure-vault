import React, { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import forge from "node-forge";
import { io } from "socket.io-client";
import Editor from "@monaco-editor/react";
import VaultChat from "./VaultChat";
import CodeRunner from "../components/CodeRunner";
import { useCollaboration } from "../components/CollabProvider";
import * as JSZip from "jszip";
import {
  FileCode, Folder, History, Download, Save, RotateCcw, X, Plus,
  Code, Lock, Users, MessageSquare, ChevronDown, ChevronRight,
  Play, GitBranch, Shield, Activity, Search, Settings, Menu,
  Eye, Clock, Zap, Terminal, UserPlus, Send, MessageCircle
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const socket = io(API_URL);

const LANG_MAP = {
  js:"javascript",jsx:"javascript",ts:"typescript",tsx:"typescriptreact",
  py:"python",java:"java",c:"c",cpp:"cpp",cc:"cpp",h:"c",hpp:"cpp",
  json:"json",html:"html",css:"css",md:"markdown",xml:"xml",sql:"sql",
  sh:"shell",yaml:"yaml",yml:"yaml",rb:"ruby",go:"go",rs:"rust",php:"php",
  txt:"plaintext",env:"plaintext"
};

function getLanguage(name) {
  const ext = name?.split(".").pop()?.toLowerCase() || "";
  return LANG_MAP[ext] || "plaintext";
}

export default function CodeVaultPage() {
  const id = window.location.pathname.split("/").pop();
  const userId = localStorage.getItem("userId");
  const userName = localStorage.getItem("userName") || "User";

  // Core state
  const [vault, setVault] = useState(null);
  const [files, setFiles] = useState([]);
  const [openTabs, setOpenTabs] = useState([]); // [{fileId, name, content, dirty}]
  const [activeFileId, setActiveFileId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showExplorer, setShowExplorer] = useState(true);
  const [toastMsg, setToastMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Developer");

  const editorRef = useRef(null);
  const aesKeysRef = useRef({}); // fileId -> aesKey
  const fileInputRef = useRef(null);

  // Collab hook
  const activeTab = openTabs.find(t => t.fileId === activeFileId);
  const { collaborators, sendChange, sendCursor, isRemoteChangeRef, myColor } = useCollaboration({
    socket, vaultId: id, fileId: activeFileId, userId, userName, editorRef
  });

  // Fetch vault
  const fetchVault = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/vault/${id}?userId=${userId}`);
      setVault(res.data);
      setFiles(res.data.files || []);
    } catch (err) {
      console.error("Failed to fetch vault", err);
    }
  }, [id, userId]);

  useEffect(() => { fetchVault(); }, [fetchVault]);

  useEffect(() => {
    socket.emit("user_connected", userId);
    socket.on("online_users_update", (users) => setOnlineUsers(users));
    return () => { socket.off("online_users_update"); };
  }, [userId]);

  // Toast helper
  const toast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 3000); };

  // ===== DECRYPT HELPER =====
  const decryptFileContent = async (file) => {
    const privateKeyPem = localStorage.getItem("privateKey");
    if (!privateKeyPem) throw new Error("Private key missing");
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

    const res = await axios.get(`${API_URL}/api/file/${file._id}?userId=${userId}&action=view`);
    const { file: base64File, encryptedKey } = res.data;

    let aesKey;
    try {
      aesKey = privateKey.decrypt(forge.util.decode64(encryptedKey), "RSA-OAEP");
    } catch {
      aesKey = privateKey.decrypt(forge.util.decode64(encryptedKey), "RSA-OAEP", {
        md: forge.md.sha1.create(), mgf1: { md: forge.md.sha1.create() }
      });
    }

    aesKeysRef.current[file._id] = aesKey;

    const fileBytes = forge.util.decode64(base64File);
    const buffer = new Uint8Array(fileBytes.split("").map(c => c.charCodeAt(0)));
    const iv = buffer.slice(0, 12);
    const tag = buffer.slice(12, 28);
    const encData = buffer.slice(28);

    const cryptoKey = await window.crypto.subtle.importKey(
      "raw", new Uint8Array(aesKey.split("").map(c => c.charCodeAt(0))),
      { name: "AES-GCM" }, false, ["decrypt"]
    );
    const combined = new Uint8Array(encData.length + tag.length);
    combined.set(encData); combined.set(tag, encData.length);

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 }, cryptoKey, combined
    );
    return new TextDecoder().decode(decrypted);
  };

  // ===== OPEN FILE =====
  const openFile = async (file) => {
    const existing = openTabs.find(t => t.fileId === file._id);
    if (existing) { setActiveFileId(file._id); return; }

    try {
      const content = await decryptFileContent(file);
      setOpenTabs(prev => [...prev, { fileId: file._id, name: file.name, content, originalContent: content, dirty: false }]);
      setActiveFileId(file._id);
    } catch (err) {
      console.error(err);
      toast("Failed to decrypt file");
    }
  };

  // ===== CLOSE TAB =====
  const closeTab = (fileId) => {
    setOpenTabs(prev => prev.filter(t => t.fileId !== fileId));
    if (activeFileId === fileId) {
      const remaining = openTabs.filter(t => t.fileId !== fileId);
      setActiveFileId(remaining.length > 0 ? remaining[remaining.length - 1].fileId : null);
    }
    delete aesKeysRef.current[fileId];
  };

  // ===== SAVE =====
  const saveFile = async () => {
    if (!activeTab || isSaving) return;
    setIsSaving(true);
    try {
      const aesKey = aesKeysRef.current[activeFileId];
      if (!aesKey) { toast("Key missing, reopen file"); setIsSaving(false); return; }

      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(activeTab.content);
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw", new Uint8Array(aesKey.split("").map(c => c.charCodeAt(0))),
        { name: "AES-GCM" }, false, ["encrypt"]
      );
      const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv, tagLength: 128 }, cryptoKey, encoded
      );
      const encArr = new Uint8Array(encrypted);
      const tag = encArr.slice(-16);
      const data = encArr.slice(0, -16);
      const finalBlob = new Blob([iv, tag, data]);

      const formData = new FormData();
      formData.append("file", finalBlob, activeTab.name);
      formData.append("vaultId", id);
      formData.append("userId", userId);
      formData.append("fileId", activeFileId);
      formData.append("diffSummary", `Updated ${activeTab.name}`);

      await axios.post(`${API_URL}/api/update-file`, formData);
      setOpenTabs(prev => prev.map(t => t.fileId === activeFileId ? { ...t, dirty: false, originalContent: t.content } : t));
      fetchVault();
      toast("Saved successfully");
    } catch (err) {
      console.error(err);
      toast("Save failed");
    }
    setIsSaving(false);
  };

  // ===== UPLOAD =====
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const privateKeyPem = localStorage.getItem("privateKey");
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
      const userRes = await axios.get(`${API_URL}/api/user/${userId}`);
      const publicKey = forge.pki.publicKeyFromPem(userRes.data.publicKey);

      const buf = await file.arrayBuffer();
      const aesKeyRaw = window.crypto.getRandomValues(new Uint8Array(32));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const cryptoKey = await window.crypto.subtle.importKey("raw", aesKeyRaw, { name: "AES-GCM" }, false, ["encrypt"]);
      const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, cryptoKey, buf);
      const encArr = new Uint8Array(encrypted);
      const tag = encArr.slice(-16);
      const data = encArr.slice(0, -16);
      const finalBlob = new Blob([iv, tag, data]);

      const aesKeyStr = String.fromCharCode(...aesKeyRaw);
      const encryptedAesKey = forge.util.encode64(publicKey.encrypt(aesKeyStr, "RSA-OAEP"));

      const formData = new FormData();
      formData.append("file", finalBlob, file.name);
      formData.append("vaultId", id);
      formData.append("userId", userId);
      formData.append("encryptedKey", encryptedAesKey);
      await axios.post(`${API_URL}/api/upload`, formData);
      fetchVault();
      toast(`Uploaded ${file.name}`);
    } catch (err) {
      console.error(err);
      toast("Upload failed");
    }
  };

  // ===== ZIP =====
  const downloadZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder(vault?.name || "project");
    toast("Preparing ZIP...");
    for (const file of files) {
      try {
        const content = await decryptFileContent(file);
        folder.file(file.name, content);
      } catch (e) { console.error("Zip err:", file.name, e); }
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${vault?.name || "project"}.zip`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ===== RESTORE VERSION =====
  const restoreVersion = async (idx) => {
    if (!window.confirm("Restore this version?")) return;
    const file = files.find(f => f._id === activeFileId);
    if (!file) return;
    try {
      await axios.post(`${API_URL}/api/file/${activeFileId}/restore`, { vaultId: id, userId, versionIdx: idx });
      const content = await decryptFileContent(file);
      setOpenTabs(prev => prev.map(t => t.fileId === activeFileId ? { ...t, content, originalContent: content, dirty: false } : t));
      fetchVault();
      setShowHistory(false);
      toast("Version restored");
    } catch { toast("Restore failed"); }
  };
  
  // ===== INVITE =====
  const inviteUser = async () => {
    if (!inviteEmail) return toast("Email required");
    try {
      await axios.post(`${API_URL}/api/invite-to-vault`, {
        vaultId: id,
        userId,
        email: inviteEmail,
        role: inviteRole
      });
      toast(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setShowInvite(false);
      fetchVault();
    } catch (err) {
      toast(err.response?.data?.message || "Invite failed");
    }
  };

  // ===== EDITOR HANDLERS =====
  const handleEditorMount = (editor) => { editorRef.current = editor; };

  const handleEditorChange = (value, ev) => {
    setOpenTabs(prev => prev.map(t => t.fileId === activeFileId ? { ...t, content: value, dirty: value !== t.originalContent } : t));
    if (ev?.changes && !isRemoteChangeRef.current) {
      sendChange(ev.changes);
    }
  };

  const handleCursorChange = (e) => {
    if (e?.position) sendCursor(e.position);
  };

  const activeFile = files.find(f => f._id === activeFileId);
  const memberCount = vault?.members?.length || 0;
  const onlineCount = vault?.members?.filter(m => onlineUsers.includes(m.userId)).length || 0;

  if (!vault) return <div className="h-screen bg-[#02040a] flex items-center justify-center text-gray-500">Loading workspace...</div>;

  return (
    <div className="h-screen flex flex-col bg-[#0a0d14] text-gray-300 font-sans overflow-hidden">
      {/* TOP BAR */}
      <div className="h-11 bg-[#06080f] border-b border-white/5 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => window.history.back()} className="text-gray-500 hover:text-white"><ChevronDown size={16} className="rotate-90" /></button>
          <div className="flex items-center gap-2">
            <Code size={16} className="text-blue-400" />
            <span className="text-sm font-bold text-white">{vault.name}</span>
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-bold uppercase">Code Workspace</span>
          </div>
          <div className="flex items-center gap-1 ml-4 bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded-full">
            <Shield size={10} className="text-green-400" />
            <span className="text-[9px] font-bold text-green-400 tracking-widest uppercase">E2E Encrypted</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Collaborator avatars */}
          <div className="flex items-center gap-1">
            {collaborators.map(c => (
              <div key={c.userId} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2" style={{ backgroundColor: c.color + "30", borderColor: c.color, color: c.color }}>
                {c.userName?.charAt(0).toUpperCase()}
              </div>
            ))}
            <div className="text-[10px] text-gray-500 ml-1">{onlineCount}/{memberCount} online</div>
          </div>
          <button 
            onClick={() => setShowInvite(true)} 
            className="flex items-center gap-1.5 px-3 py-1 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 rounded-lg transition-all text-[11px] font-bold"
          >
            <UserPlus size={14} /> Invite
          </button>
          <div className="h-4 w-px bg-white/10 mx-1" />
          <button onClick={() => setShowChat(!showChat)} className={`p-2 rounded-lg transition-colors ${showChat ? "bg-blue-500/20 text-blue-400" : "text-gray-500 hover:text-white hover:bg-white/5"}`}><MessageSquare size={16} /></button>
          <button onClick={downloadZip} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors" title="Download ZIP"><Download size={16} /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR - File Explorer */}
        {showExplorer && (
          <div className="w-56 border-r border-white/5 flex flex-col bg-[#06080f] shrink-0">
            <div className="p-3 border-b border-white/5 flex justify-between items-center">
              <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Explorer</span>
              <div className="flex gap-2">
                <Plus size={13} className="cursor-pointer hover:text-white text-gray-500" onClick={() => fileInputRef.current?.click()} />
                <Download size={13} className="cursor-pointer hover:text-white text-blue-400" onClick={downloadZip} />
              </div>
            </div>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />

            {/* Search */}
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 bg-white/5 rounded px-2 py-1">
                <Search size={12} className="text-gray-500" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search files..." className="bg-transparent text-xs outline-none flex-1 text-gray-300" />
              </div>
            </div>

            {/* File Tree */}
            <div className="flex-1 overflow-y-auto py-1">
              <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-blue-400">
                <ChevronDown size={12} /><Folder size={12} />
                {(vault.name || "PROJECT").toUpperCase()}
              </div>
              <div className="pl-4">
                {files.filter(f => !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())).map(f => (
                  <div key={f._id} onClick={() => openFile(f)}
                    className={`flex items-center gap-2 px-3 py-1 text-[12px] cursor-pointer transition-colors ${activeFileId === f._id ? "bg-blue-500/10 text-blue-400 border-l-2 border-blue-500" : "hover:bg-white/5 text-gray-400 border-l-2 border-transparent"}`}>
                    <FileCode size={13} />
                    <span className="truncate">{f.name}</span>
                  </div>
                ))}
                {files.length === 0 && <p className="text-[10px] text-gray-600 px-3 py-4">No files yet. Click + to upload.</p>}
              </div>
            </div>

            {/* Activity */}
            <div className="border-t border-white/5 p-3">
              <div className="text-[10px] font-bold tracking-widest text-gray-500 uppercase mb-2">Recent Activity</div>
              {(vault.activity || []).slice(-3).reverse().map((a, i) => (
                <div key={i} className="text-[10px] text-gray-500 py-0.5 truncate">{a.action}</div>
              ))}
            </div>
          </div>
        )}

        {/* MAIN AREA */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tab Bar */}
          <div className="h-9 bg-[#06080f] border-b border-white/5 flex items-center overflow-x-auto shrink-0">
            <button onClick={() => setShowExplorer(!showExplorer)} className="px-2 text-gray-500 hover:text-white shrink-0"><Menu size={14} /></button>
            {openTabs.map(tab => (
              <div key={tab.fileId} onClick={() => setActiveFileId(tab.fileId)}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] cursor-pointer border-r border-white/5 shrink-0 ${tab.fileId === activeFileId ? "bg-[#0b0f1a] text-white border-t-2 border-t-blue-500" : "text-gray-500 hover:text-white border-t-2 border-t-transparent"}`}>
                <FileCode size={11} className={tab.dirty ? "text-yellow-400" : "text-gray-500"} />
                {tab.name}
                {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                <X size={11} className="ml-1 hover:text-red-400" onClick={(e) => { e.stopPropagation(); closeTab(tab.fileId); }} />
              </div>
            ))}
            <div className="flex-1" />
            {activeTab && (
              <div className="flex items-center gap-2 px-3 shrink-0">
                <button onClick={() => setShowHistory(!showHistory)} className="text-[10px] text-gray-500 hover:text-white flex items-center gap-1">
                  <History size={12} />{showHistory ? "Editor" : "History"}
                </button>
                <button onClick={saveFile} disabled={isSaving || !activeTab?.dirty}
                  className="text-[10px] bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white px-2.5 py-0.5 rounded flex items-center gap-1 font-bold">
                  <Save size={11} />{isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            )}
          </div>

          {/* Editor / History / Empty State */}
          <div className="flex-1 relative">
            {activeTab && !showHistory ? (
              <Editor
                height="100%"
                theme="vs-dark"
                path={activeTab.name}
                language={getLanguage(activeTab.name)}
                value={activeTab.content}
                onChange={handleEditorChange}
                onMount={handleEditorMount}
                options={{
                  fontSize: 14, minimap: { enabled: true },
                  fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace",
                  padding: { top: 16 }, lineNumbers: "on", glyphMargin: true,
                  automaticLayout: true, scrollBeyondLastLine: false,
                  cursorBlinking: "smooth", smoothScrolling: true, renderWhitespace: "selection"
                }}
              />
            ) : activeTab && showHistory ? (
              <div className="absolute inset-0 bg-[#06080f] p-6 overflow-y-auto">
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><History className="text-blue-400" size={18} /> Version History: {activeTab.name}</h2>
                <div className="space-y-3 max-w-2xl">
                  <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-xl flex justify-between items-center">
                    <div>
                      <p className="font-bold text-white text-sm">Current Version</p>
                      <p className="text-[10px] text-gray-500">{new Date(activeFile?.createdAt).toLocaleString()}</p>
                    </div>
                    <span className="text-[9px] font-bold bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded uppercase">Active</span>
                  </div>
                  {activeFile?.versions?.slice().reverse().map((v, i) => (
                    <div key={i} className="p-4 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-sm">Checkpoint {v.version}</p>
                        <p className="text-[10px] text-gray-500">{new Date(v.createdAt).toLocaleString()}</p>
                        <p className="text-[10px] text-gray-400 mt-1 italic">"{v.diffSummary || "Update"}"</p>
                      </div>
                      <button onClick={() => restoreVersion(activeFile.versions.indexOf(v))} className="text-[10px] bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded flex items-center gap-1 border border-white/10">
                        <RotateCcw size={11} /> Restore
                      </button>
                    </div>
                  ))}
                  {(!activeFile?.versions || activeFile.versions.length === 0) && <p className="text-gray-600 text-center py-8">No previous versions</p>}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-12 h-full bg-[#06080f]">
                <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center mb-6 border border-blue-500/20">
                  <Code size={40} className="text-blue-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Secure Code Workspace</h2>
                <p className="text-gray-500 max-w-sm mb-6">Select a file from the explorer to start coding. Real-time collaboration is active.</p>
                <div className="flex gap-6">
                  {[{icon: Lock, label:"Zero-Knowledge"},{icon: GitBranch, label:"Versioning"},{icon: Users, label:"Live Collab"},{icon: Zap, label:"Run Code"}].map(({icon:I,label},i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center text-gray-400"><I size={18} /></div>
                      <span className="text-[9px] text-gray-600 font-bold uppercase">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Code Runner Terminal */}
          {activeTab && (
            <CodeRunner code={activeTab.content} fileName={activeTab.name} isOpen={showTerminal} onToggle={() => setShowTerminal(!showTerminal)} />
          )}
        </div>

        {/* CHAT PANEL */}
        {showChat && (
          <div className="w-96 border-l border-white/5 flex flex-col bg-[#080a12] shrink-0 animate-slide-in-right h-full overflow-hidden shadow-2xl z-20">
            <div className="h-11 flex items-center justify-between px-4 border-b border-white/5 bg-[#06080f]">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-blue-400" />
                <span className="text-[11px] font-black tracking-widest text-white uppercase">Vault Chat</span>
              </div>
              <button onClick={() => setShowChat(false)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-md transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <VaultChat 
                vaultId={id} 
                vault={vault} 
                setShowInvite={setShowInvite} 
                isActive={showChat} 
                onUnreadChange={() => {}} 
                onOnlineUsersChange={setOnlineUsers} 
                onNewToast={toast} 
                compact={true}
              />
            </div>
          </div>
        )}
      </div>

      {/* INVITE MODAL */}
      {showInvite && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-[#0b0f1a] w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Invite Member</h2>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Collaborate on {vault.name}</p>
                </div>
              </div>
              <button onClick={() => setShowInvite(false)} className="text-gray-500 hover:text-white p-2 hover:bg-white/5 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Member Email</label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input
                    placeholder="Enter collaborator email..."
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-4 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2">Assign Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 outline-none focus:border-blue-500 transition-all text-sm appearance-none cursor-pointer"
                >
                  <option className="bg-[#0b0f1a]">Viewer</option>
                  <option className="bg-[#0b0f1a]">Editor</option>
                  <option className="bg-[#0b0f1a]">Developer</option>
                  <option className="bg-[#0b0f1a]">Admin</option>
                  <option className="bg-[#0b0f1a]">Security Auditor</option>
                </select>
              </div>

              <div className="pt-4">
                <button
                  onClick={inviteUser}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
                >
                  Send Invitation
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATUS BAR */}
      <div className="h-6 bg-[#06080f] border-t border-white/5 flex items-center justify-between px-4 text-[10px] text-gray-500 shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Shield size={10} className="text-green-400" /> AES-256-GCM</span>
          {activeTab && <span>{getLanguage(activeTab.name)}</span>}
          {collaborators.length > 0 && <span className="text-blue-400">{collaborators.length} collaborator{collaborators.length > 1 ? "s" : ""}</span>}
        </div>
        <div className="flex items-center gap-4">
          <span>{files.length} files</span>
          <span>{memberCount} members</span>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-10 right-6 bg-[#1a233a] border border-blue-500/30 text-white px-4 py-3 rounded-xl shadow-2xl z-50 text-sm font-medium animate-fade-in-up">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
