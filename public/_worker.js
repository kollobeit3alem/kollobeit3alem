import { getCorsHeaders, corsHeaders } from './api-routes/utils.js';
import { verifyAdmin } from './api-routes/auth.js';

import { handleAuthRoutes } from './api-routes/auth.js';
import { handleCourseRoutes } from './api-routes/courses.js';
import { handleStudentRoutes } from './api-routes/student.js';
import { handleInstructorRoutes } from './api-routes/instructor.js';
import { handleAssistantRoutes } from './api-routes/assistant.js';
import { handleAdminRoutes } from './api-routes/admin.js';

// ============================================================================
// دالة إضافة Security Headers لكل الردود
// ============================================================================
function addSecurityHeaders(response, requestId) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Request-Id", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// ============================================================================
// دالة Rate Limiting المركزية
// تحمي المنصة من الإغراق — كل IP له حد أقصى من الطلبات في نافذة زمنية محددة
// المنطق: نجلب العداد الحالي من KV، لو تجاوز الحد نرفض، لو لأ نزوده ونكمل
// ============================================================================
async function checkRateLimit(env, ip, endpoint, maxRequests, windowSeconds) {
  // لو مفيش KV متصل نسمح بالطلب ولا نوقف الموقع
  if (!env.COURSES_CACHE) {
    return { allowed: true };
  }

  try {
    const key = `rl:${endpoint}:${ip}`;
    const currentValue = await env.COURSES_CACHE.get(key);
    const currentCount = currentValue ? parseInt(currentValue) : 0;

    if (currentCount >= maxRequests) {
      return { allowed: false, retryAfter: windowSeconds };
    }

    // نزود العداد — لو أول مرة نضع TTL، لو مش أول مرة نحافظ على الـ TTL الأصلي
    if (currentCount === 0) {
      await env.COURSES_CACHE.put(key, "1", { expirationTtl: windowSeconds });
    } else {
      await env.COURSES_CACHE.put(key, String(currentCount + 1), { expirationTtl: windowSeconds });
    }

    return { allowed: true, remaining: maxRequests - currentCount - 1 };
  } catch (e) {
    // لو حصل خطأ في KV نسمح بالطلب ولا نوقف الموقع
    console.error("[RateLimit] KV Error:", e.message);
    return { allowed: true };
  }
}

// ============================================================================
// قائمة الملفات الثابتة العامة — تُخدَّم مباشرة دون أي توجيه أو حماية
// تم إزالة sitemap.xml من هنا لجعله ديناميكياً
// ============================================================================
const PUBLIC_STATIC_FILES = [
  '/robots.txt',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico',
  '/manifest.webmanifest',
  '/sw.js',
];

