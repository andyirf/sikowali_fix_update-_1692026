import React, { useEffect, useMemo, useState } from "react";
import { BarChart3, Bell, BookOpen, CalendarCheck, ChevronLeft, ChevronRight, FileText, MessageCircle, MessageSquare, Send, Sparkles, X } from "lucide-react";
import { Role } from "../types";

interface OnboardingGuideProps {
  role: Role;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

interface GuideStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  tab?: string;
  actionLabel?: string;
  roles?: Role[];
}

const steps: GuideStep[] = [
  {
    title: "Mulai dari Beranda",
    description: "Lihat ringkasan kondisi anak, pengumuman penting, dan pintasan menuju informasi yang paling sering dibuka.",
    icon: <Sparkles className="w-5 h-5" />,
    tab: "beranda",
    actionLabel: "Buka Beranda",
  },
  {
    title: "Pantau Nilai Anak",
    description: "Cek nilai per mata pelajaran, status KKM, catatan guru, dan waktu pembaruan data terakhir.",
    icon: <FileText className="w-5 h-5" />,
    tab: "rapor",
    actionLabel: "Lihat Nilai",
  },
  {
    title: "Cek Kehadiran",
    description: "Pantau hadir, sakit, izin, alpha, persentase kehadiran, serta riwayat harian bila tersedia.",
    icon: <CalendarCheck className="w-5 h-5" />,
    tab: "absensi",
    actionLabel: "Lihat Kehadiran",
  },
  {
    title: "Baca Catatan Guru",
    description: "Ikuti catatan perilaku, kedisiplinan, prestasi, dan perhatian khusus yang dicatat pihak sekolah.",
    icon: <MessageSquare className="w-5 h-5" />,
    tab: "catatan",
    actionLabel: "Buka Catatan",
    roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah"],
  },
  {
    title: "Gunakan Analisis Perkembangan",
    description: "Dapatkan ringkasan bantuan AI berdasarkan nilai, kehadiran, dan catatan untuk mendukung pendampingan di rumah.",
    icon: <BarChart3 className="w-5 h-5" />,
    tab: "analisisAI",
    actionLabel: "Buka Analisis",
    roles: ["orangtua", "WaliKelas", "Guru", "kepalasekolah"],
  },
  {
    title: "Tanya SIKOWALI",
    description: "Ajukan pertanyaan seputar nilai, kehadiran, pengumuman, atau perkembangan anak dengan bahasa sehari-hari.",
    icon: <MessageCircle className="w-5 h-5" />,
    tab: "chatbot",
    actionLabel: "Mulai Bertanya",
  },
  {
    title: "Kirim Masukan",
    description: "Sampaikan apresiasi, saran, atau keluhan secara langsung lewat halaman Masukan Wali Murid.",
    icon: <Send className="w-5 h-5" />,
    tab: "wall",
    actionLabel: "Kirim Masukan",
    roles: ["orangtua", "WaliKelas", "Guru", "Admin", "Administrator"],
  },
  {
    title: "Baca Pengumuman dan Tips",
    description: "Ikuti pengumuman sekolah, notifikasi, serta tips orang tua untuk mendukung proses belajar anak.",
    icon: <BookOpen className="w-5 h-5" />,
    tab: "pengumuman",
    actionLabel: "Lihat Pengumuman",
  },
];

export default function OnboardingGuide({ role, isOpen, onClose, onNavigate }: OnboardingGuideProps) {
  const visibleSteps = useMemo(() => steps.filter((step) => !step.roles || step.roles.includes(role)), [role]);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStep = visibleSteps[Math.min(activeIndex, visibleSteps.length - 1)];
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === visibleSteps.length - 1;

  useEffect(() => {
    if (isOpen) setActiveIndex(0);
  }, [isOpen]);

  if (!isOpen || !activeStep) return null;

  const goToStep = (nextIndex: number) => {
    setActiveIndex(Math.min(Math.max(nextIndex, 0), visibleSteps.length - 1));
  };

  const handleNavigate = () => {
    if (activeStep.tab) onNavigate(activeStep.tab);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="w-full max-w-2xl bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden animate-fade-in">
        <div className="bg-[#125B3d] text-white p-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-yellow-300">Panduan Pengguna Baru</p>
            <h2 id="onboarding-title" className="text-lg font-black mt-1">Kenali fitur utama SIKOWALI</h2>
            <p className="text-xs text-emerald-50/85 mt-1">Tutorial singkat ini membantu Anda menemukan informasi penting dengan cepat.</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/15 text-white" aria-label="Tutup panduan">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="grid sm:grid-cols-[72px_1fr] gap-4 items-start">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center justify-center">
              {activeStep.icon}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Langkah {activeIndex + 1} dari {visibleSteps.length}</p>
              <h3 className="text-base font-black text-slate-900 mt-1">{activeStep.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed mt-2 font-medium">{activeStep.description}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {visibleSteps.map((step, index) => (
              <button
                key={step.title}
                type="button"
                onClick={() => goToStep(index)}
                className={`h-2 rounded-full transition-all ${index === activeIndex ? "bg-emerald-500" : "bg-slate-200 hover:bg-slate-300"}`}
                aria-label={`Buka langkah ${index + 1}: ${step.title}`}
              />
            ))}
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <Bell className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                Panduan ini hanya muncul otomatis sekali untuk akun baru. Anda tetap bisa membukanya lagi lewat tombol Panduan di bagian atas aplikasi.
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="text-xs font-bold text-slate-500 hover:text-slate-800 px-3 py-2 rounded-xl hover:bg-slate-50">
            Lewati
          </button>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => goToStep(activeIndex - 1)}
              disabled={isFirst}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" />
              Kembali
            </button>
            {activeStep.tab && (
              <button type="button" onClick={handleNavigate} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-slate-800">
                {activeStep.actionLabel || "Buka Fitur"}
              </button>
            )}
            <button
              type="button"
              onClick={() => isLast ? onClose() : goToStep(activeIndex + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black hover:bg-emerald-400"
            >
              {isLast ? "Selesai" : "Lanjut"}
              {!isLast && <ChevronRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
