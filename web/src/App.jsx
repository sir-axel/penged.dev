import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { ScrollToTop } from "@/components/ScrollToTop";
import { RequireAuth, RequirePlayer } from "@/components/guards";
import { Home } from "@/pages/Home";
import { Leaderboard } from "@/pages/Leaderboard";
import { Feed } from "@/pages/Feed";
import { Confirm } from "@/pages/Confirm";
import { MatchDetail } from "@/pages/MatchDetail";
import { PlayerProfile } from "@/pages/Player";
import { Rules } from "@/pages/Rules";
import { Welcome } from "@/pages/Welcome";
import { NewMatch } from "@/pages/NewMatch";
import { Challenges } from "@/pages/Challenges";
import { Profile } from "@/pages/Profile";
import { Feedback } from "@/pages/Feedback";
import { AdminFeedback } from "@/pages/AdminFeedback";
import { AdminReviews } from "@/pages/AdminReviews";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { ResetPassword } from "@/pages/ResetPassword";
import { VerifyEmail } from "@/pages/VerifyEmail";
import { NotFound } from "@/pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/matches" element={<Navigate to="/feed" replace />} />
        <Route path="/matches/:id" element={<MatchDetail />} />
        <Route path="/players/:username" element={<PlayerProfile />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route element={<RequireAuth />}>
          <Route path="/welcome" element={<Welcome />} />
          <Route element={<RequirePlayer />}>
            <Route path="/matches/new" element={<NewMatch />} />
            <Route path="/confirm" element={<Confirm />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin/reviews" element={<AdminReviews />} />
            <Route path="/admin/feedback" element={<AdminFeedback />} />
          </Route>
        </Route>
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ScrollToTop />
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}
