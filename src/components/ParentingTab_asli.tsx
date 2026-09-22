import React, { useState } from "react";
import { SIKOWALIDatabase, ParentingArticle, Role } from "../types";
import { AlertCircle, BookOpen, Camera, CheckCircle, Edit3, Save, Trash2, X } from "lucide-react";

interface ParentingTabProps {
  db: SIKOWALIDatabase;
  role: Role;
  sessionToken: string;
  onRefresh: () => Promise<void>;
}

const emptyForm = {
  title: "",
  category: "Pola Asuh",
  summary: "",
  content: "",
  author: "",
  imageUrl: "",
};

export default function ParentingTab({ db, role, sessionToken, onRefresh }: ParentingTabProps) {
  const { parenting } = db;
  const canManage = ["WaliKelas", "Guru", "kepalasekolah", "Admin"].includes(role);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const activeArticle = parenting.find((p) => p.id === selectedArticleId);

  const resetForm = () => {
    setEditingId("");
    setForm(emptyForm);
  };

  const editArticle = (article: ParentingArticle) => {
    setEditingId(article.id);
    setForm({
      title: article.title,
      category: article.category,
      summary: article.summary,
      content: article.content,
      author: article.author,
      imageUrl: article.imageUrl,
    });
    setMessage(null);
  };

  const callParenting = async (url: string, method: string, payload?: object) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Gagal menyimpan materi parenting.");
    await onRefresh();
  };

  const handleImageUpload = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, imageUrl: String(reader.result || "") }));
    reader.readAsDataURL(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await callParenting(editingId ? `/api/parenting/${editingId}` : "/api/parenting", editingId ? "PUT" : "POST", form);
      setMessage({ type: "success", text: editingId ? "Materi parenting berhasil diperbarui." : "Materi parenting baru berhasil ditambahkan." });
      resetForm();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const deleteArticle = async (article: ParentingArticle) => {
    setSaving(true);
    setMessage(null);
    try {
      await callParenting(`/api/parenting/${article.id}`, "DELETE");
      if (selectedArticleId === article.id) setSelectedArticleId(null);
      setMessage({ type: "success", text: "Materi parenting berhasil dihapus." });
      if (editingId === article.id) resetForm();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in select-none">
      <div className="bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-100/50 rounded-2xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest block">Fitur Pendukung</span>
          <h3 className="text-sm font-bold text-slate-900">Ruang Parenting SIKOWALI</h3>
          <p className="text-xs text-slate-500">Membantu menyelaraskan bimbingan akademis sekolah dengan pola asuh nyaman penuh empati di rumah.</p>
        </div>
        <div className="px-3 py-1.5 bg-white border border-indigo-100 rounded-xl text-xs font-semibold text-indigo-800 flex items-center gap-1.5 shrink-0">
          <BookOpen className="w-4 h-4 text-indigo-500" />
          {parenting.length} Artikel Pola Asuh
        </div>
      </div>

      {message && (
        <div className={`border text-xs p-3 rounded-xl flex items-center gap-2 font-bold ${
          message.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {message.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {canManage && (
        <form onSubmit={submit} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h4 className="text-sm font-black text-slate-900">{editingId ? "Edit Materi Parenting" : "Tambah Materi Parenting"}</h4>
              <p className="text-xs text-slate-500">Data tersimpan ke tabel `parenting` dan langsung tampil untuk orang tua.</p>
            </div>
            {editingId && (
              <button type="button" onClick={resetForm} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200">
                Batal Edit
              </button>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Judul Materi">
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Judul materi parenting" className="input-field" />
            </Field>
            <Field label="Kategori">
              <input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Contoh: Pola Asuh" className="input-field" />
            </Field>
            <Field label="Penulis / Narasumber">
              <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Nama penulis atau tim sekolah" className="input-field" />
            </Field>
            <Field label="URL Gambar">
              <input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..." className="input-field" />
            </Field>
            <Field label="Upload Gambar Lokal">
              <label className="input-field flex items-center gap-2 cursor-pointer text-slate-500">
                <Camera className="w-4 h-4 text-indigo-600" />
                <span className="truncate">{form.imageUrl?.startsWith("data:") ? "Gambar lokal siap disimpan" : "Pilih file PNG/JPG/WebP"}</span>
                <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" onChange={(e) => handleImageUpload(e.target.files?.[0])} className="hidden" />
              </label>
            </Field>
            {form.imageUrl && (
              <div className="md:col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-center gap-3">
                <img src={form.imageUrl} alt="Preview materi parenting" className="w-20 h-14 rounded-lg object-cover bg-white border border-slate-200" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700">Preview Gambar Parenting</p>
                  <p className="text-[10px] text-slate-400 truncate">{form.imageUrl.startsWith("data:") ? "File lokal akan disimpan ke storage/uploads/parenting." : form.imageUrl}</p>
                </div>
              </div>
            )}
            <Field label="Ringkasan" wide>
              <textarea required value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Ringkasan singkat yang tampil di kartu artikel" className="input-field min-h-20" />
            </Field>
            <Field label="Isi Materi" wide>
              <textarea required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Isi lengkap materi parenting. Pisahkan paragraf dengan baris kosong." className="input-field min-h-36" />
            </Field>
          </div>
          <button disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50 hover:bg-slate-800">
            <Save className="w-4 h-4" />
            {saving ? "Menyimpan..." : editingId ? "Update Materi" : "Simpan Materi"}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {parenting.map((art) => (
          <div key={art.id} className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
            <div>
              <div className="h-44 bg-slate-50 relative overflow-hidden">
                <img referrerPolicy="no-referrer" src={art.imageUrl} alt={art.title} className="w-full h-full object-cover" />
                <span className="absolute top-3 left-3 bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider">
                  {art.category}
                </span>
              </div>

              <div className="p-5 space-y-2">
                <h4 className="text-xs font-bold text-slate-800 tracking-tight leading-snug line-clamp-1">{art.title}</h4>
                <p className="text-xs text-slate-500 leading-relaxed font-medium line-clamp-3">{art.summary}</p>
              </div>
            </div>

            <div className="p-5 pt-0 flex flex-wrap justify-between items-center gap-2">
              <span className="text-[9px] text-slate-400 font-bold">Oleh: {art.author.split(",")[0]}</span>
              <div className="flex flex-wrap items-center gap-2">
                {canManage && (
                  <>
                    <button onClick={() => editArticle(art)} className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 hover:text-indigo-700">
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button onClick={() => deleteArticle(art)} className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-700">
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  </>
                )}
                <button onClick={() => setSelectedArticleId(art.id)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer">
                  Baca Selengkapnya
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {selectedArticleId && activeArticle && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-2xl overflow-hidden shadow-xl flex flex-col max-h-[85vh] animate-slide-up border border-slate-100">
            <div className="relative h-52 bg-slate-100 shrink-0">
              <img referrerPolicy="no-referrer" src={activeArticle.imageUrl} alt={activeArticle.title} className="w-full h-full object-cover" />
              <button onClick={() => setSelectedArticleId(null)} className="absolute top-4 right-4 p-2 bg-slate-950/75 rounded-full text-white hover:bg-slate-950 focus:outline-none">
                <X className="w-4 h-4" />
              </button>
              <span className="absolute bottom-4 left-4 bg-indigo-600 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide">
                {activeArticle.category}
              </span>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto space-y-4">
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-slate-900 tracking-tight leading-snug">{activeArticle.title}</h3>
                <div className="flex gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  <span>Pakar: {activeArticle.author}</span>
                  <span>Materi Konseling</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3 text-xs text-slate-600 leading-relaxed font-semibold space-y-3.5">
                {activeArticle.content.split("\n\n").map((par, pIdx) => <p key={pIdx}>{par}</p>)}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
              <button onClick={() => setSelectedArticleId(null)} className="px-5 py-2 bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 rounded-xl">
                Selesai Membaca
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`space-y-1.5 ${wide ? "md:col-span-2" : ""}`}>
      <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}
