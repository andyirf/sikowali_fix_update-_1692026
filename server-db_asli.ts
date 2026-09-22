import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import mysql from "mysql2/promise";
import {
  Announcement,
  AIChatQuota,
  AttendanceRecord,
  AttendanceDailyRecord,
  BehaviourLog,
  ChatbotBackup,
  ClassRoom,
  Role,
  AISettings,
  AccessMatrixRow,
  CrudPermission,
  PortalNotification,
  ParentingArticle,
  ParentRegistration,
  SchoolSettings,
  SIKOWALIDatabase,
  Student,
  StudentScoreDetail,
  Teacher,
  SubjectScore,
  User,
} from "./src/types.js";

let DB_NAME = "SIKOWALI";
const PASSWORD_HASH_PREFIX = "pbkdf2";
const PASSWORD_ITERATIONS = 310000;
const DEFAULT_SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || randomBytes(18).toString("base64url");

let pool: mysql.Pool | null = null;
let isDbActive = false;
const memoryAIChatUsage = new Map<string, number>();

function isPasswordHash(value = "") {
  return value.startsWith(`${PASSWORD_HASH_PREFIX}$`);
}

function isMd5Hash(value = "") {
  return /^[a-f0-9]{32}$/i.test(value);
}

function md5Password(password: string) {
  return createHash("md5").update(password).digest("hex");
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, 32, "sha256").toString("base64url");
  return `${PASSWORD_HASH_PREFIX}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

function verifyPassword(password: string, stored: string) {
  if (isMd5Hash(stored)) return md5Password(password) === stored.toLowerCase();
  if (!isPasswordHash(stored)) return password === stored;
  const [, iterationsRaw, salt, expectedHash] = stored.split("$");
  const iterations = Number(iterationsRaw);
  if (!iterations || !salt || !expectedHash) return false;
  const actual = Buffer.from(pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64url"));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const DEFAULT_CLASSES: ClassRoom[] = [
  { id: "c_vii_a", name: "Kelas VII-A", homeroomTeacherId: "u_guru", academicYear: "2025/2026", semester: "Genap" },
  { id: "c_vii_b", name: "Kelas VII-B", homeroomTeacherId: "u_guru2", academicYear: "2025/2026", semester: "Genap" },
];

const DEFAULT_USERS: User[] = [
  { id: "u_administrator", username: "administrator", password: DEFAULT_SEED_PASSWORD, role: "Administrator", name: "Administrator SIKOWALI" },
  { id: "u_admin", username: "admin", password: DEFAULT_SEED_PASSWORD, role: "Admin", name: "Admin SIKOWALI" },
  { id: "u_kepala", username: "kepala", password: DEFAULT_SEED_PASSWORD, role: "kepalasekolah", name: "Drs. Kepala Sekolah" },
  { id: "u_guru", username: "guru", password: DEFAULT_SEED_PASSWORD, role: "WaliKelas", name: "Ibu Safitri, M.Pd" },
  { id: "u_guru2", username: "guru2", password: DEFAULT_SEED_PASSWORD, role: "WaliKelas", name: "Pak Wahyu, S.Pd" },
  { id: "u_ortu", username: "ortu", password: DEFAULT_SEED_PASSWORD, role: "orangtua", name: "Budi Santoso" },
  { id: "u_ortu2", username: "ortu2", password: DEFAULT_SEED_PASSWORD, role: "orangtua", name: "Sri Wahyuni" },
  { id: "u_murid", username: "murid", password: DEFAULT_SEED_PASSWORD, role: "Murid", name: "Ahmad Budi Santoso" },
  { id: "u_murid2", username: "murid2", password: DEFAULT_SEED_PASSWORD, role: "Murid", name: "Nadia Putri Lestari" },
];

const DEFAULT_STUDENTS: Student[] = [
  { id: "20240012", name: "Ahmad Budi Santoso", className: "Kelas VII-A", nis: "20240012", parentName: "Budi Santoso", parentId: "u_ortu", userId: "u_murid" },
  { id: "20240013", name: "Nadia Putri Lestari", className: "Kelas VII-A", nis: "20240013", parentName: "Sri Wahyuni", parentId: "u_ortu2", userId: "u_murid2" },
  { id: "20240021", name: "Rafi Ramadhan", className: "Kelas VII-B", nis: "20240021", parentName: "Sri Wahyuni", parentId: "u_ortu2" },
];

const DEFAULT_TEACHERS: Teacher[] = [
  { id: "t_guru", name: "Ibu Safitri, M.Pd", className: "Kelas VII-A", position: "Wali Kelas", teacherNumber: "NIG-2024-001", phone: "0812-1000-2001", graduate: "S2 Pendidikan Matematika", address: "Jl. Pendidikan No. 1", email: "safitri@sikowali.sch.id", userId: "u_guru" },
  { id: "t_guru2", name: "Pak Wahyu, S.Pd", className: "Kelas VII-B", position: "Wali Kelas", teacherNumber: "NIG-2024-002", phone: "0812-1000-2002", graduate: "S1 Pendidikan Bahasa Indonesia", address: "Jl. Guru No. 2", email: "wahyu@sikowali.sch.id", userId: "u_guru2" },
];

const DEFAULT_SCHOOL_SETTINGS: SchoolSettings = {
  id: "default",
  name: "SMP SIKOWALI Nusantara",
  npsn: "00000000",
  level: "SMP/MTs",
  status: "Swasta",
  address: "Jl. Pendidikan No. 1",
  city: "Kota Pendidikan",
  province: "Indonesia",
  phone: "021-0000-0000",
  email: "admin@sikowali.sch.id",
  website: "https://sikowali.sch.id",
  principalName: "Drs. Kepala Sekolah",
  academicYear: "2025/2026",
  semester: "Genap",
  logoUrl: "",
};

const DEFAULT_SCORES: SubjectScore[] = [
  { subject: "Matematika", kkm: 75, tugas: 75, uh1: 82, uh2: 78, uts: 80, uas: 85, rataRata: 81 },
  { subject: "Bahasa Indonesia", kkm: 75, tugas: 88, uh1: 90, uh2: 86, uts: 89, uas: 88, rataRata: 88 },
  { subject: "IPA", kkm: 75, tugas: 70, uh1: 76, uh2: 68, uts: 72, uas: 74, rataRata: 72 },
  { subject: "IPS", kkm: 75, tugas: 85, uh1: 88, uh2: 84, uts: 87, uas: 86, rataRata: 86 },
  { subject: "Bahasa Inggris", kkm: 75, tugas: 79, uh1: 81, uh2: 78, uts: 82, uas: 82, rataRata: 80 },
  { subject: "Pendidikan Agama", kkm: 75, tugas: 85, uh1: 90, uh2: 88, uts: 85, uas: 92, rataRata: 88 },
  { subject: "PJOK", kkm: 75, tugas: 80, uh1: 85, uh2: 82, uts: 85, uas: 88, rataRata: 84 },
  { subject: "Seni Budaya", kkm: 75, tugas: 90, uh1: 92, uh2: 88, uts: 90, uas: 95, rataRata: 91 },
];

const DEFAULT_ATTENDANCE: AttendanceRecord[] = [
  { month: "Juli", hadir: 20, sakit: 0, izin: 0, alpha: 0, persentase: 100 },
  { month: "Agustus", hadir: 18, sakit: 1, izin: 1, alpha: 0, persentase: 90 },
  { month: "September", hadir: 21, sakit: 0, izin: 1, alpha: 0, persentase: 95 },
  { month: "Oktober", hadir: 22, sakit: 0, izin: 0, alpha: 0, persentase: 100 },
  { month: "November", hadir: 19, sakit: 1, izin: 0, alpha: 1, persentase: 90 },
  { month: "Desember", hadir: 13, sakit: 2, izin: 0, alpha: 0, persentase: 86 },
];

const MONTH_NAMES_ID = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function monthNameFromDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return MONTH_NAMES_ID[parsed.getMonth()] || date.slice(0, 7);
}

function aggregateDailyAttendance(records: AttendanceDailyRecord[]): AttendanceRecord[] {
  const byMonth = new Map<string, AttendanceRecord>();
  for (const record of records) {
    const month = monthNameFromDate(record.date);
    const current = byMonth.get(month) || { month, hadir: 0, sakit: 0, izin: 0, alpha: 0, persentase: 0 };
    current[record.status] += 1;
    const total = current.hadir + current.sakit + current.izin + current.alpha;
    current.persentase = total > 0 ? Math.round((current.hadir / total) * 100) : 0;
    byMonth.set(month, current);
  }
  return Array.from(byMonth.values()).sort((a, b) => MONTH_NAMES_ID.indexOf(a.month) - MONTH_NAMES_ID.indexOf(b.month));
}

const ACCESS_FEATURES = [
  { id: "beranda", feature: "Beranda", category: "Utama" },
  { id: "manajemen", feature: "Manajemen Data", category: "Admin" },
  { id: "tambah_user", feature: "Tambah User", category: "Admin" },
  { id: "tambah_guru", feature: "Tambah Guru", category: "Admin" },
  { id: "tambah_murid", feature: "Tambah Murid", category: "Admin/Guru" },
  { id: "data_sekolah", feature: "Data Sekolah", category: "Admin" },
  { id: "setting_ai", feature: "Setting AI", category: "Admin" },
  { id: "input_nilai", feature: "Input Nilai", category: "Guru" },
  { id: "input_absensi", feature: "Input Absensi", category: "Guru" },
  { id: "rekap_semester", feature: "Rekap Semester", category: "Guru" },
  { id: "rapor", feature: "Nilai & Rapor", category: "Informasi Anak" },
  { id: "absensi", feature: "Absensi", category: "Informasi Anak" },
  { id: "catatan", feature: "Catatan Perilaku", category: "Informasi Anak" },
  { id: "karya", feature: "Dokumentasi & Karya", category: "Informasi Anak" },
  { id: "ai_komunikasi", feature: "AI & Komunikasi", category: "AI" },
  { id: "backup_chatbot", feature: "Backup Chatbot AI", category: "AI" },
  { id: "parenting", feature: "Ruang Parenting", category: "AI & Komunikasi" },
  { id: "pengumuman", feature: "Pengumuman", category: "Komunikasi" },
  { id: "profil", feature: "Profil Saya", category: "Akun" },
  { id: "kredensial_admin", feature: "Ubah Kredensial Admin", category: "Akun" },
];

const ALL_ROLES: Role[] = ["Administrator", "Admin", "WaliKelas", "Guru", "kepalasekolah", "orangtua", "Murid"];

function defaultCrud(featureId: string, role: Role): CrudPermission {
  const none = { create: false, read: false, update: false, delete: false };
  const read = { create: false, read: true, update: false, delete: false };
  const crud = { create: true, read: true, update: true, delete: true };
  if (role === "Administrator") {
    if (["manajemen", "tambah_user", "tambah_guru", "tambah_murid", "data_sekolah", "setting_ai", "kredensial_admin", "backup_chatbot"].includes(featureId)) return crud;
    if (featureId === "parenting") return crud;
    return read;
  }
  if (role === "Admin") {
    if (["manajemen", "tambah_user", "tambah_guru", "tambah_murid", "data_sekolah", "parenting", "backup_chatbot"].includes(featureId)) return crud;
    return read;
  }
  if (role === "WaliKelas") {
    if (["manajemen", "tambah_murid", "input_nilai", "input_absensi", "rekap_semester", "karya", "pengumuman", "parenting", "backup_chatbot"].includes(featureId)) return crud;
    if (["beranda", "rapor", "absensi", "catatan", "ai_komunikasi", "profil"].includes(featureId)) return read;
  }
  if (role === "Guru" || role === "kepalasekolah") {
    if (featureId === "parenting") return crud;
    if (["beranda", "rapor", "absensi", "catatan", "karya", "ai_komunikasi", "profil"].includes(featureId)) return read;
  }
  if (role === "orangtua") {
    if (["beranda", "rapor", "absensi", "catatan", "karya", "ai_komunikasi", "pengumuman", "parenting", "profil"].includes(featureId)) return read;
  }
  if (role === "Murid") {
    if (["beranda", "rapor", "absensi", "karya", "ai_komunikasi", "pengumuman", "profil"].includes(featureId)) return read;
  }
  return none;
}

let IN_MEMORY_DB: SIKOWALIDatabase = {
  currentUser: DEFAULT_USERS[4],
  student: DEFAULT_STUDENTS[0],
  students: DEFAULT_STUDENTS,
  teachers: DEFAULT_TEACHERS,
  schoolSettings: DEFAULT_SCHOOL_SETTINGS,
  visibleStudents: DEFAULT_STUDENTS.filter((s) => s.parentId === "u_ortu"),
  classes: DEFAULT_CLASSES,
  selectedClassName: "Kelas VII-A",
  scores: DEFAULT_SCORES,
  attendance: DEFAULT_ATTENDANCE,
  attendanceDaily: [],
  behaviour: [
    { id: "b1", type: "Positif", title: "Aktif bertanya & membantu teman", description: "Ahmad aktif bertanya selama pelajaran matematika dan membantu temannya memahami aljabar.", teacher: "Pak Wahyu", date: "2024-11-10", sourcePortal: "Portal Guru" },
    { id: "b2", type: "Perlu Perhatian", title: "Terlambat masuk kelas 10 menit", description: "Ahmad terlambat masuk ruang kelas setelah istirahat pertama tanpa keterangan yang jelas.", teacher: "Pak Wahyu", date: "2024-11-08", sourcePortal: "Portal Guru" },
    { id: "b3", type: "Prestasi", title: "Memenangkan lomba cerdas cermat IPS", description: "Berhasil meraih Juara 1 tingkat sekolah dalam Kompetisi Cerdas Cermat IPS terpadu.", teacher: "Bu Safitri", date: "2024-10-25", sourcePortal: "Portal Guru" },
  ],
  karya: [
    { id: "k1", title: "Pameran Seni Budaya", category: "Seni Rupa", date: "2024-11-12", description: "Karya miniatur patung tanah liat mendapat penilaian istimewa.", imageUrl: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=500&auto=format&fit=crop&q=60", comments: [] },
    { id: "k2", title: "Praktikum IPA Ekosistem", category: "Sains", date: "2024-10-15", description: "Laporan analisis ekosistem air tawar buatan dalam wadah akuaponik mini.", imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=500&auto=format&fit=crop&q=60", comments: [] },
  ],
  announcements: [
    { id: "a1", title: "Jadwal UTS Semester 2", content: "UTS Semester 2 tahun ajaran 2025/2026 akan dilaksanakan pada 15 - 20 Januari 2025.", author: "Kepala Sekolah", date: "2024-12-01", isImportant: true, category: "Akademik" },
    { id: "a2", title: "Rapat Wali Murid Rutin", content: "Rapat koordinasi perkembangan belajar siswa dilaksanakan Sabtu, 14 Desember jam 09:00 WIB.", author: "Humas Sekolah", date: "2024-11-28", isImportant: true, category: "Umum" },
  ],
  parenting: [
    { id: "p1", title: "Cara Mencegah dan Mengatasi Bullying", category: "Keamanan Anak", summary: "Kenali gejala dini dan langkah preventif terbaik.", content: "Bangun komunikasi terbuka di rumah agar anak aman bercerita tanpa stigma.", author: "Dra. Setyowati, M.Psi", imageUrl: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=500&auto=format&fit=crop&q=60" },
    { id: "p2", title: "Mendisiplinkan Anak Tanpa Kekerasan", category: "Pola Asuh", summary: "Membentuk kebiasaan regulasi diri jangka panjang.", content: "Gunakan konsekuensi logis dan kesepakatan tertulis bersama anak.", author: "Faisal Rahman, S.Psi", imageUrl: "https://images.unsplash.com/photo-1484981138541-3d074aa97716?w=500&auto=format&fit=crop&q=60" },
  ],
  feedback: [
    { id: "f1", author: "Budi Santoso", type: "Positif", content: "Pelayanan guru sangat responsif dalam memonitor tumbuh kembang belajar anak.", date: "2024-11-10", likes: 8, comments: [] },
  ],
  chatbotBackups: [],
  parentRegistrations: [],
  users: DEFAULT_USERS,
};

function dbConfig() {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || process.env.DB_POrt || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    waitForConnections: true,
    connectionLimit: 10,
    charset: "utf8mb4",
  };
}

function validateProductionDatabaseConfig() {
  if (process.env.NODE_ENV !== "production") return;
  const user = process.env.DB_USER || "";
  const password = process.env.DB_PASSWORD || "";
  const appUrl = process.env.APP_URL || "";
  const database = process.env.DB_DATABASE || "";
  const insecureProblems = [
    !user && "DB_USER wajib diisi di production.",
    user === "root" && "DB_USER production tidak boleh memakai root.",
    !password && "DB_PASSWORD wajib diisi di production.",
    password === "bebexterbang" && "DB_PASSWORD production masih memakai password lokal lama.",
    !database && "DB_DATABASE wajib diisi di production.",
    !appUrl && "APP_URL wajib diisi di production untuk proteksi origin/CSRF.",
    appUrl.startsWith("http://localhost") && "APP_URL production tidak boleh memakai localhost.",
  ].filter(Boolean);

  if (insecureProblems.length) {
    throw new Error(`Konfigurasi production belum aman: ${insecureProblems.join(" ")}`);
  }
}

export async function initializeDatabase() {
  try {
    validateProductionDatabaseConfig();
    DB_NAME = process.env.DB_DATABASE || "SIKOWALI";
    const base = dbConfig();
    if (process.env.NODE_ENV !== "production") {
      const bootstrap = await mysql.createConnection(base);
      await bootstrap.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await bootstrap.end();
    }

    pool = mysql.createPool({ ...base, database: DB_NAME });
    await pool.query("SELECT 1");
    isDbActive = true;
    await setupSchema();
    console.log(`Connected to MySQL/MariaDB database ${DB_NAME}.`);
  } catch (err: any) {
    if (process.env.NODE_ENV === "production") {
      throw err;
    }
    console.error("Failed to connect MySQL/MariaDB. Falling back to memory mode.", err?.message || err);
    pool = null;
    isDbActive = false;
  }
}

async function setupSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(50) PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role ENUM('orangtua','WaliKelas','Guru','kepalasekolah','Admin','Administrator','Murid') NOT NULL,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(150) NULL,
      phone VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query("ALTER TABLE users MODIFY password VARCHAR(255) NOT NULL").catch(() => undefined);
  await migrateRoleEnum();
  await ensureColumn("users", "enabled", "BOOLEAN DEFAULT TRUE");
  await ensureColumn("users", "photo_url", "LONGTEXT NULL");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parent_registrations (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      username VARCHAR(100) NOT NULL,
      password VARCHAR(255) NOT NULL,
      email VARCHAR(150) NULL,
      phone VARCHAR(50) NOT NULL,
      student_nis VARCHAR(50) NOT NULL,
      student_name VARCHAR(150) NOT NULL,
      class_name VARCHAR(80) NOT NULL,
      status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP NULL,
      reviewed_by VARCHAR(50) NULL,
      UNIQUE KEY uniq_parent_registration_username (username),
      INDEX idx_parent_registration_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS classes (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(80) UNIQUE NOT NULL,
      academic_year VARCHAR(30) NULL,
      semester VARCHAR(30) NULL,
      homeroom_teacher_id VARCHAR(50) NULL,
      FOREIGN KEY (homeroom_teacher_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn("classes", "academic_year", "VARCHAR(30) NULL");
  await ensureColumn("classes", "semester", "VARCHAR(30) NULL");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      class_name VARCHAR(80) NOT NULL,
      nis VARCHAR(50) UNIQUE NOT NULL,
      parent_name VARCHAR(150) NULL,
      parent_id VARCHAR(50) NULL,
      user_id VARCHAR(50) NULL,
      FOREIGN KEY (parent_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn("students", "parent_name", "VARCHAR(150) NULL");
  await ensureColumn("students", "enabled", "BOOLEAN DEFAULT TRUE");
  await ensureColumn("students", "nisn", "VARCHAR(50) NULL");
  await ensureColumn("students", "gender", "VARCHAR(30) NULL");
  await ensureColumn("students", "birth_place", "VARCHAR(150) NULL");
  await ensureColumn("students", "birth_date", "VARCHAR(80) NULL");
  await ensureColumn("students", "religion", "VARCHAR(80) NULL");
  await ensureColumn("students", "previous_school", "VARCHAR(150) NULL");
  await ensureColumn("students", "address", "TEXT NULL");
  await ensureColumn("students", "district", "VARCHAR(120) NULL");
  await ensureColumn("students", "city", "VARCHAR(120) NULL");
  await ensureColumn("students", "province", "VARCHAR(120) NULL");
  await ensureColumn("students", "father_name", "VARCHAR(150) NULL");
  await ensureColumn("students", "mother_name", "VARCHAR(150) NULL");
  await ensureColumn("students", "father_job", "VARCHAR(120) NULL");
  await ensureColumn("students", "mother_job", "VARCHAR(120) NULL");
  await ensureColumn("students", "parent_address_street", "TEXT NULL");
  await ensureColumn("students", "parent_address_village", "VARCHAR(150) NULL");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teachers (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      class_name VARCHAR(80) NOT NULL,
      position VARCHAR(100) NOT NULL,
      teacher_number VARCHAR(80) UNIQUE NOT NULL,
      phone VARCHAR(50) NOT NULL,
      graduate VARCHAR(150) NOT NULL,
      address TEXT NOT NULL,
      email VARCHAR(150) NOT NULL,
      user_id VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn("teachers", "enabled", "BOOLEAN DEFAULT TRUE");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_settings (
      id VARCHAR(50) PRIMARY KEY,
      provider VARCHAR(80) NOT NULL DEFAULT 'Gemini',
      model VARCHAR(120) NOT NULL DEFAULT 'gemini-3.5-flash',
      enabled BOOLEAN DEFAULT TRUE,
      system_prompt TEXT NULL,
      api_key_env VARCHAR(120) NULL,
      base_url VARCHAR(255) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn("ai_settings", "api_key_env", "VARCHAR(120) NULL");
  await ensureColumn("ai_settings", "base_url", "VARCHAR(255) NULL");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS school_settings (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      npsn VARCHAR(50) NULL,
      level VARCHAR(80) NULL,
      status VARCHAR(80) NULL,
      address TEXT NULL,
      city VARCHAR(120) NULL,
      province VARCHAR(120) NULL,
      phone VARCHAR(80) NULL,
      email VARCHAR(150) NULL,
      website VARCHAR(200) NULL,
      principal_name VARCHAR(150) NULL,
      academic_year VARCHAR(50) NULL,
      semester VARCHAR(50) NULL,
      logo_url LONGTEXT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS access_permissions (
      feature_id VARCHAR(80) NOT NULL,
      feature_name VARCHAR(150) NOT NULL,
      category VARCHAR(80) NOT NULL,
      role VARCHAR(50) NOT NULL,
      can_create BOOLEAN DEFAULT FALSE,
      can_read BOOLEAN DEFAULT FALSE,
      can_update BOOLEAN DEFAULT FALSE,
      can_delete BOOLEAN DEFAULT FALSE,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (feature_id, role)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_scores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      academic_year VARCHAR(30) NULL,
      semester VARCHAR(30) NULL,
      kkm INT DEFAULT 75,
      tugas INT DEFAULT 0,
      uh1 INT DEFAULT 0,
      uh2 INT DEFAULT 0,
      uts INT DEFAULT 0,
      uas INT DEFAULT 0,
      rata_rata INT DEFAULT 0,
      UNIQUE KEY uniq_student_subject_period (student_id, subject, academic_year, semester),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await ensureColumn("student_scores", "academic_year", "VARCHAR(30) NULL");
  await ensureColumn("student_scores", "semester", "VARCHAR(30) NULL");
  await pool.query(
    "UPDATE student_scores SET academic_year = COALESCE(NULLIF(academic_year, ''), ?), semester = COALESCE(NULLIF(semester, ''), ?) WHERE academic_year IS NULL OR academic_year = '' OR semester IS NULL OR semester = ''",
    [DEFAULT_SCHOOL_SETTINGS.academicYear || "2025/2026", DEFAULT_SCHOOL_SETTINGS.semester || "Genap"]
  ).catch(() => undefined);
  await pool.query("ALTER TABLE student_scores DROP INDEX uniq_student_subject").catch(() => undefined);
  await pool.query("ALTER TABLE student_scores ADD UNIQUE KEY uniq_student_subject_period (student_id, subject, academic_year, semester)").catch(() => undefined);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_score_details (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      subject VARCHAR(100) NOT NULL,
      academic_year VARCHAR(30) NOT NULL,
      semester VARCHAR(30) NOT NULL,
      assessment_type VARCHAR(80) NOT NULL,
      scope_label VARCHAR(100) NOT NULL,
      objective_label VARCHAR(80) NOT NULL,
      score DECIMAL(6,2) NULL,
      note TEXT NULL,
      source_file VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_student_score_detail (student_id, subject, academic_year, semester, assessment_type, scope_label, objective_label),
      INDEX idx_score_detail_subject_year (subject, academic_year, semester),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      month VARCHAR(50) NOT NULL,
      hadir INT DEFAULT 0,
      sakit INT DEFAULT 0,
      izin INT DEFAULT 0,
      alpha INT DEFAULT 0,
      persentase INT DEFAULT 0,
      UNIQUE KEY uniq_student_month (student_id, month),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_attendance_daily (
      id INT AUTO_INCREMENT PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      date DATE NOT NULL,
      status ENUM('hadir','sakit','izin','alpha') NOT NULL,
      note VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_student_date (student_id, date),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS behaviour (
      id VARCHAR(50) PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      teacher VARCHAR(100) NOT NULL,
      date VARCHAR(50) NOT NULL,
      source_portal VARCHAR(100) NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query("ALTER TABLE behaviour ADD COLUMN source_portal VARCHAR(100) NULL").catch(() => undefined);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS karya (
      id VARCHAR(50) PRIMARY KEY,
      student_id VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      date VARCHAR(50) NOT NULL,
      description TEXT NOT NULL,
      image_url VARCHAR(512) NOT NULL,
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS karya_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      karya_id VARCHAR(50) NOT NULL,
      author VARCHAR(100) NOT NULL,
      text TEXT NOT NULL,
      date VARCHAR(50) NOT NULL,
      FOREIGN KEY (karya_id) REFERENCES karya(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      author VARCHAR(100) NOT NULL,
      date VARCHAR(50) NOT NULL,
      is_important BOOLEAN DEFAULT FALSE,
      category VARCHAR(100) NOT NULL,
      image_url VARCHAR(512) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query("ALTER TABLE announcements ADD COLUMN image_url VARCHAR(512) NULL").catch(() => undefined);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS parenting (
      id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      category VARCHAR(100) NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      author VARCHAR(100) NOT NULL,
      image_url VARCHAR(512) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id VARCHAR(50) PRIMARY KEY,
      author VARCHAR(100) NOT NULL,
      type VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      date VARCHAR(50) NOT NULL,
      likes INT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback_comments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      feedback_id VARCHAR(50) NOT NULL,
      author VARCHAR(100) NOT NULL,
      text TEXT NOT NULL,
      date VARCHAR(50) NOT NULL,
      FOREIGN KEY (feedback_id) REFERENCES feedback(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chatbot_backups (
      id VARCHAR(50) PRIMARY KEY,
      student_id VARCHAR(50) NULL,
      student_name VARCHAR(150) NULL,
      user_id VARCHAR(50) NULL,
      user_name VARCHAR(150) NOT NULL,
      user_role VARCHAR(50) NOT NULL,
      portal VARCHAR(100) NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_chatbot_student (student_id),
      INDEX idx_chatbot_created (created_at),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_chat_quotas (
      user_id VARCHAR(50) NOT NULL,
      period_month CHAR(7) NOT NULL,
      usage_count INT NOT NULL DEFAULT 0,
      quota_limit INT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, period_month),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(50) PRIMARY KEY,
      user_id VARCHAR(50) NULL,
      role VARCHAR(50) NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      date VARCHAR(50) NOT NULL,
      type VARCHAR(30) NOT NULL DEFAULT 'info',
      is_read BOOLEAN DEFAULT FALSE,
      is_deleted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await seedIfEmpty();
}

async function ensureColumn(table: string, column: string, definition: string) {
  if (!pool) return;
  const [rows] = await pool.query<any[]>(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [DB_NAME, table, column]
  );
  if (rows.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function migrateRoleEnum() {
  if (!pool) return;
  await pool.query("ALTER TABLE users MODIFY role VARCHAR(50) NOT NULL").catch(() => undefined);
  await pool.query("ALTER TABLE users MODIFY role ENUM('orangtua','WaliKelas','Guru','kepalasekolah','Admin','Administrator','Murid') NOT NULL");
  await pool.query("UPDATE users SET role = 'orangtua' WHERE role IN ('Orang Tua', 'ortu')");
  await pool.query("UPDATE users SET role = 'kepalasekolah' WHERE role IN ('Kepala Sekolah', 'kepsek')");
  await pool.query("UPDATE users SET role = 'WaliKelas' WHERE role = 'Guru' AND id IN (SELECT homeroom_teacher_id FROM classes WHERE homeroom_teacher_id IS NOT NULL)");
}

async function seedIfEmpty() {
  if (!pool) return;
  const [[userCount]] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM users");
  if (process.env.NODE_ENV === "production" && Number(userCount.count) === 0) {
    throw new Error("Database production belum memiliki user. Buat akun Administrator secara aman sebelum menjalankan aplikasi.");
  }
  if (Number(userCount.count) === 0) {
    for (const u of DEFAULT_USERS) {
      await pool.query("INSERT INTO users (id, username, password, role, name) VALUES (?, ?, ?, ?, ?)", [u.id, u.username, hashPassword(u.password || ""), u.role, u.name || u.username]);
    }
  }
  if (process.env.NODE_ENV !== "production") {
    const administrator = DEFAULT_USERS[0];
    await pool.query(
      "INSERT IGNORE INTO users (id, username, password, role, name) VALUES (?, ?, ?, ?, ?)",
      [administrator.id, administrator.username, hashPassword(administrator.password || ""), administrator.role, administrator.name || administrator.username]
    );
  }
  await pool.query("ALTER TABLE users MODIFY role ENUM('orangtua','WaliKelas','Guru','kepalasekolah','Admin','Administrator','Murid') NOT NULL").catch(() => undefined);
  await pool.query("UPDATE users SET role = 'orangtua' WHERE role IN ('Orang Tua', 'ortu')").catch(() => undefined);
  await pool.query("UPDATE users SET role = 'kepalasekolah' WHERE role IN ('Kepala Sekolah', 'kepsek')").catch(() => undefined);
  await pool.query("UPDATE users SET role = 'WaliKelas' WHERE role = 'Guru' AND id IN (SELECT homeroom_teacher_id FROM classes WHERE homeroom_teacher_id IS NOT NULL)").catch(() => undefined);

  const [[classCount]] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM classes");
  if (Number(classCount.count) === 0) {
    for (const c of DEFAULT_CLASSES) {
      await pool.query("INSERT INTO classes (id, name, academic_year, semester, homeroom_teacher_id) VALUES (?, ?, ?, ?, ?)", [c.id, c.name, c.academicYear || null, c.semester || null, c.homeroomTeacherId || null]);
    }
  }
  const schoolSettingsForClassMeta = await getSchoolSettings();
  await pool.query(
    "UPDATE classes SET academic_year = COALESCE(NULLIF(academic_year, ''), ?), semester = COALESCE(NULLIF(semester, ''), ?) WHERE academic_year IS NULL OR academic_year = '' OR semester IS NULL OR semester = ''",
    [schoolSettingsForClassMeta.academicYear || DEFAULT_SCHOOL_SETTINGS.academicYear || null, schoolSettingsForClassMeta.semester || DEFAULT_SCHOOL_SETTINGS.semester || null]
  ).catch(() => undefined);

  const [[studentCount]] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM students");
  if (Number(studentCount.count) === 0) {
    for (const s of DEFAULT_STUDENTS) {
      await pool.query("INSERT INTO students (id, name, class_name, nis, parent_name, parent_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)", [s.id, s.name, s.className, s.nis, s.parentName || null, s.parentId || null, s.userId || null]);
      const offset = s.id === "20240013" ? 3 : s.id === "20240021" ? -2 : 0;
      for (const score of DEFAULT_SCORES) {
        const adjusted = { ...score };
        adjusted.tugas = clampScore(adjusted.tugas + offset);
        adjusted.uh1 = clampScore(adjusted.uh1 + offset);
        adjusted.uh2 = clampScore(adjusted.uh2 + offset);
        adjusted.uts = clampScore(adjusted.uts + offset);
        adjusted.uas = clampScore(adjusted.uas + offset);
        adjusted.rataRata = Math.round((adjusted.tugas + adjusted.uh1 + adjusted.uh2 + adjusted.uts + adjusted.uas) / 5);
        await upsertScore(s.id, adjusted);
      }
      for (const att of DEFAULT_ATTENDANCE) {
        await upsertAttendance(s.id, att);
      }
    }
    for (const b of IN_MEMORY_DB.behaviour) {
      await pool.query("INSERT INTO behaviour (id, student_id, type, title, description, teacher, date, source_portal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [b.id, "20240012", b.type, b.title, b.description, b.teacher, b.date, b.sourcePortal || "Portal Guru"]);
    }
    for (const k of IN_MEMORY_DB.karya) {
      await pool.query("INSERT INTO karya (id, student_id, title, category, date, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)", [k.id, "20240012", k.title, k.category, k.date, k.description, k.imageUrl]);
    }
  }
  await pool.query(`
    UPDATE students s
    LEFT JOIN users u ON u.id = s.parent_id
    SET s.parent_name = COALESCE(s.parent_name, u.name)
    WHERE s.parent_name IS NULL OR s.parent_name = ''
  `).catch(() => undefined);

  const [[teacherCount]] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM teachers");
  if (Number(teacherCount.count) === 0) {
    for (const teacher of DEFAULT_TEACHERS) {
      await pool.query(
        `INSERT INTO teachers (id, name, class_name, position, teacher_number, phone, graduate, address, email, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [teacher.id, teacher.name, teacher.className, teacher.position, teacher.teacherNumber, teacher.phone, teacher.graduate, teacher.address, teacher.email, teacher.userId || null]
      );
    }
  }

  await pool.query(
    `INSERT IGNORE INTO school_settings
     (id, name, npsn, level, status, address, city, province, phone, email, website, principal_name, academic_year, semester, logo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DEFAULT_SCHOOL_SETTINGS.id,
      DEFAULT_SCHOOL_SETTINGS.name,
      DEFAULT_SCHOOL_SETTINGS.npsn || null,
      DEFAULT_SCHOOL_SETTINGS.level || null,
      DEFAULT_SCHOOL_SETTINGS.status || null,
      DEFAULT_SCHOOL_SETTINGS.address || null,
      DEFAULT_SCHOOL_SETTINGS.city || null,
      DEFAULT_SCHOOL_SETTINGS.province || null,
      DEFAULT_SCHOOL_SETTINGS.phone || null,
      DEFAULT_SCHOOL_SETTINGS.email || null,
      DEFAULT_SCHOOL_SETTINGS.website || null,
      DEFAULT_SCHOOL_SETTINGS.principalName || null,
      DEFAULT_SCHOOL_SETTINGS.academicYear || null,
      DEFAULT_SCHOOL_SETTINGS.semester || null,
      DEFAULT_SCHOOL_SETTINGS.logoUrl || null,
    ]
  );

  const students = await getAllStudents();
  const [[scoreCount]] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM student_scores");
  if (Number(scoreCount.count) === 0) {
    const [legacyScores] = await pool.query<any[]>("SELECT * FROM scores").catch(() => [[]]);
    if (legacyScores.length > 0) {
      for (const row of legacyScores) {
        await upsertScore(row.student_id || students[0]?.id || "20240012", {
          subject: row.subject,
          kkm: row.kkm,
          tugas: row.tugas,
          uh1: row.uh1,
          uh2: row.uh2,
          uts: row.uts,
          uas: row.uas,
          rataRata: row.rata_rata,
        });
      }
    } else {
      for (const student of students) {
        for (const score of DEFAULT_SCORES) await upsertScore(student.id, score);
      }
    }
  }

  const [[attendanceCount]] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM student_attendance");
  if (Number(attendanceCount.count) === 0) {
    const [legacyAttendance] = await pool.query<any[]>("SELECT * FROM attendance").catch(() => [[]]);
    if (legacyAttendance.length > 0) {
      for (const row of legacyAttendance) {
        await upsertAttendance(row.student_id || students[0]?.id || "20240012", {
          month: row.month,
          hadir: row.hadir,
          sakit: row.sakit,
          izin: row.izin,
          alpha: row.alpha,
          persentase: row.persentase,
        });
      }
    } else {
      for (const student of students) {
        for (const record of DEFAULT_ATTENDANCE) await upsertAttendance(student.id, record);
      }
    }
  }

  const [[annCount]] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM announcements");
  if (Number(annCount.count) === 0) {
    for (const a of IN_MEMORY_DB.announcements) {
      await pool.query("INSERT INTO announcements (id, title, content, author, date, is_important, category, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [a.id, a.title, a.content, a.author, a.date, a.isImportant, a.category, a.imageUrl || null]);
    }
  }

  const [[parentingCount]] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM parenting");
  if (Number(parentingCount.count) === 0) {
    for (const p of IN_MEMORY_DB.parenting) {
      await pool.query("INSERT INTO parenting (id, title, category, summary, content, author, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)", [p.id, p.title, p.category, p.summary, p.content, p.author, p.imageUrl]);
    }
  }

  const [[feedbackCount]] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM feedback");
  if (Number(feedbackCount.count) === 0) {
    for (const f of IN_MEMORY_DB.feedback) {
      await pool.query("INSERT INTO feedback (id, author, type, content, date, likes) VALUES (?, ?, ?, ?, ?, ?)", [f.id, f.author, f.type, f.content, f.date, f.likes]);
    }
  }

  const [[notifCount]] = await pool.query<any[]>("SELECT COUNT(*) AS count FROM notifications");
  if (Number(notifCount.count) === 0) {
    const defaults = [
      { id: "n_ortu_1", role: "orangtua", title: "Jadwal UTS Semester 2", description: "Jadwal lengkap penilaian UTS Semester 2 resmi diposting di papan Pengumuman Sekolah.", date: "1 hari yang lalu", type: "info" },
      { id: "n_ortu_2", role: "orangtua", title: "Peringatan Disiplin Walikelas", description: "Murid tercatat terlambat memasuki kelas setelah istirahat pertama berakhir.", date: "1 hari yang lalu", type: "urgent" },
      { id: "n_walikelas_1", role: "WaliKelas", title: "Rekap Absensi Perlu Dicek", description: "Pastikan absensi bulan berjalan sudah diperbarui sebelum rapat wali kelas.", date: "Hari ini", type: "warning" },
      { id: "n_admin_1", role: "Admin", title: "Database Terhubung", description: "Koneksi MySQL/phpMyAdmin aktif dan siap dipakai untuk manajemen data.", date: "Hari ini", type: "info" },
    ];
    for (const n of defaults) {
      await pool.query("INSERT INTO notifications (id, role, title, description, date, type) VALUES (?, ?, ?, ?, ?, ?)", [n.id, n.role, n.title, n.description, n.date, n.type]);
    }
  }
  const roleNotifications = [
    { id: "n_ortu_default", role: "orangtua", title: "Portal Orang Tua Aktif", description: "Notifikasi orang tua sudah tersambung ke database sekolah.", date: "Hari ini", type: "info" },
    { id: "n_walikelas_default", role: "WaliKelas", title: "Portal Wali Kelas Aktif", description: "Notifikasi wali kelas sudah tersambung ke database sekolah.", date: "Hari ini", type: "info" },
    { id: "n_murid_default", role: "Murid", title: "Portal Murid Aktif", description: "Notifikasi murid sudah tersambung ke database sekolah.", date: "Hari ini", type: "info" },
  ];
  for (const n of roleNotifications) {
    await pool.query(
      "INSERT IGNORE INTO notifications (id, role, title, description, date, type) VALUES (?, ?, ?, ?, ?, ?)",
      [n.id, n.role, n.title, n.description, n.date, n.type]
    );
  }
  for (const feature of ACCESS_FEATURES) {
    for (const role of ALL_ROLES) {
      const perm = defaultCrud(feature.id, role);
      await pool.query(
        `INSERT IGNORE INTO access_permissions
         (feature_id, feature_name, category, role, can_create, can_read, can_update, can_delete)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [feature.id, feature.feature, feature.category, role, perm.create, perm.read, perm.update, perm.delete]
      );
    }
  }
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function rowToUser(row: any): User {
  return { id: row.id, username: row.username, role: row.role, name: row.name, email: row.email ?? undefined, phone: row.phone ?? undefined, photoUrl: row.photo_url ?? undefined, enabled: row.enabled === undefined ? true : !!row.enabled };
}

