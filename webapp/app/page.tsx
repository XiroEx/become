"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Jon Don Fit";
const profileImage = process.env.NEXT_PUBLIC_PROFILE_IMAGE || "/profile.jpg";

const PHRASES = [
  "Stronger",
  "Unstoppable",
  "Disciplined",
  "Your Best",
  "Relentless",
];

export default function Splash() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % PHRASES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black p-6 text-white overflow-hidden">
      <PageTransition className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <motion.div 
          className="relative h-32 w-32 overflow-hidden rounded-full border-4 border-zinc-800 shadow-2xl"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
           <Image 
            src={profileImage}
            alt={appName}
            fill
            className="object-cover"
            priority
          />
        </motion.div>
        
        <div className="flex flex-col items-center justify-center w-full">
          <h1 className="text-3xl font-bold tracking-tight">{appName}</h1>
          <div className="relative h-8 w-full mt-4">
            <AnimatePresence mode="wait">
              <motion.p
                key={index}
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -50, opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="absolute inset-0 w-full text-zinc-400 font-medium"
              >
                {PHRASES[index]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <Link 
            href="/login"  
            className="w-full"
          >
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center rounded-full bg-white px-6 py-3.5 font-semibold text-black"
            >
              Log In
            </motion.div>
          </Link>
          <Link 
            href="/register" 
            className="w-full"
          >
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex w-full items-center justify-center rounded-full bg-zinc-800 px-6 py-3.5 font-semibold text-white hover:bg-zinc-700"
            >
              Get Started
            </motion.div>
          </Link>
        </div>

        <Link href="/information" className="mt-4 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          More Information
        </Link>
      </PageTransition>
    </div>
  );
}
