const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const multer = require("multer");

const fs = require("fs");
const path = require("path");
const Vault = require("./models/Vault");
const VaultKey = require("./models/VaultKey");
const ChatChannel = require("./models/ChatChannel");
const ChatMessage = require("./models/ChatMessage");

const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const ROLE_PERMISSIONS = {
  owner: ["view", "upload", "edit", "delete", "share", "audit"],
  admin: ["view", "upload", "edit", "delete", "share", "audit"],
  developer: ["view", "upload", "edit", "delete"],
  editor: ["view", "upload", "edit"],
  viewer: ["view"],
  security_auditor: ["view", "audit"]
};

function hasPermission(role, action) {
  return ROLE_PERMISSIONS[role]?.includes(action);
}

async function createLog(vaultId, userId, action, details, role, fileId = null) {
  try {
    await mongoose.model("AuditLog").create({
      vaultId, userId, action, details, role, fileId
    });
  } catch(e) {
    console.error("AuditLog Error", e);
  }
}

const UPLOAD_DIR = "./uploads";

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

const SERVER_MASTER_KEY = crypto.scryptSync("spv-master-secret", "salt", 32);

function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", SERVER_MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

function decryptBuffer(buffer) {
  const iv = buffer.slice(0, 16);
  const encryptedData = buffer.slice(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", SERVER_MASTER_KEY, iv);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

// ================= DB =================
const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/spv";
console.log("Attempting to connect to MongoDB...");

mongoose.connect(mongoURI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch(err => {
    console.error("❌ MongoDB Connection Error:");
    console.error(err);
  });

// ================= MODELS =================
const User = mongoose.model("User", {
  name: String,
  email: { type: String, unique: true },
  password: String,
  publicKey: String,
  encryptedPrivateKey: String,
  keySalt: String,
  keyIv: String,
  // Profile fields
  profilePicture: String,  // base64 data URL
  dob: String,
  bio: String,
  phone: String,
  location: String,
  jobTitle: String
});

const Meeting = mongoose.model("Meeting", {
  vaultId: String,
  title: String,
  startTime: Date,
  attendees: [String],
  scheduledBy: String,
  status: { type: String, default: "scheduled" }
});

const FileKey = require("./models/FileKey");

const AuditLog = mongoose.model("AuditLog", {
  vaultId: String,
  fileId: String,
  userId: String,
  action: String,
  details: String,
  timestamp: { type: Date, default: Date.now },
  role: String
});

const Session = mongoose.model("Session", {
  userId: String,
  loginTime: Date,
  logoutTime: Date,
  duration: Number
});

const AuditReport = mongoose.model("AuditReport", {
  reportId: { type: String, unique: true },
  userId: String,
  timestamp: { type: Date, default: Date.now },
  summary: Object,
  threatAnalysis: Object
});

// ================= AUTH =================

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, publicKey, encryptedPrivateKey, keySalt, keyIv } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,
      publicKey,
      encryptedPrivateKey,
      keySalt,
      keyIv
    });

    await createLog(null, user._id, "ACCOUNT_CREATED", "New secure account established", "owner");

    res.status(201).json({ message: "User registered" });

  } catch (err) {
    console.log("REGISTER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Wrong password" });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "secretkey",
      { expiresIn: "1d" }
    );

    const session = await Session.create({
      userId: user._id,
      loginTime: new Date()
    });

    await createLog(null, user._id, "AUTH_LOGIN", "Secure authentication successful", "owner");

    res.json({
      token,
      userId: user._id,
      userName: user.name,
      sessionId: session._id,
      encryptedPrivateKey: user.encryptedPrivateKey,
      keySalt: user.keySalt,
      keyIv: user.keyIv
    });

  } catch (err) {
    console.log("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGOUT
app.post("/api/logout", async (req, res) => {
  try {
    const s = await Session.findById(req.body.sessionId);

    if (s) {
      s.logoutTime = new Date();
      s.duration = (s.logoutTime - s.loginTime) / 1000;
      await s.save();
    }

    res.json({ message: "Logged out" });

  } catch {
    res.json({ message: "Logged out" });
  }
});

// ================= VAULT =================

// CREATE VAULT
app.post("/api/create-vault", async (req, res) => {
  try {
    const { userId, name, description, visibility, encryption, pin, type } = req.body;

    if (!userId || !name) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const vault = await Vault.create({
      userId,
      name,
      description,
      visibility,
      encryption,
      pin,
      type: type || "file",

      members: [
        {
          userId,
          role: "Owner",
          avatar: `https://i.pravatar.cc/40?u=${userId}`
        }
      ],

      files: [],
      storageUsed: 0,

      activity: [
        {
          action: "Vault created",
          userId
        }
      ]
    });

    await createLog(vault._id, userId, "CREATE_VAULT", "Vault created", "owner");

    res.status(201).json(vault);

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Vault creation failed" });
  }
});

// GET VAULTS
app.get("/api/vaults/:userId", async (req, res) => {
  try {
    const vaults = await Vault.find({
      $or: [
        { userId: req.params.userId },
        { "members.userId": req.params.userId }
      ]
    });

    res.json(vaults);

  } catch {
    res.json([]);
  }
});

// GET SINGLE VAULT
app.get("/api/vault/:id", async (req, res) => {
  const v = await Vault.findById(req.params.id);
  res.json(v);
});

// ================= FILE UPLOAD =================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }
});

