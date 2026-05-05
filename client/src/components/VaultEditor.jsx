import React, { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import axios from "axios";
import forge from "node-forge";
import { 
  FileCode, 
  Folder, 
  History, 
  Download, 
  Save, 
  RotateCcw, 
  ChevronRight, 
  ChevronDown,
  Code,
  File,
  X,
  Plus
} from "lucide-react";
import JSZip from "jszip";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function VaultEditor({ vaultId, vault, userId, onRefresh }) {
  const [files, setFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [editorContent, setEditorContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chatKey, setChatKey] = useState(null);

  useEffect(() => {
    if (vault?.files) {
      // Filter for code-like files or just show all as editable
      setFiles(vault.files);
    }
  }, [vault]);

  useEffect(() => {
    const initKey = async () => {
      try {
        const privateKeyPem = localStorage.getItem("privateKey");
        if (!privateKeyPem) return;
        const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
        
        let res = await axios.post(`${API_URL}/api/vault/${vaultId}/chat/key`, { userId });
        if (res.data.encryptedChatKey) {
           const aesKey = privateKey.decrypt(forge.util.decode64(res.data.encryptedChatKey), "RSA-OAEP");
           setChatKey(aesKey);
        }
      } catch (e) {}
    };
    initKey();
  }, [vaultId, userId]);

  const handleFileSelect = async (file) => {
    setActiveFile(file);
    setEditorContent("Loading encrypted content...");
    
    try {
      const privateKeyPem = localStorage.getItem("privateKey");
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

      // 1. Get encrypted file + encrypted AES key
      const res = await axios.get(`${API_URL}/api/file/${file._id}?userId=${userId}`);
      const { file: base64File, encryptedKey } = res.data;

      // 2. Decrypt AES key
      const aesKey = privateKey.decrypt(forge.util.decode64(encryptedKey), "RSA-OAEP");

      // 3. Decrypt File
      const fileBytes = forge.util.decode64(base64File);
      const buffer = new Uint8Array(fileBytes.split("").map(c => c.charCodeAt(0)));
      const iv = buffer.slice(0, 12);
      const tag = buffer.slice(12, 28);
      const encryptedData = buffer.slice(28);

      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        new Uint8Array(aesKey.split("").map(c => c.charCodeAt(0))),
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );

      const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv, tagLength: 128 },
        cryptoKey,
        new Uint8Array([...encryptedData, ...tag])
      );

      const content = new TextDecoder().decode(decrypted);
      setEditorContent(content);
    } catch (err) {
      console.error(err);
      setEditorContent("// Error: Could not decrypt file. Make sure you have the vault keys.");
    }
  };

  const saveChanges = async () => {
    if (!activeFile || isSaving) return;
    setIsSaving(true);
    
    try {
      const myPrivateKeyPem = localStorage.getItem("privateKey");
      const privateKey = forge.pki.privateKeyFromPem(myPrivateKeyPem);

      // 1. Get current AES key
      const keyRes = await axios.get(`${API_URL}/api/file/${activeFile._id}?userId=${userId}`);
      const aesKey = privateKey.decrypt(forge.util.decode64(keyRes.data.encryptedKey), "RSA-OAEP");

      // 2. Encrypt new content
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(editorContent);
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        new Uint8Array(aesKey.split("").map(c => c.charCodeAt(0))),
        { name: "AES-GCM" },
        false,
        ["encrypt"]
      );

      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv, tagLength: 128 },
        cryptoKey,
        encoded
      );

      const encryptedArray = new Uint8Array(encryptedBuffer);
      const tag = encryptedArray.slice(-16);
      const data = encryptedArray.slice(0, -16);
      const finalBlob = new Blob([iv, tag, data]);

      // 3. Upload
      const formData = new FormData();
      formData.append("file", finalBlob, activeFile.name);
      formData.append("vaultId", vaultId);
      formData.append("userId", userId);
      formData.append("fileId", activeFile._id);
      formData.append("diffSummary", `Code update in ${activeFile.name}`);

      await axios.post(`${API_URL}/api/update-file`, formData);
      setIsSaving(false);
      onRefresh();
      alert("✅ Checkpoint saved successfully!");
    } catch (err) {
      console.error(err);
      setIsSaving(false);
      alert("❌ Failed to save checkpoint.");
    }
  };

  const downloadProjectZip = async () => {
    const zip = new JSZip();
    const folder = zip.folder(vault.name);

    alert("Preparing secure project zip... this may take a moment.");

    for (const file of vault.files) {
      try {
        const privateKeyPem = localStorage.getItem("privateKey");
        const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
        const res = await axios.get(`${API_URL}/api/file/${file._id}?userId=${userId}`);
        const aesKey = privateKey.decrypt(forge.util.decode64(res.data.encryptedKey), "RSA-OAEP");
        const fileBytes = forge.util.decode64(res.data.file);
        const buffer = new Uint8Array(fileBytes.split("").map(c => c.charCodeAt(0)));
        const iv = buffer.slice(0, 12);
        const tag = buffer.slice(12, 28);
        const encryptedData = buffer.slice(28);
        const cryptoKey = await window.crypto.subtle.importKey("raw", new Uint8Array(aesKey.split("").map(c => c.charCodeAt(0))), { name: "AES-GCM" }, false, ["decrypt"]);
        const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv, tagLength: 128 }, cryptoKey, new Uint8Array([...encryptedData, ...tag]));
        folder.file(file.name, decrypted);
      } catch (e) {
        console.error("Zip error for file:", file.name, e);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `${vault.name}_project.zip`;
    link.click();
  };

  const restoreVersion = async (idx) => {
    if (!window.confirm("Restore this version? Current changes will be archived.")) return;
    try {
      await axios.post(`${API_URL}/api/file/${activeFile._id}/restore`, {
        vaultId,
        userId,
        versionIdx: idx
      });
      setShowHistory(false);
      handleFileSelect(activeFile);
      onRefresh();
    } catch (e) {
      alert("Restore failed");
    }
  };

  return (
    <div className="flex h-full w-full bg-[#06080f] text-gray-300 overflow-hidden font-sans border-t border-white/5">
      {/* 1. Project Explorer */}
      <div className="w-64 border-r border-white/5 flex flex-col bg-[#0b0f1a]">
        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#06080f]">
          <h3 className="text-xs font-bold tracking-widest text-gray-500 uppercase">EXPLORER</h3>
          <div className="flex gap-2">
            <Plus size={14} className="cursor-pointer hover:text-white" />
            <Download size={14} className="cursor-pointer hover:text-white text-blue-400" onClick={downloadProjectZip} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-4 py-2 flex items-center gap-2 text-xs font-semibold text-blue-400">
            <ChevronDown size={14} />
            <Folder size={14} />
            {vault.name.toUpperCase()}
          </div>
          <div className="pl-6">
            {files.map(f => (
              <div 
                key={f._id}
                onClick={() => handleFileSelect(f)}
                className={`flex items-center gap-2 px-4 py-1.5 text-sm cursor-pointer transition-colors ${activeFile?._id === f._id ? 'bg-blue-500/10 text-blue-400 border-l-2 border-blue-500' : 'hover:bg-white/5 text-gray-400'}`}
              >
                <FileCode size={14} />
                <span className="truncate">{f.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Main Editor Area */}
      <div className="flex-1 flex flex-col bg-[#0b0f1a] relative">
        {activeFile ? (
          <>
            <div className="h-10 border-b border-white/5 flex items-center px-4 bg-[#06080f] gap-4">
              <div className="flex items-center gap-2 text-xs text-white bg-[#1a233a] px-3 py-1 rounded-t border-t border-l border-r border-blue-500/30">
                <FileCode size={12} className="text-blue-400" />
                {activeFile.name}
                <X size={12} className="ml-2 cursor-pointer hover:text-red-400" onClick={() => setActiveFile(null)} />
              </div>
              <div className="flex-1"></div>
              <div className="flex items-center gap-4 px-2">
                 <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-1.5 text-xs hover:text-white transition-colors">
                   <History size={14} /> {showHistory ? "Editor" : "History"}
                 </button>
                 <button 
                  onClick={saveChanges} 
                  disabled={isSaving}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
                 >
                   <Save size={14} /> {isSaving ? "Saving..." : "Save"}
                 </button>
              </div>
            </div>

            <div className="flex-1 relative">
              {!showHistory ? (
                <Editor
                  height="100%"
                  theme="vs-dark"
                  path={activeFile.name}
                  defaultLanguage={activeFile.name.split('.').pop()}
                  defaultValue={editorContent}
                  value={editorContent}
                  onChange={(v) => setEditorContent(v)}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: true },
                    fontFamily: "JetBrains Mono, Fira Code, monospace",
                    padding: { top: 20 },
                    scrollbar: { vertical: "visible", horizontal: "visible" },
                    lineNumbers: "on",
                    glyphMargin: true,
                    automaticLayout: true,
                  }}
                />
              ) : (
                <div className="absolute inset-0 bg-[#06080f] p-8 overflow-y-auto">
                  <div className="max-w-3xl mx-auto">
                    <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                      <History className="text-blue-400" /> Version History: {activeFile.name}
                    </h2>
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-xl flex justify-between items-center">
                        <div>
                          <p className="font-bold text-white">Current Active Version</p>
                          <p className="text-xs text-gray-500">{new Date(activeFile.createdAt).toLocaleString()}</p>
                        </div>
                        <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-2 py-1 rounded border border-blue-500/30 uppercase">Active</span>
                      </div>
                      
                      {activeFile.versions?.slice().reverse().map((v, i) => (
                        <div key={i} className="p-4 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center group hover:border-white/10 transition-colors">
                          <div>
                            <p className="font-semibold text-gray-200">Checkpoint {v.version}</p>
                            <p className="text-xs text-gray-500">{new Date(v.createdAt).toLocaleString()}</p>
                            <p className="text-xs text-gray-400 mt-2 italic">"{v.diffSummary || "Project update"}"</p>
                          </div>
                          <button 
                            onClick={() => restoreVersion(activeFile.versions.indexOf(v))}
                            className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg transition-colors border border-white/10"
                          >
                            <RotateCcw size={14} /> Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-[#06080f]">
            <div className="w-20 h-20 bg-blue-500/10 rounded-3xl flex items-center justify-center mb-6 border border-blue-500/20">
               <Code size={40} className="text-blue-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Secure Development IDE</h2>
            <p className="text-gray-500 max-w-sm">Select a file from the explorer to begin collaborating on code. Everything is encrypted locally.</p>
            <div className="mt-8 flex gap-4">
               <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center text-gray-400">
                     <Lock size={18} />
                  </div>
                  <span className="text-[10px] text-gray-600 font-bold uppercase">Zero-Knowledge</span>
               </div>
               <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center text-gray-400">
                     <History size={18} />
                  </div>
                  <span className="text-[10px] text-gray-600 font-bold uppercase">Versioning</span>
               </div>
               <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 bg-white/5 rounded flex items-center justify-center text-gray-400">
                     <Plus size={18} />
                  </div>
                  <span className="text-[10px] text-gray-600 font-bold uppercase">Collaborate</span>
               </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
