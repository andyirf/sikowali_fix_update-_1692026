import express from "express";
import path from "path";
import dotenv from "dotenv";
import { mkdir, writeFile } from "fs/promises";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import JSZip from "jszip";
import { AISettings, SIKOWALIDatabase } from "./src/types.js";
import {
  initializeDatabase,
  isUsingMariaDB,
  isUsingPostgreSQL,
  getFullDatabase,
  getPortalDatabase,
  getSchoolSettings,
  authenticateUser,
  saveScores,
  saveScoreDetails,
  saveAttendance,
  saveAllAttendance,
  saveDailyAttendance,
  createBehaviourLog,
  saveChatbotBackup,
  getAIChatQuota,
  reserveAIChatQuota,
  releaseAIChatQuota,
  getChatbotBackups,
  commentKarya,
  postAnnouncement,
  createParentingArticle,
  updateParentingArticle,
  deleteParentingArticle,
  postFeedback,
  likeFeedback,
  commentFeedback,
  getAllStudents,
  createUser,
  reviewParentRegistration,
  createStudent,
  upsertImportedStudent,
  createTeacher,
  createKarya,
  getUserById,
  updateUser,
  deleteUser,
  updateStudent,
  deleteStudent,
  updateTeacher,
  deleteTeacher,
  createClass,
  updateClass,
  deleteClass,
  getAISettings,
  saveAISettings,
  saveSchoolSettings,
  updateAccessPermission,
  setNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  saveProfile,
} from "./server-db.js";

dotenv.config();

const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(express.json({ limit: "10mb" }));

const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 10 * 60 * 1000;
const SESSION_COOKIE_NAME = "sikowali_session";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const CSRF_EXEMPT_PATHS = new Set(["/api/login", "/api/register-parent"]);
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const FEEDBACK_WINDOW_MS = 60 * 1000;
const MAX_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024;
const sessions = new Map<string, { user: any; expiresAt: number }>();
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const feedbackAttempts = new Map<string, { count: number; resetAt: number }>();
const UPLOAD_ROOT = path.join(process.cwd(), "storage", "uploads");
const PROFILE_UPLOAD_DIR = path.join(UPLOAD_ROOT, "profiles");
const GENERAL_UPLOAD_DIR = path.join(UPLOAD_ROOT, "files");
const KARYA_UPLOAD_DIR = path.join(UPLOAD_ROOT, "karya");
const PARENTING_UPLOAD_DIR = path.join(UPLOAD_ROOT, "parenting");

app.use("/uploads", express.static(UPLOAD_ROOT));

function cleanCell(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function columnIndex(cellRef: string) {
  const letters = cellRef.replace(/[0-9]/g, "").toUpperCase();
  return letters.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

async function worksheetToStudentRows(buffer: Buffer, fallbackClassName: string) {
  const zip = await JSZip.loadAsync(buffer);
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const sharedStrings = sharedXml
    ? Array.from(sharedXml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)).map((match) =>
        decodeXml(Array.from(match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)).map((text) => text[1]).join(""))
      )
    : [];
  const sheetXml = await zip.file("xl/worksheets/sheet1.xml")?.async("string");
  if (!sheetXml) throw new Error("Sheet Excel tidak ditemukan.");
  const rows: string[][] = [];
  for (const rowMatch of sheetXml.matchAll(/<(?:\w+:)?row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
    const rowIndex = Number(rowMatch[1]) - 1;
    rows[rowIndex] = rows[rowIndex] || [];
    for (const cellMatch of rowMatch[2].matchAll(/<(?:\w+:)?c[^>]*r="([A-Z]+\d+)"[^>]*(?:t="([^"]+)")?[^>]*>([\s\S]*?)<\/(?:\w+:)?c>/g)) {
      const ref = cellMatch[1];
      const type = cellMatch[2];
      const body = cellMatch[3];
      const valueMatch = body.match(/<(?:\w+:)?v[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/);
      const inlineMatch = body.match(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/);
      const rawValue = decodeXml(valueMatch?.[1] ?? inlineMatch?.[1] ?? "");
      rows[rowIndex][columnIndex(ref)] = type === "s" ? sharedStrings[Number(rawValue)] || "" : rawValue;
    }
  }
  const normalizeHeader = (value: unknown) => cleanCell(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  const headerRowIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === "NIS"));
  const headerRow = headerRowIndex >= 0 ? rows[headerRowIndex] : [];
  const headerIndex = (...candidates: string[]) => {
    const normalizedCandidates = candidates.map(normalizeHeader);
    const index = headerRow.findIndex((cell) => normalizedCandidates.includes(normalizeHeader(cell)));
    return index >= 0 ? index : null;
  };
  const dataStartRow = headerRowIndex >= 0 ? headerRowIndex + 2 : 5;
  const dataRows = rows
    .map((row, index) => ({ row, excelRow: index + 1 }))
    .filter(({ row, excelRow }) => excelRow >= dataStartRow && row.some((cell) => cleanCell(cell)));
  const getValue = (row: unknown[], header: number | null, fallbackIndex: number) => cleanCell(row[header ?? fallbackIndex]);
  const nameColumnIndex = headerIndex("NAMA MURID", "NAMA SISWA", "NAMA PESERTA DIDIK", "NAMA PESERTA");
  const nisColumnIndex = headerIndex("NIS");
  const nisnColumnIndex = headerIndex("NISN");
  const genderColumnIndex = headerIndex("L/P", "LP", "JENIS KELAMIN");
  const birthPlaceColumnIndex = headerIndex("TEMPAT LAHIR");
  const birthDateColumnIndex = headerIndex("TANGGAL LAHIR");
  const religionColumnIndex = headerIndex("AGAMA");
  const previousSchoolColumnIndex = headerIndex("PENDIDIKAN SEBELUMNYA");
  const addressColumnIndex = headerIndex("ALAMAT PESERTA DIDIK", "ALAMAT SISWA");
  const districtColumnIndex = headerIndex("KEC SISWA", "KEC", "KECAMATAN SISWA");
  const cityColumnIndex = headerIndex("KAB SISWA", "KAB", "KABUPATEN SISWA", "KOTA SISWA");
  const provinceColumnIndex = headerIndex("PROV SISWA", "PROV", "PROVINSI SISWA", "PROPINSI SISWA");
  const fatherNameColumnIndex = headerIndex("NAMA AYAH");
  const motherNameColumnIndex = headerIndex("NAMA IBU");
  const fatherJobColumnIndex = headerIndex("PEKERJAAN AYAH");
  const motherJobColumnIndex = headerIndex("PEKERJAAN IBU");
  const parentStreetColumnIndex = headerIndex("ALAMAT ORANG TUA", "JALAN ORANG TUA");
  const parentVillageColumnIndex = headerIndex("DESA ORANG TUA", "KELURAHAN DESA", "KELURAHAN DESA ORANG TUA");

  return dataRows.map(({ row, excelRow }) => {
    const nis = getValue(row, nisColumnIndex, 1);
    return {
      excelRow,
      name: getValue(row, nameColumnIndex, 21),
      nis,
      className: fallbackClassName,
      nisn: getValue(row, nisnColumnIndex, 2),
      gender: getValue(row, genderColumnIndex, 3),
      birthPlace: getValue(row, birthPlaceColumnIndex, 4),
      birthDate: getValue(row, birthDateColumnIndex, 5),
      religion: getValue(row, religionColumnIndex, 6),
      previousSchool: getValue(row, previousSchoolColumnIndex, 7),
      address: getValue(row, addressColumnIndex, 8),
      district: getValue(row, districtColumnIndex, 9),
      city: getValue(row, cityColumnIndex, 10),
      province: getValue(row, provinceColumnIndex, 11),
      fatherName: getValue(row, fatherNameColumnIndex, 12),
      motherName: getValue(row, motherNameColumnIndex, 13),
      fatherJob: getValue(row, fatherJobColumnIndex, 14),
      motherJob: getValue(row, motherJobColumnIndex, 15),
      parentAddressStreet: getValue(row, parentStreetColumnIndex, 16),
      parentAddressVillage: getValue(row, parentVillageColumnIndex, 17),
    };
  });
}

function isRateLimited(bucket: Map<string, { count: number; resetAt: number }>, key: string, max: number, windowMs: number) {
  const now = Date.now();
  const current = bucket.get(key);
  if (!current || current.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > max;
}

function hasValidImageSignature(mime: string, buffer: Buffer) {
  if (mime === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/jpeg" || mime === "image/jpg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/webp") return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf("=");
        const key = separator >= 0 ? item.slice(0, separator) : item;
        const value = separator >= 0 ? item.slice(separator + 1) : "";
        return [key, decodeURIComponent(value)];
      })
  );
}

