import React, { useState } from "react";
import axios from "axios";
import { Play, Square, Terminal, ChevronDown, ChevronUp, Trash2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const LANG_MAP = {
  js: "javascript", jsx: "javascript", ts: "javascript", tsx: "javascript",
  py: "python", java: "java", c: "c", cpp: "cpp", cc: "cpp"
};

export default function CodeRunner({ code, fileName, isOpen, onToggle }) {
  const [output, setOutput] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  const ext = fileName?.split(".").pop()?.toLowerCase() || "";
  const language = LANG_MAP[ext];

  const runCode = async () => {
    if (!language || !code || isRunning) return;
    setIsRunning(true);
    setOutput(prev => [...prev, { type: "info", text: `▶ Running ${fileName} (${language})...`, time: new Date().toLocaleTimeString() }]);

    try {
      const res = await axios.post(`${API_URL}/api/execute`, { code, language });
      if (res.data.stdout) {
        setOutput(prev => [...prev, { type: "stdout", text: res.data.stdout, time: new Date().toLocaleTimeString() }]);
      }
      if (res.data.stderr) {
        setOutput(prev => [...prev, { type: "stderr", text: res.data.stderr, time: new Date().toLocaleTimeString() }]);
      }
      setOutput(prev => [...prev, { type: "info", text: `✓ Completed in ${res.data.executionTime}ms`, time: new Date().toLocaleTimeString() }]);
    } catch (err) {
      setOutput(prev => [...prev, { type: "stderr", text: err.response?.data?.error || err.message, time: new Date().toLocaleTimeString() }]);
    }
    setIsRunning(false);
  };

  return (
    <div className={`border-t border-white/10 bg-[#0a0d14] flex flex-col transition-all ${isOpen ? "h-64" : "h-9"}`}>
      {/* Terminal Header */}
      <div className="h-9 flex items-center justify-between px-4 bg-[#06080f] border-b border-white/5 cursor-pointer select-none" onClick={onToggle}>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Terminal size={13} />
          <span className="font-bold uppercase tracking-widest">Terminal</span>
          {isRunning && <span className="text-yellow-400 animate-pulse text-[10px]">● Running</span>}
        </div>
        <div className="flex items-center gap-2">
          {language && (
            <button
              onClick={(e) => { e.stopPropagation(); runCode(); }}
              disabled={isRunning}
              className="flex items-center gap-1 text-[10px] font-bold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-2 py-0.5 rounded transition-colors"
            >
              {isRunning ? <Square size={10} /> : <Play size={10} />}
              {isRunning ? "Stop" : "Run"}
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); setOutput([]); }} className="text-gray-500 hover:text-white">
            <Trash2 size={12} />
          </button>
          {isOpen ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronUp size={14} className="text-gray-500" />}
        </div>
      </div>

      {/* Terminal Output */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1">
          {output.length === 0 && (
            <p className="text-gray-600 italic">
              {language ? `Ready to run ${language} code. Click Run or press Ctrl+Enter.` : "Select a runnable file (.js, .py, .java, .cpp)"}
            </p>
          )}
          {output.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-gray-600 text-[10px] shrink-0">{line.time}</span>
              <pre className={`whitespace-pre-wrap break-all ${
                line.type === "stderr" ? "text-red-400" :
                line.type === "info" ? "text-blue-400" : "text-green-300"
              }`}>{line.text}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