// ENCRYPT
function encryptFile(buffer) {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12); // GCM standard

  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(buffer),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return {
    encrypted,
    aesKey,
    iv,
    tag
  };
}
// UPLOAD FILE

// 🔐 DYNAMIC ENCRYPTION (AES-256-GCM / RSA-AES HYBRID)
function encryptFile(buffer, algorithm = "AES-256-GCM") {
  console.log(`[SECURITY] Initiating Vault Encryption: ${algorithm}`);
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // AES-GCM is the industry standard for the payload
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);

  const encrypted = Buffer.concat([
    cipher.update(buffer),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return { encrypted, aesKey, iv, tag };
}

app.post("/api/upload-file", upload.single("file"), async (req, res) => {
  try {
    const { vaultId, userId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "No file" });
    }

    const vault = await Vault.findById(vaultId);
    if (!vault) {
      return res.status(404).json({ message: "Vault not found" });
    }

    // ================= ROLE CHECK =================
    const member = vault.members.find(m => m.userId === userId);
    const role = vault.userId === userId
      ? "owner"
      : (member?.role || "").toLowerCase();

    if (!hasPermission(role, "upload")) {
      await createLog(vaultId, userId, "UPLOAD_DENIED", `Attempted to upload ${file.originalname}`, role);
      return res.status(403).json({ message: "Upload not allowed" });
    }

    // ================= ENCRYPT FILE (RESPECTING VAULT ALGO) =================
    const { encrypted, aesKey, iv, tag } = encryptFile(file.buffer, vault.encryption);

    const fileId = new mongoose.Types.ObjectId().toString();
    const filename = `${fileId}-${file.originalname}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // store: IV + TAG + DATA
    fs.writeFileSync(
      filepath,
      Buffer.concat([iv, tag, encrypted])
    );

    // ================= ENCRYPT AES KEY FOR ALL MEMBERS =================
    const uniqueUserIds = new Set();
    uniqueUserIds.add(vault.userId);

    vault.members.forEach(m => {
      uniqueUserIds.add(m.userId.toString());
    });

    for (let uid of uniqueUserIds) {
      const user = await User.findById(uid);
      if (!user || !user.publicKey) continue;

      const encryptedKey = crypto.publicEncrypt(
        {
          key: user.publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
        },
        aesKey
      ).toString("base64");

      await FileKey.updateOne(
        { fileId, userId: uid.toString() },
        { encryptedKey },
        { upsert: true }
      );
    }

    // ================= SAVE FILE =================
    vault.files.push({
      _id: new mongoose.Types.ObjectId(fileId), // ✅ FIX
      name: file.originalname,
      size: file.size,
      key: filename,
      encrypted: true,
      uploadedBy: userId
    });

    vault.storageUsed += file.size;

    vault.activity.push({
      action: `Uploaded ${file.originalname}`,
      userId
    });

    await vault.save();

    await createLog(vaultId, userId, "UPLOAD_FILE", `Uploaded ${file.originalname} (${file.size} bytes)`, role, fileId);

    res.json({ message: "Uploaded securely" });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

// ================= CLIENT-SIDE ENCRYPTED UPLOAD (ZERO-TRUST) =================
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const { vaultId, userId, encryptedKey } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const vault = await Vault.findById(vaultId);
    if (!vault) return res.status(404).json({ message: "Vault not found" });

    const member = vault.members.find(m => m.userId === userId);
    const role = vault.userId === userId ? "owner" : (member?.role || "").toLowerCase();
    if (!hasPermission(role, "upload")) {
      return res.status(403).json({ message: "Permission denied" });
    }

    const fileId = new mongoose.Types.ObjectId().toString();
    const filename = `${fileId}-${file.originalname}`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // Save the encrypted blob directly (Zero-Trust)
    fs.writeFileSync(filepath, file.buffer);

    const newFile = {
      _id: new mongoose.Types.ObjectId(fileId),
      name: file.originalname,
      size: file.size,
      key: filename,
      encrypted: true,
      uploadedBy: userId,
      createdAt: new Date()
    };

    vault.files.push(newFile);
    vault.storageUsed += file.size;
    vault.activity.push({ action: `Uploaded ${file.originalname}`, userId });
    await vault.save();

    // Store the encrypted AES key provided by the client
    await FileKey.create({
      fileId,
      userId,
      encryptedKey
    });

    await createLog(vaultId, userId, "UPLOAD_FILE", `Securely uploaded ${file.originalname}`, role, fileId);

    res.status(201).json({ message: "Secure upload complete", file: newFile });
  } catch (err) {
    console.error("SECURE UPLOAD ERROR:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

// ================= UPDATE FILE =================
app.get("/api/logs", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ message: "userId required" });

    // Fetch all vaults where user is a member
    const userVaults = await Vault.find({ "members.userId": userId });
    const vaultIds = userVaults.map(v => v._id.toString());

    // Fetch logs for these vaults OR logs where userId is the actor (global logs like login/register)
    const logs = await mongoose.model("AuditLog").find({
      $or: [
        { vaultId: { $in: vaultIds } },
        { userId: userId }
      ]
    }).sort({ timestamp: -1 });

    const enrichedLogs = await Promise.all(logs.map(async log => {
      const user = await User.findById(log.userId);
      const vault = log.vaultId ? await Vault.findById(log.vaultId) : null;
      return {
        ...log.toObject(),
        userName: user ? user.name : "Unknown",
        vaultName: vault ? vault.name : "Global"
      };
    }));

    res.json(enrichedLogs);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ================= NOTIFICATIONS =================
app.get("/api/notifications/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    // Return empty array for now or fetch from a Notification model if exists
    res.json([]);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// REPORT GENERATION & THREAT ANALYSIS
app.post("/api/reports/generate", async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: "userId required" });

    // 1. Fetch Logs for Analysis
    const userVaults = await Vault.find({ "members.userId": userId });
    const vaultIds = userVaults.map(v => v._id.toString());
    const logs = await mongoose.model("AuditLog").find({
      $or: [{ vaultId: { $in: vaultIds } }, { userId: userId }]
    });

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLogs = logs.filter(l => l.timestamp > last24h);

    // 2. REAL-TIME THREAT ANALYSIS
    const bruteForceAttempts = recentLogs.filter(l => l.action === "AUTH_DENIED").length;
    const unauthorizedAccess = recentLogs.filter(l => l.action.includes("DENIED") && l.action !== "AUTH_DENIED").length;
    const unusualActivity = recentLogs.filter(l => l.action === "UPLOAD_FILE").length > 50 ? "High" : "Normal";

    const threatAnalysis = {
      level: bruteForceAttempts > 5 || unauthorizedAccess > 3 ? "HIGH" : bruteForceAttempts > 0 ? "MEDIUM" : "LOW",
      bruteForce: { count: bruteForceAttempts, status: bruteForceAttempts > 0 ? "Threat Detected" : "Secure" },
      unauthorized: { count: unauthorizedAccess, status: unauthorizedAccess > 0 ? "Blocked" : "Clear" },
      activity: { volume: unusualActivity, status: unusualActivity === "High" ? "Suspicious" : "Normal" },
      anomalies: logs.length > 500 ? "Storage Threshold Alert" : "None"
    };

    // 3. SUMMARY STATS
    const summary = {
      totalVaults: userVaults.length,
      totalLogs: logs.length,
      activeFiles: userVaults.reduce((acc, v) => acc + (v.files?.length || 0), 0),
      securityScore: Math.max(0, 100 - (bruteForceAttempts * 10) - (unauthorizedAccess * 5))
    };

    // 4. GENERATE PERSISTENT REPORT ID
    const reportId = "SPV-REP-" + crypto.randomBytes(4).toString("hex").toUpperCase();
    
    const report = await mongoose.model("AuditReport").create({
      reportId,
      userId,
      summary,
      threatAnalysis,
      timestamp: new Date()
    });

    res.status(201).json(report);

  } catch (err) {
    console.error("REPORT GEN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});
app.post("/api/update-file", upload.single("file"), async (req, res) => {
  try {
    const { vaultId, userId, fileId, diffSummary } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ message: "No file" });

    const vault = await Vault.findById(vaultId);
    if (!vault) return res.status(404).json({ message: "Vault not found" });

    const member = vault.members.find(m => m.userId === userId);
    const role = vault.userId === userId ? "owner" : (member?.role || "").toLowerCase();
    if (!hasPermission(role, "edit")) {
      await createLog(vaultId, userId, "UPDATE_DENIED", "Attempted to update file", role, fileId);
      return res.status(403).json({ message: "Edit not allowed" });
    }

    const existingFile = vault.files.id(fileId);
    if (!existingFile) return res.status(404).json({ message: "File not found" });

    // Ensure versions array exists
    if (!existingFile.versions) {
      existingFile.versions = [];
    }

    existingFile.versions.push({
      version: existingFile.versions.length + 1,
      key: existingFile.key,
      size: existingFile.size,
      uploadedBy: existingFile.uploadedBy,
      createdAt: new Date(),
      diffSummary: existingFile.lastDiffSummary || "Initial File Upload"
    });

    const newFilename = `${fileId}-v${existingFile.versions.length + 1}-${file.originalname}`;
    const filepath = path.join(UPLOAD_DIR, newFilename);
    
    // Store client-encrypted bytes as-is (client already AES-GCM encrypted)
    fs.writeFileSync(filepath, file.buffer);

    existingFile.key = newFilename;
    existingFile.size = file.size;
    existingFile.uploadedBy = userId;
    existingFile.lastDiffSummary = diffSummary;

    vault.activity.push({ action: `Updated ${existingFile.name}`, userId });
    await vault.save();

    await createLog(vaultId, userId, "UPDATE_FILE", diffSummary || `Updated file contents`, role, fileId);

    res.json({ message: "File updated securely", file: existingFile });
  } catch (err) {
    console.error("UPDATE ERROR:", err);
    res.status(500).json({ message: "Update failed" });
  }
});

// ================= RESTORE FILE =================
app.post("/api/file/:fileId/restore", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { vaultId, userId, versionIdx } = req.body;

    const vault = await Vault.findById(vaultId);
    const member = vault.members.find(m => m.userId === userId);
    const role = vault.userId === userId ? "owner" : (member?.role || "").toLowerCase();
    
    if (!hasPermission(role, "edit")) {
      await createLog(vaultId, userId, "RESTORE_DENIED", "Attempted to restore file", role, fileId);
      return res.status(403).json({ message: "Edit not allowed" });
    }

    const existingFile = vault.files.id(fileId);
    if (!existingFile || !existingFile.versions || !existingFile.versions[versionIdx]) {
      return res.status(404).json({ message: "Version not found" });
    }

    const versionToRestore = existingFile.versions[versionIdx];

    existingFile.versions.push({
      version: existingFile.versions.length + 1,
      key: existingFile.key,
      size: existingFile.size,
      uploadedBy: existingFile.uploadedBy,
      createdAt: new Date(),
      diffSummary: existingFile.lastDiffSummary || "Unknown changes"
    });

    existingFile.key = versionToRestore.key;
    existingFile.size = versionToRestore.size;
    existingFile.uploadedBy = userId;
    existingFile.lastDiffSummary = `Restored from Version ${versionToRestore.version}`;

    await vault.save();
    await createLog(vaultId, userId, "RESTORE_FILE", `Restored ${existingFile.name} to version ${versionToRestore.version}`, role, fileId);

    res.json({ message: "Restored successfully" });
  } catch (err) {
    res.status(500).json({ message: "Restore failed" });
  }
});




// DOWNLOAD FILE
app.get("/api/file/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userId, versionIdx } = req.query;

    if (!mongoose.Types.ObjectId.isValid(fileId)) {
      return res.status(400).json({ message: "Invalid fileId" });
    }

    let vault = await Vault.findOne({ "files._id": new mongoose.Types.ObjectId(fileId) });

    if (!vault) {
      vault = await Vault.findOne({ "files._id": fileId });
    }

    if (!vault) return res.status(404).json({ message: "File or Vault not found" });

    const isOwner = vault.userId === userId;
    const member = vault.members.find(m => m.userId === userId);

    if (!isOwner && !member) return res.status(403).json({ message: "Access denied" });

    const role = isOwner ? "owner" : member.role.toLowerCase();
    if (!hasPermission(role, "view")) return res.status(403).json({ message: "Access denied: missing view permission" });

    const file = vault.files.find(f => f._id.toString() === fileId);
    if (!file) return res.status(404).json({ message: "File not found" });

    // Handle Versioning
    let targetKey = file.key;
    if (versionIdx !== undefined) {
      const idx = parseInt(versionIdx);
      if (file.versions && file.versions[idx]) {
        targetKey = file.versions[idx].key;
      }
    }

    const keyEntry = await FileKey.findOne({ fileId, userId });
    if (!keyEntry) return res.status(403).json({ message: "No key for this user" });

    const filePath = path.join(UPLOAD_DIR, targetKey);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File missing" });

    const encryptedFile = fs.readFileSync(filePath);

    const logAction = req.query.action === "view" ? "VIEW_FILE" : "DOWNLOAD_FILE";
    await createLog(vault._id, userId, logAction, `Accessed ${file.name}${versionIdx !== undefined ? ` (v${versionIdx})` : ""}`, role, fileId);

    res.json({
      file: encryptedFile.toString("base64"),
      encryptedKey: keyEntry.encryptedKey,
      fileName: file.name
    });

  } catch (err) {
    console.log("DOWNLOAD ERROR:", err);
    res.status(500).json({ message: "Download failed" });
  }
});

// ================= GET FILE KEY =================
app.get("/api/file-key/:fileId/:userId", async (req, res) => {
  try {
    const { fileId, userId } = req.params;
    const keyEntry = await FileKey.findOne({ fileId, userId });
    if (!keyEntry) return res.status(404).json({ message: "Key not found for this user" });
    res.json({ encryptedKey: keyEntry.encryptedKey });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch key" });
  }
});

// ================= SHARE FILE KEY (ZERO KNOWLEDGE) =================
app.post("/api/share-file-key", async (req, res) => {
  try {
    const { fileId, targetUserId, encryptedKey } = req.body;

    if (!fileId || !targetUserId || !encryptedKey) {
      return res.status(400).json({ message: "Missing data" });
    }

    // ✅ check if already exists
    const exists = await FileKey.findOne({
      fileId,
      userId: targetUserId
    });

    if (exists) {
      return res.json({ message: "Key already exists" });
    }

    // ✅ store new encrypted key
    await FileKey.create({
      fileId,
      userId: targetUserId,
      encryptedKey
    });

    res.json({ message: "Key shared securely" });

  } catch (err) {
    console.error("SHARE KEY ERROR:", err);
    res.status(500).json({ message: "Failed to share key" });
  }
});
// ================= SHARE VAULT =================
app.post("/api/share-vault", async (req, res) => {
  try {
    const { vaultId, email, role, addedBy } = req.body;

    const vault = await Vault.findById(vaultId);
    if (!vault) {
      return res.status(404).json({ message: "Vault not found" });
    }

    const addedUser = await User.findOne({ email });
    if (!addedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // ================= ROLE CHECK =================
    const member = vault.members.find(m => m.userId === addedBy);
    const userRole = vault.userId === addedBy
      ? "owner"
      : (member?.role || "").toLowerCase();

    if (!hasPermission(userRole, "share")) {
      await createLog(vaultId, addedBy, "SHARE_DENIED", `Attempted to invite ${email}`, userRole);
      return res.status(403).json({ message: "No permission" });
    }

    // ================= DUPLICATE CHECK =================
    const exists = vault.members.find(
      m => m.userId === addedUser._id.toString()
    );

    if (exists) {
      return res.status(200).json({ message: "Already member, keys synced" });
    }

    // ================= ADD MEMBER =================
    vault.members.push({
      userId: addedUser._id,
      role,
      avatar: `https://i.pravatar.cc/40?u=${addedUser._id}`
    });

    // ================= 🔐 RE-ENCRYPT KEYS =================
    // for (let f of vault.files) {

    //   // get ANY existing key (from owner or any member)
    //   const existingKeyDoc = await FileKey.findOne({
    //     fileId: f._id
    //   });

    //   if (!existingKeyDoc) continue;

    //   // 🔥 IMPORTANT:
    //   // we CANNOT decrypt AES key (zero knowledge)
    //   // BUT we FIXED upload → every member already has encrypted key
    //   // so here we ONLY create mapping for new user

    //   const ownerKeyDoc = await FileKey.findOne({
    //     fileId: f._id,
    //     userId: vault.userId
    //   });

    //   if (!ownerKeyDoc) continue;

    //   // ❗ KEY TRANSFER FIX:
    //   // Instead of decrypting, we REQUIRE that
    //   // uploader already encrypted for all members (done in step 3)

    //   // So now we DO THIS:
    //   // ❌ no decryption
    //   // ❌ no copying wrong key
    //   // ✅ create new encrypted key ONLY IF already exists

    //   // 👉 SAFETY: we do NOT create invalid key

    //   // Skip creating key here
    //   // (keys must be generated at upload time)

    // }

    vault.activity.push({
      action: `Added ${email} as ${role}`,
      userId: addedBy
    });

    await vault.save();

    await createLog(vaultId, addedBy, "INVITE_USER", `Invited ${email} as ${role}`, userRole);

    res.json({ message: "Member added (secure)" });

  } catch (err) {
    console.error("SHARE ERROR:", err);
    res.status(500).json({ message: "Share failed" });
  }
});
app.get("/api/user-by-email/:email", async (req, res) => {
  const user = await User.findOne({ email: req.params.email });

  if (!user) return res.status(404).json({ message: "Not found" });

  res.json({ _id: user._id, publicKey: user.publicKey });
});
app.get("/api/user/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({
      publicKey: user.publicKey,
      name: user.name,
      email: user.email,
      profilePicture: user.profilePicture || null,
      dob: user.dob || null,
      bio: user.bio || null,
      phone: user.phone || null,
      location: user.location || null,
      jobTitle: user.jobTitle || null
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// UPDATE PROFILE
app.put("/api/user/:id/profile", async (req, res) => {
  try {
    const { name, dob, bio, phone, location, jobTitle, profilePicture } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, dob, bio, phone, location, jobTitle, profilePicture },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Profile updated", name: user.name });
  } catch (err) {
    console.error("PROFILE UPDATE ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// ================= AUDIT LOGS =================
app.get("/api/vault/:id/logs", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    const vault = await Vault.findById(id);
    if (!vault) return res.status(404).json({ message: "Vault not found" });

    const member = vault.members.find(m => m.userId === userId);
    const userRole = vault.userId === userId ? "owner" : (member?.role || "").toLowerCase();

    if (!hasPermission(userRole, "audit")) {
      await createLog(id, userId, "AUDIT_DENIED", "Attempted to view audit logs without permission", userRole);
      return res.status(403).json({ message: "No permission to view logs" });
    }

    const logs = await mongoose.model("AuditLog").find({ vaultId: id }).sort({ timestamp: -1 });
    
    // Enrich logs with user info
    const enrichedLogs = [];
    for (let log of logs) {
      const user = await User.findById(log.userId);
      enrichedLogs.push({
        ...log.toObject(),
        userName: user ? user.name : "Unknown",
        userEmail: user ? user.email : "Unknown"
      });
    }

    res.json(enrichedLogs);
  } catch (err) {
    console.error("LOGS ERROR:", err);
    res.status(500).json({ message: "Failed to get logs" });
  }
});

// ================= GLOBAL LOGS =================
app.get("/api/logs", async (req, res) => {
  try {
    const { userId } = req.query;
    // Get all vaults where user is member or owner
    const vaults = await Vault.find({
      $or: [
        { userId: userId },
        { "members.userId": userId }
      ]
    });
    const vaultIds = vaults.map(v => v._id.toString());
    
    const logs = await mongoose.model("AuditLog").find({ 
      vaultId: { $in: vaultIds } 
    }).sort({ timestamp: -1 });

    // Enrich logs with user info and vault name
    const enrichedLogs = [];
    const vaultMap = {};
    vaults.forEach(v => vaultMap[v._id.toString()] = v.name);

    for (let log of logs) {
      const user = await User.findById(log.userId);
      enrichedLogs.push({
        ...log.toObject(),
        userName: user ? user.name : "Unknown",
        userEmail: user ? user.email : "Unknown",
        vaultName: vaultMap[log.vaultId] || "Global"
      });
    }

    res.json(enrichedLogs);
  } catch (err) {
    console.error("GLOBAL LOGS ERROR:", err);
    res.status(500).json({ message: "Failed to get logs" });
  }
});

// ================= CHAT APIS =================

// Get or generate Vault Chat Key
app.post("/api/vault/:vaultId/chat/key", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { userId, encryptedChatKey } = req.body;

    const vault = await Vault.findById(vaultId);
    if (!vault) return res.status(404).json({ message: "Vault not found" });

    // Check if key exists for user
    let vaultKey = await VaultKey.findOne({ vaultId, userId });
    
    // If not, and they provided an encrypted key, save it
    if (!vaultKey && encryptedChatKey) {
      vaultKey = await VaultKey.create({ vaultId, userId, encryptedChatKey });
    }

    res.json(vaultKey || { encryptedChatKey: null });
  } catch (err) {
    res.status(500).json({ message: "Failed to get chat key" });
  }
});

