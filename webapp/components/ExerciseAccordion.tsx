"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type ExerciseType = 'strength' | 'conditioning' | 'warmup' | 'abs' | 'cooldown';

interface Exercise {
  name: string;
  type: ExerciseType;
  sets?: number;
  reps?: string;
  rest?: string;
  details?: string;
}

interface ExerciseAccordionProps {
  exercise: Exercise;
  index: number;
}

type TabType = 'video' | 'instructions' | 'tips';

// Placeholder video thumbnail
function VideoPlaceholder() {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-linear-to-br from-zinc-800 to-zinc-900">
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
          <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <p className="text-sm text-zinc-400">Demo video coming soon</p>
      </div>
      {/* Placeholder image pattern */}
      <div className="absolute inset-0 opacity-20">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" className="text-zinc-600" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
    </div>
  );
}

export default function ExerciseAccordion({ exercise, index }: ExerciseAccordionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('video');

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveTab('video');
    setIsExpanded(true);
  };

  const tabs: { key: TabType; label: string }[] = [
    { key: 'video', label: 'Video' },
    { key: 'instructions', label: 'Instructions' },
    { key: 'tips', label: 'Tips' },
  ];

  // Get exercise-specific placeholder content
  const getInstructions = () => {
    const instructions: Record<ExerciseType, string[]> = {
      strength: [
        "Set up your equipment and ensure proper form before starting.",
        "Control the weight through the full range of motion.",
        "Breathe out during the exertion phase, breathe in during the eccentric phase.",
        "Rest for the prescribed time between sets.",
      ],
      conditioning: [
        "Warm up properly before starting.",
        "Maintain consistent pace throughout.",
        "Focus on your breathing rhythm.",
        "Monitor your heart rate if possible.",
      ],
      warmup: [
        "Perform movements slowly and with control.",
        "Focus on gradually increasing range of motion.",
        "Don't bounce or force the stretch.",
        "Hold each position as prescribed.",
      ],
      abs: [
        "Engage your core throughout the movement.",
        "Keep your lower back pressed to the floor when applicable.",
        "Avoid pulling on your neck during crunching movements.",
        "Focus on slow, controlled movements.",
      ],
      cooldown: [
        "Breathe deeply and relax into each stretch.",
        "Hold each stretch for at least 20-30 seconds.",
        "Never bounce during static stretches.",
        "Focus on the muscles you worked during the session.",
      ],
    };
    return instructions[exercise.type] || instructions.strength;
  };

  const getTips = () => {
    const tips: Record<ExerciseType, string[]> = {
      strength: [
        "Start with a weight you can control for all reps.",
        "Focus on mind-muscle connection.",
        "If form breaks down, reduce the weight.",
        "Track your weights to ensure progressive overload.",
      ],
      conditioning: [
        "Stay hydrated throughout.",
        "Adjust intensity based on how you feel.",
        "Use a timer or app to track intervals.",
        "Focus on quality of movement over speed.",
      ],
      warmup: [
        "Never skip the warmup - it prevents injuries.",
        "Increase intensity gradually.",
        "Include both dynamic and mobility movements.",
        "Pay extra attention to areas that feel tight.",
      ],
      abs: [
        "Quality over quantity - fewer controlled reps are better.",
        "Train abs 2-3 times per week for best results.",
        "Include anti-rotation and anti-extension exercises.",
        "Progression comes from harder variations, not just more reps.",
      ],
      cooldown: [
        "Don't rush through your cooldown.",
        "This is a great time to work on flexibility goals.",
        "Consider foam rolling for additional recovery.",
        "Light stretching helps reduce next-day soreness.",
      ],
    };
    return tips[exercise.type] || tips.strength;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group relative overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-100 transition-all hover:shadow-md dark:bg-zinc-900 dark:ring-zinc-800"
    >
      {/* Main row - clickable header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-4 text-left transition-colors sm:px-5 sm:py-5"
      >
        <div className="flex items-center gap-4">
          {/* Exercise number */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white sm:h-10 sm:w-10">
            {index + 1}
          </div>

          {/* Exercise info */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-zinc-900 dark:text-white">
              {exercise.name}
            </h3>

            {exercise.type === "conditioning" ? (
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {exercise.details}
              </p>
            ) : (
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {exercise.sets && <span>{exercise.sets} sets</span>}
                {exercise.sets && exercise.reps && <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">•</span>}
                {exercise.reps && <span>{exercise.reps}</span>}
                {exercise.rest && (
                  <>
                    <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">•</span>
                    <span className="text-green-600 dark:text-green-400">{exercise.rest}</span>
                  </>
                )}
              </p>
            )}
          </div>

          {/* Video button */}
          <button
            onClick={handleVideoClick}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-all hover:bg-green-100 hover:text-green-600 dark:bg-zinc-800 dark:text-zinc-500 dark:hover:bg-green-900/30 dark:hover:text-green-400"
            title="Watch demo video"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>

          {/* Expand/collapse indicator */}
          <motion.svg
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </motion.svg>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-200 dark:border-zinc-700">
              {/* Tabs */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-700">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                      activeTab === tab.key
                        ? "border-b-2 border-green-500 text-green-600 dark:text-green-400"
                        : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-4 sm:p-5">
                <AnimatePresence mode="wait">
                  {activeTab === 'video' && (
                    <motion.div
                      key="video"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                    >
                      <VideoPlaceholder />
                    </motion.div>
                  )}

                  {activeTab === 'instructions' && (
                    <motion.div
                      key="instructions"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      <h4 className="font-semibold text-zinc-900 dark:text-white">
                        How to perform {exercise.name}
                      </h4>
                      <ol className="space-y-2">
                        {getInstructions().map((instruction, i) => (
                          <li key={i} className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              {i + 1}
                            </span>
                            {instruction}
                          </li>
                        ))}
                      </ol>
                    </motion.div>
                  )}

                  {activeTab === 'tips' && (
                    <motion.div
                      key="tips"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-3"
                    >
                      <h4 className="font-semibold text-zinc-900 dark:text-white">
                        Pro Tips
                      </h4>
                      <ul className="space-y-2">
                        {getTips().map((tip, i) => (
                          <li key={i} className="flex gap-3 text-sm text-zinc-600 dark:text-zinc-400">
                            <span className="mt-0.5 text-green-500">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                              </svg>
                            </span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