function setSessionCookie(res: express.Response, token: string) {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
}

function clearSessionCookie(res: express.Response) {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

async function ensureUploadDirectories() {
  await Promise.all([
    mkdir(PROFILE_UPLOAD_DIR, { recursive: true }),
    mkdir(GENERAL_UPLOAD_DIR, { recursive: true }),
    mkdir(KARYA_UPLOAD_DIR, { recursive: true }),
    mkdir(PARENTING_UPLOAD_DIR, { recursive: true }),
  ]);
}

async function persistDataUrl(dataUrl: string, targetDir: string, publicSegment: string) {
  if (!dataUrl?.startsWith("data:")) return dataUrl || "";
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) throw new Error("Format foto tidak didukung. Gunakan PNG, JPG, JPEG, atau WebP.");
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > MAX_IMAGE_UPLOAD_BYTES) throw new Error("Ukuran foto maksimal 2MB.");
  if (!hasValidImageSignature(match[1], buffer)) throw new Error("Isi file foto tidak sesuai dengan format gambar.");
  const ext = match[1].split("/")[1].replace("jpeg", "jpg");
  const filename = `${Date.now()}-${randomUUID()}.${ext}`;
  await writeFile(path.join(targetDir, filename), buffer);
  return `/uploads/${publicSegment}/${filename}`;
}

function getSessionUser(req: express.Request) {
  const headerToken = String(req.headers["x-session-token"] || "");
  const cookieToken = parseCookies(String(req.headers.cookie || ""))[SESSION_COOKIE_NAME] || "";
  const token = headerToken || cookieToken;
  const session = token ? sessions.get(token) : null;
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session.user;
}

function getSessionToken(req: express.Request) {
  const headerToken = String(req.headers["x-session-token"] || "");
  const cookieToken = parseCookies(String(req.headers.cookie || ""))[SESSION_COOKIE_NAME] || "";
  return headerToken || cookieToken;
}

function normalizeOrigin(value = "") {
  try {
    const parsed = new URL(value);
    return parsed.origin;
  } catch {
    return "";
  }
}

function getAllowedOrigins(req: express.Request) {
  const host = String(req.headers.host || "");
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || (process.env.NODE_ENV === "production" ? "https" : "http");
  const configuredOrigins = [
    process.env.APP_URL,
    process.env.FRONTEND_URL,
    process.env.ALLOWED_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => normalizeOrigin(value.trim()))
    .filter(Boolean);
  const requestOrigin = host ? `${protocol}://${host}` : "";
  return new Set([requestOrigin, ...configuredOrigins].filter(Boolean));
}

function isAllowedRequestOrigin(req: express.Request, requestOrigin: string) {
  if (!requestOrigin) return false;
  if (getAllowedOrigins(req).has(requestOrigin)) return true;
  try {
    const requestHost = String(req.headers.host || "");
    return !!requestHost && new URL(requestOrigin).host === requestHost;
  } catch {
    return false;
  }
}

function getRequestOrigin(req: express.Request) {
  const origin = normalizeOrigin(String(req.headers.origin || ""));
  if (origin) return origin;
  return normalizeOrigin(String(req.headers.referer || ""));
}

function protectUnsafeRequests(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!UNSAFE_METHODS.has(req.method)) return next();

  const requestOrigin = getRequestOrigin(req);
  if (requestOrigin && !isAllowedRequestOrigin(req, requestOrigin)) {
    return res.status(403).json({ error: "Request ditolak karena origin tidak diizinkan." });
  }
  if (!requestOrigin && process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Request ditolak karena origin tidak terverifikasi." });
  }

  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();

  const headerToken = String(req.headers["x-session-token"] || "");
  const cookieToken = parseCookies(String(req.headers.cookie || ""))[SESSION_COOKIE_NAME] || "";
  if (cookieToken && headerToken !== cookieToken) {
    return res.status(403).json({ error: "Request ditolak karena token CSRF tidak valid." });
  }

  return next();
}

app.use(protectUnsafeRequests);

function isAdminLike(role?: string) {
  return role === "Admin" || role === "Administrator";
}

function isAdministrator(role?: string) {
  return role === "Administrator";
}

function isWaliKelas(role?: string) {
  return role === "WaliKelas";
}

function isKepalaLike(role?: string) {
  return role === "Guru" || role === "kepalasekolah";
}

function portalLabel(role?: string) {
  if (role === "orangtua") return "Portal Orang Tua";
  if (role === "WaliKelas") return "Portal Wali Kelas";
  if (role === "Guru") return "Portal Guru";
  if (role === "Admin") return "Portal Admin";
  if (role === "Administrator") return "Portal Administrator";
  if (role === "kepalasekolah") return "Portal Kepala Sekolah";
  if (role === "Murid") return "Portal Murid";
  return "Portal SIKOWALI";
}

function sanitizePortalDatabase(db: SIKOWALIDatabase, sessionUser: any) {
  const scopedStudents = db.visibleStudents?.length ? db.visibleStudents : db.student ? [db.student] : [];
  const canSeeManagementData = isAdminLike(sessionUser?.role) || isWaliKelas(sessionUser?.role) || isKepalaLike(sessionUser?.role);
  const scopedClasses = new Set(scopedStudents.map((student) => student.className));
  const scopedParentUsers = (db.users || []).filter((user) => user.role === "orangtua");
  const publicTeachers = (db.teachers || [])
    .filter((teacher) => scopedClasses.has(teacher.className))
    .map((teacher) => ({ ...teacher, phone: "", graduate: "", address: "", email: "" }));

  return {
    ...db,
    students: canSeeManagementData ? db.students : scopedStudents,
    users: isAdminLike(sessionUser?.role) ? db.users : isWaliKelas(sessionUser?.role) ? scopedParentUsers : [],
    teachers: canSeeManagementData ? db.teachers : publicTeachers,
    aiSettings: isAdministrator(sessionUser?.role) ? db.aiSettings : undefined,
    accessMatrix: isAdministrator(sessionUser?.role) ? db.accessMatrix : [],
  };
}

async function assertCanManageUserRole(sessionUser: any, targetUserId?: string, nextRole?: string) {
  if (isWaliKelas(sessionUser?.role)) {
    if (nextRole && nextRole !== "orangtua") {
      return "Wali kelas hanya dapat membuat atau mengubah user role orang tua.";
    }
    if (targetUserId) {
      const target = await getUserById(targetUserId);
      if (target?.role !== "orangtua") {
        return "Wali kelas hanya dapat mengubah user role orang tua.";
      }
      const portal = await getPortalDatabase(sessionUser.id);
      const visibleStudentIds = new Set((portal.visibleStudents || []).map((student) => student.id));
      const linkedStudents = (await getAllStudents()).filter((student) => student.parentId === targetUserId);
      const isLinkedOutsideClass = linkedStudents.some((student) => !visibleStudentIds.has(student.id));
      if (isLinkedOutsideClass) {
        return "Wali kelas hanya dapat mengelola orang tua yang terhubung dengan kelas walinya.";
      }
    }
    return null;
  }
  if (isAdministrator(sessionUser?.role)) return null;
  const protectedRoles = ["Admin", "Administrator"];
  if (nextRole && protectedRoles.includes(nextRole)) {
    return "Admin tidak dapat membuat atau mengubah user role Admin atau Administrator.";
  }
  if (targetUserId) {
    const target = await getUserById(targetUserId);
    if (target?.role && protectedRoles.includes(target.role)) {
      return "Admin tidak dapat mengubah, menonaktifkan, atau menghapus user role Admin dan Administrator.";
    }
  }
  return null;
}

// Initialize Gemini client lazily or safely
let ai: GoogleGenAI | null = null;
const API_KEY = process.env.GEMINI_API_KEY;