function rowToStudent(row: any): Student {
  return {
    id: row.id,
    name: row.name,
    className: row.class_name,
    nis: row.nis,
    nisn: row.nisn ?? undefined,
    gender: row.gender ?? undefined,
    birthPlace: row.birth_place ?? undefined,
    birthDate: row.birth_date ?? undefined,
    religion: row.religion ?? undefined,
    previousSchool: row.previous_school ?? undefined,
    address: row.address ?? undefined,
    district: row.district ?? undefined,
    city: row.city ?? undefined,
    province: row.province ?? undefined,
    fatherName: row.father_name ?? undefined,
    motherName: row.mother_name ?? undefined,
    fatherJob: row.father_job ?? undefined,
    motherJob: row.mother_job ?? undefined,
    parentAddressStreet: row.parent_address_street ?? undefined,
    parentAddressVillage: row.parent_address_village ?? undefined,
    parentName: row.parent_name ?? undefined,
    parentId: row.parent_id ?? undefined,
    userId: row.user_id ?? undefined,
    enabled: row.enabled === undefined ? true : !!row.enabled,
  };
}

function rowToTeacher(row: any): Teacher {
  return {
    id: row.id,
    name: row.name,
    className: row.class_name,
    position: row.position,
    teacherNumber: row.teacher_number,
    phone: row.phone,
    graduate: row.graduate,
    address: row.address,
    email: row.email,
    userId: row.user_id ?? undefined,
    enabled: row.enabled === undefined ? true : !!row.enabled,
  };
}