export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID();

    // السماح بطلبات الـ CORS للمتصفح
    if (request.method === "OPTIONS") {
      const ch = getCorsHeaders(request, env);
      return new Response(null, { headers: { ...ch } });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ============================================================================
    // IP الخاص بالطالب — Cloudflare يضيفه تلقائياً في هذا الهيدر
    // ============================================================================
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    // ============================================================================
    // حماية عامة — نرفض أي IP يتجاوز 300 طلب في الدقيقة على أي مسار API
    // هذا الحد مرتفع بما يكفي للاستخدام العادي ومنخفض بما يكفي لوقف الـ bots
    // ============================================================================
    if (path.startsWith("/api/")) {
      const globalRateCheck = await checkRateLimit(env, clientIP, "global", 300, 60);
      if (!globalRateCheck.allowed) {
        const ch = getCorsHeaders(request, env);
        return new Response(
          JSON.stringify({ error: "طلبات كتير جداً، استنى لحظة وحاول تاني." }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(globalRateCheck.retryAfter),
              ...ch
            }
          }
        );
      }
    }

    // ============================================================================
    // 0. إنشاء ملف sitemap.xml ديناميكياً من قاعدة البيانات
    // ============================================================================
    if (path === '/sitemap.xml') {
      try {
        // جلب الكورسات المنشورة فقط من قاعدة البيانات
        const coursesDB = await env.DB.prepare("SELECT id FROM courses WHERE is_published = 1 ORDER BY id DESC").all();
        const courses = coursesDB.results || [];

        // بناء هيكل ملف الـ XML
        let sitemapXML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- الصفحات الأساسية -->
  <url>
    <loc>https://kollobeit3alem.pages.dev/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://kollobeit3alem.pages.dev/courses</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://kollobeit3alem.pages.dev/privacy</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>`;

        // إضافة روابط الكورسات ديناميكياً باستخدام Query Parameter (?id=)
        for (const course of courses) {
          sitemapXML += `
  <url>
    <loc>https://kollobeit3alem.pages.dev/course?id=${course.id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
        }

        sitemapXML += `\n</urlset>`;

        // إرسال الرد كـ XML مع إعدادات الكاش
        return new Response(sitemapXML, {
          status: 200,
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      } catch (error) {
        console.error("Sitemap Generation Error:", error);
        return new Response("Error generating sitemap", { status: 500 });
      }
    }

    // ============================================================================
    // 0.5. الملفات الثابتة العامة — تُخدَّم مباشرة بدون أي توجيه أو حماية
    // ============================================================================
    const isPublicStaticFile =
      PUBLIC_STATIC_FILES.includes(path) ||
      path.startsWith('/assets/') ||
      path.match(/\.(js|css|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|map)$/);

    if (isPublicStaticFile) {
      return env.ASSETS.fetch(request);
    }

    let adminUser = null;

    // ============================================================================
    // 1. حماية وتوجيه مسارات لوحة التحكم
    // ============================================================================
    if (path === "/admin.kollobeit3alem" || path === "/admin.html" || path.startsWith("/admin_") || path.startsWith("/api/admin/")) {

      // حماية إضافية لمسارات الأدمن — 30 محاولة بس في الدقيقة لأي IP
      if (path.startsWith("/api/admin/")) {
        const adminRateCheck = await checkRateLimit(env, clientIP, "admin", 30, 60);
        if (!adminRateCheck.allowed) {
          const ch = getCorsHeaders(request, env);
          return addSecurityHeaders(
            new Response(JSON.stringify({ error: "طلبات كتير على لوحة التحكم." }), {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": String(adminRateCheck.retryAfter),
                ...ch
              }
            }),
            requestId
          );
        }
      }

      adminUser = await verifyAdmin(request, env);

      if (!adminUser) {
        if (path.startsWith("/api/")) {
          const ch = getCorsHeaders(request, env);
          return addSecurityHeaders(
            new Response(JSON.stringify({ error: "Access Denied or Session Invalidated" }), {
              status: 403, headers: { "Content-Type": "application/json", ...ch }
            }),
            requestId
          );
        } else {
          return Response.redirect(url.origin + "/", 302);
        }
      }

      if (path.startsWith("/api/admin/")) {
        try {
          const ch = getCorsHeaders(request, env);
          let apiResponse = null;

          if (adminUser.role === 'instructor') {
            apiResponse = await handleInstructorRoutes(request, env, path, url, adminUser);
          } else if (adminUser.role === 'assistant') {
            apiResponse = await handleAssistantRoutes(request, env, path, url, adminUser);
          } else if (adminUser.role === 'admin') {
            apiResponse = await handleAdminRoutes(request, env, path, url, adminUser);
          }

          if (apiResponse) return addSecurityHeaders(apiResponse, requestId);

          return addSecurityHeaders(
            new Response(JSON.stringify({ error: "Access Denied or Endpoint Not Found" }), {
              status: 403, headers: { "Content-Type": "application/json", ...ch }
            }),
            requestId
          );

        } catch (error) {
          console.error("Admin Route Error:", error);
          const ch = getCorsHeaders(request, env);
          return addSecurityHeaders(
            new Response(JSON.stringify({ error: "حدث خطأ داخلي في الخادم، يرجى المحاولة لاحقاً" }), {
              status: 500, headers: { "Content-Type": "application/json", ...ch }
            }),
            requestId
          );
        }
      }
    }

    // ============================================================================
    // 2. توجيه مسارات API
    // ============================================================================
    if (path.startsWith("/api/") && !path.startsWith("/api/admin/")) {
      try {
        const ch = getCorsHeaders(request, env);
        let apiResponse = null;

        // حماية مسار تسجيل الدخول بـ rate limit أشد — 10 محاولات بس في الدقيقة
        // عشان نمنع brute force على حسابات الطلاب
        if (path.startsWith("/api/auth/")) {
          const authRateCheck = await checkRateLimit(env, clientIP, "auth", 10, 60);
          if (!authRateCheck.allowed) {
            return addSecurityHeaders(
              new Response(
                JSON.stringify({ error: "محاولات تسجيل دخول كتير، استنى دقيقة وحاول تاني." }),
                {
                  status: 429,
                  headers: {
                    "Content-Type": "application/json",
                    "Retry-After": String(authRateCheck.retryAfter),
                    ...ch
                  }
                }
              ),
              requestId
            );
          }
          apiResponse = await handleAuthRoutes(request, env, path, url);

        } else if (
          path.startsWith("/api/my-") ||
          path.startsWith("/api/enroll") ||
          path.startsWith("/api/wallet") ||
          path.startsWith("/api/progress") ||
          path.match(/^\/api\/courses\/\d+\/progress$/) ||
          path.startsWith("/api/paymob")
        ) {
          // حماية مسارات الطلاب — 120 طلب في الدقيقة لكل IP
          const studentRateCheck = await checkRateLimit(env, clientIP, "student", 120, 60);
          if (!studentRateCheck.allowed) {
            return addSecurityHeaders(
              new Response(
                JSON.stringify({ error: "طلبات كتير، استنى ثانية وحاول تاني." }),
                {
                  status: 429,
                  headers: {
                    "Content-Type": "application/json",
                    "Retry-After": String(studentRateCheck.retryAfter),
                    ...ch
                  }
                }
              ),
              requestId
            );
          }
          apiResponse = await handleStudentRoutes(request, env, path, url);

        } else if (
          path === "/api/courses" ||
          path.startsWith("/api/courses/") ||
          path.startsWith("/api/lessons/")
        ) {
          // مسارات الكورسات — عامة ومكثفة، نسمح بـ 200 طلب في الدقيقة
          const coursesRateCheck = await checkRateLimit(env, clientIP, "courses", 200, 60);
          if (!coursesRateCheck.allowed) {
            return addSecurityHeaders(
              new Response(
                JSON.stringify({ error: "طلبات كتير على الكورسات، استنى ثانية." }),
                {
                  status: 429,
                  headers: {
                    "Content-Type": "application/json",
                    "Retry-After": String(coursesRateCheck.retryAfter),
                    ...ch
                  }
                }
              ),
              requestId
            );
          }
          apiResponse = await handleCourseRoutes(request, env, path, url);
        }

        if (apiResponse) return addSecurityHeaders(apiResponse, requestId);

        return addSecurityHeaders(
          new Response(JSON.stringify({ error: "API Endpoint Not Found" }), {
            status: 404, headers: { "Content-Type": "application/json", ...ch }
          }),
          requestId
        );

      } catch (error) {
        console.error("API Route Error:", error);
        const ch = getCorsHeaders(request, env);
        return addSecurityHeaders(
          new Response(JSON.stringify({ error: "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً" }), {
            status: 500, headers: { "Content-Type": "application/json", ...ch }
          }),
          requestId
        );
      }
    }

    // ============================================================================
    // 3. عرض الـ SPA (React Frontend)
    //    Cloudflare Pages تعيد index.html لكل المسارات الأخرى
    // ============================================================================
    return env.ASSETS.fetch(request);
  },

  // ============================================================================
  // 4. موظف الخلفية — معالجة طابور الامتحانات
  // ============================================================================
  async queue(batch, env) {
    if (batch.queue === "exams-queue") {
      for (const msg of batch.messages) {
        try {
          const { userId, lessonId, answers } = msg.body;

          if (!userId || !lessonId || !Array.isArray(answers)) {
            console.warn(`[Queue] Invalid data format from user ${userId}. Dropping message.`);
            msg.ack();
            continue;
          }

          const dbQuestions = await env.DB.prepare(
            "SELECT id, correct_option FROM quizzes WHERE lesson_id = ?"
          ).bind(lessonId).all();

          if (!dbQuestions.results || dbQuestions.results.length === 0) {
            console.warn(`[Queue] No quiz found for lesson ${lessonId}. Skipping.`);
            msg.ack();
            continue;
          }

          let correctCount = 0;
          let finalAnswers = [];

          for (const q of dbQuestions.results) {
            let chosen = null;
            if (Array.isArray(answers)) {
              const ansObj = answers.find(a => a.question_id === q.id || a.id === q.id);
              chosen = ansObj ? (ansObj.chosen_option || ansObj.answer) : null;
            } else if (answers && typeof answers === 'object') {
              chosen = answers[q.id] || answers[q.id.toString()] || null;
            }

            const isCorrect = chosen === q.correct_option;
            if (isCorrect) correctCount++;

            finalAnswers.push({
              question_id: q.id,
              chosen_option: chosen,
              is_correct: isCorrect,
              correct_option: q.correct_option
            });
          }

          const actualScore = Math.round((correctCount / dbQuestions.results.length) * 100);

          await env.DB.prepare(
            "INSERT INTO quiz_attempts (user_id, lesson_id, score, answers_json) VALUES (?, ?, ?, ?)"
          ).bind(userId, lessonId, actualScore, JSON.stringify(finalAnswers)).run();

          msg.ack();

        } catch (error) {
          console.error("Background Queue Grading Error:", error);

          if (msg.attempts < 3) {
            console.log(`[Queue] Retrying message. Attempt: ${msg.attempts}`);
            msg.retry();
          } else {
            console.error(`[Queue] Message exceeded retry limits. Moving to failed_exams.`);
            try {
              await env.DB.prepare(
                "INSERT INTO failed_exams (user_id, lesson_id, answers_json, error_reason) VALUES (?, ?, ?, ?)"
              ).bind(
                msg.body.userId || 0,
                msg.body.lessonId || 0,
                JSON.stringify(msg.body.answers || {}),
                error.message
              ).run();
              msg.ack();
            } catch (dbError) {
              console.error("[Queue] Critical DB Failure during error logging.");
            }
          }
        }
      }
    }
  }
};