if (API_KEY) {
  try {
    ai = new GoogleGenAI({
      apiKey: API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API initialized successfully on server-side.");
  } catch (err) {
    console.error("Failed to initialize Gemini API:", err);
  }
} else {
  console.warn("GEMINI_API_KEY is not configured in environment variables. Falling back to structured templates.");
}

function normalizeProvider(provider = "Gemini") {
  return provider.toLowerCase().replace(/\s+/g, "");
}

function getProviderDefaults(provider: string) {
  const normalized = normalizeProvider(provider);
  if (normalized === "openai") return { apiKeyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" };
  if (normalized === "openrouter") return { apiKeyEnv: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1" };
  if (normalized === "anthropic") return { apiKeyEnv: "ANTHROPIC_API_KEY", baseUrl: "https://api.anthropic.com/v1" };
  if (normalized === "custom") return { apiKeyEnv: "AI_API_KEY", baseUrl: "http://localhost:11434/v1" };
  return { apiKeyEnv: "GEMINI_API_KEY", baseUrl: "" };
}

function configuredApiKey(settings: AISettings) {
  const defaults = getProviderDefaults(settings.provider);
  const envName = settings.apiKeyEnv || defaults.apiKeyEnv;
  return { envName, key: process.env[envName] || "" };
}

function parseJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned || "{}");
}

async function generateWithConfiguredAI(settings: AISettings, input: { systemInstruction: string; prompt?: string; messages?: { role: string; content: string }[]; json?: boolean }) {
  if (settings.enabled === false) throw new Error("AI sedang nonaktif di Setting AI.");
  const provider = normalizeProvider(settings.provider);
  const defaults = getProviderDefaults(settings.provider);
  const { envName, key } = configuredApiKey(settings);
  if (!key) throw new Error(`API key belum tersedia di .env: ${envName}`);
  const model = settings.model || "gemini-3.5-flash";
  const baseUrl = (settings.baseUrl || defaults.baseUrl || "").replace(/\/$/, "");
  const userContent = input.prompt || input.messages?.map((m) => `${m.role}: ${m.content}`).join("\n") || "";

  if (provider === "gemini") {
    const gemini = new GoogleGenAI({ apiKey: key });
    const contents = input.messages
      ? input.messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }))
      : userContent;
    const response = await gemini.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: input.systemInstruction,
        responseMimeType: input.json ? "application/json" : undefined,
        temperature: input.json ? 0.3 : 0.4,
      },
    });
    return response.text || "";
  }

  if (provider === "anthropic") {
    const response = await fetch(`${baseUrl || "https://api.anthropic.com/v1"}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: input.json ? 1800 : 900,
        temperature: input.json ? 0.3 : 0.4,
        system: input.systemInstruction,
        messages: input.messages?.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })) || [{ role: "user", content: userContent }],
      }),
    });
    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || `Anthropic API gagal (${response.status}).`);
    return data.content?.map((item: any) => item.text || "").join("") || "";
  }

  const response = await fetch(`${baseUrl || "https://api.openai.com/v1"}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      ...(provider === "openrouter" ? { "HTTP-Referer": process.env.APP_URL || "http://localhost:3000", "X-Title": "SIKOWALI" } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: input.json ? 0.3 : 0.4,
      response_format: input.json ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: input.systemInstruction },
        ...(input.messages || [{ role: "user", content: userContent }]),
      ],
    }),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `${settings.provider} API gagal (${response.status}).`);
  return data.choices?.[0]?.message?.content || "";
}

// API Endpoints:
app.get("/api/school-settings", async (_req, res) => {
  try {
    res.json({ settings: await getSchoolSettings() });
  } catch (err) {
    res.status(500).json({ error: "Gagal memuat data sekolah.", details: (err as any).message });
  }
});

app.get("/api/db", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "Sesi login diperlukan untuk membaca data portal." });
    }
    const resDb = await getPortalDatabase(
      sessionUser.id,
      String(req.query.studentId || ""),
      String(req.query.className || "")
    );
    res.json({ ...sanitizePortalDatabase(resDb, sessionUser), isUsingMariaDB: isUsingMariaDB(), isUsingPostgreSQL: isUsingPostgreSQL() });
  } catch (err) {
    res.status(500).json({ error: "Gagal memuat basis data.", details: (err as any).message });
  }
});

app.get("/api/session", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    const token = getSessionToken(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "Sesi login tidak aktif." });
    }
    const db = await getPortalDatabase(
      sessionUser.id,
      String(req.query.studentId || ""),
      String(req.query.className || "")
    );
    res.json({ success: true, user: sessionUser, sessionToken: token, db: sanitizePortalDatabase(db, sessionUser) });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memulihkan sesi login.", details: err.message });
  }
});

app.post("/api/session/keep-alive", async (req, res) => {
  const sessionUser = getSessionUser(req);
  const token = getSessionToken(req);
  if (!sessionUser || !token) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Sesi login tidak aktif." });
  }
  setSessionCookie(res, token);
  res.json({ success: true });
});

app.post("/api/register-parent", async (req, res) => {
  res.status(403).json({ error: "Pendaftaran mandiri dinonaktifkan. Hubungi admin sekolah untuk membuat akun orang tua." });
});

app.post("/api/login", async (req, res) => {
  const rateKey = req.ip || req.socket.remoteAddress || "unknown";
  if (isRateLimited(loginAttempts, rateKey, 10, LOGIN_WINDOW_MS)) {
    return res.status(429).json({ error: "Terlalu banyak percobaan login. Coba lagi beberapa menit lagi." });
  }
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }
  try {
    const user = await authenticateUser(username, password);
    if (!user) {
      return res.status(401).json({ error: "Username atau password tidak sesuai." });
    }
    const token = randomUUID();
    sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
    setSessionCookie(res, token);
    const db = await getPortalDatabase(user.id);
    res.json({ success: true, user, sessionToken: token, db: sanitizePortalDatabase(db, user) });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal login.", details: err.message });
  }
});

app.post("/api/logout", async (req, res) => {
  const headerToken = String(req.headers["x-session-token"] || "");
  const cookieToken = parseCookies(String(req.headers.cookie || ""))[SESSION_COOKIE_NAME] || "";
  const token = headerToken || cookieToken;
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get("/api/students", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdminLike(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya admin yang dapat membaca seluruh daftar murid." });
    }
    const students = await getAllStudents();
    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: "Gagal memuat data murid.", details: (err as any).message });
  }
});


app.post("/api/scores", async (req, res) => {
  const { scores, studentId } = req.body;
  const sessionUser = getSessionUser(req);
  if (!sessionUser || !(isWaliKelas(sessionUser.role) || isAdminLike(sessionUser.role))) {
    return res.status(403).json({ error: "Hanya wali kelas, admin, dan administrator yang dapat mengubah nilai." });
  }
  if (Array.isArray(scores)) {
    try {
      const portal = await getPortalDatabase(sessionUser.id, studentId);
      if (isWaliKelas(sessionUser.role) && studentId && portal.student.id !== studentId) {
        return res.status(403).json({ error: "Anda tidak memiliki akses ke murid ini." });
      }
      const computed = scores.map(s => {
        const avg = Math.round((s.tugas + s.uh1 + s.uh2 + s.uts + s.uas) / 5);
        return { ...s, rataRata: avg };
      });
      const result = await saveScores(computed, studentId);
      res.json({ success: true, scores: result });
    } catch (err: any) {
      res.status(500).json({ error: "Gagal menyimpan nilai", details: err.message });
    }
  } else {
    res.status(400).json({ error: "Invalid scores data" });
  }
});

app.post("/api/score-details", async (req, res) => {
  const { studentId, details } = req.body;
  const sessionUser = getSessionUser(req);
  if (!sessionUser || !(isWaliKelas(sessionUser.role) || isAdminLike(sessionUser.role))) {
    return res.status(403).json({ error: "Hanya wali kelas, admin, dan administrator yang dapat mengubah detail nilai." });
  }
  if (!studentId || !Array.isArray(details)) {
    return res.status(400).json({ error: "Data detail nilai tidak lengkap." });
  }
  try {
    const portal = await getPortalDatabase(sessionUser.id, studentId);
    if (isWaliKelas(sessionUser.role) && portal.student.id !== studentId) {
      return res.status(403).json({ error: "Anda tidak memiliki akses ke murid ini." });
    }
    const scoreDetails = await saveScoreDetails(studentId, details);
    const refreshed = await getPortalDatabase(sessionUser.id, studentId, portal.selectedClassName);
    res.json({ success: true, scoreDetails, scores: refreshed.scores });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menyimpan detail nilai", details: err.message });
  }
});

