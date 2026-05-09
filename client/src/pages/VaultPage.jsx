// import React, { useEffect, useState, useRef } from "react";
// import axios from "axios";
// import forge from "node-forge";
// import {
//   Users,
//   Share2,
//   Phone,
//   Grid,
//   List,
//   MoreVertical,
//   X
// } from "lucide-react";

// // ================= ZERO KNOWLEDGE SHARE =================
// const shareKeysWithUser = async (vault, targetUserId) => {
//   try {
//     const myPrivateKeyPem = localStorage.getItem("privateKey");
//     const myUserId = localStorage.getItem("userId");

//     if (!myPrivateKeyPem) {
//       alert("Private key missing");
//       return;
//     }

//     const privateKey = forge.pki.privateKeyFromPem(myPrivateKeyPem);

//     // 🔹 get target public key
//     const res = await axios.get(
//       `${API_URL}/api/user/${targetUserId}`
//     );

//     const targetPublicKey = forge.pki.publicKeyFromPem(res.data.publicKey);

//     for (let file of vault.files) {
//       try {
//         // ✅ STEP 1: get YOUR encrypted AES key
//         const keyRes = await axios.get(
//           `${API_URL}/api/file/${file._id}?userId=${myUserId}`
//         );

//         const encryptedKeyBase64 = keyRes.data.encryptedKey;

//         if (!encryptedKeyBase64) continue;

//         // ✅ STEP 2: decrypt AES key (YOUR PRIVATE KEY)
//         const decryptedAESKey = privateKey.decrypt(
//           forge.util.decode64(encryptedKeyBase64),
//           "RSA-OAEP"
//         );

//         // ✅ STEP 3: encrypt for new user
//         const newEncryptedKey = targetPublicKey.encrypt(
//           decryptedAESKey,
//           "RSA-OAEP"
//         );

//         // ✅ STEP 4: send to backend
//         await axios.post(API_URL + "/api/share-file-key", {
//           fileId: file._id,
//           targetUserId,
//           encryptedKey: forge.util.encode64(newEncryptedKey)
//         });

//       } catch (fileErr) {
//         console.error("Error sharing file key:", file._id, fileErr);
//       }
//     }

//     console.log("✅ Keys shared securely");

//   } catch (err) {
//     console.error("KEY SHARE ERROR:", err);
//   }
// };
// const downloadAndDecryptFile = async (file) => {
//   try {
//     const userId = localStorage.getItem("userId");
//     const privateKeyPem = localStorage.getItem("privateKey");

//     if (!privateKeyPem) {
//       alert("Private key missing");
//       return;
//     }

//     const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);

//     // ✅ 1. Get encrypted file + encrypted AES key
//     const res = await axios.get(
//       `${API_URL}/api/file/${file._id}?userId=${userId}`
//     );

//     const { file: base64File, encryptedKey, fileName } = res.data;

//     // ✅ 2. Decrypt AES key using RSA
//     const aesKey = privateKey.decrypt(
//       forge.util.decode64(encryptedKey),
//       "RSA-OAEP"
//     );

//     // ✅ 3. Convert file from base64 → bytes
//     const fileBytes = forge.util.decode64(base64File);

//     // Convert to Uint8Array
//     const buffer = new Uint8Array(
//       fileBytes.split("").map(c => c.charCodeAt(0))
//     );

//     // ✅ 4. Extract IV (12 bytes), TAG (16 bytes), DATA
//     const iv = buffer.slice(0, 12);
//     const tag = buffer.slice(12, 28);
//     const encryptedData = buffer.slice(28);

//     // ✅ 5. AES-GCM decrypt using Web Crypto API
//     const cryptoKey = await window.crypto.subtle.importKey(
//       "raw",
//       new Uint8Array(
//         aesKey.split("").map(c => c.charCodeAt(0))
//       ),
//       { name: "AES-GCM" },
//       false,
//       ["decrypt"]
//     );

//     const decrypted = await window.crypto.subtle.decrypt(
//       {
//         name: "AES-GCM",
//         iv: iv,
//         tagLength: 128
//       },
//       cryptoKey,
//       new Uint8Array([...encryptedData, ...tag])
//     );

//     // ✅ 6. Convert to Blob and download
//     const blob = new Blob([decrypted]);

//     const link = document.createElement("a");
//     link.href = URL.createObjectURL(blob);
//     link.download = fileName;
//     link.click();

//   } catch (err) {
//     console.error("DOWNLOAD + DECRYPT ERROR:", err);
//     alert("Failed to decrypt file");
//   }
// };

// export default function VaultPage() {
//   const id = window.location.pathname.split("/")[2];

//   const [vault, setVault] = useState(null);
//   const [view, setView] = useState("grid");
//   const [hovered, setHovered] = useState(null);
//   const [search, setSearch] = useState("");

//   const [showInvite, setShowInvite] = useState(false);
//   const [inviteEmail, setInviteEmail] = useState("");
//   const [inviteRole, setInviteRole] = useState("Viewer");

//   const fileInputRef = useRef(null);
//   const userId = localStorage.getItem("userId");

//   // ================= FETCH =================
//   const fetchVault = async () => {
//     try {
//       const res = await axios.get(
//         `${API_URL}/api/vault/${id}`
//       );
//       setVault(res.data);
//     } catch (err) {
//       console.error("Fetch error:", err);
//     }
//   };

//   useEffect(() => {
//     fetchVault();

//     const interval = setInterval(() => {
//       fetchVault();
//     }, 4000);

//     return () => clearInterval(interval);
//   }, [id]);

//   // ================= ROLE =================
//   const getUserRole = () => {
//     if (!vault) return null;

//     if (vault.userId === userId) return "Owner";

//     const member = vault.members?.find(
//       (m) => m.userId === userId
//     );

//     return member?.role || "Viewer";
//   };

//   const role = getUserRole();

//   const canUpload = ["Owner", "Admin", "Editor", "Developer"].includes(role);
//   const canInvite = ["Owner", "Admin"].includes(role);

//   // ================= INVITE =================
//   // const inviteUser = async () => {
//   //   try {
//   //     if (!inviteEmail.trim()) return alert("Enter email");

//   //     await axios.post(API_URL + "/api/share-vault", {
//   //       vaultId: id,
//   //       email: inviteEmail,
//   //       role: inviteRole,
//   //       addedBy: userId
//   //     });

//   //     alert("✅ Member added");

//   //     setInviteEmail("");
//   //     setInviteRole("Viewer");
//   //     setShowInvite(false);

//   //     fetchVault();
//   //   } catch (err) {
//   //     alert(err.response?.data?.message || "Invite failed");
//   //   }
//   // };
//   const inviteUser = async () => {
//     try {
//       if (!inviteEmail.trim()) return alert("Enter email");

//       // 🔹 1. share vault
//       const res = await axios.post(
//         API_URL + "/api/share-vault",
//         {
//           vaultId: id,
//           email: inviteEmail,
//           role: inviteRole,
//           addedBy: userId
//         }
//       );

//       alert("✅ Member added");

