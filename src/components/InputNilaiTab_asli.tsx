import React, { useEffect, useMemo, useRef, useState } from "react";
import { SIKOWALIDatabase, StudentScoreDetail } from "../types";
import { BookOpen, CheckCircle, FileSpreadsheet, Search } from "lucide-react";

interface InputNilaiTabProps {
  db: SIKOWALIDatabase;
  sessionToken?: string;
  onSelectStudent?: (studentId: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
}

const DEFAULT_SUBJECT = "Matematika";
const DEFAULT_YEAR = "2025-2026";
const DEFAULT_SEMESTER = "1-2";
const DEFAULT_SUBJECTS = [
  "Pendidikan Agama",
  "Pendidikan Pancasila",
  "Bahasa Indonesia",
  "Matematika",
  "IPAS",
  "PJOK",
  "Seni Budaya",
  "Bahasa Inggris",
  "Bahasa Jawa",
  "Mulok",
];
const ASSESSMENT_FILTERS = [
  "Semua",
  "FORMATIF",
  "FORMATIF - Lingkup Materi 1",
  "FORMATIF - Lingkup Materi 2",
  "FORMATIF - Lingkup Materi 3",
  "FORMATIF - Lingkup Materi 4",
  "FORMATIF - Lingkup Materi 5",
  "SUMATIF LINGKUP MATERI",
  "SUMATIF AKHIR SEMESTER",
] as const;

const SUMMARY_FILTERS = ASSESSMENT_FILTERS;

function buildDefaultDetails(subject: string, academicYear: string, semester: string): StudentScoreDetail[] {
  const details: StudentScoreDetail[] = [];
  for (let lm = 1; lm <= 5; lm += 1) {
    for (let tp = 1; tp <= 4; tp += 1) {
      details.push({
        subject,
        academicYear,
        semester,
        assessmentType: "FORMATIF",
        scopeLabel: `Lingkup Materi ${lm}`,
        objectiveLabel: `TP${tp}`,
        score: null,
      });
    }
  }
  for (let lm = 1; lm <= 5; lm += 1) {
    details.push({
      subject,
      academicYear,
      semester,
      assessmentType: "SUMATIF LINGKUP MATERI",
      scopeLabel: "SUMATIF LINGKUP MATERI",
      objectiveLabel: `LM${lm}`,
      score: null,
    });
  }
  details.push({
    subject,
    academicYear,
    semester,
    assessmentType: "SUMATIF AKHIR SEMESTER",
    scopeLabel: "SUMATIF AKHIR SEMESTER",
    objectiveLabel: "SUMATIF AKHIR SEMESTER",
    score: null,
  });
  return details;
}

function detailKey(detail: StudentScoreDetail) {
  return `${detail.subject}|${detail.academicYear}|${detail.semester}|${detail.assessmentType}|${detail.scopeLabel}|${detail.objectiveLabel}`;
}

function mergeWithTemplate(existing: StudentScoreDetail[], subject: string, academicYear: string, semester: string) {
  const template = buildDefaultDetails(subject, academicYear, semester);
  const existingMap = new Map(
    existing
      .filter((detail) => detail.subject === subject && detail.academicYear === academicYear && detail.semester === semester)
      .map((detail) => [detailKey(detail), detail])
  );
  return template.map((detail) => ({ ...detail, ...existingMap.get(detailKey(detail)) }));
}

function pickDetailMeta(db: SIKOWALIDatabase, preferredSubject?: string, fallbackMeta?: { academicYear?: string; semester?: string }) {
  const existingDetails = db.scoreDetails || [];
  const preferredDetail = existingDetails.find((detail) => detail.subject === preferredSubject);
  const defaultSubjectDetail = existingDetails.find((detail) => detail.subject === DEFAULT_SUBJECT);
  const firstDetail = preferredDetail || (preferredSubject ? undefined : defaultSubjectDetail || existingDetails[0]);
  return {
    subject: preferredSubject || firstDetail?.subject || DEFAULT_SUBJECT,
    academicYear: firstDetail?.academicYear || fallbackMeta?.academicYear || db.schoolSettings?.academicYear || DEFAULT_YEAR,
    semester: firstDetail?.semester || fallbackMeta?.semester || db.schoolSettings?.semester || DEFAULT_SEMESTER,
  };
}

function averageOf(details: StudentScoreDetail[]) {
  const values = details
    .map((detail) => detail.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  return values.length ? Math.round(values.reduce((sum, score) => sum + score, 0) / values.length) : null;
}

export default function InputNilaiTab({ db, sessionToken, onSelectStudent, onRefresh }: InputNilaiTabProps) {
  const [savingDetails, setSavingDetails] = useState(false);
  const [success, setSuccess] = useState("");
  const [detailMeta, setDetailMeta] = useState(() => pickDetailMeta(db));
  const [assessmentFilter, setAssessmentFilter] = useState<(typeof ASSESSMENT_FILTERS)[number]>("Semua");
  const [summaryFilter, setSummaryFilter] = useState<(typeof SUMMARY_FILTERS)[number]>("Semua");
  const [summarySearch, setSummarySearch] = useState("");
  const [localDetails, setLocalDetails] = useState<StudentScoreDetail[]>([]);
  const previousStudentId = useRef(db.student.id);

  const filledCount = useMemo(
    () => localDetails.filter((detail) => detail.score !== null && detail.score !== undefined).length,
    [localDetails]
  );
  const subjectOptions = useMemo(() => {
    const subjects = new Set<string>();
    DEFAULT_SUBJECTS.forEach((subject) => subjects.add(subject));
    (db.scoreDetails || []).forEach((detail) => subjects.add(detail.subject));
    return Array.from(subjects).sort((a, b) => a.localeCompare(b));
  }, [db.scoreDetails]);
  const visibleDetails = useMemo(
    () => localDetails
      .map((detail, index) => ({ detail, index }))
      .filter(({ detail }) => {
        if (assessmentFilter === "Semua") return true;
        if (assessmentFilter.startsWith("FORMATIF - ")) {
          return detail.assessmentType === "FORMATIF" && detail.scopeLabel === assessmentFilter.replace("FORMATIF - ", "");
        }
        return detail.assessmentType === assessmentFilter;
      }),
    [assessmentFilter, localDetails]
  );
  const subjectSummaries = useMemo(() => {
    const grouped = new Map<string, StudentScoreDetail[]>();
    (db.scoreDetails || []).forEach((detail) => grouped.set(detail.subject, [...(grouped.get(detail.subject) || []), detail]));
    return Array.from(grouped.entries()).map(([subject, details]) => {
      const filteredDetails = details.filter((detail) => {
        if (summaryFilter === "Semua") return true;
        if (summaryFilter.startsWith("FORMATIF - ")) {
          return detail.assessmentType === "FORMATIF" && detail.scopeLabel === summaryFilter.replace("FORMATIF - ", "");
        }
        return detail.assessmentType === summaryFilter;
      });
      const subjectScore = db.scores.find((score) => score.subject === subject);
      const formative = averageOf(details.filter((detail) => detail.assessmentType === "FORMATIF"));
      const sumatifLingkup = averageOf(details.filter((detail) => detail.assessmentType === "SUMATIF LINGKUP MATERI"));
      const sumatifAkhir = averageOf(details.filter((detail) => detail.assessmentType === "SUMATIF AKHIR SEMESTER"));
      const selectedAverage = averageOf(filteredDetails);
      const average = averageOf(details);
      const filled = filteredDetails.filter((detail) => detail.score !== null && detail.score !== undefined).length;
      return {
        subject,
        kkm: subjectScore?.kkm || 70,
        total: filteredDetails.length,
        filled,
        formative,
        sumatifLingkup,
        sumatifAkhir,
        selectedAverage,
        average,
      };
    }).filter((item) => item.subject.toLowerCase().includes(summarySearch.toLowerCase().trim())).sort((a, b) => a.subject.localeCompare(b.subject));
  }, [db.scoreDetails, db.scores, summaryFilter, summarySearch]);
  const activeSubjectKkm = db.scores.find((score) => score.subject === detailMeta.subject)?.kkm || 70;

  const loadSubjectDetails = (subject: string, sourceDetails = db.scoreDetails || []) => {
    const nextMeta = pickDetailMeta({ ...db, scoreDetails: sourceDetails }, subject, detailMeta);
    setDetailMeta(nextMeta);
    setLocalDetails(mergeWithTemplate(sourceDetails, nextMeta.subject, nextMeta.academicYear, nextMeta.semester));
  };

  useEffect(() => {
    const isNewStudent = previousStudentId.current !== db.student.id;
    const nextMeta = pickDetailMeta(db, isNewStudent ? undefined : detailMeta.subject);
    previousStudentId.current = db.student.id;
    setDetailMeta(nextMeta);
    setLocalDetails(mergeWithTemplate(db.scoreDetails || [], nextMeta.subject, nextMeta.academicYear, nextMeta.semester));
  }, [db.student.id, db.scoreDetails, db.schoolSettings]);

  useEffect(() => {
    setLocalDetails(mergeWithTemplate(db.scoreDetails || [], detailMeta.subject, detailMeta.academicYear, detailMeta.semester));
  }, [detailMeta.subject, detailMeta.academicYear, detailMeta.semester]);

  const handleDetailChange = (index: number, field: "score" | "note", rawValue: string) => {
    setLocalDetails((prev) => prev.map((detail, idx) => {
      if (idx !== index) return detail;
      if (field === "note") return { ...detail, note: rawValue };
      const score = rawValue === "" ? null : Math.max(0, Math.min(100, Number(rawValue)));
      return { ...detail, score };
    }));
  };

  const handleSaveDetails = async () => {
    setSavingDetails(true);
    setSuccess("");
    try {
      const res = await fetch("/api/score-details", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(sessionToken ? { "x-session-token": sessionToken } : {}) },
        body: JSON.stringify({ studentId: db.student.id, details: localDetails }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Gagal menyimpan detail nilai.");
      const data = await res.json();
      loadSubjectDetails(detailMeta.subject, data.scoreDetails || localDetails);
      await onRefresh?.();
      setSuccess("Detail nilai formatif dan sumatif berhasil disimpan.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingDetails(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in select-none">
      <div className="flex flex-col sm:flex-row gap-4 justify-between sm:items-center bg-white border border-slate-100 p-4 rounded-xl shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Input Nilai & Evaluasi</h3>
          <p className="text-xs text-slate-500">Tampilan dan penyimpanan nilai memakai data student_score_details.</p>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3 rounded-xl flex items-center gap-2.5 animate-slide-up">
          <CheckCircle className="w-5 h-5 text-emerald-500" />
          <p className="font-bold">{success}</p>
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
          <div className="flex flex-wrap gap-2 w-full">
            <span className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
              Kelas: {db.student.className}
            </span>
            {(db.visibleStudents || []).length > 1 ? (
              <select
                value={db.student.id}
                onChange={(e) => onSelectStudent?.(e.target.value)}
                className="text-xs font-semibold text-slate-600 bg-slate-50 border px-3 py-1.5 rounded-xl"
              >
                {(db.visibleStudents || []).map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
              </select>
            ) : (
              <span className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">
                Siswa: {db.student.name}
              </span>
            )}
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Data Nilai Aktif</p>
                <h4 className="mt-1 text-base font-black text-slate-950">{db.student.name}</h4>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold text-slate-600 md:flex md:items-center md:gap-3">
                <span className="rounded-lg border border-emerald-100 bg-white/70 px-3 py-1.5">NIS: {db.student.nis || "-"}</span>
                <span className="rounded-lg border border-emerald-100 bg-white/70 px-3 py-1.5">Kelas: {db.student.className}</span>
                <span className="rounded-lg border border-emerald-100 bg-white/70 px-3 py-1.5">{subjectSummaries.length} mapel</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h4 className="text-sm font-black text-slate-900">Mata Pelajaran Milik Siswa Ini</h4>
                <p className="mt-1 text-[10px] font-bold text-slate-400">{subjectSummaries.length} mapel sesuai data {db.student.name}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={summaryFilter}
                  onChange={(e) => setSummaryFilter(e.target.value as (typeof SUMMARY_FILTERS)[number])}
                  className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:w-64"
                >
                  {SUMMARY_FILTERS.map((filter) => <option key={filter} value={filter}>{filter === "Semua" ? "Semua Jenis" : filter}</option>)}
                </select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={summarySearch}
                    onChange={(e) => setSummarySearch(e.target.value)}
                    placeholder="Cari mata pelajaran..."
                    className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 sm:w-64"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs text-slate-700">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Mata Pelajaran</th>
                    <th className="px-4 py-3 text-center">KKM</th>
                    <th className="px-4 py-3 text-center">Formatif</th>
                    <th className="px-4 py-3 text-center">Sumatif LM</th>
                    <th className="px-4 py-3 text-center">Sumatif Akhir</th>
                    <th className="px-4 py-3 text-center">Rata Filter</th>
                    <th className="px-4 py-3 text-center">Nilai</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {subjectSummaries.length ? subjectSummaries.map((item) => {
                    const finalScore = item.average ?? 0;
                    const passed = item.average !== null && finalScore >= item.kkm;
                    return (
                      <tr
                        key={item.subject}
                        onClick={() => loadSubjectDetails(item.subject)}
                        className={`cursor-pointer transition-colors hover:bg-slate-50/70 ${detailMeta.subject === item.subject ? "bg-emerald-50/50" : "bg-white"}`}
                      >
                        <td className="px-4 py-3 font-black text-slate-900">{item.subject}</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-900">{item.kkm}</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-900">{item.formative ?? "-"}</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-900">{item.sumatifLingkup ?? "-"}</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-900">{item.sumatifAkhir ?? "-"}</td>
                        <td className="px-4 py-3 text-center font-bold text-blue-900">{item.selectedAverage ?? "-"}</td>
                        <td className="px-4 py-3 text-center font-black text-slate-950">{item.average ?? "-"}</td>
                        <td className="px-4 py-3 text-center">
                          {item.average === null ? (
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black text-slate-500">Kosong</span>
                          ) : (
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black ${passed ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-600 ring-1 ring-red-200"}`}>
                              {passed ? "Lolos" : "Perlu Perbaikan"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-xs font-bold text-slate-400">
                        Belum ada data mata pelajaran tersimpan untuk {db.student.name}. Pilih mapel lalu isi detail nilai.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <h4 className="text-sm font-black text-slate-900">Detail Nilai Kurikulum Merdeka</h4>
            </div>
            <p className="text-xs text-slate-500">Terisi {filledCount} dari {localDetails.length} komponen nilai.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
            <select
              value={detailMeta.subject}
              onChange={(e) => loadSubjectDetails(e.target.value || DEFAULT_SUBJECT)}
              className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
            </select>
            <select
              value={assessmentFilter}
              onChange={(e) => setAssessmentFilter(e.target.value as (typeof ASSESSMENT_FILTERS)[number])}
              className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {ASSESSMENT_FILTERS.map((filter) => <option key={filter} value={filter}>{filter === "Semua" ? "Semua Jenis" : filter}</option>)}
            </select>
            <div
              className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl"
            >
              {detailMeta.academicYear}
            </div>
            <div
              className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl"
            >
              {detailMeta.semester}
            </div>
            <button
              onClick={handleSaveDetails}
              disabled={savingDetails}
              className="flex items-center justify-center gap-1.5 bg-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-50 transition-all text-xs px-4 py-2 rounded-xl h-10 cursor-pointer"
            >
              <BookOpen className="w-4 h-4" />
              {savingDetails ? "Menyimpan..." : "Simpan Detail"}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
          <span className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">Tahun ajaran mengikuti student_score_details</span>
          <span className="bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl">Semester mengikuti student_score_details</span>
          <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl">Tampilan mengikuti Rincian Lengkap Capaian Nilai portal orang tua</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs text-slate-700 border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                <th className="px-4 py-3">Mata Pelajaran</th>
                <th className="px-4 py-3">Tahun/Semester</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Lingkup</th>
                <th className="px-4 py-3">TP/LM</th>
                <th className="px-4 py-3 text-center">Nilai</th>
                <th className="px-4 py-3 min-w-52">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleDetails.map(({ detail, index }) => {
                const isFailed = typeof detail.score === "number" && detail.score < activeSubjectKkm;
                return (
                  <tr key={detailKey(detail)} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{detail.subject}</td>
                    <td className="px-4 py-3 text-slate-500">{detail.academicYear} / {detail.semester}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{detail.assessmentType}</td>
                    <td className="px-4 py-3 text-slate-600">{detail.scopeLabel}</td>
                    <td className="px-4 py-3 text-slate-600">{detail.objectiveLabel}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={detail.score ?? ""}
                          onChange={(e) => handleDetailChange(index, "score", e.target.value)}
                          className="w-20 bg-slate-50 focus:bg-white border focus:ring-1 focus:ring-emerald-500 px-2 py-1.5 rounded-lg text-xs font-semibold text-center focus:outline-none"
                        />
                        {typeof detail.score === "number" && (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isFailed ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                            {isFailed ? "Perlu Perbaikan" : "Lolos"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={detail.note || ""}
                        onChange={(e) => handleDetailChange(index, "note", e.target.value)}
                        className="w-full min-w-48 bg-slate-50 focus:bg-white border focus:ring-1 focus:ring-emerald-500 px-3 py-1.5 rounded-lg text-xs font-semibold focus:outline-none"
                        placeholder="Opsional"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
