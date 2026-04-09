# 📚 منصة كله بيتعلم — التوثيق الشامل

> منصة تعليمية أونلاين متكاملة موجهة للسوق العربي، مبنية على Cloudflare Pages + Workers + D1

---

## 🗂️ فهرس المحتويات

1. [نظرة عامة على المشروع](#1-نظرة-عامة-على-المشروع)
2. [التقنيات المستخدمة](#2-التقنيات-المستخدمة)
3. [هيكل المشروع](#3-هيكل-المشروع)
4. [قاعدة البيانات — الجداول والعلاقات](#4-قاعدة-البيانات)
5. [Backend — الـ Worker والـ API](#5-backend--الـ-worker-والـ-api)
6. [Frontend — الصفحات والمكونات](#6-frontend--الصفحات-والمكونات)
7. [نظام المصادقة](#7-نظام-المصادقة)
8. [نظام الكاش — ثلاث طبقات](#8-نظام-الكاش--ثلاث-طبقات)
9. [نظام الامتحانات والطوابير](#9-نظام-الامتحانات-والطوابير)
10. [نظام الرول والصلاحيات](#10-نظام-الرول-والصلاحيات)
11. [نظام المحفظة وأكواد الشحن](#11-نظام-المحفظة-وأكواد-الشحن)
12. [SEO والـ PWA](#12-seo-والـ-pwa)
13. [الأمان](#13-الأمان)
14. [متغيرات البيئة والإعداد](#14-متغيرات-البيئة-والإعداد)
15. [طريقة النشر](#15-طريقة-النشر)

---

## 1. نظرة عامة على المشروع

**منصة كله بيتعلم** هي منصة تعليمية أونلاين عربية مبنية بالكامل على بنية Cloudflare بدون أي خادم تقليدي (Serverless). تتيح المنصة:

- عرض الكورسات المجانية والمدفوعة
- تشغيل فيديوهات YouTube مجاناً بدون تكلفة استضافة
- نظام امتحانات MCQ مع صور
- محفظة رقمية وأكواد شحن
- لوحات تحكم منفصلة لـ: Admin / Instructor / Assistant / Student
- تسجيل دخول بـ Google OAuth فقط

**الموقع الرسمي:** `https://kollobeit3alem.pages.dev`

---

## 2. التقنيات المستخدمة

### Frontend
| التقنية | الإصدار | الغرض |
|---------|---------|--------|
| React | 19.2.0 | مكتبة الواجهة |
| TypeScript | ~5.9.3 | Type Safety |
| Vite | 7.2.4 | Build Tool |
| React Router DOM | 7.13.2 | التنقل بين الصفحات |
| Tailwind CSS | 3.4.19 | التصميم |
| shadcn/ui (Radix) | متعدد | مكونات UI |
| Recharts | 2.15.4 | رسوم بيانية |
| React Hook Form | 7.70.0 | إدارة النماذج |
| Zod | 4.3.5 | التحقق من البيانات |
| Sonner | 2.0.7 | إشعارات Toast |
| canvas-confetti | 1.9.4 | تأثيرات الاحتفال |
| vite-plugin-pwa | 1.2.0 | تحويل إلى PWA |
| next-themes | 0.4.6 | الوضع الليلي/النهاري |
| xlsx | 0.18.5 | تصدير Excel |
| date-fns | 4.1.0 | التعامل مع التواريخ |

### Backend (Cloudflare)
| التقنية | الغرض |
|---------|--------|
| Cloudflare Pages | استضافة الـ SPA |
| Cloudflare Workers | Backend API (Serverless) |
| Cloudflare D1 (SQLite) | قاعدة البيانات |
| Cloudflare KV | الكاش والجلسات |
| Cloudflare Queues | طابور معالجة الامتحانات |
| Web Crypto API | تشفير JWT |

---

## 3. هيكل المشروع

```
kollobeit3alem-main/
│
├── public/                        # ملفات عامة + Backend Worker
│   ├── _worker.js                 # نقطة دخول الـ Worker (Router رئيسي)
│   ├── api-routes/
│   │   ├── auth.js                # مسارات المصادقة + Google OAuth
│   │   ├── courses.js             # API الكورسات (عام + كاش)
│   │   ├── student.js             # API الطالب (المحفظة، التقدم، الامتحانات)
│   │   ├── instructor.js          # API المدرس (إدارة كورساته)
│   │   ├── assistant.js           # API المساعد (قراءة فقط)
│   │   ├── admin.js               # API الأدمين (صلاحيات كاملة)
│   │   └── utils.js               # CORS + دوال مشتركة
│   ├── robots.txt                 # إعدادات روبوتات البحث
│   ├── sitemap.xml                # خريطة الموقع
│   ├── icon-192.png               # أيقونة PWA صغيرة
│   ├── icon-512.png               # أيقونة PWA كبيرة
│   └── logo.png                   # شعار المنصة
│
├── src/
│   ├── main.tsx                   # نقطة دخول React
│   ├── App.tsx                    # Router الرئيسي + Protected Routes
│   ├── App.css                    # ستايلات خاصة بالتطبيق
│   ├── index.css                  # ستايلات عامة + CSS Variables
│   │
│   ├── pages/
│   │   ├── Courses.tsx            # الصفحة الرئيسية — عرض الكورسات (عام)
│   │   ├── Course.tsx             # صفحة الكورس — الفيديوهات والامتحانات
│   │   ├── Login.tsx              # صفحة تسجيل الدخول (Google)
│   │   ├── Profile.tsx            # صفحة الملف الشخصي للطالب
│   │   ├── Admin.tsx              # لوحة تحكم الأدمين الكاملة
│   │   ├── Instructor.tsx         # لوحة تحكم المدرس
│   │   ├── Assistant.tsx          # لوحة تحكم المساعد
│   │   └── Privacy.tsx            # صفحة سياسة الخصوصية
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx        # Context المصادقة العالمي
│   │
│   ├── hooks/
│   │   └── use-mobile.ts          # Hook للكشف عن الموبايل
│   │
│   ├── lib/
│   │   └── utils.ts               # دالة cn() للـ Tailwind
│   │
│   ├── types/
│   │   └── index.ts               # كل أنواع TypeScript
│   │
│   └── components/
│       └── ui/                    # 40+ مكون shadcn/Radix UI
│           ├── accordion.tsx
│           ├── alert-dialog.tsx
│           ├── alert.tsx
│           ├── aspect-ratio.tsx
│           ├── avatar.tsx
│           ├── badge.tsx
│           ├── breadcrumb.tsx
│           ├── button-group.tsx
│           ├── button.tsx
│           ├── calendar.tsx
│           ├── card.tsx
│           ├── carousel.tsx
│           ├── chart.tsx
│           ├── checkbox.tsx
│           ├── collapsible.tsx
│           ├── command.tsx
│           ├── context-menu.tsx
│           ├── dialog.tsx
│           ├── drawer.tsx
│           ├── dropdown-menu.tsx
│           ├── empty.tsx
│           ├── field.tsx
│           ├── form.tsx
│           ├── hover-card.tsx
│           ├── input-group.tsx
│           ├── input-otp.tsx
│           ├── input.tsx
│           ├── item.tsx
│           ├── kbd.tsx
│           ├── label.tsx
│           ├── menubar.tsx
│           ├── navigation-menu.tsx
│           ├── pagination.tsx
│           ├── popover.tsx
│           ├── progress.tsx
│           ├── radio-group.tsx
│           ├── resizable.tsx
│           ├── scroll-area.tsx
│           ├── select.tsx
│           ├── separator.tsx
│           ├── sheet.tsx
│           ├── sidebar.tsx
│           ├── skeleton.tsx
│           ├── slider.tsx
│           ├── sonner.tsx
│           ├── spinner.tsx
│           ├── switch.tsx
│           ├── table.tsx
│           ├── tabs.tsx
│           ├── textarea.tsx
│           ├── toggle-group.tsx
│           ├── toggle.tsx
│           └── tooltip.tsx
│
├── dist/                          # ملفات البناء النهائية
│   ├── assets/
│   │   ├── index-Brn9Ni_a.js     # Bundle الرئيسي (362 KB)
│   │   ├── index-BbU7-kZD.css    # CSS المدمج (103 KB)
│   │   └── confetti.module-*.js  # Chunk مستقل لـ confetti
│   └── index.html
│
├── index.html                     # HTML الرئيسي (مع Google OAuth script)
├── package.json                   # التبعيات
├── vite.config.ts                 # إعداد Vite + PWA
├── wrangler.toml                  # إعداد Cloudflare Workers/Pages
├── tailwind.config.js             # إعداد Tailwind
├── components.json                # إعداد shadcn/ui
├── tsconfig.app.json              # إعداد TypeScript
├── postcss.config.js              # إعداد PostCSS
├── eslint.config.js               # إعداد ESLint
└── robots.txt                     # (نسخة في الجذر للتوافق)
```

---

## 4. قاعدة البيانات

قاعدة البيانات: **Cloudflare D1** (SQLite مُستضاف على Cloudflare Edge)

اسم القاعدة: `kollobeit3alem-db`  
ID: `71570892-e00b-47f8-8113-e46ed27b845b`

### الجداول

#### `users` — المستخدمون
```sql
id              INTEGER PRIMARY KEY
google_id       TEXT UNIQUE
name            TEXT
email           TEXT UNIQUE
avatar_url      TEXT
phone           TEXT
role            TEXT  -- 'student' | 'instructor' | 'admin' | 'assistant'
wallet_balance  REAL  DEFAULT 0
session_id      TEXT
created_at      TEXT
```

#### `courses` — الكورسات
```sql
id                  INTEGER PRIMARY KEY
title               TEXT
description         TEXT
image_url           TEXT
instructor_contact  TEXT
is_free             INTEGER  -- 1 = مجاني، 0 = مدفوع
price               REAL
instructor_id       INTEGER  -- FK → users.id
metadata            TEXT     -- JSON إضافي
created_at          TEXT
```

#### `lessons` — المحاضرات
```sql
id              INTEGER PRIMARY KEY
course_id       INTEGER  -- FK → courses.id
title           TEXT
video_url       TEXT     -- رابط YouTube
order_num       INTEGER  -- ترتيب العرض
is_admin_locked INTEGER  -- 1 = مقفول من الأدمين
```

#### `quizzes` — أسئلة الامتحانات
```sql
id              INTEGER PRIMARY KEY
lesson_id       INTEGER  -- FK → lessons.id
image_url       TEXT     -- صورة السؤال
option_a        TEXT
option_b        TEXT
option_c        TEXT     -- اختياري
option_d        TEXT     -- اختياري
correct_option  TEXT     -- 'A' | 'B' | 'C' | 'D'
type            TEXT     -- 'mcq' (الافتراضي)
```

#### `enrollments` — اشتراكات الطلاب
```sql
user_id     INTEGER  -- FK → users.id
course_id   INTEGER  -- FK → courses.id
enrolled_at TEXT
```

#### `student_progress` — تقدم الطالب في المحاضرات
```sql
user_id       INTEGER  -- FK → users.id
lesson_id     INTEGER  -- FK → lessons.id
is_completed  INTEGER  -- 1 = أكمل
completed_at  TEXT
```

#### `student_video_progress` — تقدم مشاهدة الفيديوهات
```sql
user_id      INTEGER
course_id    INTEGER
lesson_id    INTEGER
video_key    TEXT     -- مفتاح فريد للفيديو
completed_at TEXT
```

#### `quiz_attempts` — محاولات الامتحانات
```sql
id           INTEGER PRIMARY KEY
user_id      INTEGER  -- FK → users.id
lesson_id    INTEGER  -- FK → lessons.id
score        REAL     -- النسبة المئوية
answers_json TEXT     -- إجابات الطالب كـ JSON
attempted_at TEXT
```

#### `activation_codes` — أكواد شحن المحفظة
```sql
id         INTEGER PRIMARY KEY
code       TEXT UNIQUE
course_id  INTEGER  -- 0 = شحن عام
amount     REAL     -- قيمة الكود بالجنيه
is_used    INTEGER  -- 1 = مستخدم
used_by    INTEGER  -- FK → users.id
used_at    TEXT
```

---

## 5. Backend — الـ Worker والـ API

### `_worker.js` — Router الرئيسي

الـ Worker يستقبل كل الطلبات ويوزعها على المسارات المناسبة:

```
OPTIONS → CORS headers مباشرة
↓
/sitemap.xml, /robots.txt, /assets/*, /*.js, /*.css → ASSETS مباشرة
↓
/admin.kollobeit3alem → verifyAdmin → handleAdminRoutes / handleInstructorRoutes / handleAssistantRoutes
↓
/api/auth/* → handleAuthRoutes
/api/my-*, /api/enroll, /api/wallet, /api/progress → handleStudentRoutes
/api/courses/*, /api/lessons/* → handleCourseRoutes
↓
* → ASSETS (index.html للـ SPA)
```

### Security Headers — تُضاف لكل الردود
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
X-Request-Id: {UUID فريد لكل طلب}
```

---

### `auth.js` — API المصادقة

| المسار | Method | الوظيفة |
|--------|--------|---------|
| `/api/auth/google` | POST | تسجيل دخول بـ Google OAuth |
| `/api/auth/logout` | POST | تسجيل خروج + مسح session من KV |
| `/api/auth/verify` | GET | التحقق من صحة الجلسة |

**آلية Google OAuth:**
1. الـ Frontend يرسل `credential` (Google JWT)
2. الـ Worker يتحقق من التوقيع محلياً باستخدام Web Crypto API
3. مفاتيح Google العامة تُكاش في KV لمدة 6 ساعات (طلب HTTP واحد كل 6 ساعات لكل المستخدمين)
4. عند النجاح: يُنشأ session في KV + يُرجع JWT مخصص للـ Frontend

---

### `courses.js` — API الكورسات

| المسار | Method | الوظيفة |
|--------|--------|---------|
| `/api/courses` | GET | جلب كل الكورسات (مع كاش 3 طبقات) |
| `/api/courses/:id` | GET | تفاصيل كورس واحد |
| `/api/courses/:id/lessons` | GET | محاضرات كورس (للمسجلين فقط) |
| `/api/lessons/:id/quiz` | GET | أسئلة امتحان محاضرة |

---

### `student.js` — API الطالب

| المسار | Method | الوظيفة |
|--------|--------|---------|
| `/api/my-dashboard` | GET | لوحة تحكم الطالب + رصيد المحفظة |
| `/api/my-enrollments` | GET | الكورسات المشترك فيها |
| `/api/my-profile` | PUT | تعديل رقم الهاتف |
| `/api/my-quizzes` | GET | سجل الامتحانات |
| `/api/enroll` | POST | الاشتراك في كورس مجاني |
| `/api/wallet/charge` | POST | شحن المحفظة بكود (محمي بـ Rate Limiter) |
| `/api/wallet/enroll` | POST | الاشتراك بالمحفظة في كورس مدفوع |
| `/api/progress/lesson` | POST | تسجيل إتمام محاضرة |
| `/api/progress/video` | POST | تسجيل إتمام فيديو داخل المحاضرة |
| `/api/courses/:id/progress` | GET | تقدم الطالب في كورس |
| `/api/submit-quiz` | POST | تسليم إجابات الامتحان (→ Queues) |

---

### `admin.js` — API الأدمين (صلاحيات كاملة)

| المسار | Method | الوظيفة |
|--------|--------|---------|
| `/api/admin/users` | GET | جلب كل المستخدمين (بحث + تصفية + Pagination) |
| `/api/admin/users/:id` | PUT | تعديل مستخدم (اسم، رول، هاتف) |
| `/api/admin/users/:id` | DELETE | حذف مستخدم وكل بياناته |
| `/api/admin/reports/:id` | GET | تقرير طالب (enrollments + progress + quizzes) |
| `/api/admin/courses` | GET / POST | جلب / إضافة كورس |
| `/api/admin/courses/:id` | PUT / DELETE | تعديل / حذف كورس |
| `/api/admin/lessons` | POST | إضافة محاضرة |
| `/api/admin/lessons/:id` | PUT / DELETE | تعديل / حذف محاضرة |
| `/api/admin/lessons/:id/lock` | PUT | قفل/فتح محاضرة |
| `/api/admin/quizzes` | POST | إضافة سؤال امتحان |
| `/api/admin/quizzes/:id` | DELETE | حذف سؤال |
| `/api/admin/codes` | POST | توليد أكواد شحن |
| `/api/admin/codes` | GET | جلب كل الأكواد |

---

### `instructor.js` — API المدرس (محدود بكورساته)

نفس endpoints الأدمين لكن مقيّدة بـ `instructor_id = adminUser.id`، أي المدرس لا يرى أو يعدل إلا كورساته هو فقط.

---

### `assistant.js` — API المساعد (قراءة فقط)

| المسار | Method | الوظيفة |
|--------|--------|---------|
| `/api/admin/users` | GET | قراءة قائمة الطلاب |
| `/api/admin/reports/:id` | GET | قراءة تقارير الطلاب |

لا يملك صلاحية أي تعديل.

---

## 6. Frontend — الصفحات والمكونات

### `Courses.tsx` — الصفحة الرئيسية (505 سطر)
- عامة للجميع بدون تسجيل دخول
- عرض بطاقات الكورسات مع الصور والسعر
- زر "سجل دخولك" للكورسات المدفوعة
- بحث وفلترة محلية

### `Course.tsx` — صفحة الكورس (985 سطر)
- تتطلب تسجيل دخول
- مشغل يوتيوب مدمج
- Sidebar بقائمة المحاضرات مع مؤشر التقدم
- نظام امتحانات MCQ بعد كل محاضرة
- تأثيرات confetti عند إتمام الكورس
- قفل المحاضرات غير المكتملة

### `Admin.tsx` — لوحة الأدمين (1135 سطر)
- إدارة المستخدمين (بحث، تعديل رول، حذف)
- إدارة الكورسات (إضافة، تعديل، حذف)
- إدارة المحاضرات والامتحانات
- توليد أكواد الشحن
- تقارير الطلاب التفصيلية
- تصدير البيانات Excel

### `Instructor.tsx` — لوحة المدرس (1155 سطر)
- إدارة كورساته الخاصة فقط
- نفس واجهة الأدمين لكن مقيّدة

### `Assistant.tsx` — لوحة المساعد
- عرض قائمة الطلاب
- عرض التقارير

### `Profile.tsx` — الملف الشخصي (28699 سطر ~ كبيرة)
- بيانات المستخدم
- الكورسات المشترك فيها
- تقدم التعلم
- رصيد المحفظة
- شحن المحفظة بأكواد
- سجل الامتحانات

### `Login.tsx` — تسجيل الدخول (8798 سطر)
- Google Sign-In فقط
- توجيه تلقائي حسب الرول

### `Privacy.tsx` — سياسة الخصوصية
- عامة للجميع وللروبوتات
- مهمة لـ Google OAuth

---

## 7. نظام المصادقة

```
المستخدم → Google Sign-In Button (GSI)
    ↓
Google يعيد credential (JWT)
    ↓
/api/auth/google (POST)
    ↓
verifyGoogleTokenLocally():
  - فك تشفير JWT محلياً
  - التحقق من audience (CLIENT_ID)
  - التحقق من انتهاء الصلاحية
  - جلب JWKS من KV (أو Google مرة كل 6 ساعات)
  - التحقق من التوقيع الرقمي (RSASSA-PKCS1-v1_5)
    ↓
INSERT/UPDATE users في D1
    ↓
إنشاء session_id + حفظ في KV (TTL: 24 ساعة)
    ↓
إنشاء JWT مخصص (HMAC-SHA256) + إرسال للـ Frontend
    ↓
Frontend يحفظ token + user في localStorage
```

**التحقق من الطلبات اللاحقة:**
```
Authorization: Bearer {token}
    ↓
verifyStudentSession() / verifyAdmin()
    ↓
فك تشفير token → جلب userId
    ↓
فحص session في KV (هل ما زالت صالحة؟)
    ↓
SELECT user من D1
```

---

## 8. نظام الكاش — ثلاث طبقات

```
الطلب يصل للـ Worker
    ↓
الطبقة 1: Cloudflare Cache API (مجانية تماماً)
    ↓ (miss)
الطبقة 2: KV Namespace (COURSES_CACHE)
    ↓ (miss)  
الطبقة 3: D1 Database (المصدر الحقيقي)
    ↓
تملأ الطبقتين 1 و 2 + ترجع البيانات
```

### تفاصيل الطبقات

| الطبقة | التقنية | TTL | التكلفة | الغرض |
|--------|---------|-----|---------|-------|
| 1 | Cache API | 300 ثانية | مجانية | أسرع استجابة |
| 2 | KV (COURSES_CACHE) | 300 ثانية | مدفوعة | مشتركة بين كل instances |
| 3 | D1 | - | مدفوعة | المصدر الحقيقي |

### KV يُستخدم لـ 4 أغراض
1. `all_courses` — كاش قائمة الكورسات
2. `session:{userId}` — جلسات المستخدمين (TTL: 24 ساعة)
3. `rate_limit:charge:{userId}` — حماية شحن المحفظة
4. `google_jwks` — مفاتيح Google العامة (TTL: 6 ساعات)

### Read Replication
```toml
[d1_databases]
read_replication = { mode = "auto" }
```
يوزع طلبات القراءة على nodes متعددة — مجاني في beta.

---

## 9. نظام الامتحانات والطوابير

### كيف تعمل

```
الطالب يجيب على الامتحان
    ↓
/api/submit-quiz (POST)
    ↓
EXAMS_QUEUE.send({ userId, lessonId, answers })
    ↓ (async — لا ينتظر)
رد فوري للطالب: "تم الاستلام"
    ↓ (في الخلفية)
Worker Queue Consumer:
  - جلب الأسئلة الصحيحة من D1
  - حساب النتيجة
  - INSERT quiz_attempts
  - تسجيل التقدم
```

### إعدادات Queue
```toml
max_batch_size    = 50    # معالجة 50 امتحان دفعة واحدة
max_batch_timeout = 5     # ثواني انتظار قبل تشغيل الدفعة
max_retries       = 3     # إعادة المحاولة 3 مرات عند الفشل
```

**الفائدة:** يمنع تأخر الاستجابة عند ضغط الامتحانات — الطالب يحصل على رد فوري والحساب يتم في الخلفية.

---

## 10. نظام الرول والصلاحيات

| الرول | الوصول |
|-------|--------|
| `student` | الكورسات العامة، كورساته، محفظته، امتحاناته |
| `instructor` | كورساته فقط + طلاب كورساته + إدارة كاملة لكورساته |
| `assistant` | قراءة قائمة الطلاب وتقاريرهم فقط |
| `admin` | صلاحيات كاملة على كل شيء |

**مسار الأدمن مخفي:**
```
/admin.kollobeit3alem  ← مسار سري للوحة الإدارة
/admin              ← يعيد التوجيه للرئيسية لغير المصرح لهم
```

### Two-Tier Rate Limiter (حماية شحن المحفظة)
```
الطبقة 1 (ذاكرة Worker):
  - MAX_ATTEMPTS = 5 محاولات
  - MEMORY_WINDOW_MS = 10,000 ms
  - يمسك الـ Spam فوراً بدون طلب KV

الطبقة 2 (KV):
  - LOCKOUT_SECONDS = 900 (15 دقيقة)
  - مشترك بين كل instances
  - حظر حقيقي مستمر
```

---

## 11. نظام المحفظة وأكواد الشحن

```
الأدمين يولد أكواد شحن (مثل: كودات مادية تُباع)
    ↓
activation_codes.amount = قيمة الكود بالجنيه
    ↓
الطالب يدخل الكود في صفحة Profile
    ↓
/api/wallet/charge (POST)
    ↓
فحص Rate Limiter
    ↓
UPDATE activation_codes SET is_used = 1
UPDATE users SET wallet_balance = wallet_balance + amount
    ↓
الطالب يستخدم الرصيد للاشتراك في كورسات مدفوعة
    ↓
/api/wallet/enroll (POST)
    ↓
فحص wallet_balance >= course.price
    ↓
batch:
  INSERT enrollments
  UPDATE users SET wallet_balance = wallet_balance - price
```

---

## 12. SEO والـ PWA

### SEO
- `robots.txt` مخصص: يسمح للروبوتات بـ `/`, `/courses`, `/privacy`
- `sitemap.xml` بـ image sitemap extension + hreflang للعربية
- الملفات الثابتة تُخدَّم مباشرة من الـ Worker بدون redirect
- صفحة Privacy منفصلة عامة (ضرورية لـ Google OAuth)

### PWA (Progressive Web App)
```json
{
  "name": "منصة كله بيتعلم",
  "short_name": "كله بيتعلم",
  "dir": "rtl",
  "lang": "ar",
  "display": "standalone",
  "theme_color": "#015669",
  "icons": ["192x192", "512x512 (maskable)"]
}
```
- `registerType: 'autoUpdate'` — تحديث تلقائي بدون تدخل المستخدم
- يعمل كتطبيق موبايل قابل للتثبيت

---

## 13. الأمان

| الآلية | التفاصيل |
|--------|---------|
| JWT محلي | لا يرسل tokens لخوادم خارجية في كل طلب |
| JWKS Caching | مفاتيح Google في KV (طلب HTTP واحد كل 6 ساعات) |
| Session Invalidation | مسح session من KV عند تعديل المستخدم أو حذفه |
| Rate Limiter | Two-Tier (ذاكرة + KV) على شحن المحفظة |
| CORS ديناميكي | من متغير بيئي ALLOWED_ORIGINS |
| Security Headers | X-Content-Type-Options, X-Frame-Options, Referrer-Policy |
| Admin Path مخفي | مسار سري `/admin.kollobeit3alem` |
| Role Isolation | كل رول يرى فقط ما يخصه |
| Input Validation | Zod في Frontend + فحص يدوي في Backend |

---

## 14. متغيرات البيئة والإعداد

### `wrangler.toml`
```toml
name = "kollobeit3alem-api"
main = "src/_worker.js"
compatibility_date = "2024-03-01"

[vars]
ENVIRONMENT = "production"
# ALLOWED_ORIGINS = "https://kollobeit3alem.pages.dev,https://kollobeit3alem.com"

[[d1_databases]]
binding = "DB"
database_name = "kollobeit3alem-db"
database_id = "71570892-e00b-47f8-8113-e46ed27b845b"
read_replication = { mode = "auto" }

[[kv_namespaces]]
binding = "COURSES_CACHE"
id = "94b10873bf82473b8a553e985d8352ee"

[[queues.producers]]
queue = "exams-queue"
binding = "EXAMS_QUEUE"

[[queues.consumers]]
queue = "exams-queue"
max_batch_size = 50
max_batch_timeout = 5
max_retries = 3
```

### متغيرات سرية (من لوحة Cloudflare)
```
JWT_SECRET     — سر تشفير الـ JWT المخصص
ALLOWED_ORIGINS — النطاقات المسموح بها
```

### Google OAuth Client ID (في الكود)
```
543687035134-d64j2ncr5bcfuv7s9e61psp7qb2dj276.apps.googleusercontent.com
```

---

## 15. طريقة النشر

### التثبيت المحلي
```bash
git clone <repo>
cd kollobeit3alem-main
npm install
npm run dev          # تشغيل محلي على http://localhost:5173
```

### البناء
```bash
npm run build        # tsc + vite build → dist/
```

### النشر على Cloudflare Pages
```bash
# ربط المشروع بـ Cloudflare Pages
npx wrangler pages project create kollobeit3alem

# نشر
npx wrangler pages deploy dist/

# إنشاء قاعدة البيانات
npx wrangler d1 create kollobeit3alem-db
npx wrangler d1 execute kollobeit3alem-db --file=schema.sql

# إنشاء KV Namespace
npx wrangler kv:namespace create COURSES_CACHE

# إنشاء Queue
npx wrangler queues create exams-queue
```

---

## 📌 ملاحظات مهمة

- **الفيديوهات مجانية تماماً** — كلها YouTube embeds، لا تكلفة تخزين أو بث
- **لا خادم تقليدي** — كل شيء على Cloudflare Edge (Workers + D1 + KV + Queues)
- **RTL بالكامل** — المنصة مبنية من الأساس للعربية
- **Font مخصص** — `Abdo.Logo_.ttf` (خط عربي خاص محفوظ في `public/`)
- **مسار الأدمن سري** — `/admin.kollobeit3alem` وليس `/admin` لتجنب المسح الآلي
- **تصدير Excel** — مكتبة `xlsx` لتصدير بيانات الطلاب من لوحة التحكم

---

*آخر تحديث: أبريل 2026 | المؤلف: أدهم عطية سالم*