//       // 🔹 2. get new userId (IMPORTANT)
//       const userRes = await axios.get(
//         `${API_URL}/api/user-by-email/${inviteEmail}`
//       );

//       const newUserId = userRes.data._id;

//       // 🔥 3. ZERO KNOWLEDGE KEY SHARE
//       await shareKeysWithUser(vault, newUserId);

//       setInviteEmail("");
//       setInviteRole("Viewer");
//       setShowInvite(false);

//       fetchVault();

//     } catch (err) {
//       alert(err.response?.data?.message || "Invite failed");
//     }
//   };

//   // ================= FILE ICON =================
//   const getFileIcon = (name) => {
//     const ext = name?.split(".").pop()?.toLowerCase();

//     if (["png", "jpg", "jpeg", "gif"].includes(ext)) return "🖼️";
//     if (["mp4", "mov"].includes(ext)) return "🎬";
//     if (["pdf"].includes(ext)) return "📄";
//     if (["zip", "rar"].includes(ext)) return "🗜️";
//     if (["txt"].includes(ext)) return "📃";

//     return "📁";
//   };

//   // ================= SIZE =================
//   const formatSize = (bytes = 0) => {
//     if (bytes < 1024 * 1024)
//       return (bytes / 1024).toFixed(1) + " KB";

//     if (bytes < 1024 * 1024 * 1024)
//       return (bytes / 1024 / 1024).toFixed(1) + " MB";

//     return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
//   };

//   // ================= UPLOAD =================
//   const uploadFile = async (file) => {
//     if (!file || !canUpload) return;

//     try {
//       const formData = new FormData();
//       formData.append("file", file);
//       formData.append("vaultId", id);
//       formData.append("userId", userId);

//       await axios.post(
//         API_URL + "/api/upload-file",
//         formData
//       );

//       fetchVault();
//     } catch (err) {
//       console.error("Upload error:", err);
//     }
//   };

//   if (!vault)
//     return <div className="text-white p-10">Loading...</div>;
//   const filteredFiles = vault.files?.filter((f) =>
//     f.name.toLowerCase().includes(search.toLowerCase().trim())
//   );

//   return (
//     <div className="h-screen bg-[#02030a] text-white flex flex-col">

//       {/* HEADER */}
//       <div className="flex justify-between items-center px-6 py-4 border-b border-white/10">
//         <div>
//           <h1 className="text-xl font-semibold">{vault.name}</h1>
//           <p className="text-xs text-gray-400">
//             🔒 End-to-End Encrypted • {vault.members?.length || 0} Members •{" "}
//             {formatSize(vault.storageUsed)}
//           </p>
//         </div>

//         <div className="flex items-center gap-3">
//           {/* Members */}
//           <div className="flex -space-x-2">
//             {vault.members?.slice(0, 5).map((m, i) => (
//               <img
//                 key={i}
//                 src={m.avatar}
//                 alt="user"
//                 className="w-7 h-7 rounded-full border border-black"
//               />
//             ))}
//           </div>

//           {/* Invite */}
//           <button
//             disabled={!canInvite}
//             onClick={() => setShowInvite(true)}
//             className={`flex items-center gap-2 px-4 py-2 rounded border ${canInvite
//               ? "bg-white/5 border-white/10 hover:bg-white/10"
//               : "bg-gray-700 border-gray-600 cursor-not-allowed opacity-50"
//               }`}
//           >
//             <Users size={16} />
//             Invite
//           </button>

//           <button className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded border border-white/10">
//             <Share2 size={16} />
//             Share
//           </button>

//           <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 rounded">
//             <Phone size={16} />
//             Start Call
//           </button>
//           {/* User Avatar */}
//           {memberDetailsMap[userId]?.profilePicture ? (
//             <img src={memberDetailsMap[userId].profilePicture} alt="avatar" className="w-8 h-8 rounded-full border border-white/20 object-cover" />
//           ) : (
//             <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-white">
//               {memberDetailsMap[userId]?.name?.substring(0,2).toUpperCase() || 'U'}
//             </div>
//           )}
//         </div>
//       </div>

//       {/* TOOLBAR */}
//       <div className="px-6 py-4 flex justify-between">
//         <input
//           placeholder="Search within folder..."
//           value={search}
//           onChange={(e) => setSearch(e.target.value)}
//           className="bg-[#0b0f1a] text-white px-4 py-2 rounded border border-white/10 w-[300px] outline-none placeholder-gray-500 focus:border-purple-500"
//         />

//         <div className="flex gap-3 items-center">
//           <Grid
//             size={18}
//             onClick={() => setView("grid")}
//             className={`cursor-pointer ${view === "grid" && "text-purple-400"
//               }`}
//           />

//           <List
//             size={18}
//             onClick={() => setView("list")}
//             className={`cursor-pointer ${view === "list" && "text-purple-400"
//               }`}
//           />

//           <button
//             disabled={!canUpload}
//             onClick={() => fileInputRef.current?.click()}
//             className={`px-4 py-2 rounded ${canUpload ? "bg-blue-600" : "bg-gray-600"
//               }`}
//           >
//             Upload
//           </button>
//         </div>
//       </div>

//       {/* FILES */}
//       {/* <div className="flex-1 px-6 overflow-y-auto">
//         {view === "grid" ? (
//           <div className="grid grid-cols-4 gap-4">
//             {vault.files?.map((f, i) => (
//               <div
//               key={i}
//               onMouseEnter={() => setHovered(i)}
//               onMouseLeave={() => setHovered(null)}
//               onClick={() => downloadAndDecryptFile(f)} // ✅ ADD THIS
//               className="bg-[#06080f] p-4 rounded-xl border border-white/10 relative cursor-pointer hover:bg-[#0b0f1a]"
//             >
//               {hovered === i && (
//                 <div className="absolute top-2 right-2 cursor-pointer">
//                   <MoreVertical size={16} />
//                 </div>
//               )}
            
//               <div className="text-3xl mb-2 text-center">
//                 {getFileIcon(f.name)}
//               </div>
            
//               <p className="text-sm truncate">{f.name}</p>
            
//               <p className="text-xs text-gray-400">
//                 {formatSize(f.size)}
//               </p>
            
//               <p className="text-xs text-blue-400 mt-1">
//                 ENCRYPTED
//               </p>
//             </div>
//               // <div
//               //   key={i}
//               //   onMouseEnter={() => setHovered(i)}
//               //   onMouseLeave={() => setHovered(null)}
//               //   className="bg-[#06080f] p-4 rounded-xl border border-white/10 relative"
//               // >
//               //   {hovered === i && (
//               //     <div className="absolute top-2 right-2 cursor-pointer">
//               //       <MoreVertical size={16} />
//               //     </div>
//               //   )}

//               //   <div className="text-3xl mb-2 text-center">
//               //     {getFileIcon(f.name)}
//               //   </div>

//               //   <p className="text-sm truncate">{f.name}</p>

//               //   <p className="text-xs text-gray-400">
//               //     {formatSize(f.size)}
//               //   </p>