function rowToNotification(row: any): PortalNotification {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    date: row.date,
    type: row.type,
    isRead: !!row.is_read,
  };
}

function rowToDailyAttendance(row: any): AttendanceDailyRecord {
  const rawDate = row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date).split("T")[0];
  return {
    id: row.id,
    studentId: row.student_id,
    date: rawDate,
    status: row.status,
    note: row.note ?? undefined,
  };
}

function rowToChatbotBackup(row: any): ChatbotBackup {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || "");
  return {
    id: row.id,
    studentId: row.student_id ?? undefined,
    studentName: row.student_name ?? undefined,
    userId: row.user_id ?? undefined,
    userName: row.user_name,
    userRole: row.user_role,
    portal: row.portal,
    question: row.question,
    answer: row.answer,
    createdAt,
  };
}

function rowToParentRegistration(row: any): ParentRegistration {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at || "");
  const reviewedAt = row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : row.reviewed_at ? String(row.reviewed_at) : undefined;
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email ?? undefined,
    phone: row.phone,
    studentNis: row.student_nis,
    studentName: row.student_name,
    className: row.class_name,
    status: row.status,
    createdAt,
    reviewedAt,
    reviewedBy: row.reviewed_by ?? undefined,
  };
}

function rowToScoreDetail(row: any): StudentScoreDetail {
  return {
    id: row.id,
    studentId: row.student_id,
    subject: row.subject,
    academicYear: row.academic_year,
    semester: row.semester,
    assessmentType: row.assessment_type,
    scopeLabel: row.scope_label,
    objectiveLabel: row.objective_label,
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    note: row.note ?? undefined,
    sourceFile: row.source_file ?? undefined,
  };
}

