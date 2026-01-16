import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import payverseLogo from "@assets/payverse_logo.png";

export default function Preloader({ onComplete }: { onComplete: () => void }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onComplete, 500);
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
          aria-busy="true"
          aria-label="Loading PayVerse"
        >
          <div className="relative flex flex-col items-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative"
            >
              <motion.div
                animate={{ 
                  rotate: 360,
                  scale: [1, 1.1, 1]
                }}
                transition={{ 
                  rotate: { duration: 3, repeat: Infinity, ease: "linear" },
                  scale: { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                }}
                className="absolute -inset-8 rounded-full bg-gradient-to-r from-primary/30 via-teal-500/30 to-blue-500/30 blur-xl"
              />
              
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="absolute -inset-4 rounded-full border-2 border-dashed border-primary/20"
              />
              
              <motion.div
                animate={{ 
                  y: [0, -10, 0],
                }}
                transition={{ 
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="relative bg-slate-900 rounded-2xl p-6 shadow-2xl shadow-primary/20"
              >
                <img 
                  src={payverseLogo} 
                  alt="PayVerse" 
                  className="h-16 w-auto object-contain"
                />
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="mt-8 flex flex-col items-center"
            >
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      scale: [1, 1.5, 1],
                      opacity: [0.3, 1, 0.3]
                    }}
                    transition={{ 
                      duration: 1,
                      repeat: Infinity,
                      delay: i * 0.2
                    }}
                    className="h-2 w-2 rounded-full bg-primary"
                  />
                ))}
              </div>
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="mt-4 text-sm text-slate-400 font-medium"
              >
                Loading your experience...
              </motion.p>
            </motion.div>
          </div>

          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              initial={{ 
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                scale: 0
              }}
              animate={{ 
                y: [null, Math.random() * -200],
                x: [null, (Math.random() - 0.5) * 100],
                scale: [0, 1, 0],
                opacity: [0, 0.6, 0]
              }}
              transition={{ 
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                delay: i * 0.5
              }}
              className="absolute h-3 w-3 rounded-full bg-gradient-to-r from-primary to-teal-400"
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