app.post("/api/attendance", async (req, res) => {
  const { index, record, studentId } = req.body;
  const sessionUser = getSessionUser(req);
  if (!sessionUser || !isWaliKelas(sessionUser.role)) {
    return res.status(403).json({ error: "Hanya wali kelas yang dapat mengubah absensi." });
  }
  try {
    const portal = await getPortalDatabase(sessionUser.id, studentId);
    if (studentId && portal.student.id !== studentId) {
      return res.status(403).json({ error: "Anda tidak memiliki akses ke murid ini." });
    }
    if (typeof index === "number" && record) {
      const total = record.hadir + record.sakit + record.izin + record.alpha;
      const pct = total > 0 ? Math.round((record.hadir / total) * 100) : 0;
      const recordWithPct = { ...record, persentase: pct };
      const result = await saveAttendance(record.month, recordWithPct, studentId);
      res.json({ success: true, attendance: result });
    } else if (Array.isArray(req.body.attendance)) {
      const result = await saveAllAttendance(req.body.attendance, studentId);
      res.json({ success: true, attendance: result });
    } else {
      res.status(400).json({ error: "Invalid attendance data" });
    }
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memperbarui absensi", details: err.message });
  }
});

app.post("/api/attendance/day", async (req, res) => {
  const { studentId, date, status, note } = req.body;
  const sessionUser = getSessionUser(req);
  if (!sessionUser || !isWaliKelas(sessionUser.role)) {
    return res.status(403).json({ error: "Hanya wali kelas yang dapat mengubah absensi." });
  }
  if (!studentId || !date || !["hadir", "sakit", "izin", "alpha"].includes(status)) {
    return res.status(400).json({ error: "Tanggal, murid, dan status absensi wajib diisi." });
  }
  try {
    const portal = await getPortalDatabase(sessionUser.id, studentId);
    if (portal.student.id !== studentId) {
      return res.status(403).json({ error: "Anda tidak memiliki akses ke murid ini." });
    }
    const result = await saveDailyAttendance({
      studentId,
      date,
      status,
      note: typeof note === "string" ? note : undefined,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memperbarui absensi harian", details: err.message });
  }
});

app.post("/api/behaviour", async (req, res) => {
  const { studentId, type, title, description } = req.body;
  const sessionUser = getSessionUser(req);
  if (!sessionUser || !(isWaliKelas(sessionUser.role) || isKepalaLike(sessionUser.role))) {
    return res.status(403).json({ error: "Hanya wali kelas, guru, dan kepala sekolah yang dapat menambahkan catatan perilaku." });
  }
  if (!studentId || !title || !description || !["Positif", "Prestasi", "Perlu Perhatian"].includes(type)) {
    return res.status(400).json({ error: "Murid, jenis catatan, judul, dan deskripsi wajib diisi." });
  }
  try {
    const portal = await getPortalDatabase(sessionUser.id, studentId);
    if (portal.student.id !== studentId) {
      return res.status(403).json({ error: "Anda tidak memiliki akses ke murid ini." });
    }
    const sourcePortal = isWaliKelas(sessionUser.role) ? "Portal Wali Kelas" : sessionUser.role === "kepalasekolah" ? "Portal Kepala Sekolah" : "Portal Guru";
    const behaviour = await createBehaviourLog({
      studentId,
      type,
      title,
      description,
      reporter: sessionUser.name || sessionUser.username,
      sourcePortal,
    });
    res.json({ success: true, behaviour });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menyimpan catatan perilaku", details: err.message });
  }
});

app.get("/api/chatbot-backups", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !["WaliKelas", "Admin", "Administrator"].includes(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya wali kelas, admin, dan administrator yang dapat melihat backup chatbot." });
    }
    const backups = await getChatbotBackups(sessionUser);
    res.json({ success: true, backups });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memuat backup chatbot", details: err.message });
  }
});

app.get("/api/class-semester-report", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isWaliKelas(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya wali kelas yang dapat membaca rekap semester kelas." });
    }
    const baseDb = await getPortalDatabase(sessionUser.id, "", String(req.query.className || ""));
    const students = baseDb.visibleStudents || [];
    const reports = [];
    for (const student of students) {
      const studentDb = await getPortalDatabase(sessionUser.id, student.id, String(req.query.className || ""));
      reports.push({
        student: studentDb.student,
        scores: studentDb.scores,
        attendance: studentDb.attendance,
        behaviour: studentDb.behaviour,
      });
    }
    res.json({ success: true, reports });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memuat rekap semester kelas.", details: err.message });
  }
});

app.post("/api/admin/users", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(isAdminLike(sessionUser.role) || isWaliKelas(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya admin atau wali kelas yang dapat menambahkan user." });
    }
    const { username, password, role, name, email, phone } = req.body;
    if (!username || !password || !role || !name) {
      return res.status(400).json({ error: "Nama, username, password, dan role wajib diisi." });
    }
    const roleError = await assertCanManageUserRole(sessionUser, undefined, role);
    if (roleError) {
      return res.status(403).json({ error: roleError });
    }
    const user = await createUser({ username, password, role, name, email, phone });
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menambahkan user.", details: err.message });
  }
});

app.patch("/api/admin/parent-registrations/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdminLike(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya admin dan administrator yang dapat memverifikasi pendaftaran." });
    }
    const action = req.body.action;
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "Aksi verifikasi tidak valid." });
    }
    await reviewParentRegistration(req.params.id, sessionUser.id, action);
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Gagal memproses pengajuan." });
  }
});

app.put("/api/admin/users/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(isAdminLike(sessionUser.role) || isWaliKelas(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya admin atau wali kelas yang dapat mengubah user." });
    }
    const roleError = await assertCanManageUserRole(sessionUser, req.params.id, req.body.role);
    if (roleError) {
      return res.status(403).json({ error: roleError });
    }
    const user = await updateUser(req.params.id, req.body);
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal mengubah user.", details: err.message });
  }
});

app.patch("/api/admin/users/:id/enabled", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(isAdminLike(sessionUser.role) || isWaliKelas(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya admin atau wali kelas yang dapat mengubah status user." });
    }
    const roleError = await assertCanManageUserRole(sessionUser, req.params.id);
    if (roleError) {
      return res.status(403).json({ error: roleError });
    }
    const user = await updateUser(req.params.id, { enabled: !!req.body.enabled });
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal mengubah status user.", details: err.message });
  }
});

app.delete("/api/admin/users/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(isAdminLike(sessionUser.role) || isWaliKelas(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya admin atau wali kelas yang dapat menghapus user." });
    }
    const roleError = await assertCanManageUserRole(sessionUser, req.params.id);
    if (roleError) {
      return res.status(403).json({ error: roleError });
    }
    await deleteUser(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menghapus user." });
  }
});

app.post("/api/admin/students", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(isAdminLike(sessionUser.role) || isWaliKelas(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya admin atau wali kelas yang dapat menambahkan murid." });
    }
    const { name, nis, className, parentName, parentId, userId } = req.body;
    if (!name || !nis || !className || !parentId) {
      return res.status(400).json({ error: "Nama murid, NIS, kelas, dan akun orang tua wajib dipilih." });
    }
    if (isWaliKelas(sessionUser.role)) {
      const portal = await getPortalDatabase(sessionUser.id);
      const classNames = new Set((portal.visibleStudents || []).map((s) => s.className));
      if (!classNames.has(className)) {
        return res.status(403).json({ error: "Wali kelas hanya dapat menambahkan murid ke kelas walinya." });
      }
    }
    const student = await createStudent({ ...req.body, name, nis, className, parentName, parentId, userId });
    res.json({ success: true, student });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menambahkan murid." });
  }
});

