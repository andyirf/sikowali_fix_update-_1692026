import React, { useCallback, useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import BerandaTab from "./components/BerandaTab";
import RaporTab from "./components/RaporTab";
import AbsensiTab from "./components/AbsensiTab";
import CatatanTab from "./components/CatatanTab";
import KaryaTab from "./components/KaryaTab";
import AnalisisTab from "./components/AnalisisTab";
import ChatbotTab from "./components/ChatbotTab";
import ChatbotBackupTab from "./components/ChatbotBackupTab";
import NotifikasiTab from "./components/NotifikasiTab";
import PengumumanTab from "./components/PengumumanTab";
import ParentingTab from "./components/ParentingTab";
import WallTab from "./components/WallTab";
import InputNilaiTab from "./components/InputNilaiTab";
import InputAbsensiTab from "./components/InputAbsensiTab";
import RekapSemesterTab from "./components/RekapSemesterTab";
import ProfilTab from "./components/ProfilTab";
import HakAksesTab from "./components/HakAksesTab";
import ManajemenTab from "./components/ManajemenTab";
import SettingAITab from "./components/SettingAITab";
import DataSekolahTab from "./components/DataSekolahTab";

import { Role, SIKOWALIDatabase, SubjectScore, AttendanceRecord, AttendanceStatus, Announcement, SchoolSettings, User as PortalUser, DisciplineType } from "./types";
import { Sparkles, BookOpen, LogOut, CheckCircle, HelpCircle, ArrowRight, Activity, Smile, User, Lock, MessageSquare, Search, Table2, GraduationCap, Phone, X, Eye, EyeOff } from "lucide-react";

const LAST_ACTIVITY_KEY = "sikowali:last-activity";
const IDLE_LOGOUT_MS = 10 * 60 * 1000;
const KEEP_ALIVE_INTERVAL_MS = 60 * 1000;
const LOGIN_COUNTDOWN_INTERVAL_MS = 1000;

const ROLE_RESTRICTIONS: Record<string, Role[]> = {
  "rapor": ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Murid"],
  "absensi": ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Murid"],
  "catatan": ["orangtua", "WaliKelas", "Guru", "kepalasekolah"],
  "karya": ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Murid"],
  "analisisAI": ["orangtua", "WaliKelas", "Guru", "kepalasekolah"],
  "chatbot": ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Murid"],
  "backupChatbot": ["WaliKelas", "Admin", "Administrator"],
  "notifikasi": ["orangtua", "WaliKelas", "Murid"],
  "pengumuman": ["orangtua", "WaliKelas", "Guru", "Admin", "Administrator", "Murid"],
  "parenting": ["orangtua", "WaliKelas", "Guru", "kepalasekolah", "Admin", "Administrator"],
  "wall": ["orangtua", "WaliKelas", "Guru", "Admin", "Administrator"],
  "inputNilai": ["WaliKelas", "Admin", "Administrator"],
  "inputAbsensi": ["WaliKelas"],
  "rekapSemester": ["WaliKelas"],
  "hakAkses": ["Administrator"],
  "settingAI": ["Administrator"],
  "dataSekolah": ["Admin", "Administrator"],
  "manajemen": ["Admin", "Administrator", "WaliKelas"],
};

function readLastActivity() {
  try {
    return JSON.parse(localStorage.getItem(LAST_ACTIVITY_KEY) || "{}") as Partial<{
      currentTab: string;
      selectedStudentId: string;
      selectedClassName: string;
      showStudentTable: boolean;
      showStudentDataFromTable: boolean;
    }>;
  } catch {
    return {};
  }
}

function canAccessTab(tab: string | undefined, role: Role) {
  if (!tab || tab === "beranda") return true;
  return ROLE_RESTRICTIONS[tab]?.includes(role) ?? true;
}

export default function App() {
  // Login credentials states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>("orangtua");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showForgotPasswordHelp, setShowForgotPasswordHelp] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);
  const [currentUser, setCurrentUser] = useState<PortalUser | null>(null);
  const [sessionToken, setSessionToken] = useState("");
  const [loginSchoolSettings, setLoginSchoolSettings] = useState<SchoolSettings | null>(null);
  const [loginLock, setLoginLock] = useState<{ username: string; until: number } | null>(null);
  const [loginCountdownNow, setLoginCountdownNow] = useState(Date.now());

  // Core application states
  const [db, setDb] = useState<SIKOWALIDatabase | null>(null);
  const [currentTab, setCurrentTab] = useState("beranda");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedClassName, setSelectedClassName] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [showStudentTable, setShowStudentTable] = useState(false);
  const [showStudentDataFromTable, setShowStudentDataFromTable] = useState(false);
  const [studentTablePage, setStudentTablePage] = useState(1);
  const normalizedLoginUsername = loginUsername.trim().toLowerCase();
  const loginLockRemainingMs = loginLock?.username === normalizedLoginUsername ? Math.max(0, loginLock.until - loginCountdownNow) : 0;
  const loginLockSeconds = Math.ceil(loginLockRemainingMs / 1000);
  const isLoginLocked = loginLockRemainingMs > 0;

  const handleLogout = useCallback((reason?: string) => {
    fetch("/api/logout", {
      method: "POST",
      headers: sessionToken ? { "x-session-token": sessionToken } : undefined,
    }).catch(() => undefined);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    setIsLoggedIn(false);
    setCurrentTab("beranda");
    setCurrentUser(null);
    setSessionToken("");
    setDb(null);
    if (reason) setLoginError(reason);
  }, [sessionToken]);

  useEffect(() => {
    fetch("/api/school-settings")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.settings) setLoginSchoolSettings(data.settings);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!loginLock) return;
    setLoginCountdownNow(Date.now());
    const timer = window.setInterval(() => setLoginCountdownNow(Date.now()), LOGIN_COUNTDOWN_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loginLock]);

  useEffect(() => {
    if (loginLock && loginLock.until <= loginCountdownNow) setLoginLock(null);
  }, [loginLock, loginCountdownNow]);

  useEffect(() => {
    const lastActivity = readLastActivity();
    const params = new URLSearchParams();
    if (lastActivity.selectedStudentId) params.set("studentId", lastActivity.selectedStudentId);
    if (lastActivity.selectedClassName) params.set("className", lastActivity.selectedClassName);
    fetch(`/api/session?${params.toString()}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!data?.user || !data?.db) return;
        setCurrentUser(data.user);
        setSelectedRole(data.user.role);
        setSessionToken(data.sessionToken || "");
        setDb(data.db);
        setCurrentTab(canAccessTab(lastActivity.currentTab, data.user.role) ? lastActivity.currentTab || "beranda" : "beranda");
        if (data.db.student?.id) setSelectedStudentId(data.db.student.id);
        if (data.db.selectedClassName) setSelectedClassName(data.db.selectedClassName);
        setShowStudentTable(!!lastActivity.showStudentTable);
        setShowStudentDataFromTable(!!lastActivity.showStudentDataFromTable);
        setIsLoggedIn(true);
      })
      .catch(() => undefined)
      .finally(() => setRestoringSession(false));
  }, []);

  useEffect(() => {
    const titleSchoolName = db?.schoolSettings?.name || loginSchoolSettings?.name || "SIKOWALI";
    const schoolIconUrl = db?.schoolSettings?.logoUrl || loginSchoolSettings?.logoUrl || "/favicon.ico";
    let favicon = document.querySelector<HTMLLinkElement>("link#school-favicon");
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.id = "school-favicon";
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    document.title = titleSchoolName;
    favicon.href = schoolIconUrl;
  }, [db?.schoolSettings?.name, db?.schoolSettings?.logoUrl, loginSchoolSettings?.name, loginSchoolSettings?.logoUrl]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;
    localStorage.setItem(LAST_ACTIVITY_KEY, JSON.stringify({
      currentTab,
      selectedStudentId,
      selectedClassName,
      showStudentTable,
      showStudentDataFromTable,
    }));
  }, [isLoggedIn, currentUser, currentTab, selectedStudentId, selectedClassName, showStudentTable, showStudentDataFromTable]);

  useEffect(() => {
    if (!isLoggedIn || !currentUser) return;
    let idleTimer = window.setTimeout(() => {
      handleLogout("Sesi berakhir otomatis karena tidak ada aktivitas selama 10 menit.");
    }, IDLE_LOGOUT_MS);
    let lastKeepAlive = 0;

    const keepSessionAlive = () => {
      const now = Date.now();
      if (now - lastKeepAlive < KEEP_ALIVE_INTERVAL_MS) return;
      lastKeepAlive = now;
      fetch("/api/session/keep-alive", {
        method: "POST",
        headers: sessionToken ? { "x-session-token": sessionToken } : undefined,
      }).then((res) => {
        if (res.status === 401) handleLogout("Sesi login telah berakhir. Silakan login kembali.");
      }).catch(() => undefined);
    };

    const registerActivity = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        handleLogout("Sesi berakhir otomatis karena tidak ada aktivitas selama 10 menit.");
      }, IDLE_LOGOUT_MS);
      keepSessionAlive();
    };

    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => document.addEventListener(event, registerActivity, true));
    keepSessionAlive();

    return () => {
      window.clearTimeout(idleTimer);
      events.forEach((event) => document.removeEventListener(event, registerActivity, true));
    };
  }, [isLoggedIn, currentUser, sessionToken, handleLogout]);

  // Load database after login and when the role-scoped selector changes.
  const loadDatabase = async (userId = currentUser?.id, studentId = selectedStudentId, className = selectedClassName) => {
    try {
      const params = new URLSearchParams();
      if (userId) params.set("userId", userId);
      if (studentId) params.set("studentId", studentId);
      if (className) params.set("className", className);
      const res = await fetch(`/api/db?${params.toString()}`, {
        headers: sessionToken ? { "x-session-token": sessionToken } : undefined
      });
      if (res.ok) {
        const data = await res.json();
        setDb(data);
        if (data.student?.id) setSelectedStudentId(data.student.id);
        if (data.selectedClassName) setSelectedClassName(data.selectedClassName);
      }
    } catch (err) {
      console.error("Failed to load databases:", err);
    }
  };

  // Update specific scores on server
  const handleUpdateScores = async (updatedScores: SubjectScore[]) => {
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ scores: updatedScores, studentId: db?.student.id })
      });
      if (res.ok) {
        const data = await res.json();
        if (db) {
          setDb({ ...db, scores: data.scores });
        }
      }
    } catch (err) {
      console.error("Error updating score records:", err);
    }
  };

  // Update attendance records
  const handleUpdateAttendance = async (updatedAttendance: AttendanceRecord[]) => {
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ attendance: updatedAttendance, studentId: db?.student.id })
      });
      if (res.ok) {
        const data = await res.json();
        if (db) {
          setDb({ ...db, attendance: data.attendance });
        }
      }
    } catch (err) {
      console.error("Error updating attendance:", err);
    }
  };

  const handleUpdateAttendanceDay = async (payload: { date: string; status: AttendanceStatus; note?: string }) => {
    try {
      const res = await fetch("/api/attendance/day", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ ...payload, studentId: db?.student.id })
      });
      if (res.ok) {
        const data = await res.json();
        if (db) {
          setDb({ ...db, attendance: data.attendance, attendanceDaily: data.attendanceDaily });
        }
      }
    } catch (err) {
      console.error("Error updating daily attendance:", err);
    }
  };

  const handleAddBehaviour = async (payload: { type: DisciplineType; title: string; description: string }) => {
    try {
      const res = await fetch("/api/behaviour", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ ...payload, studentId: db?.student.id })
      });
      if (res.ok) {
        const data = await res.json();
        if (db) setDb({ ...db, behaviour: data.behaviour });
      }
    } catch (err) {
      console.error("Error adding behaviour log:", err);
    }
  };

  // Gallery Comment post
  const handleAddKaryaComment = async (karyaId: string, text: string) => {
    try {
      const res = await fetch("/api/comment-karya", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ karyaId, author: db?.currentUser?.name || "Pengguna SIKOWALI", text })
      });
      if (res.ok) {
        const data = await res.json();
        if (db) {
          setDb({ ...db, karya: data.karya });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddKarya = async (payload: { title: string; category: string; description: string; imageUrl: string }) => {
    try {
      const res = await fetch("/api/karya", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ ...payload, studentId: db?.student.id })
      });
      if (res.ok) await loadDatabase();
    } catch (err) {
      console.error(err);
    }
  };

  // Announcement post
  const handleAddAnnouncement = async (ann: Omit<Announcement, "id" | "date">) => {
    try {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify(ann)
      });
      if (res.ok) {
        const data = await res.json();
        if (db) {
          setDb({ ...db, announcements: data.announcements });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Feedback post
  const handleAddFeedback = async (fd: { author: string; type: "Positif" | "Keluhan" | "Saran"; content: string }) => {
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify(fd)
      });
      if (res.ok) {
        const data = await res.json();
        if (db) {
          setDb({ ...db, feedback: data.feedback });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Feedback like
  const handleLikeFeedback = async (id: string) => {
    try {
      const res = await fetch("/api/feedback/like", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        await loadDatabase(); // reload full metrics safely
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Feedback Comment submit
  const handleAddFeedbackComment = async (feedbackId: string, text: string) => {
    try {
      const res = await fetch("/api/feedback/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ feedbackId, author: db?.currentUser?.name || (selectedRole === "orangtua" ? "Wali Murid" : "Humas SIKOWALI"), text })
      });
      if (res.ok) {
        await loadDatabase();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Authenticate triggers
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (isLoginLocked) {
      setLoginError(`Akun orang tua terkunci sementara. Coba lagi dalam ${loginLockSeconds} detik.`);
      return;
    }

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.retryAfterMs) {
          const retryAfterMs = Number(data.retryAfterMs);
          setLoginLock({ username: normalizedLoginUsername, until: Date.now() + retryAfterMs });
          setLoginCountdownNow(Date.now());
          setLoginError(`${data.error || "Akun orang tua terkunci sementara."} Coba lagi dalam ${Math.ceil(retryAfterMs / 1000)} detik.`);
          return;
        }
        setLoginError(data.error || "Username atau password salah.");
        return;
      }
      setLoginLock(null);
      setCurrentUser(data.user);
      setSelectedRole(data.user.role);
      setSessionToken(data.sessionToken || "");
      setDb(data.db);
      if (data.db?.student?.id) setSelectedStudentId(data.db.student.id);
      if (data.db?.selectedClassName) setSelectedClassName(data.db.selectedClassName);
      setIsLoggedIn(true);
    } catch (err) {
      setLoginError("Tidak dapat menghubungi server login.");
    }
  };

  // Tab translations label helper
  const getTabLabel = () => {
    switch (currentTab) {
      case "beranda": return "Beranda";
      case "rapor": return "Nilai & Rapor";
      case "absensi": return "Kehadiran Murid";
      case "catatan": return "Catatan Perilaku";
      case "karya": return "Dokumentasi & Karya";
      case "analisisAI": return "Analisis AI";
      case "chatbot": return "Chatbot SIKOWALI";
      case "backupChatbot": return "Backup Chatbot AI";
      case "notifikasi": return "Notifikasi";
      case "pengumuman": return "Pengumuman Sekolah";
      case "parenting": return "Ruang Parenting";
      case "wall": return "Masukkan Wall";
      case "inputNilai": return "Input Nilai";
      case "inputAbsensi": return "Input Absensi";
      case "rekapSemester": return "Rekap Semester";
      case "profil": return "Profil Wali Murid";
      case "hakAkses": return "Matriks Otorisasi & Hak Akses";
      case "settingAI": return "Setting AI";
      case "dataSekolah": return "Data Sekolah";
      case "manajemen": return "Manajemen Data";
      default: return "SIKOWALI";
    }
  };

  // Main UI routing render switch
  const renderTabContent = () => {
    if (!db) return <div className="p-12 text-center text-slate-400 font-semibold select-none">Sedang menghubungkan ke server SIKOWALI...</div>;

    if (!canAccessTab(currentTab, selectedRole)) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-4 pt-20">
          <div className="p-4 bg-red-100 text-red-600 rounded-full shadow-inner">
            <Lock className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-700">Akses Ditolak</h2>
          <p className="text-sm text-slate-500">Peran <span className="font-bold">{selectedRole}</span> tidak diizinkan mengakses halaman ini.</p>
          <button onClick={() => setCurrentTab("beranda")} className="px-5 py-2.5 mt-2 bg-[#125B3d] text-white rounded-xl text-xs font-bold hover:bg-[#0b3c28] shadow hover:shadow-md transition-all">
            Kembali ke Beranda
          </button>
        </div>
      );
    }

    switch (currentTab) {
      case "beranda":
        return <BerandaTab db={db} setTab={setCurrentTab} role={selectedRole} />;
      case "rapor":
        return <RaporTab db={db} />;
      case "absensi":
        return <AbsensiTab db={db} />;
      case "catatan":
        return <CatatanTab db={db} role={selectedRole} onAddBehaviour={handleAddBehaviour} />;
      case "karya":
        return <KaryaTab db={db} onAddComment={handleAddKaryaComment} onAddKarya={handleAddKarya} role={selectedRole} />;
      case "analisisAI":
        return <AnalisisTab db={db} sessionToken={sessionToken} />;
      case "chatbot":
        return <ChatbotTab db={db} sessionToken={sessionToken} />;
      case "backupChatbot":
        return <ChatbotBackupTab sessionToken={sessionToken} />;
      case "notifikasi":
        return <NotifikasiTab db={db} sessionToken={sessionToken} onRefresh={() => loadDatabase()} />;
      case "pengumuman":
        return <PengumumanTab db={db} onAddAnnouncement={handleAddAnnouncement} role={selectedRole} />;
      case "parenting":
        return <ParentingTab db={db} role={selectedRole} sessionToken={sessionToken} onRefresh={() => loadDatabase()} />;
      case "wall":
        return (
          <WallTab
            db={db}
            onAddFeedback={handleAddFeedback}
            onLikeFeedback={handleLikeFeedback}
            onAddFeedbackComment={handleAddFeedbackComment}
            role={selectedRole}
          />
        );
      case "inputNilai":
        return <InputNilaiTab db={db} sessionToken={sessionToken} onSelectStudent={handleStudentChange} onRefresh={() => loadDatabase()} />;
      case "inputAbsensi":
        return <InputAbsensiTab db={db} onUpdateAttendance={handleUpdateAttendance} onUpdateAttendanceDay={handleUpdateAttendanceDay} onSelectStudent={handleStudentChange} />;
      case "rekapSemester":
        return <RekapSemesterTab db={db} sessionToken={sessionToken} onSelectStudent={handleStudentChange} />;
      case "profil":
        return <ProfilTab db={db} role={selectedRole} sessionToken={sessionToken} onRefresh={() => loadDatabase()} />;
      case "hakAkses":
        return <HakAksesTab currentRole={selectedRole} onChangeRole={() => undefined} db={db} sessionToken={sessionToken} onRefresh={() => loadDatabase()} />;
      case "settingAI":
        return <SettingAITab db={db} sessionToken={sessionToken} onRefresh={() => loadDatabase()} />;
      case "dataSekolah":
        return <DataSekolahTab db={db} sessionToken={sessionToken} onRefresh={() => loadDatabase()} />;
      case "manajemen":
        return <ManajemenTab db={db} role={selectedRole} sessionToken={sessionToken} onRefresh={() => loadDatabase()} />;
      default:
        return <BerandaTab db={db} setTab={setCurrentTab} role={selectedRole} />;
    }
  };

  const handleClassChange = async (className: string) => {
    setSelectedClassName(className);
    setSelectedStudentId("");
    setStudentSearch("");
    setShowStudentTable(false);
    setShowStudentDataFromTable(false);
    setStudentTablePage(1);
    await loadDatabase(currentUser?.id, "", className);
  };

  const handleStudentChange = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setShowStudentTable(false);
    setShowStudentDataFromTable(false);
    await loadDatabase(currentUser?.id, studentId, selectedClassName);
  };

  const openStudentTable = () => {
    setShowStudentTable(true);
    setShowStudentDataFromTable(false);
    setStudentTablePage(1);
  };

  const toggleStudentTable = () => {
    setShowStudentTable((value) => {
      const nextValue = !value;
      if (nextValue) {
        setShowStudentDataFromTable(false);
        setStudentTablePage(1);
      }
      return nextValue;
    });
  };

  const handleShowStudentDataFromTable = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setShowStudentTable(true);
    setShowStudentDataFromTable(true);
    await loadDatabase(currentUser?.id, studentId, selectedClassName);
  };

  const currentTeacher = db?.teachers?.find((teacher) => teacher.userId === currentUser?.id);
  const canSelectStudents = ["WaliKelas", "Guru", "kepalasekolah", "Admin", "Administrator"].includes(selectedRole);
  const selectableStudents = db
    ? ["Admin", "Administrator"].includes(selectedRole)
      ? db.students || db.visibleStudents || []
      : db.visibleStudents || []
    : [];
  const filteredSelectableStudents = selectableStudents.filter((student) => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return true;
    return [student.name, student.nis, student.className, student.parentName]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query));
  });
  const activeStudentForDropdown = selectableStudents.find((student) => student.id === (selectedStudentId || db?.student.id));
  const dropdownStudents = activeStudentForDropdown && !filteredSelectableStudents.some((student) => student.id === activeStudentForDropdown.id)
    ? [activeStudentForDropdown, ...filteredSelectableStudents]
    : filteredSelectableStudents;
  const shouldPaginateStudentTable = selectedRole === "WaliKelas" || selectedRole === "Guru" || selectedRole === "kepalasekolah";
  const studentTablePageSize = 10;
  const studentTablePageCount = Math.max(1, Math.ceil(filteredSelectableStudents.length / studentTablePageSize));
  const currentStudentTablePage = Math.min(studentTablePage, studentTablePageCount);
  const visibleStudentTableRows = shouldPaginateStudentTable
    ? filteredSelectableStudents.slice((currentStudentTablePage - 1) * studentTablePageSize, currentStudentTablePage * studentTablePageSize)
    : filteredSelectableStudents;
  const studentTableStart = filteredSelectableStudents.length === 0 ? 0 : (currentStudentTablePage - 1) * studentTablePageSize + 1;
  const studentTableEnd = Math.min(currentStudentTablePage * studentTablePageSize, filteredSelectableStudents.length);
  const portalRoleLabel = selectedRole === "orangtua" ? "Orang Tua" : selectedRole === "WaliKelas" ? "Wali Kelas" : selectedRole === "kepalasekolah" ? "Kepala Sekolah" : selectedRole;
  const portalScopedStudents = db?.visibleStudents || (db?.student ? [db.student] : []);
  const portalParentName = db?.currentUser?.name || db?.student?.parentName || "Orang Tua";
  const portalWelcomeName = selectedRole === "orangtua" ? portalParentName : db?.currentUser?.name || db?.student?.name || portalRoleLabel;
  const portalChildSummary = portalScopedStudents.map((item) => `${item.name} - ${item.className}`).join(", ");
  const portalWelcomeDetail = selectedRole === "orangtua"
    ? `Terhubung dengan ${portalScopedStudents.length} anak: ${portalChildSummary || "-"}`
    : selectedRole === "WaliKelas"
      ? `Sebagai wali kelas: ${currentTeacher?.className || portalScopedStudents[0]?.className || "belum ditentukan"}`
      : "Update otomatis dari portal utama sekolah";
  const showStudentSelectorPanel = !["Admin", "Administrator"].includes(selectedRole) || currentTab === "beranda";
  const activeSchoolSettings = db?.schoolSettings || loginSchoolSettings;
  const schoolName = activeSchoolSettings?.name || "SIKOWALI";
  const schoolPhone = activeSchoolSettings?.phone?.trim() || "";
  const schoolWhatsApp = schoolPhone.replace(/\D/g, "").replace(/^0/, "62");
  const schoolLogoUrl = activeSchoolSettings?.logoUrl || "";
  const schoolMeta = [activeSchoolSettings?.level, activeSchoolSettings?.status, activeSchoolSettings?.academicYear].filter(Boolean).join(" • ");

  if (restoringSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="w-10 h-10 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
          <p className="text-xs font-black uppercase tracking-wider">Memulihkan sesi portal...</p>
        </div>
      </div>
    );
  }

  // Render Login state screen if not authenticated
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row relative font-sans">
        {/* Left Side Highlight Panel banner */}
        <div className="md:w-[45%] bg-[#125B3d] text-white p-8 md:p-14 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 bg-emerald-400/10 w-96 h-96 rounded-full blur-3xl pointer-events-none" />
          
          {/* Logo & title banner */}
          <div className="space-y-4 relative z-10 select-none">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-yellow-400 rounded-xl text-slate-900 shadow overflow-hidden flex items-center justify-center">
                {schoolLogoUrl ? (
                  <img src={schoolLogoUrl} alt={schoolName} className="w-full h-full object-cover" />
                ) : (
                  <BookOpen className="w-6 h-6 fill-slate-900" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-black tracking-wider leading-none">SIKOWALI</h1>
                <p className="text-[9px] text-[#A3E2C9] font-bold tracking-widest uppercase mt-1">SISTEM KOMUNIKASI WALI MURID</p>
                <p className="text-[10px] text-yellow-200 font-black mt-1">{schoolName}</p>
              </div>
            </div>

            <div className="pt-10 space-y-3">
              <p className="inline-flex w-fit rounded-full bg-white/10 border border-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-yellow-200">
                {schoolMeta || "Portal Sekolah Aktif"}
              </p>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-none text-slate-100">
                Jembatan Cerdas <br /><span className="text-yellow-400">Sekolah & Orang Tua</span>
              </h2>
              <p className="text-xs text-slate-200/90 leading-relaxed font-medium">
                Platform terintegrasi untuk memantau perkembangan akademik anak secara real-time, penanganan kedisiplinan, materi parenting, serta asisten analisis bimbingan AI digital yang responsif.
              </p>
            </div>
          </div>

          {/* Quick list points */}
          <div className="py-12 space-y-4 relative z-10 select-none">
            <div className="flex gap-3 text-xs items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
              <p className="text-slate-100 font-semibold">Pantau nilai ujian, absensi bulanan, dan laporan guru instan</p>
            </div>
            <div className="flex gap-3 text-xs items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
              <p className="text-slate-100 font-semibold">Diagnosis performa anak bertenaga AI model cerdas</p>
            </div>
            <div className="flex gap-3 text-xs items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
              <p className="text-slate-100 font-semibold">Komunikasi dua arah wali murid dengan tim walikelas</p>
            </div>
          </div>

          <div className="text-[10px] text-[#A3E2C9] font-bold mt-auto select-none">
             {schoolName} © 2026 • SIKOWALI
          </div>
        </div>

        {/* Right Side LoginForm authentication card */}
        <div className="flex-1 bg-white p-8 md:p-16 flex flex-col justify-center relative">
          <div className="max-w-md w-full mx-auto space-y-8 select-none">
            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Selamat Datang</h3>
              <p className="text-sm font-black text-[#125B3d]">{schoolName}</p>
            </div>

            {/* Error alerts indicator */}
            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl animate-shake font-bold">
                {loginError}
              </div>
            )}
            {isLoginLocked && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3.5 rounded-xl font-bold flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-amber-600">Keamanan akun orang tua</p>
                  <p>Coba login lagi dalam {loginLockSeconds} detik.</p>
                </div>
              </div>
            )}

            {/* Login Inputs fields */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 font-bold uppercase block">USERNAME / EMAIL</label>
                <input
                  type="text"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Masukkan username Anda..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-emerald-500/10 focus:border-[#125B3d] transition-all focus:outline-none text-slate-700 font-semibold"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] text-slate-400 font-bold uppercase block">KATA SANDI (PASSWORD)</label>
                  <button type="button" onClick={() => setShowForgotPasswordHelp(true)} className="text-[10px] font-bold text-slate-400 hover:text-emerald-600 transition-all">Lupa password?</button>
                </div>
                <div className="relative">
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    disabled={isLoginLocked}
                    placeholder="Masukkan password Anda..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 pr-10 text-xs focus:ring-2 focus:ring-emerald-500/10 focus:border-[#125B3d] transition-all focus:outline-none text-slate-700 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((value) => !value)}
                    disabled={isLoginLocked}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    aria-label={showLoginPassword ? "Sembunyikan password" : "Tampilkan password"}
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoginLocked}
                className="w-full h-11 bg-[#125B3d] hover:bg-[#0b3c28] text-white font-extrabold text-xs rounded-xl shadow hover:shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {isLoginLocked ? `Tunggu ${loginLockSeconds} detik` : "Masuk ke Portal"}
                {isLoginLocked ? <Lock className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

          </div>
          {showForgotPasswordHelp && (
            <div className="absolute inset-0 z-20 bg-slate-950/35 backdrop-blur-sm flex items-center justify-center p-5">
              <div role="dialog" aria-modal="true" aria-labelledby="forgot-password-title" className="w-full max-w-sm bg-white border border-slate-100 rounded-2xl shadow-xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 id="forgot-password-title" className="text-sm font-black text-slate-900">Bantuan Reset Password</h4>
                    <p className="text-xs text-slate-500 mt-1">Reset password dilakukan oleh Admin Sekolah untuk menjaga keamanan akun.</p>
                  </div>
                  <button type="button" onClick={() => setShowForgotPasswordHelp(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Tutup bantuan reset password">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-800 font-semibold space-y-1">
                  <p>Silakan hubungi Admin Sekolah dan sampaikan username akun Anda.</p>
                  <p>Admin akan memeriksa identitas sebelum memberikan password sementara.</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Kontak Sekolah</p>
                  <p className="text-sm font-black text-slate-800 mt-1">{schoolPhone || "Nomor kontak sekolah belum tersedia"}</p>
                </div>
                <div className="flex justify-end gap-2">
                  {schoolWhatsApp && (
                    <a href={`https://wa.me/${schoolWhatsApp}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black hover:bg-emerald-400">
                      <Phone className="w-4 h-4" />
                      Hubungi via WhatsApp
                    </a>
                  )}
                  <button type="button" onClick={() => setShowForgotPasswordHelp(false)} className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800">
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active Authenticated State screen dashboard template
  return (
    <div className="flex h-screen portal-app-bg overflow-hidden font-sans">
      <Sidebar 
        currentTab={currentTab} 
        setTab={setCurrentTab} 
        role={selectedRole} 
        unreadCount={(db?.notifications || []).filter((item) => !item.isRead).length}
        schoolSettings={db?.schoolSettings}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
          role={selectedRole} 
          setRole={setSelectedRole} 
          tabLabel={getTabLabel()} 
          schoolName={schoolName}
          schoolLogoUrl={schoolLogoUrl}
          isUsingMariaDB={db?.isUsingMariaDB}
          isUsingPostgreSQL={(db as any)?.isUsingPostgreSQL}
          displayName={db?.currentUser?.name}
          onOpenProfile={() => setCurrentTab("profil")}
          onLogout={() => handleLogout()}
        />
        
        {/* Main tabs view content area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
          {db && currentTab !== "profil" && (
            <>
              <div className="relative overflow-hidden bg-[#125B3d] border border-emerald-900/10 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-sm">
                <div className="absolute right-0 top-0 translate-x-16 -translate-y-20 bg-yellow-400/15 w-80 h-80 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute left-1/3 bottom-0 translate-y-20 bg-emerald-300/10 w-72 h-72 rounded-full blur-3xl pointer-events-none" />
                <div className="space-y-1 relative z-10">
                  <p className="text-xs text-yellow-300 font-semibold tracking-wide uppercase">Selamat Datang Portal {portalRoleLabel}</p>
                  <h1 className="text-xl font-bold text-white tracking-tight">Selamat datang kembali, {portalWelcomeName}</h1>
                  <p className="text-sm font-black text-white">{schoolName}</p>
                  <p className="text-xs text-emerald-50/85">
                    {portalWelcomeDetail}
                  </p>
                </div>
                <div className="inline-flex w-fit items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl px-4 py-2 text-xs font-semibold text-emerald-50 shadow-sm relative z-10">
                  <GraduationCap className="w-4 h-4 text-yellow-300" />
                  {schoolMeta || (selectedRole === "orangtua" && db.student ? `${db.student.name}: ${db.student.className}` : `${portalRoleLabel}: Aktif`)}
                </div>
              </div>
              {showStudentSelectorPanel && (
                <div className="portal-panel p-3 flex flex-col xl:flex-row xl:items-center gap-3">
                  <div className="text-xs font-bold text-slate-700">
                    {selectedRole === "Murid" && "Portal murid hanya menampilkan data diri sendiri."}
                    {selectedRole === "orangtua" && "Portal orang tua hanya menampilkan anak yang terhubung."}
                    {selectedRole === "WaliKelas" && `Portal wali kelas dibatasi pada kelas wali${currentTeacher ? `: ${currentTeacher.name} - ${currentTeacher.className}` : " yang ditugaskan"}.`}
                    {(selectedRole === "Guru" || selectedRole === "kepalasekolah") && "Pilih kelas untuk melihat murid di kelas tersebut."}
                    {["Admin", "Administrator"].includes(selectedRole) && "Admin dapat mencari dan memilih murid dari seluruh data sekolah."}
                  </div>
                  <div className="flex-1" />
                  {(selectedRole === "Guru" || selectedRole === "kepalasekolah") && (
                    <select
                      value={selectedClassName}
                      onChange={(e) => handleClassChange(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      <option value="">Semua Kelas</option>
                      {(db.classes || []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  )}
                  {canSelectStudents && selectableStudents.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full xl:w-auto">
                      <div className="relative sm:w-64">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          value={studentSearch}
                          onChange={(e) => {
                            setStudentSearch(e.target.value);
                            setStudentTablePage(1);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") openStudentTable();
                          }}
                          placeholder="Cari nama, NIS, kelas..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={openStudentTable}
                        className="inline-flex items-center justify-center gap-2 bg-[#125B3d] text-white rounded-lg px-3 py-2 text-xs font-bold hover:bg-[#0b3c28] transition-all"
                      >
                        <Search className="w-4 h-4" />
                        Cari
                      </button>
                      <select
                        value={selectedStudentId || db.student.id}
                        onChange={(e) => handleStudentChange(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 sm:min-w-64"
                      >
                        {dropdownStudents.map((s) => <option key={s.id} value={s.id}>{s.name} - {s.className}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={toggleStudentTable}
                        className="inline-flex items-center justify-center gap-2 bg-white text-[#125B3d] border border-emerald-200 rounded-lg px-3 py-2 text-xs font-bold hover:bg-emerald-50 transition-all"
                      >
                        <Table2 className="w-4 h-4" />
                        {showStudentTable ? "Tutup Tabel" : "Lihat Tabel"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {showStudentSelectorPanel && canSelectStudents && showStudentTable && (
                <div className="portal-panel overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-white/70">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Tabel Pilihan Murid</h3>
                      <p className="text-xs text-slate-500">
                        {shouldPaginateStudentTable
                          ? `Menampilkan ${studentTableStart}-${studentTableEnd} dari ${filteredSelectableStudents.length} murid. Maksimal 10 data per halaman.`
                          : "Klik baris murid untuk menjadikannya data aktif di portal."}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full">
                      {filteredSelectableStudents.length} murid ditemukan
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                        <tr>
                          <th className="px-4 py-3">Nama Murid</th>
                          <th className="px-4 py-3">NIS</th>
                          <th className="px-4 py-3">Kelas</th>
                          <th className="px-4 py-3">Orang Tua</th>
                          <th className="px-4 py-3">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleStudentTableRows.map((student) => {
                          const active = student.id === db.student.id;
                          return (
                            <tr key={student.id} className={active ? "bg-emerald-50/70" : "hover:bg-slate-50"}>
                              <td className="px-4 py-3 font-bold text-slate-900">{student.name}</td>
                              <td className="px-4 py-3 text-slate-600">{student.nis}</td>
                              <td className="px-4 py-3 text-slate-600">{student.className}</td>
                              <td className="px-4 py-3 text-slate-600">{student.parentName || "-"}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => handleShowStudentDataFromTable(student.id)}
                                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${active && showStudentDataFromTable ? "bg-emerald-100 text-emerald-700" : "bg-[#125B3d] text-white hover:bg-[#0b3c28]"}`}
                                >
                                  {active && showStudentDataFromTable ? "Aktif" : "Tampilkan Data"}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredSelectableStudents.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-400 font-semibold">
                              Tidak ada murid yang cocok dengan pencarian.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {shouldPaginateStudentTable && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-white/70">
                      <span className="text-xs font-semibold text-slate-500">
                        Halaman {currentStudentTablePage} dari {studentTablePageCount}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={currentStudentTablePage <= 1}
                          onClick={() => setStudentTablePage(currentStudentTablePage - 1)}
                          className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
                        >
                          Sebelumnya
                        </button>
                        <button
                          type="button"
                          disabled={currentStudentTablePage >= studentTablePageCount}
                          onClick={() => setStudentTablePage(currentStudentTablePage + 1)}
                          className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
                        >
                          Berikutnya
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {showStudentSelectorPanel && canSelectStudents && showStudentTable && !showStudentDataFromTable ? null : renderTabContent()}
        </main>
      </div>
    </div>
  );
}
