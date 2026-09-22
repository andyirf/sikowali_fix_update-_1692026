import React, { useState } from "react";
import { AlertCircle, Building2, CheckCircle, Edit3, Eye, EyeOff, FileSpreadsheet, GraduationCap, KeyRound, Power, Save, Trash2, Upload, UserCheck, Users, X } from "lucide-react";
import { ClassRoom, ParentRegistration, Role, SIKOWALIDatabase, Student, Teacher, User } from "../types";

interface ManajemenTabProps {
  db: SIKOWALIDatabase;
  role: Role;
  sessionToken: string;
  onRefresh: () => Promise<void>;
}

const roleOptions: { value: Role; label: string }[] = [
  { value: "Administrator", label: "Administrator" },
  { value: "Admin", label: "Admin" },
  { value: "kepalasekolah", label: "Kepala Sekolah" },
  { value: "WaliKelas", label: "Wali Kelas" },
  { value: "Guru", label: "Guru" },
  { value: "orangtua", label: "Orang Tua" },
  { value: "Murid", label: "Murid" },
];

const emptyUser = { name: "", username: "", password: "", role: "orangtua" as Role, email: "", phone: "" };
const emptyTeacher = { name: "", className: "", position: "Wali Kelas", teacherNumber: "", phone: "", graduate: "", address: "", email: "", userId: "" };
const emptyClass = { name: "", homeroomTeacherId: "", academicYear: "", semester: "" };
const emptyStudentBiodata = { nisn: "", gender: "", birthPlace: "", birthDate: "", religion: "", previousSchool: "", address: "", district: "", city: "", province: "", fatherName: "", motherName: "", fatherJob: "", motherJob: "", parentAddressStreet: "", parentAddressVillage: "" };