app.post("/api/admin/students/import-excel", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(isAdminLike(sessionUser.role) || isWaliKelas(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya admin atau wali kelas yang dapat mengimport murid." });
    }
    const { fileData, className, dryRun } = req.body;
    const targetClassName = cleanCell(className);
    if (!fileData || !targetClassName) {
      return res.status(400).json({ error: "File Excel dan kelas tujuan wajib dipilih." });
    }
    if (isWaliKelas(sessionUser.role)) {
      const portal = await getPortalDatabase(sessionUser.id);
      const classNames = new Set((portal.visibleStudents || []).map((s) => s.className));
      if (!classNames.has(targetClassName)) {
        return res.status(403).json({ error: "Wali kelas hanya dapat mengimport murid ke kelas walinya." });
      }
    }
    const base64 = String(fileData).includes(",") ? String(fileData).split(",").pop() || "" : String(fileData);
    const rows = await worksheetToStudentRows(Buffer.from(base64, "base64"), targetClassName);
    const errors: string[] = [];
    const validRows = rows.filter((row) => {
      if (!row.nis) {
        errors.push(`Baris ${row.excelRow}: NIS kosong.`);
        return false;
      }
      if (!row.name) {
        errors.push(`Baris ${row.excelRow}: nama murid kosong. Tambahkan kolom Nama Murid pada file Excel.`);
        return false;
      }
      return true;
    });
    if (dryRun) {
      return res.json({ success: true, totalRows: rows.length, validRows: validRows.length, errors, preview: validRows.slice(0, 5) });
    }
    let created = 0;
    let updated = 0;
    for (const row of validRows) {
      const result = await upsertImportedStudent(row);
      if (result.action === "created") created += 1;
      else updated += 1;
    }
    res.json({ success: true, totalRows: rows.length, validRows: validRows.length, created, updated, errors });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal import Excel murid." });
  }
});

app.put("/api/admin/students/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(isAdminLike(sessionUser.role) || isWaliKelas(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya admin atau wali kelas yang dapat mengubah data murid." });
    }
    let payload = req.body;
    if (isWaliKelas(sessionUser.role)) {
      const portal = await getPortalDatabase(sessionUser.id, req.params.id);
      if (portal.student.id !== req.params.id) {
        return res.status(403).json({ error: "Wali kelas hanya dapat mengubah murid dalam kelas walinya." });
      }
      payload = { ...req.body, className: portal.student.className };
    }
    const student = await updateStudent(req.params.id, payload);
    res.json({ success: true, student });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal mengubah data murid." });
  }
});

app.patch("/api/admin/students/:id/enabled", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(isAdminLike(sessionUser.role) || isWaliKelas(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya admin atau wali kelas yang dapat mengubah status murid." });
    }
    if (isWaliKelas(sessionUser.role)) {
      const portal = await getPortalDatabase(sessionUser.id, req.params.id);
      if (portal.student.id !== req.params.id) {
        return res.status(403).json({ error: "Wali kelas hanya dapat mengubah status murid dalam kelas walinya." });
      }
    }
    const student = await updateStudent(req.params.id, { enabled: !!req.body.enabled });
    res.json({ success: true, student });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal mengubah status murid.", details: err.message });
  }
});

app.delete("/api/admin/students/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(isAdminLike(sessionUser.role) || isWaliKelas(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya admin atau wali kelas yang dapat menghapus murid." });
    }
    if (isWaliKelas(sessionUser.role)) {
      const portal = await getPortalDatabase(sessionUser.id, req.params.id);
      if (portal.student.id !== req.params.id) {
        return res.status(403).json({ error: "Wali kelas hanya dapat menghapus murid dalam kelas walinya." });
      }
    }
    await deleteStudent(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menghapus murid.", details: err.message });
  }
});

app.post("/api/admin/teachers", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdminLike(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya admin yang dapat menambahkan guru." });
    }
    const { name, className, position, teacherNumber, phone, graduate, address, email, userId } = req.body;
    if (!name || !className || !position || !teacherNumber || !phone || !graduate || !address || !email) {
      return res.status(400).json({ error: "Semua data guru wajib diisi." });
    }
    const teacher = await createTeacher({ name, className, position, teacherNumber, phone, graduate, address, email, userId });
    res.json({ success: true, teacher });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menambahkan guru." });
  }
});

app.put("/api/admin/teachers/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdminLike(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya admin yang dapat mengubah data guru." });
    }
    const teacher = await updateTeacher(req.params.id, req.body);
    res.json({ success: true, teacher });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal mengubah data guru." });
  }
});

app.patch("/api/admin/teachers/:id/enabled", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdminLike(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya admin yang dapat mengubah status guru." });
    }
    const teacher = await updateTeacher(req.params.id, { enabled: !!req.body.enabled });
    res.json({ success: true, teacher });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal mengubah status guru.", details: err.message });
  }
});

app.delete("/api/admin/teachers/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdminLike(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya admin yang dapat menghapus guru." });
    }
    await deleteTeacher(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menghapus guru.", details: err.message });
  }
});

app.post("/api/admin/classes", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdminLike(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya admin yang dapat menambahkan kelas." });
    }
    const { name, homeroomTeacherId, academicYear, semester } = req.body;
    if (!String(name || "").trim()) return res.status(400).json({ error: "Nama kelas wajib diisi." });
    res.json({ success: true, classRoom: await createClass({ name, homeroomTeacherId, academicYear, semester }) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menambahkan kelas." });
  }
});

app.put("/api/admin/classes/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdminLike(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya admin yang dapat mengubah kelas." });
    }
    const { name, homeroomTeacherId, academicYear, semester } = req.body;
    if (!String(name || "").trim()) return res.status(400).json({ error: "Nama kelas wajib diisi." });
    res.json({ success: true, classRoom: await updateClass(req.params.id, { name, homeroomTeacherId, academicYear, semester }) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal mengubah kelas." });
  }
});

app.delete("/api/admin/classes/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdminLike(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya admin yang dapat menghapus kelas." });
    }
    await deleteClass(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal menghapus kelas." });
  }
});

app.get("/api/admin/ai-settings", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdministrator(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya Administrator yang dapat membaca setting AI." });
    }
    res.json({ settings: await getAISettings() });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal membaca setting AI.", details: err.message });
  }
});

app.post("/api/admin/ai-settings", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdministrator(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya Administrator yang dapat mengubah setting AI." });
    }
    res.json({ success: true, settings: await saveAISettings(req.body) });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menyimpan setting AI.", details: err.message });
  }
});

app.post("/api/admin/restart", async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ error: "Restart aplikasi dinonaktifkan di mode produksi. Gunakan process manager atau panel server." });
    }
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdministrator(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya Administrator yang dapat me-restart aplikasi." });
    }
    res.json({ success: true, message: "Restart aplikasi dimulai. Silakan tunggu beberapa detik lalu muat ulang halaman." });

    setTimeout(() => {
      const args = [...process.execArgv, ...process.argv.slice(1)];
      const child = spawn(process.execPath, args, {
        cwd: process.cwd(),
        env: { ...process.env, SIKOWALI_RESTARTED_AT: new Date().toISOString() },
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      process.exit(0);
    }, 300);
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memulai restart aplikasi.", details: err.message });
  }
});

app.post("/api/admin/school-settings", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdminLike(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya admin yang dapat mengubah data sekolah." });
    }
    const logoUrl = await persistDataUrl(req.body.logoUrl || "", GENERAL_UPLOAD_DIR, "files");
    const settings = await saveSchoolSettings({ ...req.body, logoUrl });
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menyimpan data sekolah.", details: err.message });
  }
});

app.patch("/api/admin/access-permissions", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !isAdministrator(sessionUser.role)) {
      return res.status(403).json({ error: "Hanya Administrator yang dapat mengubah matriks hak akses." });
    }
    const { featureId, role, permission, value } = req.body;
    if (!featureId || !role || !permission) {
      return res.status(400).json({ error: "featureId, role, dan permission wajib diisi." });
    }
    await updateAccessPermission({ featureId, role, permission, value: !!value });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menyimpan hak akses.", details: err.message });
  }
});

app.post("/api/comment-karya", async (req, res) => {
  const { karyaId, author, text } = req.body;
  const sessionUser = getSessionUser(req);
  if (!sessionUser || !(isWaliKelas(sessionUser.role) || isAdminLike(sessionUser.role))) {
    return res.status(403).json({ error: "Dokumentasi & Karya hanya dapat dikomentari oleh wali kelas atau admin." });
  }
  if (!karyaId || !text) {
    return res.status(400).json({ error: "karyaId and text are required" });
  }
  try {
    const result = await commentKarya(karyaId, author || "Budi Santoso", text);
    res.json({ success: true, karya: result });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menyimpan komentar karya", details: err.message });
  }
});

