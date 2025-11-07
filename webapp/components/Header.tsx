import Image from "next/image";
import Link from "next/link";

export default function Header() {
  return (
    <div className="flex w-full items-center justify-between">
      <div className="flex items-center gap-4">
        <Image 
          src="/jon.jpg" 
          alt="Jon Don" 
          width={72} 
          height={72} 
          className="rounded-full object-cover" 
        />
        <div>
          <h1 className="text-2xl font-bold">Jon Don Fit</h1>
          <p className="text-sm text-zinc-600">
            No-nonsense, results-oriented coaching. Transformations only.
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <Link href="/login" className="rounded-full border px-4 py-2">
          Log in
        </Link>
        <Link href="/register" className="rounded-full bg-foreground px-4 py-2 text-background">
          Book a Call
        </Link>
      </div>
    </div>
  );
}
