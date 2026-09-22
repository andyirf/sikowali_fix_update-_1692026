import React, { useEffect, useMemo, useState } from "react";
import { AttendanceDailyRecord, AttendanceRecord, SIKOWALIDatabase } from "../types";
import { AlertCircle, Calendar, CheckCircle, Eye, FileText, TrendingUp } from "lucide-react";

interface AbsensiTabProps {
  db: SIKOWALIDatabase;
}

type Semester = "Ganjil" | "Genap";

const SEMESTER_MONTHS: Record<Semester, string[]> = {
  Ganjil: ["Juli", "Agustus", "September", "Oktober", "November", "Desember"],
  Genap: ["Januari", "Februari", "Maret", "April", "Mei", "Juni"],
};

const statusLabels: Record<AttendanceDailyRecord["status"], string> = {
  hadir: "Hadir",
  sakit: "Sakit",
  izin: "Izin",
  alpha: "Alpha",
};

const statusBadge: Record<AttendanceDailyRecord["status"], string> = {
  hadir: "bg-emerald-50 text-emerald-700 border-emerald-200",
  sakit: "bg-amber-50 text-amber-700 border-amber-200",
  izin: "bg-sky-50 text-sky-700 border-sky-200",
  alpha: "bg-rose-50 text-rose-700 border-rose-200",
};

function normalizeSemester(value?: string) {
  return value?.toLowerCase() === "ganjil" ? "Ganjil" : "Genap";
}

function sumAttendance(records: AttendanceRecord[]) {
  const hadir = records.reduce((acc, curr) => acc + curr.hadir, 0);
  const sakit = records.reduce((acc, curr) => acc + curr.sakit, 0);
  const izin = records.reduce((acc, curr) => acc + curr.izin, 0);
  const alpha = records.reduce((acc, curr) => acc + curr.alpha, 0);
  const total = hadir + sakit + izin + alpha;
  const persentase = total > 0 ? Math.round((hadir / total) * 100) : 0;
  return { hadir, sakit, izin, alpha, total, persentase };
}

function sortBySemester(records: AttendanceRecord[], semester: Semester) {
  const monthOrder = SEMESTER_MONTHS[semester];
  return records
    .filter((record) => monthOrder.includes(record.month))
    .sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));
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

function isDateInAcademicSemester(date: string, semester: Semester, academicYear?: string) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const { startYear, endYear } = academicYearParts(academicYear);
  const year = parsedDate.getFullYear();
  const month = monthName(date);
  const expectedYear = semester === "Ganjil" ? startYear : endYear;

  return year === expectedYear && (SEMESTER_MONTHS[semester] as readonly string[]).includes(month);
}

function percentageHeight(value: number) {
  return `${Math.min(100, Math.max(0, value))}%`;
}

