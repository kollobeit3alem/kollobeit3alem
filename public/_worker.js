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

      // توجيه طلبات الـ API الخاصة بلوحة التحكم بناءً على الرتبة (أمان تام وعزل للملفات)
      if (path.startsWith("/api/admin/")) {
        try {
          let apiResponse = null;

          if (adminUser.role === 'instructor') {
            // توجيه لملف المدرس (يحتوي فقط على صلاحيات المدرس)
            apiResponse = await handleInstructorRoutes(request, env, path, url, adminUser);
          } 
          else if (adminUser.role === 'assistant') {
            // توجيه لملف المتابع (يحتوي فقط على صلاحيات المتابعة والقراءة)
            apiResponse = await handleAssistantRoutes(request, env, path, url, adminUser);
          } 
          else if (adminUser.role === 'admin') {
            // توجيه لملف المدير (يحتوي على الصلاحيات المطلقة)
            apiResponse = await handleAdminRoutes(request, env, path, url, adminUser);
          }

          // إذا تم معالجة الطلب في الملف المختص، قم بإرجاع الرد
          if (apiResponse) return apiResponse;
          
          // إذا لم يتم العثور على المسار أو كان المستخدم يحاول الوصول لصلاحية غير موجودة في ملفه
          return new Response(JSON.stringify({ error: "Access Denied or Endpoint Not Found" }), { 
            status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } 
          });

        } catch (error) {
          // التعديل الأمني هنا: تسجيل الخطأ داخلياً وإرسال رسالة عامة للمستخدم
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

        // أ. مسارات المصادقة وتسجيل الدخول
        if (path.startsWith("/api/auth/")) {
          apiResponse = await handleAuthRoutes(request, env, path, url);
        }
        // ب. مسارات تفاعل الطالب (ملفه الشخصي، حفظ التقدم، الاشتراك والمحفظة)
        else if (path.startsWith("/api/my-") || path.startsWith("/api/enroll") || path.startsWith("/api/wallet") || path.startsWith("/api/progress") || path.match(/^\/api\/courses\/\d+\/progress$/)) {
          apiResponse = await handleStudentRoutes(request, env, path, url);
        }
        // ج. مسارات عرض المحتوى التعليمي (الكورسات، الدروس، الامتحانات)
        else if (path === "/api/courses" || path.startsWith("/api/courses/") || path.startsWith("/api/lessons/")) {
          apiResponse = await handleCourseRoutes(request, env, path, url);
        }

        // إرجاع الرد إذا تم معالجته
        if (apiResponse) return apiResponse;
        
        // مسار غير موجود
        return new Response(JSON.stringify({ error: "API Endpoint Not Found" }), { 
          status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } 
        });

      } catch (error) {
        // التعديل الأمني هنا: تسجيل الخطأ داخلياً وإرسال رسالة مبهمة للمستخدم
        console.error("API Route Error:", error);
        return new Response(JSON.stringify({ error: "حدث خطأ غير متوقع، يرجى المحاولة لاحقاً" }), { 
          status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }
    }

    // ============================================================================
    // 3. عرض الملفات الثابتة للصفحات العادية (React Frontend)
    // ============================================================================
    return env.ASSETS.fetch(request);
  },

  // ============================================================================
  // 4. موظف الخلفية: المسؤول عن سحب الامتحانات من الطابور وتصحيحها بهدوء 🏭
  // ============================================================================
  async queue(batch, env) {
    // نتأكد إن الرسائل دي جاية من طابور الامتحانات بتاعنا
    if (batch.queue === "exams-queue") {
      
      // السيرفر هيمسك رسالة رسالة (طالب طالب) من الطابور
      for (const msg of batch.messages) {
        try {
          // 1. استخراج بيانات الطالب والامتحان من الرسالة
          const { userId, lessonId, answers } = msg.body;

          // 2. جلب الإجابات الصحيحة من الداتا بيز (سراً)
          const dbQuestions = await env.DB.prepare("SELECT id, correct_option FROM quizzes WHERE lesson_id = ?").bind(lessonId).all();

          if (!dbQuestions.results || dbQuestions.results.length === 0) {
            msg.ack(); // لو مفيش امتحان أصلاً، اعتبر العملية خلصت واحذف الرسالة
            continue;
          }

          let correctCount = 0;
          let finalAnswers = [];

          // 3. عملية التصحيح
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

          // حساب النسبة المئوية
          const actualScore = Math.round((correctCount / dbQuestions.results.length) * 100);

          // 4. الحفظ في الداتا بيز (أخيراً)
          await env.DB.prepare(
            "INSERT INTO quiz_attempts (user_id, lesson_id, score, answers_json) VALUES (?, ?, ?, ?)"
          ).bind(userId, lessonId, actualScore, JSON.stringify(finalAnswers)).run();

          // 5. تأكيد النجاح: بنقول للطابور "خلاص الورقة دي اتصححت بنجاح، احذفها"
          msg.ack();

        } catch (error) {
          console.error("Background Queue Grading Error:", error);
          // 6. خطة الإنقاذ: لو الداتا بيز لسه زحمة ومقدرتش تحفظ النتيجة دلوقتي
          // بنقول للطابور "متحذفش ورقة الطالب دي، حاول تصححها تاني كمان شوية"
          msg.retry();
        }
      }
    }
  }
};
