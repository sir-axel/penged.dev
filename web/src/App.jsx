import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { ScrollToTop } from "@/components/ScrollToTop";
import { RequireAuth, RequirePlayer } from "@/components/guards";
import { Home } from "@/pages/Home";
import { Leaderboard } from "@/pages/Leaderboard";
import { Matches } from "@/pages/Matches";
import { MatchDetail } from "@/pages/MatchDetail";
import { PlayerProfile } from "@/pages/Player";
import { Rules } from "@/pages/Rules";
import { Welcome } from "@/pages/Welcome";
import { NewMatch } from "@/pages/NewMatch";
import { Challenges } from "@/pages/Challenges";
import { Profile } from "@/pages/Profile";
import { AdminReviews } from "@/pages/AdminReviews";
import { Login } from "@/pages/Login";
import { Register } from "@/pages/Register";
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
        <Route path="/matches" element={<Matches />} />
        <Route path="/matches/:id" element={<MatchDetail />} />
        <Route path="/players/:username" element={<PlayerProfile />} />
        <Route path="/rules" element={<Rules />} />
        <Route element={<RequireAuth />}>
          <Route path="/welcome" element={<Welcome />} />
          <Route element={<RequirePlayer />}>
            <Route path="/matches/new" element={<NewMatch />} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin/reviews" element={<AdminReviews />} />
          </Route>
        </Route>
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
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
