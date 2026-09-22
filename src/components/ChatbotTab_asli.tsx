import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, Trash2, AlertCircle } from "lucide-react";
import { AIChatQuota } from "../types";

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export default function ChatbotTab({ db, sessionToken }: { db: any; sessionToken: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "model",
      content: `Halo! Saya SKO AI, asisten virtual sekolah Anda di SIKOWALI. Saya dapat membantu memberi informasi seputar jadwal ujian, pengumuman sekolah, serta rincian perkembangan belajar dan absensi ${db.student?.name || "murid"}. Ada yang ingin Anda tanyakan?`
    }
  ]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<AIChatQuota | null>(null);

  const feedRef = useRef<HTMLDivElement>(null);

  const suggestionChips = [
    "Kapan jadwal UTS?",
    "Ada pengumuman terbaru?",
    "Jam pelajaran selesai pukul berapa?",
    "Siapa wali kelas VII-A?"
  ];
  const quotaExhausted = quota?.remaining === 0;

  useEffect(() => {
    fetch("/api/gemini/chat/quota", { headers: { "x-session-token": sessionToken } })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal memuat kuota chatbot.");
        setQuota(data.quota);
      })
      .catch((err) => console.error(err));
  }, [sessionToken]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || loading || quotaExhausted) return;

    const updatedUserMsgs = [...messages, { role: "user", content: text } as ChatMessage];
    setMessages(updatedUserMsgs);
    setUserInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ messages: updatedUserMsgs, studentId: db.student?.id })
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.quota) setQuota(data.quota);
        throw new Error(data.error || "Gagal menggapai server AI.");
      }
      if (data.quota) setQuota(data.quota);
      setMessages([...updatedUserMsgs, { role: "model", content: data.response }]);
    } catch (err: any) {
      console.error(err);
      setMessages([...updatedUserMsgs, { 
        role: "model", 
        content: err.message || "Maaf, terjadi ketidakstabilan koneksi dengan mesin AI. Silakan coba kirim ulang pesan beberapa saat lagi." 
      }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Scroll to bottom on updates
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const clearChat = () => {
    setMessages([
      {
        role: "model",
        content: "Sesi obrolan baru dimulai. Tanyakan apa saja mengenai info sekolah, pengumuman, dan data murid Anda!"
      }
    ]);
  };

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col h-[calc(100vh-10rem)] max-w-4xl mx-auto overflow-hidden animate-fade-in select-none">
      {/* Bot top header card */}
      <div className="bg-slate-950 px-5 py-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center font-bold text-slate-950 relative">
            <Bot className="w-5 h-5" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-slate-950 rounded-full animate-ping" />
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-slate-950 rounded-full" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider leading-none">SKO AI</h3>
            <span className="text-[10px] text-slate-500 font-semibold mt-1 inline-block">Asisten Sekolah Pintar • Online</span>
          </div>
        </div>
        <button
          onClick={clearChat}
          className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-xl transition-all"
          title="Hapus Sesi Obrolan"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Messages layout stream */}
      <div ref={feedRef} className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-50/30">
        {messages.map((m, idx) => {
          const isBot = m.role === "model";
          return (
            <div key={idx} className={`flex items-start gap-3.5 max-w-[80%] ${isBot ? "" : "ml-auto flex-row-reverse"}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 select-none shadow-sm ${
                isBot ? "bg-emerald-500 text-slate-950" : "bg-slate-900 text-slate-100"
              }`}>
                {isBot ? "AI" : "U"}
              </div>

              <div className={`p-4 rounded-2xl text-xs leading-relaxed font-semibold shadow-inner-sm ${
                isBot 
                  ? "bg-white border border-slate-100 text-slate-700 rounded-tl-none font-medium" 
                  : "bg-slate-900 text-slate-100 rounded-tr-none font-medium"
              }`}>
                {/* Match Markdown line breaks simply */}
                {m.content.split("\n").map((line, i) => (
                  <p key={i} className={line ? "mb-1.5" : "h-1.5"}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start gap-3 max-w-[80%]">
            <div className="w-8 h-8 bg-emerald-500 text-slate-950 rounded-xl flex items-center justify-center font-bold text-xs select-none shadow-sm">
              AI
            </div>
            <div className="bg-white border border-slate-100 px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce delay-100" />
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce delay-200" />
            </div>
          </div>
        )}
      </div>

      {/* Suggestions and text writing panel */}
      <div className="p-4 border-t border-slate-100 bg-white space-y-3 shrink-0">
        {quota && (
          <div className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-[10px] font-bold ${
            quota.remaining === 0
              ? "bg-red-50 border-red-200 text-red-700"
              : quota.remaining <= 3
                ? "bg-amber-50 border-amber-200 text-amber-700"
                : "bg-emerald-50 border-emerald-100 text-emerald-700"
          }`}>
            <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> Sisa kuota AI bulan ini</span>
            <span>{quota.remaining} dari {quota.limit} pertanyaan</span>
          </div>
        )}
        {/* Chips list */}
        <div className="flex gap-2 overflow-x-auto pb-1 select-none scrollbar-none">
          {suggestionChips.map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(chip)}
              disabled={loading || quotaExhausted}
              className="px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 transition-all border border-slate-200/60 hover:border-emerald-200 text-slate-600 text-[10px] font-bold rounded-full whitespace-nowrap cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Form and Input field */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(userInput);
          }}
          className="flex gap-2.5"
        >
          <input
            type="text"
            placeholder={quotaExhausted ? "Kuota AI bulan ini sudah habis" : "Tanyakan jadwal, nilai anak, pengumuman, bimbingan..."}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            maxLength={500}
            disabled={loading || quotaExhausted}
            className="flex-1 bg-slate-50 border border-slate-200 focus:border-emerald-500 px-4 py-2.5 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all font-medium"
          />
          <button
            type="submit"
            disabled={!userInput.trim() || loading || quotaExhausted}
            className="px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 hover:shadow disabled:opacity-50 font-bold transition-all rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Kirim
          </button>
        </form>
      </div>
    </div>
  );
}
