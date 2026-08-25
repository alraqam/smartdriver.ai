import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { ThemeProvider } from './design/theme.jsx';
import { Loading } from './design/primitives.jsx';
import { Shell } from './Shell.jsx';

import Login from './pages/Login.jsx';
import Road from './pages/Road.jsx';
import Lessons from './pages/Lessons.jsx';
import Lesson from './pages/Lesson.jsx';
import Mistakes from './pages/Mistakes.jsx';
import Quiz from './pages/Quiz.jsx';
import Result from './pages/Result.jsx';
import Review from './pages/Review.jsx';
import Signs from './pages/Signs.jsx';
import Tutor from './pages/Tutor.jsx';
import Profile from './pages/Profile.jsx';
import Admin from './pages/Admin.jsx';
import { MockIntro, MockRunner, MockResult } from './pages/Mock.jsx';

const THEME_KEY = 'sdai.dark';

function RequireAuth({ children }) {
  const { isAuthed, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading label="" />;
  if (!isAuthed) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

export default function App() {
  const { isAuthed } = useAuth();

  // Defaults to light: the design's warm off-white is the intended first
  // impression, and it is the better read in the daylight most learners
  // study in.
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === 'true');

  useEffect(() => {
    localStorage.setItem(THEME_KEY, String(dark));
    // Keeps the browser chrome and any overscroll gutter in step with the app.
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.body.style.background = dark ? '#141217' : '#DCD6CB';
  }, [dark]);

  return (
    <ThemeProvider dark={dark}>
      <Routes>
        <Route
          path="/login"
          element={isAuthed ? <Navigate to="/" replace /> : <Login dark={dark} setDark={setDark} />}
        />
        <Route
          path="*"
          element={
            <RequireAuth>
              <Shell dark={dark} setDark={setDark}>
                <Routes>
                  <Route path="/" element={<Road />} />
                  <Route path="/lessons" element={<Lessons />} />
                  <Route path="/lesson/:id" element={<Lesson />} />
                  <Route path="/mistakes" element={<Mistakes />} />
                  <Route path="/session/:id" element={<Quiz />} />
                  <Route path="/result/:id" element={<Result />} />
                  <Route path="/review/:id" element={<Review />} />
                  <Route path="/mock" element={<MockIntro />} />
                  <Route path="/mock/run/:id" element={<MockRunner />} />
                  <Route path="/mock/result/:id" element={<MockResult />} />
                  <Route path="/signs" element={<Signs />} />
                  <Route path="/tutor" element={<Tutor />} />
                  <Route path="/tutor/:threadId" element={<Tutor />} />
                  <Route path="/profile" element={<Profile dark={dark} setDark={setDark} />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Shell>
            </RequireAuth>
          }
        />
      </Routes>
    </ThemeProvider>
  );
}
