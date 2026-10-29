import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Layout } from "@/components/Layout";
import { ScrollToTop } from "@/components/ScrollToTop";
import { RedirectIfSignedIn, RequireAuth, RequirePlayer } from "@/components/guards";
import { Home } from "@/pages/Home";
import { Leaderboard } from "@/pages/Leaderboard";
import { Guilds, GuildNew } from "@/pages/Guilds";
import { GuildPage } from "@/pages/Guild";
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
import { AdminReports } from "@/pages/AdminReports";
import { Chat } from "@/pages/Chat";
import { ChatTopic } from "@/pages/ChatTopic";
import { ChatDisputes } from "@/pages/ChatDisputes";
import { ChatDm } from "@/pages/ChatDm";
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
        <Route path="/guilds" element={<Guilds />} />
        <Route path="/guilds/:id" element={<GuildPage />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/matches" element={<Navigate to="/feed" replace />} />
        <Route path="/matches/:id" element={<MatchDetail />} />
        <Route path="/players/:username" element={<PlayerProfile />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/chat/disputes" element={<ChatDisputes />} />
        <Route path="/chat/messages" element={<Navigate to="/chat?tab=messages" replace />} />
        <Route path="/chat/t/:id" element={<ChatTopic />} />
        <Route element={<RequireAuth />}>
          <Route path="/welcome" element={<Welcome />} />
          <Route element={<RequirePlayer />}>
            <Route path="/matches/new" element={<NewMatch />} />
            <Route path="/guilds/new" element={<GuildNew />} />
            <Route path="/confirm" element={<Confirm />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin/reviews" element={<AdminReviews />} />
            <Route path="/admin/feedback" element={<AdminFeedback />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/chat/dm/:threadId" element={<ChatDm />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="/login" element={<RedirectIfSignedIn><Login /></RedirectIfSignedIn>} />
      <Route path="/register" element={<RedirectIfSignedIn><Register /></RedirectIfSignedIn>} />
      <Route path="/forgot-password" element={<RedirectIfSignedIn><ForgotPassword /></RedirectIfSignedIn>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <ScrollToTop />
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
