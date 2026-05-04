import React, { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import forge from "node-forge";

export default function Login() {
  const [data, setData] = useState({
    email: "",
    password: "",
  });

  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);

      const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000`;
      const res = await axios.post(`${API_URL}/api/login`, data);

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("sessionId", res.data.sessionId);
      localStorage.setItem("userId", res.data.userId);

      // 🔐 Seamlessly decrypt private key
      const salt = forge.util.decode64(res.data.keySalt);
      const iv = forge.util.decode64(res.data.keyIv);
      const encryptedBytes = forge.util.decode64(res.data.encryptedPrivateKey);
      
      const derivedKey = forge.pkcs5.pbkdf2(data.password, salt, 100000, 32);
      
      // Separate ciphertext and tag (tag is last 16 bytes for GCM)
      const ciphertext = encryptedBytes.slice(0, -16);
      const tag = encryptedBytes.slice(-16);
      
      const decipher = forge.cipher.createDecipher("AES-GCM", derivedKey);
      decipher.start({ iv: iv, tag: forge.util.createBuffer(tag) });
      decipher.update(forge.util.createBuffer(ciphertext));
      const pass = decipher.finish();
      
      if (!pass) {
        throw new Error("Decryption failed. Incorrect password or corrupted key.");
      }
      
      const privateKey = decipher.output.toString();
      localStorage.setItem("privateKey", privateKey);

      console.log("Private Key restored seamlessly.");

      window.location.href = "/dashboard";
    } catch (err) {
      alert(err.response?.data?.message || err.message || "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex bg-[#02030a] text-white overflow-hidden">

      {/* 🔥 LEFT SIDE (ANIMATED VAULT) */}
      <div className="w-[55%] relative flex items-center justify-center">

        {/* glowing background */}
        <div className="absolute w-[600px] h-[600px] bg-purple-700/20 blur-[120px] rounded-full"></div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center z-10"
        >
          <h1 className="text-6xl font-extrabold leading-tight">
            Secure <br />
            <span className="text-purple-400">Vault Access</span>
          </h1>

          <p className="text-gray-400 mt-6 max-w-md">
            Your encrypted workspace awaits. Access your zero-knowledge vault
            with your master credentials and private key.
          </p>

          {/* animated dots */}
          <div className="flex gap-2 justify-center mt-6">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                animate={{ y: [0, -8, 0] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.2,
                  delay: i * 0.2,
                }}
                className="w-2 h-2 bg-purple-400 rounded-full"
              />
            ))}
          </div>
        </motion.div>
      </div>

      {/* 🔥 RIGHT SIDE (BIG ADVANCED FORM) */}
      <div className="w-[45%] flex items-center justify-center">

        <motion.div
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-[520px] p-10 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/10 shadow-2xl"
        >

          <p className="text-purple-400 text-sm mb-2 tracking-widest">
            SPV SECURE ACCESS
          </p>

          <h1 className="text-3xl font-bold mb-2">
            Welcome Back
          </h1>

          <p className="text-gray-400 text-sm mb-6">
            Enter your credentials to unlock your encrypted vault.
          </p>

          {/* EMAIL */}
          <input
            placeholder="Email Address"
            className="input"
            onChange={(e)=>setData({...data,email:e.target.value})}
          />

          {/* PASSWORD */}
          <input
            type="password"
            placeholder="Master Password"
            className="input mb-4"
            onChange={(e)=>setData({...data,password:e.target.value})}
          />

          {/* LOGIN BUTTON */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogin}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 shadow-lg"
          >
            {loading ? "Authenticating..." : "Unlock Vault"}
          </motion.button>

          {/* OPTIONS */}
          <div className="flex justify-between mt-4 text-sm">

            <p
              onClick={()=>window.location.href="/forgot"}
              className="text-purple-400 cursor-pointer hover:underline"
            >
              Forgot Password?
            </p>

            <p
              onClick={()=>window.location.href="/signup"}
              className="text-gray-400 cursor-pointer hover:text-white"
            >
              Create Account
            </p>

          </div>

          {/* 🔐 SECURITY NOTE */}
          <p className="text-xs text-gray-500 mt-6 text-center">
            Your credentials are never stored in plaintext. All operations follow
            a zero-knowledge encryption model.
          </p>

        </motion.div>
      </div>

      {/* 🔥 INPUT STYLES */}
      <style>{`
        .input {
          width: 100%;
          padding: 14px;
          margin-bottom: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: white;
          transition: all 0.3s ease;
        }

        .input:focus {
          outline: none;
          border-color: #a855f7;
          box-shadow: 0 0 10px rgba(168,85,247,0.5);
        }
      `}</style>

    </div>
  );
}


