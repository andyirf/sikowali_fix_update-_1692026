import React, { useEffect, useMemo, useState } from "react";
import { Award, CalendarDays, Download, FileText, Printer, RefreshCw, UserRound, UsersRound } from "lucide-react";
import { AttendanceRecord, BehaviourLog, SIKOWALIDatabase, Student, StudentScoreDetail, SubjectScore } from "../types";

interface RekapSemesterTabProps {
  db: SIKOWALIDatabase;
  sessionToken: string;
  onSelectStudent?: (studentId: string) => Promise<void>;
}

interface ClassReportItem {
  student: Student;
  scores: SubjectScore[];
  attendance: AttendanceRecord[];
  behaviour: BehaviourLog[];
}

const SEMESTER_MONTHS = {
  Ganjil: ["Juli", "Agustus", "September", "Oktober", "November", "Desember"],
  Genap: ["Januari", "Februari", "Maret", "April", "Mei", "Juni"],
};

function normalizeSemester(value?: string) {
  return value?.toLowerCase() === "ganjil" ? "Ganjil" : "Genap";
}

function defaultReportSemester(db: SIKOWALIDatabase) {
  return normalizeSemester(db.scoreDetails?.[0]?.semester || db.schoolSettings?.semester);
}

function monthName(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("id-ID", { month: "long" });
}

function isBehaviourInSemester(item: BehaviourLog, semester: "Ganjil" | "Genap") {
  const date = new Date(`${item.date}T00:00:00`);
  if (Number.isNaN(date.getTime())) return true;
  return SEMESTER_MONTHS[semester].includes(monthName(item.date));
}

