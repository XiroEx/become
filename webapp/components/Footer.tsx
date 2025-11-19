const appName = process.env.NEXT_PUBLIC_APP_NAME || "Jon Don Fit";

export default function Footer() {
  return (
    <footer className="mt-12 w-full text-center text-sm text-zinc-500">
      © {new Date().getFullYear()} {appName} — Built by <a href="https://redbtn.io" target="_blank" rel="noopener noreferrer" className="font-semibold text-red-500">redbtn</a> — Built for results.
    </footer>
  );
}
