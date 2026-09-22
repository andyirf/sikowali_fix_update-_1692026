import React from "react";
import { 
  Home, 
  FileText, 
  Calendar, 
  MessageSquare, 
  Sparkles, 
  MessageCircle, 
  Bell, 
  Volume2, 
  BookOpen, 
  LayoutGrid, 
  PlusCircle, 
  CheckSquare, 
  ClipboardList,
  User, 
  Shield,
  Database,
  Settings,
  Building2,
  Archive
} from "lucide-react";
import { SchoolSettings } from "../types";

interface SidebarProps {
  currentTab: string;
  setTab: (tab: string) => void;
  role: string;
  unreadCount: number;
  schoolSettings?: SchoolSettings;
}

export default function Sidebar({ currentTab, setTab, role, unreadCount, schoolSettings }: SidebarProps) {
  const roleLabel = role === "orangtua" ? "Orang Tua" : role === "WaliKelas" ? "Wali Kelas" : role === "kepalasekolah" ? "Kepala Sekolah" : role;
  const schoolName = schoolSettings?.name || "SIKOWALI";
  const logoUrl = schoolSettings?.logoUrl || "";
  // Navigation menus categorized by sections
  const menuUtama = [
    { id: "beranda", label: "Beranda", icon: Home, roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Admin", "Administrator", "Murid"] },
  ];

  const menuInfoAnak = [
    { id: "rapor", label: "Nilai & Rapor", icon: FileText, roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Murid"] },
    { id: "absensi", label: "Absensi", icon: Calendar, roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Murid"] },
    { id: "catatan", label: "Catatan Perilaku", icon: MessageSquare, roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah"] },
    { id: "karya", label: "Dokumentasi & Karya", icon: LayoutGrid, roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Murid"] },
  ];

  const menuAIKomunikasi = [
    { id: "analisisAI", label: "Analisis AI", icon: Sparkles, roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah"] },
    { id: "chatbot", label: "Chatbot Sikowali", icon: MessageCircle, roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Murid"] },
    { id: "backupChatbot", label: "Backup Chatbot", icon: Archive, roles: ["WaliKelas", "Admin", "Administrator"] },
    { id: "notifikasi", label: "Notifikasi", icon: Bell, badge: unreadCount, roles: ["orangtua", "WaliKelas", "Murid"] },
    { id: "pengumuman", label: "Pengumuman", icon: Volume2, roles: ["orangtua", "WaliKelas", "Guru", "Admin", "Administrator", "Murid"] },
    { id: "parenting", label: "Ruang Parenting", icon: BookOpen, roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Admin", "Administrator"] },
    { id: "wall", label: "Masukkan Wall", icon: MessageSquare, roles: ["orangtua", "WaliKelas", "Guru", "Admin", "Administrator"] },
  ];

  const menuManajemen = [
    { id: "inputNilai", label: "Input Nilai", icon: PlusCircle, roles: ["WaliKelas", "Admin", "Administrator"] },
    { id: "inputAbsensi", label: "Input Absensi", icon: CheckSquare, roles: ["WaliKelas"] },
    { id: "rekapSemester", label: "Rekap Semester", icon: ClipboardList, roles: ["WaliKelas"] },
    { id: "manajemen", label: "Manajemen Data", icon: Database, roles: ["Admin", "Administrator", "WaliKelas"] },
    { id: "dataSekolah", label: "Data Sekolah", icon: Building2, roles: ["Admin", "Administrator"] },
    { id: "settingAI", label: "Setting AI", icon: Settings, roles: ["Administrator"] },
    { id: "hakAkses", label: "Matriks Hak Akses", icon: Shield, roles: ["Administrator"] },
    { id: "profil", label: "Profil Saya", icon: User, roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Admin", "Administrator", "Murid"] },
  ];

  const renderItem = (item: any) => {
    const Icon = item.icon;
    const isActive = currentTab === item.id;
    return (
      <button
        key={item.id}
        id={`sidebar-item-${item.id}`}
        onClick={() => setTab(item.id)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
          isActive 
            ? "bg-yellow-400 text-slate-950 shadow-sm border border-yellow-300" 
            : "text-emerald-50/80 hover:bg-white/10 hover:text-white"
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className={`w-4 h-4 ${isActive ? "text-slate-950" : "text-emerald-100/80"}`} />
          <span>{item.label}</span>
        </div>
        {item.badge !== undefined && item.badge > 0 && (
          <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  const renderSection = (title: string, items: any[]) => {
    const visibleItems = items.filter(item => !item.roles || item.roles.includes(role));
    if (visibleItems.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold text-emerald-100/60 tracking-wider uppercase px-3 mb-2">{title}</p>
        {visibleItems.map(renderItem)}
      </div>
    );
  };

  return (
    <aside id="app-sidebar" className="w-64 bg-[#125B3d] border-r border-emerald-950/20 flex flex-col h-screen overflow-y-auto shrink-0 select-none relative overflow-hidden">
      <div className="absolute -top-24 -right-20 w-72 h-72 rounded-full bg-yellow-400/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-24 -left-24 w-72 h-72 rounded-full bg-emerald-300/10 blur-3xl pointer-events-none" />
      {/* Brand Header */}
      <div className="p-5 border-b border-white/10 flex items-center gap-3 relative z-10">
        <div className="w-11 h-11 shrink-0 bg-yellow-400 rounded-xl border border-yellow-300 text-slate-900 shadow overflow-hidden flex items-center justify-center">
          {logoUrl ? (
            <img src={logoUrl} alt={schoolName} className="w-full h-full object-cover" />
          ) : (
            <Sparkles className="w-6 h-6 animate-spin-slow" />
          )}
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-lg text-white tracking-tight leading-none truncate max-w-40">{schoolName}</span>
          <span className="text-[9px] text-emerald-100/70 font-semibold tracking-wider uppercase mt-1">SIKOWALI PORTAL</span>
        </div>
      </div>

      <div className="flex-1 p-4 space-y-6 relative z-10">
        {renderSection("UTAMA", menuUtama)}
        {renderSection("INFORMASI ANAK", menuInfoAnak)}
        {renderSection("AI & KOMUNIKASI", menuAIKomunikasi)}
        {renderSection("MANAJEMEN", menuManajemen)}
      </div>

      {/* Role Display and Sign Out */}
      <div className="p-4 border-t border-white/10 bg-emerald-950/20 relative z-10">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 shrink-0 rounded-full bg-yellow-400 text-slate-950 font-bold flex items-center justify-center shadow-inner">
            {role[0]}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-xs font-semibold text-white truncate">
              {role === "orangtua" ? "Budi Santoso" : role === "Murid" ? "Ahmad Budi S." : roleLabel}
            </span>
            <span className="text-[10px] text-emerald-100/65 truncate font-semibold">
              {schoolName}
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
