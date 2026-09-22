import React, { useState } from "react";
import { SIKOWALIDatabase } from "../types";
import { Download, MessageCircle, Heart, Plus, Send } from "lucide-react";
import { downloadExcel } from "../utils/excelExport";

interface WallTabProps {
  db: SIKOWALIDatabase;
  onAddFeedback: (fd: { author: string; type: "Positif" | "Keluhan" | "Saran"; content: string }) => Promise<void>;
  onLikeFeedback: (id: string) => Promise<void>;
  onAddFeedbackComment: (feedbackId: string, text: string) => Promise<void>;
  role: string;
}

export default function WallTab({ db, onAddFeedback, onLikeFeedback, onAddFeedbackComment, role }: WallTabProps) {
  const { feedback } = db;

  // Sentiment counts
  const countPositif = feedback.filter((f) => f.type === "Positif").length;
  const countKeluhan = feedback.filter((f) => f.type === "Keluhan").length;
  const countSaran = feedback.filter((f) => f.type === "Saran").length;

  const [activeFeedbackIdForComment, setActiveFeedbackIdForComment] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState("");

  // Submissions form states
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [authorName, setAuthorName] = useState(db.currentUser?.name || (role === "orangtua" ? "Wali Murid" : "Admin Sekolah"));
  const [type, setType] = useState<"Positif" | "Keluhan" | "Saran">("Positif");
  const [content, setContent] = useState("");

  const handleCreateFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    await onAddFeedback({
      author: authorName.trim() || "Wali Murid Anonim",
      type,
      content
    });

    setContent("");
    setShowSubmitModal(false);
  };

  const handleFeedbackCommentSubmit = async (feedbackId: string) => {
    if (!commentInput.trim()) return;
    await onAddFeedbackComment(feedbackId, commentInput);
    setCommentInput("");
  };

  const exportWallExcel = async () => {
    const header = ["Tanggal", "Pengirim", "Jenis", "Isi Masukan", "Jumlah Suka", "Jumlah Komentar", "Komentar Sekolah"];
    const rows = feedback.map((item) => [
      item.date,
      item.author,
      item.type,
      item.content,
      String(item.likes),
      String(item.comments.length),
      item.comments.map((comment) => `${comment.date} - ${comment.author}: ${comment.text}`).join("\n"),
    ]);
    const schoolName = (db.schoolSettings?.name || "sikowali").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    await downloadExcel(`backup-wall-${schoolName || "sikowali"}.xlsx`, [header, ...rows], "Backup Wall");
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in select-none">
      {/* Sentiment metric stats summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Masukan Positif</span>
          <p className="text-xl font-bold text-emerald-600 font-black">{countPositif}</p>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Keluhan Sarana</span>
          <p className="text-xl font-bold text-red-600 font-black">{countKeluhan}</p>
        </div>
        <div className="bg-white border border-slate-100 p-4 rounded-xl shadow-sm text-center">
          <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Saran Konstruktif</span>
          <p className="text-xl font-bold text-blue-600 font-black">{countSaran}</p>
        </div>
        <button
          onClick={() => setShowSubmitModal(!showSubmitModal)}
          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-4 rounded-xl shadow font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer border border-emerald-400"
        >
          <Plus className="w-4.5 h-4.5" />
          {role === "Admin" ? "Tambah Masukan Wall" : "Kirim Masukan Anda"}
        </button>
        <button
          onClick={exportWallExcel}
          disabled={!feedback.length}
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-4 rounded-xl shadow font-black text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <Download className="w-4.5 h-4.5" />
          Backup Wall Excel
        </button>
      </div>

      {/* Write suggestion modal block layout */}
      {showSubmitModal && (
        <form onSubmit={handleCreateFeedback} className="bg-slate-50 border border-slate-200/60 p-5 rounded-2xl space-y-4 animate-fade-in">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider block">{role === "Admin" ? "Kelola Masukan / Aspirasi Wall" : "Kirim Masukan / Aspirasi Wali Murid"}</h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">Identitas Nama Pengirim</label>
              <input
                type="text"
                placeholder="misal: Budi S. / Anonim"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none font-medium text-slate-700"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase block">Jenis Masukan</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer text-slate-700"
              >
                <option value="Positif">Positif / Apresiasi</option>
                <option value="Keluhan">Keluhan Sarfas</option>
                <option value="Saran">Saran / Rekomendasi</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-400 font-bold uppercase block">Isi Masukan</label>
            <textarea
              required
              rows={4}
              placeholder="Tuliskan kritikan, masukan, pujian Anda kepada pihak sekolah demi kemajuan belajar anak..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-white border border-slate-200 p-2.5 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none resize-none font-medium text-slate-700"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowSubmitModal(false)}
              className="text-xs text-slate-500 font-semibold px-4 py-2 hover:bg-slate-150 rounded-xl"
            >
              Batalkan
            </button>
            <button
              type="submit"
              className="text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all px-4 py-2 rounded-xl"
            >
              Kirim Aspirasi
            </button>
          </div>
        </form>
      )}

      {/* Feed list stream layout */}
      <div className="wall-print-area space-y-4.5">
        <div className="hidden print:block bg-white border-b border-slate-200 pb-4 mb-4">
          <h1 className="text-lg font-black text-slate-900">Backup Masukan Wall</h1>
          <p className="text-xs font-semibold text-slate-500">{db.schoolSettings?.name || "SIKOWALI"} • Total {feedback.length} masukan</p>
        </div>
        {feedback.map((item) => {
          const isPositif = item.type === "Positif";
          const isKeluhan = item.type === "Keluhan";

          let colorStyle = "border-blue-100 bg-blue-500/[0.01]";
          let tagColor = "bg-blue-50 text-blue-600 border-blue-200/50";
          if (isPositif) {
            colorStyle = "border-emerald-100 bg-emerald-500/[0.01]";
            tagColor = "bg-emerald-50 text-emerald-600 border-emerald-200/50";
          } else if (isKeluhan) {
            colorStyle = "border-red-100 bg-red-500/[0.01]";
            tagColor = "bg-red-50 text-red-600 border-red-200/50";
          }

          return (
            <div key={item.id} className={`bg-white border rounded-2xl p-5 shadow-sm space-y-4 transition-all hover:scale-[1.002] ${colorStyle}`}>
              {/* Top line detail */}
              <div className="flex justify-between items-center bg-slate-50/20 px-1 py-0.5 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-slate-200 text-slate-700 rounded-lg flex items-center justify-center font-bold text-xs select-none">
                    {item.author[0]}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800">{item.author}</span>
                    <span className="text-[10px] text-slate-400 block font-semibold">{item.date}</span>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${tagColor}`}>
                  {item.type}
                </span>
              </div>

              {/* Feed Content text */}
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                {item.content}
              </p>

              {/* Interactive buttons row */}
              <div className="flex gap-4 items-center pt-3 border-t border-slate-100/60">
                <button
                  onClick={() => onLikeFeedback(item.id)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 font-semibold cursor-pointer group"
                >
                  <Heart className="w-4 h-4 text-slate-400 group-hover:fill-red-500 transition-colors" />
                  <span>Suka ({item.likes})</span>
                </button>

                <button
                  onClick={() => setActiveFeedbackIdForComment(activeFeedbackIdForComment === item.id ? null : item.id)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-500 font-semibold cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Komentar Sekolah ({item.comments.length})</span>
                </button>
              </div>

              {/* Collapsed comment blocks */}
              {activeFeedbackIdForComment === item.id && (
                <div className="mt-3.5 space-y-3.5 border-t border-slate-100 pt-3">
                  <div className="space-y-2 max-h-44 overflow-y-auto">
                    {item.comments.map((comm, cIdx) => (
                      <div key={cIdx} className="bg-slate-50/80 p-3 rounded-xl border border-slate-100 flex items-start gap-2.5">
                        <div className="w-6.5 h-6.5 rounded-full bg-slate-300 text-slate-700 flex items-center justify-center font-bold text-[10px] shrink-0">
                          {comm.author[0]}
                        </div>
                        <div className="space-y-0.5 flex-1">
                          <p className="text-[10px] font-bold text-slate-600 flex justify-between">
                            <span>{comm.author}</span>
                            <span className="font-normal text-slate-400">{comm.date}</span>
                          </p>
                          <p className="text-xs text-slate-600 leading-normal">{comm.text}</p>
                        </div>
                      </div>
                    ))}
                    {item.comments.length === 0 && (
                      <p className="text-center text-[10px] text-slate-400 py-3.5">Belum ada tanggapan pengurus. SIKOWALI menggaransi respon cepat.</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Berikan komentar, solusi, atau tanggapan..."
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium"
                    />
                    <button
                      onClick={() => handleFeedbackCommentSubmit(item.id)}
                      className="p-1.5 bg-slate-950 hover:bg-slate-800 text-slate-50 font-bold rounded-xl"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
