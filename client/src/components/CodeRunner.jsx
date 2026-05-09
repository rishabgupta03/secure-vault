import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Terminal as TerminalIcon, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const socket = io(API_URL);

export default function CodeRunner({ isOpen, onToggle }) {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !terminalRef.current) return;

    if (!xtermRef.current) {
      const xterm = new Terminal({
        theme: {
          background: "#0a0d14",
          foreground: "#d4d4d4",
          cursor: "#3b82f6",
          selectionBackground: "#264f78",
          black: "#000000",
          red: "#ef4444",
          green: "#10b981",
          yellow: "#f59e0b",
          blue: "#3b82f6",
          magenta: "#8b5cf6",
          cyan: "#06b6d4",
          white: "#ffffff",
        },
        fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace",
        fontSize: 13,
        cursorBlink: true,
      });

      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);
      xterm.open(terminalRef.current);
      fitAddon.fit();

      xtermRef.current = xterm;
      fitAddonRef.current = fitAddon;

      // Connect to backend
      socket.emit("terminal_start", { 
        vaultId: window.location.pathname.split("/").pop(), 
        userId: localStorage.getItem("userId") 
      });

      xterm.onData((data) => {
        socket.emit("terminal_input", data);
      });

      socket.on("terminal_output", (data) => {
        xterm.write(data);
      });

      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
          socket.emit("terminal_resize", { cols: xterm.cols, rows: xterm.rows });
        } catch (err) {}
      });
      resizeObserver.observe(terminalRef.current);

      return () => {
        resizeObserver.disconnect();
        socket.off("terminal_output");
        xterm.dispose();
        xtermRef.current = null;
      };
    } else {
      setTimeout(() => {
        if (fitAddonRef.current) fitAddonRef.current.fit();
      }, 50);
    }
  }, [isOpen]);

  const clearTerminal = (e) => {
    e.stopPropagation();
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  };

  return (
    <div className={`border-t border-white/10 bg-[#0a0d14] flex flex-col transition-all ${isOpen ? "h-64" : "h-9"}`}>
      {/* Terminal Header */}
      <div className="h-9 flex items-center justify-between px-4 bg-[#06080f] border-b border-white/5 cursor-pointer select-none shrink-0" onClick={onToggle}>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <TerminalIcon size={13} />
          <span className="font-bold uppercase tracking-widest">Terminal</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={clearTerminal} className="text-gray-500 hover:text-white p-1">
            <Trash2 size={12} />
          </button>
          {isOpen ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronUp size={14} className="text-gray-500" />}
        </div>
      </div>

      {/* Terminal Output Canvas */}
      <div className={`flex-1 relative overflow-hidden ${!isOpen && "hidden"}`}>
        <div ref={terminalRef} className="absolute inset-0 p-2 pl-4" />
      </div>
    </div>
  );
}
