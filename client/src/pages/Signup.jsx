import React, { useState, useEffect } from "react";
import axios from "axios";
import forge from "node-forge";
import { motion } from "framer-motion";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function Signup() {
  const [data, setData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const [text, setText] = useState("");
  const fullText = "Digital Vault Security";

  const [step, setStep] = useState("idle");
  const [loading, setLoading] = useState(false);

  // ✨ Typing animation
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setText(fullText.slice(0, i));
      i++;
      if (i > fullText.length) clearInterval(interval);
    }, 60);
    return () => clearInterval(interval);
  }, []);

  const generateKeys = () => {
    return new Promise((resolve) => {
      setTimeout(() => {
        const keypair = forge.pki.rsa.generateKeyPair(2048);
        resolve({
          publicKey: forge.pki.publicKeyToPem(keypair.publicKey),
          privateKey: forge.pki.privateKeyToPem(keypair.privateKey),
        });
      }, 2000);
    });
  };

  // const handleSignup = async () => {
  //   if (loading) return;

  //   if (data.password !== data.confirmPassword) {
  //     alert("Passwords do not match");
  //     return;
  //   }

  //   try {
  //     setLoading(true);
  //     setStep("entropy");

  //     const keys = await generateKeys();

  //     setStep("generating");
  //     await new Promise((r) => setTimeout(r, 1200));

  //     setStep("uploading");

  //     await axios.post(API_URL + "/api/register", {
  //       name: data.name,
  //       email: data.email,
  //       password: data.password,
  //       publicKey: keys.publicKey,
  //     });

  //     localStorage.setItem("privateKey", privateKey);

  //     setStep("done");

  //     setTimeout(() => {
  //       window.location.href = "/";
  //     }, 1500);
  //   } catch (err) {
  //     alert(err.response?.data?.message || "Signup failed");
  //     setLoading(false);
  //     setStep("idle");
  //   }
  // };

  const handleSignup = async () => {
    if (loading) return;
  
    if (data.password !== data.confirmPassword) {
      alert("Passwords do not match");
      return;
    }
  
    try {
      setLoading(true);
  
      // 🔐 STEP 1: entropy animation
      setStep("entropy");
  
      const keys = await generateKeys();
  
      // 🔐 STEP 2: key generation animation
      setStep("generating");
      await new Promise((r) => setTimeout(r, 1200));
  
      // 🔐 STEP 3: Encrypt Private Key & Upload
      setStep("uploading");

      const salt = forge.random.getBytesSync(16);
      const derivedKey = forge.pkcs5.pbkdf2(data.password, salt, 100000, 32);
      const iv = forge.random.getBytesSync(12);

      const cipher = forge.cipher.createCipher("AES-GCM", derivedKey);
      cipher.start({ iv: iv });
      cipher.update(forge.util.createBuffer(keys.privateKey));
      cipher.finish();

      const encryptedPrivateKey = forge.util.encode64(cipher.output.getBytes() + cipher.mode.tag.getBytes());
      const keySalt = forge.util.encode64(salt);
      const keyIv = forge.util.encode64(iv);

      const res = await axios.post(API_URL + "/api/register", {
        name: data.name,
        email: data.email,
        password: data.password,
        publicKey: keys.publicKey,
        encryptedPrivateKey,
        keySalt,
        keyIv
      });
  
      console.log("Signup Response:", res.data);
  
      // ✅ CHECK SUCCESS
      if (res.status === 200 || res.status === 201) {
  
        // 🔥 FIX: store correct private key
        localStorage.setItem("privateKey", keys.privateKey);

        setStep("done");
  
        setTimeout(() => {
          window.location.href = "/";
        }, 1500);
  
      } else {
        throw new Error("Signup failed");
      }
  
    } catch (err) {
      console.error("Signup Error:", err);
  
      alert(
        err.response?.data?.message ||
        err.message ||
        "Signup failed"
      );
  
      setLoading(false);
      setStep("idle");
    }
  };
  const progress = {
    idle: "0%",
    entropy: "30%",
    generating: "65%",
    uploading: "90%",
    done: "100%",
  };

  return (
    <div className="h-screen w-full bg-[#02030a] text-white relative overflow-hidden flex items-center">

      {/* 🌌 GLOBAL GLOW (BLENDED PAGE) */}
      <div className="absolute w-[600px] h-[600px] bg-purple-600/30 blur-[180px] left-[10%]" />
      <div className="absolute w-[500px] h-[500px] bg-blue-600/20 blur-[160px] right-[10%]" />

      {/* LEFT SIDE (BIGGER) */}
      <div className="w-[60%] pl-20 pr-10 z-10">

        <motion.h1
          className="text-6xl font-bold leading-tight"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {text}
          <span className="animate-pulse">|</span>
        </motion.h1>

        <p className="text-gray-400 mt-6 text-lg max-w-lg">
          Military-grade encryption meets modern collaboration.
          Your vault. Your keys. Zero-knowledge architecture.
        </p>

        {/* subtle animated line */}
        <motion.div
          className="mt-6 h-[2px] bg-gradient-to-r from-purple-500 to-transparent"
          initial={{ width: 0 }}
          animate={{ width: "300px" }}
          transition={{ duration: 1 }}
        />
      </div>

      {/* RIGHT SIDE (BLENDED CARD, BIGGER) */}
      <div className="w-[40%] flex justify-center z-10">

        <div className="
          w-[460px]
          bg-white/[0.05]
          backdrop-blur-2xl
          border border-white/10
          rounded-2xl
          p-9
          shadow-[0_0_80px_rgba(139,92,246,0.25)]
        ">

          <h2 className="text-purple-400 text-sm font-bold mb-2">SPV</h2>

          <h1 className="text-2xl font-semibold mb-1">
            Create Secure Account
          </h1>

          <p className="text-gray-400 text-sm mb-5">
            End-to-end encrypted vault access
          </p>

          {/* INPUTS */}
          <input placeholder="Full Name" className="input" onChange={(e)=>setData({...data,name:e.target.value})}/>
          <input placeholder="Email" className="input" onChange={(e)=>setData({...data,email:e.target.value})}/>
          <input type="password" placeholder="Master Password" className="input" onChange={(e)=>setData({...data,password:e.target.value})}/>
          <input type="password" placeholder="Confirm Password" className="input mb-5" onChange={(e)=>setData({...data,confirmPassword:e.target.value})}/>

          {/* KEY SECTION */}
          <div className="mb-5">
            <p className="text-purple-400 text-sm font-semibold mb-1">
              Local Key Generation
            </p>

            <p className="text-xs text-gray-400 mb-1">
              We are preparing your zero-knowledge environment.
            </p>

            <p className="text-xs text-gray-500 mb-2">
              Your encryption keys never leave this device.
            </p>

            <p className="text-xs text-purple-400 mb-2">
              {step === "entropy" && "Generating entropy..."}
              {step === "generating" && "Creating keys..."}
              {step === "uploading" && "Encrypting..."}
              {step === "done" && "Completed ✔"}
            </p>

            <div className="w-full h-2 bg-gray-800 rounded overflow-hidden">
              <motion.div
                animate={{ width: progress[step] }}
                className="h-2 bg-gradient-to-r from-purple-500 to-blue-500"
              />
            </div>

            <p className="text-[11px] text-gray-500 mt-2">
              End-to-end encryption starts instantly.
            </p>
          </div>

          <button
            onClick={handleSignup}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 hover:opacity-90"
          >
            {loading ? "Creating..." : "Create Account & Generate Keys"}
          </button>

        </div>
      </div>

      {/* INPUT STYLE */}
      <style>{`
        .input {
          width: 100%;
          padding: 12px;
          margin-bottom: 10px;
          background: rgba(0,0,0,0.4);
          border: 1px solid #2a2b33;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
        }
      `}</style>
    </div>
  );
}








