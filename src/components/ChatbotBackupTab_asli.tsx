import React, { useEffect, useMemo, useState } from "react";
import { ChatbotBackup } from "../types";
import { Download, MessageCircle, RefreshCw, Search } from "lucide-react";
import { buildExcel, downloadBlob } from "../utils/excelExport";

interface ChatbotBackupTabProps {
  sessionToken: string;
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  downloadBlob(filename, blob);
}


export default function ChatbotBackupTab({ sessionToken }: ChatbotBackupTabProps) {
  const [backups, setBackups] = useState<ChatbotBackup[]>([]);
  const [search, setSearch] = useState("");
  const [backupMode, setBackupMode] = useState<"all" | "student">("all");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadBackups = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/chatbot-backups", {
        headers: sessionToken ? { "x-session-token": sessionToken } : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal memuat backup chatbot.");
      setBackups(data.backups || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const studentOptions = useMemo(() => {
    const students = new Map<string, string>();
    backups.forEach((item) => {
      if (item.studentId) students.set(item.studentId, item.studentName || item.studentId);
    });
    return Array.from(students, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [backups]);

  useEffect(() => {
    if (backupMode === "student" && !selectedStudentId && studentOptions.length) {
      setSelectedStudentId(studentOptions[0].id);
    }
  }, [backupMode, selectedStudentId, studentOptions]);

  const filteredBackups = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return backups.filter((item) => {
      if (backupMode === "student" && item.studentId !== selectedStudentId) return false;
      if (!needle) return true;
      return [item.studentName, item.userName, item.portal, item.question, item.answer]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [backupMode, backups, search, selectedStudentId]);

  const selectedStudent = studentOptions.find((student) => student.id === selectedStudentId);
  const filenameSuffix = backupMode === "student" && selectedStudent
    ? `-${selectedStudent.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || selectedStudent.id}`
    : "-semua-chat";

  const exportJson = () => {
    downloadText(`backup-chatbot-ai${filenameSuffix}.json`, JSON.stringify(filteredBackups, null, 2), "application/json");
  };

  const exportExcel = async () => {
    const header = ["Waktu", "Portal", "Nama User", "Role", "Nama Murid", "Pertanyaan", "Jawaban"];
    const rows = filteredBackups.map((item) => [
      formatDate(item.createdAt),
      item.portal,
      item.userName,
      item.userRole,
      item.studentName || item.studentId || "",
      item.question,
      item.answer,
    ]);
    const blob = await buildExcel([header, ...rows]);
    downloadBlob(`backup-chatbot-ai${filenameSuffix}.xlsx`, blob);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Backup Chatbot AI</h3>
            <p className="text-xs text-slate-500 mt-1">Arsip pertanyaan dan jawaban chatbot dari portal pengguna.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={loadBackups} disabled={loading} className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 hover:bg-white disabled:opacity-50">
              <RefreshCw className="w-4 h-4" />
              Muat Ulang
            </button>
            <button onClick={exportExcel} disabled={!filteredBackups.length} className="inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black hover:bg-emerald-400 disabled:opacity-50">
              <Download className="w-4 h-4" />
              Export Excel
            </button>
            <button onClick={exportJson} disabled={!filteredBackups.length} className="inline-flex items-center gap-2 h-10 px-3 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800 disabled:opacity-50">
              <Download className="w-4 h-4" />
              Export JSON
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[auto_minmax(220px,320px)_1fr_auto] gap-3">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setBackupMode("all")}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${backupMode === "all" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"}`}
            >
              Semua Chat
            </button>
            <button
              type="button"
              onClick={() => setBackupMode("student")}
              className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${backupMode === "student" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800"}`}
            >
              Per Murid
            </button>
          </div>
          <select
            value={selectedStudentId}
            onChange={(e) => setSelectedStudentId(e.target.value)}
            disabled={backupMode !== "student" || !studentOptions.length}
            className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            aria-label="Pilih murid untuk backup chatbot"
          >
            {!studentOptions.length && <option value="">Belum ada data murid</option>}
            {studentOptions.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
          </select>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, portal, pertanyaan, atau jawaban..."
              className="w-full pl-9 pr-4 h-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 text-xs font-bold text-slate-500">
            <MessageCircle className="w-4 h-4 text-emerald-500" />
            {filteredBackups.length} backup
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>}
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full min-w-[900px] text-left text-xs text-slate-700 border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Portal</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Murid</th>
                <th className="px-4 py-3">Pertanyaan</th>
                <th className="px-4 py-3">Jawaban AI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center font-bold text-slate-400">Memuat backup chatbot...</td>
                </tr>
              ) : filteredBackups.length ? filteredBackups.map((item) => (
                <tr key={item.id} className="align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-semibold text-slate-500 whitespace-nowrap">{formatDate(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">{item.portal}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-800">{item.userName}</p>
                    <p className="text-[10px] text-slate-400">{item.userRole}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-600">{item.studentName || item.studentId || "-"}</td>
                  <td className="px-4 py-3 max-w-[260px]">
                    <p className="font-semibold text-slate-800 whitespace-pre-wrap">{item.question}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[360px]">
                    <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{item.answer}</p>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center font-bold text-slate-400">Belum ada backup chatbot AI.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
