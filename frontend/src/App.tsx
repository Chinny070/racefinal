import { Routes, Route } from "react-router-dom";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { LandingPage } from "./pages/LandingPage";
import { ContestExplorerPage } from "./pages/ContestExplorerPage";
import { ContestCreatePage } from "./pages/ContestCreatePage";
import { ContestDetailPage } from "./pages/ContestDetailPage";
import { JoinContestPage } from "./pages/JoinContestPage";
import { SettlementProgressPage } from "./pages/SettlementProgressPage";
import { FinalResultPage } from "./pages/FinalResultPage";
import { WithdrawalPage } from "./pages/WithdrawalPage";

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/contests" element={<ContestExplorerPage />} />
          <Route path="/contests/new" element={<ContestCreatePage />} />
          <Route path="/contests/:id" element={<ContestDetailPage />} />
          <Route path="/contests/:id/join" element={<JoinContestPage />} />
          <Route path="/contests/:id/settle" element={<SettlementProgressPage />} />
          <Route path="/contests/:id/result" element={<FinalResultPage />} />
          <Route path="/withdraw" element={<WithdrawalPage />} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}
