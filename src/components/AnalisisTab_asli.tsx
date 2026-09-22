import React, { useState, useEffect } from "react";
import { Sparkles, RefreshCw, CheckCircle2, TrendingUp, AlertTriangle, BookOpen, Clock, Activity, Download } from "lucide-react";

interface AnalisisTabProps {
  db: any;
  sessionToken: string;
}

export default function AnalisisTab({ db, sessionToken }: AnalisisTabProps) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAIReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ studentId: db.student?.id, scores: db.scores, attendance: db.attendance, behaviour: db.behaviour })
      });
      if (!res.ok) {
        throw new Error("Gagal memperoleh respons dari server.");
      }
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      console.error(err);
      setError("Koneksi AI terputus atau kunci API tidak terpasang. Menyiapkan visualizer fallback.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Auto load report on tab activation
    fetchAIReport();
  }, []);

  const backupPdf = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header bar actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-white border border-slate-100 p-4 rounded-xl shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
            <Sparkles className="w-4.5 h-4.5 text-emerald-500 animate-pulse" />
            Riset & Prediksi Akademik SIKOWALI AI
          </h3>
          <p className="text-xs text-slate-500">Menganalisis perkembangan belajar mingguan, grafik ujian, absensi, dan memprediksi rekomendasi rumah.</p>
        </div>
        <button
          onClick={fetchAIReport}
          disabled={loading}
          className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-100 font-bold transition-all text-xs px-3.5 py-2 rounded-xl h-9 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Menganalisis..." : "Perbarui Analisis"}
        </button>
      </div>

      {/* Loading state visualizer */}
      {loading && (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 shadow-sm text-center flex flex-col items-center justify-center space-y-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            <Sparkles className="w-5 h-5 text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <div className="space-y-1.5 max-w-sm">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-widest animate-pulse">SIKOWALI AI SEDANG MEMPROSES</h4>
            <p className="text-xs text-slate-400">
              Mengumpulkan riwayat nilai, mengidentifikasi tren per mata pelajaran, dan memformulasi target bimbingan belajar khusus...
            </p>
          </div>
        </div>
      )}

      {/* Error notify fallback message */}
      {error && !loading && (
        <div className="bg-amber-50 border border-amber-200/50 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-700">
          <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
          <div>
            <p className="font-bold">Informasi Konektivitas</p>
            <p className="mt-0.5 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* Report results container */}
      {report && !loading && (
        <div className="space-y-6 animate-fade-in">
          {/* Executive Overview Card */}
          <div className="ai-print-area bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-3 relative overflow-hidden">
            <div className="hidden print:block border-b border-slate-200 pb-4 mb-4">
              <h1 className="text-lg font-black text-slate-900">Backup Analisis AI - {db.student?.name}</h1>
              <p className="text-xs font-semibold text-slate-500">{db.schoolSettings?.name || "SIKOWALI"} • {db.schoolSettings?.academicYear || "-"}</p>
            </div>
            <div className="absolute right-0 top-0 translate-x-16 -translate-y-16 w-36 h-36 bg-emerald-500/5 rounded-full blur-xl" />
            <h4 className="text-[10px] font-bold text-emerald-600 tracking-wider uppercase">Ringkasan Diagnostic</h4>
            <p className="text-xs text-slate-700 leading-relaxed font-medium">
              {report.ringkasan}
            </p>
          </div>

          {/* Subjects diagnosis Cards list */}
          <div className="ai-print-area grid grid-cols-1 md:grid-cols-3 gap-6">
            {report.perMataPelajaran?.map((subj: any, idx: number) => {
              const isLow = subj.status === "Butuh Bantuan";
              const isHigh = subj.status === "Meningkat";
              
              let badgeColor = "bg-slate-50 text-slate-600 border-slate-200";
              let dotColor = "bg-slate-400";
              if (isLow) {
                badgeColor = "bg-red-50 text-red-600 border-red-200/50";
                dotColor = "bg-red-500";
              } else if (isHigh) {
                badgeColor = "bg-emerald-50 text-emerald-600 border-emerald-200/50";
                dotColor = "bg-emerald-500";
              }

              return (
                <div key={idx} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-800">{subj.subject}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border flex items-center gap-1.5 ${badgeColor}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                        {subj.status}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[11px] text-slate-500 leading-normal font-medium">{subj.analisis}</p>
                      <div className="border-t border-slate-50 pt-2.5">
                        <span className="text-[9px] text-slate-400 font-bold uppercase block mb-1">REKOMENDASI AI</span>
                        <p className="text-[11px] text-slate-600 leading-relaxed">{subj.rekomendasi}</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dynamic home learning activities list */}
          <div className="ai-print-area bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-5">
            <h3 className="text-xs font-bold text-slate-400 tracking-widest uppercase">SARAN AKTIVITAS DI RUMAH</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {report.saranAktivitas?.map((act: any, idx: number) => {
                const colors = [
                  "bg-emerald-50 text-emerald-600 border-emerald-100",
                  "bg-orange-50 text-orange-600 border-orange-100",
                  "bg-blue-50 text-blue-600 border-blue-100"
                ];
                const activeColor = colors[idx % colors.length];

                return (
                  <div key={idx} className="border border-slate-100 hover:border-slate-200 bg-slate-50/20 p-4 rounded-xl space-y-2 transition-all">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border inline-block ${activeColor}`}>
                      {act.judul}
                    </span>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium">
                      {act.saran}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conclusion supportive message */}
          <div className="ai-print-area bg-slate-900 text-white rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-800">
            <div className="space-y-1">
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Kesimpulan SIKOWALI AI</span>
              <p className="text-xs text-slate-200 leading-relaxed">
                {report.kesimpulan}
              </p>
            </div>
            <button onClick={backupPdf} className="print:hidden w-full sm:w-auto text-xs font-bold bg-white text-slate-950 hover:bg-slate-150 transition-all px-4 py-2 rounded-xl flex items-center justify-center gap-2 cursor-pointer h-9 shrink-0">
              <Download className="w-4 h-4" />
              Simpan PDF Laporan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
