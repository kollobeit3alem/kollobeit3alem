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
// محتوى الـ sitemap.xml — مُخزَّن مباشرة في الـ Worker
// السبب: لما الـ Worker يعمل env.ASSETS.fetch() على /sitemap.xml
// ممكن Cloudflare Pages يرجع index.html (SPA fallback) بدل الملف الفعلي
// وده بيخلي جوجل تشوف redirect بدل الـ XML
// الحل: نرجع المحتوى مباشرة من الـ Worker بدون الاعتماد على ASSETS
// ============================================================================
const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <url>
    <loc>https://kollobeit3alem.pages.dev/</loc>
    <lastmod>2026-04-09</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="ar" href="https://kollobeit3alem.pages.dev/" />
    <image:image>
      <image:loc>https://kollobeit3alem.pages.dev/logo.png</image:loc>
      <image:title>منصة كله بيتعلم — كورسات أونلاين</image:title>
      <image:caption>أفضل منصة كورسات أونلاين في مصر والعالم العربي</image:caption>
    </image:image>
  </url>

  <url>
    <loc>https://kollobeit3alem.pages.dev/courses</loc>
    <lastmod>2026-04-09</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <url>
    <loc>https://kollobeit3alem.pages.dev/privacy</loc>
    <lastmod>2026-04-09</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>

</urlset>`;

// ============================================================================
// محتوى الـ robots.txt — مُخزَّن مباشرة في الـ Worker
// نفس السبب: نضمن إن جوجل تقراه صح بدون أي redirect
// ============================================================================
const ROBOTS_TXT = `# robots.txt — منصة كله بيتعلم
# المؤلف: أدهم عطية سالم
# ============================================================

# السماح لكل روبوتات جوجل بفهرسة الصفحات العامة
User-agent: *
Allow: /
Allow: /courses
Allow: /privacy
Allow: /sitemap.xml
Allow: /robots.txt

# منع فهرسة صفحات المحتوى الخاص والإدارة
Disallow: /admin
Disallow: /admin.html
Disallow: /admin.kollobeit3alem
Disallow: /instructor
Disallow: /assistant
Disallow: /api/
Disallow: /profile
Disallow: /course

# السماح لـ Googlebot تحديداً
User-agent: Googlebot
Allow: /
Allow: /courses
Allow: /privacy
Allow: /sitemap.xml
Allow: /robots.txt
Disallow: /admin
Disallow: /admin.html
Disallow: /admin.kollobeit3alem
Disallow: /instructor
Disallow: /assistant
Disallow: /api/
Disallow: /profile
Disallow: /course

# مسار الـ Sitemap
Sitemap: https://kollobeit3alem.pages.dev/sitemap.xml

# Crawl-delay
Crawl-delay: 1`;

// ============================================================================
// قائمة الملفات الثابتة العامة — تُخدَّم عبر ASSETS مباشرة
// ملاحظة: /sitemap.xml و /robots.txt تمت إزالتهم من هنا
// لأنهم بيتعاملوا بشكل خاص فوق (Hardcoded Response)
// ============================================================================
const PUBLIC_STATIC_FILES = [
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
    // 0A. إرجاع sitemap.xml مباشرة من الـ Worker
    //     هذا يضمن 100% إن جوجل تحصل على الـ XML الصح
    //     بدون أي redirect أو SPA interference
    // ============================================================================
    if (path === '/sitemap.xml') {
      return new Response(SITEMAP_XML, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'X-Robots-Tag': 'noindex',
        },
      });
    }

    // ============================================================================
    // 0B. إرجاع robots.txt مباشرة من الـ Worker
    //     نفس السبب — نضمن إن جوجل تقراه صح دائماً
    // ============================================================================
    if (path === '/robots.txt') {
      return new Response(ROBOTS_TXT, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // ============================================================================
    // 0C. الملفات الثابتة العامة — تُخدَّم مباشرة بدون أي توجيه أو حماية
    //     الصور والـ assets والخطوط وغيرها
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

        if (path.startsWith("/api/auth/")) {
          apiResponse = await handleAuthRoutes(request, env, path, url);
        } else if (
          path.startsWith("/api/my-") ||
          path.startsWith("/api/enroll") ||
          path.startsWith("/api/wallet") ||
          path.startsWith("/api/progress") ||
          path.match(/^\/api\/courses\/\d+\/progress$/)
        ) {
          apiResponse = await handleStudentRoutes(request, env, path, url);
        } else if (
          path === "/api/courses" ||
          path.startsWith("/api/courses/") ||
          path.startsWith("/api/lessons/")
        ) {
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
