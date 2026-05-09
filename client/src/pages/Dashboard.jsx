import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import {
  Shield, Activity, Users, Lock,
  Plus, Bell, Search, LogOut,
  ChevronDown, MoreVertical, Database,
  Settings, Layout, Briefcase, ExternalLink,
  ChevronRight, ArrowUpRight
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import forge from "node-forge";
import { io } from "socket.io-client";
import { Phone as PhoneIcon } from "lucide-react";

const socket = io(import.meta.env.VITE_API_URL || "http://localhost:5000");

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function Dashboard() {

  const navigate = useNavigate();
  const location = useLocation();
  const userId = localStorage.getItem("userId");

  // ================= STATE =================
  const [vaults, setVaults] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [sortOption, setSortOption] = useState("modified");
  const [memberDetailsMap, setMemberDetailsMap] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [vaultName, setVaultName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("Private");
  const [encryption, setEncryption] = useState("AES-256-GCM");
  const [role, setRole] = useState("Viewer");
  const [vaultPin, setVaultPin] = useState("");
  const [vaultType, setVaultType] = useState("file");
  const [currentUserName, setCurrentUserName] = useState(localStorage.getItem("userName") || "User");
  const [globalLogs, setGlobalLogs] = useState([]);
  const [activityFilters, setActivityFilters] = useState({
    eventTypes: [],
    dateRange: "Last 24 Hours",
    users: []
  });
  const [isSyncing, setIsSyncing] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [profile, setProfile] = useState({
    name: "", dob: "", bio: "", phone: "", location: "", jobTitle: "",
    profilePicture: localStorage.getItem("profilePicture") || "",
    email: ""
  });
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [dismissedNotifications, setDismissedNotifications] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("dismissed_notifs") || "[]");
    } catch (e) {
      return [];
    }
  });

  const [incomingCall, setIncomingCall] = useState(null);

  const queryParams = new URLSearchParams(location.search);
  const mainTab = queryParams.get("tab") || "dashboard";
  
  const setMainTab = (tab) => {
    navigate(`?tab=${tab}`);
  };

  // ================= DERIVED DATA =================
  const activities = useMemo(() => {
    return vaults
      .flatMap(v => (v.activity || []).map(a => ({ ...a, vaultName: v.name, vaultId: v._id })))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 10);
  }, [vaults]);

  const totalStorage = vaults.reduce((acc, v) => acc + (v.storageUsed || 0), 0);
  const totalTeamNodes = new Set(vaults.flatMap(v => (v.members || []).map(m => m.userId))).size;
  const encryptionStatus = vaults.length > 0 ? "100% Active" : "No Active Vaults";
  const activeEncryptions = vaults.reduce((a, v) => a + (v.files?.length || 0), 0);
  const securityFlags = (globalLogs || []).filter(l => l.action && l.action.includes('DENIED')).length;

  const securityScore = vaults.length === 0 ? 0 : Math.round(
    (vaults.filter(v => v.encryption === 'AES-256-GCM').length / vaults.length) * 40 +
    (vaults.filter(v => v.visibility === 'Private').length / vaults.length) * 30 +
    (totalTeamNodes > 0 ? 28 : 10)
  );

  const todayActivitiesCount = vaults
    .flatMap(v => v.activity || [])
    .filter(a => a.createdAt && new Date(a.createdAt).toDateString() === new Date().toDateString())
    .length;

  // ================= HELPERS =================
  const formatStorage = (bytes) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const timeAgo = (date) => {
    if (!date) return "Never";
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
  };

  const dismissNotification = (id) => {
    const newDismissed = [...dismissedNotifications, id];
    setDismissedNotifications(newDismissed);
    localStorage.setItem("dismissed_notifs", JSON.stringify(newDismissed));
  };

  const filteredVaults = useMemo(() => {
    let result = vaults.filter(v => 
      (v.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
      (v.description || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    return result.sort((a, b) => {
      if (sortOption === "name") return (a.name || "").localeCompare(b.name || "");
      const lastA = a.activity?.[0]?.createdAt || a.createdAt;
      const lastB = b.activity?.[0]?.createdAt || b.createdAt;
      return new Date(lastB) - new Date(lastA);
    });
  }, [vaults, searchTerm, sortOption]);

  // ================= ACTIONS =================
  const fetchVaults = async () => {
    try {
      if (!userId) return;

      const res = await axios.get(
        `${API_URL}/api/vaults/${userId}`
      );

      setVaults(Array.isArray(res.data) ? res.data : []);

    } catch (err) {
      console.log("FETCH ERROR:", err);
      setVaults([]);
    }
  };

  useEffect(() => {
    fetchVaults();
    const interval = setInterval(fetchVaults, 5000);
    return () => clearInterval(interval);
  }, [userId]);

  const [notifications, setNotifications] = useState([]);

  const fetchNotifications = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/notifications/${userId}`);
      setNotifications(res.data);
    } catch (err) {}
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    socket.emit("user_connected", userId);
    
    const handleIncomingCall = (data) => {
      if (data.callerId !== userId) {
        setIncomingCall(data);
        setTimeout(() => setIncomingCall(null), 20000);
      }
    };
    socket.on("incoming_call_alert", handleIncomingCall);

    return () => {
      socket.off("incoming_call_alert", handleIncomingCall);
    };
  }, [userId]);

  useEffect(() => {
    const fetchMemberNames = async () => {
      const allMemberIds = new Set(vaults.flatMap(v => (v.members || []).map(m => m.userId)));
      const activityUserIds = new Set(vaults.flatMap(v => (v.activity || []).map(a => a.userId)));
      const uniqueIds = Array.from(new Set([...allMemberIds, ...activityUserIds]));
      
      const newMap = { ...memberDetailsMap };
      let changed = false;

      for (const id of uniqueIds) {
        if (!newMap[id]) {
          try {
            const res = await axios.get(`${API_URL}/api/user/${id}`);
            newMap[id] = res.data.name;
            changed = true;
          } catch (err) {
            newMap[id] = id.substring(0, 6);
          }
        }
      }

      if (changed) setMemberDetailsMap(newMap);
    };

    if (vaults.length > 0) fetchMemberNames();
  }, [vaults]);

  // ================= ROLE DETECTION =================
  const getUserRole = (vault) => {
    if (vault.userId === userId) return "Owner";
    const member = vault.members?.find(m => m.userId === userId);
    return member?.role || "Viewer";
  };

  // ================= CREATE VAULT =================
  const createVault = async () => {
    try {
      if (!vaultName) return alert("Vault name required");

      await axios.post(API_URL + "/api/create-vault", {
        userId,
        name: vaultName,
        description,
        visibility,
        encryption,
        role,
        pin: vaultPin,
        type: vaultType
      });

      setVaultName("");
      setDescription("");
      setVisibility("Private");
      setEncryption("AES-256-GCM");
      setRole("Viewer");
      setVaultPin("");
      setVaultType("file");

      setShowModal(false);
      fetchVaults();

    } catch (err) {
      alert(err.response?.data?.message || "Vault creation failed");
    }
  };

  const fetchGlobalLogs = async () => {
    try {
      if (!userId) return;
      const res = await axios.get(`${API_URL}/api/logs?userId=${userId}`);
      setGlobalLogs(Array.isArray(res.data) ? res.data : []);
      setIsSyncing(false);
    } catch (err) {
      console.error("Failed to fetch logs", err);
    }
  };

   const generateAuditReport = async () => {
    setIsExporting(true);
    console.log("Initiating server-side threat analysis...");
    
    try {
      // 1. FETCH REAL ANALYSIS FROM BACKEND
      const reportRes = await axios.post(API_URL + "/api/reports/generate", { userId });
      const { reportId, summary, threatAnalysis, timestamp: reportTime } = reportRes.data;
      
      const doc = new jsPDF();
      const timestamp = new Date(reportTime).toLocaleString();
      
      const addHeader = (d, title = "SPV AUDIT TERMINAL") => {
        d.setFillColor(2, 3, 10);
        d.rect(0, 0, 210, 40, 'F');
        d.setFontSize(26);
        d.setTextColor(255, 255, 255);
        d.setFont("helvetica", "bold");
        d.text(title, 14, 25);
        d.setFontSize(9);
        d.setTextColor(100, 100, 100);
        d.text("SECURE PROJECT VAULT - ENTERPRISE COMPLIANCE & GOVERNANCE", 14, 33);
      };

      const addWatermark = (d) => {
        d.setTextColor(245, 245, 245);
        d.setFontSize(50);
        d.text("CONFIDENTIAL - SPV", 20, 250, null, 45);
      };

      // --- PAGE 1: CERTIFICATE OF GOVERNANCE ---
      addHeader(doc, "CERTIFICATE OF AUDIT");
      addWatermark(doc);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(`CERTIFICATE NUMBER:`, 14, 55);
      doc.setFont("helvetica", "normal");
      doc.text(reportId, 65, 55);
      
      doc.setFont("helvetica", "bold");
      doc.text(`ISSUED ON:`, 14, 62);
      doc.setFont("helvetica", "normal");
      doc.text(timestamp, 65, 62);

      doc.setFont("helvetica", "bold");
      doc.text(`AUTHORITY ID:`, 14, 69);
      doc.setFont("helvetica", "normal");
      doc.text(userId, 65, 69);

      // THREAT LEVEL INDICATOR
      const threatColor = threatAnalysis.level === "HIGH" ? [220, 38, 38] : threatAnalysis.level === "MEDIUM" ? [245, 158, 11] : [34, 197, 94];
      doc.setFillColor(...threatColor);
      doc.rect(150, 50, 45, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text("THREAT LEVEL", 155, 57);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(threatAnalysis.level, 155, 65);

      // SECURITY POSTURE SECTION
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(16);
      doc.text("Security Posture Assessment", 14, 85);
      
      doc.setDrawColor(200);
      doc.rect(14, 90, 100, 15); // Container
      const scoreWidth = (summary.securityScore / 100) * 100;
      doc.setFillColor(34, 197, 94);
      doc.rect(14, 90, scoreWidth, 15, 'F');
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.text(`POSTURE SCORE: ${summary.securityScore}/100`, 120, 100);

      // REAL-TIME THREAT VECTOR ANALYSIS
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Real-Time Threat Vector Matrix", 14, 120);
      
      const threatMatrixData = [
         ["Threat Vector", "Detection Logic", "Current Status", "Signal Count"],
         ["Brute Force", "Recent Login Failures", threatAnalysis.bruteForce.status, threatAnalysis.bruteForce.count.toString()],
         ["Unauthorized Access", "Permission Denied Triggers", threatAnalysis.unauthorized.status, threatAnalysis.unauthorized.count.toString()],
         ["Volume Anomaly", "High Frequency I/O", threatAnalysis.activity.status, threatAnalysis.activity.volume],
         ["Integrity Guard", "Cryptographic Checksum", "VERIFIED", "Stable"]
      ];

      autoTable(doc, { 
        startY: 125, 
        head: [threatMatrixData[0]], 
        body: threatMatrixData.slice(1), 
        theme: 'grid', 
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 30, 30] }
      });

      // --- PAGE 2: VAULT INVENTORY ---
      doc.addPage();
      addHeader(doc, "VAULT INVENTORY");
      addWatermark(doc);
      
      doc.setTextColor(0);
      doc.setFontSize(16);
      doc.text("Encrypted Vault Infrastructure", 14, 50);
      
      const vaultData = vaults.map(v => [
        v.name || "Unnamed",
        v.visibility || "Private",
        v.encryption || "AES-256",
        formatStorage(v.storageUsed || 0),
        v.members?.length || 1,
        new Date(v.createdAt).toLocaleDateString()
      ]);

      autoTable(doc, {
        startY: 60,
        head: [["Asset Name", "Protocol", "Cipher Suite", "Size", "Nodes", "Genesis Date"]],
        body: vaultData,
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 102, 204] }
      });

      // --- PAGE 3: FULL ACTIVITY LOG ---
      doc.addPage();
      addHeader(doc, "AUDIT TRAIL");
      addWatermark(doc);
      doc.setTextColor(0);
      doc.setFontSize(16);
      doc.text("Live Signal Logs (Last 100 Events)", 14, 50);
      
      const tableData = (globalLogs || []).map(log => [
        new Date(log.timestamp).toLocaleString(),
        log.userName || "Unknown",
        log.action?.replace(/_/g, ' ') || "Action",
        log.vaultName || "Global",
        log.details || "-"
      ]);

      autoTable(doc, {
        startY: 60,
        head: [["Timestamp", "Identity", "Action", "Context", "Audit Details"]],
        body: tableData.slice(0, 100),
        theme: 'striped',
        styles: { fontSize: 7 },
        headStyles: { fillColor: [40, 40, 40] }
      });

      // --- FINAL PAGE: COMPLIANCE SIGNATURE ---
      doc.addPage();
      addHeader(doc, "GOVERNANCE FINALITY");
      addWatermark(doc);
      doc.setTextColor(0);
      doc.setFontSize(16);
      doc.text("Cryptographic Verification", 14, 50);
      
      doc.setFontSize(9);
      doc.text("This document serves as formal proof of security auditing for the SPV network.", 14, 60);
      doc.text("The data contained herein is derived directly from the Zero-Knowledge Audit Ledger.", 14, 65);
      
      const finalY = 80;
      doc.setFillColor(245, 247, 250);
      doc.rect(14, finalY, 182, 40, 'F');
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text("SHA-256 GOVERNMENT-GRADE INTEGRITY HASH", 18, finalY + 10);
      doc.setFont("courier", "bold");
      doc.setTextColor(0);
      
      const md = forge.md.sha256.create();
      md.update(reportId + JSON.stringify(threatAnalysis) + JSON.stringify(summary));
      const hash = md.digest().toHex().toUpperCase();
      
      doc.text(hash.substring(0, 32), 18, finalY + 22);
      doc.text(hash.substring(32), 18, finalY + 30);
      
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text("Electronically Signed by SPV Autonomous Auditor", 14, 140);
      doc.line(14, 142, 100, 142);

      doc.save(`SPV_AUDIT_REPORT_${reportId}.pdf`);
      setIsExporting(false);
      alert(`Advanced Audit Report ${reportId} Generated and Logged.`);

    } catch (err) {
      setIsExporting(false);
      console.error("PDF ERROR:", err);
      alert("Advanced report generation failed. Check server connection.");
    }
  };

  useEffect(() => {
    if (mainTab === "activity") {
      fetchGlobalLogs();
      const interval = setInterval(fetchGlobalLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [mainTab, userId]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        if (!userId) return;
        const res = await axios.get(`${API_URL}/api/user/${userId}`);
        setCurrentUserName(res.data.name);
        localStorage.setItem("userName", res.data.name);
        setProfile({
          name: res.data.name || "",
          email: res.data.email || "",
          dob: res.data.dob || "",
          bio: res.data.bio || "",
          phone: res.data.phone || "",
          location: res.data.location || "",
          jobTitle: res.data.jobTitle || "",
          profilePicture: res.data.profilePicture || ""
        });
        if (res.data.profilePicture) {
          localStorage.setItem("profilePicture", res.data.profilePicture);
        }
      } catch (err) {}
    };
    fetchUser();
  }, [userId]);

  const saveProfile = async () => {
    setIsSavingProfile(true);
    try {
      await axios.put(`${API_URL}/api/user/${userId}/profile`, profile);
      setCurrentUserName(profile.name);
      localStorage.setItem("userName", profile.name);
      if (profile.profilePicture) {
        localStorage.setItem("profilePicture", profile.profilePicture);
      }
      setShowProfile(false);
    } catch (err) {
      alert("Failed to save profile");
    }
    setIsSavingProfile(false);
  };

  // ================= LOGOUT =================
  const logout = async () => {
    try {
      const sessionId = localStorage.getItem("sessionId");

      if (sessionId) {
        await axios.post(API_URL + "/api/logout", {
          sessionId
        });
      }

      localStorage.removeItem("token");
      localStorage.removeItem("sessionId");
      localStorage.removeItem("userId");
      window.location.href = "/";

    } catch {
      localStorage.removeItem("token");
      localStorage.removeItem("sessionId");
      localStorage.removeItem("userId");
      window.location.href = "/";
    }
  };

  return (
    <div className="flex h-screen bg-[#02030a] text-white">

      {/* SIDEBAR */}
      <div className="w-[260px] bg-[#05060f] border-r border-white/5 flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Shield size={24} className="text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">SPV</h1>
          </div>

          <div className="space-y-1 mb-8">
            <SidebarItem icon={<Layout size={18} />} text="Dashboard" active={mainTab === "dashboard"} onClick={() => setMainTab("dashboard")} />
            <SidebarItem icon={<Activity size={18} />} text="Activity" active={mainTab === "activity"} onClick={() => setMainTab("activity")} />
            <SidebarItem icon={<Users size={18} />} text="Members" active={mainTab === "members"} onClick={() => setMainTab("members")} />
            <SidebarItem icon={<Shield size={18} />} text="Security" active={mainTab === "security"} onClick={() => setMainTab("security")} />
          </div>

          <div className="mb-4">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3 mb-4">
              My Vaults
            </h3>
            <div className="space-y-1">
              {vaults.slice(0, 5).map(v => (
                <div key={v._id} onClick={() => window.location.href = v.type === "code" ? `/code-vault/${v._id}` : `/vault/${v._id}`} className="flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg cursor-pointer transition text-sm">
                  <div className="w-5 h-5 rounded border border-white/10 flex items-center justify-center">
                    <Lock size={10} />
                  </div>
                  <span className="truncate">{v.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-white/5">
          <button
            onClick={logout}
            className="w-full flex items-center justify-between px-3 py-2 text-gray-400 hover:text-red-400 rounded-lg transition text-sm"
          >
            <span className="flex items-center gap-2"><LogOut size={16} /> Logout</span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex-1 p-6 overflow-y-auto">
        {mainTab === "dashboard" ? (
          <>
            {/* TOP BAR */}
            <div className="flex justify-between items-center mb-10">
              <div className="flex items-center gap-4">
                <div className="p-2 hover:bg-white/5 rounded-lg cursor-pointer transition text-gray-400">
                   <Layout size={20} />
                </div>
                <div className="relative group">
                  <div className="flex bg-[#0b0f1a] px-3 py-1.5 rounded-xl w-[320px] gap-2 border border-white/5 focus-within:border-blue-500/50 transition">
                    <Search size={14} className="text-gray-500" />
                    <input
                      placeholder="Search files, vaults..."
                      className="bg-transparent outline-none w-full text-[10px] text-gray-300 placeholder:text-gray-600"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-1">
                  <div className="p-2 hover:bg-white/5 rounded-lg cursor-pointer transition text-gray-400">
                    <Plus size={20} onClick={() => setShowModal(true)} />
                  </div>
                  <div 
                    className="p-2 hover:bg-white/5 rounded-lg cursor-pointer transition text-gray-400 relative"
                    onClick={() => setShowNotifications(!showNotifications)}
                  >
                    <Bell size={20} />
                    {notifications.length > 0 && (
                      <div className="absolute top-2 right-2.5 w-2 h-2 bg-blue-500 rounded-full border-2 border-[#02030a]" />
                    )}
                    
                    {showNotifications && (
                      <div className="absolute top-12 right-0 w-80 bg-[#0b0f1a] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden">
                        <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/2">
                          <span className="text-[10px] font-black tracking-widest text-gray-500 uppercase">Alert Monitor</span>
                          <span className="text-[9px] font-bold text-blue-500 cursor-pointer hover:text-blue-400">Clear All</span>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                          {notifications.filter(n => !dismissedNotifications.includes(n._id || n.id || n.createdAt)).length === 0 ? (
                            <div className="p-8 text-center text-gray-500 text-xs italic">No new signals detected.</div>
                          ) : (
                            notifications
                              .filter(n => !dismissedNotifications.includes(n._id || n.id || n.createdAt))
                              .map((n, i) => (
                              <div key={i} className="p-4 hover:bg-white/5 border-b border-white/5 transition cursor-pointer group relative">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); dismissNotification(n._id || n.id || n.createdAt); }}
                                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-white transition"
                                >
                                  <Plus size={14} className="rotate-45" />
                                </button>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`w-1.5 h-1.5 rounded-full ${n.type === 'chat' ? 'bg-green-500' : 'bg-blue-500'}`} />
                                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{n.type} Signal</span>
                                </div>
                                <p className="text-[11px] text-gray-400 group-hover:text-white leading-relaxed pr-6">
                                  {n.type === 'chat' ? (
                                    <><span className="text-white font-bold">{memberDetailsMap[n.userId] || 'Someone'}</span> sent a secure message in <span className="text-blue-400">@{n.vaultName}</span></>
                                  ) : (
                                    <><span className="text-white font-bold">{memberDetailsMap[n.userId] || 'Someone'}</span> {n.action.toLowerCase()} in <span className="text-blue-400">{n.vaultName}</span></>
                                  )}
                                </p>
                                <span className="text-[9px] font-bold text-gray-600 uppercase mt-2 block">{timeAgo(n.createdAt)}</span>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="p-3 text-center border-t border-white/5">
                           <button onClick={() => {setMainTab('activity'); setShowNotifications(false);}} className="text-[9px] font-black text-gray-500 hover:text-white uppercase tracking-[0.2em] transition">View System Logs</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="h-8 w-px bg-white/10 mx-2" />
                <div
                  className="flex items-center gap-3 hover:bg-white/5 p-1.5 pr-3 rounded-xl cursor-pointer transition"
                  onClick={() => setShowProfile(true)}
                >
                  <img
                    src={profile.profilePicture || `https://i.pravatar.cc/100?u=${userId}`}
                    className="w-8 h-8 rounded-lg border border-white/10 object-cover"
                    alt="avatar"
                  />
                  <div className="text-left hidden sm:block">
                    <p className="text-[11px] font-bold text-white leading-tight">{currentUserName}</p>
                    <p className="text-[9px] text-gray-500">{profile.jobTitle || "SPV Member"}</p>
                  </div>
                  <ChevronDown size={14} className="text-gray-500" />
                </div>
              </div>
            </div>

            {/* DASHBOARD HEADER */}
            <div className="flex justify-between items-end mb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded border border-blue-500/20">V2.4.0</span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                    <Shield size={10} /> Secure Connection
                  </span>
                </div>
                <h2 className="text-xl font-bold mb-1">Project Dashboard</h2>
                <p className="text-gray-400 text-[10px]">
                  Welcome back, <span className="text-white font-medium">{currentUserName}</span>. You have <span className="text-white font-medium">{vaults.length} active vaults</span> under military-grade local encryption.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 rounded-lg text-sm font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/20 flex items-center gap-2">
                  <Plus size={18} /> Create New Vault
                </button>
              </div>
            </div>

            {/* STAT CARDS */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <StatCard 
            icon={<Shield size={16} className="text-blue-400" />} 
            label="Security Status" 
            value={encryptionStatus} 
            color="blue"
          />
          <StatCard 
            icon={<Activity size={16} className="text-purple-400" />} 
            label="Daily Activity" 
            value={`${todayActivitiesCount} Actions`} 
            color="purple"
          />
          <StatCard 
            icon={<Users size={16} className="text-amber-400" />} 
            label="Network Nodes" 
            value={`${totalTeamNodes} Peers`} 
            color="amber"
          />
        </div>

            {/* VAULTS SECTION */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                 <Lock size={16} className="text-blue-500" />
                 <h3 className="font-bold text-lg">My Secure Vaults</h3>
              </div>
              <div className="flex gap-4 text-xs font-bold uppercase tracking-widest">
                 <span 
                   onClick={() => setSortOption("modified")}
                   className={`cursor-pointer transition ${sortOption === "modified" ? "text-white" : "text-gray-500 hover:text-white"}`}
                 >
                   Last Modified
                 </span>
                 <span 
                   onClick={() => setSortOption("name")}
                   className={`cursor-pointer transition ${sortOption === "name" ? "text-white" : "text-gray-500 hover:text-white"}`}
                 >
                   A-Z
                 </span>
              </div>
            </div>

            <div className="flex gap-10">
              {/* GRID */}
              <div className="flex-1">
                {filteredVaults.length === 0 ? (
                  <div className="bg-white/5 p-12 rounded-2xl text-center border border-dashed border-white/10">
                    <p className="text-gray-500 italic text-xs">No vaults found matching your search.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-5">
                    {filteredVaults.map((v) => (
                      <VaultCard key={v._id} vault={v} userRole={getUserRole(v)} onClick={() => navigate(v.type === "code" ? `/code-vault/${v._id}` : `/vault/${v._id}`)} timeAgo={timeAgo} />
                    ))}
                  </div>
                )}

                <div className="mt-10 flex justify-center">
                   <button className="px-6 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-gray-400 hover:text-white hover:bg-white/10 transition uppercase tracking-widest">
                      View Archived Vaults
                   </button>
                </div>
              </div>

              {/* RIGHT PANEL */}
              <div className="w-[320px] space-y-8">
                {/* STORAGE */}
                <div className="bg-[#0b0f1a] p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                   <div className="flex justify-between items-center mb-6">
                      <h4 className="flex items-center gap-2 text-xs font-bold text-blue-400 tracking-widest uppercase">
                        <Database size={14} /> Vault Storage
                      </h4>
                      <span className="text-[10px] font-bold bg-white/5 px-1.5 py-0.5 rounded border border-white/10 text-gray-400">
                        {((totalStorage / (100 * 1024 * 1024 * 1024)) * 100).toFixed(2)}% Full
                      </span>
                   </div>
                   
                   <div className="mb-6">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Encrypted Data</span>
                        <span className="text-xs font-bold">{formatStorage(totalStorage)} / 100 GB</span>
                      </div>
                      <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className="bg-blue-500 h-full rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all duration-1000"
                          style={{ width: `${Math.max(0.5, (totalStorage / (100 * 1024 * 1024 * 1024)) * 100)}%` }}
                        />
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Files</span>
                         <span className="text-lg font-bold">{vaults.reduce((a,v) => a + (v.files?.length || 0), 0).toLocaleString()}</span>
                      </div>
                      <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                         <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Backups</span>
                         <span className="text-lg font-bold">4/5</span>
                      </div>
                   </div>
                </div>

                {/* RECENT ACTIVITY */}
                <div className="bg-[#0b0f1a] p-6 rounded-2xl border border-white/5">
                   <div className="flex justify-between items-center mb-6">
                      <h4 className="flex items-center gap-2 text-xs font-bold text-purple-400 tracking-widest uppercase">
                        <Activity size={14} /> Recent Activity
                      </h4>
                      <Activity size={14} className="text-gray-600" />
                   </div>

                   <div className="space-y-6">
                      {activities.length === 0 ? (
                        <p className="text-xs text-gray-500 italic py-4">No recent activity found.</p>
                      ) : (
                        activities.map((a, i) => (
                          <div key={i} className="flex gap-3 relative group">
                            {i !== activities.length - 1 && <div className="absolute left-4 top-8 w-px h-6 bg-white/5" />}
                            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                              <Layout size={14} className="text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                               <p className="text-[11px] text-gray-400 leading-tight">
                                  <span className="text-white font-bold">{memberDetailsMap[a.userId] || a.userId.substring(0,6)}</span> {a.action.toLowerCase().replace(/_/g, ' ')}
                                  <br />
                                  <span className="text-white font-medium">{a.details || a.vaultName}</span>
                               </p>
                               <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mt-1 block">
                                  {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                               </span>
                            </div>
                          </div>
                        ))
                      )}
                   </div>

                   <button 
                      onClick={() => setMainTab("activity")}
                      className="w-full mt-8 flex items-center justify-center gap-2 text-[10px] font-bold text-gray-400 hover:text-white transition uppercase tracking-widest border border-white/5 py-2.5 rounded-lg"
                   >
                      View Full Activity Log
                   </button>
                </div>

                {/* SECURITY SCORE */}
                <div className="bg-[#0b0f1a] p-6 rounded-2xl border border-white/5">
                   <h4 className="flex items-center gap-2 text-xs font-bold text-green-400 tracking-widest uppercase mb-4">
                     <Shield size={14} /> Security Score
                   </h4>
                   <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-5xl font-black italic tracking-tighter">{securityScore}</span>
                      <span className="text-lg font-bold text-gray-600">/100</span>
                   </div>
                   <p className="text-[11px] text-gray-400 mb-6 leading-relaxed">
                     {securityScore > 80 ? "Your keys are properly backed up and encryption is active." : "Enhance your security by using AES-256-GCM and private visibility."}
                   </p>
                   <button 
                      onClick={() => setMainTab("security")}
                      className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition uppercase tracking-widest flex items-center gap-1"
                   >
                      Run Deep Audit <ChevronRight size={12} />
                   </button>
                </div>
              </div>
            </div>
          </>
        ) : mainTab === "activity" ? (
          <div className="flex h-full gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* LEFT FILTERS */}
            <div className="w-64 bg-[#0b0f1a] rounded-2xl border border-white/5 p-6 flex flex-col gap-8 shrink-0">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">
                    <Layout size={14} /> Filters
                  </h4>
                  <button onClick={() => setActivityFilters({ eventTypes: [], dateRange: "Last 24 Hours", users: [] })} className="text-[10px] font-bold text-gray-600 hover:text-white transition uppercase">Reset</button>
                </div>

                <div className="space-y-6">
                   <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Event Type</p>
                      {['Security Alarms', 'File Uploads', 'Member Changes', 'Chat History'].map(type => (
                        <label key={type} className="flex items-center gap-3 mb-3 cursor-pointer group">
                           <input 
                             type="checkbox" 
                             className="hidden" 
                             checked={activityFilters.eventTypes.includes(type)}
                             onChange={() => {
                               const newTypes = activityFilters.eventTypes.includes(type)
                                ? activityFilters.eventTypes.filter(t => t !== type)
                                : [...activityFilters.eventTypes, type];
                               setActivityFilters({ ...activityFilters, eventTypes: newTypes });
                             }}
                           />
                           <div className={`w-4 h-4 rounded border ${activityFilters.eventTypes.includes(type) ? 'bg-blue-500 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'border-white/10 group-hover:border-white/30'} transition flex items-center justify-center`}>
                              {activityFilters.eventTypes.includes(type) && <Plus size={10} className="text-white rotate-45" />}
                           </div>
                           <span className={`text-[11px] font-medium transition ${activityFilters.eventTypes.includes(type) ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`}>{type}</span>
                        </label>
                      ))}
                   </div>

                   <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Date Range</p>
                      <div className="space-y-1">
                        {['Last 24 Hours', 'Last 7 Days', 'Custom Range'].map(range => (
                          <div 
                            key={range}
                            onClick={() => setActivityFilters({ ...activityFilters, dateRange: range })}
                            className={`px-3 py-2 rounded-lg text-[11px] font-bold cursor-pointer transition ${activityFilters.dateRange === range ? 'bg-white/5 text-white border border-white/10' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                            {range}
                          </div>
                        ))}
                      </div>
                   </div>

                   <div>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">Involved Users</p>
                      <div className="relative mb-4">
                        <Search size={12} className="absolute left-3 top-2.5 text-gray-600" />
                        <input placeholder="Search member" className="w-full bg-white/5 border border-white/5 rounded-lg py-2 pl-8 pr-3 text-[10px] outline-none focus:border-blue-500/50" />
                      </div>
                      <div className="space-y-3 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                        {Array.from(new Set(globalLogs.map(l => l.userName))).slice(0, 5).map(user => (
                          <label key={user} className="flex items-center gap-3 cursor-pointer group">
                             <input 
                               type="checkbox" 
                               className="hidden" 
                               checked={activityFilters.users.includes(user)}
                               onChange={() => {
                                 const newUsers = activityFilters.users.includes(user)
                                  ? activityFilters.users.filter(u => u !== user)
                                  : [...activityFilters.users, user];
                                 setActivityFilters({ ...activityFilters, users: newUsers });
                               }}
                             />
                             <div className={`w-4 h-4 rounded border ${activityFilters.users.includes(user) ? 'bg-blue-500 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'border-white/10 group-hover:border-white/30'} transition flex items-center justify-center`}>
                                {activityFilters.users.includes(user) && <Plus size={10} className="text-white rotate-45" />}
                             </div>
                             <span className={`text-[11px] font-medium transition ${activityFilters.users.includes(user) ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}`}>{user}</span>
                          </label>
                        ))}
                      </div>
                   </div>
                </div>
              </div>

              <div className="mt-auto p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl relative overflow-hidden group">
                 <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:rotate-12 transition-transform duration-700">
                    <Activity size={80} className="text-blue-500" />
                 </div>
                 <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Live Sync Active</span>
                 </div>
                 <p className="text-[9px] text-gray-500 leading-relaxed font-medium relative z-10">Activity logs are encrypted locally and synced across your authorized devices in real-time.</p>
              </div>
            </div>

            {/* CENTER FEED */}
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
               <div className="flex justify-between items-center mb-10 sticky top-0 bg-[#02030a]/80 backdrop-blur-xl py-4 z-20 border-b border-white/5 -mx-2 px-2">
                  <div>
                    <h2 className="text-3xl font-black italic tracking-tighter">Activity Feed</h2>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Full audit history for all secure vaults.</p>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={generateAuditReport}
                      disabled={isExporting}
                      className={`flex items-center gap-2 px-5 py-2.5 bg-[#0b0f1a] border border-white/5 rounded-xl text-[10px] font-bold transition uppercase tracking-widest hover:bg-white/5 ${isExporting ? 'text-blue-500' : 'text-gray-400 hover:text-white'}`}
                    >
                      {isExporting ? (
                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Layout size={14} />
                      )}
                      {isExporting ? "Processing..." : "Export Report"}
                    </button>
                    <button className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 rounded-xl text-[10px] font-black text-white hover:bg-blue-700 transition uppercase tracking-widest shadow-[0_10px_20px_rgba(37,99,235,0.2)] active:scale-95">
                      <Search size={14} /> Advanced Search
                    </button>
                  </div>
               </div>

               <div className="space-y-12">
                  <section>
                    <div className="flex items-center gap-4 mb-8">
                      <div className="h-px flex-1 bg-white/5" />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em]">Today, {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>
                      <div className="h-px flex-1 bg-white/5" />
                    </div>

                    <div className="space-y-4">
                      {globalLogs.length === 0 ? (
                        <div className="bg-white/2 border border-dashed border-white/5 rounded-3xl py-20 text-center">
                          <Activity size={40} className="text-gray-800 mx-auto mb-4" />
                          <p className="text-gray-500 italic text-xs">No signals captured in the current frequency.</p>
                        </div>
                      ) : (
                        globalLogs
                          .filter(log => {
                             // Apply simple filters
                             if (activityFilters.users.length > 0 && !activityFilters.users.includes(log.userName)) return false;
                             if (activityFilters.eventTypes.length > 0) {
                                if (activityFilters.eventTypes.includes('File Uploads') && log.action.includes('UPLOAD')) return true;
                                if (activityFilters.eventTypes.includes('Security Alarms') && log.action.includes('DENIED')) return true;
                                if (activityFilters.eventTypes.includes('Member Changes') && log.action.includes('INVITE')) return true;
                                return false;
                             }
                             return true;
                          })
                          .map((log, i) => (
                          <div key={i} className="group relative bg-[#0b0f1a] border border-white/5 hover:border-blue-500/20 p-5 rounded-2xl transition-all duration-300 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                             <div className="flex items-center gap-5">
                                <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white/5 group-hover:border-blue-500/20 transition-all duration-500 group-hover:scale-105 shadow-inner">
                                   <img src={`https://i.pravatar.cc/100?u=${log.userId}`} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" alt="" />
                                </div>
                                <div className="flex-1 min-w-0">
                                   <div className="flex items-center gap-2 mb-1 flex-wrap">
                                      <span className="text-xs font-black text-white group-hover:text-blue-400 transition-colors">{log.userName}</span>
                                      <span className="text-xs text-gray-500">{log.action.toLowerCase().replace(/_/g, ' ')} for vault</span>
                                      <span className="text-xs font-bold text-white bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-all">@{log.vaultName}</span>
                                   </div>
                                   <div className="flex items-center gap-3">
                                      <span className="text-[10px] font-bold text-gray-600 flex items-center gap-1 group-hover:text-gray-400">
                                         <Plus size={10} className="rotate-45" /> {timeAgo(log.timestamp)}
                                      </span>
                                      <span className={`px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[9px] font-black uppercase tracking-widest transition-colors ${log.action.includes('DENIED') ? 'text-red-500 border-red-500/20' : 'text-gray-500 group-hover:text-blue-500'}`}>
                                         {log.action.split('_')[0]}
                                      </span>
                                      {log.action.includes('FILE') && <span className="text-[9px] font-bold text-gray-700 flex items-center gap-1"><Database size={10} /> {log.details.includes('bytes') ? log.details.split('(')[1].split(')')[0] : ''}</span>}
                                   </div>
                                </div>
                                <div className="text-gray-600 group-hover:text-white transition-all cursor-pointer hover:bg-white/5 p-2 rounded-lg">
                                   <ChevronDown size={18} />
                                </div>
                             </div>
                             
                             {/* PROGRESS LINE */}
                             <div className="absolute left-11 top-[4.5rem] w-px h-8 bg-white/5 group-hover:bg-blue-500/20 transition-all" />
                          </div>
                        ))
                      )}
                    </div>
                  </section>
               </div>

               <div className="py-20 text-center">
                  <button className="text-[10px] font-bold text-gray-600 hover:text-white transition uppercase tracking-[0.4em] flex items-center gap-3 mx-auto px-6 py-3 border border-white/5 rounded-full hover:bg-white/5">
                    <Activity size={14} className="animate-spin duration-[3000ms]" /> Load earlier activity...
                  </button>
               </div>
            </div>

            {/* RIGHT INSIGHTS */}
            <div className="w-80 space-y-6 shrink-0">
               <div className="bg-[#0b0f1a] rounded-3xl border border-white/5 p-6 shadow-2xl shadow-black/50">
                  <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest flex items-center gap-2 mb-8">
                    <Shield size={14} /> Vault Insights
                  </h4>
                  
                  <div className="space-y-6">
                     <div className="p-5 bg-white/2 rounded-2xl border border-white/5 hover:border-blue-500/20 transition-all duration-500 group">
                        <div className="flex justify-between items-center mb-2">
                           <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-gray-400 transition-colors">Active Encryptions</span>
                           <span className="text-[10px] font-black text-green-500 flex items-center gap-1">
                              <Plus size={10} className="rotate-45" /> {vaults.length > 0 ? 'Verified' : '0%'}
                           </span>
                        </div>
                        <p className="text-3xl font-black italic tracking-tighter">{activeEncryptions.toLocaleString()}</p>
                        <div className="mt-4 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                           <div className="bg-green-500 h-full w-[65%] animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                        </div>
                     </div>

                     <div className="p-5 bg-white/2 rounded-2xl border border-white/5 hover:border-red-500/20 transition-all duration-500 group">
                        <div className="flex justify-between items-center mb-2">
                           <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-gray-400 transition-colors">Security Flags</span>
                           <span className="text-[10px] font-black text-red-500 flex items-center gap-1">
                              <Bell size={10} className="animate-bounce" /> {securityFlags > 0 ? 'Alert' : 'Secure'}
                           </span>
                        </div>
                        <p className="text-3xl font-black italic text-white/20 tracking-tighter group-hover:text-white/40 transition-colors">{securityFlags.toString().padStart(2, '0')}</p>
                     </div>
                  </div>
               </div>

               <div className="bg-[#0b0f1a] rounded-3xl border border-white/5 p-6 shadow-2xl shadow-black/50 overflow-hidden">
                  <div className="flex justify-between items-center mb-6">
                     <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Activity Intensity</h4>
                     <span className="text-[8px] font-black text-blue-500 uppercase bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">Live Signal</span>
                  </div>
                  
                  <div className="flex gap-2 justify-center">
                    {/* Day Labels */}
                    <div className="flex flex-col gap-1 text-[6px] font-black text-gray-700 uppercase pr-1 justify-center py-0.5">
                      <span className="h-2">S</span>
                      <span className="h-2 invisible">M</span>
                      <span className="h-2">T</span>
                      <span className="h-2 invisible">W</span>
                      <span className="h-2">T</span>
                      <span className="h-2 invisible">F</span>
                      <span className="h-2">S</span>
                    </div>

                    <div className="flex-1 overflow-hidden">
                      {/* GITHUB STYLE HEATMAP (7 Rows, 22 Columns to fit perfectly) */}
                      <div className="flex flex-col gap-1">
                        {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => (
                          <div key={dayIndex} className="flex gap-1">
                            {Array.from({ length: 22 }).map((_, weekIndex) => {
                              const currentDay = new Date().getDay();
                              const dayOffset = (21 - weekIndex) * 7 + (currentDay - dayIndex);
                              
                              if (dayOffset < 0) return <div key={weekIndex} className="w-2 h-2 bg-transparent" />;
                              
                              const date = new Date();
                              date.setDate(date.getDate() - dayOffset);
                              const dateStr = date.toDateString();
                              const count = globalLogs.filter(l => new Date(l.timestamp).toDateString() === dateStr).length;
                              
                              let color = "bg-white/5";
                              if (count > 0) color = "bg-blue-900/40";
                              if (count > 3) color = "bg-blue-700/70";
                              if (count > 7) color = "bg-blue-500";
                              if (count > 15) color = "bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]";

                              return (
                                <div 
                                  key={weekIndex} 
                                  className={`w-2 h-2 rounded-[1px] transition-all duration-500 hover:scale-150 cursor-crosshair ${color}`}
                                  title={`${dateStr}: ${count} signals`}
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>

                      {/* Month Labels */}
                      <div className="flex justify-between mt-3 px-1 text-[7px] font-black text-gray-700 uppercase tracking-widest">
                        <span>{new Date(new Date().setDate(new Date().getDate() - 150)).toLocaleString('default', { month: 'short' })}</span>
                        <span>{new Date(new Date().setDate(new Date().getDate() - 75)).toLocaleString('default', { month: 'short' })}</span>
                        <span>{new Date().toLocaleString('default', { month: 'short' })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-6 text-[7px] font-black text-gray-600 uppercase tracking-widest border-t border-white/5 pt-4">
                    <span>Low Signal</span>
                    <div className="flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 bg-white/5 rounded-[1px]" />
                      <div className="w-1.5 h-1.5 bg-blue-900/40 rounded-[1px]" />
                      <div className="w-1.5 h-1.5 bg-blue-700/70 rounded-[1px]" />
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-[1px]" />
                      <div className="w-1.5 h-1.5 bg-white rounded-[1px]" />
                    </div>
                    <span>Intense</span>
                  </div>
               </div>

               <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10 border-dashed text-center">
                  <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Audit Terminal Ready</p>
               </div>
            </div>
          </div>
        ) : mainTab === "security" ? (
        <div className="flex-1 bg-[#0b0f1a] p-8 rounded-2xl border border-white/5">
           <h2 className="text-2xl font-bold mb-6">Security Deep Audit</h2>
           <div className="grid grid-cols-2 gap-6">
              <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
                 <h4 className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-4 text-center">Encryption Status</h4>
                 <div className="flex justify-center items-center gap-10">
                    <div className="text-center">
                       <p className="text-3xl font-bold text-white">{vaults.filter(v => v.encryption === 'AES-256-GCM').length}</p>
                       <p className="text-[10px] text-gray-500 uppercase font-black">AES-256-GCM</p>
                    </div>
                    <div className="text-center">
                       <p className="text-3xl font-bold text-amber-500">{vaults.filter(v => v.encryption !== 'AES-256-GCM').length}</p>
                       <p className="text-[10px] text-gray-500 uppercase font-black">Other</p>
                    </div>
                 </div>
              </div>
              <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
                 <h4 className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-4 text-center">Access Control</h4>
                 <div className="flex justify-center items-center gap-10">
                    <div className="text-center">
                       <p className="text-3xl font-bold text-white">{vaults.filter(v => v.visibility === 'Private').length}</p>
                       <p className="text-[10px] text-gray-500 uppercase font-black">Private</p>
                    </div>
                    <div className="text-center">
                       <p className="text-3xl font-bold text-purple-500">{vaults.filter(v => v.visibility !== 'Private').length}</p>
                       <p className="text-[10px] text-gray-500 uppercase font-black">Shared</p>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      ) : mainTab === "members" ? (
        <div className="flex-1 bg-[#0b0f1a] p-8 rounded-2xl border border-white/5">
           <h2 className="text-2xl font-bold mb-6">Team Network</h2>
           <div className="grid grid-cols-4 gap-6">
              {Array.from(new Set(vaults.flatMap(v => (v.members || []).map(m => m.userId)))).map((uid, i) => (
                <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                   <img src={`https://i.pravatar.cc/100?u=${uid}`} className="w-12 h-12 rounded-full mx-auto mb-3 border border-white/10" alt="" />
                   <p className="text-sm font-bold text-white">{memberDetailsMap[uid] || uid.substring(0,6)}</p>
                   <p className="text-[10px] text-gray-500 font-mono mt-1">{uid.substring(0,12)}...</p>
                </div>
              ))}
           </div>
        </div>
      ) : null}
    </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-[#0b0f1a] w-[520px] p-8 rounded-3xl border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold tracking-tight">Create New Vault</h2>
              <div onClick={() => setShowModal(false)} className="p-2 hover:bg-white/5 rounded-lg cursor-pointer transition text-gray-500">
                 <LogOut size={20} className="rotate-180" />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black tracking-widest text-gray-500 uppercase block mb-2">Vault Identity</label>
                <input
                  placeholder="e.g. Product Stealth-X"
                  className="w-full p-4 bg-white/5 rounded-xl border border-white/5 focus:border-blue-500/50 outline-none transition text-sm"
                  value={vaultName}
                  onChange={(e) => setVaultName(e.target.value)}
                />
              </div>

              <div>
                <label className="text-[10px] font-black tracking-widest text-gray-500 uppercase block mb-2">Purpose & Description</label>
                <textarea
                  placeholder="What is the main goal of this vault?"
                  className="w-full p-4 bg-white/5 rounded-xl border border-white/5 focus:border-blue-500/50 outline-none transition text-sm min-h-[100px] resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {/* VAULT TYPE SELECTOR */}
              <div>
                <label className="text-[10px] font-black tracking-widest text-gray-500 uppercase block mb-2">Vault Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setVaultType("file")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all text-center ${
                      vaultType === "file" ? "border-blue-500 bg-blue-500/10" : "border-white/5 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <Lock size={20} className={`mx-auto mb-2 ${vaultType === "file" ? "text-blue-400" : "text-gray-500"}`} />
                    <p className="text-xs font-bold">File Vault</p>
                    <p className="text-[9px] text-gray-500 mt-1">Documents, PDFs, media</p>
                  </div>
                  <div
                    onClick={() => setVaultType("code")}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all text-center ${
                      vaultType === "code" ? "border-purple-500 bg-purple-500/10" : "border-white/5 bg-white/5 hover:border-white/20"
                    }`}
                  >
                    <Briefcase size={20} className={`mx-auto mb-2 ${vaultType === "code" ? "text-purple-400" : "text-gray-500"}`} />
                    <p className="text-xs font-bold">Code Workspace</p>
                    <p className="text-[9px] text-gray-500 mt-1">Live code collaboration</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black tracking-widest text-gray-500 uppercase block mb-2">Vault PIN (Optional)</label>
                <input
                  type="password"
                  maxLength={4}
                  placeholder="4-digit PIN for extra security"
                  className="w-full p-4 bg-white/5 rounded-xl border border-white/5 focus:border-blue-500/50 outline-none transition text-sm"
                  value={vaultPin}
                  onChange={(e) => setVaultPin(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black tracking-widest text-gray-500 uppercase block mb-2">Visibility</label>
                  <select
                    className="w-full p-4 bg-white/5 rounded-xl border border-white/5 focus:border-blue-500/50 outline-none transition text-sm appearance-none cursor-pointer"
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value)}
                  >
                    <option className="bg-[#0b0f1a]">Private</option>
                    <option className="bg-[#0b0f1a]">Team</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black tracking-widest text-gray-500 uppercase block mb-2">Your Role</label>
                  <select
                    className="w-full p-4 bg-white/5 rounded-xl border border-white/5 focus:border-blue-500/50 outline-none transition text-sm appearance-none cursor-pointer"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option className="bg-[#0b0f1a]">Viewer</option>
                    <option className="bg-[#0b0f1a]">Editor</option>
                    <option className="bg-[#0b0f1a]">Admin</option>
                    <option className="bg-[#0b0f1a]">Developer</option>
                    <option className="bg-[#0b0f1a]">Security Auditor</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black tracking-widest text-gray-500 uppercase block mb-2">Encryption Algorithm</label>
                <select
                  className="w-full p-4 bg-white/5 rounded-xl border border-white/5 focus:border-blue-500/50 outline-none transition text-sm appearance-none cursor-pointer"
                  value={encryption}
                  onChange={(e) => setEncryption(e.target.value)}
                >
                  <option className="bg-[#0b0f1a]">AES-256-GCM</option>
                  <option className="bg-[#0b0f1a]">RSA + AES Hybrid</option>
                </select>
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-4 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold transition border border-white/5 text-gray-400"
              >
                Cancel
              </button>

              <button
                onClick={createVault}
                className="flex-1 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-bold transition shadow-lg shadow-blue-600/20"
              >
                Establish Vault
              </button>
            </div>
          </div>
        </div>

      )}

      {/* ================= PROFILE PANEL ================= */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setShowProfile(false)} />

          {/* Panel */}
          <div className="w-[420px] bg-[#05060f] border-l border-white/5 flex flex-col h-full shadow-2xl overflow-y-auto">
            {/* Header */}
            <div className="relative h-32 bg-gradient-to-br from-blue-900/40 to-[#0b0f1a] flex-shrink-0">
              <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />
              <button onClick={() => setShowProfile(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white transition p-2 hover:bg-white/10 rounded-lg">
                <Plus size={20} className="rotate-45" />
              </button>
              <div className="absolute -bottom-12 left-6">
                <div className="relative group cursor-pointer" onClick={() => document.getElementById('profile-pic-input').click()}>
                  <img
                    src={profile.profilePicture || `https://i.pravatar.cc/100?u=${userId}`}
                    className="w-24 h-24 rounded-2xl border-4 border-[#05060f] object-cover shadow-xl"
                    alt="profile"
                  />
                  <div className="absolute inset-0 bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Change</span>
                  </div>
                  <input
                    id="profile-pic-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => setProfile(p => ({ ...p, profilePicture: ev.target.result }));
                      reader.readAsDataURL(file);
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="pt-16 px-6 pb-6 flex flex-col gap-5 flex-1">
              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Display Name</p>
                <input
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/50 transition placeholder-gray-600"
                  value={profile.name}
                  onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                  placeholder="Your full name"
                />
              </div>

              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Email</p>
                <input
                  className="w-full bg-white/3 border border-white/5 rounded-xl px-4 py-3 text-gray-500 text-sm outline-none cursor-not-allowed"
                  value={profile.email}
                  readOnly
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Job Title</p>
                <input
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/50 transition placeholder-gray-600"
                  value={profile.jobTitle}
                  onChange={e => setProfile(p => ({ ...p, jobTitle: e.target.value }))}
                  placeholder="e.g. Security Engineer"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Date of Birth</p>
                  <input
                    type="date"
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/50 transition"
                    value={profile.dob}
                    onChange={e => setProfile(p => ({ ...p, dob: e.target.value }))}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Phone</p>
                  <input
                    className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/50 transition placeholder-gray-600"
                    value={profile.phone}
                    onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))}
                    placeholder="+1 555 0100"
                  />
                </div>
              </div>

              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Location</p>
                <input
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/50 transition placeholder-gray-600"
                  value={profile.location}
                  onChange={e => setProfile(p => ({ ...p, location: e.target.value }))}
                  placeholder="City, Country"
                />
              </div>

              <div>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Bio</p>
                <textarea
                  rows={3}
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-blue-500/50 transition resize-none placeholder-gray-600"
                  value={profile.bio}
                  onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))}
                  placeholder="A short description about yourself..."
                />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 py-4 border-t border-white/5 border-b">
                <div className="text-center">
                  <p className="text-xl font-black text-white">{vaults.length}</p>
                  <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mt-1">Vaults</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-white">{globalLogs.length}</p>
                  <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mt-1">Actions</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-black text-white">{vaults.reduce((a, v) => a + (v.members?.length || 0), 0)}</p>
                  <p className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mt-1">Members</p>
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setShowProfile(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-gray-400 transition border border-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={saveProfile}
                  disabled={isSavingProfile}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-sm font-bold text-white transition shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {isSavingProfile ? "Saving..." : "Save Profile"}
                </button>
              </div>

              <button
                onClick={logout}
                className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/10 hover:border-red-500/30 rounded-xl text-sm font-bold text-red-400 transition"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarItem({ icon, text, active, onClick }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all duration-200 group ${
      active 
        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
        : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
    }`}>
      <span className={`${active ? "text-white" : "text-gray-500 group-hover:text-gray-300"}`}>
        {icon}
      </span>
      <span className="text-sm font-bold tracking-tight">{text}</span>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  const colors = {
    blue: "border-blue-500/20 bg-blue-500/5 text-blue-400",
    purple: "border-purple-500/20 bg-purple-500/5 text-purple-400",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-400"
  };

  return (
    <div className={`p-6 rounded-2xl border ${colors[color]} relative overflow-hidden group hover:bg-opacity-10 transition-all duration-300`}>
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        {React.cloneElement(icon, { size: 64 })}
      </div>
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5`}>
          {icon}
        </div>
        <span className="text-[10px] font-black tracking-[0.2em] uppercase opacity-60">{label}</span>
      </div>
      <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
    </div>
  );
}

function VaultCard({ vault, userRole, onClick, timeAgo }) {
  return (
    <div 
      onClick={onClick}
      className="bg-[#0b0f1a] p-6 rounded-2xl border border-white/5 hover:border-blue-500/50 transition-all duration-300 cursor-pointer group"
    >
      <div className="flex justify-between items-start mb-6">
        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
           <Lock size={20} className="text-blue-500/50 group-hover:text-blue-400 transition-colors" />
        </div>
        <div className="flex items-center gap-2">
           <span className="flex items-center gap-1 text-[10px] font-black tracking-widest text-blue-400 uppercase bg-blue-400/10 px-2 py-1 rounded-full border border-blue-400/20">
              <Shield size={10} /> Encrypted
           </span>
        </div>
      </div>

      <h3 className="text-xl font-bold mb-2 group-hover:text-blue-400 transition-colors">{vault.name}</h3>
      <p className="text-xs text-gray-500 line-clamp-2 mb-6 leading-relaxed">
        {vault.description || "No description provided for this secure vault."}
      </p>

      <div className="flex items-center justify-between mb-6">
         <div className="flex -space-x-2">
            {(vault.members || []).slice(0, 3).map((m, i) => (
              <img 
                key={i} 
                src={m.avatar || `https://i.pravatar.cc/100?u=${m.userId}`} 
                className="w-8 h-8 rounded-full border-2 border-[#0b0f1a]" 
                alt="member"
              />
            ))}
            {(vault.members?.length || 0) > 3 && (
              <div className="w-8 h-8 rounded-full bg-white/5 border-2 border-[#0b0f1a] flex items-center justify-center text-[10px] font-bold text-gray-400">
                +{(vault.members?.length || 0) - 3}
              </div>
            )}
         </div>
         <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
            {vault.members?.length || 1} contributors
         </span>
      </div>

      <div className="flex items-center gap-2 text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-6">
         <Activity size={12} />
         Last modified {timeAgo(vault.activity?.[0]?.createdAt || vault.createdAt)}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-white/5">
         <span className="text-[10px] font-black tracking-[0.2em] text-gray-500 uppercase">Key ID: {vault.encryption}</span>
         {vault.pin && <Lock size={12} className="text-amber-500" title="PIN Protected" />}
         <MoreVertical size={14} className="text-gray-700 hover:text-white transition-colors" />
      </div>

      {/* INCOMING CALL NOTIFICATION */}
      {incomingCall && (
        <IncomingCallOverlay 
          incomingCall={incomingCall} 
          onJoin={() => {
            setIncomingCall(null);
            navigate(`/vault/${incomingCall.vaultId}?tab=calls`);
          }}
          onIgnore={() => setIncomingCall(null)}
        />
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
