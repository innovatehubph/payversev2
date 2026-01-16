import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export interface TourStep {
  target: string;
  title: string;
  content: string;
  placement?: "top" | "bottom" | "left" | "right";
}

interface GuidedTourProps {
  tourId: string;
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}

export function GuidedTour({ tourId, steps, onComplete, onSkip }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const step = steps[currentStep];
  
  const updateTargetPosition = useCallback(() => {
    if (!step?.target) return;
    const element = document.querySelector(step.target);
    if (element) {
      const rect = element.getBoundingClientRect();
      setTargetRect(rect);
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [step?.target]);

  useEffect(() => {
    updateTargetPosition();
    window.addEventListener("resize", updateTargetPosition);
    window.addEventListener("scroll", updateTargetPosition);
    return () => {
      window.removeEventListener("resize", updateTargetPosition);
      window.removeEventListener("scroll", updateTargetPosition);
    };
  }, [updateTargetPosition]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const getTooltipPosition = () => {
    if (!targetRect) return { top: "50%", left: "50%" };
    
    const placement = step?.placement || "bottom";
    const padding = 16;
    const tooltipWidth = 320;
    const tooltipHeight = 180;

    switch (placement) {
      case "top":
        return {
          top: `${targetRect.top - tooltipHeight - padding}px`,
          left: `${Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding))}px`,
        };
      case "bottom":
        return {
          top: `${targetRect.bottom + padding}px`,
          left: `${Math.max(padding, Math.min(targetRect.left + targetRect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding))}px`,
        };
      case "left":
        return {
          top: `${targetRect.top + targetRect.height / 2 - tooltipHeight / 2}px`,
          left: `${targetRect.left - tooltipWidth - padding}px`,
        };
      case "right":
        return {
          top: `${targetRect.top + targetRect.height / 2 - tooltipHeight / 2}px`,
          left: `${targetRect.right + padding}px`,
        };
      default:
        return {
          top: `${targetRect.bottom + padding}px`,
          left: `${targetRect.left}px`,
        };
    }
  };

  return (
    <div className="fixed inset-0 z-[100]" data-testid="guided-tour">
      <div className="absolute inset-0 bg-black/60" onClick={onSkip} />
      
      {targetRect && (
        <div
          className="absolute border-2 border-primary rounded-lg pointer-events-none"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.6)",
          }}
        />
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute z-10"
          style={getTooltipPosition()}
        >
          <Card className="w-80 p-4 shadow-xl border-primary/20" data-testid="tour-tooltip">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">
                  Step {currentStep + 1} of {steps.length}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onSkip}
                data-testid="tour-close"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <h3 className="font-semibold text-lg mb-2">{step?.title}</h3>
            <p className="text-sm text-muted-foreground mb-4">{step?.content}</p>
            
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkip}
                data-testid="tour-skip"
              >
                Skip Tour
              </Button>
              <div className="flex gap-2">
                {currentStep > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrev}
                    data-testid="tour-prev"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleNext}
                  data-testid="tour-next"
                >
                  {currentStep === steps.length - 1 ? "Finish" : "Next"}
                  {currentStep < steps.length - 1 && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export const DASHBOARD_TOUR_STEPS: TourStep[] = [
  {
    target: '[data-testid="wallet-balance"]',
    title: "Your Wallet Balance",
    content: "This is your main wallet showing your PHPT balance. PHPT is pegged 1:1 to Philippine Peso - use it for fast, secure transfers.",
    placement: "bottom",
  },
  {
    target: '[data-testid="quick-actions"]',
    title: "Quick Actions",
    content: "Your shortcuts for common tasks - send money, deposit funds via crypto, QRPH, or P2P transfers.",
    placement: "top",
  },
  {
    target: '[data-testid="nav-transfer"]',
    title: "Send Money",
    content: "Transfer PHPT to other PayVerse users instantly. Large transfers (above 5,000 PHPT) require your PIN for extra security.",
    placement: "right",
  },
  {
    target: '[data-testid="nav-crypto"]',
    title: "Crypto Top-Up",
    content: "Add funds to your wallet using PayGram. You can also withdraw PHPT to your external crypto wallet.",
    placement: "right",
  },
  {
    target: '[data-testid="nav-settings"]',
    title: "Profile & Security",
    content: "Manage your account settings, set up PIN protection, verify your identity, and restart this tour anytime.",
    placement: "right",
  },
];