//               //   <p className="text-xs text-blue-400 mt-1">
//               //     ENCRYPTED
//               //   </p>
//               // </div>
//             ))}
//           </div>
//         ) : (
//           <div>
//             {vault.files?.map((f, i) => (
//               // <div
//               //   key={i}
//               //   className="flex justify-between items-center bg-[#06080f] p-3 mb-2 rounded border border-white/10"
//               // >
//               //   <div className="flex gap-3 items-center">
//               //     <span className="text-xl">
//               //       {getFileIcon(f.name)}
//               //     </span>
//               //     <span>{f.name}</span>
//               //   </div>

//               //   <span className="text-xs text-gray-400">
//               //     {formatSize(f.size)}
//               //   </span>
//               // </div>
//               <div
//   key={i}
//   onClick={() => downloadAndDecryptFile(f)} // ✅ ADD THIS
//   className="flex justify-between items-center bg-[#06080f] p-3 mb-2 rounded border border-white/10 cursor-pointer hover:bg-[#0b0f1a]"
// >
//   <div className="flex gap-3 items-center">
//     <span className="text-xl">
//       {getFileIcon(f.name)}
//     </span>
//     <span>{f.name}</span>
//   </div>

//   <span className="text-xs text-gray-400">
//     {formatSize(f.size)}
//   </span>
// </div>
//             ))}
//           </div>
//         )}
//       </div> */}
//       {/* FILES */}
//       {/* FILES */}
//       <div className="flex-1 px-6 overflow-y-auto">
//         {view === "grid" ? (
//           <div className="grid grid-cols-4 gap-4">

//             {/* ✅ EMPTY STATE (STEP 5) */}
//             {filteredFiles?.length === 0 && (
//               <p className="text-gray-400 text-sm mt-4 col-span-4 text-center">
//                 No files found
//               </p>
//             )}

//             {filteredFiles?.map((f, i) => (
//               <div
//                 key={i}
//                 onMouseEnter={() => setHovered(i)}
//                 onMouseLeave={() => setHovered(null)}
//                 onClick={() => downloadAndDecryptFile(f)}
//                 className="bg-[#06080f] p-4 rounded-xl border border-white/10 relative cursor-pointer hover:bg-[#0b0f1a]"
//               >
//                 {hovered === i && (
//                   <div className="absolute top-2 right-2 cursor-pointer">
//                     <MoreVertical size={16} />
//                   </div>
//                 )}

//                 <div className="text-3xl mb-2 text-center">
//                   {getFileIcon(f.name)}
//                 </div>

//                 <p className="text-sm truncate">{f.name}</p>

//                 <p className="text-xs text-gray-400">
//                   {formatSize(f.size)}
//                 </p>

//                 <p className="text-xs text-blue-400 mt-1">
//                   ENCRYPTED
//                 </p>
//               </div>
//             ))}
//           </div>
//         ) : (
//           <div>

//             {/* ✅ EMPTY STATE (STEP 5) */}
//             {filteredFiles?.length === 0 && (
//               <p className="text-gray-400 text-sm mt-4 text-center">
//                 No files found
//               </p>
//             )}

//             {filteredFiles?.map((f, i) => (
//               <div
//                 key={i}
//                 onClick={() => downloadAndDecryptFile(f)}
//                 className="flex justify-between items-center bg-[#06080f] p-3 mb-2 rounded border border-white/10 cursor-pointer hover:bg-[#0b0f1a]"
//               >
//                 <div className="flex gap-3 items-center">
//                   <span className="text-xl">
//                     {getFileIcon(f.name)}
//                   </span>
//                   <span>{f.name}</span>
//                 </div>

//                 <span className="text-xs text-gray-400">
//                   {formatSize(f.size)}
//                 </span>
//               </div>
//             ))}
//           </div>
//         )}
//       </div>

//       {/* INVITE MODAL */}
//       {showInvite && (
//         <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
//           <div className="bg-[#0b0f1a] w-[420px] p-6 rounded-2xl border border-white/10">
//             <div className="flex justify-between mb-4">
//               <h2 className="text-lg font-semibold">Invite Member</h2>
//               <X
//                 onClick={() => setShowInvite(false)}
//                 className="cursor-pointer"
//               />
//             </div>

//             <input
//               placeholder="Enter email"
//               className="w-full p-3 mb-3 bg-[#111] rounded border border-white/10"
//               value={inviteEmail}
//               onChange={(e) => setInviteEmail(e.target.value)}
//             />

//             <select
//               className="w-full p-3 mb-4 bg-[#111] rounded border border-white/10"
//               value={inviteRole}
//               onChange={(e) => setInviteRole(e.target.value)}
//             >
//               <option>Viewer</option>
//               <option>Editor</option>
//               <option>Admin</option>
//               <option>Developer</option>
//               <option>Security Auditor</option>
//             </select>

//             <button
//               onClick={inviteUser}
//               className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded"
//             >
//               Send Invite
//             </button>
//           </div>
//         </div>
//       )}

//       <input
//         type="file"
//         ref={fileInputRef}
//         className="hidden"
//         onChange={(e) => uploadFile(e.target.files[0])}
//       />
//     </div>
//   );
// }












import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import forge from "node-forge";
import { io } from "socket.io-client";
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import * as Diff from 'diff';
import VaultChat from "./VaultChat";
import TeamCall from "./TeamCall";
import VaultEditor from "../components/VaultEditor";

const socket = io(import.meta.env.VITE_API_URL || "http://localhost:5000");

