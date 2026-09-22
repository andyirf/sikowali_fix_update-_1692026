import React from "react";
import { Search, Settings, Database, LogOut } from "lucide-react";
import { Role } from "../types";

interface HeaderProps {
  role: Role;
  setRole: (role: Role) => void;
  tabLabel: string;
  schoolName?: string;
  schoolLogoUrl?: string;
  isUsingPostgreSQL?: boolean;
  isUsingMariaDB?: boolean;
  onLogout: () => void;
  onOpenProfile: () => void;
  displayName?: string;
}

export default function Header({ role, tabLabel, schoolName, schoolLogoUrl, isUsingPostgreSQL, isUsingMariaDB, onLogout, onOpenProfile, displayName }: HeaderProps) {
  const dbConnected = isUsingPostgreSQL || isUsingMariaDB;
  const showAdminBadges = role === "Admin" || role === "Administrator";
  const roleLabel = role === "orangtua" ? "Orang Tua" : role === "WaliKelas" ? "Wali Kelas" : role === "kepalasekolah" ? "Kepala Sekolah" : role;
  const initials = (displayName || roleLabel).split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return (
    <header id="app-header" className="bg-white/85 backdrop-blur-xl border-b border-white/70 h-16 px-6 flex items-center justify-between shrink-0 select-none shadow-sm">
      {/* Current Page Indicator */}
      <div className="flex items-center gap-3">
        {schoolLogoUrl && (
          <img src={schoolLogoUrl} alt={schoolName || "Logo sekolah"} className="w-9 h-9 rounded-xl object-cover border border-slate-200 bg-white shadow-sm" />
        )}
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">{tabLabel}</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{schoolName || "SIKOWALI"}</p>
        </div>
        {showAdminBadges && (
          <span className="text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-semibold">
            {`Portal ${roleLabel}`}
          </span>
        )}
        
        {/* Dynamic Database Badge */}
        {showAdminBadges && (
          dbConnected ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-100 font-medium" id="db-badge">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <Database className="w-3 h-3 text-emerald-600" />
              MySQL/phpMyAdmin Aktif
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[10px] bg-sky-50 text-sky-700 px-2 py-0.5 rounded-full border border-sky-100 font-medium" id="db-badge">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              <Database className="w-3 h-3 text-sky-500" />
              DB Lokal (Memori)
            </span>
          )
        )}
      </div>

      {/* Global Searches / Integrations */}
      <div className="flex items-center gap-4">
        <div className="relative w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari nilai, pengumuman..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 bg-slate-50/90 border border-slate-200/80 px-3 py-2 rounded-xl">
          <span className="w-6 h-6 rounded-lg bg-emerald-500 text-slate-950 text-[10px] font-black flex items-center justify-center">{initials}</span>
          <div className="leading-none">
            <span className="block text-xs text-slate-700 font-bold">{displayName || roleLabel}</span>
            <span className="block text-[9px] text-slate-400 font-bold mt-1">{roleLabel}</span>
          </div>
        </div>

        <button
          onClick={onOpenProfile}
          id="header-settings-btn"
          className="p-2 text-slate-500 hover:text-emerald-500 hover:bg-slate-50 rounded-xl transition-all"
          title="Buka Profil Saya"
          type="button"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1"></div>

        <button 
          onClick={onLogout}
          id="header-logout-btn" 
          className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
          title="Keluar / Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
