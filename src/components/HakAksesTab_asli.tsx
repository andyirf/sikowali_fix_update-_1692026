import React, { useEffect, useState } from "react";
import { CheckCircle, Eye, EyeOff, KeyRound, Save, Shield } from "lucide-react";
import { CrudPermission, Role, SIKOWALIDatabase } from "../types";

interface HakAksesTabProps {
  currentRole: Role;
  onChangeRole: (role: Role) => void;
  db?: SIKOWALIDatabase;
  sessionToken?: string;
  onRefresh?: () => Promise<void>;
}

const roles: { key: Role; label: string }[] = [
  { key: "Administrator", label: "Administrator" },
  { key: "Admin", label: "Admin" },
  { key: "WaliKelas", label: "Wali Kelas" },
  { key: "Guru", label: "Guru" },
  { key: "kepalasekolah", label: "Kepala Sekolah" },
  { key: "orangtua", label: "Orang Tua" },
  { key: "Murid", label: "Murid" },
];

const permissions: { key: keyof CrudPermission; label: string }[] = [
  { key: "create", label: "C" },
  { key: "read", label: "R" },
  { key: "update", label: "U" },
  { key: "delete", label: "D" },
];

export default function HakAksesTab({ currentRole, db, sessionToken, onRefresh }: HakAksesTabProps) {
  const admin = db?.currentUser;
  const [form, setForm] = useState({
    name: admin?.name || "",
    username: admin?.username || "",
    password: "",
    email: admin?.email || "",
    phone: admin?.phone || "",
  });
  const [matrix, setMatrix] = useState(db?.accessMatrix || []);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const canEditCredential = currentRole === "Administrator" && admin?.id;

  useEffect(() => {
    setMatrix(db?.accessMatrix || []);
  }, [db?.accessMatrix]);

  const submitCredential = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditCredential) return;
    setSaving(true);
    setMessage("");
    try {
      const payload = { ...form, role: "Administrator" };
      const res = await fetch(`/api/admin/users/${admin.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken || "" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengubah kredensial admin.");
      setMessage("Kredensial admin berhasil diperbarui di tabel users.");
      setForm({ ...form, password: "" });
      setShowPassword(false);
      await onRefresh?.();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = async (featureId: string, role: Role, permission: keyof CrudPermission, value: boolean) => {
    setMatrix((rows) => rows.map((row) => row.featureId === featureId ? {
      ...row,
      permissions: {
        ...row.permissions,
        [role]: { ...row.permissions[role], [permission]: value },
      },
    } : row));
    const res = await fetch("/api/admin/access-permissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-session-token": sessionToken || "" },
      body: JSON.stringify({ featureId, role, permission, value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "Gagal menyimpan hak akses.");
      await onRefresh?.();
      return;
    }
    setMessage("Hak akses berhasil disimpan ke database.");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-[#125B3d] border border-emerald-900/10 rounded-xl p-5 shadow-sm text-white">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="p-3 rounded-xl bg-yellow-400 text-slate-950 w-fit">
            <Shield className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-black">Matriks Hak Akses CRUD</h3>
            <p className="text-xs text-emerald-50/80 font-medium">Administrator dapat mengatur izin Create, Read, Update, dan Delete setiap halaman per role.</p>
          </div>
          <span className="px-3 py-1 rounded-lg bg-white/10 text-[10px] font-black">Role aktif: {roles.find((r) => r.key === currentRole)?.label || currentRole}</span>
        </div>
      </div>

      {message && (
        <div className="bg-white border border-slate-100 rounded-xl p-3 text-xs font-bold text-slate-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          {message}
        </div>
      )}

      <form onSubmit={submitCredential} className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <span className="p-2 rounded-xl bg-slate-900 text-white"><KeyRound className="w-4 h-4" /></span>
          <div>
            <h4 className="text-sm font-bold text-slate-900">Ubah Kredensial Administrator</h4>
            <p className="text-xs text-slate-500">Perubahan username, password, email, dan kontak tersimpan langsung ke tabel `users`.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nama admin" className="input-field" />
          <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Username admin" className="input-field" />
          <div className="relative">
            <input type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password baru, kosongkan jika tidak diubah" className="input-field pr-10" autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email admin" className="input-field" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Nomor kontak admin" className="input-field" />
        </div>
        <button disabled={!canEditCredential || saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50 hover:bg-slate-800">
          <Save className="w-4 h-4" />
          {saving ? "Menyimpan..." : "Simpan Kredensial"}
        </button>
      </form>

      <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
          <h4 className="text-sm font-bold text-slate-900">Tabel Matriks Otoritas Fitur</h4>
          <p className="text-[10px] text-slate-500 font-bold">C = Create, R = Read, U = Update, D = Delete</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-100">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
              <tr>
                <th className="text-left px-4 py-3">Fitur</th>
                <th className="text-left px-4 py-3">Kategori</th>
                {roles.map((role) => <th key={role.key} className="text-left px-4 py-3 whitespace-nowrap">{role.label}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {matrix.length ? matrix.map((row) => (
                <tr key={row.featureId}>
                  <td className="px-4 py-3 font-bold text-slate-800 min-w-44">{row.feature}</td>
                  <td className="px-4 py-3 text-slate-500">{row.category}</td>
                  {roles.map((role) => (
                    <td key={role.key} className="px-4 py-3">
                      <div className="flex gap-1.5">
                        {permissions.map((permission) => (
                          <label key={permission.key} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-1.5 py-1 text-[10px] font-black text-slate-600">
                            <input
                              type="checkbox"
                              checked={!!row.permissions[role.key]?.[permission.key]}
                              onChange={(e) => togglePermission(row.featureId, role.key, permission.key, e.target.checked)}
                              className="accent-emerald-600"
                            />
                            {permission.label}
                          </label>
                        ))}
                      </div>
                    </td>
                  ))}
                </tr>
              )) : (
                <tr>
                  <td colSpan={roles.length + 2} className="px-4 py-8 text-center font-bold text-slate-400">
                    Data matriks hak akses belum tersedia.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