function rowToSchoolSettings(row: any): SchoolSettings {
  return {
    id: row.id,
    name: row.name,
    npsn: row.npsn ?? undefined,
    level: row.level ?? undefined,
    status: row.status ?? undefined,
    address: row.address ?? undefined,
    city: row.city ?? undefined,
    province: row.province ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    website: row.website ?? undefined,
    principalName: row.principal_name ?? undefined,
    academicYear: row.academic_year ?? undefined,
    semester: row.semester ?? undefined,
    logoUrl: row.logo_url ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  };
}

export function isUsingMariaDB(): boolean {
  return isDbActive;
}

export function isUsingPostgreSQL(): boolean {
  return false;
}

export async function authenticateUser(username: string, password: string, role?: Role) {
  if (!isDbActive || !pool) {
    const user = (IN_MEMORY_DB.users || DEFAULT_USERS).find((u) => u.username === username && u.enabled !== false && verifyPassword(password, u.password || "") && (!role || u.role === role));
    return user ? { ...user, password: undefined } : null;
  }
  const [rows] = await pool.query<any[]>("SELECT * FROM users WHERE username = ? AND enabled = TRUE AND (? IS NULL OR role = ?) LIMIT 1", [username, role || null, role || null]);
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password)) return null;
  if (!isPasswordHash(row.password)) {
    await pool.query("UPDATE users SET password = ? WHERE id = ?", [hashPassword(password), row.id]);
  }
  return rowToUser(row);
}

async function getVisibleStudents(user: User, selectedClassName?: string): Promise<Student[]> {
  if (!pool || !isDbActive) {
    const students = IN_MEMORY_DB.students || DEFAULT_STUDENTS;
    if (user.role === "Murid") return students.filter((s) => s.userId === user.id);
    if (user.role === "orangtua") return students.filter((s) => s.parentId === user.id);
    if (user.role === "WaliKelas") return students.filter((s) => s.className === "Kelas VII-A");
    if (selectedClassName) return students.filter((s) => s.className === selectedClassName);
    return students;
  }

  let query = "SELECT * FROM students WHERE enabled = TRUE";
  const params: any[] = [];
  if (user.role === "Murid") {
    query += " AND user_id = ?";
    params.push(user.id);
  } else if (user.role === "orangtua") {
    query += " AND parent_id = ?";
    params.push(user.id);
  } else if (user.role === "WaliKelas") {
    query += " AND class_name IN (SELECT name FROM classes WHERE homeroom_teacher_id = ?)";
    params.push(user.id);
  } else if ((user.role === "Guru" || user.role === "kepalasekolah") && selectedClassName) {
    query += " AND class_name = ?";
    params.push(selectedClassName);
  }
  query += " ORDER BY class_name ASC, name ASC";
  const [rows] = await pool.query<any[]>(query, params);
  return rows.map(rowToStudent);
}

export async function getPortalDatabase(userId?: string, selectedStudentId?: string, selectedClassName?: string): Promise<SIKOWALIDatabase> {
  if (!isDbActive || !pool) {
    const user = (IN_MEMORY_DB.users || DEFAULT_USERS).find((u) => u.id === userId) || DEFAULT_USERS[4];
    const visible = await getVisibleStudents(user, selectedClassName);
    const student = visible.find((s) => s.id === selectedStudentId) || visible[0] || DEFAULT_STUDENTS[0];
    const attendanceDaily = (IN_MEMORY_DB.attendanceDaily || []).filter((record) => record.studentId === student.id);
    const attendance = attendanceDaily.length ? aggregateDailyAttendance(attendanceDaily) : IN_MEMORY_DB.attendance;
    return { ...IN_MEMORY_DB, currentUser: user, student, visibleStudents: visible, attendance, attendanceDaily, parentRegistrations: ["Admin", "Administrator"].includes(user.role) ? IN_MEMORY_DB.parentRegistrations : [], schoolSettings: await getSchoolSettings(), notifications: await getNotificationsForUser(user), accessMatrix: await getAccessMatrix(), selectedClassName: selectedClassName || student.className, isUsingMariaDB: false };
  }

  const [userRows] = await pool.query<any[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [userId || "u_ortu"]);
  const currentUser = userRows[0] ? rowToUser(userRows[0]) : rowToUser((await pool.query<any[]>("SELECT * FROM users WHERE username='ortu' LIMIT 1"))[0][0]);
  const visibleStudents = await getVisibleStudents(currentUser, selectedClassName);
  const activeStudent = visibleStudents.find((s) => s.id === selectedStudentId) || visibleStudents[0] || (await getAllStudents())[0];
  const activeId = activeStudent?.id || "20240012";

  const [scoreRows] = await pool.query<any[]>("SELECT * FROM student_scores WHERE student_id = ? ORDER BY subject ASC", [activeId]);
  const [scoreDetailRows] = await pool.query<any[]>(
    "SELECT * FROM student_score_details WHERE student_id = ? ORDER BY subject ASC, academic_year ASC, semester ASC, assessment_type ASC, scope_label ASC, objective_label ASC",
    [activeId]
  );
  const [attendanceRows] = await pool.query<any[]>("SELECT * FROM student_attendance WHERE student_id = ? ORDER BY id ASC", [activeId]);
  const [attendanceDailyRows] = await pool.query<any[]>("SELECT * FROM student_attendance_daily WHERE student_id = ? ORDER BY date DESC", [activeId]);
  const [behaviourRows] = await pool.query<any[]>("SELECT * FROM behaviour WHERE student_id = ? ORDER BY date DESC", [activeId]);
  const [karyaRows] = await pool.query<any[]>("SELECT * FROM karya WHERE student_id = ? ORDER BY date DESC", [activeId]);
  const [karyaCommentRows] = await pool.query<any[]>("SELECT * FROM karya_comments ORDER BY date ASC");
  const [annRows] = await pool.query<any[]>("SELECT * FROM announcements ORDER BY date DESC");
  const [parentingRows] = await pool.query<any[]>("SELECT * FROM parenting ORDER BY id ASC");
  const [feedbackRows] = await pool.query<any[]>("SELECT * FROM feedback ORDER BY date DESC");
  const [feedbackCommentRows] = await pool.query<any[]>("SELECT * FROM feedback_comments ORDER BY date ASC");
  const notificationRows = await getNotificationsForUser(currentUser);
  const [userListRows] = await pool.query<any[]>("SELECT * FROM users ORDER BY role ASC, name ASC");
  const [classRows] = await pool.query<any[]>("SELECT * FROM classes ORDER BY name ASC");
  const [teacherRows] = await pool.query<any[]>("SELECT * FROM teachers ORDER BY class_name ASC, name ASC");
  const [parentRegistrationRows] = ["Admin", "Administrator"].includes(currentUser.role)
    ? await pool.query<any[]>("SELECT * FROM parent_registrations ORDER BY created_at DESC")
    : [[]];
  const aiSettings = await getAISettings();
  const schoolSettings = await getSchoolSettings();
  const accessMatrix = await getAccessMatrix();
  const allStudents = await getAllStudents();
  const attendanceDaily = attendanceDailyRows.map(rowToDailyAttendance);
  const attendance = attendanceDaily.length
    ? aggregateDailyAttendance(attendanceDaily)
    : attendanceRows.map((a) => ({ month: a.month, hadir: a.hadir, sakit: a.sakit, izin: a.izin, alpha: a.alpha, persentase: a.persentase }));

  return {
    currentUser,
    student: activeStudent,
    students: allStudents,
    visibleStudents,
    selectedClassName: selectedClassName || activeStudent?.className,
    classes: classRows.map((c) => ({ id: c.id, name: c.name, homeroomTeacherId: c.homeroom_teacher_id ?? undefined, academicYear: c.academic_year ?? undefined, semester: c.semester ?? undefined })),
    teachers: teacherRows.map(rowToTeacher),
    scores: scoreRows.map((s) => ({ subject: s.subject, academicYear: s.academic_year ?? undefined, semester: s.semester ?? undefined, kkm: s.kkm, tugas: s.tugas, uh1: s.uh1, uh2: s.uh2, uts: s.uts, uas: s.uas, rataRata: s.rata_rata })),
    scoreDetails: scoreDetailRows.map(rowToScoreDetail),
    attendance,
    attendanceDaily,
    behaviour: behaviourRows.map((b) => ({ id: b.id, type: b.type, title: b.title, description: b.description, teacher: b.teacher, date: b.date, sourcePortal: b.source_portal || "Portal Guru" })),
    karya: karyaRows.map((k) => ({ id: k.id, title: k.title, category: k.category, date: k.date, description: k.description, imageUrl: k.image_url, comments: karyaCommentRows.filter((c) => c.karya_id === k.id).map((c) => ({ author: c.author, text: c.text, date: c.date })) })),
    notifications: notificationRows,
    announcements: annRows.map((a) => ({ id: a.id, title: a.title, content: a.content, author: a.author, date: a.date, isImportant: !!a.is_important, category: a.category, imageUrl: a.image_url ?? undefined })),
    parenting: parentingRows.map((p) => ({ id: p.id, title: p.title, category: p.category, summary: p.summary, content: p.content, author: p.author, imageUrl: p.image_url })),
    feedback: feedbackRows.map((f) => ({ id: f.id, author: f.author, type: f.type, content: f.content, date: f.date, likes: f.likes, comments: feedbackCommentRows.filter((c) => c.feedback_id === f.id).map((c) => ({ author: c.author, text: c.text, date: c.date })) })),
    users: userListRows.map(rowToUser),
    aiSettings,
    schoolSettings,
    accessMatrix,
    parentRegistrations: parentRegistrationRows.map(rowToParentRegistration),
    isUsingMariaDB: true,
  };
}

export async function getFullDatabase(): Promise<SIKOWALIDatabase> {
  return getPortalDatabase("u_ortu");
}

export async function getAllStudents(): Promise<Student[]> {
  if (!isDbActive || !pool) return DEFAULT_STUDENTS;
  const [rows] = await pool.query<any[]>("SELECT * FROM students ORDER BY class_name ASC, name ASC");
  return rows.map(rowToStudent);
}

async function upsertScore(studentId: string, s: SubjectScore) {
  if (!pool) return;
  const academicYear = s.academicYear || DEFAULT_SCHOOL_SETTINGS.academicYear || "2025/2026";
  const semester = s.semester || DEFAULT_SCHOOL_SETTINGS.semester || "Genap";
  await pool.query(
    `INSERT INTO student_scores (student_id, subject, academic_year, semester, kkm, tugas, uh1, uh2, uts, uas, rata_rata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE kkm=VALUES(kkm), tugas=VALUES(tugas), uh1=VALUES(uh1), uh2=VALUES(uh2), uts=VALUES(uts), uas=VALUES(uas), rata_rata=VALUES(rata_rata)`,
    [studentId, s.subject, academicYear, semester, s.kkm, s.tugas, s.uh1, s.uh2, s.uts, s.uas, s.rataRata]
  );
}

