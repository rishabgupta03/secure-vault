import React, { useEffect, useRef, useState, useCallback } from "react";

/**
 * CollabProvider - Real-time collaboration engine for Monaco Editor.
 * Manages cursor tracking, live edits, and presence via Socket.io.
 */
export function useCollaboration({ socket, vaultId, fileId, userId, userName, editorRef }) {
  const [collaborators, setCollaborators] = useState([]);
  const [myColor, setMyColor] = useState("#3b82f6");
  const decorationsRef = useRef([]);
  const isRemoteChangeRef = useRef(false);

  // Join/leave editor room
  useEffect(() => {
    if (!socket || !fileId || !vaultId) return;

    socket.emit("join_editor", { vaultId, fileId, userId, userName });

    socket.on("editor_collaborators", (data) => {
      if (data.fileId === fileId) {
        setCollaborators(data.collaborators.filter(c => c.userId !== userId));
        const me = data.collaborators.find(c => c.userId === userId);
        if (me) setMyColor(me.color);
      }
    });

    socket.on("user_joined_editor", (data) => {
      if (data.fileId === fileId && data.userId !== userId) {
        setCollaborators(prev => {
          if (prev.find(c => c.userId === data.userId)) return prev;
          return [...prev, { userId: data.userId, userName: data.userName, color: data.color }];
        });
      }
    });

    socket.on("user_left_editor", (data) => {
      if (data.fileId === fileId || !data.fileId) {
        setCollaborators(prev => prev.filter(c => c.userId !== data.userId));
        // Remove their cursor decoration
        const editor = editorRef?.current;
        if (editor) {
          decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
        }
      }
    });

    // Remote code changes
    socket.on("remote_code_change", (data) => {
      if (data.fileId !== fileId || data.userId === userId) return;
      const editor = editorRef?.current;
      if (!editor) return;

      isRemoteChangeRef.current = true;
      try {
        const model = editor.getModel();
        if (model && data.changes) {
          editor.executeEdits("remote", data.changes.map(c => ({
            range: new (window.monaco?.Range || function(a,b,c,d){return{startLineNumber:a,startColumn:b,endLineNumber:c,endColumn:d}})(
              c.range.startLineNumber, c.range.startColumn,
              c.range.endLineNumber, c.range.endColumn
            ),
            text: c.text,
            forceMoveMarkers: true
          })));
        }
      } finally {
        setTimeout(() => { isRemoteChangeRef.current = false; }, 50);
      }
    });

    // Remote cursor positions
    socket.on("remote_cursor", (data) => {
      if (data.fileId !== fileId || data.userId === userId) return;
      const editor = editorRef?.current;
      if (!editor) return;

      const pos = data.position;
      const newDecorations = [{
        range: new (window.monaco?.Range || function(a,b,c,d){return{startLineNumber:a,startColumn:b,endLineNumber:c,endColumn:d}})(
          pos.lineNumber, pos.column, pos.lineNumber, pos.column + 1
        ),
        options: {
          className: `remote-cursor-${data.userId.substring(0,6)}`,
          before: {
            content: ` ${data.userName} `,
            inlineClassName: "remote-cursor-label",
            cursorStops: 1
          },
          stickiness: 1
        }
      }];

      // Inject dynamic CSS for this cursor color
      const styleId = `cursor-style-${data.userId.substring(0,6)}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `
          .remote-cursor-${data.userId.substring(0,6)} { border-left: 2px solid ${data.color}; }
          .remote-cursor-label { background: ${data.color}; color: white; font-size: 10px; padding: 1px 4px; border-radius: 2px; font-weight: bold; }
        `;
        document.head.appendChild(style);
      }

      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
    });

    return () => {
      socket.emit("leave_editor", { vaultId, fileId, userId });
      socket.off("editor_collaborators");
      socket.off("user_joined_editor");
      socket.off("user_left_editor");
      socket.off("remote_code_change");
      socket.off("remote_cursor");
    };
  }, [socket, vaultId, fileId, userId, userName]);

  // Send local changes (debounced)
  const sendChange = useCallback((changes) => {
    if (isRemoteChangeRef.current || !socket || !fileId) return;
    socket.emit("code_change", {
      vaultId, fileId, userId,
      changes: changes.map(c => ({
        range: {
          startLineNumber: c.range.startLineNumber,
          startColumn: c.range.startColumn,
          endLineNumber: c.range.endLineNumber,
          endColumn: c.range.endColumn,
        },
        text: c.text
      }))
    });
  }, [socket, vaultId, fileId, userId]);

  // Send cursor position
  const sendCursor = useCallback((position) => {
    if (!socket || !fileId) return;
    socket.emit("cursor_update", {
      vaultId, fileId, userId, userName, position, color: myColor
    });
  }, [socket, vaultId, fileId, userId, userName, myColor]);

  return { collaborators, sendChange, sendCursor, isRemoteChangeRef, myColor };
}