app.post("/api/karya", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(isWaliKelas(sessionUser.role) || isAdminLike(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya wali kelas atau admin yang dapat menambahkan dokumentasi karya." });
    }
    const { studentId, title, category, description, imageUrl } = req.body;
    if (!studentId || !title || !category || !description) {
      return res.status(400).json({ error: "studentId, judul, kategori, dan deskripsi wajib diisi." });
    }
    const portal = await getPortalDatabase(sessionUser.id, studentId);
    if (isWaliKelas(sessionUser.role) && portal.student.id !== studentId) {
      return res.status(403).json({ error: "Wali kelas hanya dapat menambah karya untuk murid dalam kelas walinya." });
    }
    const fallbackImage = "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=500&auto=format&fit=crop&q=60";
    const karya = await createKarya({ studentId, title, category, description, imageUrl: imageUrl || fallbackImage });
    res.json({ success: true, karya });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menyimpan dokumentasi karya.", details: err.message });
  }
});

app.patch("/api/notifications/:id/read", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ error: "Sesi login diperlukan." });
    await setNotificationRead(sessionUser, req.params.id, !!req.body.isRead);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal mengubah status notifikasi.", details: err.message });
  }
});

app.post("/api/notifications/mark-all-read", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ error: "Sesi login diperlukan." });
    await markAllNotificationsRead(sessionUser);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menandai semua notifikasi.", details: err.message });
  }
});

app.delete("/api/notifications/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ error: "Sesi login diperlukan." });
    await deleteNotification(sessionUser, req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menghapus notifikasi.", details: err.message });
  }
});

app.post("/api/announcements", async (req, res) => {
  const { title, content, isImportant, category, author } = req.body;
  if (!title || !content) {
    return res.status(400).json({ error: "Title and content are required" });
  }
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser || !(["WaliKelas", "Guru", "kepalasekolah"].includes(sessionUser.role) || isAdminLike(sessionUser.role))) {
      return res.status(403).json({ error: "Hanya wali kelas, guru, kepala sekolah, atau admin yang dapat membuat pengumuman." });
    }
    const imageUrl = await persistDataUrl(req.body.imageUrl || "", GENERAL_UPLOAD_DIR, "files");
    const result = await postAnnouncement(title, content, category, author, !!isImportant, imageUrl);
    res.json({ success: true, announcements: result });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memposting pengumuman", details: err.message });
  }
});

function canManageParenting(role?: string) {
  return role === "WaliKelas" || role === "Guru" || role === "kepalasekolah" || isAdminLike(role);
}

app.post("/api/parenting", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!canManageParenting(sessionUser?.role)) {
      return res.status(403).json({ error: "Hanya guru, kepala sekolah, atau admin yang dapat menambahkan materi parenting." });
    }
    const { title, category, summary, content, author } = req.body;
    const imageUrl = await persistDataUrl(req.body.imageUrl || "", PARENTING_UPLOAD_DIR, "parenting");
    if (!title || !summary || !content) {
      return res.status(400).json({ error: "Judul, ringkasan, dan isi materi wajib diisi." });
    }
    const parenting = await createParentingArticle({ title, category, summary, content, author: author || sessionUser.name || "Tim Sekolah", imageUrl });
    res.json({ success: true, parenting });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menambahkan materi parenting", details: err.message });
  }
});

app.put("/api/parenting/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!canManageParenting(sessionUser?.role)) {
      return res.status(403).json({ error: "Hanya guru, kepala sekolah, atau admin yang dapat mengubah materi parenting." });
    }
    const imageUrl = await persistDataUrl(req.body.imageUrl || "", PARENTING_UPLOAD_DIR, "parenting");
    const parenting = await updateParentingArticle(req.params.id, { ...req.body, imageUrl });
    res.json({ success: true, parenting });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal mengubah materi parenting", details: err.message });
  }
});

app.delete("/api/parenting/:id", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!canManageParenting(sessionUser?.role)) {
      return res.status(403).json({ error: "Hanya guru, kepala sekolah, atau admin yang dapat menghapus materi parenting." });
    }
    const parenting = await deleteParentingArticle(req.params.id);
    res.json({ success: true, parenting });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menghapus materi parenting", details: err.message });
  }
});

app.post("/api/feedback", async (req, res) => {
  const { author, type, content } = req.body;
  if (!content) {
    return res.status(400).json({ error: "Feedback content is required" });
  }
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ error: "Sesi login diperlukan untuk mengirim aspirasi." });
    const rateKey = `${req.ip || req.socket.remoteAddress || "unknown"}:${sessionUser.id}`;
    if (isRateLimited(feedbackAttempts, rateKey, 20, FEEDBACK_WINDOW_MS)) {
      return res.status(429).json({ error: "Terlalu banyak aktivitas aspirasi. Coba lagi sebentar lagi." });
    }
    const result = await postFeedback(author || sessionUser.name, type, content);
    res.json({ success: true, feedback: result });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memposting aspirasi", details: err.message });
  }
});

app.post("/api/feedback/like", async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Feedback ID is required" });
  }
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ error: "Sesi login diperlukan untuk memberi suka." });
    const resultLikes = await likeFeedback(id);
    res.json({ success: true, likes: resultLikes });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memberi suka pada aspirasi", details: err.message });
  }
});

app.post("/api/feedback/comment", async (req, res) => {
  const { feedbackId, author, text } = req.body;
  if (!feedbackId || !text) {
    return res.status(400).json({ error: "feedbackId and text are required" });
  }
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ error: "Sesi login diperlukan untuk berkomentar." });
    const rateKey = `${req.ip || req.socket.remoteAddress || "unknown"}:${sessionUser.id}`;
    if (isRateLimited(feedbackAttempts, rateKey, 20, FEEDBACK_WINDOW_MS)) {
      return res.status(429).json({ error: "Terlalu banyak aktivitas aspirasi. Coba lagi sebentar lagi." });
    }
    const resultComments = await commentFeedback(feedbackId, author || sessionUser.name, text);
    res.json({ success: true, comments: resultComments });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menyimpan komentar aspirasi", details: err.message });
  }
});

app.post("/api/profile", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "Sesi login diperlukan untuk mengubah profil." });
    }
    const { name, email, phone, password } = req.body;
    const photoUrl = await persistDataUrl(req.body.photoUrl || "", PROFILE_UPLOAD_DIR, "profiles");
    if (!name) {
      return res.status(400).json({ error: "Nama profil wajib diisi." });
    }
    const user = await saveProfile(sessionUser.id, { name, email, phone, password, photoUrl });
    const headerToken = String(req.headers["x-session-token"] || "");
    const cookieToken = parseCookies(String(req.headers.cookie || ""))[SESSION_COOKIE_NAME] || "";
    const token = headerToken || cookieToken;
    if (token) sessions.set(token, { user: { ...sessionUser, ...user }, expiresAt: Date.now() + SESSION_TTL_MS });
    res.json({ success: true, user });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal menyimpan profil", details: err.message });
  }
});