async function upsertAttendance(studentId: string, a: AttendanceRecord) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO student_attendance (student_id, month, hadir, sakit, izin, alpha, persentase)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE hadir=VALUES(hadir), sakit=VALUES(sakit), izin=VALUES(izin), alpha=VALUES(alpha), persentase=VALUES(persentase)`,
    [studentId, a.month, a.hadir, a.sakit, a.izin, a.alpha, a.persentase]
  );
}

export async function saveScores(scores: SubjectScore[], studentId = "20240012") {
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.scores = scores;
    return scores;
  }
  for (const s of scores) await upsertScore(studentId, s);
  return (await getPortalDatabase("u_admin", studentId)).scores;
}

function average(values: number[]) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

async function recomputeScoreSummaryFromDetails(studentId: string, subject: string, academicYear: string, semester: string) {
  if (!pool) return;
  const [rows] = await pool.query<any[]>(
    `SELECT assessment_type, scope_label, objective_label, score
     FROM student_score_details
     WHERE student_id = ? AND subject = ? AND academic_year = ? AND semester = ? AND score IS NOT NULL`,
    [studentId, subject, academicYear, semester]
  );
  const detailScores = rows.map((row) => Number(row.score)).filter((value) => Number.isFinite(value));
  const formatifScores = rows
    .filter((row) => String(row.assessment_type).toUpperCase().includes("FORMATIF"))
    .map((row) => Number(row.score))
    .filter((value) => Number.isFinite(value));
  const sumatifLingkup = rows.filter((row) => String(row.assessment_type).toUpperCase().includes("SUMATIF LINGKUP"));
  const sumatifAkhir = rows
    .filter((row) => String(row.assessment_type).toUpperCase().includes("SUMATIF AKHIR"))
    .map((row) => Number(row.score))
    .filter((value) => Number.isFinite(value));
  const byScope = (scope: string) =>
    sumatifLingkup
      .filter((row) => String(row.scope_label).toUpperCase() === scope || String(row.objective_label).toUpperCase() === scope)
      .map((row) => Number(row.score))
      .filter((value) => Number.isFinite(value));
  await upsertScore(studentId, {
    subject,
    academicYear,
    semester,
    kkm: 70,
    tugas: average(formatifScores),
    uh1: average(byScope("LM1")),
    uh2: average(byScope("LM2")),
    uts: average(sumatifAkhir),
    uas: average(byScope("LM3").concat(byScope("LM4"), byScope("LM5"))),
    rataRata: average(detailScores),
  });
}

export async function saveScoreDetails(studentId: string, details: StudentScoreDetail[]) {
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.scoreDetails = details;
    return details;
  }
  const touched = new Set<string>();
  for (const detail of details) {
    const subject = (detail.subject || "Matematika").trim();
    const academicYear = (detail.academicYear || DEFAULT_SCHOOL_SETTINGS.academicYear || "2025-2026").trim();
    const semester = (detail.semester || DEFAULT_SCHOOL_SETTINGS.semester || "1-2").trim();
    const assessmentType = (detail.assessmentType || "FORMATIF").trim();
    const scopeLabel = (detail.scopeLabel || "-").trim();
    const objectiveLabel = (detail.objectiveLabel || "-").trim();
    const score = detail.score === null || detail.score === undefined || Number.isNaN(Number(detail.score))
      ? null
      : Math.max(0, Math.min(100, Number(detail.score)));
    await pool.query(
      `INSERT INTO student_score_details
        (student_id, subject, academic_year, semester, assessment_type, scope_label, objective_label, score, note, source_file)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE score=VALUES(score), note=VALUES(note), source_file=VALUES(source_file)`,
      [studentId, subject, academicYear, semester, assessmentType, scopeLabel, objectiveLabel, score, detail.note || null, detail.sourceFile || null]
    );
    touched.add([subject, academicYear, semester].join("\u0001"));
  }
  for (const key of touched) {
    const [subject, academicYear, semester] = key.split("\u0001");
    await recomputeScoreSummaryFromDetails(studentId, subject, academicYear, semester);
  }
  const [rows] = await pool.query<any[]>(
    "SELECT * FROM student_score_details WHERE student_id = ? ORDER BY subject ASC, academic_year ASC, semester ASC, assessment_type ASC, scope_label ASC, objective_label ASC",
    [studentId]
  );
  return rows.map(rowToScoreDetail);
}

export async function saveAttendance(month: string, record: AttendanceRecord, studentId = "20240012") {
  return saveAllAttendance([record], studentId);
}

export async function saveAllAttendance(attendance: AttendanceRecord[], studentId = "20240012") {
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.attendance = attendance;
    return attendance;
  }
  for (const record of attendance) await upsertAttendance(studentId, record);
  return (await getPortalDatabase("u_admin", studentId)).attendance;
}

export async function saveDailyAttendance(input: { studentId: string; date: string; status: AttendanceDailyRecord["status"]; note?: string }) {
  if (!isDbActive || !pool) {
    const existing = (IN_MEMORY_DB.attendanceDaily || []).filter((record) => !(record.studentId === input.studentId && record.date === input.date));
    IN_MEMORY_DB.attendanceDaily = [
      ...existing,
      {
        id: Date.now(),
        studentId: input.studentId,
        date: input.date,
        status: input.status,
        note: input.note?.trim() || undefined,
      },
    ];
    const portal = await getPortalDatabase("u_admin", input.studentId);
    return { attendance: portal.attendance, attendanceDaily: portal.attendanceDaily || [] };
  }

  await pool.query(
    `INSERT INTO student_attendance_daily (student_id, date, status, note)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE status=VALUES(status), note=VALUES(note)`,
    [input.studentId, input.date, input.status, input.note?.trim() || null]
  );
  const [dailyRows] = await pool.query<any[]>("SELECT * FROM student_attendance_daily WHERE student_id = ? ORDER BY date ASC", [input.studentId]);
  const aggregate = aggregateDailyAttendance(dailyRows.map(rowToDailyAttendance));
  for (const record of aggregate) await upsertAttendance(input.studentId, record);
  const portal = await getPortalDatabase("u_admin", input.studentId);
  return { attendance: portal.attendance, attendanceDaily: portal.attendanceDaily || [] };
}

export async function createBehaviourLog(input: { studentId: string; type: BehaviourLog["type"]; title: string; description: string; reporter: string; sourcePortal: string }) {
  const record: BehaviourLog = {
    id: `b_${Date.now()}`,
    type: input.type,
    title: input.title.trim(),
    description: input.description.trim(),
    teacher: input.reporter,
    date: new Date().toISOString().split("T")[0],
    sourcePortal: input.sourcePortal,
  };
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.behaviour = [record, ...(IN_MEMORY_DB.behaviour || [])];
    const portal = await getPortalDatabase("u_admin", input.studentId);
    return portal.behaviour;
  }
  await pool.query(
    "INSERT INTO behaviour (id, student_id, type, title, description, teacher, date, source_portal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [record.id, input.studentId, record.type, record.title, record.description, record.teacher, record.date, record.sourcePortal]
  );
  return (await getPortalDatabase("u_admin", input.studentId)).behaviour;
}

export async function saveChatbotBackup(input: { studentId?: string; studentName?: string; userId?: string; userName: string; userRole: Role; portal: string; question: string; answer: string }) {
  const record: ChatbotBackup = {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    studentId: input.studentId,
    studentName: input.studentName,
    userId: input.userId,
    userName: input.userName,
    userRole: input.userRole,
    portal: input.portal,
    question: input.question,
    answer: input.answer,
    createdAt: new Date().toISOString(),
  };
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.chatbotBackups = [record, ...(IN_MEMORY_DB.chatbotBackups || [])];
    return record;
  }
  await pool.query(
    `INSERT INTO chatbot_backups (id, student_id, student_name, user_id, user_name, user_role, portal, question, answer)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.id,
      record.studentId || null,
      record.studentName || null,
      record.userId || null,
      record.userName,
      record.userRole,
      record.portal,
      record.question,
      record.answer,
    ]
  );
  return record;
}

function monthlyQuotaLimit(role: Role) {
  return role === "WaliKelas" || role === "Guru" || role === "kepalasekolah" ? 40 : 20;
}

function currentQuotaPeriod() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
}

