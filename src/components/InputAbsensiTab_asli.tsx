import React, { useEffect, useMemo, useState } from "react";
import { AttendanceRecord, AttendanceStatus, SIKOWALIDatabase } from "../types";
import { AlertTriangle, CalendarDays, CheckCircle, FileText, Save, Thermometer, UserCheck } from "lucide-react";

interface InputAbsensiTabProps {
  db: SIKOWALIDatabase;
  onUpdateAttendance: (attendance: AttendanceRecord[]) => Promise<void>;
  onUpdateAttendanceDay: (payload: { date: string; status: AttendanceStatus; note?: string }) => Promise<void>;
  onSelectStudent?: (studentId: string) => Promise<void>;
}

const statusOptions: {
  value: AttendanceStatus;
  label: string;
  icon: React.ElementType;
  className: string;
}[] = [
  { value: "hadir", label: "Hadir", icon: UserCheck, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  { value: "sakit", label: "Sakit", icon: Thermometer, className: "border-amber-200 bg-amber-50 text-amber-700" },
  { value: "izin", label: "Izin", icon: FileText, className: "border-sky-200 bg-sky-50 text-sky-700" },
  { value: "alpha", label: "Alpha", icon: AlertTriangle, className: "border-rose-200 bg-rose-50 text-rose-700" },
];

const statusLabels: Record<AttendanceStatus, string> = {
  hadir: "Hadir",
  sakit: "Sakit",
  izin: "Izin",
  alpha: "Alpha",
};

const statusBadge: Record<AttendanceStatus, string> = {
  hadir: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sakit: "bg-amber-50 text-amber-700 border-amber-200",
  izin: "bg-sky-50 text-sky-700 border-sky-200",
  alpha: "bg-rose-50 text-rose-700 border-rose-200",
};

const SEMESTER_MONTHS = {
  Ganjil: ["Juli", "Agustus", "September", "Oktober", "November", "Desember"],
  Genap: ["Januari", "Februari", "Maret", "April", "Mei", "Juni"],
} as const;

function todayISO() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().split("T")[0];
}

function normalizeSemester(value?: string) {
  return value?.toLowerCase() === "ganjil" ? "Ganjil" : "Genap";
}

function monthName(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", { month: "long" });
}

function displayDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function academicYearParts(value?: string) {
  const parts = String(value || "").match(/\d{4}/g);
  const startYear = Number(parts?.[0] || new Date().getFullYear());
  const endYear = Number(parts?.[1] || startYear + 1);
  return { startYear, endYear };
}

function semesterDate(semester: "Ganjil" | "Genap", academicYear?: string) {
  const { startYear, endYear } = academicYearParts(academicYear);
  return semester === "Ganjil" ? `${startYear}-07-01` : `${endYear}-01-01`;
}

function isDateInSemester(date: string, semester: "Ganjil" | "Genap") {
  const month = monthName(date);
  return (SEMESTER_MONTHS[semester] as readonly string[]).includes(month);
}

function emptyAttendanceRecord(month: string): AttendanceRecord {
  return { month, hadir: 0, sakit: 0, izin: 0, alpha: 0, persentase: 0 };
}

function withPercentage(record: AttendanceRecord): AttendanceRecord {
  const total = record.hadir + record.sakit + record.izin + record.alpha;
  return { ...record, persentase: total ? Math.round((record.hadir / total) * 100) : 0 };
}

