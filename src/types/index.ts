// User Types
export interface User {
  id: number;
  name: string;
  email: string;
  avatar_url?: string;
  role: 'student' | 'instructor' | 'admin';
  created_at?: string;
  session_id?: string;
}

// Course Types
export interface Course {
  id: number;
  title: string;
  description?: string;
  image_url?: string;
  instructor_contact?: string;
  is_free: number;
  price?: number;
  instructor_id?: number;
  created_at?: string;
}

// Lesson Types
export interface Lesson {
  id: number;
  course_id: number;
  title: string;
  video_url: string;
  order_num: number;
  is_admin_locked?: number;
  hasQuiz?: boolean;
  quizData?: QuizQuestion[];
}

// Quiz Types
export interface QuizQuestion {
  id: number;
  lesson_id: number;
  image_url: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: 'A' | 'B' | 'C' | 'D';
}

// Enrollment Types
export interface Enrollment {
  course_id: number;
  enrolled_at?: string;
}

// Progress Types
export interface StudentProgress {
  lesson_id: number;
  completed_at?: string;
}

// Activation Code Types
export interface ActivationCode {
  id: number;
  code: string;
  course_id: number;
  is_used: number;
  used_by?: number;
  used_at?: string;
}

// Dashboard Types
export interface DashboardData {
  stats: {
    totalCourses: number;
    completedLessons: number;
  };
  enrolledCourses: EnrolledCourseWithProgress[];
}

export interface EnrolledCourseWithProgress {
  id: number;
  title: string;
  image_url?: string;
  total_lessons: number;
  completed_lessons: number;
}

// Report Types
export interface StudentReport {
  enrollments: {
    title: string;
    enrolled_at: string;
  }[];
  progress: {
    lesson_title: string;
    course_title: string;
    completed_at: string;
  }[];
}

// Auth Context Types
export interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credential: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => boolean;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  invalidSession?: boolean;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: User;
}