function printPdf() {
  const printArea = document.querySelector(".semester-print-area");
  if (!printArea) {
    window.print();
    return;
  }
  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) {
    window.print();
    return;
  }
  const styles = Array.from(document.querySelectorAll("link[rel='stylesheet'], style"))
    .map((node) => node.outerHTML)
    .join("\n");
  printWindow.document.write(`<!doctype html>
    <html>
      <head>
        <title>Rekap Semester</title>
        ${styles}
        <style>
          @page { size: A4; margin: 10mm; }
          body { background: #fff; color: #0f172a; font-family: Arial, sans-serif; }
          .semester-print-area { border: 0 !important; box-shadow: none !important; padding: 0 !important; width: 100% !important; }
          .print\\:hidden, button { display: none !important; }
          table { width: 100% !important; border-collapse: collapse !important; font-size: 10px !important; }
          th, td { border: 1px solid #cbd5e1 !important; padding: 5px 7px !important; vertical-align: top; }
          th { background: #f1f5f9 !important; color: #334155 !important; }
          tr { break-inside: avoid; }
          .pdf-section { break-inside: avoid; margin-top: 14px; }
          .pdf-signature { break-inside: avoid; }
        </style>
      </head>
      <body>${printArea.outerHTML}</body>
    </html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 350);
}

function summarizeAttendance(attendance: AttendanceRecord[], semester: "Ganjil" | "Genap") {
  const semesterMonths = SEMESTER_MONTHS[semester];
  const rows = attendance.filter((item) => semesterMonths.includes(item.month));
  const total = rows.reduce(
    (acc, item) => ({
      hadir: acc.hadir + item.hadir,
      sakit: acc.sakit + item.sakit,
      izin: acc.izin + item.izin,
      alpha: acc.alpha + item.alpha,
    }),
    { hadir: 0, sakit: 0, izin: 0, alpha: 0 }
  );
  const days = total.hadir + total.sakit + total.izin + total.alpha;
  return { rows, ...total, totalDays: days, percent: days > 0 ? Math.round((total.hadir / days) * 100) : 0 };
}

function averageScore(scores: SubjectScore[]) {
  return scores.length ? Math.round(scores.reduce((sum, item) => sum + item.rataRata, 0) / scores.length) : 0;
}

function isScoreDetailInSemester(item: StudentScoreDetail, semester: "Ganjil" | "Genap") {
  return normalizeSemester(item.semester) === semester;
}

function averageScoreDetails(details: StudentScoreDetail[]) {
  const values = details
    .map((item) => item.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  return values.length ? Math.round(values.reduce((sum, score) => sum + score, 0) / values.length) : 0;
}

export default function RekapSemesterTab({ db, sessionToken, onSelectStudent }: RekapSemesterTabProps) {
  const [semester, setSemester] = useState<"Ganjil" | "Genap">(() => defaultReportSemester(db));
  const [mode, setMode] = useState<"student" | "class">("student");
  const [classReports, setClassReports] = useState<ClassReportItem[]>([]);
  const [loadingClass, setLoadingClass] = useState(false);
  const academicYear = db.schoolSettings?.academicYear || "2025/2026";
  const reportLogoUrl = db.schoolSettings?.logoUrl || "";
  const semesterMonths = SEMESTER_MONTHS[semester];
  const attendanceData = summarizeAttendance(db.attendance, semester);
  const semesterAttendance = attendanceData.rows;
  const behaviour = db.behaviour.filter((item) => isBehaviourInSemester(item, semester));
  const semesterScoreDetails = (db.scoreDetails || []).filter((item) => isScoreDetailInSemester(item, semester));
  const subjectAverages = useMemo(() => {
    const bySubject = new Map<string, StudentScoreDetail[]>();
    semesterScoreDetails.forEach((item) => bySubject.set(item.subject, [...(bySubject.get(item.subject) || []), item]));
    return Array.from(bySubject.entries()).map(([subject, items]) => {
      const kkm = db.scores.find((score) => score.subject === subject)?.kkm || 70;
      const average = averageScoreDetails(items);
      return { subject, kkm, average, total: items.length, filled: items.filter((item) => item.score !== null && item.score !== undefined).length };
    });
  }, [db.scores, semesterScoreDetails]);
  const studentAverageScore = subjectAverages.length ? Math.round(subjectAverages.reduce((sum, item) => sum + item.average, 0) / subjectAverages.length) : averageScore(db.scores);
  const belowKkm = subjectAverages.length ? subjectAverages.filter((item) => item.average < item.kkm) : db.scores.filter((item) => item.rataRata < item.kkm);
  const attendanceSummary = attendanceData;
  const totalAttendance = attendanceData.totalDays;
  const attendancePercent = attendanceData.percent;

  useEffect(() => {
    setSemester(defaultReportSemester(db));
  }, [db.student.id, db.scoreDetails, db.schoolSettings?.semester]);

  const loadClassReports = async () => {
    setLoadingClass(true);
    try {
      const params = new URLSearchParams();
      if (db.selectedClassName) params.set("className", db.selectedClassName);
      const res = await fetch(`/api/class-semester-report?${params.toString()}`, {
        headers: sessionToken ? { "x-session-token": sessionToken } : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setClassReports(data.reports || []);
    } finally {
      setLoadingClass(false);
    }
  };

  useEffect(() => {
    if (mode === "class") loadClassReports();
  }, [mode, db.selectedClassName]);

  const classSummary = useMemo(() => {
    const rows = classReports.map((item) => {
      const avg = averageScore(item.scores);
      const abs = summarizeAttendance(item.attendance, semester);
      const below = item.scores.filter((score) => score.rataRata < score.kkm).length;
      const notes = item.behaviour.filter((note) => isBehaviourInSemester(note, semester)).length;
      return { ...item, avg, abs, below, notes };
    });
    const classAverage = rows.length ? Math.round(rows.reduce((sum, item) => sum + item.avg, 0) / rows.length) : 0;
    const classAttendance = rows.length ? Math.round(rows.reduce((sum, item) => sum + item.abs.percent, 0) / rows.length) : 0;
    return { rows, classAverage, classAttendance };
  }, [classReports, semester]);

  const conclusion = useMemo(() => {
    if (belowKkm.length > 0 || attendancePercent < 90) {
      return "Perlu pendampingan lanjutan dari wali kelas dan orang tua agar perkembangan akademik dan kehadiran siswa lebih stabil pada semester berikutnya.";
    }
    return "Perkembangan siswa pada semester ini tergolong baik. Pertahankan konsistensi belajar, kehadiran, dan kebiasaan positif yang sudah terbentuk.";
  }, [belowKkm.length, attendancePercent]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="print:hidden bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Rekap Semester</h3>
            <p className="text-xs text-slate-500 mt-1">Ringkasan nilai, absensi, dan catatan perilaku siswa aktif untuk arsip wali kelas.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="inline-flex h-10 bg-slate-50 border border-slate-200 rounded-xl p-1">
              <button type="button" onClick={() => setMode("student")} className={`px-3 rounded-lg text-xs font-black ${mode === "student" ? "bg-slate-900 text-white" : "text-slate-500"}`}>Per Murid</button>
              <button type="button" onClick={() => setMode("class")} className={`px-3 rounded-lg text-xs font-black ${mode === "class" ? "bg-slate-900 text-white" : "text-slate-500"}`}>Satu Kelas</button>
            </div>
            {(db.visibleStudents || []).length > 1 && (
              <select
                value={db.student.id}
                onChange={(e) => onSelectStudent?.(e.target.value)}
                className="h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {(db.visibleStudents || []).map((student) => (
                  <option key={student.id} value={student.id}>{student.name} - {student.className}</option>
                ))}
              </select>
            )}
            <select
              value={semester}
              onChange={(e) => setSemester(e.target.value as "Ganjil" | "Genap")}
              className="h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="Ganjil">Semester Ganjil</option>
              <option value="Genap">Semester Genap</option>
            </select>
            <button onClick={printPdf} className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black hover:bg-emerald-400">
              <Download className="w-4 h-4" />
              Backup PDF
            </button>
          </div>
        </div>
      </div>

      <section className="semester-print-area relative overflow-hidden bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-5">
        {reportLogoUrl && (
          <img
            src={reportLogoUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[56%] z-0 w-[360px] max-w-[70%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.045]"
          />
        )}
        <div className="relative z-10 border-b-4 border-double border-slate-900 pb-4">
          <div className="grid grid-cols-[128px_1fr_128px] gap-4 items-center">
            <div className="flex flex-col items-center">
              {reportLogoUrl ? (
                <img src={reportLogoUrl} alt="Logo sekolah" className="w-28 h-28 object-contain" />
              ) : (
                <div className="w-28 h-28 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-black text-2xl">SK</div>
              )}
            </div>
            <div className="text-center">
              <h1 className="text-xl font-black uppercase text-slate-950 leading-tight">{db.schoolSettings?.name || "SIKOWALI"}</h1>
              <p className="text-[11px] font-semibold text-slate-600">{db.schoolSettings?.status || "-"} {db.schoolSettings?.npsn ? `• NPSN ${db.schoolSettings.npsn}` : ""}</p>
              <p className="text-[11px] font-semibold text-slate-600">{db.schoolSettings?.address || "Alamat sekolah belum diisi"}</p>
              <p className="text-[11px] font-semibold text-slate-600">
                {[db.schoolSettings?.city, db.schoolSettings?.province].filter(Boolean).join(", ") || "-"}
                {" "}• Telp: {db.schoolSettings?.phone || "-"} • Email: {db.schoolSettings?.email || "-"}
              </p>
            </div>
            <div />
          </div>
          <div className="text-center mt-4">
            <h2 className="text-base font-black uppercase tracking-wide text-slate-950">Laporan Rekap Semester {mode === "class" ? "Kelas" : "Siswa"}</h2>
            <p className="text-xs font-bold text-slate-600">Semester {semester} • Tahun Ajaran {academicYear}</p>
          </div>
        </div>

        <div className="relative z-10">
        {mode === "class" ? (
          <ClassReportView
            db={db}
            semester={semester}
            loading={loadingClass}
            onReload={loadClassReports}
            rows={classSummary.rows}
            classAverage={classSummary.classAverage}
            classAttendance={classSummary.classAttendance}
          />
        ) : (
          <>
        <div className="grid md:grid-cols-[1.25fr_1fr] gap-4 pdf-section">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Profil Siswa</p>
            </div>
            <div className="p-4 grid grid-cols-[88px_1fr] gap-x-4 gap-y-2 text-xs">
              <span className="font-black text-slate-500 uppercase tracking-wide">Nama</span>
              <span className="font-black text-slate-950">{db.student.name}</span>
              <span className="font-black text-slate-500 uppercase tracking-wide">Kelas</span>
              <span className="font-bold text-slate-800">{db.student.className}</span>
              <span className="font-black text-slate-500 uppercase tracking-wide">NIS/NISN</span>
              <span className="font-bold text-slate-800">{db.student.nis} / {db.student.nisn || "-"}</span>
              <span className="font-black text-slate-500 uppercase tracking-wide">Periode</span>
              <span className="font-bold text-slate-800">Semester {semester} • {academicYear}</span>
            </div>
          </div>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Capaian Semester</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-slate-200">
              <div className="p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rata-rata Nilai</p>
                <p className="text-2xl font-black text-slate-950 mt-1">{studentAverageScore}</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1">{belowKkm.length ? `${belowKkm.length} mapel perlu pendampingan` : "Semua mapel tuntas"}</p>
              </div>
              <div className="p-4 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kehadiran</p>
                <p className="text-2xl font-black text-emerald-700 mt-1">{attendancePercent}%</p>
                <p className="text-[10px] font-bold text-slate-500 mt-1">{attendanceSummary.hadir}/{totalAttendance || 0} hari hadir</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 pdf-section">
          <h2 className="text-sm font-black text-slate-900">Identitas Siswa</h2>
          <Table>
            <tbody>
              <tr>
                <Td strong>Nama</Td>
                <Td>{db.student.name}</Td>
                <Td strong>NIS / NISN</Td>
                <Td>{db.student.nis} / {db.student.nisn || "-"}</Td>
              </tr>
              <tr>
                <Td strong>Kelas</Td>
                <Td>{db.student.className}</Td>
                <Td strong>Jenis Kelamin</Td>
                <Td>{db.student.gender || "-"}</Td>
              </tr>
              <tr>
                <Td strong>Orang Tua</Td>
                <Td>{db.student.parentName || db.student.fatherName || db.student.motherName || "-"}</Td>
                <Td strong>Alamat</Td>
                <Td>{db.student.address || db.student.parentAddressStreet || "-"}</Td>
              </tr>
              <tr>
                <Td strong>Tempat/Tanggal Lahir</Td>
                <Td>{db.student.birthPlace || "-"} / {db.student.birthDate || "-"}</Td>
                <Td strong>Agama</Td>
                <Td>{db.student.religion || "-"}</Td>
              </tr>
              <tr>
                <Td strong>Sekolah Asal</Td>
                <Td>{db.student.previousSchool || "-"}</Td>
                <Td strong>Wilayah</Td>
                <Td>{[db.student.district, db.student.city, db.student.province].filter(Boolean).join(", ") || "-"}</Td>
              </tr>
              <tr>
                <Td strong>Ayah</Td>
                <Td>{db.student.fatherName || "-"} {db.student.fatherJob ? `(${db.student.fatherJob})` : ""}</Td>
                <Td strong>Ibu</Td>
                <Td>{db.student.motherName || "-"} {db.student.motherJob ? `(${db.student.motherJob})` : ""}</Td>
              </tr>
              <tr>
                <Td strong>Alamat Orang Tua</Td>
                <Td colSpan={3}>{[db.student.parentAddressStreet, db.student.parentAddressVillage].filter(Boolean).join(", ") || "-"}</Td>
              </tr>
            </tbody>
          </Table>
        </div>

        <div className="space-y-3 pdf-section">
          <h2 className="text-sm font-black text-slate-900">Ringkasan Nilai Mata Pelajaran</h2>
          <Table>
            <thead>
              <tr>
                <Th>Mata Pelajaran</Th>
                <Th align="center">KKM</Th>
                <Th align="center">Komponen</Th>
                <Th align="center">Terisi</Th>
                <Th align="center">Rata-rata</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {subjectAverages.length ? subjectAverages.map((item) => (
                <tr key={item.subject}>
                  <Td strong>{item.subject}</Td>
                  <Td align="center">{item.kkm}</Td>
                  <Td align="center">{item.total}</Td>
                  <Td align="center">{item.filled}</Td>
                  <Td align="center" strong>{item.average}</Td>
                  <Td>{item.average < item.kkm ? "Perlu Pendampingan" : "Tuntas"}</Td>
                </tr>
              )) : (
                <tr><Td colSpan={6}>Belum ada data nilai detail pada semester ini.</Td></tr>
              )}
            </tbody>
          </Table>
        </div>

        <div className="space-y-3 pdf-section">
          <h2 className="text-sm font-black text-slate-900">Rekap Absensi Semester</h2>
          <div className="grid grid-cols-5 border border-slate-200 rounded-xl overflow-hidden">
            <AttendanceStat label="Hadir" value={attendanceSummary.hadir} tone="emerald" />
            <AttendanceStat label="Sakit" value={attendanceSummary.sakit} tone="amber" />
            <AttendanceStat label="Izin" value={attendanceSummary.izin} tone="sky" />
            <AttendanceStat label="Alpha" value={attendanceSummary.alpha} tone="rose" />
            <AttendanceStat label="Kehadiran" value={`${attendancePercent}%`} tone="slate" />
          </div>
          <Table>
            <thead>
              <tr>
                <Th>Bulan</Th>
                <Th align="center">Hadir</Th>
                <Th align="center">Sakit</Th>
                <Th align="center">Izin</Th>
                <Th align="center">Alpha</Th>
                <Th align="center">Kehadiran</Th>
              </tr>
            </thead>
            <tbody>
              {semesterAttendance.length ? semesterAttendance.map((item) => (
                <tr key={item.month}>
                  <Td strong>{item.month}</Td>
                  <Td align="center">{item.hadir}</Td>
                  <Td align="center">{item.sakit}</Td>
                  <Td align="center">{item.izin}</Td>
                  <Td align="center">{item.alpha}</Td>
                  <Td align="center" strong>{item.persentase}%</Td>
                </tr>
              )) : (
                <tr><Td colSpan={6}>Belum ada data absensi pada semester ini.</Td></tr>
              )}
            </tbody>
          </Table>
        </div>

        <div className="space-y-3 pdf-section">
          <h2 className="text-sm font-black text-slate-900">Catatan Perilaku & Prestasi</h2>
          <Table>
            <thead>
              <tr>
                <Th>Tanggal</Th>
                <Th>Jenis</Th>
                <Th>Judul</Th>
                <Th>Pelapor</Th>
                <Th>Deskripsi</Th>
              </tr>
            </thead>
            <tbody>
              {behaviour.length ? behaviour.map((item) => (
                <tr key={item.id}>
                  <Td>{item.date}</Td>
                  <Td>{item.type}</Td>
                  <Td strong>{item.title}</Td>
                  <Td>{item.teacher}</Td>
                  <Td>{item.description}</Td>
                </tr>
              )) : (
                <tr><Td colSpan={5}>Belum ada catatan perilaku pada semester ini.</Td></tr>
              )}
            </tbody>
          </Table>
        </div>

        <div className="grid md:grid-cols-2 gap-4 pt-2 break-inside-avoid pdf-signature">
          <div className="border border-slate-200 rounded-xl p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Kesimpulan Wali Kelas</p>
            <p className="text-xs leading-relaxed text-slate-700 mt-2">{conclusion}</p>
          </div>
          <div className="border border-slate-200 rounded-xl p-4 min-h-28">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tanda Tangan</p>
            <div className="mt-10 grid grid-cols-2 gap-4 text-xs text-slate-600">
              <div>
                <p>Wali Kelas,</p>
                <p className="mt-10 font-bold">{db.currentUser?.name || "Guru"}</p>
              </div>
              <div>
                <p>Kepala Sekolah,</p>
                <p className="mt-10 font-bold">{db.schoolSettings?.principalName || "-"}</p>
              </div>
            </div>
          </div>
        </div>
          </>
        )}
        </div>

        <button onClick={printPdf} className="print:hidden fixed bottom-6 right-6 inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-3 rounded-xl text-xs font-black shadow-lg hover:bg-slate-800">
          <Printer className="w-4 h-4" />
          Cetak PDF
        </button>
      </section>
    </div>
  );
}

function ClassReportView({ db, semester, loading, onReload, rows, classAverage, classAttendance }: { db: SIKOWALIDatabase; semester: "Ganjil" | "Genap"; loading: boolean; onReload: () => void; rows: Array<ClassReportItem & { avg: number; abs: ReturnType<typeof summarizeAttendance>; below: number; notes: number }>; classAverage: number; classAttendance: number }) {
  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-4 gap-3">
        <SummaryBox icon={<UsersRound className="w-4 h-4" />} label="Kelas" value={db.selectedClassName || db.student.className} detail={`${rows.length} siswa tercatat`} />
        <SummaryBox icon={<Award className="w-4 h-4" />} label="Rata-rata Kelas" value={`${classAverage}`} detail={`Semester ${semester}`} />
        <SummaryBox icon={<FileText className="w-4 h-4" />} label="Kehadiran Kelas" value={`${classAttendance}%`} detail="Rata-rata presensi siswa" />
        <div className="print:hidden border border-slate-200 rounded-xl p-3 flex items-center justify-center">
          <button onClick={onReload} disabled={loading} className="inline-flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-black disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Muat Data Kelas
          </button>
        </div>
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-black text-slate-900">Rekap Satu Kelas</h2>
        <Table>
          <thead>
            <tr>
              <Th>Nama Siswa</Th>
              <Th>NIS</Th>
              <Th align="center">Rata-rata Nilai</Th>
              <Th align="center">Mapel di Bawah KKM</Th>
              <Th align="center">Hadir</Th>
              <Th align="center">Sakit</Th>
              <Th align="center">Izin</Th>
              <Th align="center">Alpha</Th>
              <Th align="center">Kehadiran</Th>
              <Th align="center">Catatan</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><Td colSpan={10}>Memuat data rekap kelas...</Td></tr>
            ) : rows.length ? rows.map((item) => (
              <tr key={item.student.id}>
                <Td strong>{item.student.name}</Td>
                <Td>{item.student.nis}</Td>
                <Td align="center" strong>{item.avg}</Td>
                <Td align="center">{item.below}</Td>
                <Td align="center">{item.abs.hadir}</Td>
                <Td align="center">{item.abs.sakit}</Td>
                <Td align="center">{item.abs.izin}</Td>
                <Td align="center">{item.abs.alpha}</Td>
                <Td align="center" strong>{item.abs.percent}%</Td>
                <Td align="center">{item.notes}</Td>
              </tr>
            )) : (
              <tr><Td colSpan={10}>Belum ada data siswa untuk kelas ini.</Td></tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}

function SummaryBox({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="border border-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm font-black text-slate-900 mt-2">{value}</p>
      <p className="text-[10px] font-semibold text-slate-500 mt-1">{detail}</p>
    </div>
  );
}

function AttendanceStat({ label, value, tone }: { label: string; value: string | number; tone: "emerald" | "amber" | "sky" | "rose" | "slate" }) {
  const toneClass = {
    emerald: "text-emerald-700 bg-emerald-50",
    amber: "text-amber-700 bg-amber-50",
    sky: "text-sky-700 bg-sky-50",
    rose: "text-rose-700 bg-rose-50",
    slate: "text-slate-800 bg-slate-50",
  }[tone];
  return (
    <div className={`p-2.5 text-center border-r border-slate-200 last:border-r-0 ${toneClass}`}>
      <p className="text-[9px] font-black uppercase tracking-widest opacity-75">{label}</p>
      <p className="text-base font-black mt-1">{value}</p>
    </div>
  );
}

function Table({ children }: { children: React.ReactNode }) {
  return <table className="w-full text-left text-xs border-collapse border border-slate-200">{children}</table>;
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "center" }) {
  return <th className={`border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 ${align === "center" ? "text-center" : "text-left"}`}>{children}</th>;
}

function Td({ children, align = "left", strong = false, colSpan }: { children: React.ReactNode; align?: "left" | "center"; strong?: boolean; colSpan?: number }) {
  return <td colSpan={colSpan} className={`border border-slate-200 px-3 py-2 text-slate-700 ${align === "center" ? "text-center" : "text-left"} ${strong ? "font-bold text-slate-900" : "font-medium"}`}>{children}</td>;
}
