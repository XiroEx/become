import Image from "next/image";
import Link from "next/link";

interface HeaderProps {
  showActions?: boolean;
  backButton?: boolean;
  backUrl?: string;
}

const appName = process.env.NEXT_PUBLIC_APP_NAME || "Jon Don Fit";
const appTagline = process.env.NEXT_PUBLIC_APP_TAGLINE || "No-nonsense, results-oriented coaching. Transformations only.";
const profileImage = process.env.NEXT_PUBLIC_PROFILE_IMAGE || "/jon.jpg";

export default function Header({ 
  showActions = true, 
  backButton = false, 
  backUrl = "/" 
}: HeaderProps) {
  return (
    <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 sm:gap-4">
        {backButton ? (
          <Link 
            href={backUrl}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-zinc-300 transition-colors hover:bg-zinc-100 sm:h-[72px] sm:w-[72px]"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        ) : (
          <Image 
            src={profileImage}
            alt={appName}
            width={56} 
            height={56} 
            className="rounded-full object-cover sm:w-[72px] sm:h-[72px]" 
          />
        )}
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{appName}</h1>
          <p className="text-xs text-zinc-600 sm:text-sm">
            {appTagline}
          </p>
        </div>
      </div>
      {showActions && (
        <div className="flex gap-2 sm:gap-3">
          <Link href="/login" className="flex-1 rounded-full border px-4 py-2 text-center text-sm sm:flex-none sm:text-base">
            Log in
          </Link>
          <Link href="/register" className="flex-1 rounded-full bg-foreground px-4 py-2 text-center text-sm text-background sm:flex-none sm:text-base">
            Book a Call
          </Link>
        </div>
      )}
    </div>
  );
}
