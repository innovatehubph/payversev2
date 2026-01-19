/**
 * Chat Action Status Component
 *
 * Animated status indicator showing what the AI is doing in the background.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Search,
  Database,
  Calculator,
  FileText,
  User,
  Shield,
  Sparkles,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ActionType =
  | "thinking"
  | "analyzing"
  | "searching"
  | "fetching_data"
  | "calculating"
  | "generating"
  | "verifying"
  | "function_call"
  | "completing";

export interface ActionStatus {
  type: ActionType;
  message: string;
  detail?: string;
  functionName?: string;
}

interface ChatActionStatusProps {
  action: ActionStatus | null;
  className?: string;
}

const ACTION_CONFIG: Record<
  ActionType,
  { icon: typeof Brain; color: string; bgColor: string }
> = {
  thinking: {
    icon: Brain,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
  },
  analyzing: {
    icon: Search,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  searching: {
    icon: Search,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
  fetching_data: {
    icon: Database,
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  calculating: {
    icon: Calculator,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  generating: {
    icon: FileText,
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  verifying: {
    icon: Shield,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  function_call: {
    icon: Sparkles,
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
  },
  completing: {
    icon: CheckCircle2,
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
};

// Map function names to user-friendly descriptions
const FUNCTION_DESCRIPTIONS: Record<string, { action: ActionType; message: string }> = {
  get_balance: { action: "fetching_data", message: "Checking your wallet balance" },
  get_transactions: { action: "fetching_data", message: "Retrieving transaction history" },
  search_user: { action: "searching", message: "Searching for users" },
  get_profile: { action: "fetching_data", message: "Loading profile information" },
  get_platform_info: { action: "fetching_data", message: "Getting platform details" },
  admin_get_stats: { action: "calculating", message: "Calculating platform statistics" },
  admin_search_transactions: { action: "searching", message: "Searching transactions" },
  admin_generate_report: { action: "generating", message: "Generating report" },
};

export function ChatActionStatus({ action, className }: ChatActionStatusProps) {
  const [dots, setDots] = useState("");

  // Animate dots
  useEffect(() => {
    if (!action) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 400);

    return () => clearInterval(interval);
  }, [action]);

  if (!action) return null;

  const config = ACTION_CONFIG[action.type];
  const Icon = config.icon;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={action.type + action.message}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "flex items-center gap-3 p-3 rounded-lg",
          config.bgColor,
          className
        )}
      >
        {/* Animated icon */}
        <div className="relative">
          <motion.div
            animate={{
              scale: [1, 1.1, 1],
              rotate: action.type === "thinking" ? [0, 5, -5, 0] : 0,
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center",
              config.bgColor
            )}
          >
            <Icon className={cn("h-4 w-4", config.color)} />
          </motion.div>

          {/* Pulse ring */}
          <motion.div
            animate={{
              scale: [1, 1.5, 1.5],
              opacity: [0.5, 0, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeOut",
            }}
            className={cn(
              "absolute inset-0 rounded-full border-2",
              config.color.replace("text-", "border-")
            )}
          />
        </div>

        {/* Status text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("text-sm font-medium", config.color)}>
              {action.message}
              <span className="inline-block w-6 text-left">{dots}</span>
            </span>
          </div>

          {action.detail && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-muted-foreground mt-0.5 truncate"
            >
              {action.detail}
            </motion.p>
          )}
        </div>

        {/* Animated loading spinner */}
        <Loader2 className={cn("h-4 w-4 animate-spin", config.color)} />
      </motion.div>
    </AnimatePresence>
  );
}

// Helper to generate action status from function name
export function getActionFromFunction(functionName: string): ActionStatus {
  const desc = FUNCTION_DESCRIPTIONS[functionName];
  if (desc) {
    return {
      type: desc.action,
      message: desc.message,
      functionName,
    };
  }

  return {
    type: "function_call",
    message: `Executing ${functionName.replace(/_/g, " ")}`,
    functionName,
  };
}

// Default thinking status
export function getThinkingStatus(): ActionStatus {
  return {
    type: "thinking",
    message: "Processing your request",
    detail: "Analyzing context and preparing response",
  };
}

// Completing status
export function getCompletingStatus(): ActionStatus {
  return {
    type: "completing",
    message: "Finishing up",
    detail: "Formatting the response",
  };
}

export default ChatActionStatus;