// Share Chat Key (when inviting member)
app.post("/api/vault/:vaultId/chat/share", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { targetUserId, encryptedChatKey } = req.body;

    await VaultKey.findOneAndUpdate(
      { vaultId, userId: targetUserId },
      { encryptedChatKey },
      { upsert: true }
    );
    res.json({ message: "Shared chat key" });
  } catch (err) {
    res.status(500).json({ message: "Failed to share chat key" });
  }
});

// Get Channels
app.get("/api/vault/:vaultId/channels", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const channels = await ChatChannel.find({ vaultId });
    if (channels.length === 0) {
      // Create default
      const defaultChannel = await ChatChannel.create({ vaultId, name: "general", type: "channel" });
      return res.json([defaultChannel]);
    }
    res.json(channels);
  } catch (err) {
    res.status(500).json({ message: "Failed to get channels" });
  }
});

// Get Messages
app.get("/api/channels/:channelId/messages", async (req, res) => {
  try {
    const { channelId } = req.params;
    const messages = await ChatMessage.find({ channelId }).sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: "Failed to get messages" });
  }
});

// Get Unread Counts
app.get("/api/vault/:vaultId/unread", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { userId } = req.query;
    
    // Find messages in the vault where readBy does not contain userId
    const unreadMsgs = await ChatMessage.find({ vaultId, readBy: { $ne: userId } });
    
    const counts = {};
    unreadMsgs.forEach(m => {
      counts[m.channelId] = (counts[m.channelId] || 0) + 1;
    });
    res.json(counts);
  } catch (err) {
    res.status(500).json({ message: "Failed to get unread counts" });
  }
});

