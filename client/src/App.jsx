import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import ForgotPassword from "./pages/ForgotPassword";
import VaultPage from "./pages/VaultPage";
import CodeVaultPage from "./pages/CodeVaultPage";


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/vault/:id" element={<VaultPage />} />
        <Route path="/code-vault/:id" element={<CodeVaultPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