function nextQuotaResetAt(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+07:00`).toISOString();
}

function toAIChatQuota(user: User, used: number, limit = monthlyQuotaLimit(user.role)): AIChatQuota {
  const periodMonth = currentQuotaPeriod();
  return {
    userId: user.id,
    periodMonth,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAt: nextQuotaResetAt(periodMonth),
  };
}

export async function getAIChatQuota(user: User): Promise<AIChatQuota> {
  const periodMonth = currentQuotaPeriod();
  const limit = monthlyQuotaLimit(user.role);
  if (!isDbActive || !pool) {
    return toAIChatQuota(user, memoryAIChatUsage.get(`${user.id}:${periodMonth}`) || 0, limit);
  }
  const [rows] = await pool.query<any[]>(
    "SELECT usage_count, quota_limit FROM ai_chat_quotas WHERE user_id = ? AND period_month = ? LIMIT 1",
    [user.id, periodMonth]
  );
  return toAIChatQuota(user, Number(rows[0]?.usage_count || 0), Number(rows[0]?.quota_limit || limit));
}

export async function reserveAIChatQuota(user: User): Promise<AIChatQuota | null> {
  const periodMonth = currentQuotaPeriod();
  const limit = monthlyQuotaLimit(user.role);
  if (!isDbActive || !pool) {
    const key = `${user.id}:${periodMonth}`;
    const used = memoryAIChatUsage.get(key) || 0;
    if (used >= limit) return null;
    memoryAIChatUsage.set(key, used + 1);
    return toAIChatQuota(user, used + 1, limit);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<any[]>(
      "SELECT usage_count, quota_limit FROM ai_chat_quotas WHERE user_id = ? AND period_month = ? FOR UPDATE",
      [user.id, periodMonth]
    );
    const used = Number(rows[0]?.usage_count || 0);
    const storedLimit = Number(rows[0]?.quota_limit || limit);
    if (used >= storedLimit) {
      await connection.rollback();
      return null;
    }
    if (rows[0]) {
      await connection.query(
        "UPDATE ai_chat_quotas SET usage_count = usage_count + 1 WHERE user_id = ? AND period_month = ?",
        [user.id, periodMonth]
      );
    } else {
      await connection.query(
        "INSERT INTO ai_chat_quotas (user_id, period_month, usage_count, quota_limit) VALUES (?, ?, 1, ?)",
        [user.id, periodMonth, limit]
      );
    }
    await connection.commit();
    return toAIChatQuota(user, used + 1, storedLimit);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function releaseAIChatQuota(user: User) {
  const periodMonth = currentQuotaPeriod();
  if (!isDbActive || !pool) {
    const key = `${user.id}:${periodMonth}`;
    memoryAIChatUsage.set(key, Math.max(0, (memoryAIChatUsage.get(key) || 0) - 1));
    return;
  }
  await pool.query(
    "UPDATE ai_chat_quotas SET usage_count = GREATEST(usage_count - 1, 0) WHERE user_id = ? AND period_month = ?",
    [user.id, periodMonth]
  );
}

export async function getChatbotBackups(viewer: User): Promise<ChatbotBackup[]> {
  if (!isDbActive || !pool) {
    const records = IN_MEMORY_DB.chatbotBackups || [];
    if (viewer.role === "WaliKelas") {
      const visible = await getVisibleStudents(viewer);
      const allowedIds = new Set(visible.map((student) => student.id));
      return records.filter((record) => record.studentId && allowedIds.has(record.studentId));
    }
    return records;
  }

  if (viewer.role === "WaliKelas") {
    const visible = await getVisibleStudents(viewer);
    const allowedIds = visible.map((student) => student.id);
    if (!allowedIds.length) return [];
    const placeholders = allowedIds.map(() => "?").join(",");
    const [rows] = await pool.query<any[]>(`SELECT * FROM chatbot_backups WHERE student_id IN (${placeholders}) ORDER BY created_at DESC LIMIT 500`, allowedIds);
    return rows.map(rowToChatbotBackup);
  }

  const [rows] = await pool.query<any[]>("SELECT * FROM chatbot_backups ORDER BY created_at DESC LIMIT 500");
  return rows.map(rowToChatbotBackup);
}

type StudentBiodataInput = {
  nisn?: string;
  gender?: string;
  birthPlace?: string;
  birthDate?: string;
  religion?: string;
  previousSchool?: string;
  address?: string;
  district?: string;
  city?: string;
  province?: string;
  fatherName?: string;
  motherName?: string;
  fatherJob?: string;
  motherJob?: string;
  parentAddressStreet?: string;
  parentAddressVillage?: string;
};

const studentBiodataColumnMap: Record<keyof StudentBiodataInput, string> = {
  nisn: "nisn",
  gender: "gender",
  birthPlace: "birth_place",
  birthDate: "birth_date",
  religion: "religion",
  previousSchool: "previous_school",
  address: "address",
  district: "district",
  city: "city",
  province: "province",
  fatherName: "father_name",
  motherName: "mother_name",
  fatherJob: "father_job",
  motherJob: "mother_job",
  parentAddressStreet: "parent_address_street",
  parentAddressVillage: "parent_address_village",
};

function studentBiodataColumns(input: StudentBiodataInput) {
  return Object.fromEntries(
    Object.entries(studentBiodataColumnMap).map(([key, column]) => [column, (input as any)[key] || null])
  );
}

export async function createStudent(input: { name: string; nis: string; className: string; parentName?: string; parentId?: string; userId?: string } & StudentBiodataInput) {
  const id = input.nis || `s_${Date.now()}`;
  if (!isDbActive || !pool) {
    if (!(IN_MEMORY_DB.classes || []).some((classRoom) => classRoom.name === input.className)) throw new Error("Kelas tidak ditemukan di database kelas.");
    const parent = (IN_MEMORY_DB.users || []).find((user) => user.id === input.parentId && user.role === "orangtua");
    if (!parent) throw new Error("Orang tua tidak ditemukan di database orang tua.");
    const student = { id, ...input, parentName: parent.name || parent.username, parentId: parent.id };
    IN_MEMORY_DB.students = [...(IN_MEMORY_DB.students || []), student];
    return student;
  }
  const [classRows] = await pool.query<any[]>("SELECT id FROM classes WHERE name = ? LIMIT 1", [input.className]);
  if (!classRows[0]) throw new Error("Kelas tidak ditemukan di database kelas.");
  const [parentRows] = await pool.query<any[]>("SELECT id, name, username FROM users WHERE id = ? AND role = 'orangtua' LIMIT 1", [input.parentId]);
  if (!parentRows[0]) throw new Error("Orang tua tidak ditemukan di database orang tua.");
  const columns = {
    name: input.name,
    class_name: input.className,
    nis: input.nis,
    parent_name: parentRows[0].name || parentRows[0].username,
    parent_id: parentRows[0].id,
    user_id: input.userId || null,
    ...studentBiodataColumns(input),
  };
  await pool.query(
    `INSERT INTO students (id, ${Object.keys(columns).join(", ")}) VALUES (?, ${Object.keys(columns).map(() => "?").join(", ")})`,
    [id, ...Object.values(columns)]
  );
  for (const score of DEFAULT_SCORES) await upsertScore(id, score);
  for (const att of DEFAULT_ATTENDANCE) await upsertAttendance(id, att);
  return (await getAllStudents()).find((s) => s.id === id);
}

export type StudentImportInput = {
  name: string;
  nis: string;
  className: string;
} & StudentBiodataInput;

function generatedId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeUsername(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "user";
}

async function ensureParentForImportedStudent(input: StudentImportInput) {
  const parentName = input.motherName || input.fatherName || `Orang Tua ${input.name}`;
  if (!isDbActive || !pool) {
    const existing = (IN_MEMORY_DB.users || []).find((user) => user.role === "orangtua" && (user.name || "").toLowerCase() === parentName.toLowerCase());
    if (existing) return existing;
    const username = normalizeUsername(`ortu_${input.nis}_${parentName}`);
    const parent = { id: generatedId("u"), username, password: hashPassword(`ortu${String(input.nis).slice(-4) || "1234"}`), role: "orangtua" as Role, name: parentName };
    IN_MEMORY_DB.users = [...(IN_MEMORY_DB.users || []), parent];
    return parent;
  }

  const [existingRows] = await pool.query<any[]>(
    "SELECT id, username, name FROM users WHERE role = 'orangtua' AND LOWER(name) = LOWER(?) LIMIT 1",
    [parentName]
  );
  if (existingRows[0]) return existingRows[0];

  const baseUsername = normalizeUsername(`ortu_${input.nis}`);
  let username = baseUsername;
  for (let i = 2; i < 100; i += 1) {
    const [used] = await pool.query<any[]>("SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1", [username]);
    if (!used[0]) break;
    username = `${baseUsername}_${i}`;
  }
  const id = generatedId("u");
  await pool.query(
    "INSERT INTO users (id, username, password, role, name) VALUES (?, ?, ?, 'orangtua', ?)",
    [id, username, hashPassword(`ortu${String(input.nis).slice(-4) || "1234"}`), parentName]
  );
  return { id, username, name: parentName };
}

export async function upsertImportedStudent(input: StudentImportInput) {
  if (!isDbActive || !pool) {
    if (!(IN_MEMORY_DB.classes || []).some((classRoom) => classRoom.name === input.className)) {
      IN_MEMORY_DB.classes = [...(IN_MEMORY_DB.classes || []), { id: generatedId("c"), name: input.className }];
    }
    const parent = await ensureParentForImportedStudent(input);
    const existing = (IN_MEMORY_DB.students || []).find((student) => student.nis === input.nis);
    const student = { ...existing, ...input, id: existing?.id || input.nis, parentId: parent.id, parentName: parent.name || parent.username, enabled: existing?.enabled ?? true };
    IN_MEMORY_DB.students = existing
      ? (IN_MEMORY_DB.students || []).map((item) => item.id === existing.id ? student : item)
      : [...(IN_MEMORY_DB.students || []), student];
    return { student, action: (existing ? "updated" : "created") as "created" | "updated" };
  }

  const [classRows] = await pool.query<any[]>("SELECT id FROM classes WHERE name = ? LIMIT 1", [input.className]);
  if (!classRows[0]) {
    await pool.query("INSERT INTO classes (id, name) VALUES (?, ?)", [generatedId("c"), input.className]);
  }
  const parent = await ensureParentForImportedStudent(input);
  const [existingRows] = await pool.query<any[]>("SELECT id FROM students WHERE nis = ? LIMIT 1", [input.nis]);
  const columns = {
    name: input.name,
    class_name: input.className,
    nis: input.nis,
    nisn: input.nisn || null,
    gender: input.gender || null,
    birth_place: input.birthPlace || null,
    birth_date: input.birthDate || null,
    religion: input.religion || null,
    previous_school: input.previousSchool || null,
    address: input.address || null,
    district: input.district || null,
    city: input.city || null,
    province: input.province || null,
    father_name: input.fatherName || null,
    mother_name: input.motherName || null,
    father_job: input.fatherJob || null,
    mother_job: input.motherJob || null,
    parent_address_street: input.parentAddressStreet || null,
    parent_address_village: input.parentAddressVillage || null,
    parent_name: parent.name || parent.username,
    parent_id: parent.id,
  };
  if (existingRows[0]) {
    await pool.query(
      `UPDATE students SET ${Object.keys(columns).map((column) => `${column} = ?`).join(", ")} WHERE id = ?`,
      [...Object.values(columns), existingRows[0].id]
    );
    return { student: (await getAllStudents()).find((student) => student.id === existingRows[0].id), action: "updated" as const };
  }
  const id = input.nis;
  await pool.query(
    `INSERT INTO students (id, ${Object.keys(columns).join(", ")}) VALUES (?, ${Object.keys(columns).map(() => "?").join(", ")})`,
    [id, ...Object.values(columns)]
  );
  for (const score of DEFAULT_SCORES) await upsertScore(id, score);
  for (const att of DEFAULT_ATTENDANCE) await upsertAttendance(id, att);
  return { student: (await getAllStudents()).find((student) => student.id === id), action: "created" as const };
}

export async function createTeacher(input: Omit<Teacher, "id">) {
  const id = `t_${Date.now()}`;
  if (!isDbActive || !pool) {
    if (input.position === "Wali Kelas" && !(IN_MEMORY_DB.classes || []).some((classRoom) => classRoom.name === input.className)) throw new Error("Kelas wali tidak ditemukan di database kelas.");
    const teacher = { id, ...input };
    IN_MEMORY_DB.teachers = [...(IN_MEMORY_DB.teachers || []), teacher];
    return teacher;
  }
  if (input.position === "Wali Kelas") {
    const [classRows] = await pool.query<any[]>("SELECT id FROM classes WHERE name = ? LIMIT 1", [input.className]);
    if (!classRows[0]) throw new Error("Kelas wali tidak ditemukan di database kelas.");
  }
  await pool.query(
    `INSERT INTO teachers (id, name, class_name, position, teacher_number, phone, graduate, address, email, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.name, input.className, input.position, input.teacherNumber, input.phone, input.graduate, input.address, input.email, input.userId || null]
  );
  if (input.position === "Wali Kelas" && input.className && input.className !== "-") {
    await pool.query(
      "UPDATE classes SET homeroom_teacher_id = COALESCE(?, homeroom_teacher_id) WHERE name = ?",
      [input.userId || null, input.className]
    );
  }
  const [rows] = await pool.query<any[]>("SELECT * FROM teachers WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? rowToTeacher(rows[0]) : { id, ...input };
}

