import React, { useState } from "react";
import { Terminal as TerminalIcon, ChevronDown, ChevronUp, Trash2, Play, Loader } from "lucide-react";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function CodeRunner({ code, fileName, isOpen, onToggle }) {
  const [output, setOutput] = useState("");
  const [stdin, setStdin] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const getLanguage = (name) => {
    if (!name) return "plaintext";
    if (name.endsWith(".js")) return "javascript";
    if (name.endsWith(".py")) return "python";
    if (name.endsWith(".java")) return "java";
    if (name.endsWith(".cpp")) return "cpp";
    if (name.endsWith(".c")) return "c";
    return "plaintext";
  };

  const runCode = async (e) => {
    e.stopPropagation();
    if (!code) {
      setOutput("No code to run. Open a file first.");
      if (!isOpen) onToggle();
      return;
    }
    
    if (!isOpen) onToggle();
    setIsRunning(true);
    setOutput("Executing securely in cloud sandbox...\n");

    try {
      const language = getLanguage(fileName);
      const res = await axios.post(`${API_URL}/api/execute`, { code, language, stdin });
      
      const out = res.data.stdout || "";
      const err = res.data.stderr || "";
      
      if (err) {
        setOutput(prev => prev + `\n[ERROR]\n${err}`);
      } else {
        setOutput(prev => prev + `\n${out}\n[Process completed successfully]`);
      }
    } catch (err) {
      setOutput(prev => prev + `\n[SERVER ERROR] ${err.response?.data?.error || err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  const clearTerminal = (e) => {
    e.stopPropagation();
    setOutput("");
  };

  return (
    <div className={`border-t border-white/10 bg-[#0a0d14] flex flex-col transition-all ${isOpen ? "h-64" : "h-9"}`}>
      {/* Terminal Header */}
      <div className="h-9 flex items-center justify-between px-4 bg-[#06080f] border-b border-white/5 cursor-pointer select-none shrink-0" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <TerminalIcon size={13} />
            <span className="font-bold uppercase tracking-widest">Cloud Runner</span>
          </div>
          
          {isOpen && fileName && (
            <div className="flex items-center gap-2 border-l border-white/10 pl-3">
              <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded text-gray-400">{fileName}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {isOpen && (
            <>
              <input
                type="text"
                placeholder="Standard Input (e.g. for scanf)"
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#0b0f1a] border border-white/10 text-xs text-gray-300 px-2 py-1 rounded w-48 outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600"
              />
              <button 
                onClick={runCode}
                disabled={isRunning || !fileName}
                className="flex items-center gap-1 text-[10px] bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-gray-400 text-white px-3 py-1 rounded transition-colors"
              >
                {isRunning ? <Loader size={10} className="animate-spin" /> : <Play size={10} />}
                RUN CODE
              </button>
              <div className="w-px h-3 bg-white/10 mx-1" />
              <button onClick={clearTerminal} className="text-gray-500 hover:text-white p-1" title="Clear Output">
                <Trash2 size={12} />
              </button>
            </>
          )}
          <button className="text-gray-500 hover:text-white p-1 ml-1">
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Terminal Output */}
      <div className={`flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed whitespace-pre-wrap ${!isOpen && "hidden"}`}>
        {output ? (
          <div className={output.includes("[ERROR]") || output.includes("[SERVER ERROR]") ? "text-red-400" : "text-gray-300"}>
            {output}
          </div>
        ) : (
          <div className="text-gray-600 italic h-full flex items-center justify-center">
            {fileName ? `Click "Run Code" to execute ${fileName} securely in the cloud sandbox.` : "Open a file to use the Cloud Runner."}
          </div>
        )}
      </div>
    </div>
  );
}