// Gemini AI Analysis Endpoint
app.post("/api/gemini/analyze", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "Sesi login diperlukan untuk analisis AI." });
    }
    const db = await getPortalDatabase(sessionUser.id, req.body.studentId);
    const aiSettings = await getAISettings();

    const studentStatsDesc = `
========================================
INFORMASI AKADEMIK & DISIPLIN SISWA:
Siswa: ${db.student.name}
Kelas: ${db.student.className} (NIS: ${db.student.nis})

NILAI MATA PELAJARAN:
${db.scores.map(s => `- ${s.subject}: Tugas=${s.tugas}, UH1=${s.uh1}, UH2=${s.uh2}, UTS=${s.uts}, UAS=${s.uas}. Rata-rata=${s.rataRata} (KKM ${s.kkm})`).join("\n")}

PRESENSI:
${db.attendance.map(a => `- ${a.month}: Hadir=${a.hadir}, Sakit=${a.sakit}, Izin=${a.izin}, Alpha=${a.alpha}. Persentase=${a.persentase}%`).join("\n")}

CATATAN PERILAKU TERKINI:
${db.behaviour.map(b => `- ${b.date} [${b.type}] oleh ${b.teacher}: ${b.title}. Detail: ${b.description}`).join("\n")}
========================================
    `;

    const systemInstruction = `
    Anda adalah "SIKOWALI AI", asisten analisis performa akademis pintar terintegrasi dengan portal wali murid sekolah.
    Tugas Anda adalah memproses data nilai, kehadiran, dan perilaku murid secara objektif, mendalam, dan menggunakan pendekatan suportif-konstruktif kepada orang tua.
    Gunakan Bahasa Indonesia yang ramah, sopan, komunikatif, dan praktis. Jangan gunakan istilah-istilah ilmiah yang terlalu rumit.
    Berikan analisis terperinci dalam format JSON dengan struktur yang tepat agar dapat dirender dengan indah di web.
    `;

    const apiState = configuredApiKey(aiSettings);
    if (aiSettings.enabled === false || !apiState.key) {
      // Fallback Mock output when Gemini API Key is missing. Completely seamless and highly descriptive.
      console.log(`Using Mock AI report because AI is disabled or ${apiState.envName} is not defined.`);
      const mockReport = {
        ringkasan: `Performa ${db.student.name} secara umum stabil dan sangat baik, terlihat dari rata-rata nilai mayoritas di atas KKM. Namun, mata pelajaran IPA perlu perhatian khusus agar tetap seimbang dengan prestasinya yang gemilang di Seni Budaya dan Bahasa Indonesia.`,
        perMataPelajaran: db.scores.map(s => {
          let status = "Stabil";
          let analisis = `Nilai ${s.subject} milik ${db.student.name} tercatat dengan tugas=${s.tugas}, UTS=${s.uts}, dan UAS=${s.uas}. Rata-rata adalah ${s.rataRata}.`;
          let rekomendasi = "Pertahankan konsistensi belajar anak Anda dengan rajin mengulangi materi di rumah.";

          if (s.rataRata < s.kkm) {
            status = "Butuh Bantuan";
            analisis = `Rata-rata nilai ${s.subject} Ahmad (${s.rataRata}) berada di bawah KKM ${s.kkm}. Ini membutuhkan pendampingan ekstra terutama pada pengerjaan UH dan tugas mandiri.`;
            rekomendasi = `Disarankan orang tua bersama guru mapel ${s.subject} mendampingi Ahmad melatih pengerjaan modul latihan soal selama 15-20 menit sehari secara terbimbing.`;
          } else if (s.rataRata >= 88) {
            status = "Meningkat";
            analisis = `Sangat fantastis! Nilai rata-rata ${s.subject} mencapai ${s.rataRata}, mengukuhkan talenta unggul luar biasa Ahmad di bidang ini.`;
            rekomendasi = `Teruskan dorongan positif bapak/ibu agar minat mendalam Ahmad di bidang ${s.subject} terus berkembang optimal.`;
          }

          return { subject: s.subject, status, analisis, rekomendasi };
        }),
        saranAktivitas: [
          {
            judul: "Penyusunan Rencana Belajar Mandiri",
            saran: "Bantu Ahmad merapikan jam belajar malam dan pengerjaan PR menggunakan papan agenda kecil di kamar tidurnya agar tidak terlewat lagi.",
            icon: "ClipboardCheck"
          },
          {
            judul: "Diskusi Pembelajaran Interaktif",
            saran: "Ajak Ahmad mendiskusikan fenomena alam/ilmiah sehari-hari atau membacakan karya sastranya untuk memperkuat rasa percaya diri dan antusiasmenya.",
            icon: "Leaf"
          },
          {
            judul: "Apresiasi Proses vs Nilai Akhir",
            saran: "Berikan pujian tulus atas usaha gigih Ahmad saat bertanya aktif dan membimbing teman sekelasnya di mata pelajaran matematika.",
            icon: "Calendar"
          }
        ],
        kesimpulan: `Dengan rata-rata nilai rapor umum Ahmad mencapai rentang yang memuaskan, dukungan penuh serta pengawasan strategis orang tua di rumah pada mata pelajaran yang masih di bawah KKM adalah kunci utama kesuksesan kenaikan kelas.`
      };
      return res.json(mockReport);
    }

    const prompt = `Analisis data belajar murid bernama Ahmad Budi Santoso berikut dengan seksama. Berikan rincian yang mendalam, ramah, dan solutif.
    
    Data Murid:
    ${studentStatsDesc}

    Kembalikan output JSON yang memiliki persis struktur berikut agar tidak merusak frontend:
    {
      "ringkasan": "deskripsi teks panjang ringkasan analisis performa anak secara umum",
      "perMataPelajaran": [
        { "subject": "Nama Mapel", "status": "Meningkat" atau "Stabil" atau "Butuh Bantuan", "analisis": "penjelasan detail nilai mapel", "rekomendasi": "rekomendasi taktis orang tua" }
      ],
      "saranAktivitas": [
        { "judul": "Judul Saran", "saran": "isi saran praktis", "icon": "BookOpen" atau "Leaf" atau "Calendar" atau "ClipboardCheck" }
      ],
      "kesimpulan": "paragraf kesimpulan motivasional"
    }
    `;

    const reportText = await generateWithConfiguredAI(aiSettings, {
      systemInstruction: `${aiSettings.systemPrompt || ""}\n\n${systemInstruction}`,
      prompt,
      json: true,
    });
    const reportData = parseJsonObject(reportText);
    res.json(reportData);
  } catch (err: any) {
    console.error("AI Error in /api/gemini/analyze:", err);
    res.status(500).json({ error: "Gagal berinteraksi dengan platform AI aktif.", details: err.message });
  }
});

// Chatbot SKO AI Endpoint
app.get("/api/gemini/chat/quota", async (req, res) => {
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) return res.status(401).json({ error: "Sesi login diperlukan untuk melihat kuota chatbot." });
    res.json({ quota: await getAIChatQuota(sessionUser) });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memuat kuota chatbot.", details: err.message });
  }
});

