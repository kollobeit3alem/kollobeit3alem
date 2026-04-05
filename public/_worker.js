import { corsHeaders } from './api-routes/utils.js';
import { verifyAdmin } from './api-routes/auth.js';
import { handleAdminRoutes } from './api-routes/admin.js';
import { handleStudentRoutes } from './api-routes/student.js';

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    let adminUser = null;

    // --- 1. حماية وتوجيه مسارات الإدارة ---
    if (path === "/admin.kollobeit3alem" || path === "/admin.html" || path.startsWith("/admin_") || path.startsWith("/api/admin/")) {
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

      // --- تطبيق القيود الصارمة على المعلم (instructor) والمتابع (assistant) ---
      if (adminUser.role === 'instructor' || adminUser.role === 'assistant') {
        const isAssistant = adminUser.role === 'assistant';
        const isInstructor = adminUser.role === 'instructor';
        
        let isRestricted = false;

        if (isAssistant) {
          // المتابع (assistant) مسموح له فقط بمسارات القراءة (GET) للطلاب والتقارير
          const isAllowedPath = (path.startsWith("/api/admin/users") || path.startsWith("/api/admin/reports")) && request.method === "GET";
          if (!isAllowedPath) {
            isRestricted = true;
          }
        } else if (isInstructor) {
          // مسارات ممنوعة تماماً على المعلم
          const restrictedPaths = [
            "/api/admin/codes",
            "/api/admin/users/role"
          ];
          if (restrictedPaths.some(rp => path.startsWith(rp))) {
            isRestricted = true;
          }
          // منع المعلم من حذف أو تعديل المستخدمين
          const isUserModify = path.match(/^\/api\/admin\/users\/\d+$/) && (request.method === "DELETE" || request.method === "PUT");
          if (isUserModify) {
            isRestricted = true;
          }
        }
        
        if (isRestricted) {
          return new Response(JSON.stringify({ error: "Access Denied: غير مصرح لك بهذا الإجراء" }), { 
            status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } 
          });
        }
      }

      // إذا كان الطلب يخص API الإدارة، نوجهه لملف admin.js
      if (path.startsWith("/api/admin/")) {
        try {
          const adminResponse = await handleAdminRoutes(request, env, path, url, adminUser);
          if (adminResponse) return adminResponse;
          return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
        } catch (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }
      }
    }

    // --- 2. توجيه مسارات الـ API للطلاب والزوار ---
    if (path.startsWith("/api/") && !path.startsWith("/api/admin/")) {
      try {
        const studentResponse = await handleStudentRoutes(request, env, path, url);
        if (studentResponse) return studentResponse;
        
        // في حال أن المسار غير موجود في ملف student.js
        return new Response(JSON.stringify({ error: "Not Found" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    // --- 3. عرض الملفات الثابتة للصفحات العادية ---
    return env.ASSETS.fetch(request);
  }
};
