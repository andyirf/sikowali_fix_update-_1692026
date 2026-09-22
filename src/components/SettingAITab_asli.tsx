import React, { useState } from "react";
import { CheckCircle, RefreshCw, Save, SlidersHorizontal, Sparkles } from "lucide-react";
import { SIKOWALIDatabase } from "../types";

interface SettingAITabProps {
  db: SIKOWALIDatabase;
  sessionToken: string;
  onRefresh: () => Promise<void>;
}

const providerOptions = [
  {
    value: "Gemini",
    label: "Google Gemini",
    apiKeyEnv: "GEMINI_API_KEY",
    baseUrl: "",
    models: [
      { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash", description: "Cepat untuk chatbot dan ringkasan portal." },
      { value: "gemini-3.5-pro", label: "Gemini 3.5 Pro", description: "Lebih kuat untuk analisis mendalam." },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Pilihan ringan dan stabil." },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Pilihan analisis kompleks." },
    ],
  },
  {
    value: "OpenAI",
    label: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini", description: "Ringan untuk chat portal dan respons cepat." },
      { value: "gpt-4o", label: "GPT-4o", description: "Lebih kuat untuk analisis akademik lengkap." },
      { value: "gpt-4.1-mini", label: "GPT-4.1 Mini", description: "Pilihan cepat untuk ringkasan dan tanya jawab." },
      { value: "gpt-4.1", label: "GPT-4.1", description: "Pilihan kuat untuk evaluasi lebih panjang." },
    ],
  },
  {
    value: "OpenRouter",
    label: "OpenRouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      { value: "openai/gpt-4o-mini", label: "OpenAI GPT-4o Mini", description: "Model cepat melalui OpenRouter." },
      { value: "google/gemini-flash-1.5", label: "Google Gemini Flash", description: "Gemini melalui routing OpenRouter." },
      { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", description: "Kuat untuk analisis naratif." },
      { value: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B", description: "Opsi open model untuk instruksi umum." },
    ],
  },
  {
    value: "Anthropic",
    label: "Anthropic Claude",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com/v1",
    models: [
      { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet", description: "Kuat untuk analisis dan bahasa natural." },
      { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku", description: "Cepat untuk chatbot ringan." },
    ],
  },
  {
    value: "Custom",
    label: "Custom OpenAI-Compatible",
    apiKeyEnv: "AI_API_KEY",
    baseUrl: "http://localhost:11434/v1",
    models: [
      { value: "llama3.1", label: "Llama 3.1", description: "Contoh model lokal/OpenAI-compatible." },
      { value: "qwen2.5", label: "Qwen 2.5", description: "Contoh model lokal/OpenAI-compatible." },
      { value: "custom-model", label: "Custom Model", description: "Isi model sesuai server AI yang dipakai." },
    ],
  },
];

export default function SettingAITab({ db, sessionToken, onRefresh }: SettingAITabProps) {
  const canRestartApp = !import.meta.env.PROD;
  const currentProvider = providerOptions.find((item) => item.value === db.aiSettings?.provider) || providerOptions[0];
  const [form, setForm] = useState({
    provider: db.aiSettings?.provider || currentProvider.value,
    model: db.aiSettings?.model || currentProvider.models[0].value,
    enabled: db.aiSettings?.enabled !== false,
    systemPrompt: db.aiSettings?.systemPrompt || "Gunakan Bahasa Indonesia yang ramah, ringkas, dan berdasarkan data portal SIKOWALI.",
    apiKeyEnv: db.aiSettings?.apiKeyEnv || currentProvider.apiKeyEnv,
    baseUrl: db.aiSettings?.baseUrl || currentProvider.baseUrl,
  });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const selectedProvider = providerOptions.find((item) => item.value === form.provider) || providerOptions[0];
  const selectedModel = selectedProvider.models.find((model) => model.value === form.model);

  const changeProvider = (provider: string) => {
    const nextProvider = providerOptions.find((item) => item.value === provider) || providerOptions[0];
    setForm({
      ...form,
      provider: nextProvider.value,
      model: nextProvider.models[0].value,
      apiKeyEnv: nextProvider.apiKeyEnv,
      baseUrl: nextProvider.baseUrl,
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan setting AI.");
      setMessage("Setting AI berhasil disimpan ke database.");
      await onRefresh();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const restartApp = async () => {
    if (!window.confirm("Restart aplikasi sekarang? Aplikasi akan tidak tersedia beberapa detik.")) return;
    setRestarting(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal memulai restart aplikasi.");
      setMessage(data.message || "Restart aplikasi dimulai. Silakan tunggu beberapa detik lalu refresh halaman.");
    } catch (err: any) {
      setMessage(err.message);
      setRestarting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-500 text-slate-950 w-fit">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-black text-slate-900">Setting AI</h3>
            <p className="text-xs text-slate-500 font-medium">Admin memilih platform AI, model, env API key, base URL, dan status aktivasi. API key tetap aman di file `.env`.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-3 py-1 rounded-lg text-[10px] font-black ${form.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
              {form.enabled ? `${form.provider} Aktif` : "AI Nonaktif"}
            </span>
            {canRestartApp && (
              <button
                type="button"
                onClick={restartApp}
                disabled={restarting}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-50 text-red-700 border border-red-100 text-xs font-black hover:bg-red-100 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${restarting ? "animate-spin" : ""}`} />
                {restarting ? "Restarting..." : "Restart Aplikasi"}
              </button>
            )}
          </div>
        </div>
      </div>

      {message && (
        <div className="bg-white border border-slate-100 rounded-xl p-3 text-xs font-bold text-slate-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          {message}
        </div>
      )}

      <form onSubmit={submit} className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="p-2 rounded-xl bg-slate-900 text-white"><SlidersHorizontal className="w-4 h-4" /></span>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Konfigurasi Platform AI</h4>
            <p className="text-xs text-slate-500">Sesuaikan provider dengan API key yang tersedia di `.env`, misalnya `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, atau `ANTHROPIC_API_KEY`.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1.5">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Platform AI</span>
            <select value={form.provider} onChange={(e) => changeProvider(e.target.value)} className="input-field">
              {providerOptions.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Model</span>
            <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input-field">
              {selectedProvider.models.map((model) => <option key={model.value} value={model.value}>{model.label} - {model.value}</option>)}
            </select>
          </label>
          {form.provider === "Custom" && (
            <label className="md:col-span-2 space-y-1.5">
              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Nama Model Custom</span>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="input-field" placeholder="Contoh: llama3.1, qwen2.5, atau model server lokal" />
            </label>
          )}
          <label className="space-y-1.5">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Nama ENV API Key</span>
            <input value={form.apiKeyEnv} onChange={(e) => setForm({ ...form, apiKeyEnv: e.target.value })} className="input-field" placeholder="Contoh: OPENAI_API_KEY" />
          </label>
          <label className="space-y-1.5">
            <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Base URL</span>
            <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} className="input-field" placeholder="Kosongkan untuk default provider" />
          </label>
          <div className="md:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 font-semibold">
            {selectedModel?.description || "Model custom tersimpan dari database. Pastikan provider/base URL mendukung model tersebut."}
          </div>
          <label className="md:col-span-2 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="accent-emerald-600" />
            Aktifkan fitur AI di portal yang punya akses
          </label>
          <textarea
            value={form.systemPrompt}
            onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
            className="input-field md:col-span-2 min-h-32"
            placeholder="Instruksi sistem AI"
          />
        </div>

        <button disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50 hover:bg-slate-800">
          <Save className="w-4 h-4" />
          {saving ? "Menyimpan..." : "Simpan Setting AI"}
        </button>
      </form>
    </div>
  );
}
