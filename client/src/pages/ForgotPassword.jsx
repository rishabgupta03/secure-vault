import React, { useState } from "react";
import axios from "axios";
import { motion } from "framer-motion";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function ForgotPassword() {

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [data, setData] = useState({
    email: "",
    otp: "",
    newPassword: "",
  });

  // 🔹 SEND OTP
  const sendOtp = async () => {
    try {
      setLoading(true);
      await axios.post(API_URL + "/api/send-otp", {
        email: data.email,
      });

      setStep(2);
      setLoading(false);
    } catch (err) {
      alert(err.response?.data?.message || "Error sending OTP");
      setLoading(false);
    }
  };

  // 🔹 RESET PASSWORD
  const resetPassword = async () => {
    try {
      setLoading(true);

      await axios.post(API_URL + "/api/reset-password", {
        email: data.email,
        otp: data.otp,
        newPassword: data.newPassword,
      });

      setStep(3);
      setLoading(false);

      setTimeout(() => {
        window.location.href = "/";
      }, 2000);

    } catch (err) {
      alert(err.response?.data?.message || "Reset failed");
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex bg-[#02030a] text-white overflow-hidden">

      {/* 🔥 LEFT SIDE */}
      <div className="w-[55%] relative flex items-center justify-center">

        {/* glowing aura */}
        <div className="absolute w-[700px] h-[700px] bg-purple-700/20 blur-[140px] rounded-full"></div>

        {/* floating particles */}
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            animate={{ y: [0, -20, 0], opacity: [0.2, 1, 0.2] }}
            transition={{
              repeat: Infinity,
              duration: 3,
              delay: i * 0.2,
            }}
            className="absolute w-1 h-1 bg-purple-400 rounded-full"
            style={{
              top: Math.random() * 100 + "%",
              left: Math.random() * 100 + "%",
            }}
          />
        ))}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center z-10"
        >
          <h1 className="text-6xl font-extrabold leading-tight">
            Recover <br />
            <span className="text-purple-400">Access</span>
          </h1>

          <p className="text-gray-400 mt-6 max-w-md">
            Secure identity verification system. Your vault access can only be
            restored through cryptographic authentication layers.
          </p>

          {/* animated lock */}
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="text-4xl mt-6"
          >
            🔐
          </motion.div>
        </motion.div>
      </div>

      {/* 🔥 RIGHT SIDE */}
      <div className="w-[45%] flex items-center justify-center">

        <motion.div
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-[540px] p-10 rounded-3xl bg-white/[0.04] backdrop-blur-2xl border border-white/10 shadow-2xl"
        >

          <p className="text-purple-400 text-sm mb-2 tracking-widest">
            SPV RECOVERY SYSTEM
          </p>

          <h1 className="text-3xl font-bold mb-2">
            Forgot Password
          </h1>

          <p className="text-gray-400 text-sm mb-6">
            Multi-layer authentication required to regain access.
          </p>

          {/* 🔹 STEP PROGRESS */}
          <div className="flex gap-2 mb-6">
            {[1,2,3].map((s)=>(
              <div
                key={s}
                className={`flex-1 h-1 rounded ${
                  step >= s ? "bg-purple-500" : "bg-gray-700"
                }`}
              />
            ))}
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <>
              <input
                placeholder="Registered Email"
                className="input"
                onChange={(e)=>setData({...data,email:e.target.value})}
              />

              <motion.button
                whileHover={{ scale: 1.02 }}
                onClick={sendOtp}
                className="btn"
              >
                {loading ? "Sending OTP..." : "Send OTP"}
              </motion.button>
            </>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <>
              <input
                placeholder="Enter OTP"
                className="input"
                onChange={(e)=>setData({...data,otp:e.target.value})}
              />

              <input
                type="password"
                placeholder="New Password"
                className="input"
                onChange={(e)=>setData({...data,newPassword:e.target.value})}
              />

              <motion.button
                whileHover={{ scale: 1.02 }}
                onClick={resetPassword}
                className="btn"
              >
                {loading ? "Verifying..." : "Reset Password"}
              </motion.button>
            </>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="text-center"
            >
              <h2 className="text-green-400 text-xl">
                ✔ Access Restored
              </h2>
              <p className="text-gray-400 mt-2">
                Redirecting to secure login...
              </p>
            </motion.div>
          )}

          {/* NAV */}
          <div className="flex justify-between mt-6 text-sm">
            <p
              onClick={()=>window.location.href="/"}
              className="text-purple-400 cursor-pointer"
            >
              Back to Login
            </p>

            <p
              onClick={()=>window.location.href="/signup"}
              className="text-gray-400 cursor-pointer"
            >
              Create Account
            </p>
          </div>

        </motion.div>
      </div>

      {/* 🔥 STYLES */}
      <style>{`
        .input {
          width: 100%;
          padding: 14px;
          margin-bottom: 12px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: white;
        }

        .input:focus {
          outline: none;
          border-color: #a855f7;
          box-shadow: 0 0 10px rgba(168,85,247,0.5);
        }

        .btn {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          background: linear-gradient(to right, #9333ea, #6366f1);
          margin-top: 10px;
        }
      `}</style>

    </div>
  );
}