export async function createUser(input: { username: string; password: string; role: Role; name: string; email?: string; phone?: string }) {
  const id = `u_${Date.now()}`;
  const storedPassword = hashPassword(input.password);
  if (!isDbActive || !pool) {
    const user = { id, ...input, password: storedPassword };
    IN_MEMORY_DB.users = [...(IN_MEMORY_DB.users || []), user];
    return { ...user, password: undefined };
  }
  await pool.query("INSERT INTO users (id, username, password, role, name, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, input.username, storedPassword, input.role, input.name, input.email || null, input.phone || null]);
  return { id, username: input.username, role: input.role, name: input.name, email: input.email, phone: input.phone };
}

export async function createParentRegistration(input: { name: string; username: string; password: string; email?: string; phone: string; studentNis: string; studentName: string; className: string }) {
  const id = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const username = input.username.trim();
  const registration = {
    id,
    name: input.name.trim(),
    username,
    password: hashPassword(input.password),
    email: input.email?.trim() || undefined,
    phone: input.phone.trim(),
    studentNis: input.studentNis.trim(),
    studentName: input.studentName.trim(),
    className: input.className.trim(),
    status: "pending" as const,
    createdAt: new Date().toISOString(),
  };
  if (!isDbActive || !pool) {
    const usernameUsed = (IN_MEMORY_DB.users || []).some((user) => user.username.toLowerCase() === username.toLowerCase())
      || (IN_MEMORY_DB.parentRegistrations || []).some((item) => item.username.toLowerCase() === username.toLowerCase() && item.status === "pending");
    if (usernameUsed) throw new Error("Username sudah digunakan atau sedang menunggu verifikasi.");
    IN_MEMORY_DB.parentRegistrations = [registration, ...(IN_MEMORY_DB.parentRegistrations || [])];
    return { ...registration, password: undefined };
  }
  const [existingUsers] = await pool.query<any[]>("SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1", [username]);
  const [existingRegistrations] = await pool.query<any[]>("SELECT id FROM parent_registrations WHERE LOWER(username) = LOWER(?) AND status = 'pending' LIMIT 1", [username]);
  if (existingUsers[0] || existingRegistrations[0]) throw new Error("Username sudah digunakan atau sedang menunggu verifikasi.");
  await pool.query(
    `INSERT INTO parent_registrations (id, name, username, password, email, phone, student_nis, student_name, class_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, registration.name, registration.username, registration.password, registration.email || null, registration.phone, registration.studentNis, registration.studentName, registration.className]
  );
  return { ...registration, password: undefined };
}

export async function reviewParentRegistration(id: string, reviewerId: string, action: "approve" | "reject") {
  if (!isDbActive || !pool) {
    const registrations = IN_MEMORY_DB.parentRegistrations || [];
    const registration = registrations.find((item) => item.id === id);
    const storedRegistration = registration as (ParentRegistration & { password?: string }) | undefined;
    if (!storedRegistration || storedRegistration.status !== "pending") throw new Error("Pengajuan tidak ditemukan atau sudah diproses.");
    if (action === "reject") {
      IN_MEMORY_DB.parentRegistrations = registrations.map((item) => item.id === id ? { ...item, status: "rejected", reviewedAt: new Date().toISOString(), reviewedBy: reviewerId } : item);
      return true;
    }
    const student = (IN_MEMORY_DB.students || []).find((item) => item.nis === storedRegistration.studentNis && item.name.toLowerCase() === storedRegistration.studentName.toLowerCase() && item.className.toLowerCase() === storedRegistration.className.toLowerCase());
    if (!student) throw new Error("Data NIS, nama anak, atau kelas tidak cocok dengan database murid.");
    if (student.parentId) {
      const currentParent = (IN_MEMORY_DB.users || []).find((user) => user.id === student.parentId);
      throw new Error(
        `Siswa sudah terhubung dengan akun orang tua${currentParent?.name ? `: ${currentParent.name}` : ""}. Persetujuan diblokir untuk mencegah penggantian akun tanpa sengaja.`,
      );
    }
    const userId = `u_${Date.now()}`;
    IN_MEMORY_DB.users = [...(IN_MEMORY_DB.users || []), { id: userId, username: storedRegistration.username, password: storedRegistration.password, role: "orangtua", name: storedRegistration.name, email: storedRegistration.email, phone: storedRegistration.phone, enabled: true }];
    IN_MEMORY_DB.students = (IN_MEMORY_DB.students || []).map((item) => item.id === student.id ? { ...item, parentId: userId, parentName: storedRegistration.name } : item);
    IN_MEMORY_DB.parentRegistrations = registrations.map((item) => item.id === id ? { ...item, status: "approved", reviewedAt: new Date().toISOString(), reviewedBy: reviewerId } : item);
    return true;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<any[]>("SELECT * FROM parent_registrations WHERE id = ? FOR UPDATE", [id]);
    const registration = rows[0];
    if (!registration || registration.status !== "pending") throw new Error("Pengajuan tidak ditemukan atau sudah diproses.");
    if (action === "reject") {
      await connection.query("UPDATE parent_registrations SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?", [reviewerId, id]);
      await connection.commit();
      return true;
    }
    const [students] = await connection.query<any[]>(
      "SELECT * FROM students WHERE nis = ? AND LOWER(name) = LOWER(?) AND LOWER(class_name) = LOWER(?) LIMIT 1",
      [registration.student_nis, registration.student_name, registration.class_name]
    );
    const student = students[0];
    if (!student) throw new Error("Data NIS, nama anak, atau kelas tidak cocok dengan database murid.");
    if (student.parent_id) {
      const [parentRows] = await connection.query<any[]>("SELECT name, username FROM users WHERE id = ? LIMIT 1", [student.parent_id]);
      const currentParent = parentRows[0];
      throw new Error(
        `Siswa sudah terhubung dengan akun orang tua${currentParent?.name ? `: ${currentParent.name}` : ""}. Persetujuan diblokir untuk mencegah penggantian akun tanpa sengaja.`,
      );
    }
    const userId = `u_${Date.now()}`;
    await connection.query(
      "INSERT INTO users (id, username, password, role, name, email, phone, enabled) VALUES (?, ?, ?, 'orangtua', ?, ?, ?, TRUE)",
      [userId, registration.username, registration.password, registration.name, registration.email || null, registration.phone]
    );
    await connection.query("UPDATE students SET parent_id = ?, parent_name = ? WHERE id = ?", [userId, registration.name, student.id]);
    await connection.query("UPDATE parent_registrations SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?", [reviewerId, id]);
    await connection.commit();
    return true;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function createKarya(input: { studentId: string; title: string; category: string; description: string; imageUrl: string }) {
  const id = `k_${Date.now()}`;
  const date = new Date().toISOString().split("T")[0];
  if (!isDbActive || !pool) {
    const fresh = { id, title: input.title, category: input.category, description: input.description, imageUrl: input.imageUrl, date, comments: [] };
    IN_MEMORY_DB.karya = [fresh, ...(IN_MEMORY_DB.karya || [])];
    return fresh;
  }
  await pool.query(
    "INSERT INTO karya (id, student_id, title, category, date, description, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, input.studentId, input.title, input.category, date, input.description, input.imageUrl]
  );
  return { id, title: input.title, category: input.category, description: input.description, imageUrl: input.imageUrl, date, comments: [] };
}

export async function updateUser(id: string, input: Partial<{ username: string; password: string; role: Role; name: string; email?: string; phone?: string; photoUrl?: string; enabled?: boolean }>) {
  if (!isDbActive || !pool) {
    const safeInput = { ...input, password: input.password ? hashPassword(input.password) : undefined };
    IN_MEMORY_DB.users = (IN_MEMORY_DB.users || []).map((u) => u.id === id ? { ...u, ...safeInput, password: safeInput.password || u.password } : u);
    return (IN_MEMORY_DB.users || []).find((u) => u.id === id);
  }
  const fields: string[] = [];
  const params: any[] = [];
  for (const [key, column] of Object.entries({ username: "username", password: "password", role: "role", name: "name", email: "email", phone: "phone", photoUrl: "photo_url", enabled: "enabled" })) {
    if ((input as any)[key] !== undefined && (key !== "password" || (input as any)[key])) {
      fields.push(`${column} = ?`);
      const value = (input as any)[key];
      params.push(key === "password" ? hashPassword(value) : value === "" ? null : value);
    }
  }
  if (fields.length > 0) await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, [...params, id]);
  const [rows] = await pool.query<any[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function getUserById(id: string) {
  if (!isDbActive || !pool) {
    return (IN_MEMORY_DB.users || []).find((u) => u.id === id) || null;
  }
  const [rows] = await pool.query<any[]>("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function deleteUser(id: string) {
  if (!isDbActive || !pool) {
    const linkedStudent = (IN_MEMORY_DB.students || []).find((student) => student.parentId === id);
    if (linkedStudent) throw new Error(`Akun orang tua masih terhubung dengan murid: ${linkedStudent.name}. Lepaskan relasi murid terlebih dahulu.`);
    IN_MEMORY_DB.users = (IN_MEMORY_DB.users || []).filter((u) => u.id !== id);
    return true;
  }
  const [linkedStudents] = await pool.query<any[]>("SELECT name FROM students WHERE parent_id = ? LIMIT 1", [id]);
  if (linkedStudents[0]) throw new Error(`Akun orang tua masih terhubung dengan murid: ${linkedStudents[0].name}. Lepaskan relasi murid terlebih dahulu.`);
  await pool.query("DELETE FROM users WHERE id = ?", [id]);
  return true;
}

function normalizeClassSemester(value?: string | null) {
  const semester = (value || DEFAULT_SCHOOL_SETTINGS.semester || "Genap").trim();
  if (semester === "1") return "Ganjil";
  if (semester === "2" || semester === "1-2") return "Genap";
  if (semester === "Ganjil" || semester === "Genap") return semester;
  throw new Error("Semester kelas hanya boleh Ganjil atau Genap.");
}

export async function createClass(input: { name: string; homeroomTeacherId?: string; academicYear?: string; semester?: string }) {
  const name = input.name.trim();
  const academicYear = input.academicYear?.trim() || DEFAULT_SCHOOL_SETTINGS.academicYear;
  const semester = normalizeClassSemester(input.semester);
  const id = `c_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now()}`;
  if (!isDbActive || !pool) {
    if ((IN_MEMORY_DB.classes || []).some((item) => item.name.toLowerCase() === name.toLowerCase())) throw new Error("Nama kelas sudah digunakan.");
    const classRoom = { id, name, academicYear, semester, homeroomTeacherId: input.homeroomTeacherId || undefined };
    IN_MEMORY_DB.classes = [...(IN_MEMORY_DB.classes || []), classRoom];
    return classRoom;
  }
  await pool.query("INSERT INTO classes (id, name, academic_year, semester, homeroom_teacher_id) VALUES (?, ?, ?, ?, ?)", [id, name, academicYear || null, semester || null, input.homeroomTeacherId || null]);
  return { id, name, academicYear, semester, homeroomTeacherId: input.homeroomTeacherId || undefined };
}

export async function updateClass(id: string, input: { name: string; homeroomTeacherId?: string; academicYear?: string; semester?: string }) {
  const name = input.name.trim();
  const academicYear = input.academicYear?.trim() || DEFAULT_SCHOOL_SETTINGS.academicYear;
  const semester = normalizeClassSemester(input.semester);
  if (!isDbActive || !pool) {
    const current = (IN_MEMORY_DB.classes || []).find((item) => item.id === id);
    if (!current) throw new Error("Data kelas tidak ditemukan.");
    IN_MEMORY_DB.students = (IN_MEMORY_DB.students || []).map((student) => student.className === current.name ? { ...student, className: name } : student);
    IN_MEMORY_DB.classes = (IN_MEMORY_DB.classes || []).map((item) => item.id === id ? { ...item, name, academicYear, semester, homeroomTeacherId: input.homeroomTeacherId || undefined } : item);
    return (IN_MEMORY_DB.classes || []).find((item) => item.id === id);
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<any[]>("SELECT name FROM classes WHERE id = ? FOR UPDATE", [id]);
    if (!rows[0]) throw new Error("Data kelas tidak ditemukan.");
    await connection.query("UPDATE classes SET name = ?, academic_year = ?, semester = ?, homeroom_teacher_id = ? WHERE id = ?", [name, academicYear || null, semester || null, input.homeroomTeacherId || null, id]);
    await connection.query("UPDATE students SET class_name = ? WHERE class_name = ?", [name, rows[0].name]);
    await connection.query("UPDATE teachers SET class_name = ? WHERE class_name = ?", [name, rows[0].name]);
    await connection.commit();
    return { id, name, academicYear, semester, homeroomTeacherId: input.homeroomTeacherId || undefined };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

export async function deleteClass(id: string) {
  if (!isDbActive || !pool) {
    const current = (IN_MEMORY_DB.classes || []).find((item) => item.id === id);
    if (!current) return true;
    if ((IN_MEMORY_DB.students || []).some((student) => student.className === current.name)) throw new Error("Kelas masih memiliki murid. Pindahkan murid terlebih dahulu.");
    IN_MEMORY_DB.classes = (IN_MEMORY_DB.classes || []).filter((item) => item.id !== id);
    return true;
  }
  const [rows] = await pool.query<any[]>("SELECT name FROM classes WHERE id = ? LIMIT 1", [id]);
  if (!rows[0]) return true;
  const [students] = await pool.query<any[]>("SELECT id FROM students WHERE class_name = ? LIMIT 1", [rows[0].name]);
  if (students[0]) throw new Error("Kelas masih memiliki murid. Pindahkan murid terlebih dahulu.");
  await pool.query("DELETE FROM classes WHERE id = ?", [id]);
  return true;
}

export async function updateStudent(id: string, input: Partial<{ name: string; nis: string; className: string; parentName?: string; parentId?: string; userId?: string; enabled?: boolean } & StudentBiodataInput>) {
  if (!isDbActive || !pool) {
    if (input.className && !(IN_MEMORY_DB.classes || []).some((classRoom) => classRoom.name === input.className)) throw new Error("Kelas tidak ditemukan di database kelas.");
    if (input.parentId) {
      const parent = (IN_MEMORY_DB.users || []).find((user) => user.id === input.parentId && user.role === "orangtua");
      if (!parent) throw new Error("Orang tua tidak ditemukan di database orang tua.");
      input = { ...input, parentId: parent.id, parentName: parent.name || parent.username };
    }
    IN_MEMORY_DB.students = (IN_MEMORY_DB.students || []).map((s) => s.id === id ? { ...s, ...input } : s);
    return (IN_MEMORY_DB.students || []).find((s) => s.id === id);
  }
  if (input.className) {
    const [classRows] = await pool.query<any[]>("SELECT id FROM classes WHERE name = ? LIMIT 1", [input.className]);
    if (!classRows[0]) throw new Error("Kelas tidak ditemukan di database kelas.");
  }
  if (input.parentId) {
    const [parentRows] = await pool.query<any[]>("SELECT id, name, username FROM users WHERE id = ? AND role = 'orangtua' LIMIT 1", [input.parentId]);
    if (!parentRows[0]) throw new Error("Orang tua tidak ditemukan di database orang tua.");
    input = { ...input, parentId: parentRows[0].id, parentName: parentRows[0].name || parentRows[0].username };
  }
  const map = { name: "name", nis: "nis", className: "class_name", parentName: "parent_name", parentId: "parent_id", userId: "user_id", enabled: "enabled", ...studentBiodataColumnMap };
  const fields: string[] = [];
  const params: any[] = [];
  for (const [key, column] of Object.entries(map)) {
    if ((input as any)[key] !== undefined) {
      fields.push(`${column} = ?`);
      params.push((input as any)[key] === "" ? null : (input as any)[key]);
    }
  }
  if (fields.length > 0) await pool.query(`UPDATE students SET ${fields.join(", ")} WHERE id = ?`, [...params, id]);
  const [rows] = await pool.query<any[]>("SELECT * FROM students WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? rowToStudent(rows[0]) : null;
}

export async function deleteStudent(id: string) {
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.students = (IN_MEMORY_DB.students || []).filter((s) => s.id !== id);
    return true;
  }
  await pool.query("DELETE FROM students WHERE id = ?", [id]);
  return true;
}

export async function updateTeacher(id: string, input: Partial<Omit<Teacher, "id">>) {
  if (!isDbActive || !pool) {
    if (input.position === "Wali Kelas" && input.className && !(IN_MEMORY_DB.classes || []).some((classRoom) => classRoom.name === input.className)) throw new Error("Kelas wali tidak ditemukan di database kelas.");
    IN_MEMORY_DB.teachers = (IN_MEMORY_DB.teachers || []).map((t) => t.id === id ? { ...t, ...input } : t);
    return (IN_MEMORY_DB.teachers || []).find((t) => t.id === id);
  }
  if (input.position === "Wali Kelas" && input.className) {
    const [classRows] = await pool.query<any[]>("SELECT id FROM classes WHERE name = ? LIMIT 1", [input.className]);
    if (!classRows[0]) throw new Error("Kelas wali tidak ditemukan di database kelas.");
  }
  const map = { name: "name", className: "class_name", position: "position", teacherNumber: "teacher_number", phone: "phone", graduate: "graduate", address: "address", email: "email", userId: "user_id", enabled: "enabled" };
  const fields: string[] = [];
  const params: any[] = [];
  for (const [key, column] of Object.entries(map)) {
    if ((input as any)[key] !== undefined) {
      fields.push(`${column} = ?`);
      params.push((input as any)[key] === "" ? null : (input as any)[key]);
    }
  }
  if (fields.length > 0) await pool.query(`UPDATE teachers SET ${fields.join(", ")} WHERE id = ?`, [...params, id]);
  const [rows] = await pool.query<any[]>("SELECT * FROM teachers WHERE id = ? LIMIT 1", [id]);
  return rows[0] ? rowToTeacher(rows[0]) : null;
}

export async function deleteTeacher(id: string) {
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.teachers = (IN_MEMORY_DB.teachers || []).filter((t) => t.id !== id);
    return true;
  }
  await pool.query("DELETE FROM teachers WHERE id = ?", [id]);
  return true;
}

export async function getAISettings(): Promise<AISettings> {
  const fallback = {
    provider: "Gemini",
    model: "gemini-3.5-flash",
    enabled: true,
    systemPrompt: "Gunakan Bahasa Indonesia yang ramah, ringkas, dan berdasarkan data portal SIKOWALI.",
    apiKeyEnv: "GEMINI_API_KEY",
    baseUrl: "",
  };
  if (!isDbActive || !pool) return fallback;
  await pool.query(
    `INSERT IGNORE INTO ai_settings (id, provider, model, enabled, system_prompt, api_key_env, base_url)
     VALUES ('default', ?, ?, TRUE, ?, ?, ?)`,
    [fallback.provider, fallback.model, fallback.systemPrompt, fallback.apiKeyEnv, fallback.baseUrl]
  );
  const [rows] = await pool.query<any[]>("SELECT * FROM ai_settings WHERE id = 'default' LIMIT 1");
  const row = rows[0];
  return row ? {
    provider: row.provider,
    model: row.model,
    enabled: !!row.enabled,
    systemPrompt: row.system_prompt || fallback.systemPrompt,
    apiKeyEnv: row.api_key_env || fallback.apiKeyEnv,
    baseUrl: row.base_url || "",
    updatedAt: row.updated_at,
  } : fallback;
}

export async function saveAISettings(input: Partial<AISettings>) {
  if (!isDbActive || !pool) return { ...(await getAISettings()), ...input };
  await getAISettings();
  await pool.query(
    "UPDATE ai_settings SET provider = ?, model = ?, enabled = ?, system_prompt = ?, api_key_env = ?, base_url = ? WHERE id = 'default'",
    [input.provider || "Gemini", input.model || "gemini-3.5-flash", input.enabled !== false, input.systemPrompt || "", input.apiKeyEnv || "GEMINI_API_KEY", input.baseUrl || ""]
  );
  return getAISettings();
}

export async function getSchoolSettings(): Promise<SchoolSettings> {
  if (!isDbActive || !pool) return IN_MEMORY_DB.schoolSettings || DEFAULT_SCHOOL_SETTINGS;
  await pool.query(
    `INSERT IGNORE INTO school_settings
     (id, name, npsn, level, status, address, city, province, phone, email, website, principal_name, academic_year, semester, logo_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      DEFAULT_SCHOOL_SETTINGS.id,
      DEFAULT_SCHOOL_SETTINGS.name,
      DEFAULT_SCHOOL_SETTINGS.npsn || null,
      DEFAULT_SCHOOL_SETTINGS.level || null,
      DEFAULT_SCHOOL_SETTINGS.status || null,
      DEFAULT_SCHOOL_SETTINGS.address || null,
      DEFAULT_SCHOOL_SETTINGS.city || null,
      DEFAULT_SCHOOL_SETTINGS.province || null,
      DEFAULT_SCHOOL_SETTINGS.phone || null,
      DEFAULT_SCHOOL_SETTINGS.email || null,
      DEFAULT_SCHOOL_SETTINGS.website || null,
      DEFAULT_SCHOOL_SETTINGS.principalName || null,
      DEFAULT_SCHOOL_SETTINGS.academicYear || null,
      DEFAULT_SCHOOL_SETTINGS.semester || null,
      DEFAULT_SCHOOL_SETTINGS.logoUrl || null,
    ]
  );
  const [rows] = await pool.query<any[]>("SELECT * FROM school_settings WHERE id = 'default' LIMIT 1");
  return rows[0] ? rowToSchoolSettings(rows[0]) : DEFAULT_SCHOOL_SETTINGS;
}