export default function AbsensiTab({ db }: AbsensiTabProps) {
  const [selectedSemester, setSelectedSemester] = useState<Semester>(() => normalizeSemester(db.schoolSettings?.semester));
  const [selectedMonth, setSelectedMonth] = useState("all");

  useEffect(() => {
    setSelectedSemester(normalizeSemester(db.schoolSettings?.semester));
    setSelectedMonth("all");
  }, [db.student.id, db.schoolSettings?.semester]);

  const semesterAttendance = useMemo(() => sortBySemester(db.attendance, selectedSemester), [db.attendance, selectedSemester]);
  const visibleAttendance = selectedMonth === "all"
    ? semesterAttendance
    : semesterAttendance.filter((record) => record.month === selectedMonth);
  const summary = sumAttendance(visibleAttendance);
  const dailyRecords = (db.attendanceDaily || [])
    .filter((record) => record.studentId === db.student.id)
    .filter((record) =>
      selectedMonth !== "all" &&
      isDateInAcademicSemester(record.date, selectedSemester, db.schoolSettings?.academicYear) &&
      monthName(record.date).toLowerCase() === selectedMonth.toLowerCase()
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const periodLabel = selectedMonth === "all" ? `Semester ${selectedSemester}` : `${selectedMonth} - Semester ${selectedSemester}`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Absensi Anak</h3>
            <p className="text-xs text-slate-500 mt-1">Lihat rekap per semester atau pilih salah satu bulan pada semester aktif.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="inline-flex bg-slate-50 border border-slate-200 rounded-xl p-1">
              {(["Ganjil", "Genap"] as const).map((semester) => (
                <button
                  key={semester}
                  type="button"
                  onClick={() => {
                    setSelectedSemester(semester);
                    setSelectedMonth("all");
                  }}
                  className={`h-8 px-3 rounded-lg text-xs font-black transition-all ${
                    selectedSemester === semester ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {semester}
                </button>
              ))}
            </div>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="all">Semua Bulan Semester</option>
              {SEMESTER_MONTHS[selectedSemester].map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
            <Eye className="w-3.5 h-3.5 text-emerald-500" />
            {periodLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            Tahun Ajaran {db.schoolSettings?.academicYear || "-"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm space-y-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase block">Hadir</span>
          <p className="text-xl font-bold text-slate-800">{summary.hadir} hari</p>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm space-y-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase block">Sakit</span>
          <p className="text-xl font-bold text-slate-500">{summary.sakit} hari</p>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm space-y-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase block">Izin</span>
          <p className="text-xl font-bold text-slate-500">{summary.izin} hari</p>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm space-y-1">
          <span className="text-[10px] text-slate-400 font-bold uppercase block text-red-500">Alpha</span>
          <p className="text-xl font-bold text-red-500">{summary.alpha} hari</p>
        </div>
        <div className="col-span-2 md:col-span-1 bg-emerald-50 border border-emerald-100 p-4 rounded-xl shadow-sm space-y-1">
          <span className="text-[10px] text-emerald-600 font-bold uppercase block">Kehadiran</span>
          <p className="text-xl font-bold text-emerald-700">{summary.persentase}%</p>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-900">Grafik Kehadiran {periodLabel}</h3>
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            {visibleAttendance.length} bulan
          </span>
        </div>

        <div className="flex items-end justify-between h-40 max-w-xl mx-auto px-4 pt-4 border-b border-slate-100 gap-4 sm:gap-6">
          {visibleAttendance.length ? visibleAttendance.map((m) => {
            const calculatedPercentageHeight = percentageHeight(m.persentase);
            return (
              <div key={m.month} className="flex flex-col items-center flex-1 space-y-2 group">
                <div className="relative w-full flex items-end justify-center h-28">
                  <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] px-2 py-1 rounded-md pointer-events-none whitespace-nowrap z-10 shadow">
                    Hadir: {m.hadir} hari • Sakit: {m.sakit} • Izin: {m.izin} • Alpha: {m.alpha}
                  </div>
                  <div
                    className="w-full sm:w-10 h-full bg-emerald-500/10 border border-emerald-500/20 rounded-t-lg transition-all duration-300 group-hover:bg-emerald-500/20 relative"
                  >
                    <div className="absolute inset-x-0 bottom-0 bg-emerald-500 rounded-t-lg transition-all duration-500 ease-out" style={{ height: calculatedPercentageHeight }} />
                  </div>
                </div>
                <span className="text-[10px] text-slate-500 font-semibold uppercase">{m.month}</span>
              </div>
            );
          }) : (
            <div className="w-full self-center text-center text-xs font-bold text-slate-400">Belum ada data absensi pada periode ini.</div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Detail Rekap Presensi {periodLabel}</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs text-slate-700 border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                <th className="px-5 py-3.5">Bulan</th>
                <th className="px-5 py-3.5 text-center">Hadir</th>
                <th className="px-5 py-3.5 text-center">Sakit</th>
                <th className="px-5 py-3.5 text-center">Izin</th>
                <th className="px-5 py-3.5 text-center">Alpha</th>
                <th className="px-5 py-3.5 text-center">Rata-rata Kehadiran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleAttendance.length ? visibleAttendance.map((m) => {
                const isExcellent = m.persentase >= 95;
                const isUnderperforming = m.persentase < 90;
                return (
                  <tr key={m.month} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-800">{m.month}</td>
                    <td className="px-5 py-3.5 text-center font-medium">{m.hadir} hari</td>
                    <td className="px-5 py-3.5 text-center text-slate-500">{m.sakit} hari</td>
                    <td className="px-5 py-3.5 text-center text-slate-500">{m.izin} hari</td>
                    <td className="px-5 py-3.5 text-center font-semibold text-slate-500">{m.alpha === 0 ? "-" : `${m.alpha} hari`}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isExcellent
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200/50"
                          : isUnderperforming
                            ? "bg-amber-50 text-amber-600 border border-amber-200/50"
                            : "bg-slate-50 text-slate-600 border border-slate-200"
                      }`}>
                        {m.persentase}% Kehadiran
                      </span>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400 font-bold">
                    Belum ada data absensi pada periode ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedMonth !== "all" && (
        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900">Riwayat Harian {selectedMonth}</h3>
            <span className="text-xs font-semibold text-slate-600 bg-slate-50 border px-3 py-1.5 rounded-xl">{dailyRecords.length} hari tercatat</span>
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
                {dailyRecords.length ? dailyRecords.map((record) => (
                  <tr key={`${record.studentId}-${record.date}`} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3.5 font-bold text-slate-800">{displayDate(record.date)}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 border rounded-full px-2.5 py-1 text-[11px] font-black ${statusBadge[record.status]}`}>
                        {record.status === "hadir" ? <CheckCircle className="w-3 h-3" /> : record.status === "alpha" ? <AlertCircle className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        {statusLabels[record.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 font-semibold">{record.note || "-"}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-slate-400 font-bold">
                      Belum ada riwayat absensi harian untuk bulan ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