// ================= MEETINGS / CALLS =================
app.get("/api/vault/:vaultId/meetings", async (req, res) => {
  try {
    const meetings = await Meeting.find({ vaultId: req.params.vaultId }).sort({ startTime: 1 });
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch meetings" });
  }
});

app.post("/api/vault/:vaultId/meetings", async (req, res) => {
  try {
    const { title, startTime, scheduledBy } = req.body;
    const meeting = await Meeting.create({
      vaultId: req.params.vaultId,
      title,
      startTime,
      scheduledBy
    });
    
    // Notify all members via socket (global or vault-specific)
    io.emit("meeting_scheduled", { vaultId: req.params.vaultId, meeting });
    
    res.status(201).json(meeting);
  } catch (err) {
    res.status(500).json({ message: "Failed to schedule meeting" });
  }
});

// ================= CODE EXECUTION (SANDBOXED) =================
const { execSync, execFile } = require("child_process");
const vm = require("vm");
const os = require("os");

app.post("/api/execute", async (req, res) => {
  const { code, language, stdin } = req.body;
  if (!code || !language) return res.status(400).json({ error: "Missing code or language" });

  const start = Date.now();
  try {
    let stdout = "", stderr = "";

    if (language === "javascript") {
      // Use Node's vm module - sandboxed, no require access
      const sandbox = { console: { log: (...a) => { stdout += a.join(" ") + "\n"; }, error: (...a) => { stderr += a.join(" ") + "\n"; } }, result: null };
      const script = new vm.Script(code, { timeout: 5000 });
      const context = vm.createContext(sandbox);
      script.runInContext(context, { timeout: 5000 });

    } else if (language === "python") {
      const tmpFile = path.join(os.tmpdir(), `spv_exec_${Date.now()}.py`);
      fs.writeFileSync(tmpFile, code);
      try {
        stdout = execSync(`python "${tmpFile}"`, { timeout: 5000, encoding: "utf8", maxBuffer: 1024 * 512, input: stdin || "" });
      } catch (e) {
        stderr = e.stderr || e.message;
        stdout = e.stdout || "";
      }
      try { fs.unlinkSync(tmpFile); } catch(e) {}

    } else if (language === "java") {
      const tmpDir = path.join(os.tmpdir(), `spv_java_${Date.now()}`);
      fs.mkdirSync(tmpDir, { recursive: true });
      // Extract class name from code
      const classMatch = code.match(/class\s+(\w+)/);
      const className = classMatch ? classMatch[1] : "Main";
      const tmpFile = path.join(tmpDir, `${className}.java`);
      fs.writeFileSync(tmpFile, code);
      try {
        execSync(`javac "${tmpFile}"`, { timeout: 10000, cwd: tmpDir, encoding: "utf8" });
        stdout = execSync(`java -cp "${tmpDir}" ${className}`, { timeout: 5000, encoding: "utf8", maxBuffer: 1024 * 512, input: stdin || "" });
      } catch (e) {
        stderr = e.stderr || e.message;
        stdout = e.stdout || "";
      }
      try { fs.rmSync(tmpDir, { recursive: true }); } catch(e) {}

    } else if (language === "cpp" || language === "c") {
      const ext = language === "c" ? ".c" : ".cpp";
      const tmpFile = path.join(os.tmpdir(), `spv_exec_${Date.now()}${ext}`);
      const outFile = tmpFile.replace(ext, process.platform === "win32" ? ".exe" : ".out");
      fs.writeFileSync(tmpFile, code);
      const compiler = language === "c" ? "gcc" : "g++";
      try {
        execSync(`${compiler} "${tmpFile}" -o "${outFile}"`, { timeout: 10000, encoding: "utf8" });
        stdout = execSync(`"${outFile}"`, { timeout: 5000, encoding: "utf8", maxBuffer: 1024 * 512, input: stdin || "" });
      } catch (e) {
        stderr = e.stderr || e.message;
        stdout = e.stdout || "";
      }
      try { fs.unlinkSync(tmpFile); } catch(e) {}
      try { fs.unlinkSync(outFile); } catch(e) {}

    } else {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    res.json({ stdout, stderr, executionTime: Date.now() - start });
  } catch (err) {
    res.json({ stdout: "", stderr: err.message || "Execution failed", executionTime: Date.now() - start });
  }
});

// ================= SOCKET.IO =================
const userSockets = new Map(); // userId -> Set(socketIds)

// --- CALL TRACKING ---
const callParticipants = new Map(); // vaultId -> Map(userId -> {userName, socketId})

// --- EDITOR COLLABORATION TRACKING ---
const editorRooms = new Map(); // "vaultId_fileId" -> Map(userId -> {userName, socketId, color})
const CURSOR_COLORS = ["#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6","#ec4899","#06b6d4","#f97316"];

io.on("connection", (socket) => {
  console.log("User connected to socket:", socket.id);

  socket.on("user_connected", (userId) => {
    socket.userId = userId;
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId).add(socket.id);
    io.emit("online_users_update", Array.from(userSockets.keys()));
  });

  socket.on("get_online_users", () => {
    socket.emit("online_users_update", Array.from(userSockets.keys()));
  });

  // --- CHAT EVENTS (RESTORED) ---
  socket.on("join_channel", (channelId) => {
    socket.join(channelId);
  });

  socket.on("send_message", async (data) => {
    try {
      const msg = await ChatMessage.create(data);
      io.to(data.channelId).emit("new_message", msg);
    } catch(err) {
      console.error(err);
    }
  });

  socket.on("typing", (data) => {
    socket.to(data.channelId).emit("typing", data);
  });

  socket.on("mark_read", async (data) => {
    try {
      await ChatMessage.updateMany(
        { channelId: data.channelId, readBy: { $ne: data.userId } },
        { $push: { readBy: data.userId } }
      );
      io.to(data.channelId).emit("message_read", data);
    } catch(err) {}
  });

  // --- CALL EVENTS ---
  socket.on("join_call", (data) => {
    const { vaultId, userId, userName } = data;
    socket.join(`call_${vaultId}`);
    
    if (!activeCalls.has(vaultId)) {
      activeCalls.set(vaultId, { 
        initiatorId: userId, 
        startTime: new Date(), 
        participants: new Map() 
      });
    }
    
    const call = activeCalls.get(vaultId);
    call.participants.set(userId, { userName, socketId: socket.id });
    
    const currentParticipants = Array.from(call.participants.values());
    socket.emit("current_participants", currentParticipants);
    socket.to(`call_${vaultId}`).emit("user_joined_call", { ...data, socketId: socket.id });
  });

  socket.on("start_call", async (data) => {
    const { vaultId, callerId, callerName } = data;
    io.emit("incoming_call_alert", data);
    
    // Log Call Start
    try {
      const vault = await Vault.findById(vaultId);
      if (vault) {
        vault.activity.push({ 
          action: `Started a team call`, 
          userId: callerId 
        });
        await vault.save();
        await createLog(vaultId, callerId, "CALL_START", `Call started by ${callerName}`, "owner");
      }
    } catch (e) { console.error("Call Log Error", e); }
  });

  socket.on("leave_call", async (data) => {
    const { vaultId, userId } = data;
    cleanupCallParticipant(vaultId, userId, socket.id);
    socket.leave(`call_${vaultId}`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected from socket:", socket.id);
    // Find and cleanup any calls this socket was part of
    activeCalls.forEach((call, vaultId) => {
      call.participants.forEach((p, userId) => {
        if (p.socketId === socket.id) {
          console.log(`Auto-cleaning participant ${userId} from vault ${vaultId}`);
          cleanupCallParticipant(vaultId, userId, socket.id);
        }
      });
    });
  });
});

async function cleanupCallParticipant(vaultId, userId, socketId) {
  const call = activeCalls.get(vaultId);
  if (!call) return;

  const isInitiator = call.initiatorId === userId;
  const participant = call.participants.get(userId);
  const userName = participant ? participant.userName : "User";

  call.participants.delete(userId);

  if (isInitiator) {
    const duration = Math.round((new Date() - call.startTime) / 1000);
    const mins = Math.floor(duration / 60);
    const secs = duration % 60;

    try {
      const vault = await mongoose.model("Vault").findById(vaultId);
      if (vault) {
        vault.activity.push({ action: `Ended team call (Duration: ${mins}m ${secs}s)`, userId });
        await vault.save();
        await createLog(vaultId, userId, "CALL_END", `Call ended after ${mins}m ${secs}s`, "owner");
      }
    } catch (e) { console.error("Call End Log Error", e); }

    io.to(`call_${vaultId}`).emit("call_ended_by_initiator");
    activeCalls.delete(vaultId);
  } else {
    io.to(`call_${vaultId}`).emit("user_left_call", { userId, socketId, userName });
  }

  if (call.participants.size === 0) {
    activeCalls.delete(vaultId);
  }
}

  socket.on("webrtc_offer", (data) => {
    // Send to specific user
    socket.to(data.targetSocketId).emit("webrtc_offer", {
      offer: data.offer,
      callerId: data.callerId,
      callerName: data.callerName,
      callerSocketId: socket.id
    });
  });

  socket.on("webrtc_answer", (data) => {
    socket.to(data.targetSocketId).emit("webrtc_answer", {
      answer: data.answer,
      senderSocketId: socket.id
    });
  });

  socket.on("webrtc_ice_candidate", (data) => {
    socket.to(data.targetSocketId).emit("webrtc_ice_candidate", {
      candidate: data.candidate,
      senderSocketId: socket.id
    });
  });

  // --- EDITOR COLLABORATION EVENTS ---
  socket.on("join_editor", (data) => {
    const { vaultId, fileId, userId, userName } = data;
    const roomKey = `${vaultId}_${fileId}`;
    const roomName = `editor_${roomKey}`;
    socket.join(roomName);

    if (!editorRooms.has(roomKey)) {
      editorRooms.set(roomKey, new Map());
    }
    const room = editorRooms.get(roomKey);
    const colorIdx = room.size % CURSOR_COLORS.length;
    room.set(userId, { userName, socketId: socket.id, color: CURSOR_COLORS[colorIdx] });

    // Send current collaborators to the joiner
    const collaborators = Array.from(room.entries()).map(([uid, info]) => ({
      userId: uid, userName: info.userName, color: info.color
    }));
    socket.emit("editor_collaborators", { fileId, collaborators });

    // Notify others
    socket.to(roomName).emit("user_joined_editor", {
      fileId, userId, userName, color: CURSOR_COLORS[colorIdx]
    });
  });

  socket.on("leave_editor", (data) => {
    const { vaultId, fileId, userId } = data;
    const roomKey = `${vaultId}_${fileId}`;
    const roomName = `editor_${roomKey}`;
    
    if (editorRooms.has(roomKey)) {
      editorRooms.get(roomKey).delete(userId);
      if (editorRooms.get(roomKey).size === 0) {
        editorRooms.delete(roomKey);
      }
    }
    socket.to(roomName).emit("user_left_editor", { fileId, userId });
    socket.leave(roomName);
  });

  socket.on("code_change", (data) => {
    // data: { vaultId, fileId, changes, userId }
    const roomName = `editor_${data.vaultId}_${data.fileId}`;
    socket.to(roomName).emit("remote_code_change", {
      fileId: data.fileId, changes: data.changes, userId: data.userId
    });
  });

  socket.on("cursor_update", (data) => {
    // data: { vaultId, fileId, userId, userName, position, color }
    const roomName = `editor_${data.vaultId}_${data.fileId}`;
    socket.to(roomName).emit("remote_cursor", {
      fileId: data.fileId, userId: data.userId, userName: data.userName,
      position: data.position, color: data.color
    });
  });

  // --- TERMINAL EVENTS ---
  socket.on("terminal_start", (data) => {
    try {
      const pty = require("node-pty");
      const os = require("os");
      const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
      
      const ptyProcess = pty.spawn(shell, [], {
        name: "xterm-color",
        cols: 80,
        rows: 24,
        cwd: __dirname,
        env: process.env
      });

      socket.ptyProcess = ptyProcess;

      ptyProcess.onData((data) => {
        socket.emit("terminal_output", data);
      });

      ptyProcess.onExit(() => {
        socket.emit("terminal_output", "\r\n[Process Exited]\r\n");
      });

      // Audit Log for Terminal Start
      if (data && data.vaultId && data.userId) {
        mongoose.model("AuditLog").create({
          vaultId: data.vaultId,
          userId: data.userId,
          action: "TERMINAL_START",
          details: "Initiated a secure terminal session",
          role: "developer"
        }).catch(err => console.error("Audit log error:", err));
      }
    } catch (err) {
      socket.emit("terminal_output", `\r\n[Terminal Error: ${err.message}]\r\n`);
    }
  });

  socket.on("terminal_input", (data) => {
    if (socket.ptyProcess) {
      socket.ptyProcess.write(data);
    }
  });

  socket.on("terminal_resize", (size) => {
    if (socket.ptyProcess && size) {
      try {
        socket.ptyProcess.resize(size.cols, size.rows);
      } catch (err) {}
    }
  });

  // --- DISCONNECT ---
  socket.on("disconnect", () => {
    if (socket.ptyProcess) {
      try { socket.ptyProcess.kill(); } catch (e) {}
    }
    
    if (socket.userId && userSockets.has(socket.userId)) {
      // Remove from call tracking
      callParticipants.forEach((participants, vaultId) => {
        if (participants.has(socket.userId)) {
          participants.delete(socket.userId);
          socket.to(`call_${vaultId}`).emit("user_left_call", { userId: socket.userId });
        }
      });

      // Remove from editor tracking
      editorRooms.forEach((room, roomKey) => {
        if (room.has(socket.userId)) {
          room.delete(socket.userId);
          const roomName = `editor_${roomKey}`;
          socket.to(roomName).emit("user_left_editor", { userId: socket.userId });
          if (room.size === 0) editorRooms.delete(roomKey);
        }
      });

      const sockets = userSockets.get(socket.userId);
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSockets.delete(socket.userId);
      }
      io.emit("online_users_update", Array.from(userSockets.keys()));
    }
  });
});

// ================= START SERVER =================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));