export async function saveSchoolSettings(input: Partial<SchoolSettings>) {
  const current = await getSchoolSettings();
  const next = {
    ...current,
    ...input,
    name: (input.name || current.name || DEFAULT_SCHOOL_SETTINGS.name).trim(),
  };
  if (!next.name) throw new Error("Nama sekolah wajib diisi.");
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.schoolSettings = next;
    return next;
  }
  await pool.query(
    `UPDATE school_settings
     SET name = ?, npsn = ?, level = ?, status = ?, address = ?, city = ?, province = ?,
         phone = ?, email = ?, website = ?, principal_name = ?, academic_year = ?, semester = ?, logo_url = ?
     WHERE id = 'default'`,
    [
      next.name,
      next.npsn || null,
      next.level || null,
      next.status || null,
      next.address || null,
      next.city || null,
      next.province || null,
      next.phone || null,
      next.email || null,
      next.website || null,
      next.principalName || null,
      next.academicYear || null,
      next.semester || null,
      next.logoUrl || null,
    ]
  );
  return getSchoolSettings();
}

export async function getAccessMatrix(): Promise<AccessMatrixRow[]> {
  if (!isDbActive || !pool) {
    return IN_MEMORY_DB.accessMatrix || ACCESS_FEATURES.map((feature) => ({
      featureId: feature.id,
      feature: feature.feature,
      category: feature.category,
      permissions: Object.fromEntries(ALL_ROLES.map((role) => [role, defaultCrud(feature.id, role)])) as Record<Role, CrudPermission>,
    }));
  }
  const [rows] = await pool.query<any[]>("SELECT * FROM access_permissions ORDER BY category ASC, feature_name ASC, role ASC");
  const byFeature = new Map<string, AccessMatrixRow>(ACCESS_FEATURES.map((feature) => [
    feature.id,
    {
      featureId: feature.id,
      feature: feature.feature,
      category: feature.category,
      permissions: Object.fromEntries(ALL_ROLES.map((role) => [role, defaultCrud(feature.id, role)])) as Record<Role, CrudPermission>,
    },
  ]));
  for (const row of rows) {
    if (!byFeature.has(row.feature_id)) {
      byFeature.set(row.feature_id, {
        featureId: row.feature_id,
        feature: row.feature_name,
        category: row.category,
        permissions: Object.fromEntries(ALL_ROLES.map((role) => [role, { create: false, read: false, update: false, delete: false }])) as Record<Role, CrudPermission>,
      });
    }
    const target = byFeature.get(row.feature_id)!;
    target.permissions[row.role as Role] = {
      create: !!row.can_create,
      read: !!row.can_read,
      update: !!row.can_update,
      delete: !!row.can_delete,
    };
  }
  return Array.from(byFeature.values());
}

export async function updateAccessPermission(input: { featureId: string; role: Role; permission: keyof CrudPermission; value: boolean }) {
  if (!isDbActive || !pool) {
    const matrix = await getAccessMatrix();
    IN_MEMORY_DB.accessMatrix = matrix.map((row) => row.featureId === input.featureId ? {
      ...row,
      permissions: {
        ...row.permissions,
        [input.role]: { ...row.permissions[input.role], [input.permission]: input.value },
      },
    } : row);
    return true;
  }
  const columnMap: Record<keyof CrudPermission, string> = {
    create: "can_create",
    read: "can_read",
    update: "can_update",
    delete: "can_delete",
  };
  const column = columnMap[input.permission];
  await pool.query(`UPDATE access_permissions SET ${column} = ? WHERE feature_id = ? AND role = ?`, [input.value, input.featureId, input.role]);
  return true;
}

export async function getNotificationsForUser(user: User): Promise<PortalNotification[]> {
  if (!isDbActive || !pool) {
    return IN_MEMORY_DB.notifications || [];
  }
  const [rows] = await pool.query<any[]>(
    `SELECT * FROM notifications
     WHERE is_deleted = FALSE
       AND (user_id = ? OR role = ? OR (user_id IS NULL AND role IS NULL))
     ORDER BY created_at DESC, id DESC`,
    [user.id, user.role]
  );
  return rows.map(rowToNotification);
}

export async function setNotificationRead(user: User, id: string, isRead: boolean) {
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.notifications = (IN_MEMORY_DB.notifications || []).map((n) => n.id === id ? { ...n, isRead } : n);
    return true;
  }
  await pool.query("UPDATE notifications SET is_read = ? WHERE id = ? AND (user_id = ? OR role = ? OR (user_id IS NULL AND role IS NULL))", [isRead, id, user.id, user.role]);
  return true;
}

export async function markAllNotificationsRead(user: User) {
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.notifications = (IN_MEMORY_DB.notifications || []).map((n) => ({ ...n, isRead: true }));
    return true;
  }
  await pool.query("UPDATE notifications SET is_read = TRUE WHERE is_deleted = FALSE AND (user_id = ? OR role = ? OR (user_id IS NULL AND role IS NULL))", [user.id, user.role]);
  return true;
}

export async function deleteNotification(user: User, id: string) {
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.notifications = (IN_MEMORY_DB.notifications || []).filter((n) => n.id !== id);
    return true;
  }
  await pool.query("UPDATE notifications SET is_deleted = TRUE WHERE id = ? AND (user_id = ? OR role = ? OR (user_id IS NULL AND role IS NULL))", [id, user.id, user.role]);
  return true;
}

export async function commentKarya(karyaId: string, author: string, text: string) {
  const date = new Date().toISOString().split("T")[0];
  if (!isDbActive || !pool) return IN_MEMORY_DB.karya;
  await pool.query("INSERT INTO karya_comments (karya_id, author, text, date) VALUES (?, ?, ?, ?)", [karyaId, author, text, date]);
  return (await getFullDatabase()).karya;
}

export async function postAnnouncement(title: string, content: string, category: string, author: string, isImportant: boolean, imageUrl = "") {
  const fresh: Announcement = { id: "a_" + Date.now(), title, content, author: author || "Staf Sekolah", date: new Date().toISOString().split("T")[0], isImportant, category: category || "Umum", imageUrl: imageUrl || undefined };
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.announcements.unshift(fresh);
    return IN_MEMORY_DB.announcements;
  }
  await pool.query("INSERT INTO announcements (id, title, content, author, date, is_important, category, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [fresh.id, fresh.title, fresh.content, fresh.author, fresh.date, fresh.isImportant, fresh.category, fresh.imageUrl || null]);
  return (await getFullDatabase()).announcements;
}

export async function createParentingArticle(input: Omit<ParentingArticle, "id">) {
  const fresh: ParentingArticle = {
    id: "p_" + Date.now(),
    title: input.title,
    category: input.category || "Parenting",
    summary: input.summary,
    content: input.content,
    author: input.author || "Tim Konseling Sekolah",
    imageUrl: input.imageUrl || "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=900&auto=format&fit=crop&q=70",
  };
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.parenting = [fresh, ...(IN_MEMORY_DB.parenting || [])];
    return IN_MEMORY_DB.parenting;
  }
  await pool.query(
    "INSERT INTO parenting (id, title, category, summary, content, author, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [fresh.id, fresh.title, fresh.category, fresh.summary, fresh.content, fresh.author, fresh.imageUrl]
  );
  return (await getFullDatabase()).parenting;
}

export async function updateParentingArticle(id: string, input: Partial<Omit<ParentingArticle, "id">>) {
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.parenting = (IN_MEMORY_DB.parenting || []).map((article) => article.id === id ? { ...article, ...input } : article);
    return IN_MEMORY_DB.parenting || [];
  }
  const fields: string[] = [];
  const params: any[] = [];
  for (const [key, column] of Object.entries({ title: "title", category: "category", summary: "summary", content: "content", author: "author", imageUrl: "image_url" })) {
    if ((input as any)[key] !== undefined) {
      fields.push(`${column} = ?`);
      params.push((input as any)[key] || "");
    }
  }
  if (fields.length > 0) await pool.query(`UPDATE parenting SET ${fields.join(", ")} WHERE id = ?`, [...params, id]);
  return (await getFullDatabase()).parenting;
}

export async function deleteParentingArticle(id: string) {
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.parenting = (IN_MEMORY_DB.parenting || []).filter((article) => article.id !== id);
    return IN_MEMORY_DB.parenting || [];
  }
  await pool.query("DELETE FROM parenting WHERE id = ?", [id]);
  return (await getFullDatabase()).parenting;
}

export async function postFeedback(author: string, type: string, content: string) {
  const fresh = { id: "f_" + Date.now(), author: author || "Wali Murid", type: (type || "Saran") as "Positif" | "Keluhan" | "Saran", content, date: new Date().toISOString().split("T")[0], likes: 0, comments: [] };
  if (!isDbActive || !pool) {
    IN_MEMORY_DB.feedback.unshift(fresh);
    return IN_MEMORY_DB.feedback;
  }
  await pool.query("INSERT INTO feedback (id, author, type, content, date, likes) VALUES (?, ?, ?, ?, ?, ?)", [fresh.id, fresh.author, fresh.type, fresh.content, fresh.date, fresh.likes]);
  return (await getFullDatabase()).feedback;
}

export async function likeFeedback(id: string) {
  if (!isDbActive || !pool) return 0;
  await pool.query("UPDATE feedback SET likes = likes + 1 WHERE id = ?", [id]);
  const [rows] = await pool.query<any[]>("SELECT likes FROM feedback WHERE id = ?", [id]);
  return rows[0]?.likes || 0;
}

export async function commentFeedback(feedbackId: string, author: string, text: string) {
  const date = new Date().toISOString().split("T")[0];
  if (!isDbActive || !pool) return [];
  await pool.query("INSERT INTO feedback_comments (feedback_id, author, text, date) VALUES (?, ?, ?, ?)", [feedbackId, author, text, date]);
  const [rows] = await pool.query<any[]>("SELECT author, text, date FROM feedback_comments WHERE feedback_id = ? ORDER BY date ASC", [feedbackId]);
  return rows.map((r) => ({ author: r.author, text: r.text, date: r.date }));
}

export async function saveProfile(userId: string, input: { name: string; email?: string; phone?: string; password?: string; photoUrl?: string }) {
  if (!isDbActive || !pool) {
    const users = IN_MEMORY_DB.users || [];
    const safeInput = { ...input, password: input.password ? hashPassword(input.password) : undefined };
    IN_MEMORY_DB.users = users.map((user) => user.id === userId ? { ...user, ...safeInput, password: safeInput.password || user.password } : user);
    IN_MEMORY_DB.visibleStudents = (IN_MEMORY_DB.visibleStudents || []).map((student) => student.parentId === userId ? { ...student, parentName: input.name } : student);
    IN_MEMORY_DB.students = (IN_MEMORY_DB.students || []).map((student) => student.parentId === userId ? { ...student, parentName: input.name } : student);
    return IN_MEMORY_DB.users.find((user) => user.id === userId);
  }
  const user = await updateUser(userId, input);
  await pool.query("UPDATE students SET parent_name = ? WHERE parent_id = ?", [input.name, userId]).catch(() => undefined);
  await pool.query("UPDATE students SET name = ? WHERE user_id = ?", [input.name, userId]).catch(() => undefined);
  await pool.query("UPDATE teachers SET name = ?, email = COALESCE(?, email), phone = COALESCE(?, phone) WHERE user_id = ?", [input.name, input.email || null, input.phone || null, userId]).catch(() => undefined);
  return user;
}