export default function ManajemenTab({ db, role, sessionToken, onRefresh }: ManajemenTabProps) {
  const pageSize = 10;
  const isAdminLike = role === "Admin" || role === "Administrator";
  const isWaliKelas = role === "WaliKelas";
  const canManageParents = isAdminLike || isWaliKelas;
  const canCreatePrivilegedRoles = role === "Administrator";
  const availableRoleOptions = canCreatePrivilegedRoles ? roleOptions : roleOptions.filter((item) => !["Admin", "Administrator"].includes(item.value));
  const [activeMenu, setActiveMenu] = useState<"user" | "guru" | "murid" | "kelas" | "orangtua" | "registrasi">(isAdminLike ? "user" : "murid");
  const [userForm, setUserForm] = useState(emptyUser);
  const [teacherForm, setTeacherForm] = useState(emptyTeacher);
  const [classForm, setClassForm] = useState(emptyClass);
  const [studentForm, setStudentForm] = useState({
    name: "",
    nis: "",
    className: isWaliKelas ? db.visibleStudents?.[0]?.className || db.student.className : "",
    parentName: "",
    parentId: "",
    userId: "",
    ...emptyStudentBiodata,
  });
  const [editingUserId, setEditingUserId] = useState("");
  const [editingTeacherId, setEditingTeacherId] = useState("");
  const [editingStudentId, setEditingStudentId] = useState("");
  const [editingClassId, setEditingClassId] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [userPage, setUserPage] = useState(1);
  const [teacherPage, setTeacherPage] = useState(1);
  const [studentPage, setStudentPage] = useState(1);
  const [classPage, setClassPage] = useState(1);
  const [parentPage, setParentPage] = useState(1);
  const [studentImportClass, setStudentImportClass] = useState(isWaliKelas ? db.visibleStudents?.[0]?.className || db.student.className : "");
  const [studentImportFile, setStudentImportFile] = useState<File | null>(null);
  const [studentImportResult, setStudentImportResult] = useState<{ totalRows: number; validRows: number; created?: number; updated?: number; errors: string[] } | null>(null);

  const parentUsers = (db.users || []).filter((u) => u.role === "orangtua");
  const studentUsers = (db.users || []).filter((u) => u.role === "Murid");
  const teacherUsers = (db.users || []).filter((u) => u.role === "WaliKelas");
  const allUsers = role === "Administrator"
    ? db.users || []
    : (db.users || []).filter((user) => !["Admin", "Administrator"].includes(user.role));
  const allTeachers = db.teachers || [];
  const allClasses = db.classes || [];
  const allowedClasses = isWaliKelas
    ? Array.from(new Set((db.visibleStudents || []).map((s) => s.className)))
    : (db.classes || []).map((c) => c.name);
  const studentsForTable = isAdminLike
    ? (db.students || [])
    : (db.students || []).filter((student) => allowedClasses.includes(student.className));
  const userPageCount = getPageCount(allUsers.length, pageSize);
  const teacherPageCount = getPageCount(allTeachers.length, pageSize);
  const studentPageCount = getPageCount(studentsForTable.length, pageSize);
  const classPageCount = getPageCount(allClasses.length, pageSize);
  const parentPageCount = getPageCount(parentUsers.length, pageSize);
  const currentUserPage = Math.min(userPage, userPageCount);
  const currentTeacherPage = Math.min(teacherPage, teacherPageCount);
  const currentStudentPage = Math.min(studentPage, studentPageCount);
  const currentClassPage = Math.min(classPage, classPageCount);
  const currentParentPage = Math.min(parentPage, parentPageCount);
  const paginatedUsers = paginate(allUsers, currentUserPage, pageSize);
  const paginatedTeachers = paginate(allTeachers, currentTeacherPage, pageSize);
  const paginatedStudents = paginate(studentsForTable, currentStudentPage, pageSize);
  const paginatedClasses = paginate(allClasses, currentClassPage, pageSize);
  const paginatedParents = paginate(parentUsers, currentParentPage, pageSize);
  const parentRegistrations = db.parentRegistrations || [];
  const pendingRegistrations = parentRegistrations.filter((item) => item.status === "pending");
  const getLinkedParent = (registration: ParentRegistration) => {
    const student = (db.students || []).find(
      (item) =>
        item.nis === registration.studentNis &&
        item.name.toLowerCase() === registration.studentName.toLowerCase() &&
        item.className.toLowerCase() === registration.className.toLowerCase(),
    );
    if (!student?.parentId) return null;
    return (db.users || []).find((user) => user.id === student.parentId) || { name: student.parentName || "Akun orang tua aktif", username: "" };
  };

  const callJson = async (url: string, method: string, payload: object | null, successText: string) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan data.");
      setMessage({ type: "success", text: successText });
      await onRefresh();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const submitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreatePrivilegedRoles && ["Admin", "Administrator"].includes(userForm.role)) {
      setMessage({ type: "error", text: "Admin tidak bisa membuat atau mengubah user dengan role Admin dan Administrator." });
      return;
    }
    await callJson(editingUserId ? `/api/admin/users/${editingUserId}` : "/api/admin/users", editingUserId ? "PUT" : "POST", userForm, editingUserId ? "User berhasil diperbarui." : "User baru berhasil ditambahkan.");
    setUserForm(emptyUser);
    setEditingUserId("");
    setShowPassword(false);
  };

  const submitTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...teacherForm, className: teacherForm.position === "Wali Kelas" ? teacherForm.className : "-" };
    await callJson(editingTeacherId ? `/api/admin/teachers/${editingTeacherId}` : "/api/admin/teachers", editingTeacherId ? "PUT" : "POST", payload, editingTeacherId ? "Data guru berhasil diperbarui." : "Data guru berhasil ditambahkan.");
    setTeacherForm(emptyTeacher);
    setEditingTeacherId("");
  };

  const submitParent = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...userForm, role: "orangtua" as Role };
    await callJson(editingUserId ? `/api/admin/users/${editingUserId}` : "/api/admin/users", editingUserId ? "PUT" : "POST", payload, editingUserId ? "Data orang tua berhasil diperbarui." : "Akun orang tua berhasil ditambahkan.");
    setUserForm(emptyUser);
    setEditingUserId("");
    setShowPassword(false);
  };

  const submitClass = async (e: React.FormEvent) => {
    e.preventDefault();
    await callJson(editingClassId ? `/api/admin/classes/${editingClassId}` : "/api/admin/classes", editingClassId ? "PUT" : "POST", classForm, editingClassId ? "Data kelas berhasil diperbarui." : "Kelas baru berhasil ditambahkan.");
    setClassForm(emptyClass);
    setEditingClassId("");
  };

  const submitStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedParent = parentUsers.find((parent) => parent.id === studentForm.parentId);
    const payload = {
      ...studentForm,
      className: isWaliKelas ? allowedClasses[0] || studentForm.className : studentForm.className.trim(),
      parentName: selectedParent?.name || selectedParent?.username || "",
    };
    await callJson(editingStudentId ? `/api/admin/students/${editingStudentId}` : "/api/admin/students", editingStudentId ? "PUT" : "POST", payload, editingStudentId ? "Data murid berhasil diperbarui." : "Murid baru berhasil ditambahkan.");
    setStudentForm({ name: "", nis: "", className: isWaliKelas ? allowedClasses[0] || db.student.className : "", parentName: "", parentId: "", userId: "", ...emptyStudentBiodata });
    setEditingStudentId("");
  };

  const importStudentsFromExcel = async () => {
    const targetClassName = isWaliKelas ? allowedClasses[0] || studentImportClass : studentImportClass;
    if (!studentImportFile || !targetClassName) {
      setMessage({ type: "error", text: "Pilih kelas dan file Excel terlebih dahulu." });
      return;
    }
    setSaving(true);
    setMessage(null);
    setStudentImportResult(null);
    try {
      const fileData = await readFileAsDataUrl(studentImportFile);
      const res = await fetch("/api/admin/students/import-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-token": sessionToken },
        body: JSON.stringify({ fileName: studentImportFile.name, fileData, className: targetClassName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gagal import Excel murid.");
      setStudentImportResult({ totalRows: data.totalRows || 0, validRows: data.validRows || 0, created: data.created || 0, updated: data.updated || 0, errors: data.errors || [] });
      setMessage({ type: data.errors?.length ? "error" : "success", text: data.errors?.length ? "Import selesai dengan beberapa baris gagal. Periksa detail di bawah." : "Import Excel murid berhasil." });
      await onRefresh();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const reviewRegistration = async (registration: ParentRegistration, action: "approve" | "reject") => {
    await callJson(
      `/api/admin/parent-registrations/${registration.id}`,
      "PATCH",
      { action },
      action === "approve" ? "Pengajuan disetujui. Akun orang tua sudah aktif dan terhubung ke siswa." : "Pengajuan pendaftaran ditolak."
    );
  };

  const editUser = (u: User) => {
    if (!canCreatePrivilegedRoles && ["Admin", "Administrator"].includes(u.role)) {
      setMessage({ type: "error", text: "Admin tidak bisa mengedit user dengan role Admin atau Administrator." });
      return;
    }
    setActiveMenu("user");
    setEditingUserId(u.id);
    setShowPassword(false);
    setUserForm({ name: u.name || "", username: u.username, password: "", role: u.role, email: u.email || "", phone: u.phone || "" });
  };

  const editTeacher = (t: Teacher) => {
    setActiveMenu("guru");
    setEditingTeacherId(t.id);
    setTeacherForm({ name: t.name, className: t.className === "-" ? "" : t.className, position: t.position, teacherNumber: t.teacherNumber, phone: t.phone, graduate: t.graduate, address: t.address, email: t.email, userId: t.userId || "" });
  };

  const editStudent = (s: Student) => {
    setActiveMenu("murid");
    setEditingStudentId(s.id);
    setStudentForm({ name: s.name, nis: s.nis, className: s.className, parentName: s.parentName || "", parentId: s.parentId || "", userId: s.userId || "", nisn: s.nisn || "", gender: s.gender || "", birthPlace: s.birthPlace || "", birthDate: s.birthDate || "", religion: s.religion || "", previousSchool: s.previousSchool || "", address: s.address || "", district: s.district || "", city: s.city || "", province: s.province || "", fatherName: s.fatherName || "", motherName: s.motherName || "", fatherJob: s.fatherJob || "", motherJob: s.motherJob || "", parentAddressStreet: s.parentAddressStreet || "", parentAddressVillage: s.parentAddressVillage || "" });
  };

  const editParent = (parent: User) => {
    setActiveMenu("orangtua");
    setEditingUserId(parent.id);
    setShowPassword(false);
    setUserForm({ name: parent.name || "", username: parent.username, password: "", role: "orangtua", email: parent.email || "", phone: parent.phone || "" });
  };

  const editClass = (classRoom: ClassRoom) => {
    setActiveMenu("kelas");
    setEditingClassId(classRoom.id);
    setClassForm({ name: classRoom.name, homeroomTeacherId: classRoom.homeroomTeacherId || "", academicYear: classRoom.academicYear || "", semester: classRoom.semester || "" });
  };

  const cancelEdit = () => {
    setEditingUserId("");
    setEditingTeacherId("");
    setEditingStudentId("");
    setEditingClassId("");
    setUserForm(emptyUser);
    setShowPassword(false);
    setTeacherForm(emptyTeacher);
    setClassForm(emptyClass);
    setStudentForm({ name: "", nis: "", className: isWaliKelas ? allowedClasses[0] || db.student.className : "", parentName: "", parentId: "", userId: "", ...emptyStudentBiodata });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-white border border-slate-100 rounded-xl p-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1">
            <h3 className="text-sm font-black text-slate-900">Manajemen Data</h3>
            <p className="text-xs text-slate-500 font-medium">Pilih sub-menu, isi form, lalu kelola data lewat tabel edit, delete, dan enable/disable.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdminLike && (
              <>
                <MenuButton active={activeMenu === "user"} onClick={() => setActiveMenu("user")} label="Tambah User" />
                <MenuButton active={activeMenu === "guru"} onClick={() => setActiveMenu("guru")} label="Tambah Guru" />
                <MenuButton active={activeMenu === "kelas"} onClick={() => setActiveMenu("kelas")} label="Data Kelas" />
              </>
            )}
            {canManageParents && <MenuButton active={activeMenu === "orangtua"} onClick={() => setActiveMenu("orangtua")} label="Data Orang Tua" />}
            <MenuButton active={activeMenu === "murid"} onClick={() => setActiveMenu("murid")} label="Tambah Murid" />
          </div>
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

      {isAdminLike && activeMenu === "user" && (
        <form onSubmit={submitUser} className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-4">
          <SectionTitle icon={<Users className="w-4 h-4" />} title={editingUserId ? "Edit User" : "Tambah User"} description={canCreatePrivilegedRoles ? "Administrator dapat membuat semua role, termasuk Admin dan Administrator." : "Admin hanya dapat membuat role Wali Kelas, Guru, kepalasekolah, orangtua, dan Murid."} dark />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nama Lengkap User">
              <input required value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} placeholder="Nama lengkap" className="input-field" />
            </Field>
            <Field label="Role / Hak Akses">
              <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })} className="input-field">
                {availableRoleOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Username Login">
              <input required value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} placeholder="Username" className="input-field" />
            </Field>
            <Field label="Password Login">
              <div className="relative">
                <input required={!editingUserId} type={showPassword ? "text" : "password"} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingUserId ? "Kosongkan jika tidak diubah" : "Password awal"} className="input-field pr-10" autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <Field label="Email">
              <input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="Email" className="input-field" />
            </Field>
            <Field label="Nomor Kontak">
              <input value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} placeholder="Nomor kontak" className="input-field" />
            </Field>
          </div>
          <FormActions saving={saving} label={editingUserId ? "Update User" : "Simpan User"} editing={!!editingUserId} onCancel={cancelEdit} />
        </form>
      )}

      {isAdminLike && activeMenu === "guru" && (
        <form onSubmit={submitTeacher} className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-4">
          <SectionTitle icon={<Users className="w-4 h-4" />} title={editingTeacherId ? "Edit Guru" : "Tambah Guru"} description="Pilih jabatan sebagai Wali Kelas atau Kepala Sekolah. Kelas wali diambil dari database kelas." />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nama Guru">
              <input required value={teacherForm.name} onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })} placeholder="Nama guru" className="input-field" />
            </Field>
            <Field label="Jabatan">
              <select value={teacherForm.position} onChange={(e) => setTeacherForm({ ...teacherForm, position: e.target.value })} className="input-field">
                <option value="Wali Kelas">Wali Kelas</option>
                <option value="Guru">Guru</option>
                <option value="Kepala Sekolah">Kepala Sekolah</option>
              </select>
            </Field>
            <Field label="Kelas Wali">
              <select required={teacherForm.position === "Wali Kelas"} disabled={teacherForm.position !== "Wali Kelas"} value={teacherForm.position === "Wali Kelas" ? teacherForm.className : ""} onChange={(e) => setTeacherForm({ ...teacherForm, className: e.target.value })} className="input-field disabled:bg-slate-100">
                <option value="">{teacherForm.position === "Wali Kelas" ? "Pilih kelas wali" : "Tidak mengampu kelas"}</option>
                {allClasses.map((classRoom) => <option key={classRoom.id} value={classRoom.name}>{classRoom.name}</option>)}
              </select>
            </Field>
            <Field label="Nomor Induk Guru">
              <input required value={teacherForm.teacherNumber} onChange={(e) => setTeacherForm({ ...teacherForm, teacherNumber: e.target.value })} placeholder="Nomor Induk Guru" className="input-field" />
            </Field>
            <Field label="Nomor Kontak">
              <input required value={teacherForm.phone} onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })} placeholder="Nomor kontak" className="input-field" />
            </Field>
            <Field label="Lulusan">
              <input required value={teacherForm.graduate} onChange={(e) => setTeacherForm({ ...teacherForm, graduate: e.target.value })} placeholder="Lulusan, contoh: S1 Pendidikan IPA" className="input-field" />
            </Field>
            <Field label="Email">
              <input required value={teacherForm.email} onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })} placeholder="Email" className="input-field" />
            </Field>
            <Field label="Akun Login Guru">
              <select value={teacherForm.userId} onChange={(e) => setTeacherForm({ ...teacherForm, userId: e.target.value })} className="input-field">
                <option value="">Akun guru opsional</option>
                {teacherUsers.map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
              </select>
            </Field>
            <Field label="Alamat Lengkap" wide>
              <textarea required value={teacherForm.address} onChange={(e) => setTeacherForm({ ...teacherForm, address: e.target.value })} placeholder="Alamat lengkap" className="input-field min-h-20" />
            </Field>
          </div>
          <FormActions saving={saving} label={editingTeacherId ? "Update Guru" : "Simpan Guru"} editing={!!editingTeacherId} onCancel={cancelEdit} />
        </form>
      )}

      {isAdminLike && activeMenu === "kelas" && (
        <form onSubmit={submitClass} className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-4">
          <SectionTitle icon={<Building2 className="w-4 h-4" />} title={editingClassId ? "Edit Kelas" : "Tambah Kelas"} description="Kelas tersimpan di tabel classes. Perubahan nama kelas otomatis diterapkan pada data murid dan guru terkait." dark />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nama Kelas">
              <input required value={classForm.name} onChange={(e) => setClassForm({ ...classForm, name: e.target.value })} placeholder="Contoh: Kelas VII-C" className="input-field" />
            </Field>
            <Field label="Wali Kelas">
              <select value={classForm.homeroomTeacherId} onChange={(e) => setClassForm({ ...classForm, homeroomTeacherId: e.target.value })} className="input-field">
                <option value="">Belum ditentukan</option>
                {teacherUsers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name || teacher.username}</option>)}
              </select>
            </Field>
            <Field label="Tahun Ajaran">
              <input required value={classForm.academicYear} onChange={(e) => setClassForm({ ...classForm, academicYear: e.target.value })} placeholder="Contoh: 2025/2026" className="input-field" />
            </Field>
            <Field label="Semester">
              <select required value={classForm.semester} onChange={(e) => setClassForm({ ...classForm, semester: e.target.value })} className="input-field">
                <option value="">Pilih semester</option>
                <option value="Ganjil">Ganjil</option>
                <option value="Genap">Genap</option>
              </select>
            </Field>
          </div>
          <FormActions saving={saving} label={editingClassId ? "Update Kelas" : "Simpan Kelas"} editing={!!editingClassId} onCancel={cancelEdit} />
        </form>
      )}

      {canManageParents && activeMenu === "orangtua" && (
        <form onSubmit={submitParent} className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-4">
          <SectionTitle icon={<UserCheck className="w-4 h-4" />} title={editingUserId ? "Edit Orang Tua" : "Tambah Orang Tua"} description={isWaliKelas ? "Wali kelas dapat menambahkan akun orang tua lalu menghubungkannya melalui data murid kelas wali." : "Akun tersimpan sebagai user role orangtua. Hubungkan akun ke anak melalui menu Data Murid."} dark />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nama Orang Tua">
              <input required value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} placeholder="Nama lengkap orang tua" className="input-field" />
            </Field>
            <Field label="Username Login">
              <input required value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} placeholder="Username" className="input-field" />
            </Field>
            <Field label="Password Login">
              <div className="relative">
                <input required={!editingUserId} type={showPassword ? "text" : "password"} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingUserId ? "Kosongkan jika tidak diubah" : "Password awal"} className="input-field pr-10" autoComplete="new-password" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <Field label="Nomor Kontak">
              <input value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} placeholder="Nomor WhatsApp" className="input-field" />
            </Field>
            <Field label="Email">
              <input value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} placeholder="Email opsional" className="input-field" />
            </Field>
          </div>
          <FormActions saving={saving} label={editingUserId ? "Update Orang Tua" : "Simpan Orang Tua"} editing={!!editingUserId} onCancel={cancelEdit} />
        </form>
      )}

      {activeMenu === "murid" && (
        <div className="grid xl:grid-cols-[1.2fr_0.8fr] gap-4">
          <form onSubmit={submitStudent} className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-4">
            <SectionTitle icon={<GraduationCap className="w-4 h-4" />} title={editingStudentId ? "Edit Murid" : "Tambah Murid"} description={isWaliKelas ? "Wali kelas hanya bisa menambahkan murid ke kelas wali yang ditugaskan." : "Pilih kelas dari database kelas agar penamaan tetap konsisten."} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Nama Murid">
                <input required value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} placeholder="Nama murid" className="input-field" />
              </Field>
              <Field label="NIS / Nomor Induk Siswa">
                <input required value={studentForm.nis} onChange={(e) => setStudentForm({ ...studentForm, nis: e.target.value })} placeholder="NIS" className="input-field" />
              </Field>
              <Field label="Kelas Murid">
                <select required value={isWaliKelas ? allowedClasses[0] || studentForm.className : studentForm.className} onChange={(e) => setStudentForm({ ...studentForm, className: e.target.value })} className="input-field">
                  <option value="">Pilih kelas</option>
                  {(isWaliKelas ? allowedClasses : allClasses.map((classRoom) => classRoom.name)).map((className) => (
                    <option key={className} value={className}>{className}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nama Orang Tua">
                <select required value={studentForm.parentId} onChange={(e) => {
                  const parent = parentUsers.find((item) => item.id === e.target.value);
                  setStudentForm({ ...studentForm, parentId: e.target.value, parentName: parent?.name || parent?.username || "" });
                }} className="input-field">
                  <option value="">Pilih orang tua</option>
                  {parentUsers.map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
                </select>
              </Field>
              <Field label="Akun Login Murid">
                <select value={studentForm.userId} onChange={(e) => setStudentForm({ ...studentForm, userId: e.target.value })} className="input-field">
                  <option value="">Akun murid opsional</option>
                  {studentUsers.map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
                </select>
              </Field>
              <Field label="NISN">
                <input value={studentForm.nisn} onChange={(e) => setStudentForm({ ...studentForm, nisn: e.target.value })} placeholder="NISN" className="input-field" />
              </Field>
              <Field label="Jenis Kelamin">
                <select value={studentForm.gender} onChange={(e) => setStudentForm({ ...studentForm, gender: e.target.value })} className="input-field">
                  <option value="">Pilih jenis kelamin</option>
                  <option value="LAKI - LAKI">LAKI - LAKI</option>
                  <option value="PEREMPUAN">PEREMPUAN</option>
                </select>
              </Field>
              <Field label="Tempat Lahir">
                <input value={studentForm.birthPlace} onChange={(e) => setStudentForm({ ...studentForm, birthPlace: e.target.value })} placeholder="Tempat lahir" className="input-field" />
              </Field>
              <Field label="Tanggal Lahir">
                <input value={studentForm.birthDate} onChange={(e) => setStudentForm({ ...studentForm, birthDate: e.target.value })} placeholder="25 MARET 2014" className="input-field" />
              </Field>
              <Field label="Agama">
                <input value={studentForm.religion} onChange={(e) => setStudentForm({ ...studentForm, religion: e.target.value })} placeholder="Agama" className="input-field" />
              </Field>
              <Field label="Pendidikan Sebelumnya">
                <input value={studentForm.previousSchool} onChange={(e) => setStudentForm({ ...studentForm, previousSchool: e.target.value })} placeholder="TK/RA/PAUD" className="input-field" />
              </Field>
              <Field label="Alamat Peserta Didik">
                <input value={studentForm.address} onChange={(e) => setStudentForm({ ...studentForm, address: e.target.value })} placeholder="Alamat siswa" className="input-field" />
              </Field>
              <Field label="Kec/Kab/Prov Siswa">
                <input value={[studentForm.district, studentForm.city, studentForm.province].filter(Boolean).join(" / ")} onChange={(e) => {
                  const [district = "", city = "", province = ""] = e.target.value.split("/").map((item) => item.trim());
                  setStudentForm({ ...studentForm, district, city, province });
                }} placeholder="Kec / Kab / Prov" className="input-field" />
              </Field>
              <Field label="Nama Ayah">
                <input value={studentForm.fatherName} onChange={(e) => setStudentForm({ ...studentForm, fatherName: e.target.value })} placeholder="Nama ayah" className="input-field" />
              </Field>
              <Field label="Nama Ibu">
                <input value={studentForm.motherName} onChange={(e) => setStudentForm({ ...studentForm, motherName: e.target.value })} placeholder="Nama ibu" className="input-field" />
              </Field>
              <Field label="Pekerjaan Ayah">
                <input value={studentForm.fatherJob} onChange={(e) => setStudentForm({ ...studentForm, fatherJob: e.target.value })} placeholder="Pekerjaan ayah" className="input-field" />
              </Field>
              <Field label="Pekerjaan Ibu">
                <input value={studentForm.motherJob} onChange={(e) => setStudentForm({ ...studentForm, motherJob: e.target.value })} placeholder="Pekerjaan ibu" className="input-field" />
              </Field>
              <Field label="Alamat Orang Tua">
                <input value={studentForm.parentAddressStreet} onChange={(e) => setStudentForm({ ...studentForm, parentAddressStreet: e.target.value })} placeholder="Jalan/dusun" className="input-field" />
              </Field>
              <Field label="Desa Orang Tua">
                <input value={studentForm.parentAddressVillage} onChange={(e) => setStudentForm({ ...studentForm, parentAddressVillage: e.target.value })} placeholder="Kelurahan/desa" className="input-field" />
              </Field>
            </div>
            <FormActions saving={saving} label={editingStudentId ? "Update Murid" : "Simpan Murid"} editing={!!editingStudentId} onCancel={cancelEdit} emerald />
          </form>

          <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-4">
            <SectionTitle icon={<FileSpreadsheet className="w-4 h-4" />} title="Upload Excel Murid" description="Format biodata Excel dibaca dari kolom NIS, NISN, L/P, tempat lahir, tanggal lahir, alamat, dan orang tua." />
            <div className="grid gap-3">
              <Field label="Kelas Tujuan">
                <select required value={isWaliKelas ? allowedClasses[0] || studentImportClass : studentImportClass} onChange={(e) => setStudentImportClass(e.target.value)} className="input-field">
                  <option value="">Pilih kelas</option>
                  {(isWaliKelas ? allowedClasses : allClasses.map((classRoom) => classRoom.name)).map((className) => (
                    <option key={className} value={className}>{className}</option>
                  ))}
                </select>
              </Field>
              <Field label="File Excel">
                <input type="file" accept=".xlsx,.xls" onChange={(e) => setStudentImportFile(e.target.files?.[0] || null)} className="input-field" />
              </Field>
              <div className="grid sm:grid-cols-2 gap-2">
                <a href="/uploads/files/format_import_murid_sikowali.xlsx" download className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-sky-50 text-sky-700 text-xs font-black hover:bg-sky-100">
                  <FileSpreadsheet className="w-4 h-4" /> Contoh Format
                </a>
                <button type="button" disabled={saving || !studentImportFile} onClick={importStudentsFromExcel} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-slate-900 text-white text-xs font-black hover:bg-slate-800 disabled:opacity-50">
                  <Upload className="w-4 h-4" /> Upload Murid
                </button>
              </div>
              {studentImportResult && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600">
                  <p className="font-black text-slate-800">Terbaca {studentImportResult.totalRows} baris, valid {studentImportResult.validRows}, baru {studentImportResult.created || 0}, update {studentImportResult.updated || 0}.</p>
                  {studentImportResult.errors.length > 0 && (
                    <ul className="mt-2 max-h-32 overflow-y-auto space-y-1 font-semibold text-red-600">
                      {studentImportResult.errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isAdminLike && activeMenu === "registrasi" && (
        <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm space-y-4">
          <SectionTitle icon={<UserCheck className="w-4 h-4" />} title="Verifikasi Pendaftaran Orang Tua" description="Cocokkan NIS, nama anak, dan kelas sebelum menyetujui akun. Persetujuan diblokir jika anak sudah terhubung dengan akun orang tua." dark />
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full min-w-[920px] text-left text-xs text-slate-700 border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-3">Orang Tua</th>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Kontak</th>
                  <th className="px-4 py-3">NIS Anak</th>
                  <th className="px-4 py-3">Nama Anak</th>
                  <th className="px-4 py-3">Kelas</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parentRegistrations.length ? parentRegistrations.map((registration) => {
                  const linkedParent = getLinkedParent(registration);
                  return (
                  <tr key={registration.id}>
                    <td className="px-4 py-3 font-bold text-slate-800">{registration.name}</td>
                    <td className="px-4 py-3">{registration.username}</td>
                    <td className="px-4 py-3">{registration.phone}<span className="block text-[10px] text-slate-400">{registration.email || "-"}</span></td>
                    <td className="px-4 py-3">{registration.studentNis}</td>
                    <td className="px-4 py-3">
                      {registration.studentName}
                      {linkedParent && <span className="block mt-1 text-[10px] font-bold text-red-600">Terhubung: {linkedParent.name || linkedParent.username}</span>}
                    </td>
                    <td className="px-4 py-3">{registration.className}</td>
                    <td className="px-4 py-3"><RegistrationStatus status={registration.status} /></td>
                    <td className="px-4 py-3">
                      {registration.status === "pending" ? (
                        <div className="flex gap-1.5">
                          <button type="button" disabled={saving || !!linkedParent} title={linkedParent ? "Siswa sudah terhubung dengan akun orang tua. Persetujuan diblokir." : undefined} onClick={() => reviewRegistration(registration, "approve")} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold hover:bg-emerald-100 disabled:opacity-50"><CheckCircle className="w-3.5 h-3.5" />Approve</button>
                          <button type="button" disabled={saving} onClick={() => reviewRegistration(registration, "reject")} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-50 text-red-700 font-bold hover:bg-red-100 disabled:opacity-50"><X className="w-3.5 h-3.5" />Reject</button>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400">Sudah diproses</span>
                      )}
                    </td>
                  </tr>
                  );
                }) : (
                  <tr><td colSpan={8} className="px-4 py-8 text-center font-bold text-slate-400">Belum ada pengajuan pendaftaran orang tua.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isAdminLike && activeMenu === "user" && (
        <DataTable title="Data User" headers={["Nama", "Username", "Role", "Kontak", "Status", "Aksi"]} totalItems={allUsers.length} currentPage={currentUserPage} pageSize={pageSize} onPageChange={setUserPage}>
          {paginatedUsers.map((u) => (
            <tr key={u.id}>
              <td className="px-4 py-3 font-bold text-slate-800">{u.name || "-"}</td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <span>{u.username}</span>
                  <span className="inline-flex w-fit items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-500">
                    <KeyRound className="w-3 h-3" />
                    Password tersembunyi
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">{roleOptions.find((r) => r.value === u.role)?.label || u.role}</td>
              <td className="px-4 py-3">{u.email || u.phone || "-"}</td>
              <td className="px-4 py-3"><Status enabled={u.enabled !== false} /></td>
              <td className="px-4 py-3">
                {!canCreatePrivilegedRoles && ["Admin", "Administrator"].includes(u.role) ? (
                  <span className="text-[10px] font-black text-slate-400 uppercase">Terkunci</span>
                ) : (
                  <RowActions enabled={u.enabled !== false} onEdit={() => editUser(u)} onToggle={() => callJson(`/api/admin/users/${u.id}/enabled`, "PATCH", { enabled: u.enabled === false }, "Status user berhasil diubah.")} onDelete={() => callJson(`/api/admin/users/${u.id}`, "DELETE", null, "User berhasil dihapus.")} />
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      {isAdminLike && activeMenu === "guru" && (
        <DataTable title="Data Guru" headers={["Nama", "Jabatan", "Kelas Wali", "NIG", "Kontak", "Status", "Aksi"]} totalItems={allTeachers.length} currentPage={currentTeacherPage} pageSize={pageSize} onPageChange={setTeacherPage}>
          {paginatedTeachers.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 font-bold text-slate-800">{t.name}</td>
              <td className="px-4 py-3">{t.position}</td>
              <td className="px-4 py-3">{t.className}</td>
              <td className="px-4 py-3">{t.teacherNumber}</td>
              <td className="px-4 py-3">{t.phone}</td>
              <td className="px-4 py-3"><Status enabled={t.enabled !== false} /></td>
              <td className="px-4 py-3"><RowActions enabled={t.enabled !== false} onEdit={() => editTeacher(t)} onToggle={() => callJson(`/api/admin/teachers/${t.id}/enabled`, "PATCH", { enabled: t.enabled === false }, "Status guru berhasil diubah.")} onDelete={() => callJson(`/api/admin/teachers/${t.id}`, "DELETE", null, "Guru berhasil dihapus.")} /></td>
            </tr>
          ))}
        </DataTable>
      )}

      {isAdminLike && activeMenu === "kelas" && (
        <DataTable title="Database Kelas" headers={["Nama Kelas", "Tahun Ajaran", "Semester", "Wali Kelas", "Jumlah Murid", "Aksi"]} totalItems={allClasses.length} currentPage={currentClassPage} pageSize={pageSize} onPageChange={setClassPage}>
          {paginatedClasses.map((classRoom) => {
            const homeroom = teacherUsers.find((teacher) => teacher.id === classRoom.homeroomTeacherId);
            const studentCount = (db.students || []).filter((student) => student.className === classRoom.name).length;
            return (
              <tr key={classRoom.id}>
                <td className="px-4 py-3 font-bold text-slate-800">{classRoom.name}</td>
                <td className="px-4 py-3">{classRoom.academicYear || "-"}</td>
                <td className="px-4 py-3">{classRoom.semester || "-"}</td>
                <td className="px-4 py-3">{homeroom?.name || homeroom?.username || "-"}</td>
                <td className="px-4 py-3">{studentCount}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => editClass(classRoom)} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"><Edit3 className="w-3.5 h-3.5" />Edit</button>
                    <button type="button" onClick={() => callJson(`/api/admin/classes/${classRoom.id}`, "DELETE", null, "Kelas berhasil dihapus.")} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-50 text-red-700 font-bold hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" />Delete</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {canManageParents && activeMenu === "orangtua" && (
        <DataTable title="Database Orang Tua" headers={["Nama", "Username", "Kontak", "Anak Terhubung", "Status", "Aksi"]} totalItems={parentUsers.length} currentPage={currentParentPage} pageSize={pageSize} onPageChange={setParentPage}>
          {paginatedParents.map((parent) => {
            const linkedStudents = (db.students || []).filter((student) => student.parentId === parent.id);
            return (
              <tr key={parent.id}>
                <td className="px-4 py-3 font-bold text-slate-800">{parent.name || "-"}</td>
                <td className="px-4 py-3">{parent.username}<span className="block text-[10px] font-bold text-slate-400">Password tersembunyi</span></td>
                <td className="px-4 py-3">{parent.phone || parent.email || "-"}</td>
                <td className="px-4 py-3">{linkedStudents.length ? linkedStudents.map((student) => student.name).join(", ") : "-"}</td>
                <td className="px-4 py-3"><Status enabled={parent.enabled !== false} /></td>
                <td className="px-4 py-3"><RowActions enabled={parent.enabled !== false} onEdit={() => editParent(parent)} onToggle={() => callJson(`/api/admin/users/${parent.id}/enabled`, "PATCH", { enabled: parent.enabled === false }, "Status orang tua berhasil diubah.")} onDelete={() => callJson(`/api/admin/users/${parent.id}`, "DELETE", null, "Akun orang tua berhasil dihapus.")} /></td>
              </tr>
            );
          })}
        </DataTable>
      )}

      {activeMenu === "murid" && (
        <DataTable title={isAdminLike ? "Data Murid" : "Murid Dalam Kelas Wali"} headers={["Nama", "NIS/NISN", "Kelas", "Orang Tua", "Status", "Aksi"]} totalItems={studentsForTable.length} currentPage={currentStudentPage} pageSize={pageSize} onPageChange={setStudentPage}>
          {paginatedStudents.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3 font-bold text-slate-800">{s.name}</td>
              <td className="px-4 py-3">{s.nis}<span className="block text-[10px] font-bold text-slate-400">{s.nisn || "-"}</span></td>
              <td className="px-4 py-3">{s.className}</td>
              <td className="px-4 py-3">{s.parentName || "-"}</td>
              <td className="px-4 py-3"><Status enabled={s.enabled !== false} /></td>
              <td className="px-4 py-3"><RowActions enabled={s.enabled !== false} onEdit={() => editStudent(s)} onToggle={() => callJson(`/api/admin/students/${s.id}/enabled`, "PATCH", { enabled: s.enabled === false }, "Status murid berhasil diubah.")} onDelete={() => callJson(`/api/admin/students/${s.id}`, "DELETE", null, "Murid berhasil dihapus.")} /></td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}

function MenuButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all ${active ? "bg-slate-900 text-white border-slate-900" : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"}`}>
      {label}
    </button>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Gagal membaca file Excel."));
    reader.readAsDataURL(file);
  });
}

function SectionTitle({ icon, title, description, dark = false }: { icon: React.ReactNode; title: string; description: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
      <span className={`p-2 rounded-xl ${dark ? "bg-slate-900 text-white" : "bg-emerald-500 text-slate-950"}`}>{icon}</span>
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`space-y-1.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function FormActions({ saving, label, editing, onCancel, emerald = false }: { saving: boolean; label: string; editing: boolean; onCancel: () => void; emerald?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={saving} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 ${emerald ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400" : "bg-slate-900 text-white hover:bg-slate-800"}`}>
        <Save className="w-4 h-4" />
        {saving ? "Menyimpan..." : label}
      </button>
      {editing && (
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">
          <X className="w-4 h-4" />
          Batal Edit
        </button>
      )}
    </div>
  );
}

function Status({ enabled }: { enabled: boolean }) {
  return <span className={`px-2 py-1 rounded-md text-[10px] font-black ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{enabled ? "Enable" : "Disable"}</span>;
}

function RegistrationStatus({ status }: { status: ParentRegistration["status"] }) {
  const className = status === "approved" ? "bg-emerald-50 text-emerald-700" : status === "rejected" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";
  const label = status === "approved" ? "Approved" : status === "rejected" ? "Rejected" : "Pending";
  return <span className={`px-2 py-1 rounded-md text-[10px] font-black ${className}`}>{label}</span>;
}

function RowActions({ enabled, onEdit, onToggle, onDelete }: { enabled: boolean; onEdit: () => void; onToggle: () => void; onDelete: () => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"><Edit3 className="w-3.5 h-3.5" />Edit</button>
      <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-amber-50 text-amber-700 font-bold hover:bg-amber-100"><Power className="w-3.5 h-3.5" />{enabled ? "Disable" : "Enable"}</button>
      <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-red-50 text-red-700 font-bold hover:bg-red-100"><Trash2 className="w-3.5 h-3.5" />Delete</button>
    </div>
  );
}

function getPageCount(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

function paginate<T>(items: T[], currentPage: number, pageSize: number) {
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function DataTable({
  title,
  headers,
  children,
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
}: {
  title: string;
  headers: string[];
  children: React.ReactNode;
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = getPageCount(totalItems, pageSize);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500 font-medium">
            Menampilkan {startItem}-{endItem} dari {totalItems} data. Maksimal 10 data per halaman.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
          >
            Sebelumnya
          </button>
          <span className="px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-black">
            {currentPage}/{totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
          >
            Berikutnya
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
            <tr>{headers.map((h) => <th key={h} className="text-left px-4 py-3 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}