app.post("/api/gemini/chat", async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "Invalid messages array in body." });
  }

  let reservedForUser: ReturnType<typeof getSessionUser> | undefined;
  try {
    const sessionUser = getSessionUser(req);
    if (!sessionUser) {
      return res.status(401).json({ error: "Sesi login diperlukan untuk chatbot." });
    }
    const lastQuestion = String(messages[messages.length - 1]?.content || "").trim();
    if (!lastQuestion) return res.status(400).json({ error: "Pertanyaan chatbot tidak boleh kosong." });
    if (lastQuestion.length > 500) return res.status(400).json({ error: "Pertanyaan chatbot maksimal 500 karakter." });
    const quota = await reserveAIChatQuota(sessionUser);
    if (!quota) {
      return res.status(429).json({ error: "Kuota chatbot AI bulan ini sudah habis.", quota: await getAIChatQuota(sessionUser) });
    }
    reservedForUser = sessionUser;
    const db = await getPortalDatabase(sessionUser.id, req.body.studentId);
    const aiSettings = await getAISettings();
    const backupAnswer = async (answer: string) => {
      if (!lastQuestion.trim() || !answer.trim()) return;
      await saveChatbotBackup({
        studentId: db.student?.id,
        studentName: db.student?.name,
        userId: sessionUser.id,
        userName: sessionUser.name || sessionUser.username || "Pengguna SIKOWALI",
        userRole: sessionUser.role,
        portal: portalLabel(sessionUser.role),
        question: lastQuestion,
        answer,
      });
    };

    const gradesDesc = db.scores.map(s => `- ${s.subject}: Tugas=${s.tugas}, UH1=${s.uh1}, UH2=${s.uh2}, UTS=${s.uts}, UAS=${s.uas}, Rata-rata ${s.rataRata} (KKM ${s.kkm})`).join("\n");
    const behaviorDesc = db.behaviour.map(b => `- ${b.date} [${b.type}] oleh ${b.teacher}: ${b.title}. Detail: ${b.description}`).join("\n");
    const announcementsDesc = db.announcements.slice(0, 5).map(a => `- ${a.title} (${a.date}): ${a.content}`).join("\n");

    const knowledgeBase = `
    Anda adalah "SKO AI" (Asisten Sekolah Digital SIKOWALI).
    Anda ramah, bersemangat, profesional, dan selalu siap memberikan jawaban lengkap mengenai info sekolah, pengumuman, dan data murid.
    Semua jawaban Anda disampaikan dalam Bahasa Indonesia.

    INFORMASI DATABASE SEKOLAH SIKOWALI LIVE:
    1. Siswa yang dipantau: ${db.student.name} (Kelas: ${db.student.className}, NIS: ${db.student.nis}, ID: ${db.student.id}). Orang tua yang bertanya adalah bapak/ibu dari siswa tersebut.
    2. Wali Kelas VII-A: Ibu Safitri, M.Pd.
    3. Nilai Rata-rata dan Catatan Belajar Ahmad:
${gradesDesc}
    4. Tingkat Kehadiran:
${db.attendance.map(a => `- Bulan ${a.month}: Hadir ${a.hadir} hari, Sakit ${a.sakit} hari, Izin ${a.izin} hari, Alpha ${a.alpha} hari (Persentase Kehadiran ${a.persentase}%)`).join("\n")}
    5. Catatan Disiplin/Aktivitas Siswa:
${behaviorDesc}
    6. Pengumuman Terkini Dari Sekolah:
${announcementsDesc}
    7. Kontak Utama Sekolah:
       - Layanan Tata Usaha & WhatsApp Bot: 0812-3456-7890
       - Website Resmi: https://sikowali.sch.id
       - Jam belajar reguler selesai jam 14:00 WIB setiap hari Senin - Jumat.

    ATURAN CHAT:
    - Hanya jawab pertanyaan yang masuk akal dan berdasarkan basis pengetahuan di atas.
    - Jika ditanya tentang nilai, sebutkan nilainya dengan lengkap dan beri semangat. Jika membicarakan nilai di bawah KKM (< 75), ingatkan secara santun bahwa murid perlu motivasi ekstra.
    - Selalu jawab dengan gaya santun, padat, suportif, dan ramah seperti asisten sekolah terbaik.
    - Jangan menambahkan data fiksi yang tidak ada di basis pengetahuan di atas. Jika Anda tidak mengetahui informasi atau tidak tersedia, sarankan wali murid untuk mengontak wali kelas Ibu Safitri atau Humas di nomor 0812-3456-7890.
    `;

    const apiState = configuredApiKey(aiSettings);
    if (aiSettings.enabled === false || !apiState.key) {
      console.log(`Using Mock AI chatbot response because AI is disabled or ${apiState.envName} is missing.`);
      const lastUserMsg = messages[messages.length - 1]?.content?.toLowerCase() || "";
      let reply = `Halo bapak/ibu wali murid ${db.student.name}! Saya SKO AI, asisten sekolah digital Anda. Ada yang bisa membantu hari ini? Silakan ajukan pertanyaan seputar nilai ${db.student.name}, absensi presensi, catatan perilaku, atau jadwal kegiatan sekolah terbaru.`;

      if (lastUserMsg.includes("uts") || lastUserMsg.includes("jadwal") || lastUserMsg.includes("ujian")) {
        const utsAnnNode = db.announcements.find(a => a.title.toLowerCase().includes("uts") || a.content.toLowerCase().includes("uts"));
        if (utsAnnNode) {
          reply = `Berikut info UTS terbaru dari sekolah:\n\n**${utsAnnNode.title}**\n${utsAnnNode.content}\n\n*Diposting oleh ${utsAnnNode.author} (${utsAnnNode.date})*`;
        } else {
          reply = `Jadwal UTS Semester ganjil/genap direncanakan berlangsung pertengahan musim evaluasi belajar. Silakan cek menu pengumuman utama untuk detail kalender akademis terbaru, atau tanyakan guru kelas Ibu Safitri, M.Pd.`;
        }
      } else if (lastUserMsg.includes("nilai") || lastUserMsg.includes("rapor") || lastUserMsg.includes("mata pelajaran") || lastUserMsg.includes("grade")) {
        const belowKkmList = db.scores.filter(s => s.rataRata < s.kkm);
        const gradesSummary = db.scores.map(s => `- **${s.subject}**: Rata-rata ${s.rataRata} (KKM ${s.kkm})`).join("\n");
        reply = `Tentu! Berikut ringkasan nilai belajar ${db.student.name} saat ini:\n\n${gradesSummary}\n\n`;
        if (belowKkmList.length > 0) {
          reply += `**Perhatian Khusus**: Mata pelajaran berikut masih di bawah KKM sekolah:\n` + belowKkmList.map(s => `- **${s.subject}** (Rerata ${s.rataRata} < KKM ${s.kkm})`).join("\n") + `\n\nYuk dampingi belajar ananda lebih rajin agar nilainya menanjak naik sebelum babak semesteran!`;
        } else {
          reply += `Semua nilai mata pelajaran ananda luar biasa sudah di atas batas KKM sekolah! Teruskan bimbingan yang bersinar ini ya, bapak/ibu!`;
        }
      } else if (lastUserMsg.includes("pengumuman") || lastUserMsg.includes("kegiatan") || lastUserMsg.includes("terbaru")) {
        const topAnns = db.announcements.slice(0, 3).map((a, i) => `${i + 1}. **${a.title}** (${a.date}): ${a.content}`).join("\n\n");
        reply = `Berikut 3 pengumuman utama sekolah SIKOWALI:\n\n${topAnns}\n\nAda pengumuman spesifik yang ingin bapak/ibu tanyakan lagi?`;
      } else if (lastUserMsg.includes("behavior") || lastUserMsg.includes("perilaku") || lastUserMsg.includes("sikap") || lastUserMsg.includes("disiplin")) {
        const topBehaviors = db.behaviour.slice(0, 3).map(b => `- **${b.date} [${b.type}]**: ${b.title}. ${b.description} *(oleh ${b.teacher})*`).join("\n");
        reply = `Berikut catatan perilaku/disiplin ananda ${db.student.name} di kelas:\n\n${topBehaviors}\n\nSecara menyeluruh, ia sangat rajin berkontribusi membantu guru dan teman, namun mari berkolaborasi melatih anak agar lebih disiplin jam kelas ya bapak/ibu.`;
      } else if (lastUserMsg.includes("absen") || lastUserMsg.includes("kehadiran") || lastUserMsg.includes("sakit") || lastUserMsg.includes("izin")) {
        const totalHadir = db.attendance.reduce((acc, curr) => acc + curr.hadir, 0);
        const totalSakit = db.attendance.reduce((acc, curr) => acc + curr.sakit, 0);
        const totalIzin = db.attendance.reduce((acc, curr) => acc + curr.izin, 0);
        const totalAlpha = db.attendance.reduce((acc, curr) => acc + curr.alpha, 0);
        const avgPct = Math.round(db.attendance.reduce((acc, curr) => acc + curr.persentase, 0) / db.attendance.length);

        reply = `Berikut adalah akumulasi kehadiran siswa ${db.student.name} selama semester ini:\n- **Hadir**: ${totalHadir} hari\n- **Sakit**: ${totalSakit} hari\n- **Izin**: ${totalIzin} hari\n- **Tanpa Keterangan (Alpha)**: ${totalAlpha} hari\n- **Rerata Persentase Presensi**: ${avgPct}%\n\nSangat jempolan! Pertahankan presensi positif ini.`;
      } else if (lastUserMsg.includes("contact") || lastUserMsg.includes("kontak") || lastUserMsg.includes("hubungi") || lastUserMsg.includes("nomor")) {
        reply = `Anda dapat mengontak SIKOWALI melalui beberapa saluran:\n- **WhatsApp Tata Usaha & Bot**: 0812-3456-7890\n- **Wali Kelas VII-A**: Ibu Safitri, M.Pd\n- **Situs Resmi**: https://sikowali.sch.id\n\nLayanan kantor buka Senin-Jumat pukul 07:00 hingga 14:00 WIB.`;
      }
      await backupAnswer(reply);
      return res.json({ response: reply, quota });
    }

    const text = await generateWithConfiguredAI(aiSettings, {
      systemInstruction: `${aiSettings.systemPrompt || ""}\n\n${knowledgeBase}`,
      messages: messages.slice(-10).map((m: any) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.content || "").slice(0, 1000) })),
    });

    const answer = text || "Mohon maaf, terjadi kendala saat merespons pertanyaan Anda.";
    await backupAnswer(answer);
    res.json({ response: answer, quota });
  } catch (err: any) {
    if (reservedForUser) await releaseAIChatQuota(reservedForUser).catch(() => undefined);
    console.error("AI chatbot error:", err);
    res.status(500).json({ error: "Gagal memproses pesan.", details: err.message });
  }
});

// Serve assets in development or production
async function startServer() {
  await ensureUploadDirectories();
  await initializeDatabase();

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SIKOWALI fullstack server successfully listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