export default function InputAbsensiTab({ db, onUpdateAttendance, onUpdateAttendanceDay, onSelectStudent }: InputAbsensiTabProps) {
  const [inputMode, setInputMode] = useState<"harian" | "semester">("harian");
  const [date, setDate] = useState(todayISO());
  const [selectedSemester, setSelectedSemester] = useState<"Ganjil" | "Genap">(() => normalizeSemester(db.schoolSettings?.semester));
  const [semesterRows, setSemesterRows] = useState<AttendanceRecord[]>([]);
  const [status, setStatus] = useState<AttendanceStatus>("hadir");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const dailyRecords = useMemo(() => {
    return (db.attendanceDaily || [])
      .filter((record) => record.studentId === db.student.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [db.attendanceDaily, db.student.id]);

  const selectedDateRecord = dailyRecords.find((record) => record.date === date);
  const selectedSemesterRecords = dailyRecords.filter((record) => isDateInSemester(record.date, selectedSemester));
  const semesterRecap = useMemo(() => {
    const hadir = selectedSemesterRecords.filter((record) => record.status === "hadir").length;
    const sakit = selectedSemesterRecords.filter((record) => record.status === "sakit").length;
    const izin = selectedSemesterRecords.filter((record) => record.status === "izin").length;
    const alpha = selectedSemesterRecords.filter((record) => record.status === "alpha").length;
    const total = hadir + sakit + izin + alpha;
    return { hadir, sakit, izin, alpha, persentase: total ? Math.round((hadir / total) * 100) : 0 };
  }, [selectedSemesterRecords]);

  useEffect(() => {
    const nextSemester = normalizeSemester(db.schoolSettings?.semester);
    setSelectedSemester(nextSemester);
    setDate((current) => isDateInSemester(current, nextSemester) ? current : semesterDate(nextSemester, db.schoolSettings?.academicYear));
  }, [db.student.id, db.schoolSettings?.semester, db.schoolSettings?.academicYear]);

  useEffect(() => {
    setSemesterRows(
      SEMESTER_MONTHS[selectedSemester].map((month) => db.attendance.find((record) => record.month === month) || emptyAttendanceRecord(month))
    );
  }, [db.attendance, db.student.id, selectedSemester]);

  const changeSemester = (semester: "Ganjil" | "Genap") => {
    setSelectedSemester(semester);
    if (!isDateInSemester(date, semester)) {
      setDate(semesterDate(semester, db.schoolSettings?.academicYear));
    }
  };

  useEffect(() => {
    if (selectedDateRecord) {
      setStatus(selectedDateRecord.status);
      setNote(selectedDateRecord.note || "");
    } else {
      setStatus("hadir");
      setNote("");
    }
  }, [db.student.id, selectedDateRecord?.date, selectedDateRecord?.status, selectedDateRecord?.note]);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      if (inputMode === "semester") {
        const nextSemesterRows = semesterRows.map(withPercentage);
        const outsideSemesterRows = db.attendance.filter(
          (record) => !(SEMESTER_MONTHS[selectedSemester] as readonly string[]).includes(record.month)
        );
        await onUpdateAttendance([...outsideSemesterRows, ...nextSemesterRows]);
      } else {
        await onUpdateAttendanceDay({ date, status, note });
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in select-none">
      <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center bg-white border border-slate-100 p-4 rounded-xl shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Input Absensi Harian & Semester</h3>
          <p className="text-xs text-slate-500">Pilih mode harian atau rekap semester sesuai kebutuhan input absensi.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 bg-emerald-500 text-slate-950 font-bold hover:bg-emerald-400 disabled:opacity-50 transition-all text-xs px-4 py-2 rounded-xl h-9 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {saving ? "Menyimpan..." : inputMode === "semester" ? "Simpan Rekap Semester" : "Simpan Absensi"}
        </button>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3 rounded-xl flex items-center gap-2.5">
          <CheckCircle className="w-5 h-5 text-emerald-500" />
          <p className="font-bold">Berhasil! Data absensi tersimpan dan rekap diperbarui otomatis.</p>
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-semibold text-slate-600 bg-slate-50 border px-3 py-1.5 rounded-xl">Kelas: {db.student.className}</span>
            {(db.visibleStudents || []).length > 1 ? (
              <select
                value={db.student.id}
                onChange={(e) => onSelectStudent?.(e.target.value)}
                className="text-xs font-semibold text-slate-600 bg-slate-50 border px-3 py-1.5 rounded-xl"
              >
                {(db.visibleStudents || []).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
              </select>
            ) : (
              <span className="text-xs font-semibold text-slate-600 bg-slate-50 border px-3 py-1.5 rounded-xl">Siswa: {db.student.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
            <CalendarDays className="w-4 h-4" />
            Semester {selectedSemester}
          </div>
        </div>

        <div className="inline-flex bg-slate-50 border border-slate-200 rounded-xl p-1">
          {[
            { id: "harian", label: "Input Harian" },
            { id: "semester", label: "Input Rekap Semester" },
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setInputMode(mode.id as "harian" | "semester")}
              className={`h-8 px-3 rounded-lg text-xs font-black transition-all ${
                inputMode === mode.id ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div className="grid md:grid-cols-[220px_220px_1fr] gap-4">
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Semester</span>
            <select
              value={selectedSemester}
              onChange={(e) => changeSemester(e.target.value as "Ganjil" | "Genap")}
              className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:ring-1 focus:ring-emerald-500 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
            >
              <option value="Ganjil">Ganjil</option>
              <option value="Genap">Genap</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tanggal</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 focus:bg-white border border-slate-200 focus:ring-1 focus:ring-emerald-500 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 focus:outline-none"
            />
            <span className="block text-[10px] font-bold text-slate-400">Bulan semester: {SEMESTER_MONTHS[selectedSemester].join(", ")}</span>
          </label>

          {inputMode === "harian" && <div className="space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status Kehadiran</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {statusOptions.map((option) => {
                const Icon = option.icon;
                const active = status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    className={`h-12 rounded-xl border text-xs font-black flex items-center justify-center gap-2 transition-all ${
                      active ? option.className : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-white"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>}
        </div>

        {inputMode === "harian" && <label className="block space-y-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Catatan Opsional</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={255}
            placeholder="Contoh: surat sakit diterima, izin keluarga, atau keterangan lain."
            className="w-full resize-none bg-slate-50 focus:bg-white border border-slate-200 focus:ring-1 focus:ring-emerald-500 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
          />
        </label>}

        {inputMode === "semester" && (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[720px] text-left text-xs text-slate-700 border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-3">Bulan</th>
                  <th className="px-4 py-3 text-center">Hadir</th>
                  <th className="px-4 py-3 text-center">Sakit</th>
                  <th className="px-4 py-3 text-center">Izin</th>
                  <th className="px-4 py-3 text-center">Alpha</th>
                  <th className="px-4 py-3 text-center">Persentase</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {semesterRows.map((row, index) => {
                  const withPct = withPercentage(row);
                  return (
                    <tr key={row.month} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-black text-slate-800">{row.month}</td>
                      {(["hadir", "sakit", "izin", "alpha"] as const).map((field) => (
                        <td key={field} className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="0"
                            value={row[field]}
                            onChange={(e) => {
                              const value = Math.max(0, parseInt(e.target.value) || 0);
                              setSemesterRows((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
                            }}
                            className="w-20 bg-slate-50 focus:bg-white border border-slate-200 focus:ring-1 focus:ring-emerald-500 px-2 py-1.5 rounded-lg text-xs font-bold text-center focus:outline-none"
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-center font-black text-emerald-600">{withPct.persentase}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid sm:grid-cols-5 gap-2">
          {statusOptions.map((option) => {
            const total = semesterRecap[option.value];
            return (
              <div key={option.value} className={`rounded-xl border p-3 ${option.className}`}>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{option.label}</p>
                <p className="text-2xl font-black">{total}</p>
              </div>
            );
          })}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Persentase</p>
            <p className="text-2xl font-black">{semesterRecap.persentase}%</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Riwayat Absensi Semester {selectedSemester}</h4>
          <span className="text-xs font-semibold text-slate-600 bg-slate-50 border px-3 py-1.5 rounded-xl">{selectedSemesterRecords.length} hari tercatat</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs text-slate-700 border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                <th className="px-5 py-3.5">Tanggal</th>
                <th className="px-5 py-3.5 w-32">Status</th>
                <th className="px-5 py-3.5">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selectedSemesterRecords.length ? selectedSemesterRecords.map((record) => (
                <tr key={`${record.studentId}-${record.date}`} className="hover:bg-slate-50/50">
                  <td className="px-5 py-3.5 font-bold text-slate-800">{displayDate(record.date)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center border rounded-full px-2.5 py-1 text-[11px] font-black ${statusBadge[record.status]}`}>
                      {statusLabels[record.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500 font-semibold">{record.note || "-"}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-slate-400 font-bold">
                    Belum ada absensi harian pada semester ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
