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
// دالة إضافة X-Robots-Tag: noindex لصفحات المحتوى الخاص
// تمنع جوجل من فهرسة محتوى الكورسات حتى لو وصل إليها
// ============================================================================
function addNoIndexHeader(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

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
    // 0. السماح الصريح للملفات الـ Static الخاصة بـ SEO
    //    جوجل يحتاج يصل لـ sitemap.xml و robots.txt بدون أي redirect أو تدخل
    //    Cloudflare Pages يخدمها من /public مباشرة، لكن نضمن عدم التدخل فيها
    // ============================================================================
    if (
      path === "/sitemap.xml" ||
      path === "/robots.txt" ||
      path === "/logo.png" ||
      path === "/icon-192.png" ||
      path === "/icon-512.png" ||
      path === "/favicon.ico"
    ) {
      // نخليها تمر مباشرة لـ ASSETS بدون أي معالجة
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
    // 2. توجيه مسارات المنصة العامة والطلاب
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
    // 3. عرض الملفات الثابتة (React Frontend)
    //    نضيف X-Robots-Tag: noindex لصفحة /course عشان محتواها خاص
    //    ونضيف للصفحات الإدارية كمان
    // ============================================================================
    const staticResponse = await env.ASSETS.fetch(request);

    // صفحة محتوى الكورس — خاصة بالمشتركين، لا تُفهرس
    if (path === "/course" || path.startsWith("/course?") || url.search.includes("id=")) {
      if (path === "/course") {
        return addNoIndexHeader(staticResponse);
      }
    }

    // الصفحات الإدارية والخاصة — لا تُفهرس
    if (
      path === "/profile" ||
      path === "/admin" ||
      path === "/instructor" ||
      path === "/assistant" ||
      path === "/login"
    ) {
      return addNoIndexHeader(staticResponse);
    }

    return staticResponse;
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
