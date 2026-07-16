# 📚 منصة كله بيتعلم

منصة تعليمية أونلاين **مبنية بالكامل على Cloudflare** (Pages + Workers + D1 + KV + Queues) بدون أي خادم تقليدي. موجهة للسوق العربي بـ RTL كامل.

🌍 **الموقع الحي:** https://kollobeit3alem.pages.dev

---

## 📋 المحتويات

1. [البنية التقنية](#البنية-التقنية)
2. [قاعدة البيانات](#قاعدة-البيانات)
3. [الـ Backend](#الـ-backend---cloudflare-workers)
4. [الـ Frontend](#الـ-frontend---react--typescript)
5. [نظام المصادقة](#نظام-المصادقة)
6. [الـ API Endpoints](#الـ-api-endpoints)
7. [البيانات والكاش](#البيانات-والكاش)
8. [الصلاحيات والأدوار](#الصلاحيات-والأدوار)
9. [الإعدادات](#الإعدادات)

---

## البنية التقنية

### Frontend

| التقنية | الإصدار | الدور |
|---------|---------|------|
| React | 19.2.0 | مكتبة الواجهة |
| TypeScript | 5.9.3 | Type Safety |
| Vite | 7.2.4 | Build Tool |
| React Router DOM | 7.13.2 | التنقل |
| Tailwind CSS | 3.4.19 | التصميم |
| shadcn/ui | آخر | مكونات UI |
| Sonner | 2.0.7 | Toasts |
| canvas-confetti | 1.9.4 | تأثيرات |
| vite-plugin-pwa | 1.2.0 | PWA |
| React Hook Form | 7.70.0 | إدارة النماذج |
| Zod | 4.3.5 | Validation |

### Backend (Cloudflare)

| الخدمة | الدور |
|--------|-------|
| **Cloudflare Pages** | استضافة الـ SPA + routing |
| **Cloudflare Workers** | خادم API (Serverless) |
| **Cloudflare D1** | قاعدة البيانات (SQLite) |
| **Cloudflare KV** | كاش + جلسات |
| **Cloudflare Queues** | معالجة الامتحانات بالخلفية |
| **Web Crypto API** | تشفير JWT |

---

## قاعدة البيانات

**النوع:** SQLite موجود على Cloudflare D1  
**الاسم:** `kollobeit3alem-db`  
**ID:** `71570892-e00b-47f8-8113-e46ed27b845b`

### الجداول والفهارس الكاملة

#### `users` — المستخدمون
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  role TEXT DEFAULT 'student',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  session_id TEXT,
  phone TEXT
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);
CREATE INDEX idx_users_name ON users(name);
CREATE INDEX idx_users_session_id ON users(session_id);
```

#### `courses` — الكورسات
```sql
CREATE TABLE courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  instructor_contact TEXT,
  is_published INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_free INTEGER DEFAULT 1,
  price REAL DEFAULT 0,
  instructor_id INTEGER,
  metadata TEXT
);

CREATE INDEX idx_courses_is_published ON courses(is_published);
```

#### `lessons` — المحاضرات
```sql
CREATE TABLE lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER,
  title TEXT,
  video_url TEXT,
  order_num INTEGER,
  is_admin_locked INTEGER DEFAULT 0,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX idx_lessons_course_id ON lessons(course_id);
CREATE INDEX idx_lessons_order ON lessons(course_id, order_num);
```

#### `quizzes` — أسئلة الامتحانات
```sql
CREATE TABLE quizzes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER,
  image_url TEXT,
  option_a TEXT,
  option_b TEXT,
  option_c TEXT,
  option_d TEXT,
  correct_option TEXT,
  type TEXT DEFAULT 'mcq',
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE INDEX idx_quizzes_lesson_id ON quizzes(lesson_id);
```

#### `enrollments` — اشتراكات الطلاب
```sql
CREATE TABLE enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  course_id INTEGER,
  enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_enrollments_user_course_unique ON enrollments(user_id, course_id);
CREATE INDEX idx_enrollments_user_id ON enrollments(user_id);
CREATE INDEX idx_enrollments_course_id ON enrollments(course_id);
```

#### `student_progress` — تقدم المحاضرات
```sql
CREATE TABLE student_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  lesson_id INTEGER,
  is_completed INTEGER DEFAULT 1,
  completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE INDEX idx_student_progress_user_id ON student_progress(user_id);
CREATE INDEX idx_student_progress_lesson_id ON student_progress(lesson_id);
CREATE INDEX idx_student_progress_user_lesson ON student_progress(user_id, lesson_id);
```

#### `student_video_progress` — تقدم الفيديوهات
```sql
CREATE TABLE student_video_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  course_id INTEGER,
  lesson_id INTEGER,
  video_key TEXT,
  completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE INDEX idx_video_progress_lesson ON student_video_progress(lesson_id);
CREATE INDEX idx_video_progress_user_course ON student_video_progress(user_id, course_id);
```

#### `quiz_attempts` — محاولات الامتحانات
```sql
CREATE TABLE quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  lesson_id INTEGER,
  score INTEGER,
  answers_json TEXT,
  attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE INDEX idx_quiz_attempts_user_id ON quiz_attempts(user_id);
CREATE INDEX idx_quiz_attempts_lesson_id ON quiz_attempts(lesson_id);
```

#### `failed_exams` — الامتحانات المعلقة
```sql
CREATE TABLE failed_exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  lesson_id INTEGER,
  answers_json TEXT,
  error_reason TEXT,
  failed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_failed_exams_user_id ON failed_exams(user_id);
CREATE INDEX idx_failed_exams_lesson_id ON failed_exams(lesson_id);
```

#### `transactions` — معاملات الدفع (Paymob)
```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  paymob_order_id TEXT,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (course_id) REFERENCES courses(id)
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_course_id ON transactions(course_id);
CREATE INDEX idx_transactions_user_course ON transactions(user_id, course_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_paymob_order_id ON transactions(paymob_order_id);
```

---

## الـ Backend - Cloudflare Workers

### هيكل الملفات

```
public/api-routes/
├── auth.js               # Google OAuth + JWT verification
├── courses.js            # Courses API with 3-layer caching
├── student.js            # Student dashboard, progress, quizzes
├── instructor.js         # Instructor dashboard (limited to their courses)
├── admin.js              # Admin dashboard (full permissions)
├── assistant.js          # Assistant (read-only access)
└── utils.js              # CORS + shared utilities
```

### الـ API Endpoints

#### المصادقة (`auth.js`)

| المسار | Method | الوظيفة |
|--------|--------|---------|
| `/api/auth/google` | POST | تسجيل دخول بـ Google OAuth |

#### الكورسات (`courses.js`)

| المسار | Method | الوظيفة |
|--------|--------|---------|
| `/api/courses` | GET | جلب الكورسات (3-layer cache) |
| `/api/courses/:id/lessons` | GET | محاضرات الكورس (محمية) |
| `/api/lessons/:id/quiz` | GET | أسئلة الامتحان (محمية) |

#### الطالب (`student.js`)

| المسار | Method | الوظيفة |
|--------|--------|---------|
| `/api/my-dashboard` | GET | لوحة تحكم الطالب |
| `/api/my-enrollments` | GET | الكورسات المشترك فيها |
| `/api/my-profile` | PUT | تعديل البيانات |
| `/api/my-quizzes` | GET | سجل الامتحانات |
| `/api/enroll` | POST | الاشتراك في كورس |
| `/api/courses/:id/progress` | GET | تقدم الطالب |
| `/api/progress/lesson` | POST | تسجيل إتمام محاضرة |
| `/api/progress/video` | POST | تسجيل إتمام فيديو |
| `/api/paymob/init` | POST | إنشاء أوردر دفع |
| `/api/paymob/webhook` | POST | التحقق من الدفع |

#### الأدمين (`admin.js`)

| المسار | Method | الوظيفة |
|--------|--------|---------|
| `/api/admin/users` | GET | جلب المستخدمين (pagination + search) |
| `/api/admin/users/:id` | PUT | تعديل مستخدم |
| `/api/admin/users/:id` | DELETE | حذف مستخدم |
| `/api/admin/reports/:id` | GET | تقرير طالب |
| `/api/admin/courses` | GET / POST | جلب / إضافة كورس |
| `/api/admin/courses/:id` | PUT / DELETE | تعديل / حذف كورس |
| `/api/admin/lessons` | POST | إضافة محاضرة |
| `/api/admin/lessons/:id` | PUT / DELETE | تعديل / حذف محاضرة |
| `/api/admin/lessons/:id/lock` | PUT | قفل/فتح محاضرة |
| `/api/admin/quizzes` | POST | إضافة امتحان |
| `/api/admin/quizzes/:id` | DELETE | حذف امتحان |
| `/api/admin/transactions/stats` | GET | إحصائيات المبيعات |
| `/api/admin/failed-exams` | GET | الامتحانات المعلقة |

---

## الـ Frontend - React + TypeScript

### الصفحات الرئيسية

| الصفحة | النوع | الوصف |
|--------|-------|-------|
| `Courses.tsx` | عام | عرض الكورسات المتاحة |
| `Course.tsx` | محمي | الدراسة والامتحانات |
| `Profile.tsx` | محمي (student) | الملف الشخصي |
| `Admin.tsx` | محمي (admin) | لوحة الأدمين |
| `Instructor.tsx` | محمي (instructor) | لوحة المدرس |
| `Assistant.tsx` | محمي (assistant) | لوحة المساعد |
| `Login.tsx` | عام | تسجيل الدخول |
| `Privacy.tsx` | عام | سياسة الخصوصية |

---

## نظام المصادقة

### الخطوات

```
1. الضغط على Google Sign-In
    ↓
2. Google يعيد credential (JWT)
    ↓
3. Frontend يرسل credential لـ /api/auth/google
    ↓
4. Backend يتحقق من التوقيع محلياً
    ↓
5. إنشاء user + session في KV
    ↓
6. توليد JWT مخصص + إرسال للـ Frontend
    ↓
7. Frontend يحفظ token + user في localStorage
```

### Token Format

```json
{
  "userId": 1,
  "role": "student",
  "sessionId": "...",
  "exp": 1234567890
}
```

**التشفير:** HMAC-SHA256 مع `JWT_SECRET`

---

## نظام الكاش

### Three-Layer Caching

```
طلب جديد
    ↓
Layer 1: Cloudflare Cache API (مجاني)
    ↓ (miss)
Layer 2: KV (COURSES_CACHE)
    ↓ (miss)
Layer 3: D1 (المصدر الحقيقي)
    ↓
ملء الطبقات + إرجاع البيانات
```

### KV Keys

- `all_courses` — كاش الكورسات (24 ساعة)
- `session:{userId}` — بيانات الجلسة (24 ساعة)
- `google_jwks` — مفاتيح Google (6 ساعات)
- `rate_limit:charge:{userId}` — حماية الشحن

---

## الصلاحيات والأدوار

| الرول | الصلاحيات |
|-------|----------|
| **student** | عرض + اشتراك + امتحانات |
| **instructor** | إدارة كورساته + طلابه |
| **assistant** | قراءة فقط (student + reports) |
| **admin** | صلاحيات كاملة |

---

## الإعدادات

### `wrangler.toml`

```toml
[[d1_databases]]
binding = "DB"
database_name = "kollobeit3alem-db"
database_id = "71570892-e00b-47f8-8113-e46ed27b845b"

[[kv_namespaces]]
binding = "COURSES_CACHE"
id = "94b10873bf82473b8a553e985d8352ee"

[[queues.consumers]]
queue = "exams-queue"
max_batch_size = 50
max_batch_timeout = 5
max_retries = 3
```

### متغيرات البيئة

```
JWT_SECRET
ALLOWED_ORIGINS
PAYMOB_API_KEY
PAYMOB_KIOSK_INTEGRATION_ID
PAYMOB_CARD_INTEGRATION_ID
PAYMOB_CARD_IFRAME_ID
PAYMOB_HMAC_SECRET
```

---

## المميزات

✅ **Serverless 100%** | ✅ **RTL كامل** | ✅ **Google OAuth** | ✅ **Caching ثلاثي**  
✅ **امتحانات MCQ** | ✅ **Paymob integration** | ✅ **PWA** | ✅ **4 لوحات تحكم**

---

**آخر تحديث:** مايو 2026
