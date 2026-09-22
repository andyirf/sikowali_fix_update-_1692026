import React, { useState } from "react";
import { Search, Info, TrendingUp, AlertTriangle } from "lucide-react";
import { SIKOWALIDatabase, StudentScoreDetail } from "../types";

interface RaporTabProps {
  db: SIKOWALIDatabase;
}

const DETAIL_FILTERS = [
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

function detailAverage(details: StudentScoreDetail[]) {
  const values = details
    .map((detail) => detail.score)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  return values.length ? Math.round(values.reduce((sum, score) => sum + score, 0) / values.length) : 0;
}

function detailKey(detail: StudentScoreDetail) {
  return `${detail.subject}|${detail.academicYear}|${detail.semester}|${detail.assessmentType}|${detail.scopeLabel}|${detail.objectiveLabel}`;
}

function uniqueSubjectSummaries(details: StudentScoreDetail[], fallbackScores: SIKOWALIDatabase["scores"]) {
  if (!details.length) return fallbackScores.map((score) => ({ subject: score.subject, average: score.rataRata, kkm: score.kkm }));
  const bySubject = new Map<string, StudentScoreDetail[]>();
  details.forEach((detail) => {
    bySubject.set(detail.subject, [...(bySubject.get(detail.subject) || []), detail]);
  });
  return Array.from(bySubject.entries()).map(([subject, subjectDetails]) => {
    const fallback = fallbackScores.find((score) => score.subject === subject);
    return { subject, average: detailAverage(subjectDetails), kkm: fallback?.kkm || 70 };
  });
}

export default function RaporTab({ db }: RaporTabProps) {
  const { scores, scoreDetails = [] } = db;
  const [searchTerm, setSearchTerm] = useState("");
  const [detailFilter, setDetailFilter] = useState<(typeof DETAIL_FILTERS)[number]>("Semua");

  const hasDetailScores = scoreDetails.length > 0;
  const filteredDetails = scoreDetails.filter((detail) => {
    const matchesSearch = [detail.subject, detail.assessmentType, detail.scopeLabel, detail.objectiveLabel]
      .join(" ")
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (detailFilter === "Semua") return true;
    if (detailFilter.startsWith("FORMATIF - ")) {
      return detail.assessmentType === "FORMATIF" && detail.scopeLabel === detailFilter.replace("FORMATIF - ", "");
    }
    return detail.assessmentType === detailFilter;
  });
  const filteredScores = scores.filter((s) => s.subject.toLowerCase().includes(searchTerm.toLowerCase()));
  const subjectSummaries = uniqueSubjectSummaries(scoreDetails, scores);

  const testPassCount = subjectSummaries.filter((s) => s.average >= s.kkm).length;
  const maxScore = subjectSummaries.length > 0 ? Math.max(...subjectSummaries.map((s) => s.average)) : 0;
  const needAttentionCount = subjectSummaries.length - testPassCount;
  const averageAll = subjectSummaries.length
    ? (subjectSummaries.reduce((acc, curr) => acc + curr.average, 0) / subjectSummaries.length).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Search and Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Nilai Tertinggi</span>
          <p className="text-2xl font-black text-emerald-500">{maxScore}</p>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Lulus KKM</span>
          <p className="text-2xl font-black text-slate-800">{testPassCount} / {subjectSummaries.length}</p>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Perlu Perbaikan</span>
          <p className="text-2xl font-black text-red-500">{needAttentionCount}</p>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Rata-Rata</span>
          <p className="text-2xl font-black text-emerald-500">{averageAll}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col lg:flex-row gap-3 justify-between lg:items-center">
          <h3 className="text-sm font-bold text-slate-900">Rincian Lengkap Capaian Nilai</h3>
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={detailFilter}
              onChange={(e) => setDetailFilter(e.target.value as (typeof DETAIL_FILTERS)[number])}
              className="bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all px-3 py-1.5 w-full sm:w-64"
            >
              {DETAIL_FILTERS.map((filter) => (
                <option key={filter} value={filter}>{filter === "Semua" ? "Semua Jenis" : filter}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari mata pelajaran..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all w-full sm:w-60"
              />
            </div>
          </div>
        </div>

        {/* Grades detail table */}
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
                <th className="px-4 py-3">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {hasDetailScores ? filteredDetails.map((detail) => {
                const fallback = scores.find((score) => score.subject === detail.subject);
                const isFailed = typeof detail.score === "number" && detail.score < (fallback?.kkm || 70);
                return (
                  <tr key={detailKey(detail)} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{detail.subject}</td>
                    <td className="px-4 py-3 text-slate-500">{detail.academicYear} / {detail.semester}</td>
                    <td className="px-4 py-3 font-semibold text-slate-700">{detail.assessmentType}</td>
                    <td className="px-4 py-3 text-slate-600">{detail.scopeLabel}</td>
                    <td className="px-4 py-3 text-slate-600">{detail.objectiveLabel}</td>
                    <td className="px-4 py-3 text-center font-bold text-slate-900">
                      {detail.score ?? "-"}
                      {typeof detail.score === "number" && (
                        <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${isFailed ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
                          {isFailed ? "Perlu Perbaikan" : "Lolos"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{detail.note || "-"}</td>
                  </tr>
                );
              }) : filteredScores.map((score) => {
                const isFailed = score.rataRata < score.kkm;
                return (
                  <tr key={score.subject} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-800">{score.subject}</td>
                    <td className="px-4 py-3 text-center font-medium bg-slate-50/20">{score.kkm}</td>
                    <td className="px-4 py-3 text-center">{score.tugas}</td>
                    <td className="px-4 py-3 text-center">{score.uh1}</td>
                    <td className="px-4 py-3 text-center">{score.uh2}</td>
                    <td className="px-4 py-3 text-center">{score.uts}</td>
                    <td className="px-4 py-3 text-center">{score.uas}</td>
                    <td className="px-4 py-3 text-center font-bold bg-slate-50/10 text-slate-900">{score.rataRata}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isFailed 
                          ? "bg-red-50 text-red-600 border border-red-200/50" 
                          : "bg-emerald-50 text-emerald-600 border border-emerald-200/50"
                      }`}>
                        {isFailed ? "Perlu Perbaikan" : "Lolos"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {(hasDetailScores ? filteredDetails.length : filteredScores.length) === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                    Tidak menemukan mata pelajaran matching.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Important Info Card at bottom */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex gap-3.5 items-start mt-2">
          <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Tampilan nilai utama bersumber dari <strong>student_score_details</strong>, sehingga formatif, sumatif lingkup materi, dan sumatif akhir semester dapat dilihat per komponen. Ringkasan mata pelajaran dihitung dari nilai detail yang sudah terisi.
          </p>
        </div>
      </div>
    </div>
  );
}
