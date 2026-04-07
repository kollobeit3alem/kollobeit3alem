import { corsHeaders } from './api-routes/utils.js';
import { verifyAdmin } from './api-routes/auth.js';

// استدعاء ملفات المهام المنفصلة (Separation of Concerns)
import { handleAuthRoutes } from './api-routes/auth.js';
import { handleCourseRoutes } from './api-routes/courses.js';
import { handleStudentRoutes } from './api-routes/student.js';
import { handleInstructorRoutes } from './api-routes/instructor.js';
import { handleAssistantRoutes } from './api-routes/assistant.js';
import { handleAdminRoutes } from './api-routes/admin.js';

export default {
  async fetch(request, env, ctx) {
    // 0. السماح بطلبات الـ CORS للمتصفح
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    let adminUser = null;

    // ============================================================================
    // 1. حماية وتوجيه مسارات لوحة التحكم (Admin, Instructor, Assistant)
    // ============================================================================
    if (path === "/admin.kollobeit3alem" || path === "/admin.html" || path.startsWith("/admin_") || path.startsWith("/api/admin/")) {
      
      // التفتيش على هوية الزائر
      adminUser = await verifyAdmin(request, env);
      
      if (!adminUser) {
        if (path.startsWith("/api/")) {
          return new Response(JSON.stringify({ error: "Access Denied or Session Invalidated" }), { 
            status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } 
          });
        } else {
          return Response.redirect(url.origin + "/courses.html", 302);
        }
      }

      // توجيه طلبات الـ API الخاصة بلوحة التحكم بناءً على الرتبة
      if (path.startsWith("/api/admin/")) {
        try {
          let apiResponse = null;

          if (adminUser.role === 'instructor') {
            apiResponse = await handleInstructorRoutes(request, env, path, url, adminUser);
          } 
          else if (adminUser.role === 'assistant') {
            apiResponse = await handleAssistantRoutes(request, env, path, url, adminUser);
          } 
          else if (adminUser.role === 'admin') {
            apiResponse = await handleAdminRoutes(request, env, path, url, adminUser);
          }

          if (apiResponse) return apiResponse;
          
          return new Response(JSON.stringify({ error: "Access Denied or Endpoint Not Found" }), { 
            status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } 
          });

        } catch (error) {
          console.error("Admin Route Error:", error);
          return new Response(JSON.stringify({ error: "حدث خطأ داخلي في الخادم، يرجى المحاولة لاحقاً" }), { 
            status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } 
          });
        }
      }
    }

    // ============================================================================
    // 2. توجيه مسارات المنصة العامة والطلاب (بدون الدخول للوحة الإدارة)
    // ============================================================================
    if (path.startsWith("/api/") && !path.startsWith("/api/admin/")) {
      try {
        let apiResponse = null;

        if (path.startsWith("/api/auth/")) {
          apiResponse = await handleAuthRoutes(request, env, path, url);
        }
        else if (path.startsWith("/api/my-") || path.startsWith("/api/enroll") || path.startsWith("/api/wallet") || path.startsWith("/api/progress") || path.match(/^\/api\/courses\/\d+\/progress$/)) {
          apiResponse = await handleStudentRoutes(request, env, path, url);
        }
        else if (path === "/api/courses" || path.startsWith("/api/courses/") || path.startsWith("/api/lessons/")) {
          apiResponse = await handleCourseRoutes(request, env, path, url);
        }

        if (apiResponse) return apiResponse;
        
        return new Response(JSON.stringify({ error: "API Endpoint Not Found" }), { 
          status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } 
        });

      } catch (error) {
        console.error("API Route Error:", error);
        return new Response(JSON.stringify({ error: "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً" }), { 
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }
    }

    // 3. عرض الملفات الثابتة (React Frontend)
    return env.ASSETS.fetch(request);
  },

  // ============================================================================
  // 4. موظف الخلفية: المطور والمحمي ضد الرسائل المسممة والضغط العالي 🏭
  // ============================================================================
  async queue(batch, env) {
    if (batch.queue === "exams-queue") {
      for (const msg of batch.messages) {
        try {
          const { userId, lessonId, answers } = msg.body;

          // 🛡️ خط الدفاع الأول: الفرز المبدئي (Data Validation)
          // التأكد من أن البيانات مرسلة بشكل صحيح قبل أي عملية مع قاعدة البيانات
          if (!userId || !lessonId || !Array.isArray(answers)) {
            console.warn(`[Queue] Invalid data format from user ${userId}. Dropping message.`);
            msg.ack(); // حذف الرسالة الفاسدة فوراً لعدم تعطيل الطابور
            continue;
          }

          // 1. جلب الإجابات الصحيحة من الداتا بيز
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

          // 2. عملية التصحيح البرمجية
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

          // 3. الحفظ النهائي في قاعدة البيانات
          await env.DB.prepare(
            "INSERT INTO quiz_attempts (user_id, lesson_id, score, answers_json) VALUES (?, ?, ?, ?)"
          ).bind(userId, lessonId, actualScore, JSON.stringify(finalAnswers)).run();

          // 4. تأكيد النجاح وحذفها من الطابور
          msg.ack();

        } catch (error) {
          console.error("Background Queue Grading Error:", error);
          
          // 🛡️ خط الدفاع الثاني: عداد المحاولات (Retry Limit)
          // إذا فشلت العملية بسبب ضغط قاعدة البيانات، نحاول بحد أقصى 3 مرات
          if (msg.attempts < 3) {
            console.log(`[Queue] Retrying message. Attempt: ${msg.attempts}`);
            msg.retry();
          } else {
            // 🛡️ خط الدفاع الثالث: سلة المهملات الذكية (Custom DLQ)
            // إذا فشل التصحيح بعد 3 محاولات، نحفظ الورقة في جدول الفاشلين للأدمن
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
              
              // بعد الحفظ في جدول الأخطاء، نحذفها من الطابور لتنظيف السير
              msg.ack();
            } catch (dbError) {
              // إذا كانت قاعدة البيانات منهارة تماماً ولا تقبل حتى تسجيل الخطأ
              // نترك الرسالة لتعود للطابور لاحقاً كحل أخير
              console.error("[Queue] Critical DB Failure during error logging.");
            }
          }
        }
      }
    }
  }
};
