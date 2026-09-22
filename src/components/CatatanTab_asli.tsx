import React, { useState } from "react";
import { DisciplineType, Role, SIKOWALIDatabase } from "../types";
import { AlertCircle, Award, Calendar, CheckCircle, HelpCircle, Save, ShieldCheck, Sparkles, ThumbsUp, UserRound } from "lucide-react";

interface CatatanTabProps {
  db: SIKOWALIDatabase;
  role: Role;
  onAddBehaviour: (payload: { type: DisciplineType; title: string; description: string }) => Promise<void>;
}

const emptyForm = {
  type: "Positif" as DisciplineType,
  title: "",
  description: "",
};

export default function CatatanTab({ db, role, onAddBehaviour }: CatatanTabProps) {
  const { behaviour } = db;
  const canAddBehaviour = role === "WaliKelas" || role === "Guru" || role === "kepalasekolah";
  const sourcePortal = role === "WaliKelas" ? "Portal Wali Kelas" : role === "kepalasekolah" ? "Portal Kepala Sekolah" : "Portal Guru";
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const countPositif = behaviour.filter((b) => b.type === "Positif").length;
  const countPrestasi = behaviour.filter((b) => b.type === "Prestasi").length;
  const countPerhatian = behaviour.filter((b) => b.type === "Perlu Perhatian").length;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      await onAddBehaviour(form);
      setForm(emptyForm);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <ThumbsUp className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Catatan Positif</span>
            <p className="text-xl font-bold text-slate-800">{countPositif} Catatan</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-yellow-50 text-yellow-600 rounded-xl">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Prestasi Siswa</span>
            <p className="text-xl font-bold text-slate-800">{countPrestasi} Medali</p>
          </div>
        </div>

        <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex items-center gap-4">
          <div className="p-3.5 bg-red-50 text-red-600 rounded-xl">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase block">Perlu Perhatian</span>
            <p className="text-xl font-bold text-slate-800">{countPerhatian} Perhatian</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Sumber Catatan Perilaku</h3>
            <p className="text-xs text-slate-500 mt-1">Setiap catatan menyimpan nama pelapor dan portal asal input data.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-xl px-3 py-1.5 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              Portal Wali Kelas dan Guru dapat input
            </span>
            <span className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 border border-sky-100 rounded-xl px-3 py-1.5 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              Portal Kepala Sekolah dapat input
            </span>
          </div>
        </div>
      </div>

      {canAddBehaviour && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Tambah Catatan Perilaku</h3>
              <p className="text-xs text-slate-500 mt-1">Catatan akan masuk sebagai input dari {sourcePortal}.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-600">
              <UserRound className="w-3.5 h-3.5 text-emerald-500" />
              Pelapor: {db.currentUser?.name || db.currentUser?.username || "-"}
            </span>
          </div>
          {success && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3 rounded-xl flex items-center gap-2.5">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <p className="font-bold">Catatan perilaku berhasil disimpan.</p>
            </div>
          )}
          <div className="grid md:grid-cols-[220px_1fr] gap-3">
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Jenis Catatan</span>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DisciplineType })} className="input-field">
                <option value="Positif">Positif</option>
                <option value="Prestasi">Prestasi</option>
                <option value="Perlu Perhatian">Perlu Perhatian</option>
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Judul Catatan</span>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Contoh: Membantu teman saat diskusi" className="input-field" />
            </label>
          </div>
          <label className="block space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Deskripsi</span>
            <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Tuliskan catatan perilaku atau kedisiplinan siswa." className="input-field min-h-28" />
          </label>
          <div className="flex justify-end">
            <button disabled={saving} className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 px-4 py-2 rounded-xl text-xs font-black">
              <Save className="w-4 h-4" />
              {saving ? "Menyimpan..." : "Simpan Catatan"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-6">
        <h3 className="text-sm font-bold text-slate-900">Riwayat Catatan Perilaku & Kedisiplinan</h3>

        <div className="relative border-l border-slate-100 pl-6 ml-4 space-y-6">
          {behaviour.map((item) => {
            const isPositif = item.type === "Positif";
            const isPrestasi = item.type === "Prestasi";
            let iconElement = <AlertCircle className="w-4 h-4 text-red-600" />;
            let pillColor = "bg-red-50 text-red-600 border-red-200/50";
            let dotColor = "bg-red-500 ring-red-100";
            if (isPositif) {
              iconElement = <ThumbsUp className="w-4 h-4 text-emerald-600" />;
              pillColor = "bg-emerald-50 text-emerald-600 border-emerald-200/50";
              dotColor = "bg-emerald-500 ring-emerald-100";
            } else if (isPrestasi) {
              iconElement = <Award className="w-4 h-4 text-yellow-600" />;
              pillColor = "bg-yellow-50 text-yellow-600 border-yellow-200/50";
              dotColor = "bg-yellow-500 ring-yellow-100";
            }

            return (
              <div key={item.id} className="relative group">
                <span className={`absolute -left-[31px] top-1 w-2.5 h-2.5 rounded-full ring-4 ${dotColor} transition-transform group-hover:scale-125`} />

                <div className="space-y-2 bg-slate-50/20 hover:bg-slate-50 border border-slate-100 p-4 rounded-xl transition-all duration-200">
                  <div className="flex flex-col sm:flex-row gap-2 justify-between sm:items-center">
                    <div className="flex items-center gap-2">
                      <span className={`p-1 border rounded-lg ${pillColor}`}>{iconElement}</span>
                      <h4 className="text-xs font-bold text-slate-800">{item.title}</h4>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border max-w-max ${pillColor}`}>
                      {item.type}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed font-medium">
                    {item.description}
                  </p>

                  <div className="grid sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-semibold">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {item.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <UserRound className="w-3.5 h-3.5 text-slate-400" />
                      Pelapor: <strong className="text-slate-500">{item.teacher}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                      Sumber: <strong className="text-slate-500">{item.sourcePortal || "Portal Guru"}</strong>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          {behaviour.length === 0 && (
            <div className="py-8 text-center text-xs text-slate-400 font-bold">Belum ada catatan perilaku untuk siswa ini.</div>
          )}
        </div>
      </div>

      <div className="relative overflow-hidden bg-slate-900 text-white rounded-2xl p-5 shadow-md flex items-start gap-4 border border-slate-800">
        <div className="p-3 bg-emerald-500 rounded-xl text-slate-950 shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-emerald-400 tracking-wider uppercase">Akses Input Catatan</h4>
          <p className="text-sm font-bold text-slate-100">Data catatan perilaku hanya dapat dimasukkan dari Portal Wali Kelas, Portal Guru, dan Portal Kepala Sekolah.</p>
          <p className="text-xs text-slate-300">Portal Orang Tua menampilkan catatan sebagai informasi perkembangan anak, tanpa akses input.</p>
        </div>
      </div>
    </div>
  );
}
