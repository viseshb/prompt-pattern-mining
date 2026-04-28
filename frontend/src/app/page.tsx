import { Navbar } from "@/components/ui/Navbar";
import { HeroSection } from "@/components/sections/HeroSection";
import { DatasetSection } from "@/components/sections/DatasetSection";
import { MethodologySection } from "@/components/sections/MethodologySection";
import { ResultsSection } from "@/components/sections/ResultsSection";
import { CrossModelSection } from "@/components/sections/CrossModelSection";
import { ChatDemoSection } from "@/components/sections/ChatDemoSection";
import { MultiModelRaceSection } from "@/components/sections/MultiModelRaceSection";
import { Footer } from "@/components/ui/Footer";

export default function Home() {
  return (
    <main className="relative min-h-screen" style={{ background: "var(--color-bg-cream)", color: "var(--color-text)" }}>
      <Navbar />
      <HeroSection />
      <DatasetSection />
      <MethodologySection />
      <ResultsSection />
      <CrossModelSection />
      <ChatDemoSection />
      <MultiModelRaceSection />
      <Footer />
    </main>
  );
}