import {
  Users as UsersIcon,
  Share2 as ShareIcon,
  Phone as PhoneIcon,
  Grid as GridIcon,
  List as ListIcon,
  MoreVertical as MoreIcon,
  X as XIcon,
  MessageSquare as MessageIcon,
  Lock as LockIcon
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// ================= ZERO KNOWLEDGE SHARE =================
const shareKeysWithUser = async (vault, targetUserId) => {
  try {
    const myPrivateKeyPem = localStorage.getItem("privateKey");
    const myUserId = localStorage.getItem("userId");

    if (!myPrivateKeyPem) {
      alert("Private key missing");
      return;
    }

    const privateKey = forge.pki.privateKeyFromPem(myPrivateKeyPem);

    // 🔹 get target public key
    const res = await axios.get(
      `${API_URL}/api/user/${targetUserId}`
    );

    const targetPublicKey = forge.pki.publicKeyFromPem(res.data.publicKey);

    for (let file of vault.files) {
      try {
        // ✅ STEP 1: get YOUR encrypted AES key
        const keyRes = await axios.get(
          `${API_URL}/api/file/${file._id}?userId=${myUserId}`
        );

        const encryptedKeyBase64 = keyRes.data.encryptedKey;

        if (!encryptedKeyBase64) continue;

        // ✅ STEP 2: decrypt AES key (YOUR PRIVATE KEY)
        const decryptedAESKey = privateKey.decrypt(
          forge.util.decode64(encryptedKeyBase64),
          "RSA-OAEP"
        );

        // ✅ STEP 3: encrypt for new user
        const newEncryptedKey = targetPublicKey.encrypt(
          decryptedAESKey,
          "RSA-OAEP"
        );

        // ✅ STEP 4: send to backend
        await axios.post(API_URL + "/api/share-file-key", {
          fileId: file._id,
          targetUserId,
          encryptedKey: forge.util.encode64(newEncryptedKey)
        });

      } catch (fileErr) {
        console.error("Error sharing file key:", file._id, fileErr);
      }
    }

    // 🔥 SHARE VAULT CHAT KEY
    try {
      const chatKeyRes = await axios.post(`${API_URL}/api/vault/${vault._id}/chat/key`, { userId: myUserId });
      if (chatKeyRes.data.encryptedChatKey) {
        // Decrypt the chat AES key
        const decryptedChatKey = privateKey.decrypt(
          forge.util.decode64(chatKeyRes.data.encryptedChatKey),
          "RSA-OAEP"
        );
        // Encrypt with target's public key
        const targetEncryptedChatKey = forge.util.encode64(
          targetPublicKey.encrypt(decryptedChatKey, "RSA-OAEP")
        );
        
        await axios.post(`${API_URL}/api/vault/${vault._id}/chat/share`, {
          targetUserId,
          encryptedChatKey: targetEncryptedChatKey
        });
        console.log("Shared chat key successfully");
      }
    } catch (err) {
      console.error("Failed to share chat key", err);
    }

    console.log("✅ Keys shared securely");

  } catch (err) {
    console.error("KEY SHARE ERROR:", err);
  }
};

export default function VaultPage() {
  const id = window.location.pathname.split("/")[2];

  const [vault, setVault] = useState(null);
  const [view, setView] = useState("grid");
  const [hovered, setHovered] = useState(null);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("files");
  const [logs, setLogs] = useState([]);

  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("Viewer");
  const [sortOption, setSortOption] = useState("date-desc");
  const [memberDetailsMap, setMemberDetailsMap] = useState({});
  const [meetings, setMeetings] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newMeetingTitle, setNewMeetingTitle] = useState("");
  const [newMeetingTime, setNewMeetingTime] = useState("");
  const [incomingCall, setIncomingCall] = useState(null);
  
  const [globalUnread, setGlobalUnread] = useState(0);
  const [toastMessage, setToastMessage] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const fileInputRef = useRef(null);
  const userId = localStorage.getItem("userId");

  const [editingFile, setEditingFile] = useState(null);
  const [editorContent, setEditorContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [aesKeyForEdit, setAesKeyForEdit] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (activeTab === "members" && vault?.members) {
      const fetchMemberDetails = async () => {
        const map = { ...memberDetailsMap };
        for (let m of vault.members) {
          if (!map[m.userId]) {
            try {
              const res = await axios.get(`${API_URL}/api/user/${m.userId}`);
              map[m.userId] = { name: res.data.name, profilePicture: res.data.profilePicture || "" };
            } catch(e) {
              map[m.userId] = { name: m.userId.substring(0,6) };
            }
          }
        }
        setMemberDetailsMap(map);
      };
      fetchMemberDetails();
    }
  }, [activeTab, vault?.members]);

  const fetchMeetings = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/vault/${id}/meetings`);
      setMeetings(res.data);
    } catch (err) {
      console.error("Failed to fetch meetings", err);
    }
  };

  useEffect(() => {
    if (activeTab === "calls") {
      fetchMeetings();
    }
  }, [activeTab]);

  useEffect(() => {
    socket.emit("user_connected", userId);
    
    // Listen for incoming call alerts - show if caller is not self
    const handleIncomingCall = (data) => {
      if (data.callerId !== userId) {
        setIncomingCall(data);
        setTimeout(() => setIncomingCall(null), 20000);
      }
    };

    const handleMeetingScheduled = (data) => {
      if (data.vaultId === id) {
        fetchMeetings();
      }
    };

    socket.on("incoming_call_alert", handleIncomingCall);
    socket.on("meeting_scheduled", handleMeetingScheduled);

    return () => {
      socket.off("incoming_call_alert", handleIncomingCall);
      socket.off("meeting_scheduled", handleMeetingScheduled);
    };
  }, [id, userId]);

  const scheduleMeeting = async () => {
    if (!newMeetingTitle.trim() || !newMeetingTime) {
      setToastMessage({ title: "Error", body: "Please enter a title and select a time" });
      setTimeout(() => setToastMessage(null), 3000);
      return;
    }
    try {
      // Convert datetime-local value to proper ISO string
      const isoTime = new Date(newMeetingTime).toISOString();
      await axios.post(`${API_URL}/api/vault/${id}/meetings`, {
        title: newMeetingTitle.trim(),
        startTime: isoTime,
        scheduledBy: userId
      });
      setShowScheduleModal(false);
      setNewMeetingTitle("");
      setNewMeetingTime("");
      fetchMeetings();
      setToastMessage({ title: "✅ Meeting Scheduled", body: `"${newMeetingTitle.trim()}" has been saved.` });
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err) {
      console.error("Schedule error:", err);
      setToastMessage({ title: "❌ Failed", body: err.response?.data?.message || "Could not schedule meeting" });
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  const startInstantCall = () => {
    // Get latest name from profile or localStorage
    const myName = profile?.name || localStorage.getItem("userName") || "A teammate";
    
    socket.emit("start_call", {
      vaultId: id,
      vaultName: vault?.name || "Secure Vault",
      callerId: userId,
      callerName: myName
    });
    setActiveTab("in-call");
  };

  // ================= FILE CLICK (DECRYPT / EDIT) =================
  const handleFileClick = async (file) => {
    try {
      const privateKeyPem = localStorage.getItem("privateKey");
      if (!privateKeyPem) return alert("Private key missing");
      
      const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
      
      const isTextFile = file.name.endsWith(".txt") || file.name.endsWith(".html") || file.name.endsWith(".doc");
      const actionParam = isTextFile ? "view" : "download";
      
      const res = await axios.get(`${API_URL}/api/file/${file._id}?userId=${userId}&action=${actionParam}`);
      const { file: base64File, encryptedKey, fileName } = res.data;

      // ✅ 2. Decrypt AES key using RSA (with fallback)
      let aesKey;
      try {
        aesKey = privateKey.decrypt(forge.util.decode64(encryptedKey), "RSA-OAEP");
      } catch (e) {
        console.warn("Standard RSA decryption failed, trying fallback...");
        aesKey = privateKey.decrypt(forge.util.decode64(encryptedKey), "RSA-OAEP", {
          md: forge.md.sha1.create(),
          mgf1: {
            md: forge.md.sha1.create()
          }
        });
      }

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

      const combined = new Uint8Array(encryptedData.length + tag.length);
      combined.set(encryptedData);
      combined.set(tag, encryptedData.length);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv, tagLength: 128 },
        cryptoKey,
        combined
      );


      if (isTextFile) {
        const text = new TextDecoder().decode(decrypted);
        setEditingFile(file);
        setOriginalContent(text);
        setEditorContent(text);
        setAesKeyForEdit(aesKey);
        setShowHistory(false);
      } else {
        const blob = new Blob([decrypted]);
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
      }
    } catch (err) {
      console.error("DECRYPT ERROR:", err);
      alert("Failed to decrypt file");
    }
  };

  const saveFileEdits = async () => {
    if (!editingFile || !aesKeyForEdit) return;
    setIsSaving(true);
    try {
      // 1. Generate Diff
      const oldText = originalContent.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
      const newText = editorContent.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();
      
      const diffs = Diff.diffWords(oldText, newText);
      let diffSummaryLines = [];
      diffs.forEach((part) => {
        if (part.added && part.value.trim().length > 2) diffSummaryLines.push(`Added: "${part.value.trim()}"`);
        if (part.removed && part.value.trim().length > 2) diffSummaryLines.push(`Removed: "${part.value.trim()}"`);
      });
      const diffSummary = diffSummaryLines.join(" | ").substring(0, 500) || "Minor formatting changes";

      // 2. Encrypt
      const encoder = new TextEncoder();
      const encodedText = encoder.encode(editorContent);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        new Uint8Array(aesKeyForEdit.split("").map(c => c.charCodeAt(0))),
        { name: "AES-GCM" },
        false,
        ["encrypt"]
      );
      
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv, tagLength: 128 },
        cryptoKey,
        encodedText
      );
      
      const encryptedData = new Uint8Array(encryptedBuffer);
      const tag = encryptedData.slice(-16);
      const ciphertext = encryptedData.slice(0, -16);
      
      const finalBuffer = new Uint8Array(12 + 16 + ciphertext.length);
      finalBuffer.set(iv, 0);
      finalBuffer.set(tag, 12);
      finalBuffer.set(ciphertext, 28);
      
      const blob = new Blob([finalBuffer]);
      const formData = new FormData();
      formData.append("file", blob, editingFile.name);
      formData.append("vaultId", id);
      formData.append("userId", userId);
      formData.append("fileId", editingFile._id);
      formData.append("diffSummary", diffSummary);

      await axios.post(API_URL + "/api/update-file", formData);
      
      setEditingFile(null);
      fetchVault();
      fetchLogs();
      alert("Changes saved securely!");
    } catch (err) {
      console.error(err);
      alert("Failed to save changes");
    }
    setIsSaving(false);
  };

  const restoreVersion = async (versionIdx) => {
    if (!editingFile) return;
    try {
      await axios.post(`${API_URL}/api/file/${editingFile._id}/restore`, {
        vaultId: id,
        userId,
        versionIdx
      });
      alert("Version restored successfully!");
      setEditingFile(null);
      fetchVault();
      fetchLogs();
    } catch (err) {
      alert("Failed to restore version");
    }
  };

  // ================= FETCH =================
  const fetchVault = async () => {
    try {
      const res = await axios.get(
        `${API_URL}/api/vault/${id}`
      );
      console.log("VAULT DATA:", res.data); // DEBUG PIN
      setVault(res.data);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  };

  useEffect(() => {
    fetchVault();

    const interval = setInterval(() => {
      fetchVault();
    }, 4000);

    return () => clearInterval(interval);
  }, [id]);

  const fetchLogs = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/vault/${id}/logs?userId=${userId}`);
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === "activity") {
      fetchLogs();
    }
  }, [activeTab]);

  // ================= ROLE =================
  const getUserRole = () => {
    if (!vault) return null;

    if (vault.userId === userId) return "Owner";

    const member = vault.members?.find(
      (m) => m.userId === userId
    );

    return member?.role || "Viewer";
  };

  const role = getUserRole();

  const canUpload = ["Owner", "Admin", "Editor", "Developer"].includes(role);
  const canInvite = ["Owner", "Admin"].includes(role);

  // ================= INVITE =================
  const inviteUser = async () => {
    try {
      if (!inviteEmail.trim()) return alert("Enter email");

      // 🔹 1. share vault
      const res = await axios.post(
        API_URL + "/api/share-vault",
        {
          vaultId: id,
          email: inviteEmail,
          role: inviteRole,
          addedBy: userId
        }
      );

      alert("✅ Member added");

      // 🔹 2. get new userId (IMPORTANT)
      const userRes = await axios.get(
        `${API_URL}/api/user-by-email/${inviteEmail}`
      );

      const newUserId = userRes.data._id;

      // 🔥 3. ZERO KNOWLEDGE KEY SHARE
      await shareKeysWithUser(vault, newUserId);

      setInviteEmail("");
      setInviteRole("Viewer");
      setShowInvite(false);

      fetchVault();

    } catch (err) {
      alert(err.response?.data?.message || "Invite failed");
    }
  };

  // ================= FILE ICON =================
  const getFileIcon = (name) => {
    const ext = name?.split(".").pop()?.toLowerCase();

    if (["png", "jpg", "jpeg", "gif"].includes(ext)) return "🖼️";
    if (["mp4", "mov"].includes(ext)) return "🎬";
    if (["pdf"].includes(ext)) return "📄";
    if (["zip", "rar"].includes(ext)) return "🗜️";
    if (["txt"].includes(ext)) return "📃";

    return "📁";
  };

  // ================= SIZE =================
  const formatSize = (bytes = 0) => {
    if (bytes < 1024 * 1024)
      return (bytes / 1024).toFixed(1) + " KB";

    if (bytes < 1024 * 1024 * 1024)
      return (bytes / 1024 / 1024).toFixed(1) + " MB";

    return (bytes / 1024 / 1024 / 1024).toFixed(1) + " GB";
  };

  // ================= UPLOAD =================
  const uploadFile = async (file) => {
    if (!file || !canUpload) return;

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("vaultId", id);
      formData.append("userId", userId);

      await axios.post(
        API_URL + "/api/upload-file",
        formData
      );

      fetchVault();
    } catch (err) {
      console.error("Upload error:", err);
    }
  };

  if (!vault)
    return <div className="text-white p-10 flex h-screen items-center justify-center bg-[#02030a]"><div className="animate-pulse">Loading Secure Vault...</div></div>;

  if (vault.pin && !isUnlocked) {
    return (
      <div className="flex h-screen bg-[#02030a] items-center justify-center p-6 font-sans">
        <div className="bg-[#0b0f1a] p-10 rounded-[2.5rem] border border-white/5 w-full max-w-sm text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-amber-500 to-blue-600" />
          <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8 transition-transform hover:scale-110">
            <LockIcon size={40} className="text-amber-500" />
          </div>
          <h2 className="text-3xl font-black mb-3 tracking-tight">Protected</h2>
          <p className="text-gray-500 text-sm mb-10 leading-relaxed font-medium">Enter the 4-digit PIN to access this secure environment.</p>
          
          <div className="flex justify-center gap-4 mb-10">
            <input 
              type="password"
              maxLength={4}
              className={`w-40 text-center text-4xl font-black tracking-[0.6em] bg-white/5 border ${pinError ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'} rounded-2xl p-5 outline-none focus:border-blue-500/50 transition-all shadow-inner`}
              value={pinInput}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setPinInput(val);
                setPinError(false);
                if (val === vault.pin) {
                  setIsUnlocked(true);
                } else if (val.length === 4) {
                  setPinError(true);
                  setTimeout(() => setPinInput(""), 500);
                }
              }}
              autoFocus
            />
          </div>
          {pinError && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest mb-6 animate-bounce">Access Denied</p>}
          <button 
            onClick={() => window.history.back()}
            className="text-gray-600 hover:text-white transition text-[10px] font-black uppercase tracking-[0.2em] border border-white/5 px-6 py-2 rounded-full hover:bg-white/5"
          >
            Terminal Back
          </button>
        </div>
      </div>
    );
  }

  let filteredFiles = vault.files?.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase().trim())
  ) || [];

  if (sortOption === "name-asc") filteredFiles.sort((a,b) => a.name.localeCompare(b.name));
  if (sortOption === "name-desc") filteredFiles.sort((a,b) => b.name.localeCompare(a.name));
  if (sortOption === "size-asc") filteredFiles.sort((a,b) => a.size - b.size);
  if (sortOption === "size-desc") filteredFiles.sort((a,b) => a.size - b.size);
  if (sortOption === "date-asc") filteredFiles.sort((a,b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  if (sortOption === "date-desc") filteredFiles.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

return (
  <div className="h-screen bg-[#02030a] text-white flex flex-col">

    {/* ================= TOP NAV ================= */}
    <div className="h-[60px] border-b border-white/10 flex items-center justify-between px-6 bg-[#03050c]">

      <input
        placeholder="Search files, vaults, members..."
        className="bg-[#0b0f1a] px-4 py-2 rounded w-[400px] border border-white/10"
      />

      <div className="flex items-center gap-4">
        <div className="w-8 h-8 rounded-full bg-gray-600" />
      </div>
    </div>

    {/* ================= MAIN (NO SIDEBAR) ================= */}
    <div className="flex-1 flex flex-col">

      {/* ===== VAULT HEADER ===== */}
      <div className="px-6 py-4 border-b border-white/10">

        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-5xl font-semibold">{vault.name}</h1>
            <p className="text-xs text-gray-400">
              🔒 End-to-End Encrypted • {vault.members?.length} Members • {formatSize(vault.storageUsed)}
            </p>
          </div>

          <div className="flex gap-3">

            {/* ✅ KEEP ROLE BASED */}
            <button
              disabled={!canInvite}
              onClick={() => setShowInvite(true)}
              className={`px-3 py-1 rounded border ${
                canInvite
                  ? "bg-white/5 border-white/10 hover:bg-white/10"
                  : "bg-gray-700 border-gray-600 opacity-50 cursor-not-allowed"
              }`}
            >
              Invite
            </button>

            <button className="px-3 py-1 bg-white/5 border border-white/10 rounded">
              Share
            </button>

            <button onClick={() => setActiveTab("chat")} className="px-3 py-1 bg-purple-600 rounded">
              Chat
            </button>
          </div>
        </div>

        {/* ===== TABS ===== */}
        <div className="flex gap-6 mt-4 text-sm select-none">
          <span 
            onClick={() => setActiveTab("files")} 
            className={`cursor-pointer ${activeTab === "files" ? "text-blue-400 border-b border-blue-400 pb-1" : "text-gray-400"}`}>
            files
          </span>
          <span 
            onClick={() => setActiveTab("activity")} 
            className={`cursor-pointer ${activeTab === "activity" ? "text-blue-400 border-b border-blue-400 pb-1" : "text-gray-400"}`}>
            audit logs
          </span>
          <span 
            onClick={() => setActiveTab("members")} 
            className={`cursor-pointer ${activeTab === "members" ? "text-blue-400 border-b border-blue-400 pb-1" : "text-gray-400"}`}>
            members
          </span>
          <span 
            onClick={() => setActiveTab("chat")} 
            className={`cursor-pointer ${activeTab === "chat" ? "text-blue-400 border-b border-blue-400 pb-1" : "text-gray-400"} relative`}>
            chat
            {globalUnread > 0 && <span className="absolute -top-2 -right-4 bg-blue-500 text-white text-[9px] px-1.5 rounded-full font-bold">{globalUnread}</span>}
          </span>
          <span 
            onClick={() => setActiveTab("calls")} 
            className={`cursor-pointer ${activeTab === "calls" ? "text-blue-400 border-b border-blue-400 pb-1" : "text-gray-400"}`}>
            calls
          </span>
          <span 
            onClick={() => setActiveTab("development")} 
            className={`cursor-pointer ${activeTab === "development" ? "text-blue-400 border-b border-blue-400 pb-1" : "text-gray-400"}`}>
            development
          </span>
        </div>
      </div>

      {activeTab === "files" ? (
        <>
          {/* ===== TOOLBAR ===== */}
      <div className="px-6 py-4 flex justify-between items-center">

        <div className="text-gray-400 text-sm">
          Root / Assets / Q3_Designs
        </div>

        <div className="flex items-center gap-3">

          <input
            placeholder="Search within folder..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-[#0b0f1a] px-3 py-2 rounded border border-white/10"
          />

          <button className="px-3 py-2 bg-white/5 rounded border border-white/10">
            Filter
          </button>

          <select 
            value={sortOption} 
            onChange={(e) => setSortOption(e.target.value)}
            className="px-3 py-2 bg-[#0b0f1a] rounded border border-white/10 text-gray-300 outline-none text-sm"
          >
            <option value="date-desc">Sort: Date (Newest)</option>
            <option value="date-asc">Sort: Date (Oldest)</option>
            <option value="name-asc">Sort: Name (A-Z)</option>
            <option value="name-desc">Sort: Name (Z-A)</option>
            <option value="size-desc">Sort: Size (Largest)</option>
            <option value="size-asc">Sort: Size (Smallest)</option>
          </select>

          {/* ✅ KEEP ROLE BASED */}
          <button
            disabled={!canUpload}
            onClick={() => fileInputRef.current?.click()}
            className={`px-4 py-2 rounded ${
              canUpload ? "bg-blue-600" : "bg-gray-600 cursor-not-allowed"
            }`}
          >
            Upload
          </button>
        </div>
      </div>

      {/* ===== FILE GRID ===== */}
      <div className="flex-1 px-6 overflow-y-auto">

        <div className="grid grid-cols-4 gap-4">

          {filteredFiles?.length === 0 && (
            <p className="text-gray-400 col-span-4 text-center">
              No files found
            </p>
          )}

          {filteredFiles?.map((f, i) => (
            <div
              key={i}
              onClick={() => handleFileClick(f)}
              className="bg-[#06080f] p-5 rounded-xl border border-white/10 hover:bg-[#0b0f1a] cursor-pointer"
            >
              <div className="text-3xl text-center mb-3">
                {getFileIcon(f.name)}
              </div>

              <p className="text-sm text-center truncate">{f.name}</p>

              <p className="text-xs text-gray-400 text-center mt-1">
                {formatSize(f.size)}
              </p>

              <p className="text-xs text-blue-400 text-center mt-2">
                ENCRYPTED
              </p>
            </div>
          ))}
        </div>
      </div>
      </>
      ) : activeTab === "activity" ? (
        <div className="flex-1 px-6 py-6 overflow-y-auto">
          <h2 className="text-xl font-semibold mb-4 text-purple-400 flex items-center gap-2">
            <span className="text-2xl">🛡️</span> Security Audit Logs
          </h2>
          <div className="bg-[#0b0f1a] rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#111] border-b border-white/10">
                <tr>
                  <th className="p-4 font-semibold text-gray-300">Timestamp</th>
                  <th className="p-4 font-semibold text-gray-300">User</th>
                  <th className="p-4 font-semibold text-gray-300">Role</th>
                  <th className="p-4 font-semibold text-gray-300">Action</th>
                  <th className="p-4 font-semibold text-gray-300">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-4 text-center text-gray-500 py-10">
                      No logs found or access denied.
                    </td>
                  </tr>
                )}
                {logs.map((log, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="p-4 text-gray-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-white">{log.userName}</div>
                      <div className="text-gray-500 text-xs">{log.userEmail}</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        log.role === 'owner' ? 'bg-purple-500/20 text-purple-300' :
                        log.role === 'admin' ? 'bg-red-500/20 text-red-300' :
                        'bg-blue-500/20 text-blue-300'
                      }`}>
                        {log.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-mono ${
                        log.action.includes('DENIED') ? 'bg-red-500/20 text-red-400' :
                        log.action.includes('UPLOAD') ? 'bg-green-500/20 text-green-400' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-gray-300">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === "members" ? (
        <div className="flex-1 bg-[#0b0f1a] p-8 overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
             <h3 className="text-xl font-bold">Vault Members</h3>
             <button onClick={() => setShowInvite(true)} className="px-4 py-2 bg-blue-600 text-white rounded font-medium text-sm">
                + Invite Member
             </button>
          </div>
          
          <div className="bg-[#151a2a] rounded-xl border border-white/5 overflow-hidden">
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="border-b border-white/5 bg-white/5 text-gray-400 text-sm">
                   <th className="p-4 font-medium">User</th>
                   <th className="p-4 font-medium">Role</th>
                   <th className="p-4 font-medium">Joined Date</th>
                   <th className="p-4 font-medium">Status</th>
                 </tr>
               </thead>
               <tbody>
                 {vault.members.map((m, i) => (
                   <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                     <td className="p-4 flex items-center gap-3">
                        <img src={memberDetailsMap[m.userId]?.profilePicture || `https://i.pravatar.cc/40?u=${m.userId}`} alt="avatar" className="w-8 h-8 rounded-full border border-white/20 object-cover" />
                        <div>
                           <p className="font-semibold">{memberDetailsMap[m.userId]?.name || m.userId.substring(0,6)}</p>
                           <p className="text-xs text-gray-500 font-mono">{m.userId}</p>
                        </div>
                     </td>
                     <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${m.role === 'Owner' ? 'bg-purple-500/20 text-purple-400' : m.role === 'Editor' ? 'bg-blue-500/20 text-blue-400' : 'bg-gray-500/20 text-gray-300'}`}>
                           {m.role}
                        </span>
                     </td>
                     <td className="p-4 text-sm text-gray-400">
                        {m.joinedAt ? new Date(m.joinedAt).toLocaleString() : 'N/A'}
                     </td>
                     <td className="p-4">
                        <span className={`flex items-center gap-2 text-xs ${onlineUsers.includes(m.userId) ? 'text-green-400' : 'text-gray-500'}`}>
                           <span className={`w-2 h-2 rounded-full ${onlineUsers.includes(m.userId) ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                           {onlineUsers.includes(m.userId) ? 'Online' : 'Offline'}
                        </span>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        </div>
      ) : activeTab === "chat" ? (
        <div style={{ height: "calc(100vh - 130px)" }}>
          <VaultChat 
             vaultId={vault._id} 
             vault={vault} 
             setShowInvite={setShowInvite} 
             isActive={activeTab === "chat"} 
             onUnreadChange={setGlobalUnread}
             onOnlineUsersChange={setOnlineUsers}
             onNewToast={(msg) => {
                setToastMessage(msg);
                setTimeout(() => setToastMessage(null), 3000);
             }}
          />
        </div>
      ) : activeTab === "calls" ? (
        <div className="flex-1 flex flex-col p-6 bg-[#02030a]">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-bold">Secure Team Calls</h2>
              <p className="text-sm text-gray-500">Scheduled and instant end-to-end encrypted video sessions</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowScheduleModal(true)}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold transition-all flex items-center gap-2"
              >
                📅 Schedule Meeting
              </button>
              <button 
                onClick={startInstantCall}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
              >
                <span>+</span> Start Instant Call
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {meetings.map((m, idx) => (
              <div key={idx} className="p-6 bg-[#06080f] border border-white/5 rounded-2xl flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div className="p-3 bg-purple-500/10 rounded-xl text-purple-400">
                    <span className="text-xl">📅</span>
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">
                    {new Date(m.startTime) > new Date() ? "Scheduled" : "Started"}
                  </span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">{m.title}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(m.startTime).toLocaleString()} • Team Session
                  </p>
                </div>
                <button 
                  onClick={() => {
                    if (new Date(m.startTime) <= new Date()) {
                      setActiveTab("in-call");
                    } else {
                      alert("Reminder set! We'll notify you when it starts.");
                    }
                  }}
                  className={`w-full py-2 rounded-lg text-xs font-semibold transition-all ${
                    new Date(m.startTime) <= new Date() 
                    ? "bg-blue-600 hover:bg-blue-700" 
                    : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {new Date(m.startTime) <= new Date() ? "Join Meeting" : "Set Reminder"}
                </button>
              </div>
            ))}
            
            {meetings.length === 0 && (
              <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-[2rem]">
                 <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                    <span className="text-2xl text-gray-500">📞</span>
                 </div>
                 <p className="text-gray-500 font-medium">No meetings scheduled yet</p>
                 <button onClick={() => setShowScheduleModal(true)} className="mt-4 text-blue-400 text-sm font-bold hover:underline">Schedule your first meeting</button>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "in-call" ? (
        <TeamCall 
          vaultId={id} 
          vault={vault} 
          onLeave={() => setActiveTab("calls")} 
        />
      ) : activeTab === "development" ? (
        <div className="flex-1 bg-[#0b0f1a]">
          <VaultEditor 
            vaultId={vault._id} 
            vault={vault} 
            userId={userId}
            onRefresh={fetchVault}
          />
        </div>
      ) : null}
    </div>
    
    {/* ================= GLOBAL TOAST NOTIFICATION ================= */}
    {toastMessage && (
      <div className="fixed bottom-6 right-6 bg-[#1a233a] border border-blue-500/30 text-white p-4 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-fade-in-up">
         <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
            <MessageIcon size={16} className="text-blue-400" />
         </div>
         <div>
            <p className="text-xs text-gray-400 font-semibold">{toastMessage.title}</p>
            <p className="text-sm">{toastMessage.body}</p>
         </div>
      </div>
    )}

    {/* ================= INVITE MODAL ================= */}
    {showInvite && (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center">
        <div className="bg-[#0b0f1a] w-[420px] p-6 rounded-xl border border-white/10">
          <div className="flex justify-between mb-4">
            <h2 className="text-lg font-semibold">Invite Member</h2>
            <XIcon onClick={() => setShowInvite(false)} className="cursor-pointer text-gray-400 hover:text-white" />
          </div>

          <input
            placeholder="Enter email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            className="w-full p-3 mb-3 bg-[#111] rounded border border-white/10 outline-none focus:border-purple-500 transition-colors"
          />

          <select
            className="w-full p-3 mb-4 bg-[#111] rounded border border-white/10 outline-none focus:border-purple-500 transition-colors"
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
          >
            <option>Viewer</option>
            <option>Editor</option>
            <option>Developer</option>
            <option>Admin</option>
            <option>Security Auditor</option>
          </select>

          <button
            onClick={inviteUser}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 rounded font-semibold hover:opacity-90 transition-opacity"
          >
            Send Invite
          </button>
        </div>
      </div>
    )}

    <input
      type="file"
      ref={fileInputRef}
      className="hidden"
      onChange={(e) => uploadFile(e.target.files[0])}
    />
    
    {/* ================= RICH TEXT EDITOR MODAL ================= */}
    {editingFile && (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6">
        <div className="bg-[#0b0f1a] w-full max-w-5xl h-full flex flex-col rounded-xl border border-white/10 overflow-hidden relative">
          
          <div className="flex justify-between items-center px-6 py-4 border-b border-white/10 bg-[#06080f]">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                📝 {editingFile.name}
              </h2>
              <span className="text-xs text-green-400 font-mono">End-to-End Encrypted</span>
            </div>
            <div className="flex gap-4 items-center">
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="px-4 py-2 bg-white/5 rounded border border-white/10 hover:bg-white/10 transition-colors"
              >
                {showHistory ? "Back to Editor" : "Version History"}
              </button>
              <button 
                onClick={saveFileEdits}
                disabled={isSaving}
                className="px-6 py-2 bg-purple-600 rounded font-semibold hover:bg-purple-700 transition-colors"
              >
                {isSaving ? "Saving securely..." : "Save Changes"}
              </button>
              <XIcon 
                onClick={() => { setEditingFile(null); setEditorContent(""); setOriginalContent(""); setShowHistory(false); }} 
                className="cursor-pointer text-gray-400 hover:text-white ml-2" 
                size={24}
              />
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {!showHistory ? (
              <div className="flex-1 bg-white text-black overflow-y-auto">
                <ReactQuill 
                  theme="snow" 
                  value={editorContent} 
                  onChange={setEditorContent} 
                  className="h-full border-none"
                  modules={{
                    toolbar: [
                      [{ 'header': [1, 2, false] }],
                      ['bold', 'italic', 'underline','strike', 'blockquote'],
                      [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'indent': '+1'}],
                      ['link'],
                      ['clean']
                    ]
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 bg-[#0b0f1a] p-6 overflow-y-auto">
                <h3 className="text-lg font-semibold mb-6 border-b border-white/10 pb-2">Version History</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-purple-400">Current Active Version</p>
                        <p className="text-sm text-gray-400">Updated: {new Date(editingFile.createdAt || Date.now()).toLocaleString()}</p>
                        <p className="text-sm text-purple-300 mt-2 italic border-l-2 border-purple-500 pl-2">
                          {editingFile.lastDiffSummary || "Initial File Upload"}
                        </p>
                      </div>
                      <span className="text-xs bg-purple-600 px-2 py-1 rounded mt-1">Active</span>
                    </div>
                  </div>
                  
                  {editingFile.versions && [...editingFile.versions].reverse().map((v, i) => (
                    <div key={i} className="p-4 bg-white/5 border border-white/10 rounded">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">Version {v.version}</p>
                          <p className="text-sm text-gray-400">Updated: {new Date(v.createdAt).toLocaleString()}</p>
                          <p className="text-sm text-gray-300 mt-2 italic border-l-2 border-gray-600 pl-2">
                            {v.diffSummary || "Initial File Upload"}
                          </p>
                        </div>
                        <button 
                          onClick={() => restoreVersion(editingFile.versions.indexOf(v))}
                          className="px-4 py-2 bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/40 transition-colors text-sm mt-1"
                        >
                          Restore this version
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {(!editingFile.versions || editingFile.versions.length === 0) && (
                    <p className="text-gray-500 text-center py-10">No previous versions found.</p>
                  )}
                </div>
              </div>
            )}
          </div>
          
        </div>
      </div>
    )}

      {/* SCHEDULE MODAL */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-[#0b0f1a] w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-2xl">
            <h2 className="text-2xl font-bold mb-6">Schedule Team Meeting</h2>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Meeting Title</label>
                <input 
                  type="text" 
                  value={newMeetingTitle}
                  onChange={(e) => setNewMeetingTitle(e.target.value)}
                  placeholder="e.g. Quarterly Security Review"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-2">Start Time</label>
                <input 
                  type="datetime-local" 
                  value={newMeetingTime}
                  onChange={(e) => setNewMeetingTime(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-all text-white"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={scheduleMeeting}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold transition-all shadow-lg shadow-blue-600/20"
                >
                  Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INCOMING CALL TOAST */}
      {incomingCall && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md animate-bounce-in">
          <div className="bg-[#0b0f1a] border-2 border-blue-500/50 rounded-3xl p-6 shadow-[0_0_50px_rgba(37,99,235,0.3)] flex items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center animate-pulse">
               <PhoneIcon size={32} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-black text-blue-400 uppercase tracking-widest mb-1">Incoming Call</p>
              <h3 className="text-lg font-bold truncate">{incomingCall.callerName} started a call</h3>
              <p className="text-xs text-gray-500">in {incomingCall.vaultName}</p>
            </div>
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => { setActiveTab("in-call"); setIncomingCall(null); }}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-sm transition-all"
              >
                Join
              </button>
              <button 
                onClick={() => setIncomingCall(null)}
                className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm text-gray-400 transition-all"
              >
                Ignore
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// INCOMING CALL OVERLAY COMPONENT
function IncomingCallOverlay({ incomingCall, onJoin, onIgnore }) {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-md animate-bounce-in">
      <div className="bg-[#0b0f1a] border-2 border-blue-500/50 rounded-3xl p-6 shadow-[0_0_50px_rgba(37,99,235,0.3)] flex items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-[#2563eb] flex items-center justify-center animate-pulse">
           <PhoneIcon size={32} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-black text-blue-400 uppercase tracking-widest mb-1">Incoming Call</p>
          <h3 className="text-lg font-bold truncate">{incomingCall.callerName} started a call</h3>
          <p className="text-xs text-gray-500">in {incomingCall.vaultName}</p>
        </div>
        <div className="flex flex-col gap-2">
          <button 
            onClick={onJoin}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-sm transition-all"
          >
            Join
          </button>
          <button 
            onClick={onIgnore}
            className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-sm text-gray-400 transition-all"
          >
            Ignore
          </button>
        </div>
      </div>
    </div>
  );
}





